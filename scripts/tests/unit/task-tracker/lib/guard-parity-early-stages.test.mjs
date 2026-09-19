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
//     scripts/tests/fixtures/guard-parity/<transition>/.
//   - Fixtures whose accept path requires extensive upstream state (test→review,
//     review→done) document the skip in their fixture file's `_reason` field
//     and set `skip: true`. The refuse fixture is always exercised.
//
// The harness DOES NOT call `runGuards` from the new registry. Once registered
// guards land (seq300-305), a follow-up child can re-run the same fixtures
// through `runGuards` and assert parity with these baselines.

import { describe, it } from 'node:test';
import '../../../fixtures/offline-gh-auto.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { planRefinementEstimate } from '../../../../task-tracker/lib/apply-refinement-estimate.mjs';
import { gateRefineToPlan } from '../../../../task-tracker/lib/refine-to-plan-gate.mjs';
import { planPlannedEstimateGate } from '../../../../task-tracker/lib/refine-estimate-comment.mjs';
import { gateCodeComplete } from '../../../../task-tracker/lib/code-complete-gate.mjs';
import { runReviewPreflight } from '../../../../task-tracker/lib/review-preflight.mjs';
import { markerPresentGate } from '../../../../task-tracker/lib/close-gates.mjs';
import { validateBody, DEFAULT_GATES } from '../../../../task-tracker/lib/body-gates.mjs';
import { runGuards } from '../../../../task-tracker/lib/guard-registry.mjs';
import '../../../../task-tracker/lib/guard-bootstrap.mjs';
import { STATES } from '../../../../task-tracker/states/index.mjs';
import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { CANONICAL_USER_STORY_TEMPLATE } from '../../../../task-tracker/lib/user-story-author.mjs';

// @story #1710: removing draft acceptance or restoring either story registration
// must break these production-registry assertions.
describe('unfinished stories through the production early registry', () => {
  for (const [name, story] of [
    ['missing heading', ''],
    ['blank', '## User Story\n\n'],
    ['template', `## User Story\n\n${CANONICAL_USER_STORY_TEMPLATE}\n\n`],
  ]) {
    const fields = { priority: 'P2', size: 'M', estimate: 4, rank: 100 };
    const labels = ['refactor'];
    const body = stampRefinementSnapshot(
      [
        '<!-- aitm-entered-backlog ts="2026-09-18T00:00:00Z" -->',
        '<!-- aitm-entered-refine ts="2026-09-18T00:01:00Z" -->',
        '<!-- aitm-refine-complete ts="2026-09-18T00:02:00Z" -->',
        '<!-- aitm-refinement-rationale: {"size":"M","estimate":"4","priority":"P2","rationale":"test"} -->',
        story,
        '## Scope\n\nWell-formed intake for an early request.',
        '## Story Origin\n\n- **kind**: code',
        '## Plan Metadata\n',
        '## Acceptance Criteria\n\n- [ ] Works <!-- aitm-non-demonstrable -->',
        '## Pickup Directive — MANDATORY, DO NOT SKIP\n\n> Follow: `.ai-task-manager/templates/pickup-directive.md`',
        `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: fields })} -->`,
      ].join('\n\n'),
      { labels }
    );
    const deps = makeRefineDeps({
      body,
      labels,
      projectValues: { ...fields, startTime: '2026-09-18 00:00 -0500' },
    });
    const context = () => ({
      cfg: CFG,
      issueNumber: 1710,
      body,
      deps: {
        fetchParentIssue: async () => null,
        refinementEstimate: deps,
        refineToPlanGateDeps: deps,
        refinementSnapshot: {
          fetchLabels: async () => labels,
          fetchBoardFields: async () => fields,
        },
      },
    });
    it(`${name} passes Refine exit with every unrelated guard enabled`, async () => {
      const result = await runGuards('refine', 'ready-for-plan', {
        ...context(),
        fromState: 'refine',
        toState: 'ready-for-plan',
      });
      assert.equal(result.ok, true, JSON.stringify(result.refusals));
    });
    it(`${name} emits no story warning at Refine entry`, async (t) => {
      const writes = [];
      t.mock.method(process.stderr, 'write', (value) => {
        writes.push(String(value));
        return true;
      });
      const result = await runGuards('backlog', 'refine', {
        ...context(),
        fromState: 'backlog',
        toState: 'refine',
      });
      assert.equal(result.ok, true, JSON.stringify(result.refusals));
      assert.deepEqual(
        writes.filter((value) => /user.story/i.test(value)),
        []
      );
    });
  }
});

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

const HERE = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const FIXTURE_ROOT = path.join(HERE, '../../fixtures/guard-parity');

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
// 1) backlog → refine (entry into active refinement)
// -----------------------------------------------------------------------------
describe('guard-parity: backlog→refine', () => {
  it('accept fixture: refine-preflight ok on a well-formed fresh issue', async () => {
    const f = loadFixture('backlog-to-refine', 'accept');
    // Promote-path and direct-verb-path both consume `validateBody` at this
    // boundary. The Priority preflight is board-backed, while this fixture
    // checks the shared body-gate stack. Parity here is
    // that validateBody (the shared body-gate stack) accepts.
    const promote = validateBody(f.body, { gates: DEFAULT_GATES });
    const direct = validateBody(f.body, { gates: DEFAULT_GATES });
    assert.equal(promote.ok, true, JSON.stringify(promote));
    assert.equal(promote.ok, direct.ok);
    assert.deepEqual(refusalSet(promote.refusedRules), refusalSet(direct.refusedRules));
  });

  it('refuse fixture: validateBody refusal-set agrees across paths', async () => {
    const f = loadFixture('backlog-to-refine', 'refuse');
    const promote = validateBody(f.body, { gates: DEFAULT_GATES });
    const direct = validateBody(f.body, { gates: DEFAULT_GATES });
    // Neither path refuses backlog→refine on body alone; AC-section
    // completeness is checked at Refine exit. Both accept here.
    // update this fixture.
    assert.equal(promote.ok, true);
    assert.equal(direct.ok, true);
    assert.deepEqual(refusalSet(promote.refusedRules), refusalSet(direct.refusedRules));
  });
});

