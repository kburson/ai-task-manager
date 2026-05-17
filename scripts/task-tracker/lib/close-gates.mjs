// /task close pre-close gates (#138).
//
// Three orthogonal refusals enforced before close moves an issue to Done:
//
//   1. marker-missing       — `aitm-dod-verified` HTML marker absent
//   2. issue-dirty          — files touched by this issue's commits are still
//                             modified in the working tree (issue-scoped dirty)
//   3. chain-hole-at-<stage>— missing `aitm-entered-<stage>` marker
//
// `shaFreshGate` is still exported for the Test→Review boundary, but the
// Review→Done gate intentionally does NOT check SHA freshness: once a story
// reaches Review, later commits on trunk (from other stories) are unrelated
// to its verification, so the gate would only generate false positives.
// SHA freshness is a Test→Review concern, not a Review→Done concern.
//
// Each gate is a pure function (modulo injectable I/O). The aggregate
// `runCloseGates` returns `{ ok, blockers, dirtyCheckSkipped }`.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { DOD_VERIFIED_RE, parseDodVerifiedMarker } from './markers.mjs';
import { verifyChainIntegrity, STAGES } from './stage-entry-markers.mjs';
import { findCommitTrailComment, parseCommitShas } from './code-complete-gate.mjs';

const pexec = promisify(execFile);

const REQUIRED_CHAIN_STAGES = ['refine', 'plan', 'develop', 'test', 'review'];

export function markerPresentGate(body) {
  if (DOD_VERIFIED_RE.test(String(body || ''))) return { ok: true };
  return {
    ok: false,
    blocker:
      'close-marker-missing: `<!-- aitm-dod-verified -->` marker absent — run `/task test #<N>` to verify in sandbox first',
  };
}

export async function shaFreshGate(body, headSha, deps = {}) {
  const parsed = parseDodVerifiedMarker(body);
  if (!parsed) {
    return {
      ok: false,
      blocker:
        'close-sha-fresh-no-marker: cannot verify sha freshness — `aitm-dod-verified` marker absent',
    };
  }
  if (!headSha)
    return { ok: false, blocker: 'close-sha-fresh-no-head: HEAD SHA could not be resolved' };
  // Accept full-or-short match in either direction (marker stores 7-40 hex chars).
  const m = parsed.sha;
  if (headSha.startsWith(m) || m.startsWith(headSha)) return { ok: true };
  let extras = '';
  if (deps.commitsSince) {
    try {
      const list = await deps.commitsSince({ since: m, head: headSha });
      if (list && list.length) {
        extras = ` New commits: ${list.slice(0, 8).join(', ')}${list.length > 8 ? `, …(+${list.length - 8})` : ''}.`;
      }
    } catch {
      // best-effort
    }
  }
  return {
    ok: false,
    blocker: `close-sha-stale: marker SHA \`${m.slice(0, 8)}\` no longer matches HEAD \`${String(headSha).slice(0, 8)}\` — re-run \`/task test\`.${extras}`,
  };
}

