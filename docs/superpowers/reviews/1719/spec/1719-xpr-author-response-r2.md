<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-5adf972a9df9d2101e757a5abdd469b1"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md"
artifact_commit: "62fa711d97a8364cadb81a0cb5849e8fe31b9f51"
artifact_blob: "4b85864b21fe951f82d3e4b5b495b995c2c9416d"
artifact_digest: "sha256:7f4b8a7566abcaad3f598d3d5c38e8449f7c51f5649bbe906683b94d519f2c55"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:d78c2a09ded87e11849e5782e5dc9f11f9362b3d13572c3a6ee75c071435c779"
  identity_source: "runtime"
started_at: "2026-09-21T05:07:42.936Z"
submitted_at: "2026-09-21T05:21:33.437Z"
finding_ids: []
answered_finding_ids: ["R1-F001"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed the required read-side isolation defect R1-F001 and all three optional clarifications. The revised design keeps cost envelopes on the owning issue but places their comment transport in a disjoint cost namespace. Governance readers retain their fail-closed behavior. Invalid cost evidence becomes an explicit incomplete coverage diagnostic and cannot poison lifecycle reads through a cost-owned marker.

## Finding dispositions

- R1-F001: fixed. Chose read isolation, with a stronger boundary than a tolerant cost report alone. A report-only catch would leave lifecycle and estimation readers exposed, while a tolerant shared reader could weaken governance. The new Cost-record read isolation section requires an allowlisted cost codec before enabling writers, unchanged envelope/security validation, per-candidate cost diagnostics, and unchanged generic governance validation. Acceptance case 12 covers all named consumers and the malformed-generic-record negative control.

## Changes made

1. Clarified that reuse of record hashing, validation, correlation, and exact read-back does not imply unchanged reuse of the generic comment transport. Added a dedicated `aitm-cost-record` transport for events, reconciliations, policy, and subscription records. Its marker cannot match the existing generic record predicate; only cost record types may enter it. No governance envelope may enter the tolerant path.
2. Specified independent cost-candidate parsing, bounded diagnostics without raw bodies, incomplete coverage for unattributable corrupt candidates, coverage detection for missing markers, and unavailable coverage for failed enumeration. Cost-generated rendered comments cannot claim the generic namespace. Explicitly scoped the guarantee so external relabeling as a governance claimant retains current fail-closed policy.
3. Added Ledger read unavailable or corrupt behavior, security/compatibility checks, and concrete acceptance case 12 for lifecycle evidence, workflow-preflight, estimation projections, and the cost report.
4. Optional suggestion 1: documented the key-fragment restriction and kept credential setup requirements local. Durable capability evidence uses an explicit safe projection, for example `accessMode`, rather than serializing adapter configuration.
5. Optional suggestion 2: stated that limits apply to the full canonical escaped envelope and final rendered comment, including visible prose and transport framing. Raw payload length is insufficient.
6. Optional suggestion 3: enumerated the frozen envelope identity, authority fields, links, exact rendered body, and marker version. Payload equality alone cannot prove read-back completion. Distinguished source epoch from envelope authority epoch and added acceptance case 13.

## Declined changes and rationale

None of the required findings was declined. The suggested tolerant-cost-read option was refined into transport isolation because tolerating the cost report alone would not protect the existing governance readers, and globally skipping malformed generic records would weaken their fail-closed contract. This is an explicit specification extension; no implementation behavior is claimed to exist yet.

## Verification

- Reproduced the current failure through `parsePreloadedIssueComments` using malformed canonical-prefix, uppercase-prefix, and quoted generic-record candidates: each aborts the read. A malformed body under the disjoint cost marker produces no generic record and does not abort that read. This verifies the existing selection boundary, not a cost codec implementation.
- Read the comment-store selection, per-node validation, parser propagation, and exact write/read-back checks; confirmed consumers filter types only after generic parsing.
- Read `createAitmRecordEnvelope`, `canonicalCommentRecordJson`, and `renderAitmRecord`; confirmed generated IDs/timestamps are outside the payload hash, authority epoch defaults rather than always regenerates, and the record bound is on the escaped full envelope. The review's optional example rendered its escape visually as an unchanged double hyphen; the source actually substitutes a literal Unicode escape for the second hyphen, expanding bytes. The specification now describes the behavior without that formatting ambiguity.
- The specification passes Prettier check; scoped Markdown lint passes for the specification and author prose; Git whitespace checks pass. The repository-wide Markdown command also included historic sealed review frontmatter and reported 56 issues in seven review files. Those protected review documents were preserved; no repository-wide lint-clean claim is made. No AITM implementation or provider API behavior was changed or asserted as tested by this specification revision.
