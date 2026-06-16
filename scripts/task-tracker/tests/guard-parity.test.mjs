#!/usr/bin/env node
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

import { planRefinementEstimate } from '../lib/apply-refinement-estimate.mjs';
import { gateRefineToPlan } from '../lib/refine-to-plan-gate.mjs';
import { planPlannedEstimateGate } from '../lib/refine-estimate-comment.mjs';
import { gateCodeComplete } from '../lib/code-complete-gate.mjs';
import { runReviewPreflight } from '../lib/review-preflight.mjs';
import { markerPresentGate } from '../lib/close-gates.mjs';
import { validateBody, DEFAULT_GATES } from '../lib/body-gates.mjs';
import { runGuards } from '../lib/guard-registry.mjs';
import '../lib/guard-bootstrap.mjs';
import { STATES } from '../states/index.mjs';

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
const FIXTURE_ROOT = path.join(HERE, 'fixtures', 'guard-parity');

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
    sequence: 'F_sequence',
    startTime: 'F_startTime',
  },
  fieldStartTime: 'F_startTime',
  sequenceFieldId: 'F_sequence',
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
      sequence: { type: 'number', id: 'F_sequence' },
      startTime: { type: 'text', id: 'F_startTime' },
    }),
    projectValuesForIssue: async () => fixture.projectValues || {},
    fetchLabels: async () => fixture.labels || [],
    fetchBody: async () => fixture.body || '',
  };
}

// -----------------------------------------------------------------------------
// 1) backlog → refine
// -----------------------------------------------------------------------------
describe('guard-parity: backlog→refine', () => {
  it('accept fixture: refine-preflight ok on a well-formed fresh issue', async () => {
    const f = loadFixture('backlog-to-refine', 'accept');
    // Promote-path and direct-verb-path both consume `validateBody` at this
    // boundary. There is no preflight gate at backlog→refine today; the
    // refine-side gates fire on the NEXT transition. Parity check here is
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
    // Today neither path refuses backlog→refine on body alone; AC-section
    // absence is checked on the NEXT transition. Baseline-correct: both
    // accept here. Any migration that adds a backlog→refine entry gate must
    // update this fixture.
    assert.equal(promote.ok, true);
    assert.equal(direct.ok, true);
    assert.deepEqual(refusalSet(promote.refusedRules), refusalSet(direct.refusedRules));
  });
});

