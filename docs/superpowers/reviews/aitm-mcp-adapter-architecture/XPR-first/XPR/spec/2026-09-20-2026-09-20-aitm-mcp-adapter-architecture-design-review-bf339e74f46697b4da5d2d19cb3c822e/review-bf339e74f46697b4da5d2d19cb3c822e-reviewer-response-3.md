<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-bf339e74f46697b4da5d2d19cb3c822e"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
artifact_commit: "09551213ec6ee18e90d2d6d39f3fff00e9ade055"
artifact_blob: "0050040de99db597a29b1c6d84eeefafdc780201"
artifact_digest: "sha256:1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:7269798814f6e42c7dbd35031039451c136e87664d5bf2159f1e59823321f699"
  identity_source: "declared"
started_at: "2026-09-20T21:48:53.667Z"
submitted_at: "2026-09-20T22:06:31.126Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the revised artifact at blob `0050040d` (commit `09551213`,
digest `sha256:1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e`)
against Author response 2, my round-2 finding, and my three round-2 optional
suggestions. I also re-read the round-1 answer regions to confirm the round-3
edits introduced no regression there.

**R2-F001 is resolved.** The author chose the exclusive routing rule and stated
it unambiguously. Lines 355-359 now read: "This route is exclusive: an action
with a dedicated typed tool is rejected by `aitm_invoke_action`, even if the host
disables or withholds permission for that typed tool. The registry assigns each
externally callable core action exactly one MCP invocation route, which discovery
reports." That settles the scope question, and the explicit withheld-typed-tool
clause closes the approval-surface bypass I was concerned about — a host that
declines to grant `aitm_close` genuinely blocks `work-item.close`, rather than
having it reachable through a broad generic grant.

The parity language is reconciled rather than left inconsistent. Lines 892-899
now test each action through "CLI and its single registry-assigned MCP route",
and add the matching negative test: "For actions with a dedicated typed tool,
also prove that `aitm_invoke_action` rejects their IDs, including when the host
withholds that typed tool." Round-2's contradictory "both generic and typed
routes where present" is gone. The tiering rationale at lines 372-376 survives
intact and still carries the informed-approval requirement.

The choice itself is the more conservative of the two I offered. It preserves
per-tool host permissions without inventing a new host action-grant protocol, at
the cost that promoting an action to a typed tool is a route-visible change. The
spec accepts that cost explicitly by making discovery report the assigned route,
so an agent is never left guessing which tool to call.

All three round-2 optional suggestions were taken:

1. **Consequences** — Lines 1099-1102 add the non-CAS operational cost to the
   Negative list, naming the single serialized executor per coordinator grant,
   worktree and fleet sessions as submitters, maintainer-confirmed quiescent
   handoff, unavailable automatic failover, and the resulting coordination
   latency and operator responsibility. That is the trade-off I asked to have
   made visible to a reader who skims to Consequences.
2. **Acceptance criteria** — AC 5, 10, and 12 are amended to carry the bounded
   discovery contract, the declared-observability-class recovery rule with its
   "cannot satisfy actor-sensitive gates" clause, and the named strict mechanism
   with current attestation. New AC 15 covers scoped coordinators, epoch fencing,
   fail-closed conflicts, and the non-CAS serialized-executor and quiescence
   requirement; new AC 16 covers one registry-assigned MCP route per portable
   action with CLI parity and generic-route rejection of typed-tool actions. The
   AC list is again a faithful index of what acceptance means.
3. **Editorial** — The stray "; and" mid-list in the release gates is removed
   (line 927), and the recovery prose is rewrapped (lines 735-736).

No regression checks: the ADR 0002 relation and retained-mitigation enumeration
(lines 689-711), the concurrency and fencing rules, the mutation-observability
proof classes (lines 746-773), the strict-isolation mechanism (lines 840-862),
the version and `exports` baseline, and the vocabulary section are unchanged from
the text I verified in round 2.

The design is now internally consistent, states its limits honestly where it
cannot promise enforcement, and grounds its claims in what this checkout actually
provides — including the absence of CAS on GitHub issue-comment updates and the
inability of an agent with Bash and authenticated `gh` to claim strict. I have no
further required changes. Two low-severity observations are recorded below as
suggestions; neither blocks acceptance, and both can be folded into Phase 1 or 3
work rather than another review round.

Scope note: this acceptance covers the architecture document only. No kernel,
adapter, host bridge, conformance suite, or runtime test proposed in it has been
implemented or executed, and nothing here constitutes human approval,
implementation approval, or a decision to proceed to SPR/SAR.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. **Extension promotion is the one case the exclusivity rule does not name.**
   Line 383 says "An extension may be promoted to a typed tool without changing
   its domain contract." The exclusivity rule at lines 357-358 is written for
   core actions ("The registry assigns each externally callable **core** action
   exactly one MCP invocation route"), and the extension route's stated
   rejections at lines 384-385 are `orchestrator-only` identifiers and core
   action IDs — not promoted extensions. So a promoted extension could read as
   reachable both through its new typed tool and through `aitm_invoke_extension`,
   which would recreate the dual-route condition on the extension side. I do not
   think this is intended, and the general principle is already stated; it is one
   clause ("a promoted extension is likewise rejected by the extension route") or
   a rewording of 357 to cover every externally callable action rather than core
   actions specifically. Worth doing whenever this section is next touched, and
   worth an explicit negative test alongside the one added at lines 894-896.

2. **Two wrap artifacts remain in the revised sections.** Line 361 is now a
   ~115-column line ("verb to a canonical action or a documented host-local
   compatibility operation; Phase 3 must cover"), and line 898 breaks early
   ("The action inventory drives the coverage") leaving a short line mid-
   paragraph. Both are inside text edited this round. As noted previously,
   nothing enforces column width here — `.prettierrc.json` sets `printWidth: 100`
   with the default `proseWrap: "preserve"`, and `audit-line-cap.mjs` measures
   test-file length, not columns — so this is consistency with the surrounding
   document only.

## Decision

accepted
