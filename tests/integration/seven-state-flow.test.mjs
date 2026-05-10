// Integration smoke test: a fixture epic with sub-issues across two waves runs
// through the 7-state lifecycle (Backlog → Groom → Analyze → Development →
// Validate → Review → Done). Wave-admission and cascade-grooming gates are
// driven via the pure helpers in scripts/gh/lib/wave-admission.mjs and
// scripts/task-tracker/lib/body-gates.mjs against an in-memory project state —
// no live `gh` invocations.

import assert from 'node:assert/strict';
import { admit } from '../../scripts/gh/lib/wave-admission.mjs';
import { checkCascadeGrooming, checkWaveAdmission } from '../../scripts/task-tracker/lib/body-gates.mjs';

const STATES = ['backlog', 'groom', 'analyze', 'development', 'validate', 'review', 'done'];

function makeProject() {
  const issues = new Map();
  return {
    add(n, { status = 'backlog', sequence = null, parent = null } = {}) {
      issues.set(n, { number: n, status, sequence, parent, children: [] });
      if (parent != null) issues.get(parent).children.push(n);
    },
    move(n, target) {
      assert.ok(STATES.includes(target), `unknown target ${target}`);
      issues.get(n).status = target;
    },
    setSequence(n, s) { issues.get(n).sequence = s; },
    read(n) { return issues.get(n); },
    childrenOf(parent) { return issues.get(parent).children.map(c => issues.get(c)); },
    fetchSiblings({ parentEpicNumber }) {
      return issues.get(parentEpicNumber).children
        .map(c => issues.get(c))
        .map(c => ({ number: c.number, sequence: c.sequence, state: c.status }));
    },
    fetchSubIssueStates({ epicNumber }) {
      return issues.get(epicNumber).children
        .map(c => issues.get(c))
        .map(c => ({ number: c.number, state: c.status }));
    },
  };
}

async function admitFor(proj, child) {
  return admit({
    parentEpicNumber: child.parent,
    sequence: child.sequence,
    repo: 'x/y',
    projectId: 'p',
    fetchSiblings: proj.fetchSiblings,
  });
}

async function cascadeFor(proj, epicNumber) {
  return checkCascadeGrooming({
    isEpic: true,
    epicNumber,
    repo: 'x/y',
    projectId: 'p',
    fetchSubIssueStates: proj.fetchSubIssueStates,
  });
}

// -----------------------------------------------------------------------
// Test 1: epic + 2 waves through full 7-state flow.
// -----------------------------------------------------------------------
async function testFullFlow() {
  const p = makeProject();
  p.add(100, { status: 'groom' });
  p.add(101, { sequence: 1, parent: 100 });
  p.add(102, { sequence: 1, parent: 100 });
  p.add(103, { sequence: 2, parent: 100 });
  p.add(104, { sequence: 2, parent: 100 });

  // Cascade-grooming refuses while sub-issues are still in Backlog.
  let refusals = await cascadeFor(p, 100);
  assert.equal(refusals.length, 4, 'all 4 sub-issues should block cascade-grooming');

  for (const n of [101, 102, 103, 104]) p.move(n, 'groom');
  refusals = await cascadeFor(p, 100);
  assert.equal(refusals.length, 0, 'cascade-grooming clears once all sub-issues are groom+');

  // Epic moves through Analyze → Development.
  p.move(100, 'analyze');
  p.move(100, 'development');

  // Wave-1 (Sequence=1) admission: S1 and S2 are admitted.
  for (const n of [101, 102]) {
    const r = await admitFor(p, p.read(n));
    assert.equal(r.ok, true, `wave-1 sub-issue #${n} should be admitted`);
  }

  // Wave-2 (Sequence=2) admission: blocked while wave-1 is in flight.
  p.move(101, 'analyze');
  p.move(102, 'analyze');
  for (const n of [103, 104]) {
    const r = await admitFor(p, p.read(n));
    assert.equal(r.ok, false, `wave-2 sub-issue #${n} must be blocked while wave-1 is in flight`);
    assert.ok(r.blockers.length >= 1);
  }

  // Run S1 to Done independently of S2.
  for (const target of ['development', 'validate', 'review', 'done']) p.move(101, target);
  // S2 still in flight → wave-2 still blocked.
  let r = await admitFor(p, p.read(103));
  assert.equal(r.ok, false, 'wave-2 still blocked while S2 is in flight');

  // Finish S2.
  for (const target of ['development', 'validate', 'review', 'done']) p.move(102, target);

  // Wave-2 now admits.
  for (const n of [103, 104]) {
    const r2 = await admitFor(p, p.read(n));
    assert.equal(r2.ok, true, `wave-2 sub-issue #${n} should admit once wave-1 is Done`);
  }
}