export function chainIntegrityGate(body) {
  const result = verifyChainIntegrity(body, 'review');
  // Strict variant: require every REQUIRED_CHAIN_STAGES marker.
  const holes = [];
  for (const stage of REQUIRED_CHAIN_STAGES) {
    const re = new RegExp(`<!--\\s*aitm-entered-${stage}:\\s*[^>]*?-->`, 'i');
    if (!re.test(String(body || ''))) holes.push(stage);
  }
  if (holes.length === 0 && !result.outOfOrder) return { ok: true };
  const blockers = [];
  for (const h of holes) {
    blockers.push(
      `close-chain-hole-at-${h}: \`aitm-entered-${h}\` marker missing — stage skipped or marker stripped`
    );
  }
  if (result.outOfOrder) {
    blockers.push(
      `close-chain-out-of-order: stage-entry markers exist but timestamps are not monotonic`
    );
  }
  return { ok: false, blockers };
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

async function defaultFilesForSha(sha, { cwd } = {}) {
  const { stdout } = await pexec('git', ['show', '--name-only', '--pretty=format:', sha], {
    cwd,
    timeout: 15000,
  });
  return String(stdout || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function defaultDirtyFiles({ cwd } = {}) {
  const { stdout } = await pexec('git', ['status', '--porcelain'], { cwd, timeout: 15000 });
  const dirty = new Set();
  for (const line of String(stdout || '').split('\n')) {
    if (!line) continue;
    if (line.startsWith('??')) continue;
    if (line.startsWith('!!')) continue;
    const file = line.slice(3).trim();
    if (file) dirty.add(file);
  }
  return dirty;
}

// Issue-scoped dirty check. Returns:
//   { ok: true } — gate passes
//   { ok: true, skipped: 'no-commits-marker' } — graceful skip (no SHAs yet)
//   { ok: false, blocker: '...' } — refuse
export async function issueDirtyGate({ cfg, issueNumber, projectDir, deps = {} } = {}) {
  if (!cfg) throw new Error('issueDirtyGate: cfg is required');
  if (!issueNumber) throw new Error('issueDirtyGate: issueNumber is required');
  const listComments = deps.listComments || defaultListComments;
  const filesForSha = deps.filesForSha || ((sha) => defaultFilesForSha(sha, { cwd: projectDir }));
  const dirtyFiles = deps.dirtyFiles || (() => defaultDirtyFiles({ cwd: projectDir }));

  let shas = [];
  try {
    const comments = await listComments({ cfg, issueNumber });
    const trail = findCommitTrailComment(comments);
    if (!trail) return { ok: true, skipped: 'no-commits-marker' };
    shas = parseCommitShas(trail.body);
  } catch (err) {
    return { ok: false, blocker: `close-dirty-comments-fetch-failed: ${err.message}` };
  }
  if (shas.length === 0) return { ok: true, skipped: 'empty-commits-marker' };

  const touchSet = new Set();
  for (const sha of shas) {
    try {
      const files = await filesForSha(sha);
      for (const f of files) touchSet.add(f);
    } catch {
      // missing sha → skip (best-effort)
    }
  }
  let dirty;
  try {
    dirty = await dirtyFiles();
  } catch (err) {
    return { ok: false, blocker: `close-dirty-git-status-failed: ${err.message}` };
  }
  const overlap = [...touchSet].filter((f) => dirty.has(f));
  if (overlap.length === 0) return { ok: true };
  return {
    ok: false,
    blocker: `close-dirty-touched: commit or stash these files before closing: ${overlap.join(', ')}`,
  };
}

async function defaultGetHeadSha({ projectDir }) {
  const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], { cwd: projectDir, timeout: 10000 });
  return stdout.trim();
}

export async function runCloseGates({ cfg, issueNumber, body, projectDir, deps = {} } = {}) {
  const blockers = [];
  const m = markerPresentGate(body);
  if (!m.ok) blockers.push(m.blocker);

  // SHA freshness intentionally NOT checked here. Review→Done is independent
  // of HEAD movement on trunk from unrelated stories. See file header.
  const getHeadSha = deps.getHeadSha || defaultGetHeadSha;
  let headSha = null;
  try {
    headSha = await getHeadSha({ projectDir });
  } catch (err) {
    blockers.push(`close-head-resolve-failed: ${err.message}`);
  }

  const c = chainIntegrityGate(body);
  if (!c.ok) {
    if (c.blocker) blockers.push(c.blocker);
    if (c.blockers) blockers.push(...c.blockers);
  }

  let dirtyResult = null;
  try {
    dirtyResult = await issueDirtyGate({ cfg, issueNumber, projectDir, deps });
    if (!dirtyResult.ok) blockers.push(dirtyResult.blocker);
  } catch (err) {
    blockers.push(`close-dirty-gate-error: ${err.message}`);
  }

  return {
    ok: blockers.length === 0,
    blockers,
    dirtyCheckSkipped: dirtyResult?.skipped || null,
    headSha,
  };
}

export { REQUIRED_CHAIN_STAGES, STAGES };
