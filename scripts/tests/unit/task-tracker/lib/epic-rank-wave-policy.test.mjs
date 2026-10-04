// @story #1872
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wipAdvanceDecision,
  findNextEligibleChild,
} from '../../../../task-tracker/lib/epic-children-gate.mjs';

const identity = 'a'.repeat(64);
function child(number, rank, state, extra = {}) {
  return {
    number,
    rank,
    state,
    boardState: state,
    issueState: 'open',
    closeReason: null,
    recoveryPhase: null,
    hasCurrentRefinement: true,
    refinementDigest: identity,
    blockedBy: [],
    dependencyReadiness: 'ready',
    ...extra,
  };
}
function snapshot(children, extra = {}) {
  return {
    execution: 'rank-level',
    status: 'ready',
    rank: 2,
    members: [140, 144, 145],
    graph: children.map((c) => ({
      number: c.number,
      rank: c.rank,
      blockedBy: c.blockedBy,
      refinementDigest: c.refinementDigest,
    })),
    bindings: { ok: true },
    ...extra,
  };
}
const done = () => child(100, 1, 'done', { issueState: 'closed', closeReason: 'completed' });
const peers = () => [
  done(),
  child(140, 2, 'develop'),
  child(144, 2, 'ready-for-plan'),
  child(145, 2, 'ready-for-plan'),
];

test('authorized equal-rank peers enter Plan while another peer is developing', () => {
  const children = peers();
  const result = wipAdvanceDecision({
    promotingNumber: 144,
    children,
    rankWave: snapshot(children),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(findNextEligibleChild(children, { rankWave: snapshot(children) })?.number, 144);
});

test('every lower board state blocks both granted and ungranted target ranks', () => {
  for (const state of [
    'backlog',
    'refine',
    'ready-for-plan',
    'plan',
    'develop',
    'test',
    'review',
  ]) {
    for (const granted of [true, false]) {
      const children = [child(100, 1, state), child(144, 2, 'ready-for-plan')];
      const rankWave = snapshot(children, {
        status: granted ? 'ready' : 'ungranted',
        members: [144],
      });
      const result = wipAdvanceDecision({ promotingNumber: 144, children, rankWave });
      assert.equal(result.ok, false, `${state}, granted=${granted}`);
      assert.equal(result.code, 'rank-wave-lower-not-done');
    }
  }
});

test('closed Not Planned, board drift, unknown disposition and pending recovery never prove completed Done', () => {
  for (const extra of [
    { closeReason: 'not_planned' },
    { boardState: 'review' },
    { closeReason: null },
    { recoveryPhase: 'intent' },
    { childEvidenceError: 'unreadable' },
    { issueState: 'open' },
  ]) {
    const children = [done(), child(144, 2, 'ready-for-plan')];
    Object.assign(children[0], extra);
    assert.equal(
      wipAdvanceDecision({
        promotingNumber: 144,
        children,
        rankWave: snapshot(children, { members: [144] }),
      }).ok,
      false,
      JSON.stringify(extra)
    );
  }
});

test('ungranted opted-in ranks retain one active member budget and strict lower Done', () => {
  const children = peers();
  assert.equal(
    wipAdvanceDecision({
      promotingNumber: 144,
      children,
      rankWave: snapshot(children, { status: 'ungranted' }),
    }).ok,
    false
  );
  children[1] = child(140, 2, 'done', { issueState: 'closed', closeReason: 'completed' });
  assert.equal(
    wipAdvanceDecision({
      promotingNumber: 144,
      children,
      rankWave: snapshot(children, { status: 'ungranted' }),
    }).ok,
    true
  );
});

test('changed graph, partial rank membership, revoked grant and isolation collisions refuse', () => {
  for (const change of [
    { members: [144] },
    { status: 'revoked' },
    { bindings: { ok: false, code: 'binding-collision' } },
    { graph: [] },
  ]) {
    const children = peers();
    const result = wipAdvanceDecision({
      promotingNumber: 144,
      children,
      rankWave: snapshot(children, change),
    });
    assert.equal(result.ok, false, JSON.stringify(change));
    assert.match(result.code, /^rank-wave-/);
  }
});

test('dependency refusal, missing graph identity and a duplicate child fail closed', () => {
  for (const modify of [
    (cs) => (cs[2].dependencyReadiness = 'unknown'),
    (cs) => (cs[2].refinementDigest = null),
    (cs) => cs.push({ ...cs[2] }),
  ]) {
    const children = peers();
    const rankWave = snapshot(children);
    modify(children);
    assert.equal(wipAdvanceDecision({ promotingNumber: 144, children, rankWave }).ok, false);
  }
});

test('legacy sequential admission is preserved without rank authority', () => {
  assert.equal(wipAdvanceDecision({ promotingNumber: 144, children: peers() }).ok, false);
  assert.equal(findNextEligibleChild(peers()), null);
});
