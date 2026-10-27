# Phase 3: Project-Local Knowledge Retrieval

<!-- cspell:words reranker snapshot-local supersession tombstoned -->

## Document status

- **Date:** 2026-09-13
- **Status:** Draft for written human and peer review
- **Owner:** `ai-peer-review`
- **Issue:** [#32](https://github.com/kburson/ai-peer-review/issues/32)
- **Parent feature epic:**
  [#29](https://github.com/kburson/ai-peer-review/issues/29)
- **Phase:** 3 of 5
- **Depends on:** Phase 2, [#31](https://github.com/kburson/ai-peer-review/issues/31)
- **Scope:** Design only; this document does not authorize implementation or
  automatic activation of project knowledge

## Source authority

This specification atomically extracts Phase 3 from the accepted
[Project-Local Review Lifecycle and Learning Design](2026-09-12-project-local-review-lifecycle-and-learning-design.md),
whose accepted digest is
`sha256:0b65a538437dc2ef2bb86533e991c90b945dacb9fbc7cbe16ad277f8f709fd27`.
The umbrella design and the accepted Phase 1 and Phase 2 contracts remain
binding.

## Summary

Phase 3 adds a repository-owned knowledge ledger and a deterministic context
compiler. A review receives stable root policy, explicitly applicable subsystem
overlays, and a bounded set of accepted case cards selected from the reviewing
worktree's committed `HEAD`.

Tracked canonical JSON events are durable authority. Phase 2 SQLite tables are
only a materialized query engine. Every review pins one immutable knowledge
snapshot for all turns and records enough provenance to reproduce the exact
compiled context.

## Goals

- Share project-specific review knowledge through ordinary Git operations.
- Make knowledge lifecycle append-only, schema-validated, and auditable.
- Admit only independently accepted, committed, applicable lessons to prompts.
- Select root and subsystem policy by explicit configuration.
- Keep retrieval deterministic, bounded, and independent of unrelated rows.
- Record exactly what policy, cases, configuration, and bytes a review used.
- Treat an empty optional corpus as truthful and non-blocking.
- Create stable evidence references without preloading raw transcripts or defects.

## Non-goals

- Generating or approving lessons from defects; Phase 4 owns that workflow.
- Training or fine-tuning a model.
- Making embeddings, FTS indexes, SQLite, or model scores authoritative.
- Exporting project knowledge to a hosted or cross-project service.
- Copying raw provider transcripts, secrets, or external defect bodies into Git.
- Updating the knowledge snapshot during an active review.
- Inferring scope from a similarly named directory.

## Tracked knowledge layout

Phase 3 activates the reserved Phase 1 tree:

```text
.peer-review/knowledge/
├── schemas/
├── ledger/YYYY/MM/<event-id>.json
├── policies/<policy-id>.md
└── scopes/<scope-id>.json
```

The repository configuration identifies the mandatory root policy, artifact-kind
obligations, scope definitions, path applicability, compiler version, total
token budget, and maximum supplemental cases. All configured paths are
repository-relative, normalized, and containment-checked.

No repository knowledge directory is required before the feature is enabled.
After a mandatory root policy is configured, its absence or digest mismatch is
a configuration failure rather than an empty-corpus result.

## Canonical knowledge events

The ledger stores one canonical JSON object per immutable event file. Creation
adds a file. Correction, rejection, retirement, supersession, and logical
deletion add later events; normal operation never edits existing event bytes.

Every event uses a closed versioned schema and contains, as applicable:

- collision-resistant `eventId`, event type, and timestamp;
- subject case, review, audit, artifact, and chain IDs;
- source paths, Git blobs, and SHA-256 digests;
- artifact-kind and subsystem applicability;
- failure classification and evidence confidence;
- review obligation and explicit exclusions;
- creator and evaluator identities and roles;
- lifecycle status and predecessor or supersession references; and
- redaction or protected-reference metadata.

Canonical serialization makes event bytes stable. Duplicate IDs with identical
bytes are idempotent; the same ID with different bytes is an immutable-record
violation. Unknown fields, invalid transitions, cycles, dangling required
references, and path escape fail closed.

Phase 3 must understand the complete lifecycle even though Phase 4 initially
creates most observations and candidates:

```text
observation -> candidate -> accepted -> retired | superseded
                         \-> rejected
```

Only the effective accepted state can be prompt eligible. Candidate, rejected,
retired, superseded, tombstoned, or invalid cases remain queryable for audit but
never enter active context.

## Committed authority boundary

Normal review startup reads `.peer-review/knowledge` from the Git tree at the
reviewing worktree's committed `HEAD`, not from the working tree. Dirty
knowledge paths are reported and excluded. The manifest records
`knowledgeSource: committed-head`.

The knowledge tree object ID and all policy/configuration digests define the
snapshot input. Phase 2 ingestion may contain events from many branches, but a
snapshot includes only event blobs reachable from the bound tree. A database row
or uncommitted file cannot confer eligibility.

The snapshot remains immutable from intake through terminal review state. New
accepted lessons committed during the review are eligible only for a new review.

## Policy and scope selection

Context preload has a fixed precedence:

1. mandatory root policy;
2. obligations for the FUR artifact kind;
3. every explicitly applicable subsystem overlay; and
4. explicit reviewed overrides that suppress a root obligation.

Project configuration maps declared repository path patterns and artifact
metadata to named scopes. Multiple scopes may activate for a cross-cutting
artifact. Matching is deterministic and normalized. A directory name that
resembles a scope ID has no effect unless a configured rule matches.

An overlay augments root policy by default. Suppression requires an explicit,
reviewed override event with exact obligation IDs, applicability, authority,
and digest. A scope cannot silently weaken a root policy.

The manifest records every considered rule, active scope, selected policy
version and digest, and applied override.

## Two-stage context compiler

The compiler produces bounded Markdown in two layers:

1. **Preload:** root policy, artifact-kind obligations, and active overlays.
2. **Supplemental:** the highest-ranking accepted case cards relevant to the FUR.

The default total learning budget is 8,000 model tokens. Stable policy has
priority. Supplemental retrieval uses the remainder and selects no more than
eight cases unless configuration sets a smaller limit. Truncation removes the
lowest-ranked whole card; it never cuts a card into ambiguous fragments.

Token counting names the tokenizer or deterministic approximation and its
version. The compiler emits canonical bytes so the same inputs produce the same
context digest.

## Case-card contract

Storage JSON is not copied directly into the prompt. Each compiled card contains:

- stable case ID and effective event ID;
- recognizable failure pattern;
- required review obligation;
- applicability and exclusions;
- artifact kinds and subsystem scopes;
- confidence and acceptance basis; and
- stable references to source review, audit, artifact, patch, or finding evidence.

Raw transcripts, complete artifact content, patches, and defect bodies are not
preloaded. A participant may request a referenced evidence bundle when a
selected card becomes material. The request and returned digest become review
evidence under the existing supplement protocol.

## Deterministic retrieval

Initial retrieval uses hard metadata filters followed by SQLite full-text
ranking. Hard filters include snapshot membership, effective accepted status,
artifact kind, scope, explicit exclusions, and configured policy constraints.

All scoring inputs are snapshot-local. Document frequencies, corpus statistics,
normalization, tie-breakers, and candidate sets must not depend on rows outside
the pinned snapshot. Ranking a global FTS table and filtering afterward is
forbidden. A snapshot-scoped table or a scoring algorithm proven independent of
outside rows is required.

Deterministic tie-breaking uses stable case IDs after recorded relevance inputs.
The implementation records the query representation and configuration so a
fresh clone selects the same ordered cases.

Optional embeddings are local derived data. Their model, input compiler, and
index versions are recorded. They may refine ranking only after hard filters and
cannot add an otherwise ineligible case. Missing embeddings fall back to the
deterministic lexical path without changing authority.

## Review-manifest receipt

Before creating the review session, startup seals a context receipt containing:

- package and context-compiler versions;
- `knowledgeSource` and committed tree object ID;
- root policy, artifact-kind policy, scope, and override IDs and digests;
- all eligible case IDs and effective event IDs;
- selected case IDs in order and exclusion reasons where retained;
- retrieval method, query, configuration, limits, and tie-breaker;
- compiled Markdown digest and final token count; and
- snapshot ID shared with the Phase 2 session row.

The compiled context is immutable for every turn. Resume validates the receipt
and snapshot before supplying it again. A mismatch enters intervention rather
than recompiling against newer knowledge.

## Empty and failure behavior

These conditions are explicit but non-blocking:

- no optional knowledge corpus exists;
- no accepted applicable case exists;
- no supplemental case fits the remaining budget; or
- optional embeddings are unavailable.

These conditions fail the affected review startup:

- configured mandatory policy is missing or changed;
- committed knowledge cannot be read or schema-validated;
- an immutable event identity has conflicting bytes;
- lifecycle materialization is ambiguous;
- scope selection is non-deterministic;
- retrieval observes an out-of-snapshot row; or
- compiled bytes or token receipts cannot be reproduced.

Failures preserve tracked files and the current Phase 2 database. Recovery names
the exact invalid path, event, policy, or snapshot operation.

## Privacy and portability

The corpus is project-local and tracked. It contains bounded evidence references,
not credentials, provider handles, raw environment variables, or unrestricted
external data. Protected source systems are referenced through opaque IDs and
redaction receipts.

Sharing occurs only by committing and merging the repository's knowledge tree.
Cross-project export is a future separately governed operation. A fresh clone
rebuilds the same eligible cases and context from Git without contacting a
hosted service.

## Implementation seams

The plan should isolate:

- closed knowledge event schemas and canonical serializer;
- append-only ledger writer and lifecycle validator;
- committed-tree reader and dirty-path reporter;
- snapshot builder and Phase 2 ingestion adapter;
- explicit scope matcher and policy resolver;
- case-card compiler, token budgeter, and digest renderer;
- snapshot-local lexical retrieval and optional embedding adapter; and
- manifest context receipts plus evidence-supplement lookup.

CLI surfaces should expose validation, snapshot inspection, retrieval
explanation, and rebuild diagnostics without permitting direct status mutation.

## Verification strategy

The Phase 3 plan must include:

- closed-schema acceptance and unknown-field rejection;
- duplicate ID, rewritten bytes, invalid transition, and supersession tests;
- deterministic materialization under randomized filesystem enumeration;
- committed-tree reads that exclude dirty and branch-only knowledge;
- fixed snapshot membership across a multi-turn review;
- explicit multi-scope selection and similar-name non-activation;
- root policy augmentation and governed override enforcement;
- deterministic ordering in fresh and branch-divergent clones;
- proof that unrelated global rows cannot alter scores;
- exact whole-card token and count limits;
- optional-embedding fallback and hard-filter preservation;
- reproducible context digest and manifest provenance; and
- truthful empty-corpus behavior.

The issue-level targeted verifier is
`test/integration/knowledge-retrieval.test.mjs`; the plan may split it while
preserving the named acceptance probes in #32.

## Acceptance criteria

Phase 3 is ready for implementation planning when peer review agrees that:

1. immutable tracked events are the only durable knowledge authority;
2. only accepted, effective, committed, and applicable cases are prompt eligible;
3. each review pins one committed snapshot for its complete lifetime;
4. scope activation and root-policy override are explicit and reproducible;
5. retrieval scores and limits depend only on the pinned snapshot;
6. context bytes, case order, token count, and provenance are reproducible;
7. optional retrieval absence does not block an otherwise valid review; and
8. invalid mandatory policy or cross-snapshot leakage fails closed.

## Final decision

Phase 3 makes committed project knowledge a bounded, reproducible review input.
It does not let a database, embedding, uncommitted file, or active review pair
decide what is accepted knowledge. Phase 4 may add governed learning events and
Phase 5 may reuse snapshots, but neither may change this eligibility boundary.
