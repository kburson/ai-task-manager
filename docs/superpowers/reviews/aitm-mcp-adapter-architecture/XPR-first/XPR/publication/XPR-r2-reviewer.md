---
model: "claude-opus-5"
effort: "medium"
filepath: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
commit_sha: "718fc30a2791b9399f1ec37e2c15815633a74806"
reviewed_file_sha256: "69c3813323e010d70d3e97ca6ce4e5cbce65cc964a1123b582f6a45b861f2ee4"
turn_ordinal: "XPR r2"
turn_description: "Cross Provider Review revision 2"
role: "reviewer"
source_file: "docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/XPR/spec/2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-bf339e74f46697b4da5d2d19cb3c822e/review-bf339e74f46697b4da5d2d19cb3c822e-reviewer-response-2.md"
source_sha256: "d692e22b30272e2788621ec8aa578a621a07edd8c802d649e0e860be5fb53494"
submitted_at: "2026-09-20T22:02:52.913Z"
---

Mode: `normal`

## Summary

I reviewed the revised artifact at blob `11a64101` (commit `718fc30a`,
digest `sha256:69c3813323e010d70d3e97ca6ce4e5cbce65cc964a1123b582f6a45b861f2ee4`)
against Author response 1 and my round-1 findings, re-checking each disposition
against the revised spec text and the implementation in this checkout.

All seven round-1 findings are resolved, and all three optional suggestions are
addressed. The revision is substantive rather than cosmetic, and several answers
are stronger than what I asked for.

Verified resolutions:

- **R1-F001** — `aitm_invoke_action` added (lines 351-373) covering portable
  actions without typed tools, with exact action ID, schema version, capability
  fingerprint, re-checked live preconditions, and separate core/extension
  registries. The extension route now explicitly rejects core IDs and
  `orchestrator-only` IDs by server policy (lines 380-381). Transport parity is
  widened from "common actions" to every externally callable portable action with
  an inventory-driven coverage matrix and a release failure for gaps
  (lines 885-892). Phase 1 now maps every CLI verb to a canonical action or a
  documented host-local compatibility operation (lines 935-936).
- **R1-F002** — Resolved, and resolved honestly. The ADR 0002 section now
  enumerates all nine required mitigations by name and retains them, including
  scoped coordinators and epoch-fenced grants (lines 685-707). The new
  "Concurrency and fencing" section (lines 770-801) states plainly that GitHub
  issue-comment updates in this checkout provide no CAS, that reread-around-append
  is detection rather than exclusion, that a non-CAS coordinator grant requires
  one active serialized executor, that a timeout is not proof of quiescence, that
  automatic failover is unavailable without an enforceable fencing mechanism, and
  that local worktree locks cannot prove cross-clone exclusion. The project
  control stream is made a governed scope with its own coordinator, and worktree
  and fleet sessions submit rather than advance its accepted head. This is the
  right answer and it does not overclaim what the current code does.
- **R1-F003** — The "Mutation observability" section (lines 741-768) adds the
  four-class taxonomy with per-class recovery outcomes. The author correctly
  declined my "value-attributable" label and replaced it with a stricter
  "exclusively attributable transition" class that requires provider audit
  identity or an enforced exclusive-writer boundary. Line 763-766 states the key
  point explicitly: an AITM coordinator serializes governed actors but does not
  exclude humans or other provider clients, so ProjectV2 `Status`, labels,
  assignees, and milestones default to state-only observability. The
  `state-satisfied` / `attribution: unknown` / `execution: unknown` outcome, and
  the rule that it cannot satisfy an actor-sensitive gate, closes the gap I
  raised. Line 731 is updated to match.
- **R1-F004** — Version baseline is now explicit (lines 215-232): the examples
  are labelled as the planned first stable release, the current `0.1.0` state is
  stated, Phases 1-4 stay on `0.x`, Phase 5 publishes core `1.0.0` with adapter
  ABI `1` behind its gates, and Phases 6-7 target compatible `1.x`. Peer range and
  `coreApi` are declared independently binding with neither overriding the other.
  The `exports` map, `files` inclusion, and a packed-package consumer fixture that
  must reject unexported internals are Phase 5 deliverables (lines 227-232,
  978-983) with a matching release gate (line 923). Declining my illustrative
  `2.0.0` in favor of `^1.0.0` is correct; I asked for a stated baseline, not a
  particular number.
- **R1-F005** — `strict` now names a mechanism (lines 835-857): agent process
  tree sandboxed without provider write secrets or credential-helper access, a
  separately isolated executor holding credentials, egress rules, a single
  validated action-boundary write route, host attestation bound to process tree
  and policy fingerprints, positive and negative probes that corroborate rather
  than prove an unbounded negative, strict disabled on attestation expiry or
  boundary change, and boundary fingerprints in receipts. It states that the first
  host-bridge release defaults to guarded or behavioral, that an agent with Bash
  and authenticated `gh` cannot report strict, and that unsetting `GH_TOKEN` is
  insufficient. A release gate backs it (line 926).
- **R1-F006** — New "Vocabulary and existing host integrations" section
  (lines 172-181) fixes external-system adapter versus agent-host bridge, names
  `scripts/providers/provider-adapter.mjs` directly, schedules migration to
  `AgentHostBridge` with compatibility exports, and declines a bulk rename of
  verification-provider and delivery-provider concepts. Phase 1 carries the work
  (lines 937-938).
