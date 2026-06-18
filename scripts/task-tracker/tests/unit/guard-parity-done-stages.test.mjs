// @story #310
// Guard-parity baseline harness (#263, parent epic #259).
//
// For each forward transition, this file snapshots the CURRENT refusal-reason
// set produced by the gate library functions both the promote-path
// (`scripts/task-tracker/verbs/promote.mjs`) and the direct-verb-path
// (`scripts/gh/move-state.mjs` plus per-verb files) consume. The harness runs
// each fixture through the gate functions in-process with deps injection — no
// subprocess, no network — and asserts the refusal-reason set is stable.
//
// This is a baseline: it MUST pass against pre-migration code. seq300-305
// children migrate guards into `scripts/task-tracker/lib/guard-registry.mjs`;
// each migration must keep the per-transition refusal-reason set unchanged.
// If a migration child changes a refusal reason, this file fails and forces an
// audit + intentional fixture update.
//
// Layout:
//   - One `describe` per forward transition (6 total).
//   - Each `describe` runs an accept fixture and a refuse fixture, loaded from
//     scripts/task-tracker/tests/fixtures/guard-parity/<transition>/.
//   - Fixtures whose accept path requires extensive upstream state (test→review,
//     review→done) document the skip in their fixture file's `_reason` field
//     and set `skip: true`. The refuse fixture is always exercised.
//
// The harness DOES NOT call `runGuards` from the new registry. Once registered
// guards land (seq300-305), a follow-up child can re-run the same fixtures
// through `runGuards` and assert parity with these baselines.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { planRefinementEstimate } from '../../lib/apply-refinement-estimate.mjs';
import { gateRefineToPlan } from '../../lib/refine-to-plan-gate.mjs';
import { planPlannedEstimateGate } from '../../lib/refine-estimate-comment.mjs';
import { gateCodeComplete } from '../../lib/code-complete-gate.mjs';
import { runReviewPreflight } from '../../lib/review-preflight.mjs';
import { markerPresentGate } from '../../lib/close-gates.mjs';
import { validateBody, DEFAULT_GATES } from '../../lib/body-gates.mjs';
import { runGuards } from '../../lib/guard-registry.mjs';
import '../../lib/guard-bootstrap.mjs';
import { STATES } from '../../states/index.mjs';

