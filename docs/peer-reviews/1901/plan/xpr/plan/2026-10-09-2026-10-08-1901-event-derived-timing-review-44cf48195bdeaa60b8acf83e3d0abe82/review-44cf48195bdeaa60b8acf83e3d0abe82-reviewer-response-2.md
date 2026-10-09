<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-44cf48195bdeaa60b8acf83e3d0abe82"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "bcdb2b293df6d81d973ef9bcec4157dfd0b81dff"
artifact_blob: "a43a0aaeeceacfe53b93d08819049e1cb1105541"
artifact_digest: "sha256:718deac13d692a30be2ea6cea7c8f1d5d98f953d7fbd5ed4f216c1f0f4167984"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5"
  identity_source: "runtime"
started_at: "2026-10-09T02:18:47.881Z"
submitted_at: "2026-10-09T03:10:36.110Z"
finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Decision: revisions-requested. The revision is substantial and mostly resolves round 1. One residual gap in R1-F001 and one stale ownership sentence remain.

I re-read the complete revised 659-line plan and the author's turn-1 response, then re-checked current source. I ran no shell, Git or test commands, so I made no independent byte-hash of the artifact.

Verification of round-1 dispositions:

- **R1-F001, partially resolved.** The startup/release/guest/orphan/compaction decision table (lines 112–119) and the `classifySessionOwnership` contract (line 121) answer each sequence I raised. `lib/actor-hook-timing.mjs` is now Task 4-owned. Expected deferrals are nonfatal, and the same-worktree reviewer case is tested. The residual problem is R2-F001: the evidence sources that make release and takeover verifiable in production are still abstract, and fail-closed defaults turn the ordinary "next session" path into indefinite deferral.
- **R1-F002, resolved.** dispatch-prep and ensure-wave-parent go to Task 4, with a non-owning `orchestration-dispatch` role and the dispatch0/worker10/update20 regression (Session20/Active10/Idle0/unengaged10). That arithmetic is consistent with the wall-span formula. Every healer library and CLI I named is assigned to Task 9 with enabled-log `duration-model-source-repair-refused` dispositions. `entrypoints.mjs`, `help-data.mjs` and the #1558 admission fixture go to Task 10.
- **R1-F003, resolved.** Rollout `event_msg`/`token_count`/`info.last_token_usage.input_tokens` is now the primary Codex source, app-server capture is out of scope, aggregate/capacity substitutes are rejected, and the cached-input double-addition case is tested.
- **R1-F004, resolved.** Task 4 is split into Task 4 (producers, 14h), Task 5 (handoff/authority, 14h) and Task 6 (measurement, 8h). I re-derived the numbers. The children sum to 110 hours (12+10+12+14+14+8+12+8+12+8), plus 2 root hours gives 112. The six-wave critical path is max(12,10,8) + 12 + 14 + max(14,12) + max(8,12) + 8 = 72. The dependency edges are acyclic and consistent with the ranks.
- **R1-F005, resolved.** All requested minima now appear in the Task 4 and Task 7 verifiers. The enumerable focused-regression inventory rule (lines 137–139) covers the remainder.
- **R1-F006 through R1-F009, resolved.** The fixture verifier is offline, exact paths are in the adapter matrix, Task 7 owns the human-readable log-issue-time lines, and harness variables are bound in the examples.

I confirmed that every newly cited existing test file exists:
- `heal-timing-interval-cli`, `heal-timing-sweep` and `heal-timing-log-command`;
- `word-counter`, `word-counter-codex` and `word-counter-full-expansion`;
- `command-catalog-policy` and `command-catalog-parser-policy`;
- `coverage-dispatch-prep`, `dispatch-prep-inprocess` and `ensure-wave-parent`.

## Findings

### R2-F001 — Name the concrete production evidence that verifies departure release and authorizes takeover

Severity: high. Required.

Plan locations: line 72, line 74, line 80, the line 83 resolver contract, startup table rows 1, 2 and 4 (lines 114–117), Task 5 bullet 4 (line 438), and line 91's owner-only provenance rule.

The decision table now routes every non-handoff replacement through one of two gates.

- **Departure-successor gate.** "A's own canonical authenticated departure releases execution ownership." B "may acquire through kind=departure-successor after verifying exact release."
- **Authorized takeover gate.** This requires "retained actual operator authorization or genuine already authorized host/controller recovery decision."

The resolver is required to "fail-closed" on unavailable sources (line 438). The plan never names what concrete production evidence satisfies either gate, and its own constraints rule out the obvious candidates:

- Line 72 says "A readable actor/source ID, endpoint or matching human assignee is not release authority". So the actor marker on A's existing `pause`/`stop`/`switch-out` row cannot by itself authenticate the departure.
- Lines 75 and 83 say authority resolves to "retained genuine host binding/operation evidence". But line 91 keeps "native handles/transcript paths and exact authorization/binding receipts" as "owner-only local provenance". A successor in another worktree, on another host, or with a different provider generally cannot read A's local receipts. Even on the same host, the plan does not say which existing store holds them or whether B's process may read them.
- For takeover, the plan forbids "agent-authored approval prose, raw actor IDs and self-declared orphan status", requires "genuine user-origin or already authorized controller decision evidence", and gives no source. Current code has user-prompt hook surfaces (`hooks/on-user-prompt.mjs`, `hooks/codex-prompt-timestamp.mjs`, the #1558 direct-guidance admission), but the plan does not designate any of them, or anything else, as the user-origin authority. No existing "controller recovery decision" artifact is named either.

Here is the failure scenario under the plan as written. It is the most common real workflow. Session A works on #N and the terminal is closed without `/task pause`; A has no departure row. The user opens session B in the same worktree. Row 2 says SessionStart defers read-only with no recovery rows and no state change. The user then works in B for hours. Row 4 says presence is not authority, and the takeover resolver has no named authority source, so it fails closed. B's flushes and lifecycle rows are therefore contender-refused (line 355). The refusals are nonfatal, so they stay silent, and #N records no timing from B until someone finds a takeover authority the plan never defines. The same thing happens in the departure case whenever B cannot resolve A's owner-local receipts. Task 5 can satisfy every listed test with synthetic authority fixtures, which line 85 explicitly allows, while production has no satisfiable path.

Required:

1. Name the exact existing (or explicitly newly created, Task-owned) production evidence source for each gate.
   - Departure-successor: what B verifies, where it lives, and how B reads it across worktree/host/provider boundaries without exposing owner-only handles. Alternatively, state explicitly that the canonical Timing Log row plus a specified verifiable property is sufficient, and reconcile that with line 72.
   - Takeover: which user-origin artifact counts, for example a specific user-prompt hook receipt for an explicit `/task #N` or `timing-handoff recover` command, which component writes it, and how replay or model-forgery is excluded.
2. State the operator-visible behavior when B is deferred or refused: the exact message, the next command, and whether B's subsequent flushes are journaled for later admission or permanently dropped.
3. Add a Task 4/5 end-to-end test of the dominant path using the real resolver with production-shaped (not synthetic-authority) inputs:
   - A closes without pause;
   - B starts and is deferred;
   - the user issues the sanctioned command;
   - the takeover receipt is admitted;
   - B's later bounded work is recorded while A's tail stays unavailable.

   Add the analogous cross-worktree departure-successor case.

If the intended answer is that only same-host, same-worktree replacement is supported in this defect, state that scope limit and its operational consequence in the amendment.

### R2-F002 — Remove the stale Task 4 test-ownership sentence

Severity: low. Required, because the plan states that ownership is strict and that the amendment overrides conflicting task text.

Line 100 still ends: "newly named handoff/journal/measurement tests are Task 4 owned". After the split, Task 5 creates `timing-handoff*.test.mjs` (line 431) and Task 6 creates `timing-measurement.test.mjs` and `transcript-normalizer.test.mjs` (line 471). Hydration could hand those test files to two owners. Change the sentence to name Task 5 and Task 6 respectively.

## Required changes

1. Resolve R2-F001: name the concrete production authority and release-evidence sources, define deferred and refused operator behavior and journaling, and add production-shaped end-to-end tests for the closed-without-pause takeover and cross-worktree departure-successor paths. Alternatively, state an explicit supported-scope limit.
2. Resolve R2-F002: correct line 100's ownership of handoff and measurement tests to Tasks 5 and 6.

## Optional suggestions

### R2-F003 — Seed Task 10's verifier with the existing registration suites

The Focused regression inventory rule will pick these up at hydration, but listing them now makes the Task 10 minimum match its stated ownership. The suites are:
- `unit/task-tracker/lib/executable-entrypoint-classification.test.mjs`
- `integration/task-tracker/lib/guidance-admission.test.mjs`, which reads the #1558 admission surface
- `unit/task-tracker/verbs/help.test.mjs`
- `integration/task-tracker/verbs/help.test.mjs`

### R2-F004 — Use the full path for hook-handler in Task 4 Files

Task 4 Files (line 391) lists bare `hook-handler.mjs`, while every other entry uses a full repository path, as the adapter matrix does. Use `scripts/task-tracker/hook-handler.mjs` for consistency with the R1-F007 resolution.

## Decision

revisions-requested
