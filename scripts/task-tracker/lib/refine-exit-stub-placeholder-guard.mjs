// Refine-exit guard: stub TBD placeholder check (#450).
//
// Stub issues are created with two placeholder strings in their body:
//   1. AC placeholder:   "- [ ] _TBD — define acceptance criteria at Refine._"
//   2. Plan Metadata:    "_TBD — set Size, Estimate, Priority, and Rank at Refine._"
//
// Neither should survive to the refine→plan transition. If either placeholder
// is still present when promote runs, the issue was not properly refined.
//
// Reached through `runGuards('refine', 'plan', ctx)` invoked by promote.mjs
// and `scripts/gh/move-state.mjs`. Surfaces at verb level as
// `refine-stub-placeholder-refused` via the `REFUSAL_ID_TO_STATUS` mapping.
//
// Context contract:
//   { toState?: string, body?: string }
//
// Fail-open when ctx is missing or `toState` is not `plan`.

export const GUARD_ID = 'refine-exit-stub-placeholder';

export const STUB_AC_PLACEHOLDER = '_TBD — define acceptance criteria at Refine._';
export const STUB_PLAN_META_PLACEHOLDER =
  '_TBD — set Size, Estimate, Priority, and Rank at Refine._';

export const refineExitStubPlaceholderGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (!ctx) return { ok: true };
    if (ctx.toState && ctx.toState !== 'plan') return { ok: true };
    const body = typeof ctx.body === 'string' ? ctx.body : '';
    const blockers = [];
    if (body.includes(STUB_AC_PLACEHOLDER)) {
      blockers.push(
        'stub AC placeholder still present — replace "TBD — define acceptance criteria at Refine" with substantive acceptance criteria before promoting'
      );
    }
    if (body.includes(STUB_PLAN_META_PLACEHOLDER)) {
      blockers.push(
        'stub Plan Metadata placeholder still present — replace "TBD — set Size, Estimate, Priority, and Rank at Refine" with substantive plan metadata before promoting'
      );
    }
    if (blockers.length === 0) return { ok: true };
    return { ok: false, reason: blockers[0], blockers };
  },
};