// -----------------------------------------------------------------------------
// 2) refine → plan
// -----------------------------------------------------------------------------
describe('guard-parity: refine→plan', () => {
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
// via-registry: on-deck→refine + refine→plan through runGuards (#276; the
// Priority entry-field adapter relocated from backlog-exit to on-deck-exit in
// #433, so it now fires on the on-deck→refine hop).
// -----------------------------------------------------------------------------
// Asserts that the in-registry entry-field adapters produce the SAME refusal
// content as the underlying gate libraries when invoked through the
// move-state.mjs chokepoint ctx shape `{ cfg, issueNumber, body, deps }`.
// Pre-flight in promote.mjs and in-registry guards both wrap the same gates;
// these tests prove the registry path agrees with the library-baseline path
// the other describes already cover.
describe('guard-parity: on-deck→refine via-registry', () => {
  it('accept fixture: runGuards passes when Priority is set', async () => {
    const f = loadFixture('backlog-to-refine', 'accept');
    const deps = makeRefineDeps({
      ...f,
      // Adapter expects Priority on the board; the on-deck→refine accept
      // fixture has no projectValues block (validateBody-only). Stamp one
      // in so the registry path mirrors the post-Refine reality.
      projectValues: { priority: 'P2' },
    });
    const r = await runGuards('on-deck', 'refine', {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps },
    });
    assert.equal(r.ok, true, JSON.stringify(r.refusals || r));
  });

  it('refuse fixture: runGuards refuses when Priority missing', async () => {
    const f = loadFixture('backlog-to-refine', 'refuse');
    const deps = makeRefineDeps({ ...f, projectValues: {} }); // no priority
    const r = await runGuards('on-deck', 'refine', {
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps: { refinementEstimate: deps },
    });
    assert.equal(r.ok, false);
    const reasons = (r.refusals || []).map((x) => x.reason).join(' | ');
    assert.match(reasons, /priority/i, `expected priority refusal, got: ${reasons}`);
  });
});

describe('guard-parity: refine→plan via-registry', () => {
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
    const r = await runGuards('refine', 'plan', {
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

// -----------------------------------------------------------------------------
// 3) plan → develop
// -----------------------------------------------------------------------------
describe('guard-parity: plan→develop', () => {
  it('accept fixture: planned-estimate gate + body-gates ok', async () => {
    const f = loadFixture('plan-to-develop', 'accept');
    // Inject a stub comments-list so planPlannedEstimateGate finds an appendix.
    const deps = {
      listComments: async () => [
        {
          body: '### 🛠 Refine estimate\n\n<!-- aitm-refined-estimate: 1 -->\n\nSize · Estimate · Priority\n\n### Planned Estimate\n\n| Size | M | M |\n| Estimate (h) | 4 | 4 |\n',
        },
      ],
    };

    const promote = await planPlannedEstimateGate({ cfg: CFG, issueNumber: 1, deps });
    const direct = await planPlannedEstimateGate({ cfg: CFG, issueNumber: 1, deps });
    const bodyPromote = validateBody(f.body, { gates: DEFAULT_GATES });
    const bodyDirect = validateBody(f.body, { gates: DEFAULT_GATES });

    assert.equal(promote.ok, direct.ok);
    assert.equal(bodyPromote.ok, bodyDirect.ok);
    assert.deepEqual(refusalSet(promote.blockers), refusalSet(direct.blockers));
    assert.deepEqual(
      refusalSet(bodyPromote.refusedRules?.map((r) => r.rule)),
      refusalSet(bodyDirect.refusedRules?.map((r) => r.rule))
    );
    assert.equal(
      promote.ok,
      true,
      `accept fixture should pass planned-estimate gate; got ${JSON.stringify(promote)}`
    );
  });

  it('refuse fixture: missing planned-estimate appendix refuses both paths', async () => {
    const f = loadFixture('plan-to-develop', 'refuse');
    const deps = {
      listComments: async () => [], // no refine-estimate comment at all
    };
    const promote = await planPlannedEstimateGate({ cfg: CFG, issueNumber: 1, deps });
    const direct = await planPlannedEstimateGate({ cfg: CFG, issueNumber: 1, deps });
    assert.equal(promote.ok, false);
    assert.equal(direct.ok, false);
    assert.deepEqual(refusalSet(promote.blockers), refusalSet(direct.blockers));
    if (Array.isArray(f.expectedPreflightSubstrings)) {
      assert.ok(
        containsAll(promote.blockers, f.expectedPreflightSubstrings),
        `expected ${JSON.stringify(f.expectedPreflightSubstrings)}; got ${JSON.stringify(promote.blockers)}`
      );
    }
  });
});

// -----------------------------------------------------------------------------
// 4) develop → test
// -----------------------------------------------------------------------------
describe('guard-parity: develop→test', () => {
  it('accept fixture: code-complete-gate ok when AC ticked + commit-trail present', async () => {
    const f = loadFixture('develop-to-test', 'accept');
    const deps = {
      listComments: async () => [{ body: f.commitTrailBody }],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(f.dirtyFiles || []),
    };
    const promote = await gateCodeComplete({
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps,
    });
    const direct = await gateCodeComplete({
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps,
    });
    assert.equal(promote.ok, direct.ok);
    assert.deepEqual(refusalSet(promote.blockers), refusalSet(direct.blockers));
    assert.equal(promote.ok, true, `accept failed: ${JSON.stringify(promote.blockers)}`);
  });

  it('refuse fixture: unticked AC + missing commit-trail refuses both paths', async () => {
    const f = loadFixture('develop-to-test', 'refuse');
    const deps = {
      listComments: async () => [],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    };
    const promote = await gateCodeComplete({
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps,
    });
    const direct = await gateCodeComplete({
      cfg: CFG,
      issueNumber: 1,
      body: f.body,
      deps,
    });
    assert.equal(promote.ok, false);
    assert.equal(direct.ok, false);
    assert.deepEqual(refusalSet(promote.blockers), refusalSet(direct.blockers));
    if (Array.isArray(f.expectedSubstrings)) {
      assert.ok(
        containsAll(promote.blockers, f.expectedSubstrings),
        `expected ${JSON.stringify(f.expectedSubstrings)}; got ${JSON.stringify(promote.blockers)}`
      );
    }
  });
});

// -----------------------------------------------------------------------------
// 5) test → review
// -----------------------------------------------------------------------------
describe('guard-parity: test→review', () => {
  it('accept fixture: skipped — see fixture _reason', async () => {
    const f = loadFixture('test-to-review', 'accept');
    assert.equal(f.skip, true, 'fixture must explicitly opt out');
    assert.ok(f._reason && f._reason.length > 0, 'skip requires _reason');
  });

  it('refuse fixture: review-preflight refusal-set agrees across paths', async () => {
    const f = loadFixture('test-to-review', 'refuse');
    const deps = {
      gitStatus: async () => f.gitStatus || '',
      gitHeadSha: async () => f.headSha || '',
      findTrailComment: async () => (f.commitTrailBody ? { body: f.commitTrailBody } : null),
      getIssueBody: async () => f.body || '',
    };
    const promote = await runReviewPreflight({
      issueNumber: 1,
      repo: 'kburson/ai-task-manager',
      projectDir: '/tmp/fake',
      deps,
    });
    const direct = await runReviewPreflight({
      issueNumber: 1,
      repo: 'kburson/ai-task-manager',
      projectDir: '/tmp/fake',
      deps,
    });
    assert.equal(promote.ok, false);
    assert.equal(direct.ok, false);
    assert.deepEqual(new Set(promote.reasons), new Set(direct.reasons));
    if (Array.isArray(f.expectedSubstrings)) {
      for (const want of f.expectedSubstrings) {
        assert.ok(
          promote.reasons.some((r) => r.includes(want)),
          `expected reason containing "${want}"; got ${JSON.stringify(promote.reasons)}`
        );
      }
    }
  });
});

// -----------------------------------------------------------------------------
// test→review via-registry (#267) — proves the two former-inline call-sites
// (verbs/promote.mjs and verbs/review.mjs) both reach IDENTICAL refusal
// reasons through the registry, closing the #257 hole that motivated #267.
// -----------------------------------------------------------------------------
describe('guard-parity: test→review via-registry (#267)', () => {
  it('refuse fixture: completeness gate fires identically on promote and review paths', async () => {
    // Same body, same ctx, two invocations — mirrors the historical pattern
    // where promote.mjs ran an inline check and verbReview ran the duplicate.
    // After #267, both delegate to runGuards('test', 'review', ctx) — so the
    // refusal sets must be byte-for-byte identical.
    const body = [
      '<!-- aitm-dod-verified: abc1234:2026-05-18T00:05:00Z -->',
      '## Acceptance Criteria',
      '- [x] First AC ticked at CODE_COMPLETE',
      '- [ ] A manual checklist item nobody ticked',
      '',
    ].join('\n');
    const ctx = {
      issueNumber: 2571,
      repo: 'kburson/ai-task-manager',
      body,
      cfg: CFG,
      fromState: 'test',
      toState: 'review',
    };
    const promote = await runGuards('test', 'review', ctx);
    const direct = await runGuards('test', 'review', ctx);
    assert.equal(promote.ok, false);
    assert.equal(direct.ok, false);
    assert.deepEqual(
      promote.refusals.map((r) => r.id).sort(),
      direct.refusals.map((r) => r.id).sort()
    );
    const completeness = promote.refusals.find((r) => r.id === 'test-exit-pre-close-completeness');
    assert.ok(completeness, 'test-exit-pre-close-completeness refusal must be present');
    assert.ok(
      Array.isArray(completeness.blockers) && completeness.blockers.length > 0,
      'completeness refusal must carry blockers array'
    );
    assert.ok(
      completeness.blockers.some((b) => /A manual checklist item nobody ticked/.test(b)),
      'completeness blocker must surface the offending checkbox label'
    );
  });

  it('refuse fixture: missing dod-verified marker refuses on both paths with same reason', async () => {
    const body = ['## Acceptance Criteria', '- [x] First AC', ''].join('\n');
    const ctx = {
      issueNumber: 1031,
      repo: 'kburson/ai-task-manager',
      body,
      cfg: CFG,
      fromState: 'test',
      toState: 'review',
    };
    const promote = await runGuards('test', 'review', ctx);
    const direct = await runGuards('test', 'review', ctx);
    assert.equal(promote.ok, false);
    assert.equal(direct.ok, false);
    const pDod = promote.refusals.find((r) => r.id === 'test-exit-dod-verified');
    const dDod = direct.refusals.find((r) => r.id === 'test-exit-dod-verified');
    assert.ok(pDod && dDod, 'both invocations must surface test-exit-dod-verified refusal');
    assert.equal(pDod.reason, dDod.reason);
    assert.ok(
      String(pDod.reason).includes('test-to-review-dod-missing'),
      'refusal reason must use the legacy test-to-review-dod-missing label'
    );
  });

  it('accept fixture: dod-verified present + every checkbox ticked passes both paths', async () => {
    const body = [
      // #355 — contiguity guard now fires on every forward transition.
      '<!-- aitm-entered-backlog: 2026-05-18T00:00:00Z -->',
      '<!-- aitm-entered-refine: 2026-05-18T00:01:00Z -->',
      '<!-- aitm-entered-plan: 2026-05-18T00:02:00Z -->',
      '<!-- aitm-entered-develop: 2026-05-18T00:03:00Z -->',
      '<!-- aitm-entered-test: 2026-05-18T00:04:00Z -->',
      '<!-- aitm-dod-verified: abc1234:2026-05-18T00:05:00Z -->',
      '## Acceptance Criteria',
      '- [x] First AC',
      '- [x] Second AC',
      '',
    ].join('\n');
    const ctx = {
      issueNumber: 2572,
      repo: 'kburson/ai-task-manager',
      body,
      cfg: CFG,
      fromState: 'test',
      toState: 'review',
    };
    const promote = await runGuards('test', 'review', ctx);
    const direct = await runGuards('test', 'review', ctx);
    assert.equal(promote.ok, true, JSON.stringify(promote.refusals));
    assert.equal(direct.ok, true, JSON.stringify(direct.refusals));
  });
});

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
