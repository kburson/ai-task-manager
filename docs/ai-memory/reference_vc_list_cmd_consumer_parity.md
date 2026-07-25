---
name: reference_vc_list_cmd_consumer_parity
description: "Every AC-citation consumer must honor BOTH vc-list and cmd until cmd is retired; auto-tick was the one that lagged (#803)."
metadata: 
  node_type: memory
  type: reference
  originSessionId: afadefe0-cb5c-4159-ae69-a56fdd266e1f
---

The canonical AC↔Verification-Command citation is `vc-list="vc:N"` (#774, mandated at the Refine-exit guardrail by #773). Until the legacy `cmd=` form is fully retired (see [[project_harden_to_vc_list_retire_cmd]]), **every consumer that resolves an AC's cited verifier must read `vc-list` first, then fall back to `cmd`** — mirroring `ac-evidence.mjs::extractCommands`.

Known consumers (all in `scripts/task-tracker/`):
- `lib/ac-evidence.mjs` `extractCommands` — reference implementation of the two-branch resolve.
- `lib/proof-marker.mjs` `resolveVerifiedBy` — verifier-*presence* check.
- `lib/refine-to-plan-gate.mjs` — Refine-exit guardrail (deprecates `cmd`, requires `vc-list`).
- `lib/auto-tick-verified.mjs` — **lagged**: read only `props.cmd`; fixed in #803 (sha d7f4b98) to resolve `props['vc-list']` via `resolveVcRefCommands`.

Resolvers live in `lib/vc-ref.mjs`: `resolveVcRefCommands(vcListValue, vcItems)` for by-id `vc:N`; `resolveCitedOrLiteralCommands(cmdValue, vcItems)` for the legacy `cmd` (citation or embedded literal).

**Trap:** a `vc-list`-cited AC that a consumer can't read silently fails — it passes the presence check but never auto-ticks, so Develop→Test refuses with a misleading `code-complete-ac-unticked`. When adding a new AC-citation consumer, grep for the `vc-list`/`cmd` two-branch pattern and replicate it.
