---
name: reference_ac_stamp_then_ensurechecked_tick
description: ac-stamp records AC evidence but does NOT tick the box; ensureChecked is the tick step and passes the evidence gate once the stamp exists
metadata: 
  node_type: memory
  type: reference
  originSessionId: 02ceb278-fa2f-4926-8fc2-1bca62535b8f
---

`ac-stamp "<exact label>"` RUNS the AC's declared verifier (resolving `vc:N` → command) and upserts an `aitm-ac-evidence`/run-props marker onto the AC's `aitm-verified` marker — but it leaves the checkbox `- [ ]`. It records proof; it does not tick.

The Develop→Test gate `gateCodeComplete` (code-complete-gate.mjs) requires `ac.checked === true`, so stamping alone leaves the promote blocked with `code-complete-ac-unticked` for every AC.

The sanctioned tick step is `ensureChecked "<exact label>"` (check.mjs). Its evidence gate `gateEvidenceTick` (line ~407) refuses an AC tick carrying `aitm-verified-by` ONLY when there is no `aitm-ac-evidence:<key>` stamp. So: **ac-stamp first (real green run), then ensureChecked** — the gate passes on the real stamp, no fabrication, no `--allow-unverified-ticks` needed.

`autoTickVerified` (auto-tick-verified.mjs) is a DIFFERENT path — it flips AC boxes only against a live sandbox `passed` command set (Test-stage), not from persisted ac-stamp evidence. Don't wait for it at Develop; use ensureChecked.

Order for a demonstrable AC at Develop→Test: run verifier green → `ac-stamp "<label>"` → `ensureChecked "<label>"` → `promote`. Labels must be EXACT stripped-label equality; loop from a saved labels file with `while IFS= read -r line` to avoid shell re-scanning backtick-laden AC text. See [[reference_vc_list_cmd_consumer_parity]], [[feedback_dod_stamp_vs_ac_stamp]].
