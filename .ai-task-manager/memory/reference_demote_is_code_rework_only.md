---
name: reference_demote_is_code_rework_only
description: "demote-to-develop hard-refuses without --rework; to re-run a stage's validation, re-invoke the stage verb in place — never demote"
metadata:
  node_type: memory
  type: reference
  originSessionId: ed015768-b46c-4bdd-9e5e-4770604ad3ee
  modified: 2026-07-23T00:44:20.635Z
---

To re-run a stage's validation (e.g. an issue parked in Review whose Agent Review pass-marker never got stamped), **re-invoke the stage verb in place** (`task review`, `task test`) — it is idempotent and re-executes that stage's validation and re-stamps the marker. Do NOT demote back through the chain to re-drive it; that wastes time and tokens.

`demote`-to-`develop` is a CODE-REWORK path and nothing else. As of #935 (trunk e0bc62f, 2026-07-22), `runDemote` hard-refuses (status `rework-required`, exit 4) unless the caller declares a code-change need via a non-empty `--rework "<reason>"`. The refusal fires **before** any network fetch or board move; its message names re-invoking the stage verb as the in-place fix. The reason threads into `move-state.mjs --demote-reason` onto the `demoted:<state>` timing row.

Layer 1 companion: the bind paths (`resume` no-arg, `resume #N`, `switch`) surface a review-remediation hint when binding to a `review`-state issue whose Agent Review gate carries no pass-evidence marker (`lib/review-remediation-hint.mjs`, keys on `isAgentReviewComplete`, not the bare checkbox).

Related: [[reference_demote_stale_evidence_reverify_recipe]], [[reference_agent_review_gate_legacy_close]].
