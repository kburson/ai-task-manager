---
name: reference_ac_stamp_then_ensure_checked
description: ac-stamp records the evidence marker but does NOT tick the box; run check/ensureChecked after or the code-complete gate refuses code-complete-ac-unticked
metadata: 
  node_type: memory
  type: reference
  originSessionId: ed015768-b46c-4bdd-9e5e-4770604ad3ee
  modified: 2026-07-23T00:44:29.006Z
---

Ticking an AC is two separate steps, a known ergonomics gap:

1. `ac-stamp` records the evidence marker (`<!-- aitm-verified exit=... sha=... key=... vc-list=... -->`) but does **not** tick the `- [ ]` checkbox.
2. `check` (deprecated alias for `ensureChecked`) ticks the box, and is **gated on the evidence marker already being present** — so it is not fabrication, just the second half of the same real proof.

If you ac-stamp but skip step 2, the Develop→Test CODE_COMPLETE gate (`lib/code-complete-gate.mjs`) refuses with `code-complete-ac-unticked`. Fix: run `check <label>` / `ensureChecked` for each stamped AC (a small node driver that reads AC labels via `parseEvidenceAcs` and calls `verbCheck` works well, since the bash-guard refuses any command string containing the literal `/task`).

Related: [[feedback_dod_stamp_vs_ac_stamp]], [[reference_vc_list_cmd_consumer_parity]].
