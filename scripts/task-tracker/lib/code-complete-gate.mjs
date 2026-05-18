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

const pexec = promisify(execFile);

const AC_HEADING_RE = /^##\s+Acceptance Criteria\s*$/im;
const NEXT_HEADING_RE = /^##\s+/m;
const CHECKBOX_RE = /^- \[([ x])\] (.+)$/gm;
const VERIFIED_BY_RE = /<!--\s*aitm-verified-by:\s*(.+?)\s*-->/;
const COMMITS_MARKER_RE = /<!--\s*aitm-commits:\s*([^-]*?)\s*-->/;
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
    const vm = label.match(VERIFIED_BY_RE);
    items.push({ label, checked, verifiedBy: vm ? vm[1].trim() : null });
  }
  return items;
}

export function parseCommitShas(commentBody) {
  const src = String(commentBody || '');
  const m = src.match(COMMITS_MARKER_RE);
  if (!m) return [];
  return m[1]
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

  const matched = trailShas.some((s) => headSha.startsWith(s) || s.startsWith(headSha));
  if (!matched) {
    const shortHead = headSha.slice(0, 6);
    return {
      ok: false,
      blocker: `develop-to-test-stale-trail: HEAD \`${shortHead}\` not in commit-trail (marker has ${trailShas.length} SHA(s)) — run \`/task commit-trace\` to record the latest commit`,
      headSha,
      trailShas,
    };
  }
  return { ok: true, headSha, trailShas };
}

export async function gateCodeComplete({ cfg, issueNumber, body, deps = {} } = {}) {
  if (!cfg) throw new Error('gateCodeComplete: cfg is required');
  if (!issueNumber) throw new Error('gateCodeComplete: issueNumber is required');

  const listComments = deps.listComments || defaultListComments;
  const filesForSha = deps.filesForSha || defaultFilesForSha;
  const dirtyFiles = deps.dirtyFiles || defaultDirtyFiles;

  const blockers = [];

  const acs = parseAcceptanceCriteria(body);
  if (acs === null) {
    blockers.push(
      'code-complete-no-ac-section: `## Acceptance Criteria` section not found in body'
    );
  } else {
    for (const ac of acs) {
      const shortLabel = ac.label.replace(VERIFIED_BY_RE, '').trim();
      if (!ac.checked) {
        blockers.push(`code-complete-ac-unticked: ${shortLabel}`);
      } else if (!ac.verifiedBy || ac.verifiedBy === 'TBD') {
        blockers.push(`code-complete-ac-unverified: ${shortLabel}`);
      }
    }
  }

  let shas = [];
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
