import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findTrailComment } from '../commit-trail-handler.mjs';
import { parseMarker, TRAIL_HEADING } from './commit-trail.mjs';
import { auditEvidenceMarkers } from './evidence-markers.mjs';
import { NON_DEMONSTRABLE_TAG_RE } from './body-invariants.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from './process-timeouts.mjs';
import { hasAttributingCommit as defaultHasAttributingCommit } from './commit-attribution.mjs';

const pexec = promisify(execFile);

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

export async function runReviewPreflight({ issueNumber, repo, projectDir, deps = {} } = {}) {
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

  const reasons = [];
  const status = String(await gitStatus()).trim();
  if (status) {
    reasons.push('tracked worktree changes are uncommitted');
  }

  const headSha = String(await gitHeadSha()).trim();
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

  const body = String(await getIssueBody());
  if (body.trim()) {
    const audit = auditEvidenceMarkers(body);
    for (const item of audit.missingEvidence) {
      // #537 — honor the same honest `invalid — non-demonstrable` opt-out the
      // Refine→Plan gate honors (`findAcsWithoutVerifierOrInvalidTag` in
      // body-invariants.mjs). Single source of truth: both gates key off
      // `NON_DEMONSTRABLE_TAG_RE`, so an AC accepted as honestly non-demonstrable
      // at refine cannot be rejected at review-exit — removing the only remaining
      // pressure to fabricate a verifier just to cross the gate.
      if (NON_DEMONSTRABLE_TAG_RE.test(item.label)) continue;
      reasons.push(
        `acceptance criterion "${item.label}" is missing \`aitm-verified cmd="..."\` evidence declaration`
      );
    }
    for (const cmd of audit.missingVerificationCommands) {
      reasons.push(`evidence command missing from Verification Commands: ${cmd}`);
    }
  }

  return { ok: reasons.length === 0, reasons, headSha };
}