- **R1-F007** — Discovery is now a bounded summary subset with the example
  corrected (lines 436-444), and lines 446-455 add the 50-action / 32-KiB
  inclusive cap, mandatory pagination, filters, query- and
  fingerprint-bound cursors, structured stale-cursor restart, schema length
  bounds, oversize-record validation failure, and the same contract on the
  capabilities resource, with a release gate (line 922).
- **Optional suggestions** — All three landed: reference-evidence limits and
  Git object-ID recording (lines 673-683), typed-reference retention across
  binding generations and renames (lines 678-683), and per-phase setup operation
  IDs, fingerprints, read-back, staged activation, and truthful partial-failure
  handling (lines 533-547, 1017-1020).

One new issue remains, introduced by the R1-F001 revision. It is narrow and
one-sentence-fixable, but it sits on a governance boundary the architecture
exists to protect, so I am not accepting on this turn.

## Findings

### R2-F001 — The scope of `aitm_invoke_action` relative to the seven typed tools is stated two contradictory ways

Line 353 scopes the generic tool exclusively: "`aitm_invoke_action` invokes
portable core actions **without a dedicated typed tool**". Read normatively, an
action that has a typed tool is not reachable through the generic route.

Line 355 and line 887 read the other way. Line 355 calls the seven typed tools
"convenience projections, not the complete portable vocabulary", which implies
the typed tools are surface sugar over portable actions that the generic route
also addresses. Line 887-888 then requires parity testing of every externally
callable portable action "including both generic and typed routes **where
present**" — which only has meaning if some actions are reachable both ways.

The two readings have materially different security properties, and the
difference is exactly the kind of structural bypass Goals 3 and 9 exist to
prevent:

- Under the exclusive reading, a host that grants `aitm_invoke_action` gains
  access only to actions that were never given a distinct approval surface, and
  the seven typed tools retain independently grantable host permissions.
- Under the overlapping reading, granting `aitm_invoke_action` transitively
  grants `work-item.close`, `work-item.deliver`, and every other typed-tool
  action, because MCP host permission models key on tool names. A host operator
  who deliberately withheld `aitm_close` would have it reachable anyway.

The spec partially anticipates this. Lines 368-372 require the generic route to
supply runtime intent and effects, require a host that cannot display that detail
to use a governed approval flow or refuse, and state that "Generic invocation
never converts a broad tool permission into approval for its payload's effects."
That is a good mitigation and I would keep it. But it is a behavioral requirement
on the host and the approval flow; it does not settle whether the typed-tool
actions are inside the generic route's addressable set, and the parity gate at
line 892 ("missing invocation coverage is a release failure, not an exemption")
will be interpreted differently depending on which reading is authoritative.

This needs one decision recorded in the spec, not two compatible-sounding
sentences. Either reading is defensible; I am not asking for a particular one.

If the overlapping reading is intended, the spec should also say how a host is
expected to express a narrower grant than "all portable actions", since that is
the practical consequence for the `guarded` enforcement level.

## Required changes

1. **(R2-F001)** State authoritatively whether `aitm_invoke_action` may address
   actions that also have a dedicated typed tool. Reconcile lines 353, 355, and
   887-888 so they express one rule. If the generic route is exclusive, say so
   and adjust the parity language at line 888 accordingly. If it is overlapping,
   correct line 353, and state how a host expresses a grant narrower than the
   full portable vocabulary — including what `guarded` enforcement is expected to
   do when an agent reaches a typed-tool action through the generic route.

## Optional suggestions

1. **Record the non-CAS serialized-executor constraint in Consequences.** The new
   rule at lines 781-790 — one active serialized executor per coordinator grant,
   no automatic failover, maintainer-controlled quiescent handoff — is a real
   operational cost for a project that routinely runs linked worktrees and fleet
   sessions (`scripts/task-tracker/cut-child-worktree.mjs`,
   `scripts/task-tracker/fleet-registry.mjs`). The Negative list at lines 1074-1085
   still reads as though conditional-update absence is only an external-authority
   inconvenience. Adding a bullet would keep the trade-off visible to a reader who
   skims to Consequences.

2. **Acceptance criteria were not updated alongside the new contracts.** The
   revision adds four substantial requirements — mutation-observability proof
   classes, single-executor fencing on non-CAS adapters, the bounded discovery
   contract, and the named strict-isolation mechanism. Release gates
   (lines 913-926) cover all four, so nothing is unenforced, but the 14 acceptance
   criteria (lines 1031-1060) are unchanged from the pre-review version. AC 10 and
   AC 12 in particular now understate their sections. Consider adding or amending
   criteria so the AC list remains a faithful index of what acceptance means.

3. **Two editorial artifacts of the revision.** Line 920 ends with "; and" but is
   followed by five more bullets, leaving a stray conjunction mid-list in the
   release-gate enumeration. Line 731 is a single unwrapped ~110-column line in a
   document otherwise wrapped near 80. Neither is lint-enforced — `.prettierrc.json`
   sets `printWidth: 100` with the default `proseWrap: "preserve"`, so Prettier
   will not rewrap prose, and `scripts/tests/tools/audit-line-cap.mjs` measures
   test-file length rather than column width — so both are consistency-only.

## Decision

revisions-requested
