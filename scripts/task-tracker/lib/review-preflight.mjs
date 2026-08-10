import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findTrailComment } from '../commit-trail-handler.mjs';
import { parseMarker, TRAIL_HEADING } from './commit-trail.mjs';
import { auditEvidenceMarkers } from './evidence-markers.mjs';
import { auditEvidenceBranchReachability } from './evidence-branch-reachability.mjs';
import { NON_DEMONSTRABLE_TAG_RE } from './body-invariants.mjs';
import { isNoCommitKind, isAcWaived, hasDeliverableMarker } from './issue-kind.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from './process-timeouts.mjs';
import { hasAttributingCommit as defaultHasAttributingCommit } from './commit-attribution.mjs';
import { fetchEpicChildren as defaultFetchEpicChildren } from './epic-children-gate.mjs';
import {
  buildEpicDerivedTrail,
  epicTrailLogArgs,
  parseEpicTrailLog,
} from './epic-derived-commit-trail.mjs';
import { parseAcCommitCitation, verifyAcCommitCitations } from './epic-ac-commit-citation.mjs';
import { parseIssueKind } from './issue-kind.mjs';
import { locateAuthoritySource } from './github-records/authority-locator.mjs';
import {
  hasAcceptedTestEvidence,
  resolveLifecycleGateEvidence,
} from './github-records/lifecycle-gate-source.mjs';
import { gql } from '../../gh/lib/github-projects.mjs';

const pexec = promisify(execFile);

function defaultLifecycleGraphql({ query, variables }) {
  return gql(query, variables).then((data) => ({ data }));
}

async function defaultGitStatus({ projectDir }) {
  const { stdout } = await pexec('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: projectDir,
    timeout: GIT_TIMEOUT_MS,
  });
  return stdout;
}

async function defaultGitHeadSha({ projectDir }) {
  const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], {
    cwd: projectDir,
    timeout: GIT_TIMEOUT_MS,
  });
  return stdout.trim();
}

