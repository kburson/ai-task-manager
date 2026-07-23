// @story #888
// Review→Done child-disposition gate (#888, parent epic #883).
//
// The hole: a child closed `not planned` reads as state `done` to
// `reviewEpicDoneChildrenGate`, so an epic closes over dropped scope with a
// fully green tree. These tests pin the conjunction that closes it — a
// wontfixed child AND an AC that is neither ticked nor struck — plus the
// asymmetry that makes it meaningful: unchecked is not struck.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { reviewEpicChildDispositionGate } from '../../../lib/epic-child-disposition-gate.mjs';
import { parseAcStrike, findAcStrikes, danglingAcs } from '../../../lib/ac-strike.mjs';
import { normalizeCloseReason } from '../../../../gh/lib/wave-admission.mjs';
import { INVARIANT_MARKER_PATTERNS, findLostMarkers } from '../../../lib/body-invariants.mjs';
import { reviewExitEpicChildDispositionGuard } from '../../../lib/review-exit-epic-child-disposition-guard.mjs';

const cfg = { repo: 'o/r', projectId: 'PVT_test' };

const STRIKE =
  '<!-- aitm-ac-struck child="#891" reason="cut — subsumed by #886" ts="2026-07-19T00:00:00Z" -->';

// `deliveredAc` is ticked with ordinary proof; `carriedAc` is the promise the
// wontfixed child was holding.
function epicBody({ carriedStruck = false, carriedTicked = false } = {}) {
  const carriedBox = carriedTicked ? 'x' : ' ';
  const carriedTail = carriedStruck ? ` ${STRIKE}` : '';
  return [
    '<!-- aitm-issue-kind kind="epic" -->',
    '',
    '## Acceptance Criteria',
    '',
    '- [x] Derived trail groups commits by child <!-- aitm-verified commits="d9d614f" -->',
    `- [${carriedBox}] Bijection check names unmapped ACs${carriedTail}`,
    '',
  ].join('\n');
}

function childrenDeps(children) {
  return { fetchSiblings: async () => children };
}

const WONTFIXED = [
  { number: 890, rank: 1, state: 'done', closeReason: 'completed' },
  { number: 891, rank: 2, state: 'done', closeReason: 'not_planned' },
];
const ALL_COMPLETED = [
  { number: 890, rank: 1, state: 'done', closeReason: 'completed' },
  { number: 891, rank: 2, state: 'done', closeReason: 'completed' },
];

// ---------------------------------------------------------------------------
// AC1 — wontfixed child + unstruck AC ⇒ refused.
// ---------------------------------------------------------------------------

test('AC1: epic with a `not planned` child and an unstruck AC is refused', async () => {
  const r = await reviewEpicChildDispositionGate({
    cfg,
    issueNumber: 883,
    body: epicBody(),
    deps: childrenDeps(WONTFIXED),
  });
  assert.equal(r.ok, false);
  assert.equal(r.blockers.length, 1, `unexpected extra blockers: ${r.blockers.join(' | ')}`);
  assert.ok(r.blockers[0].startsWith('epic-child-disposition-unstruck'));
});

test('AC1: the refusal is keyed on the disposition, not on the child being closed at all', async () => {
  // Same tree, same dangling AC — but every child closed `completed`. Proves the
  // gate reads `closeReason`, not `state`, which is the entire point: `state` is
  // `done` in both fixtures.
  const r = await reviewEpicChildDispositionGate({
    cfg,
    issueNumber: 883,
    body: epicBody(),
    deps: childrenDeps(ALL_COMPLETED),
  });
  assert.equal(r.ok, true, `blockers: ${(r.blockers || []).join(' | ')}`);
});

// ---------------------------------------------------------------------------
// AC2 — struck ⇒ passes.
// ---------------------------------------------------------------------------

test('AC2: the same epic passes once the AC is explicitly struck', async () => {
  const r = await reviewEpicChildDispositionGate({
    cfg,
    issueNumber: 883,
    body: epicBody({ carriedStruck: true }),
    deps: childrenDeps(WONTFIXED),
  });
  assert.equal(r.ok, true, `blockers: ${(r.blockers || []).join(' | ')}`);
  assert.deepEqual(r.dangling, []);
  assert.deepEqual(
    r.wontfixed.map((c) => c.number),
    [891]
  );
});

test('AC2: an AC that was delivered anyway also clears it (tick satisfies, no strike needed)', async () => {
  // A wontfixed child does not always drop a promise — another child may have
  // covered it. Refusing here would be a nuisance gate operators route around.
  const r = await reviewEpicChildDispositionGate({
    cfg,
    issueNumber: 883,
    body: epicBody({ carriedTicked: true }),
    deps: childrenDeps(WONTFIXED),
  });
  assert.equal(r.ok, true, `blockers: ${(r.blockers || []).join(' | ')}`);
});

