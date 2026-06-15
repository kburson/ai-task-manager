// Plan-exit guard: Verification-Commands section present (#386, spike #402).
//
// Root cause this closes: the plan→develop transition had NO guard asserting a
// `## Verification Commands` section exists. The only VC-aware rule
// (`verification-commands` ALL_CHECKED_RULE in lib/body-gates.mjs) is not run at
// plan→develop, and is structurally vacuous on an absent heading
// (`evaluateAllCheckedRule` returns null when the heading is missing). A no-VC
// body therefore cleared plan→develop unchallenged and then dead-ended the
// gate-first `test` verb at "nothing to verify".
//
// This guard refuses plan→develop when the body has no `## Verification
// Commands` section with >= 1 parseable `- [ ] `command`` entry. It deliberately
// ignores checked/unchecked state — items are not executed until `test`, so
// requiring them checked at plan-exit would be wrong; the `test` verb auto-ticks
// from passing sandbox evidence before review-entry.
//
// Reached via `runGuards('plan', 'develop', ctx)`. Mirrors
// plan-exit-deep-dive-guard.mjs: body-only (no network), fail-open when ctx.body
// is undefined so we don't mask other guards' real reasons.
//
// Context contract:
//   { body: string, toState?: string }
//
// Presence is defined by `parseVerificationCommands` — the exact parser the
// `test` runner consumes — so a section the parser cannot read is, correctly,
// treated as absent.

import { parseVerificationCommands } from './verification-commands.mjs';

export const GUARD_ID = 'plan-exit-vc-presence';

export const planExitVcPresenceGuard = {
  id: GUARD_ID,
  run(ctx) {
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    if (!ctx || typeof ctx.body !== 'string') return { ok: true };
    const entries = parseVerificationCommands(ctx.body);
    if (entries.length >= 1) return { ok: true };
    const blocker =
      'plan-develop-verification-commands-missing: body must contain a ' +
      '`## Verification Commands` section with at least one parseable ' +
      '`- [ ] `command`` entry before plan→develop — seed it (creation-time ' +
      'seeding shipped in #410; pre-#410 issues need a back-fill) so the ' +
      '`test` verb has commands to run.';
    return { ok: false, reason: blocker, blockers: [blocker] };
  },
};
