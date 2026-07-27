// Develop → Test CODE_COMPLETE gate (#136).
//
// Refuses the develop→test transition unless:
//   1. Every functional AC under `## Acceptance Criteria` is `- [x]` AND
//      carries an `<!-- aitm-verified-by: ... -->` evidence marker.
//   2. The `aitm-commits` marker exists with at least one SHA (lives in the
//      "### 🔗 Commits" comment-trail, not the issue body).
//   3. No file in the union of SHAs' touch-set is currently tracked-modified
//      (`git status --porcelain` excluding `??` untracked).
//
// Lifecycle DoD items (under `## Definition of Done` or `### Lifecycle ...`)
// are intentionally NOT inspected — they tick at Review/Close.
//
// Pure-ish: all I/O (git, comment fetch) is injectable via deps.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveVerifiedBy, stripProofMarkers } from './proof-marker.mjs';
import { unescapeValue } from './marker-grammar.mjs';
import {
  isNoCommitKind,
  hasDeliverableMarker,
  isAcWaived,
  parseIssueKind,
  hasEpicAcReconciledMarker,
} from './issue-kind.mjs';
import { NON_DEMONSTRABLE_TAG_RE } from './body-invariants.mjs';
import { attributingCommits as defaultAttributingCommits } from './commit-attribution.mjs';

const pexec = promisify(execFile);

const AC_HEADING_RE = /^##\s+Acceptance Criteria\s*$/im;
const NEXT_HEADING_RE = /^##\s+/m;
const CHECKBOX_RE = /^- \[([ x])\] (.+)$/gm;
// Dual-grammar (#381): new quoted-attribute form preferred, legacy colon CSV
// tolerated until the #369 corpus sweep. `COMMITS_MARKER_RE` is the union used
// for presence detection.
const COMMITS_MARKER_LEGACY_RE = /<!--\s*aitm-commits:\s*([^-]*?)\s*-->/;
const COMMITS_MARKER_NEW_RE = /<!--\s*aitm-commits\s+shas="((?:[^"]|&quot;)*)"\s*-->/;
const COMMITS_MARKER_RE = /<!--\s*aitm-commits(?::\s*[^-]*?|\s+shas="(?:[^"]|&quot;)*")\s*-->/;
const TRAIL_HEADING_RE = /^###\s+🔗\s+Commits\s*$/m;

export function parseAcceptanceCriteria(body) {
  const src = String(body || '');
  const m = src.match(AC_HEADING_RE);
  if (!m) return null;
  const after = src.slice(m.index + m[0].length);
  const nextMatch = after.match(NEXT_HEADING_RE);
  const section = nextMatch ? after.slice(0, nextMatch.index) : after;
  const items = [];
  for (const cm of section.matchAll(CHECKBOX_RE)) {
    const checked = cm[1] === 'x';
    const label = cm[2];
    const verifiedBy = resolveVerifiedBy(label);
    items.push({ label, checked, verifiedBy: verifiedBy ? verifiedBy.trim() : null });
  }
  return items;
}

