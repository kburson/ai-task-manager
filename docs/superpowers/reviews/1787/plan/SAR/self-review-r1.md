---
review_type: SAR
reviewer: Codex author, same session
filepath: docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md
commit_sha: f3f273458d7754445069acd75afe1cdc48a7bda4
reviewed_file_sha256: bc99bf69b290e06b90fbfd0c732c60827197852e49f692a4b14d30de19cac73a
uncommitted_changes: false
turn_ordinal: SAR r1
finding_count: 2
verdict: changes-required
---

# Delivery Waiver Plan SAR, Round 1

## Scope

Reviewed the entire committed [plan](../../../../plans/2026-09-24-1787-delivery-waiver.md)
against the accepted [spec](../../../../specs/2026-09-24-1787-delivery-waiver-design.md),
the workflow-exception authority/store/CLI, delivery records/verifier/verb, and
close/recovery contracts. This is author self-review, not a fresh reviewer,
Opus review, protocol acceptance, or implementation approval. Model/effort
identity is not independently attested by this record.

## Findings

### SAR-01: Specify the legal same-key v1-to-v3 transition (P1)

**Plan location at reviewed commit:** lines 336-361, especially line 361.

The plan requires a superseding v3 intent for the same PR/head, and explicitly
requires its authorized bytes to differ from v1. Existing `dedupeKey` and
`validateIntentGraph` in `scripts/task-tracker/lib/delivery-records.mjs:672`
through line 705 reject any such difference as `same-key-divergence` before
supersession links are considered. Extending version recognition and individual
codecs does not define how to admit this history. An implementer either retains
the refusal, stranding the motivating case, or weakens the general guard.

**Required correction:** Specify a narrow, validated original-v1 to v3 graph
edge with exact original evidence and unchanged ordinary authorization fields;
retain the ordinary divergence and graph-integrity checks. Exercise the entire
original/waived/receipt comment history, plus tampering and wrong-predecessor
cases. Explicitly refuse an attribution-v2 predecessor rather than silently
discard its distinct authority.

**Disposition:** Accepted. Task 7 now defines that edge and its positive and
negative history fixtures. It does not revise the accepted specification.

### SAR-02: Serialize intent publication before the burn (P1)

**Plan location at reviewed commit:** lines 47-51, 114-121, 296-332, and 407-409.

The original journal begins at `burned`, but Task 9 publishes/readbacks a v3
intent first. Two hosts can observe the same original intent and append two
successors before either reaches the burn CAS. Existing `appendIntent` performs
an unconditional POST followed by projection; it is not an exclusive writer.
The graph then refuses a fork or reused operation, even if only one burn wins.
A lost successful intent response is another duplicate-append path. Per-operation
refs also do not serialize two different valid grants naming the same original
intent. The planned tests begin too late to establish end-to-end retry safety.

**Required correction:** Reserve exact intent identity/bytes before intent
publication, serialize ownership of the original intent across operation IDs,
and reconcile ambiguous intent writes without replay. Reservation must not
consume approval or bypass fresh liveness checks at the final burn. Add complete
two-host delivery tests including the actual projected comment history.

**Disposition:** Accepted. The proposed journal is now an issue-scoped append-only
CAS history with per-operation state and original-intent ownership. Added
`intent-requesting`/`intent-confirmed` states, `ensureWaiverIntent`, immutable
publication evidence, and full-transaction race/crash tests. Unknown publication
outcomes and drift after reservation remain explicit refusals, not silent
replacement operations. The journal backend remains a plan-review decision.

## Verification

- Before the baseline commit: targeted Prettier and Markdown lint passed; staged
  whitespace check passed. Commit `f3f27345` contains only the plan.
- `node --test scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs`:
  25 passed, 0 failed. The suite demonstrates the existing same-key divergence,
  fork, operation-reuse, and duplicate-receipt contracts; it does not test the
  not-yet-implemented v3/v4 schemas.
- Accepted spec SHA-256 remains
  `bcc6d2bf1f6b8ff50d3c1de1e38e3079a749ce3d7ead82656fba987e742f8ddb`.
- AITM commit tracing initially refused a stale `HEAD` branch marker. The user
  confirmed the same-worktree branch update, and commit tracing then succeeded.

The corrections accompanying this record require a new complete SAR pass.
No runtime source, real journal refs, issue state, or accepted spec was changed.