async function defaultGetIssueBody({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return stdout || '';
}

// The epic HEAD is the branch under review, i.e. this worktree's HEAD. Scoped
// to HEAD and never `--all` — see the reachability note in
// epic-derived-commit-trail.mjs.
async function defaultEpicCommits({ projectDir }) {
  const { stdout } = await pexec('git', epicTrailLogArgs('HEAD'), {
    cwd: projectDir,
    timeout: GIT_TIMEOUT_MS,
  });
  return parseEpicTrailLog(stdout);
}

export async function runReviewPreflight({ issueNumber, repo, projectDir, cfg, deps = {} } = {}) {
  if (!issueNumber) throw new Error('review-preflight: issueNumber is required');
  if (!repo) throw new Error('review-preflight: repo is required');
  if (!projectDir) throw new Error('review-preflight: projectDir is required');

  const gitStatus = deps.gitStatus || (() => defaultGitStatus({ projectDir }));
  const gitHeadSha = deps.gitHeadSha || (() => defaultGitHeadSha({ projectDir }));
  const find = deps.findTrailComment || findTrailComment;
  // #733 — attribution is MESSAGE-based (`[#N]` token search), not SHA
  // reachability. `deps.gitIsAncestor` is retired from the gating path; a
  // deliverable on an unmerged branch or a rebased/squashed SHA is now accepted
  // as long as a `[#N]`-attributed commit exists somewhere across `--all`.
  const hasAttribution = deps.hasAttributingCommit || defaultHasAttributingCommit;
  const getIssueBody = deps.getIssueBody || (() => defaultGetIssueBody({ issueNumber, repo }));
  const fetchChildren =
    deps.fetchEpicChildren ||
    (() => defaultFetchEpicChildren({ cfg: cfg || { repo }, parentEpicNumber: issueNumber }));
  const epicCommits = deps.epicCommits || (() => defaultEpicCommits({ projectDir }));

  const reasons = [];
  const status = String(await gitStatus()).trim();
  if (status) {
    reasons.push('tracked worktree changes are uncommitted');
  }

  const headSha = String(await gitHeadSha()).trim();

  // #885 — the body is fetched BEFORE the trail block (it used to be read after)
  // because the trail requirement branches on kind. An epic has no commit of its
  // own by construction, so demanding a direct `### 🔗 Commits` comment refused
  // every epic no matter how complete its children were. The fix is a BRANCH,
  // not a skip: an epic's trail is DERIVED from its children (#884), so the
  // evidence its children produced is consumed rather than discarded.
  //
  // #970 — `isEpic` alone under-covers `NO_COMMIT_KINDS` (epic, audit, research,
  // spike). The other three kinds have no children to derive a trail from either,
  // but they DO carry a deliverable marker (their deliverable is a posted
  // comment/analysis, not a commit) — mirrors `code-complete-gate.mjs`'s
  // `isNoCommitKind(body)` → `hasDeliverableMarker(body)` check.
  const body = String(await getIssueBody());
  const reachabilityAudit = deps.evidenceBranchReachability || auditEvidenceBranchReachability;
  const reachability = await reachabilityAudit({ body, issueNumber, projectDir });
  reasons.push(...reachability.reasons);
  let lifecycleEvidence = null;
  let authoritySource = null;
  try {
    authoritySource = locateAuthoritySource({ issueBody: body });
  } catch (error) {
    reasons.push(`review-preflight-lifecycle-source-failed: ${error.message}`);
  }
  if (authoritySource?.kind === 'github-records/v1') {
    const resolveLifecycleEvidence = deps.resolveLifecycleEvidence || resolveLifecycleGateEvidence;
    try {
      lifecycleEvidence = await resolveLifecycleEvidence({
        repository: repo,
        issue: Number(String(issueNumber).replace(/^#/, '')),
        issueBody: body,
        expectedSha: headSha,
        graphql: deps.graphql || defaultLifecycleGraphql,
        readContractRecord: deps.readContractRecord,
        deps: deps.listIssueRecords ? { listIssueRecords: deps.listIssueRecords } : undefined,
      });
      if (!hasAcceptedTestEvidence(lifecycleEvidence)) {
        reasons.push('review-preflight-lifecycle-source-failed: directory-test-evidence-missing');
      }
    } catch (error) {
      reasons.push(`review-preflight-lifecycle-source-failed: ${error.message}`);
    }
  }
  const isEpic = parseIssueKind(body) === 'epic';
  const noCommitKindForTrail = isNoCommitKind(body);

  let derivedTrail = null;
  if (isEpic) {
    const epicNumber = Number(String(issueNumber).replace(/^#/, ''));
    // Fetched once and shared: the derived trail and the #886 AC-citation check
    // ask different questions of the same two inputs. Both fetches stay INSIDE
    // the try — a failure to reach the children or the log is a preflight
    // refusal reason, never an exception out of `runReviewPreflight`.
    try {
      const children = await fetchChildren();
      const commits = await epicCommits();

      // #886 — an epic AC may be satisfied by citing the child commits that
      // delivered it. Every cited sha must resolve against the epic HEAD and be
      // attributable to a child of this epic; each refusal names its citation.
      reasons.push(...verifyAcCommitCitations({ epicNumber, children, commits, body }));

      derivedTrail = buildEpicDerivedTrail({ epicNumber, children, commits });
    } catch (err) {
      // `UnreachableChildrenError` already names EVERY unreachable child, so
      // surface its message verbatim rather than re-deriving the check here.
      reasons.push(err.message);
    }
  } else if (noCommitKindForTrail) {
    if (!hasDeliverableMarker(body)) {
      reasons.push(
        `no-commit-kind issue is missing an \`aitm-deliverable-posted\` marker recording its deliverable`
      );
    }
  } else {
    await checkDirectTrail();
  }

  async function checkDirectTrail() {
    const comment = await find(String(issueNumber), repo);
    const trailBody = comment?.body ? String(comment.body) : '';
    if (!trailBody) {
      reasons.push(
        `missing canonical \`### 🔗 Commits\` comment recording this issue's commit trail`
      );
    } else if (!trailBody.startsWith(TRAIL_HEADING)) {
      reasons.push(
        `canonical \`### 🔗 Commits\` comment is malformed (does not start with \`${TRAIL_HEADING}\` heading)`
      );
    } else {
      const trailShas = [...parseMarker(trailBody).shas];
      if (trailShas.length === 0) {
        reasons.push(`canonical \`### 🔗 Commits\` comment records no commits`);
      } else {
        // #733 — the trail records ≥1 commit, so assert MESSAGE-based attribution
        // exists rather than SHA reachability. A `[#N]`-attributed commit found
        // anywhere across `--all` (unmerged branch, rebased/squashed history) is
        // accepted; only the absence of ANY such commit is a failure.
        let attributed;
        try {
          attributed = await hasAttribution(issueNumber, { cwd: projectDir });
        } catch (err) {
          reasons.push(
            `commit-attribution lookup failed while verifying \`[#${String(issueNumber).replace(/^#/, '')}]\` message attribution: ${err.message}`
          );
          attributed = true; // do not double-report as a missing-attribution reason
        }
        if (attributed === false) {
          reasons.push(
            `canonical \`### 🔗 Commits\` comment records commits, but no commit message references \`[#${String(issueNumber).replace(/^#/, '')}]\` — attribution is message-based (#727); prefix a commit subject with \`[#${String(issueNumber).replace(/^#/, '')}] \``
          );
        }
      }
    }
  }

  if (body.trim() && authoritySource?.kind !== 'github-records/v1') {
    // #836 — resolve the no-commit-kind classification once so the waiver skip
    // below mirrors the sibling Develop→Test gate exactly.
    const noCommitKind = isNoCommitKind(body);
    const audit = auditEvidenceMarkers(body);
    for (const item of audit.missingEvidence) {
      // #537 — honor the same honest `<!-- aitm-non-demonstrable -->` opt-out
      // marker the Refine→Plan gate honors (`findAcsWithoutVerifierOrInvalidTag`
      // in body-invariants.mjs). Single source of truth: both gates key off
      // `NON_DEMONSTRABLE_TAG_RE`, so an AC accepted as honestly non-demonstrable
      // at refine cannot be rejected at review-exit — removing the only remaining
      // pressure to fabricate a verifier just to cross the gate.
      if (NON_DEMONSTRABLE_TAG_RE.test(item.label)) continue;
      // #836 — honor the epic no-commit-lane waiver (`aitm-ac-waived`) exactly as
      // the sibling Develop→Test gate does (`code-complete-gate.mjs:295`:
      // `if (!(audit && isAcWaived(ac.label)))` with `audit = isNoCommitKind(body)`).
      // Without this, a waived rollup AC that legally clears Develop→Test is
      // wrongly rejected at Test→Review, forcing a preflight bypass (paper-over)
      // or a fabricated `cmd=` citation (dishonest).
      if (noCommitKind && isAcWaived(item.label)) continue;
      // #886 — same reasoning as #537 one branch up: an AC the Refine→Plan gate
      // accepted on a commit citation must not be rejected at review-exit for
      // lacking a `cmd`. The citation IS the declaration; its shas are verified
      // above by `verifyAcCommitCitations`, which is strictly stronger than the
      // presence check this loop performs.
      if (parseAcCommitCitation(item.label)) continue;
      reasons.push(
        `acceptance criterion "${item.label}" is missing \`aitm-verified cmd="..."\` evidence declaration`
      );
    }
    for (const cmd of audit.missingVerificationCommands) {
      reasons.push(`evidence command missing from Verification Commands: ${cmd}`);
    }
  }

  return { ok: reasons.length === 0, reasons, headSha, derivedTrail, lifecycleEvidence };
}
