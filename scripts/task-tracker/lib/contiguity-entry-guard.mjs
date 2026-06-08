// Contiguity entry guard (#252, parent epic #259 / story #355).
//
// Migrated out of the inline block at `scripts/gh/move-state.mjs` L519-563
// into the state-keyed registry. Registered as an `entryGuards` entry on
// every forward state (`backlog`, `refine`, `plan`, `develop`, `test`,
// `review`) so `runGuards(fromState, toState, ctx)` fires it on every
// forward transition.
//
// Wraps `evaluateContiguity` from `lib/stage-entry-markers.mjs` — the pure
// decision function whose action enum (`skip` | `allow` | `refuse` |
// `bypass`) is the single source of contiguity truth. Backward / rework
// transitions resolve to `skip` and never block. The `force` bypass is
// surfaced via `ctx.force === true` (kept for parity with the inline
// block's audit log; today no caller sets it through the registry).
//
// The host (`scripts/gh/move-state.mjs`) recognizes a refusal carrying
// `id === 'contiguity-entry'` and emits the preserved banner + recovery
// bullets + `process.exit(6)` byte-for-byte identical to the legacy inline
// block. Presentation stays in the host; the registry stores intent only.
//
// Context contract:
//   { fromState: string, toState: string, body: string,
//     issueNumber?: number, force?: boolean }
// Fail-open when `fromState`/`toState`/`body` missing.

import { evaluateContiguity } from './stage-entry-markers.mjs';

export const GUARD_ID = 'contiguity-entry';

export const contiguityEntryGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (!ctx || typeof ctx.body !== 'string') return { ok: true };
    if (!ctx.fromState || !ctx.toState) return { ok: true };
    const verdict = evaluateContiguity({
      fromState: ctx.fromState,
      toState: ctx.toState,
      body: ctx.body,
      force: ctx.force === true,
    });
    if (verdict.action === 'refuse') {
      return {
        ok: false,
        reason: verdict.message,
        blockers: (verdict.missing || []).map((s) => `aitm-entered-${s}`),
      };
    }
    return { ok: true };
  },
};