// -----------------------------------------------------------------------
// Test 2: same-wave newcomer rule.
// A discovered sub-issue inserted at Sequence=1 mid-flight does NOT halt
// already-flowing wave-1 members, but DOES extend wave-2 admission.
// -----------------------------------------------------------------------
async function testSameWaveNewcomer() {
  const p = makeProject();
  p.add(200, { status: 'development' });
  p.add(201, { sequence: 1, parent: 200, status: 'development' });
  p.add(202, { sequence: 1, parent: 200, status: 'review' });
  p.add(203, { sequence: 2, parent: 200, status: 'backlog' });

  // Newcomer S5 joins wave-1 mid-flight.
  p.add(205, { sequence: 1, parent: 200, status: 'analyze' });

  // Existing wave-1 members are NOT blocked by the newcomer (same-wave rule).
  for (const n of [201, 202]) {
    const r = await admitFor(p, p.read(n));
    assert.equal(r.ok, true, `existing wave-1 member #${n} must not be halted by newcomer`);
  }

  // Newcomer itself: admitted (its own wave is wave-1; nothing earlier).
  const newcomer = await admitFor(p, p.read(205));
  assert.equal(newcomer.ok, true, 'newcomer at lowest wave admits');

  // Wave-2 admission: must wait for newcomer too.
  // Drive S1 + S2 to Done.
  p.move(201, 'validate'); p.move(201, 'review'); p.move(201, 'done');
  p.move(202, 'done');

  // Newcomer still in analyze → wave-2 stays blocked.
  let r = await admitFor(p, p.read(203));
  assert.equal(r.ok, false, 'wave-2 blocked while newcomer not yet Done');

  // Drive newcomer to Done; wave-2 now admits.
  for (const target of ['development', 'validate', 'review', 'done']) p.move(205, target);
  r = await admitFor(p, p.read(203));
  assert.equal(r.ok, true, 'wave-2 admits once newcomer reaches Done');
}

// -----------------------------------------------------------------------
// Test 3: solo issue with no parent — wave-admission and cascade-grooming
// gates do NOT fire.
// -----------------------------------------------------------------------
async function testSoloIssue() {
  const p = makeProject();
  p.add(300, { status: 'backlog' }); // solo, no parent

  const child = p.read(300);
  const r = await admit({
    parentEpicNumber: child.parent, // null
    sequence: child.sequence,
    fetchSiblings: () => { throw new Error('solo must not call fetchSiblings'); },
  });
  assert.equal(r.ok, true, 'solo issue admits without invoking fetchSiblings');

  const cascade = await checkWaveAdmission({
    parentEpicNumber: null,
    sequence: null,
    admit: () => { throw new Error('solo must not call admit'); },
  });
  assert.deepEqual(cascade, [], 'checkWaveAdmission solo bypass returns []');

  // Drive solo through Backlog → Groom → Analyze without any gate firing.
  p.move(300, 'groom');
  p.move(300, 'analyze');
  assert.equal(p.read(300).status, 'analyze');
}

// -----------------------------------------------------------------------
async function main() {
  await testFullFlow();
  await testSameWaveNewcomer();
  await testSoloIssue();
  console.log('seven-state-flow integration: ok');
}

main().catch(err => { console.error(err); process.exit(1); });
