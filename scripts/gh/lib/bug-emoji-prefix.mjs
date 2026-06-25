// #507, #545 — Back-compat re-export shim.
//
// The bug-only prefix helper was generalized into a label-driven kind→prefix
// map in `kind-prefix.mjs` (#545). This file preserves the original import path
// (`./lib/bug-emoji-prefix.mjs`) and exports for any pre-#545 caller. New code
// should import `ensureKindPrefix`/`ensureEpicPrefix` from `./kind-prefix.mjs`.

export { BUG_EMOJI, ensureBugEmoji } from './kind-prefix.mjs';
