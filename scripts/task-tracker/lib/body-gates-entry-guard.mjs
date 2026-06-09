// Body-gates entry guards for test/review/done (#359, parent epic #269).
//
// Migrated out of the inline composite at `scripts/gh/move-state.mjs`
// L249-363 into the state-keyed registry. The inline block ran the same
// three pure checks on entry to test/review/done; this module reifies them
// as three thin guards that all delegate to a single shared helper:
//
//   1. `validateBody(body, { gates })` — body-shape gates from
//      `lib/body-gates.mjs`. For test entry the `verification-commands`
//      rule is filtered out (parity with the inline block — the
//      auto-runner is what ticks those boxes at promote-to-test time).
//   2. `uncheckedPreCloseCheckboxes(body)` — done-entry only. Lifecycle
//      labels and close-owned labels are already excluded inside the
//      helper.
//   3. `assertLifecycleSatisfied({ body, required })` — done-entry only.
//      Reads `cfg.lifecycleCheckboxesRequired` from ctx; when `false`,
//      the call returns `{ block: false, missing }` and the guard
//      surfaces a non-refusing `warn` payload so the host can post the
//      legacy `lifecycle-warn` timing row.
//
// Refusal semantics mirror `planExitDeepDiveGuard`: blockers are joined
// with `; ` into `reason`, and the original array is exposed via
// `blockers` so the host can render aggregated banners. The host
// (`scripts/gh/move-state.mjs`) recognizes any refusal whose `id` begins
// with `body-gates-entry-` and posts the same fire-and-forget
// `gate-refused` timing row the inline block used to emit before
// `process.exit(4)`. Presentation drift vs. the inline block:
// runGuards' generic banner prefixes reasons with `#N is in <fromState>;`
// (the inline block omitted that prefix). #277/#336 accepted the same
// minor surface change when migrating `planExitDeepDiveGuard`; the slow
// suite's `/Refusing to move #108 to Review/` regex still matches.
//
// Context contract:
//   { toState: 'test'|'review'|'done', body: string, cfg?: { lifecycleCheckboxesRequired?: boolean } }
// Fail-open when `ctx.body` is missing (parity with the inline `if (body)` skip).

import { validateBody, DEFAULT_GATES } from './body-gates.mjs';
import { uncheckedPreCloseCheckboxes, assertLifecycleSatisfied } from '../close-gate.mjs';

const TEST_GATES = DEFAULT_GATES.filter((g) => g.name !== 'verification-commands');

function runValidateBody(body, gates) {
  const result = validateBody(body, { gates });
  if (result.ok) return [];
  return result.refusedRules.map((r) => `${r.rule}: ${r.reason}`);
}

export const TEST_GUARD_ID = 'body-gates-entry-test';
export const REVIEW_GUARD_ID = 'body-gates-entry-review';
export const DONE_GUARD_ID = 'body-gates-entry-done';

export const bodyGatesEntryGuardTest = Object.freeze({
  id: TEST_GUARD_ID,
  run(ctx) {
    if (ctx?.toState && ctx.toState !== 'test') return { ok: true };
    if (typeof ctx?.body !== 'string' || ctx.body === '') return { ok: true };
    const blockers = runValidateBody(ctx.body, TEST_GATES);
    if (blockers.length === 0) return { ok: true };
    return { ok: false, reason: blockers.join('; '), blockers };
  },
});

export const bodyGatesEntryGuardReview = Object.freeze({
  id: REVIEW_GUARD_ID,
  run(ctx) {
    if (ctx?.toState && ctx.toState !== 'review') return { ok: true };
    if (typeof ctx?.body !== 'string' || ctx.body === '') return { ok: true };
    const blockers = runValidateBody(ctx.body, DEFAULT_GATES);
    if (blockers.length === 0) return { ok: true };
    return { ok: false, reason: blockers.join('; '), blockers };
  },
});

export const bodyGatesEntryGuardDone = Object.freeze({
  id: DONE_GUARD_ID,
  run(ctx) {
    if (ctx?.toState && ctx.toState !== 'done') return { ok: true };
    if (typeof ctx?.body !== 'string' || ctx.body === '') return { ok: true };
    const blockers = runValidateBody(ctx.body, DEFAULT_GATES);

    const unchecked = uncheckedPreCloseCheckboxes(ctx.body);
    if (unchecked.length > 0) {
      blockers.push(`${unchecked.length} unchecked checkbox(es) in issue body`);
    }

    const required = ctx?.cfg?.lifecycleCheckboxesRequired !== false;
    const lifecycle = assertLifecycleSatisfied({ body: ctx.body, required });
    if (lifecycle.block) {
      blockers.push(lifecycle.reason);
      blockers.push('lifecycle-incomplete');
    } else if (!required && lifecycle.missing.length > 0) {
      // Warn-only path: surface non-refusing payload so the host can post
      // the same lifecycle-warn timing row the inline block emitted.
      const warn = {
        kind: 'lifecycle',
        labels: lifecycle.missing.map((m) => m.key),
      };
      if (blockers.length === 0) return { ok: true, warn };
      return { ok: false, reason: blockers.join('; '), blockers, warn };
    }

    if (blockers.length === 0) return { ok: true };
    return { ok: false, reason: blockers.join('; '), blockers };
  },
});

export const BODY_GATES_ENTRY_GUARD_IDS = Object.freeze([
  TEST_GUARD_ID,
  REVIEW_GUARD_ID,
  DONE_GUARD_ID,
]);
