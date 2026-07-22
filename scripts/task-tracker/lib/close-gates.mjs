// /task close pre-close gates (#138).
//
// Three orthogonal refusals enforced before close moves an issue to Done:
//
//   1. marker-missing       — `aitm-dod-verified` HTML marker absent
//   2. issue-dirty          — files touched by this issue's commits are still
//                             modified in the working tree (issue-scoped dirty)
//   3. chain-hole-at-<stage>— missing `aitm-entered-<stage>` marker
//
// `shaFreshGate` is exported for SHA-freshness checks against the
// `aitm-dod-verified` marker. The Test→Review boundary owns its own
// drift detection (see #154 — `aitm-test-started` marker stamped by
// verbTest, checked by verbReview against current HEAD). The Review→Done
// gate intentionally does NOT check SHA freshness: once a story reaches
// Review, later commits on trunk (from other stories) are unrelated to
// its verification, so the gate would only generate false positives.
// SHA freshness is a Test→Review concern, not a Review→Done concern.
//
// Each gate is a pure function (modulo injectable I/O). The aggregate
// `runCloseGates` returns `{ ok, blockers, dirtyCheckSkipped }`.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { DOD_VERIFIED_RE, parseDodVerifiedMarker } from './markers.mjs';
import { verifyChainIntegrity, STAGES } from './stage-entry-markers.mjs';
import { findCommitTrailComment, parseCommitShas } from './code-complete-gate.mjs';
import { attributingCommits as defaultAttributingCommits } from './commit-attribution.mjs';
import { resolveTrunkRef as defaultResolveTrunkRef, fetchTrunk } from './trunk-ref.mjs';

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
  // Strict variant: require every REQUIRED_CHAIN_STAGES marker (any visit).
  const holes = [];
  for (const stage of REQUIRED_CHAIN_STAGES) {
    // Tolerate both legacy `: <iso>` and new `ts="<iso>"` entry-marker forms (#374).
    const re = new RegExp(
      `<!--\\s*aitm-entered-${stage}(?:-\\d+)?(?::\\s*[^>]*?|\\s+ts="[^"]*")\\s*-->`,
      'i'
    );
    if (!re.test(String(body || ''))) holes.push(stage);
  }
  const illegal = result.illegalArcs || [];
  if (holes.length === 0 && illegal.length === 0) return { ok: true };
  const blockers = [];
  for (const h of holes) {
    blockers.push(
      `close-chain-hole-at-${h}: \`aitm-entered-${h}\` marker missing — stage skipped or marker stripped`
    );
  }
  for (const arc of illegal) {
    blockers.push(
      `close-chain-illegal-arc: ${arc.from}->${arc.to} at ${arc.atTs} is not in LEGAL_TRANSITIONS`
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

// Trunk-integration gate (#B, message-based since #733).
//
// Refuses Review→Done unless a `[#N]`-attributed commit exists in the trunk
// ref's history. The #157 epic exposed the underlying gap: all five sub-issues
// were closed and stamped Done but their commits sat on a worktree branch that
// was never merged to trunk. Audit said "shipped"; trunk disagreed.
//
// #733 replaces the per-SHA `merge-base --is-ancestor` reachability loop with a
// TRUNK-SCOPED message-attribution check: `attributingCommits(N, {refs:[trunkRef]})`.
// A squash-merge rewrites the deliverable SHA (the trail's recorded SHA never
// lands on trunk) but carries the `[#N]` message token along, so SHA
// reachability deadlocked where message attribution correctly passes. The real
// invariant — "the work actually landed on trunk" — is preserved because the
// search is scoped to `trunkRef`, NOT `--all`: a never-merged feature branch's
// own commit does not satisfy it.
//
// Trunk ref resolution is delegated to the one shared `resolveTrunkRef`
// (#927, `lib/trunk-ref.mjs`): cfg.trunkRef → first existing `origin/<branch>`
// remote-tracking ref among `trunk`/`main`/`master` → local-branch fallback
// (no-remote case) → refusal. The gate `fetchTrunk`s first so the read is
// authoritative regardless of what any worktree has checked out — reading the
// remote-tracking ref is desync-proof where reading local `trunk` was not.
//
// Skip semantics match issueDirtyGate: no trail → skip, empty marker → skip.

export async function commitsOnTrunkGate({ cfg, issueNumber, projectDir, deps = {} } = {}) {
  if (!cfg) throw new Error('commitsOnTrunkGate: cfg is required');
  if (!issueNumber) throw new Error('commitsOnTrunkGate: issueNumber is required');
  const listComments = deps.listComments || defaultListComments;
  const resolveTrunkRef = deps.resolveTrunkRef || defaultResolveTrunkRef;
  const fetchTrunkRef = deps.fetchTrunk || fetchTrunk;
  // #733 — trunk-scoped MESSAGE attribution replaces per-SHA reachability.
  const attributing = deps.attributingCommits || defaultAttributingCommits;

  // The trail presence/empty skip semantics still key off the recorded trail:
  // no trail → nothing was ever committed for this issue → skip; empty marker →
  // skip. Only when the trail claims ≥1 commit do we assert the work is on trunk.
  let shas = [];
  try {
    const comments = await listComments({ cfg, issueNumber });
    const trail = findCommitTrailComment(comments);
    if (!trail) return { ok: true, skipped: 'no-commits-marker' };
    shas = parseCommitShas(trail.body);
  } catch (err) {
    return { ok: false, blocker: `close-trunk-comments-fetch-failed: ${err.message}` };
  }
  if (shas.length === 0) return { ok: true, skipped: 'empty-commits-marker' };

  // Fetch before read so the remote-tracking ref is authoritative — never
  // fatal (offline / no-remote falls through to the local ref).
  await fetchTrunkRef({ cfg, projectDir });
  const trunkRef = await resolveTrunkRef({ cfg, projectDir });
  if (!trunkRef) {
    return {
      ok: false,
      blocker:
        'close-trunk-ref-unresolved: no `trunkRef` configured and no `origin/{trunk,main,master}` remote-tracking ref nor local [trunk, main, master] branch exists — set `trunkRef` in `.ai-task-manager/task-tracker.json`',
    };
  }

  const id = String(issueNumber).replace(/^#/, '');
  let commits;
  try {
    commits = await attributing(issueNumber, { cwd: projectDir, refs: [trunkRef] });
  } catch (err) {
    return {
      ok: false,
      blocker: `close-trunk-attribution-failed: message-attribution lookup against ${trunkRef} failed: ${err.message}`,
      trunkRef,
    };
  }
  if (Array.isArray(commits) && commits.length > 0) return { ok: true, trunkRef };

  return {
    ok: false,
    blocker: `close-no-attributed-commit-on-trunk: no commit referencing [#${id}] found in ${trunkRef} — merge into ${trunkRef}`,
    trunkRef,
  };
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

  let trunkResult = null;
  try {
    trunkResult = await commitsOnTrunkGate({ cfg, issueNumber, projectDir, deps });
    if (!trunkResult.ok) blockers.push(trunkResult.blocker);
  } catch (err) {
    blockers.push(`close-trunk-gate-error: ${err.message}`);
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
    trunkCheckSkipped: trunkResult?.skipped || null,
    trunkRef: trunkResult?.trunkRef || null,
    headSha,
  };
}

export { REQUIRED_CHAIN_STAGES, STAGES };
