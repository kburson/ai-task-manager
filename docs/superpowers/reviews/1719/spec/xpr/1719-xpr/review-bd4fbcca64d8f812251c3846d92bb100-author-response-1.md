<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-bd4fbcca64d8f812251c3846d92bb100"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md"
artifact_commit: "340e63d54b849978869a9e4c0543f984a83bcf72"
artifact_blob: "f96da64a3a150b2b20c5c53059fab821896e2164"
artifact_digest: "sha256:a295ddeec226a0ddab22c029659ca3d3d26d69ba35cbef8564b50bdacac1d58e"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:d78c2a09ded87e11849e5782e5dc9f11f9362b3d13572c3a6ee75c071435c779"
  identity_source: "runtime"
started_at: "2026-09-21T04:35:03.336Z"
submitted_at: "2026-09-21T04:49:55.642Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed all five round-1 findings through specification changes. The two-ledger accounting architecture remains unchanged. The revision explicitly specifies the cost schema's compatibility with existing secret validation, the timing suffix migration, independent usage availability detection, orthogonal cutoff/observation/delivery classification, and reconciliation payload lineage.

## Finding dispositions

- **R1-F001 — accepted.** Selected bounded native-counter arrays with safe semantic keys and native names as values. Supported payloads must pass the existing secret policy unmodified. Credential-shaped rejected category values, including singular `input_token`, produce an incomplete unsupported-schema observation; no encoding or secret-policy exception is permitted. This applies to every new record family.
- **R1-F002 — accepted with a corrected failure description.** The existing end-anchored parser demonstrably throws when the cost marker follows `row-sec`. The spec now requires row-sec then cost marker, a composed-suffix lexical implementation before writer enablement, named consumer migration, and round-trip acceptance cases. The claimed length-threshold failure for a cost marker before row-sec did not reproduce: the seven-column fixture retained nine split cells and full-marker insertion produced the requested value. That placement still leaks comment text into the final cell. The canonical multi-marker grammar resolves the confirmed defects without relying on the unverified count-shift claim.
- **R1-F003 — accepted as an explicit integration constraint.** The spec already separated usage adapters from word counting; it now names the Codex-only unavailable behavior and requires independent missing/unreadable/schema/cursor checks for every usage host. A shared helper's successful-looking zero cannot prove measured usage. Existing word-count behavior is not changed by this design.
- **R1-F004 — accepted.** Replaced the mixed boundary enum with eventRole for the lifecycle cutoff. Each source contribution has its own observationKind, and each span has deliveryWindow including unknown and not-applicable. This also handles one event containing a baseline for one source and an interval for another, including at Done.
- **R1-F005 — accepted clarification.** The previous text already placed the complete replacement set in the payload; scalar links were intended for revision lineage. The revision now explicitly defines payload arrays, scalar supersedes as the prior reconciliation revision (or null), and traversal of both payload references and revision links. No envelope schema widening is proposed.

## Changes made

Updated Existing AITM foundations, Timing Log authority, Agent cost event schema, Event identity, Observation and delta, and the Security/compatibility and failure acceptance cases.

Also incorporated optional suggestions 2 and 3: record/transport byte limits, bounded incomplete handling of oversized observations, and the source-condition diagnostic convention.

## Declined changes and rationale

Optional suggestion 1 is deferred to implementation planning: the per-event immutable evidence granularity remains a requirement, so this revision does not introduce per-stage batching or an invented typical story-event count. The implementation plan can measure page-scan cost and cache rebuildable projections without weakening event identity or coverage. This is a performance consideration, not an unresolved accounting correctness issue.

No required change is declined. The non-reproducing portion of R1-F002 and the existing payload intent in R1-F005 are clarified above.

## Verification

Read the current record-secret-policy, record-envelope, timing-row-reader, word-counter, and related consumers in the df88 worktree. Ran direct Node assertions against existing exported functions, without changing code or adding test files:

1. Native token-name object keys and singular credential-shaped category values are rejected by the existing secret policy; the proposed multi-provider nativeCounters array passes it; an injected credential key remains rejected.
2. A normal timing row reads 60 Develop seconds. Appending the cost marker after row-sec reproduces timing-row-reader:estimation-row-sec. Placing it before row-sec leaks into the final cell; the seven-column count remains nine and full-word-marker migration still works, correcting that part of the review's hand trace.
3. Missing-source countWords returns unavailable for Codex and ok zero for Claude/Grok, confirming the need for independent adapter checks.

The initial diagnostic script intentionally asserted the review's count-shift claim and failed on that assertion; the corrected executable checks above passed. The spec and author-response body are checked with repository Markdownlint (generated protected metadata is excluded because its YAML delimiters are parsed as headings), the spec with Prettier, and the diff with git diff --check before submission. These are design/compatibility checks, not implementation verification. Implementation, backfill, and credentialed billing remain unapproved.
