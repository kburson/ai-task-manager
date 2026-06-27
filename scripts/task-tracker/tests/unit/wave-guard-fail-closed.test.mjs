// @story #565
// Wave-model child↔parent state guards must FAIL CLOSED when the parent fetch or
// parent-state read THROWS (transient gh/GraphQL failure), and only fail open on a
// genuine no-parent (the fetch *returns* null). A thrown error leaves the parent's
// true state unknown; per docs/guides/fail-open-policy.md transition preconditions
// are fail-closed, so the guard must refuse the move rather than wave it through.
//
// Covers the three guards flagged by #562 audit defect D3:
//   - backlog-exit-child-parent-state-guard.mjs  (on-deck → refine)
//   - refine-exit-child-parent-state-guard.mjs   (refine → plan)
//   - child-cannot-lead-epic-exit-guard.mjs      (every forward transition)

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { backlogExitChildParentStateGuard } from '../../lib/backlog-exit-child-parent-state-guard.mjs';
import { refineExitChildParentStateGuard } from '../../lib/refine-exit-child-parent-state-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../../lib/child-cannot-lead-epic-exit-guard.mjs';

const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'lib');
const CFG = { repo: 'owner/repo', projectId: 'PVT_test' };
const throwFetch = () => {
  throw new Error('gh sub-issue query: transient API failure');
};
const throwStatus = () => {
  throw new Error('gh project status read: transient API failure');
};

// --- Guard 1: backlog-exit (on-deck → refine) ----------------------------------

test('#565 backlog-exit: fetchParentIssue throw → fail closed', async () => {
  const r = await backlogExitChildParentStateGuard.run({
    cfg: CFG,
    issueNumber: 900,
    fromState: 'on-deck',
    toState: 'refine',
    deps: { fetchParentIssue: throwFetch },
  });
  assert.equal(r.ok, false, 'a thrown parent fetch must refuse the transition');
  assert.match(r.reason, /parent state unverifiable/);
});

test('#565 backlog-exit: readParentStatus throw → fail closed', async () => {
  const r = await backlogExitChildParentStateGuard.run({
    cfg: CFG,
    issueNumber: 900,
    fromState: 'on-deck',
    toState: 'refine',
    deps: { fetchParentIssue: async () => 100, readParentStatus: throwStatus },
  });
  assert.equal(r.ok, false, 'a thrown status read must refuse the transition');
  assert.match(r.reason, /parent state unverifiable/);
});

test('#565 backlog-exit: genuine no-parent (fetch returns null) → ok:true', async () => {
  const r = await backlogExitChildParentStateGuard.run({
    cfg: CFG,
    issueNumber: 900,
    fromState: 'on-deck',
    toState: 'refine',
    deps: { fetchParentIssue: async () => null },
  });
  assert.equal(r.ok, true, 'a real leaf issue must still pass');
});

// --- Guard 2: refine-exit (refine → plan) --------------------------------------

test('#565 refine-exit: fetchParentIssue throw → fail closed', async () => {
  const r = await refineExitChildParentStateGuard.run({
    cfg: CFG,
    issueNumber: 901,
    fromState: 'refine',
    toState: 'plan',
    deps: { fetchParentIssue: throwFetch },
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /parent state unverifiable/);
});

test('#565 refine-exit: readParentStatus throw → fail closed', async () => {
  const r = await refineExitChildParentStateGuard.run({
    cfg: CFG,
    issueNumber: 901,
    fromState: 'refine',
    toState: 'plan',
    deps: { fetchParentIssue: async () => 100, readParentStatus: throwStatus },
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /parent state unverifiable/);
});

test('#565 refine-exit: genuine no-parent (fetch returns null) → ok:true', async () => {
  const r = await refineExitChildParentStateGuard.run({
    cfg: CFG,
    issueNumber: 901,
    fromState: 'refine',
    toState: 'plan',
    deps: { fetchParentIssue: async () => null },
  });
  assert.equal(r.ok, true);
});

// --- Guard 3: child-cannot-lead-epic (every forward transition) -----------------

test('#565 child-cannot-lead: fetchParentIssue throw → fail closed', async () => {
  const r = await childCannotLeadEpicExitGuard.run({
    cfg: CFG,
    issueNumber: 902,
    toState: 'develop',
    deps: { fetchParentIssue: throwFetch },
  });
  assert.equal(r.ok, false, 'a thrown parent fetch must refuse, not masquerade as solo');
  assert.match(r.reason, /parent state unverifiable/);
});

test('#565 child-cannot-lead: genuine no-parent (fetch returns null) → ok:true', async () => {
  const r = await childCannotLeadEpicExitGuard.run({
    cfg: CFG,
    issueNumber: 902,
    toState: 'develop',
    deps: { fetchParentIssue: async () => null },
  });
  assert.equal(r.ok, true, 'a real solo issue must still pass');
});

// --- AC3: consistency with #555's fail-open / fail-closed policy matrix ----------

test('#565 AC3: each guard source carries the fail-closed policy token', () => {
  const files = [
    'backlog-exit-child-parent-state-guard.mjs',
    'refine-exit-child-parent-state-guard.mjs',
    'child-cannot-lead-epic-exit-guard.mjs',
  ];
  for (const f of files) {
    const src = readFileSync(join(LIB_DIR, f), 'utf8');
    assert.ok(
      src.includes('fail-closed: parent state unverifiable'),
      `${f} must carry the greppable fail-closed classification token`
    );
  }
});