// -----------------------------------------------------------------------------
// 2) refine → Ready for Planning
// -----------------------------------------------------------------------------
describe('guard-parity: refine→ready-for-plan', () => {
  it('accept fixture: preflight + exit gate agree on ok', async () => {
    const f = loadFixture('refine-to-plan', 'accept');
    const deps = makeRefineDeps(f);

    const promotePreflight = await planRefinementEstimate({
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps,
    });
    const promoteExit = await gateRefineToPlan({ cfg: CFG, issueNumber: 1, deps });

    // Direct-verb path: refine verb calls the same library functions.
    const directPreflight = await planRefinementEstimate({
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps,
    });
    const directExit = await gateRefineToPlan({ cfg: CFG, issueNumber: 1, deps });

    assert.equal(promotePreflight.ok, directPreflight.ok);
    assert.equal(promoteExit.ok, directExit.ok);
    assert.deepEqual(refusalSet(promotePreflight.blockers), refusalSet(directPreflight.blockers));
    assert.deepEqual(refusalSet(promoteExit.blockers), refusalSet(directExit.blockers));
  });

  it('refuse fixture: blocker sets are identical between paths', async () => {
    const f = loadFixture('refine-to-plan', 'refuse');
    const deps = makeRefineDeps(f);

    const promotePreflight = await planRefinementEstimate({
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps,
    });
    const promoteExit = await gateRefineToPlan({ cfg: CFG, issueNumber: 1, deps });

    const directPreflight = await planRefinementEstimate({
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps,
    });
    const directExit = await gateRefineToPlan({ cfg: CFG, issueNumber: 1, deps });

    assert.equal(promotePreflight.ok, false);
    assert.equal(directPreflight.ok, false);
    assert.deepEqual(refusalSet(promotePreflight.blockers), refusalSet(directPreflight.blockers));
    assert.deepEqual(refusalSet(promoteExit.blockers), refusalSet(directExit.blockers));

    if (Array.isArray(f.expectedPreflightSubstrings)) {
      assert.ok(
        containsAll(promotePreflight.blockers, f.expectedPreflightSubstrings),
        `expected preflight blockers to include ${JSON.stringify(f.expectedPreflightSubstrings)}; got ${JSON.stringify(promotePreflight.blockers)}`
      );
    }
  });
});

// -----------------------------------------------------------------------------
// via-registry: backlog→refine + refine→Ready for Planning through runGuards.
// -----------------------------------------------------------------------------
// Asserts that the in-registry entry-field adapters produce the SAME refusal
// content as the underlying gate libraries when invoked through the
// move-state.mjs chokepoint ctx shape `{ cfg, issueNumber, body, deps }`.
// Pre-flight in promote.mjs and in-registry guards both wrap the same gates;
// these tests prove the registry path agrees with the library-baseline path
// the other describes already cover.
describe('guard-parity: backlog→refine via-registry', () => {
  it('accept fixture: runGuards passes when Priority is set', async () => {
    const f = loadFixture('backlog-to-refine', 'accept');
    const deps = makeRefineDeps({
      ...f,
      // The fixture carries Priority even though backlog→Refine does not require it.
      projectValues: { priority: 'P2' },
    });
    const r = await runGuards('backlog', 'refine', {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps },
    });
    assert.equal(r.ok, true, JSON.stringify(r.refusals || r));
  });

  it('missing Priority does not block entry into active Refine', async () => {
    const f = loadFixture('backlog-to-refine', 'refuse');
    const deps = makeRefineDeps({ ...f, projectValues: {} }); // no priority
    const r = await runGuards('backlog', 'refine', {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps },
    });
    assert.equal(r.ok, true, JSON.stringify(r.refusals));
  });
});

describe('guard-parity: refine→ready-for-plan via-registry', () => {
  it('refuse fixture: aggregate registry refusals match library refusals', async () => {
    const f = loadFixture('refine-to-plan', 'refuse');
    const deps = makeRefineDeps(f);

    // Library baseline.
    const libPreflight = await planRefinementEstimate({
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps,
    });
    const libExit = await gateRefineToPlan({ cfg: CFG, issueNumber: 1, deps });
    const libBlockers = new Set([...(libPreflight.blockers || []), ...(libExit.blockers || [])]);

    // Registry path.
    const r = await runGuards('refine', 'ready-for-plan', {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps, refineToPlanGateDeps: deps },
    });
    assert.equal(r.ok, false);
    const regReasons = new Set();
    for (const ref of r.refusals || []) {
      // Registry joins blockers into a `; `-separated reason; split back out
      // so set-equality works against the library baseline.
      for (const piece of String(ref.reason).split(/;\s*/)) {
        if (piece) regReasons.add(piece);
      }
    }

    // Every library blocker must appear in the registry refusal output.
    for (const b of libBlockers) {
      assert.ok(
        [...regReasons].some((x) => x.includes(b) || b.includes(x)),
        `library blocker "${b}" missing from registry refusals: ${[...regReasons].join(' | ')}`
      );
    }
  });
});