export function parseCommitShas(commentBody) {
  const src = String(commentBody || '');
  const neu = src.match(COMMITS_MARKER_NEW_RE);
  const csv = neu ? unescapeValue(neu[1]) : (src.match(COMMITS_MARKER_LEGACY_RE)?.[1] ?? null);
  if (csv == null) return [];
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function findCommitTrailComment(comments) {
  if (!Array.isArray(comments)) return null;
  return (
    comments.find(
      (c) =>
        TRAIL_HEADING_RE.test(String(c.body || '')) && COMMITS_MARKER_RE.test(String(c.body || ''))
    ) || null
  );
}

async function defaultListComments({ cfg, issueNumber }) {
  const { stdout } = await pexec(
    'gh',
    [
      'issue',
      'view',
      String(issueNumber),
      '-R',
      cfg.repo,
      '--json',
      'comments',
      '--jq',
      '.comments',
    ],
    { timeout: 15000 }
  );
  return JSON.parse(stdout || '[]');
}

async function defaultFilesForSha(sha) {
  const { stdout } = await pexec('git', ['show', '--name-only', '--pretty=format:', sha], {
    timeout: 15000,
  });
  return String(stdout || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function defaultDirtyFiles() {
  const { stdout } = await pexec('git', ['status', '--porcelain'], { timeout: 15000 });
  const dirty = new Set();
  for (const line of String(stdout || '').split('\n')) {
    if (!line) continue;
    if (line.startsWith('??')) continue; // untracked — not a tracked-modified file
    const file = line.slice(3).trim();
    if (file) dirty.add(file);
  }
  return dirty;
}

// #155 — Develop→Test commit-trail-contains-HEAD gate.
//
// Refuses the develop→test transition unless the `### 🔗 Commits` comment
// records the current outer-HEAD SHA in its `aitm-commits` marker. Without
// this gate, code that lives only as a working-tree change (uncommitted) or
// as a commit that landed *after* the last `/task commit-trace` run can slip
// through to Test, where the sandbox verifies a different tree than the one
// recorded on the issue's audit trail.
//
// Returns `{ ok, blocker, headSha, trailShas }`. Marker is canonical-truth
// (full SHA); we compare prefix-either-direction so 6-char short forms in
// callers still match a full SHA in the marker.
export async function gateCommitTrailContainsHead({
  cfg,
  issueNumber,
  projectDir,
  deps = {},
} = {}) {
  if (!cfg) throw new Error('gateCommitTrailContainsHead: cfg is required');
  if (!issueNumber) throw new Error('gateCommitTrailContainsHead: issueNumber is required');
  const listComments = deps.listComments || defaultListComments;
  const getHeadSha =
    deps.getHeadSha ||
    (async () => {
      const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], {
        cwd: projectDir,
        timeout: 10_000,
      });
      return String(stdout || '').trim();
    });

  let headSha = null;
  try {
    headSha = await getHeadSha();
  } catch (err) {
    return {
      ok: false,
      blocker: `develop-to-test-head-resolve-failed: ${err.message}`,
      headSha: null,
      trailShas: [],
    };
  }
  if (!headSha) {
    return {
      ok: false,
      blocker: 'develop-to-test-head-empty: `git rev-parse HEAD` returned empty',
      headSha: null,
      trailShas: [],
    };
  }

  let trailShas = [];
  try {
    const comments = await listComments({ cfg, issueNumber });
    const trail = findCommitTrailComment(comments);
    if (!trail) {
      return {
        ok: false,
        blocker:
          'develop-to-test-no-trail: no `### 🔗 Commits` comment found — run `/task commit-trace` first',
        headSha,
        trailShas: [],
      };
    }
    trailShas = parseCommitShas(trail.body);
  } catch (err) {
    return {
      ok: false,
      blocker: `develop-to-test-trail-fetch-failed: ${err.message}`,
      headSha,
      trailShas: [],
    };
  }

  if (trailShas.length === 0) {
    return {
      ok: false,
      blocker:
        'develop-to-test-empty-trail: `### 🔗 Commits` comment has no SHAs — run `/task commit-trace`',
      headSha,
      trailShas,
    };
  }

  const inTrail = (sha) => trailShas.some((s) => sha.startsWith(s) || s.startsWith(sha));

  const matched = inTrail(headSha);
  if (matched) {
    return { ok: true, headSha, trailShas };
  }

  // #834 — HEAD is not literally in the trail. On a shared trunk this is the
  // norm, not a defect: a *sibling* issue's commit (or an unattributed commit)
  // can become HEAD while THIS issue added no new commit in its resumed Develop
  // visit. Exact-SHA membership mis-fires there — the tree the sandbox verifies
  // still contains every commit this issue shipped, all recorded in the trail.
  //
  // Message-based attribution (per #727/#733): the move is acceptable IFF every
  // commit reachable from HEAD that bears THIS issue's `[#N]` token is already
  // recorded in the trail. If any `[#N]`-attributed commit reachable from HEAD
  // is MISSING from the trail, the developer forgot `/task commit-trace` after a
  // new commit — keep blocking with the existing `stale-trail` message. This
  // preserves the gate's guarantee (the trail records all of the issue's shipped
  // work) without punishing a shared-trunk resume that added nothing of its own.
  const attributingCommits = deps.attributingCommits || defaultAttributingCommits;
  let ownCommits = [];
  try {
    // Scope the walk to HEAD's ancestry (`refs: ['HEAD']`) so every returned
    // commit is reachable from HEAD by construction — no separate reachability
    // probe needed.
    ownCommits = await attributingCommits(issueNumber, {
      cwd: projectDir,
      refs: ['HEAD'],
    });
  } catch (err) {
    return {
      ok: false,
      blocker: `develop-to-test-attribution-failed: ${err.message}`,
      headSha,
      trailShas,
    };
  }

  const missing = ownCommits.filter((c) => c && c.sha && !inTrail(c.sha));
  if (missing.length > 0) {
    const shortHead = headSha.slice(0, 6);
    const shortMissing = missing.map((c) => c.sha.slice(0, 6)).join(', ');
    return {
      ok: false,
      blocker: `develop-to-test-stale-trail: HEAD \`${shortHead}\` not in commit-trail (marker has ${trailShas.length} SHA(s)); ${missing.length} attributed commit(s) not recorded (${shortMissing}) — run \`/task commit-trace\` to record the latest commit`,
      headSha,
      trailShas,
    };
  }

  // Only sibling/unattributed commits advanced HEAD past the trail tip; all of
  // this issue's shipped commits are recorded. Shared-trunk resume — allow.
  return { ok: true, headSha, trailShas };
}

export async function gateCodeComplete({ cfg, issueNumber, body, deps = {} } = {}) {
  if (!cfg) throw new Error('gateCodeComplete: cfg is required');
  if (!issueNumber) throw new Error('gateCodeComplete: issueNumber is required');

  const listComments = deps.listComments || defaultListComments;
  const filesForSha = deps.filesForSha || defaultFilesForSha;
  const dirtyFiles = deps.dirtyFiles || defaultDirtyFiles;

  const blockers = [];
  // #494, #500 — no-commit deliverable lane. A no-commit-kind issue
  // (`aitm-issue-kind kind=…`, one of audit/research/spike/epic) swaps the
  // commit-trail requirement for a deliverable-evidence marker and permits ACs
  // to be waived. Code-kind issues (the default) are unaffected: the branch
  // below only diverges when `audit` is true.
  const audit = isNoCommitKind(body);

  const acs = parseAcceptanceCriteria(body);
  if (acs === null) {
    blockers.push(
      'code-complete-no-ac-section: `## Acceptance Criteria` section not found in body'
    );
  } else {
    for (const ac of acs) {
      const shortLabel = stripProofMarkers(ac.label);
      if (!ac.checked) {
        blockers.push(`code-complete-ac-unticked: ${shortLabel}`);
      } else if (!ac.verifiedBy || ac.verifiedBy === 'TBD') {
        // Non-demonstrable opt-out (#532): an AC honestly marked
        // `<!-- aitm-non-demonstrable -->` (#523/#891) can never carry a
        // machine verifier by design. The Refine→Plan gate already `continue`s
        // past such lines
        // (`findAcsWithoutVerifierOrInvalidTag`); mirror that here so the two
        // gates share one definition of the opt-out. Done-ness is preserved —
        // the `!ac.checked` branch above still blocks an UNticked one.
        if (NON_DEMONSTRABLE_TAG_RE.test(ac.label)) {
          continue;
        }
        // Audit lane: an analytical AC may be audited-waived via a sanctioned
        // `aitm-ac-waived` marker in place of `aitm-verified-by`. Code-kind
        // issues never reach this branch — they still require evidence.
        if (!(audit && isAcWaived(ac.label))) {
          blockers.push(`code-complete-ac-unverified: ${shortLabel}`);
        }
      }
    }
  }

  let shas = [];
  if (audit) {
    // Deliverable-evidence gate: a posted deliverable (comment/document/
    // decision) recorded by an `aitm-deliverable-posted` marker stands in for
    // the `### 🔗 Commits` trail. No SHA/dirty inspection on the audit lane.
    if (!hasDeliverableMarker(body)) {
      blockers.push(
        'code-complete-deliverable-missing: audit-kind issue requires an `aitm-deliverable-posted` marker (the deliverable comment/document/decision) in place of a `### 🔗 Commits` trail'
      );
    }
    // #887 — AC reconciliation is a develop-exit event, not a continuous one
    // (epic #883, decision 1). An epic's ACs were written at decomposition time,
    // when its children were still proposals; by the time the last child lands
    // they describe intent rather than delivery. This is the single point at
    // which that drift is required to be resolved.
    //
    // Keyed on `parseIssueKind(body) === 'epic'` rather than the `audit` flag
    // above: `isNoCommitKind` also covers audit/research/spike, which have no
    // children to reconcile against. Same predicate `review-preflight.mjs` uses.
    //
    // What this can and cannot prove: it establishes that reconciliation was
    // CLAIMED, not that it was DONE. #889's AC<->child bijection check is what
    // makes the claim checkable. The two are a pair, not a redundancy.
    if (parseIssueKind(body) === 'epic' && !hasEpicAcReconciledMarker(body)) {
      blockers.push(
        `code-complete-epic-unreconciled: epic #${issueNumber} has not been AC-reconciled — re-read the epic's goals against what its children actually delivered, record the mapping in the epic body, then run \`/task epic-reconcile ${issueNumber}\`. Epic ACs are provisional from decomposition until the last child lands, so this is the single reconciliation point.`
      );
    }
    return { ok: blockers.length === 0, blockers, shas };
  }

  try {
    const comments = await listComments({ cfg, issueNumber });
    const trail = findCommitTrailComment(comments);
    if (!trail) {
      blockers.push(
        'code-complete-commits-missing: no `### 🔗 Commits` trail comment found — run `/task commit-trace`'
      );
    } else {
      shas = parseCommitShas(trail.body);
      if (shas.length === 0) {
        blockers.push(
          'code-complete-commits-empty: commit-trail comment has no SHAs in `aitm-commits` marker'
        );
      }
    }
  } catch (err) {
    blockers.push(`code-complete-comments-fetch-failed: ${err.message}`);
  }

  if (shas.length > 0) {
    const touchSet = new Set();
    for (const sha of shas) {
      try {
        const files = await filesForSha(sha);
        for (const f of files) touchSet.add(f);
      } catch {
        // best-effort; missing-sha could itself be reported but we skip
      }
    }
    let dirty;
    try {
      dirty = await dirtyFiles();
    } catch (err) {
      blockers.push(`code-complete-git-status-failed: ${err.message}`);
      dirty = new Set();
    }
    const dirtyInTouch = [...touchSet].filter((f) => dirty.has(f));
    if (dirtyInTouch.length) {
      blockers.push(
        `code-complete-dirty-files: commit some changes or stash them: ${dirtyInTouch.join(', ')}`
      );
    }
  }

  return { ok: blockers.length === 0, blockers, shas };
}
