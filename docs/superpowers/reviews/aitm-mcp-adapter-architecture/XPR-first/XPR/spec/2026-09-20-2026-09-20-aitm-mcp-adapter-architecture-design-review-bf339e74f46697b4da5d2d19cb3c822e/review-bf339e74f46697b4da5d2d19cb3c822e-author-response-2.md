<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-bf339e74f46697b4da5d2d19cb3c822e"
role: "author"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
artifact_commit: "718fc30a2791b9399f1ec37e2c15815633a74806"
artifact_blob: "11a64101687a823e5423c6592fecd523f54f3209"
artifact_digest: "sha256:69c3813323e010d70d3e97ca6ce4e5cbce65cc964a1123b582f6a45b861f2ee4"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:d9ed2486be1a86d7a3a8e60d0f84b083a8d1e3e2364c316fe5c18126f2576ed7"
  identity_source: "runtime"
started_at: "2026-09-20T21:48:14.761Z"
submitted_at: "2026-09-20T22:04:49.031Z"
finding_ids: []
answered_finding_ids: ["R2-F001"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Read the entire sealed round-2 report. It accepts the seven round-1 dispositions
and requests one new clarification. Revised the spec in response to R2-F001 and
its three optional consistency suggestions. The reviewed input is commit
`718fc30a2791b9399f1ec37e2c15815633a74806`, artifact SHA256
`69c3813323e010d70d3e97ca6ce4e5cbce65cc964a1123b582f6a45b861f2ee4`.

## Finding dispositions

### R2-F001 — Accepted; exclusive generic route selected

Verified the contradictory reading in the portable invocation and transport
parity sections. The definitive rule is now exclusive: a core action assigned a
dedicated typed tool cannot be addressed through `aitm_invoke_action`. The action
registry assigns exactly one MCP invocation route per externally callable core
action, and discovery exposes it. Withholding or disabling the typed tool does
not make the same action available through the generic tool.

This choice preserves separate host tool permissions without requiring a new
host action-grant protocol. Typed tools are described as dedicated projections
of selected canonical actions; the generic tool serves the remaining portable
vocabulary. The shared kernel policy and informed-approval requirements remain.
Parity compares each action's CLI route with its single MCP route, and negative
tests must reject typed-action IDs through the generic route even when the host
withholds the typed tool.

### Optional suggestions — All addressed

1. Added the non-CAS single-executor and quiescent-handoff operational cost to
   Negative consequences, including fleet/worktree submission and unavailable
   automatic failover without enforceable fencing.
2. Updated AC 5, 10, and 12 for bounded discovery, proof-class recovery, and the
   named strict mechanism. Added AC 15 for coordination/fencing and AC 16 for
   exclusive invocation routing and parity.
3. Removed the premature "and" in the release-gate list and wrapped the recovery
   prose identified in the report.

## Changes made

Only the spec and this generated response changed during the Author turn. No
runtime implementation or new runtime tests were written.

## Declined changes and rationale

None. The Reviewer explicitly permitted either exclusive or overlapping routes;
the spec now chooses exclusive and states its permission consequences.

## Verification

- Read the complete round-2 response and checked its cited spec sections.
- Exact-file Markdown lint and CSpell pass; targeted Prettier passes after the
  final prose formatting check.
- Six embedded JSON examples parse; local Markdown link targets exist.
- No schema implementation or future conformance execution is claimed.
- No additional broad repository check was repeated. No new tool failure or
  isolation breach was observed during this revision.
- Protocol submission records the new artifact digest and result commit. Review
  acceptance remains pending; no human approval or later SPR/SAR decision is
  inferred.
