<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-d25ab35478c17f6f87b2b8bc4c67190a"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
artifact_commit: "e83599d8450faba1bebc813c4c4e514c05518ee7"
artifact_blob: "0050040de99db597a29b1c6d84eeefafdc780201"
artifact_digest: "sha256:1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:d9ed2486be1a86d7a3a8e60d0f84b083a8d1e3e2364c316fe5c18126f2576ed7"
  identity_source: "runtime"
started_at: "2026-09-20T22:18:52.610Z"
submitted_at: "2026-09-20T22:27:32.071Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Read the complete sealed SPR r1 response and verified its cited implementation.
The report identifies one blocking prose finding, F1, with three required changes.
Its protected `finding_ids` array is empty. This response explicitly dispositions
F1 and all three required changes while preserving that original protocol
metadata; no machine finding ID or sealed report has been retroactively changed.

The reviewed input is commit `e83599d8450faba1bebc813c4c4e514c05518ee7`,
artifact SHA256 `1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e`.
This Author retains the preceding XPR context; all new edits below respond to the
fresh SPR report. Prior XPR records remain immutable.

## Finding dispositions

### F1 — Accepted

Verified `scripts/gh/create-issue.mjs` at the current checkout. The `ghCreate`
error branch reports a detected partial issue creation and tells the operator to
repair that issue instead of retrying into a duplicate. The artifact generated
`actionId` inside the mutation flow and returned it only after execution; there
was no caller-retained request identity connecting a lost-response retry. That
is a real gap for issue creation and other mutation classes.

### Required change 1 — Invocation identity

Added a required caller-retained `invocationKey` for every mutation across CLI,
typed MCP tools, generic actions, and extensions. The caller creates or obtains
and retains it before dispatch, and retries reuse it. A missing key fails before
effects; an intentional new repetition uses a new key even with the same payload.
CLI aliases accept the key, with explicit client migration rather than silently
generating a new identity on retry.

The key is scoped to stable project authority and binding generation, including
creation before a work item exists. A durable binding records registered action,
schema, canonical payload, typed targets, authenticated stable actor, grant/epoch,
expected head, and capability fingerprint. Identical reuse resolves one original
instance; conflicting reuse fails closed. Coordinator admission serializes
concurrent duplicates under the existing conditional/non-CAS rules. Neither a
cache nor a lost/ambiguous append can establish unused identity. Retained
bindings/tombstones prevent reuse after compaction.

Distinct names are explicit: `action` is the registered operation, `actionId` is
one execution instance, and `invocationKey` is the caller's retained retry handle.
Provider keys derive from that instance. Fresh authorization applies to any
additional effect; receipt lookup does not require the old precondition to remain
current. Authorized delegated recovery records its own action/key targeting the
original instance instead of rewriting the original request or actor binding.

### Required change 2 — Lost-response boundaries

Added read-only lookup by authority identity/generation and invocation key, with
no dependency on a result that may have been lost. The boundary table covers:
pre-request ambiguity; request read-back before dispatch; dispatch intent with
unknown provider outcome; outcome recorded before projection repair; and complete
projection with lost response. A dispatch-intent record is explicitly not proof
of execution; crash-before-send and crash-after-send remain indistinguishable
without stronger observation or provider idempotency proof. Retry does not
re-execute on that uncertainty.

The durable binding must exist and be read back before the provider operation.
Where bootstrap cannot provide a durable binding location, setup requires
explicit maintainer provisioning rather than bypassing the contract. Completed
outcomes repair projections or return existing receipts without another provider
write. Unavailable original authority or ambiguous binding history fails closed.

### Required change 3 — Schemas and verification contract

Added canonical request example, key/action identity in result and error shapes,
pre-binding error semantics, and the contract as a Phase 1 schema-freeze input.
Expanded adapter conformance and CLI/MCP parity to cover issue creation and a
state-only mutation, identical-key replay, input conflict, concurrent duplicate
submission, and every lost-response boundary. Added AC 17. These are required
future implementation checks, not runtime tests performed by this review.

### Optional suggestion 1 — Accepted as a bounded setup requirement

Added explicit static metadata/lifecycle-script inspection before a dependency
operation may execute code for a named but not-yet-installed plugin. The bounded
plugin/setup specification chooses the fetch-without-execution mechanism and
approval boundary. Inability to inspect blocks executable installation; approval
to inspect is not approval to run package scripts. No package installer or trust
mechanism is implemented here.

## Changes made

Only the architecture artifact and this generated Author response changed during
the active turn. The revision covers invocation identity, request/result/error
examples, recovery boundaries, conformance/parity, Phase 1 scope, AC 17, and the
Reviewer-requested later setup trust requirement. XPR collateral is unchanged.

## Declined changes and rationale

None. The report's substantive request is accepted. The empty machine
`finding_ids` array is preserved as an evidence limitation rather than silently
repaired; the prose finding F1 remains explicitly addressed above.

## Verification

- Checked the cited current `ghCreate` partial-success branch and the affected
  artifact sections; no unrelated design/plan search was used by the Author.
- Exact-file Markdown lint, CSpell, and Prettier checks passed on the revision.
- Parsed all seven embedded JSON examples and checked local Markdown link targets.
- `git diff --check` passed. No full-repository runtime tests were run.
- Proposed invocation concurrency/recovery tests remain unimplemented design
  requirements; no schema implementation validation is claimed.
- The Reviewer disclosed incidental context exposure to unrelated repository
  specification/plan snippets through two broad searches. Its report explicitly
  excludes exposure to XPR findings or corrected versions of this target spec.
  The coordinator confirmed continuation with this disclosure intact and scoped
  searches thereafter. This weakens the narrow file-access restriction; the
  reported evidence does not establish cross-experiment contamination or perfect
  blinding. No exposure is erased from the record.
- No new Author tool failure occurred during this revision. Publication provenance
  will distinguish input and result commits after terminal protocol state.
