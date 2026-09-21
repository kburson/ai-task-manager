---
record_type: "publication-copy"
model: "gpt-6-astra"
effort: "high"
filepath: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
commit_sha: "6891473eb0dca09b0c88d0745f2039c35c82249a"
uncommitted_changes: false
reviewed_file_sha256: "5c3907545d5d3b12738b72b85d8afaa0bea5cdd12f4592e418ed2ec17798825b"
turn_ordinal: "SPR r1"
turn_description: "Same Provider Review revision 1"
role: "author"
source_file: "2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-1ea55e3127774ff3817f44752efcbc79-author-response-1.md"
source_sha256: "fbddf4cf3a444334cff5ffbd9d9cda8ed35a06f7ebea6bc1f662401575e7279e"
submitted_at: "2026-09-20T20:36:44.753Z"
result_commit_sha: "0a7e3c6a6283feddd4a7d7f16d81ac856cc5f1eb"
---

# SPR r1: Author response

Publication copy of the [sealed protocol response](2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-1ea55e3127774ff3817f44752efcbc79-author-response-1.md).
The source hash above identifies the original; this copy adds the requested
frontmatter and does not replace protocol authority. The original response prose
follows unchanged.

Mode: `normal`

## Summary

Author: `gpt-6-astra`, effort `high`. Turn: `SPR r1`, Same Provider Review
revision 1. The protected metadata identifies the incoming artifact; the
protocol submission records the resulting committed revision. The Reviewer is
GPT-5.6 Sol at medium effort in a distinct runtime session.

I accepted all four findings, with two scope qualifications documented below.
The architecture now states its trusted-plugin boundary, binds plugin selection
and recovery to executable content, requires durable retention and complete
retrieval, and assigns canonical evidence writes exclusively to the active
`work-items` binding. This remains an umbrella architecture; no provider
implementation or isolation mechanism has been built or certified.

## Finding dispositions

### R1-F001 — Accepted with scope clarification

The original spec already called selection a code-trust decision and identified
plugin execution as an expansion of the trusted code base. It nevertheless used
an unqualified prevention goal and did not carry that trust boundary into strict
receipts. I narrowed Goal 3 and explicitly made selected plugin code and runtime
dependencies fully trusted. Strict assurance is host isolation conditional on
that trusted code, not containment of malicious adapter code. Receipts identify
the executable identities, trust basis, and enforcement boundary. Missing trust
or identity blocks activation. Adversarial certification must expose undeclared
mutations without claiming to prove arbitrary-code isolation.

I chose the Reviewer's trusted-computing-base alternative rather than adding a
process/RPC sandbox to this architecture. Adding such a boundary would be a new
implementation initiative and is not required to make the current claim truthful.

### R1-F002 — Accepted

Version and manifest identity alone do not bind workspace executable bytes.
Selection now covers the complete runtime closure, dependencies, assets, and
relevant build/loader inputs, with verified content identity. Published-package
integrity only counts for the bytes it actually covers. The runtime must load a
verified immutable view or provide equivalent certified write exclusion; a
hash-then-load race cannot satisfy the contract. Installation and learning
fingerprints, action execution context, assurance receipts, and recovery
compatibility carry this identity. Tests change executable content without
changing the manifest or version and exercise concurrent edits before dispatch.

### R1-F003 — Accepted with availability qualification

A reported retention limitation is insufficient for a writable authority. The
new retention contract requires complete retrievable canonical payloads and
request-key continuity for the authority's lifetime. A finite live-store window
requires a verified native archive inside the same logical authority. Admission
must prove relevant completeness; a stale projection cannot do so. Policy drift,
deletion, expiry, or unavailable archive coverage blocks affected mutations,
including the whole project when request-key scope is unknowable. A reviewed
transfer preserves replay and tombstones under existing cutover barriers.

The design cannot promise to reconstruct evidence that has no surviving
authentic copy. That case explicitly remains blocked intervention. This qualifies
the requested recovery criterion: refusal is correct safety behavior for
irrecoverable deletion, but cannot justify certifying a provider that normally
expires its only evidence. ADR 0002 explicitly discusses manual edits/deletions
and availability; the Reviewer's attribution of an explicit provider-retention
warning to that ADR is broader than its text. The finding still follows directly
from this spec's sole-authority and provider-retention requirements.

### R1-F004 — Accepted

The generic ABI table and the phrase "Each adapter" admitted an interpretation
inconsistent with the single authority. Only the active writable `work-items`
binding now receives canonical evidence calls. Other ports return typed
observations and receipts to the kernel, which journals them in that authority.
A multi-port package does not gain evidence authority through its forge or CI
binding. A Jira-plus-Bitbucket composition test proves the routing boundary.

## Changes made

Updated Goal 3; the ABI table and port ownership contract; plugin trust,
executable selection, and immutable loading; learning and installation
fingerprints; durable evidence routing and retention; recorded recovery context
and compatibility; strict-assurance scope and receipts; adapter, portability,
and host certification; release gates; phases 1, 4, and 7; and acceptance
criteria 8, 9, and 12.

No original review finding was deleted or rewritten. The response records
accepted design corrections and their limits separately from implementation
validation.

## Declined changes and rationale

No finding declined. The isolation alternative was not selected because the
Reviewer explicitly offered a fully trusted plugin boundary as an alternative.
Irrecoverable payload loss remains blocked intervention rather than an invented
recovery guarantee. These scope choices are explained in the dispositions.

## Verification

Prettier passes for the updated spec. Spelling checks pass for the spec and
Author response. Repository Markdown lint reports zero issues across 556 files;
the configured lint excludes protected response documents. Documentation anchor
lint passes for 38 anchors across three indexed documents. The package response
parser accepts the Author response, including all four finding dispositions.
All six JSON examples in the spec parse. These two documents contain no local
Markdown links requiring resolution. Git whitespace validation passes.

This verifies document structure and consistency only. No provider integration,
plugin isolation, archival implementation, or runtime behavior was tested; the
new adversarial cases are requirements for later implementation phases.