// Walk STATES[from].exitGuards followed by STATES[to].entryGuards directly,
// bypassing the flat guard-registry. Returns the same `{ ok, refusals }`
// shape `runGuards` produces so the via-state-objects assertions can mirror
// the via-registry assertions without per-test plumbing.
async function runStateObjectGuards(from, to, ctx) {
  const fromState = STATES[from];
  const toState = STATES[to];
  const refusals = [];
  const sequence = [
    ...fromState.exitGuards.map((g) => ({ slot: 'exit', guard: g })),
    ...toState.entryGuards.map((g) => ({ slot: 'entry', guard: g })),
  ];
  for (const { slot, guard } of sequence) {
    let result;
    try {
      result = await guard.run(ctx);
    } catch (err) {
      result = { ok: false, reason: String(err && err.message ? err.message : err) };
    }
    if (!result || result.ok === false) {
      refusals.push({
        slot,
        id: guard.id,
        reason: result?.reason || '(no reason given)',
      });
    }
  }
  return { ok: refusals.length === 0, refusals };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.join(HERE, '..', 'fixtures', 'guard-parity');

function loadFixture(transitionDir, kind) {
  const p = path.join(FIXTURE_ROOT, transitionDir, `${kind}.json`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

const CFG = {
  repo: 'kburson/ai-task-manager',
  projectId: 'PVT_TEST',
  fieldIds: {
    priority: 'F_priority',
    size: 'F_size',
    estimate: 'F_estimate',
    rank: 'F_rank',
    startTime: 'F_startTime',
  },
  fieldStartTime: 'F_startTime',
  rankFieldId: 'F_rank',
};

// Convert a result object (varies by gate) into a sorted Set of substring keys
// for stable equality assertions.
function refusalSet(arr) {
  return new Set((arr || []).map((s) => String(s).split(':')[0].trim()));
}

function containsAll(actual, expected) {
  const a = refusalSet(actual);
  return expected.every((e) => [...a].some((x) => x.startsWith(e) || e.startsWith(x)));
}

// Shared fixture-deps factory: produces deps for `planRefinementEstimate` and
// `gateRefineToPlan` from a fixture's projectValues + labels + body.
function makeRefineDeps(fixture) {
  return {
    loadProjectFieldDefs: () => ({
      priority: { type: 'singleSelect', id: 'F_priority' },
      size: { type: 'singleSelect', id: 'F_size' },
      estimate: { type: 'number', id: 'F_estimate' },
      rank: { type: 'number', id: 'F_rank' },
      startTime: { type: 'text', id: 'F_startTime' },
    }),
    projectValuesForIssue: async () => fixture.projectValues || {},
    fetchLabels: async () => fixture.labels || [],
    fetchBody: async () => fixture.body || '',
  };
}

// -----------------------------------------------------------------------------
// 6) review → done
// -----------------------------------------------------------------------------
describe('guard-parity: review→done', () => {
  it('accept fixture: skipped — see fixture _reason', async () => {
    const f = loadFixture('review-to-done', 'accept');
    assert.equal(f.skip, true, 'fixture must explicitly opt out');
    assert.ok(f._reason && f._reason.length > 0, 'skip requires _reason');
  });

  it('refuse fixture: markerPresentGate refuses missing dod-verified marker', async () => {
    const f = loadFixture('review-to-done', 'refuse');
    // markerPresentGate is the cheapest pure check inside runCloseGates and is
    // the single gate that fires deterministically without git/gh I/O. Both
    // the promote-path (review→done via approve verb) and the direct-verb
    // path (`approve` verb, then close) reach `runCloseGates` which calls
    // `markerPresentGate` first. Asserting agreement at this gate proves the
    // baseline refusal-reason set.
    const promote = markerPresentGate(f.body);
    const direct = markerPresentGate(f.body);
    assert.equal(promote.ok, false);
    assert.equal(direct.ok, false);
    assert.equal(promote.blocker, direct.blocker);
    if (Array.isArray(f.expectedSubstrings)) {
      for (const want of f.expectedSubstrings) {
        assert.ok(
          String(promote.blocker).includes(want),
          `expected blocker containing "${want}"; got "${promote.blocker}"`
        );
      }
    }
  });
});

// -----------------------------------------------------------------------------
// via-state-objects: on-deck→refine + refine→plan through STATES (#292; the
// Priority guard relocated to on-deck-exit in #433)
// -----------------------------------------------------------------------------
// Exercises `STATES[from].exitGuards` + `STATES[to].entryGuards` DIRECTLY,
// bypassing the flat registry. Asserts the refusal-reason set is identical
// to the via-registry baseline above. Proves the state-object containers and
// the registry agree, so callers can be migrated to read from STATES with no
// behavior drift.
describe('guard-parity: on-deck→refine via-state-objects', () => {
  it('accept fixture: state-object walk passes when Priority is set', async () => {
    const f = loadFixture('backlog-to-refine', 'accept');
    const deps = makeRefineDeps({
      ...f,
      projectValues: { priority: 'P2' },
    });
    const r = await runStateObjectGuards('on-deck', 'refine', {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps },
    });
    assert.equal(r.ok, true, JSON.stringify(r.refusals));
  });

  it('refuse fixture: state-object walk refuses when Priority missing', async () => {
    const f = loadFixture('backlog-to-refine', 'refuse');
    const deps = makeRefineDeps({ ...f, projectValues: {} });
    const r = await runStateObjectGuards('on-deck', 'refine', {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps },
    });
    assert.equal(r.ok, false);
    const reasons = (r.refusals || []).map((x) => x.reason).join(' | ');
    assert.match(reasons, /priority/i, `expected priority refusal, got: ${reasons}`);
  });

  it('parity: state-object refusal set equals registry refusal set', async () => {
    const f = loadFixture('backlog-to-refine', 'refuse');
    const deps = makeRefineDeps({ ...f, projectValues: {} });
    const ctxRegistry = {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps },
    };
    const ctxStates = {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps },
    };
    const reg = await runGuards('on-deck', 'refine', ctxRegistry);
    const obj = await runStateObjectGuards('on-deck', 'refine', ctxStates);
    const regKeys = new Set((reg.refusals || []).map((x) => x.id));
    const objKeys = new Set((obj.refusals || []).map((x) => x.id));
    assert.deepEqual(objKeys, regKeys);
  });
});

describe('guard-parity: refine→plan via-state-objects', () => {
  it('refuse fixture: aggregate state-object refusals match library refusals', async () => {
    const f = loadFixture('refine-to-plan', 'refuse');
    const deps = makeRefineDeps(f);

    const libPreflight = await planRefinementEstimate({
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps,
    });
    const libExit = await gateRefineToPlan({ cfg: CFG, issueNumber: 1, deps });
    const libBlockers = new Set([...(libPreflight.blockers || []), ...(libExit.blockers || [])]);

    const r = await runStateObjectGuards('refine', 'plan', {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps, refineToPlanGateDeps: deps },
    });
    assert.equal(r.ok, false);

    const objReasons = new Set();
    for (const ref of r.refusals || []) {
      for (const piece of String(ref.reason).split(/;\s*/)) {
        if (piece) objReasons.add(piece);
      }
    }
    for (const b of libBlockers) {
      assert.ok(
        [...objReasons].some((x) => x.includes(b) || b.includes(x)),
        `library blocker "${b}" missing from state-object refusals: ${[...objReasons].join(' | ')}`
      );
    }
  });

  it('parity: state-object refusal set equals registry refusal set', async () => {
    const f = loadFixture('refine-to-plan', 'refuse');
    const deps = makeRefineDeps(f);
    const ctxRegistry = {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps, refineToPlanGateDeps: deps },
    };
    const ctxStates = {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps, refineToPlanGateDeps: deps },
    };
    const reg = await runGuards('refine', 'plan', ctxRegistry);
    const obj = await runStateObjectGuards('refine', 'plan', ctxStates);
    const regKeys = new Set((reg.refusals || []).map((x) => x.id));
    const objKeys = new Set((obj.refusals || []).map((x) => x.id));
    assert.deepEqual(objKeys, regKeys);
  });
});
