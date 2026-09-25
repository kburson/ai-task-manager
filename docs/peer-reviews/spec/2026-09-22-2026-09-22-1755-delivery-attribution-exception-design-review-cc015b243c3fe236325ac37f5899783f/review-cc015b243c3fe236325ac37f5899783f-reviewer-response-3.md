# Reviewer response — round 3 (terminal)

Review: `review-cc015b243c3fe236325ac37f5899783f`

Artifact: `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md`

Reviewer: Claude Opus 5 (anthropic, claude-code)

Disposition: **accepted** — terminal. No further round requested.

## Protocol note

This is a manual exchange document, matching the format of rounds 1 and 2. It does not claim a `peer-review submit` event and does not assert protocol acceptance.

Rounds 2 and 3 were conducted manually by explicit operator direction. The `ai-peer-review` package workspace for this review never advanced past the round-1 submit: `reviewer-response-2.md` records the protocol state at that point as `author-revision` with next action `peer-review submit <workspace>`, and no turn-2 reviewer draft was ever generated. The package is currently under repair and the operator directed that it not be used for this turn. Accordingly this document was authored directly rather than into a package-owned pending response, and the review's package workspace remains at its round-1 state.

## Identity of the reviewed version

- Specification path: `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md`
- Reviewed commit: `0fc890a98ba79497df5b6beb9436fd8389d6f13c` — `docs: address second delivery attribution spec review`
- Blob: `9e841e404b2cd45ce417b051e723c02442bd40c7`
- Reachability: the reviewed commit is an ancestor of `origin/trunk` (`6363654f`) at the time of this review.

I reviewed the version actually present on `origin/trunk`, not a worktree copy.

## Findings checked

### R2-F001 — anchor and comparison unit — resolved

"Source inventory and delivery evaluation" now makes the complete paginated GitHub PR commit connection the sole ordered source set, and states the exceptional path validates `local HEAD === PR head oid === inventory final oid`, then for every inventory oid proves the commit object exists locally, is reachable from `HEAD`, and carries the same subject. The paragraph says explicitly that this "does not derive a second set from `origin/trunk..HEAD` or depend on a fresh base-ref fetch," and that the ordinary path keeps its current behavior.

This is the inventory-anchored counter-proposal from round 2, taken in full. It removes the stale-`origin/trunk` failure mode and the merge-base anchor mismatch rather than papering over them with a pre-read fetch, and it is order-independent. Accepted.

### R2-F002 — byte-comparable subject derivation — resolved

The same paragraph pins the local subject to "the first physical line of the commit message, extracted with the same `/\r?\n/` split as the GitHub path, without `%s` folding, trimming, or empty filtering; an empty first line is refused." The implementation-files section carries the matching instruction to replace the exceptional `listCommitSubjects` range use with per-oid commit-object reads on that exact derivation plus `HEAD` reachability, and the test list names raw first-line subject mismatch and empty subjects.

All three round-2 divergences — `%s` paragraph folding, `.trim()`, `.filter(Boolean)` — are closed, and the empty-subject refusal now matches the GitHub side rather than silently dropping the entry. Accepted.

### R2-F003 — receipt v3 `metadataWarnings` — resolved

"Intent, retry, and truthful receipt" now states that receipt schema selection for v3 is explicit rather than inferred from `metadataWarnings` presence; that under the current closed `METADATA_WARNING_CODES` set a v3 receipt may carry only `missing-merge-attribution-trailer`; that it must not carry `missing-source-attribution` for the authorized inventory; that any new warning code requires an explicit allowlist change; and that the waived path adds disposition and exception references to `delivery-verification.mjs`'s fixed `receiptInput` shape.

That is the literal statement round 2 asked for, plus both mechanical consequences named in the same place. Accepted.

### R2-F004 — 60 KiB bound (optional) — resolved

The envelope paragraph states the cap as 60 KiB of UTF-8 bytes measured on the canonical escaped, rendered comment body, with filled `prepare` computing a conservative upper bound including later authority fields and `record` checking the exact rendered body, and says the byte cap "is deliberately more conservative than a character-counted host limit, including for multibyte subjects." Unit basis and measurement surface are both named. Accepted.

### R2-F005 — host-detection basis (optional) — resolved

The overview states that `prepare` checks the resolved provider adapter (`aiAppName()` and its transcript locator) for a current Codex session, that a host-name override alone is insufficient, that an unsupported host reports `authorization-host-unsupported`, and that `record` independently repeats the refusal. Accepted.

### Round-1 findings — still correctly represented

I re-read the accepted round-1 set against the current text rather than assuming the round-2 revision preserved it:

- **R1-F001** — Codex-only recording, second adapter out of scope, `authorization-host-unsupported` at `prepare`, read-only `show` still portable. Present.
- **R1-F003** — `classifySourceCommitSubjects` runs on the complete GitHub inventory before mapping candidates, retains `(oid, subject)` pairs and verified-merge-exempted SHAs rather than title strings, exempted merges take no mapping but stay in the raw digest, `#`-bearing merge subjects need mappings, inspection failure fails closed. Present.
- **R1-F004 / R2-F003** — intent v2 / receipt v3 for waived deliveries only, absent disposition meaning an ordinary pass, v1/v2 reads preserved. Present.
- **R1-F005** — both `AUTHORIZED_INTENT_KEYS` projections unified or updated together, with schema, disposition, both IDs, both digests, mappings, tokens and commit text in the equivalence, and "a v1 passed intent can never compare equal to a v2 waived intent." Present.
- **R1-F006 / R1-F007** — digest plus only excepted entries in the comment, complete raw inventory recomputed rather than copied, over-limit refusal during filled `prepare` before the human authorization step, and the raw-inventory / proposal-scope digest separation maintained as two distinct digests. Present.
- **R1-F008** — the verification section retains the statement that `workflow-preflight` does not report this separate delivery exception. Present.

No accepted round-1 finding was weakened or dropped by the round-2 revision.

## Basis of acceptance

I accept on the text of the specification as it stands at blob `9e841e40`, on the same evidentiary basis as rounds 1 and 2: reading the spec against the named implementation sites it constrains. I did **not** accept because the implementation was subsequently delivered. The delivered implementation is outside this review's artifact scope and was not treated as evidence that the specification is correct; had a required finding remained open in the text, the correct outcome would have been `revisions-requested` plus a separately authorized corrective defect, regardless of what shipped.

## Decision

**accepted** — terminal. R2-F001, R2-F002 and R2-F003 (required) and R2-F004 and R2-F005 (optional) are all resolved in the reviewed text. No required finding remains open. No further round is requested.

## Timing disclosure

This acceptance is recorded **after** the implementation for #1755 was delivered and after #1755 was closed. The specification, plan, review collateral, implementation, tests and delivery were already merged to `origin/trunk` before this document was written.

This document does not rewrite history and does not claim that a terminal reviewer acceptance existed prior to delivery. It states the opposite: at delivery time the review record ended at `author-response-2` with no reviewer response to it, and that gap is what this document closes. Round 2 ended with the reviewer stating "With R2-F001 through R2-F003 addressed I expect to accept without a further round"; the author addressed them and the confirming turn was never written. The acceptance recorded here is a post-delivery audit completion, dated at the time of writing, and should be read as such by anyone auditing the #1755 record.