// ---------------------------------------------------------------------------
// AC3 — all-completed trees unaffected.
// ---------------------------------------------------------------------------

test('AC3: an epic whose children all closed `completed` is unaffected', async () => {
  for (const body of [
    epicBody(),
    epicBody({ carriedTicked: true }),
    epicBody({ carriedStruck: true }),
  ]) {
    const r = await reviewEpicChildDispositionGate({
      cfg,
      issueNumber: 883,
      body,
      deps: childrenDeps(ALL_COMPLETED),
    });
    assert.equal(r.ok, true, `blockers: ${(r.blockers || []).join(' | ')}`);
  }
});

test('AC3: a non-epic issue is never gated, even with a wontfixed child and a dangling AC', async () => {
  const body = epicBody().replace('<!-- aitm-issue-kind kind="epic" -->', '');
  const r = await reviewEpicChildDispositionGate({
    cfg,
    issueNumber: 883,
    body,
    deps: {
      fetchSiblings: async () => {
        throw new Error('non-epic must not fetch children');
      },
    },
  });
  assert.equal(r.ok, true);
});

test('AC3: an epic with no children at all passes', async () => {
  const r = await reviewEpicChildDispositionGate({
    cfg,
    issueNumber: 883,
    body: epicBody(),
    deps: childrenDeps([]),
  });
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// AC4 — unchecked is NOT struck.
// ---------------------------------------------------------------------------

test('AC4: merely unchecking an AC does not satisfy the gate', async () => {
  // `epicBody()` already leaves the carried AC unchecked, and AC1 shows it is
  // refused. Pinned here from the other direction: `danglingAcs` counts the
  // unchecked-and-unstruck AC and no other.
  const dangling = danglingAcs(epicBody());
  assert.equal(dangling.length, 1);
  assert.match(dangling[0].label, /Bijection check/);
  assert.equal(danglingAcs(epicBody({ carriedStruck: true })).length, 0);
  assert.equal(danglingAcs(epicBody({ carriedTicked: true })).length, 0);
});

test('AC4: a strike is recognized on an UNCHECKED box (a struck AC is not "done")', async () => {
  // The strike must not require ticking. Striking means withdrawn, not
  // delivered — forcing a tick would reintroduce the false-green this gate
  // exists to prevent.
  const acs = findAcStrikes(epicBody({ carriedStruck: true }));
  const struck = acs.find((a) => a.strike);
  assert.equal(struck.checked, false);
  assert.equal(struck.strike.child, 891);
});

test('AC4: parseAcStrike reads child/reason/ts, and tolerates a bare child form', () => {
  assert.equal(parseAcStrike('no marker here'), null);
  const full = parseAcStrike(`label ${STRIKE}`);
  assert.equal(full.child, 891);
  assert.match(full.reason, /subsumed by #886/);
  assert.equal(full.ts, '2026-07-19T00:00:00Z');
  // `child="891"` without the `#` is the same claim.
  assert.equal(parseAcStrike('x <!-- aitm-ac-struck child="891" -->').child, 891);
  // An unattributed strike still counts as a strike, but reports child=null
  // rather than silently crediting whichever child happened to be wontfixed.
  const bare = parseAcStrike('x <!-- aitm-ac-struck reason="dropped" -->');
  assert.notEqual(bare, null);
  assert.equal(bare.child, null);
});

// ---------------------------------------------------------------------------
// AC5 — the refusal names both the child and the dangling AC(s).
// ---------------------------------------------------------------------------

test('AC5: the refusal names the wontfixed child and every dangling AC', async () => {
  const body = [
    '<!-- aitm-issue-kind kind="epic" -->',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] First dropped promise',
    '- [ ] Second dropped promise',
    `- [ ] Third, properly struck ${STRIKE}`,
    '',
  ].join('\n');
  const r = await reviewEpicChildDispositionGate({
    cfg,
    issueNumber: 883,
    body,
    deps: childrenDeps([
      { number: 891, state: 'done', closeReason: 'not_planned' },
      { number: 892, state: 'done', closeReason: 'not_planned' },
    ]),
  });
  assert.equal(r.ok, false);
  const msg = r.blockers[0];
  assert.match(msg, /#891/);
  assert.match(msg, /#892/);
  assert.match(msg, /First dropped promise/);
  assert.match(msg, /Second dropped promise/);
  // The struck one must NOT be listed as dangling.
  assert.ok(!/Third, properly struck/.test(msg), `struck AC leaked into refusal: ${msg}`);
  // Names the remedy as an act, not as a missing marker (#887's lesson: an
  // operator who reads "missing marker" stamps it blind).
  assert.match(msg, /Either deliver the AC, or record the drop/);
  assert.match(msg, /Leaving the box unchecked is not a decision/);
});

// ---------------------------------------------------------------------------
// Disposition plumbing — `stateReason` had to be added to the fetcher.
// ---------------------------------------------------------------------------

test('normalizeCloseReason maps GitHub enum casing, and only for CLOSED issues', () => {
  assert.equal(
    normalizeCloseReason({ state: 'CLOSED', stateReason: 'NOT_PLANNED' }),
    'not_planned'
  );
  assert.equal(normalizeCloseReason({ state: 'CLOSED', stateReason: 'COMPLETED' }), 'completed');
  // An OPEN issue has no disposition — "still open" is the children-done gate's
  // business, not this one's.
  assert.equal(normalizeCloseReason({ state: 'OPEN', stateReason: 'NOT_PLANNED' }), null);
  assert.equal(normalizeCloseReason({ state: 'CLOSED' }), null);
  assert.equal(normalizeCloseReason(null), null);
});

test('the fetcher query selects stateReason and carries it additively', () => {
  const src = readFileSync(
    new URL('../../../../gh/lib/wave-admission.mjs', import.meta.url),
    'utf8'
  );
  assert.match(src, /\bstateReason\b/, 'GraphQL selection must request stateReason');
  // `{number, rank, state}` must survive untouched — four call sites read it.
  assert.match(src, /number: sub\.number, rank, state, closeReason:/);
});

// ---------------------------------------------------------------------------
// Marker registration — the three-step rule (#887's lesson).
// ---------------------------------------------------------------------------

test('aitm-ac-struck is registered as an append-only invariant marker', () => {
  const entry = INVARIANT_MARKER_PATTERNS.find((p) => p.name === 'aitm-ac-struck');
  assert.ok(entry, 'aitm-ac-struck missing from INVARIANT_MARKER_PATTERNS');
  assert.equal(entry.kind, 'count');
  const before = epicBody({ carriedStruck: true });
  const after = epicBody();
  assert.deepEqual(findLostMarkers(before, after), ['aitm-ac-struck']);
  // Adding a strike is never a loss.
  assert.deepEqual(findLostMarkers(after, before), []);
});

test('aitm-ac-struck is mirrored into the gh-edit-guard registry', () => {
  // Without the mirror an external `gh issue edit --body` strips the record of
  // dropped scope past the Bash-level guard. Asserted against source because the
  // registry is module-private.
  const src = readFileSync(new URL('../../../lib/gh-edit-guard.mjs', import.meta.url), 'utf8');
  assert.match(src, /name: 'aitm-ac-struck'/);
});

// ---------------------------------------------------------------------------
// Guard wiring and fail-open surface.
// ---------------------------------------------------------------------------

test('the guard is scoped to review→done and fails open on absent context', async () => {
  const boom = {
    reviewEpicChildDispositionGate: async () => {
      throw new Error('guard ran when it should have short-circuited');
    },
  };
  assert.equal(
    (await reviewExitEpicChildDispositionGuard.run({ toState: 'test', deps: boom })).ok,
    true
  );
  assert.equal(
    (await reviewExitEpicChildDispositionGuard.run({ toState: 'done', deps: boom })).ok,
    true
  );
  assert.equal(
    (
      await reviewExitEpicChildDispositionGuard.run({
        toState: 'done',
        cfg,
        issueNumber: 883,
        deps: boom,
      })
    ).ok,
    true,
    'missing body must fail open, not synthesize a refusal that masks another guard'
  );
});

test('the guard surfaces the gate refusal verbatim', async () => {
  const r = await reviewExitEpicChildDispositionGuard.run({
    toState: 'done',
    cfg,
    issueNumber: 883,
    body: epicBody(),
    deps: { epicChildren: childrenDeps(WONTFIXED) },
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /^epic-child-disposition-unstruck/);
  assert.equal(r.blockers.length, 1);
});

test('a children fetch failure is a refusal, not a silent pass', async () => {
  const r = await reviewEpicChildDispositionGate({
    cfg,
    issueNumber: 883,
    body: epicBody(),
    deps: {
      fetchSiblings: async () => {
        throw new Error('network down');
      },
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blockers[0], /^epic-child-disposition-fetch-failed: network down/);
});

test('the guard is registered on the review state exit chain, after the done-check', async () => {
  const review = (await import('../../../states/review.mjs')).default;
  const ids = review.exitGuards.map((g) => g.id);
  const doneIdx = ids.indexOf('review-exit-epic-children-done');
  const dispIdx = ids.indexOf('review-exit-epic-child-disposition');
  assert.ok(dispIdx >= 0, `guard not registered: ${ids.join(', ')}`);
  assert.ok(doneIdx >= 0 && dispIdx === doneIdx + 1, `wrong order: ${ids.join(', ')}`);
});
