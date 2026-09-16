# DoD and Evidence Contract-Source Reads Design

## Context

Delivery Sequence Task 10 established `resolveContractSource(...)` as the
single read boundary for legacy issue bodies and directory-backed Delivery
Contracts. The completed Task 10a and 10b slices route Acceptance Criteria,
code-complete, and Verification Command gate reads through that boundary.
Definition of Done and evidence inspection remain body-only in
`functional-dod-evidence.mjs` and `evidence-markers.mjs`.

Issue #1119 is Task 10c. It completes the read-side compatibility layer before
Task 11 migrates Test, Review, approval, and close gates. It does not change any
checklist, evidence, approval, amendment, or demotion write path.

## Goals

- Give both DoD and evidence consumers one-shot asynchronous adapters over the
  normalized contract source.
- Preserve stable logical IDs, raw evidence declarations, display labels,
  deterministic checked state, Verification Command identity, and accepted
  evidence record references.
- Produce equivalent read models for equivalent legacy and directory-backed
  contracts.
- Treat a valid issue directory as authoritative and fail closed when its
  Delivery Contract cannot be read or validated.
- Preserve every existing synchronous body-parser and mutation API.

## Non-Goals

- No write-side routing for checkboxes, evidence, plan approval, amendment, or
  demotion; Task 12 owns those changes.
- No lifecycle-gate migration; Task 11 owns Test, Review, approval, and close.
- No evidence-capsule fetch or disposition validation beyond projecting the
  Delivery Contract's accepted record IDs.
- No schema revision, directory rewrite, or Delivery Contract mutation.
- No fallback to embedded legacy Markdown after directory detection.

## Alternatives

### Selected: dedicated read adapters

Each consumer gains a pure projection from an already-resolved contract source
and a one-shot asynchronous resolver adapter. Existing body parsers and write
helpers remain unchanged. This keeps line-indexed mutation data separate from
logical-ID-based authority data and gives Task 11 an explicit read-only API.
The adapters load the default contract resolver only when invoked so importing
the legacy synchronous parsers does not expand unrelated bind and review module
graphs; injected resolvers remain direct and deterministic in tests.

### Rejected: overload the existing parsers

Adding a `contractSource` option to the existing parsers would reduce exported
names, but directory records have no meaningful issue-body line indexes. The
resulting nullable mutation coordinates would make it easy for later write code
to treat a read projection as an editable body.

### Rejected: make existing parsers asynchronous

Converting the current parsers to async source resolution would affect many
legacy authoring, healing, review-validator, and write-side call sites. It would
mix Task 10c with Tasks 11 and 12 and break established public contracts.

## Architecture

### Contract normalization

`contract-source.mjs` will preserve both forms of every DoD declaration:

- `logicalId`: stable identity from the Delivery Contract or deterministic
  legacy mapping;
- `text`: marker-free display text;
- `declaration`: the complete declaration used to resolve proof and Verification
  Command citations;
- `checked`: lifecycle-projected boolean state.

Legacy contracts retain `acceptedRecordIds: []`. Directory-backed contracts
retain the sorted, validated accepted record IDs from the authoritative
Delivery Contract.

### Evidence read model

`evidence-markers.mjs` will expose a pure projection from a resolved contract
source and an async adapter that resolves the source exactly once. The result
contains:

- `sourceKind` and `authority` provenance;
- normalized Acceptance Criteria with logical IDs, declarations, checked state,
  and resolved verifier commands;
- normalized Functional DoD items with the same fields;
- normalized Verification Commands with logical IDs, commands, and checked
  state;
- accepted record IDs.

Verifier citations resolve against the normalized Verification Command list
using the existing `vc-list="vc:N"` grammar. Stable logical IDs travel beside
the resolved commands and checked state; this story does not change citation
syntax or reinterpret an ordinal citation as a logical ID.

### Functional DoD read model

`functional-dod-evidence.mjs` will consume the evidence read projection rather
than parsing the issue Markdown again. Its pure projection adds canonical Functional DoD
key classification where the logical ID maps to a known `dod-<key>` identity,
plus the parsed execution-proof marker from the declaration. Unknown stable IDs
remain readable with `key: null` and `classification: null`; they are not
discarded or guessed from visible wording.

The async adapter resolves the contract once, delegates to the pure projection,
and returns the same provenance and accepted record references.

### Legacy compatibility

Existing exports such as `parseEvidenceChecklist`, `auditEvidenceMarkers`,
`parseFunctionalDodKeys`, `stampEvidenceMarker`, and
`stampEvidenceAndReconcile` keep their current signatures and behavior. They
continue to serve body mutation, authoring, healing, and legacy validators.
Only the new read adapters consume directory authority.

## Data Flow

1. A lifecycle caller supplies repository, numeric issue, issue body, and
   optional injected GraphQL or record-reader seams.
2. The consumer adapter calls `resolveContractSource(...)` exactly once.
3. The resolver either returns the deeply frozen legacy or directory model, or
   throws a categorized `ContractSourceError`.
4. The pure evidence projection resolves declarations against normalized
   Verification Commands and preserves logical IDs, checked state, authority,
   and accepted record IDs.
5. The Functional DoD projection derives only canonical key metadata and proof
   marker details from the normalized declaration.
6. The caller evaluates lifecycle policy in Task 11 without knowing where the
   contract was stored.

## Error Handling

- Input, directory, reader, availability, record, contract, and projection
  failures propagate from `resolveContractSource(...)`.
- Neither consumer catches a directory failure to retry against the body.
- Invalid or missing verifier citations resolve to an empty command list so the
  later evidence audit can refuse them deterministically.
- Unknown DoD logical IDs remain in the result and receive no fabricated key or
  classification.
- Returned models are deeply frozen so downstream policy cannot mutate
  authoritative observations.

## Testing

Focused coverage extends
`scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`.
The matrix will prove:

- equivalent legacy and directory contracts yield equivalent evidence and DoD
  observations;
- stable logical IDs, checked state, raw declarations, resolved commands, and
  accepted record IDs survive both consumer projections;
- directory-backed state wins when the embedded legacy body contradicts it;
- resolver injection is called exactly once per adapter invocation;
- unavailable and projection-mismatched directory records fail closed without
  body fallback;
- returned top-level objects, arrays, items, authority, and accepted record IDs
  are immutable;
- existing body-only parser and audit fixtures remain unchanged.

Repository verification remains the focused contract-source test followed by
the full fast and slow lanes, lint, format, exact-SHA Test, and Agent Review.

## Delivery Constraints

- #1119 remains a single bounded Task 10c story and a single story commit.
- The child branch is based on the synchronized #1067 epic head.
- No subagent is used; the issue requires one exact-SHA Agent Review.
- The child merges back to `feature/epic/1067`, not directly to trunk.
