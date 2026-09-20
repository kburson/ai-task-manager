---
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: 3d61deb4e5bb0d65258cfd0116fdfd4e541682cb
uncommitted_changes: false
turn_ordinal: SAR r2
turn_description: Single Agent Review revision 2
---

# AITM MCP adapter architecture self-review, round 2

**Date:** 2026-09-20

**Artifact:** [Architecture specification](../../../specs/2026-09-20-aitm-mcp-adapter-architecture-design.md)

**Reviewed baseline:** `3d61deb4e5bb0d65258cfd0116fdfd4e541682cb`

**Reviewer:** Codex, self-review

**Status:** All three findings addressed in the specification; independent
review pending.

This is a second author self-review, not independent peer-review acceptance or
implementation approval. The manual Claude review remains separate.

## Evidence and scope

The review covered the complete specification, the prior
[self-review](self-review-r1.md), [ADR 0002](../../../../decisions/0002-github-native-authority-records.md),
the current [capsule chain](../../../../../scripts/task-tracker/lib/github-records/capsule-chain.mjs),
and [contract source selection](../../../../../scripts/task-tracker/lib/github-records/contract-source.mjs).
The first round's four corrections remain present. This round examines failure
paths within journal persistence, migration activation, and plugin portability.

These are specification findings. Current implementation evidence establishes
constraints; it does not certify the proposed architecture or live providers.

## Findings

### SR2-01 — P1: Journal appends need their own recovery contract

**Baseline:** Append-only integrity and Governed action and recovery flow.

The flow requires a verified request before dispatch and an outcome afterward,
but recovery is described for the adapter's business mutation only. The journal
append is itself an external write. A provider can commit `action.requested` or
an outcome and lose its response. Recreating that event can produce a duplicate
record or fork; treating the failed append as absent can lose admission or
outcome evidence. Applying the universal request-before-mutation rule to each
journal append would recurse indefinitely.

The current `appendCapsule` reports a `store` error on create or read-back
failure. Its validator rejects duplicate record IDs and forks. A timeout
therefore cannot be treated as a proven no-write result by the new adapter ABI.

**Required correction:** Define evidence append as an internal protocol
primitive with stable logical event identity, exact-envelope verification, and
explicit recovery after an uncertain append. Require recovery from external
authority using the retained request key or action handle. Block dependent
dispatch until request read-back succeeds, and never repeat business effects
to repair a missing outcome. Preserve ambiguous or conflicting evidence.

**Verification requirement:** Lose responses and interrupt read-back for both
request and outcome records; restart without local cache; retry the same event;
inject delayed visibility and conflicting copies. Verify no duplicate logical
admission or business effect and no success before evidence verification.

### SR2-02 — P1: Migration lacks a shared cutover and old-writer barrier

**Baseline:** Existing-project migration and Phase 7 compatibility statement.

A checkpoint and generated-file replacement in one checkout cannot stop an
older clone or in-flight command from continuing to write legacy authority.
The current contract reader selects its source from the issue directory;
updating local configuration is not a project-wide writer barrier. A legacy
write after checkpoint capture can be omitted from the canonical history.

The unconditional promise that failed migration leaves the previous
installation selected is also unsafe after the new authority has accepted
actions. Restoring old integration files could resume writes against obsolete
authority while another clone continues on the new stream.

**Required correction:** Separate staging from durable activation. Fence or
verifiably stop old writers and settle their effects before the final
checkpoint. Record the selected authority, migration identity, epoch, and
minimum writer protocol externally. Activate only after read-back and parity.
Older writers that cannot honor the barrier must lose their write path or be
verifiably stopped. Recovery after activation must retain the new authority;
reverse cutover requires the same governed reconciliation and fencing.

**Verification requirement:** Race migration with an older CLI, crash before
and after activation, resume from another clone, and restore old generated files
after a new action. No omitted legacy effect or simultaneous writable history
is permitted. An unprovable writer barrier blocks activation.

### SR2-03 — P2: Filesystem plugin selection can violate clone portability

**Baseline:** Open plugin discovery, Tracked portable output, and Cloud and
clone contract.

The specification accepts arbitrary filesystem plugin paths and then promises
that the committed selection is restored by the package lock after `npm ci`.
A lockfile reference to a directory outside the repository does not supply that
directory in a fresh clone. Committing repository-relative launch commands does
not make the adapter entry point or its generated build output available.

**Required correction:** Classify local experimentation explicitly. Portable
selection must resolve to a pinned retrievable package or repository-contained,
tracked package with all runtime artifacts available after the declared
`npm ci` step. Report external paths, escaping symlinks, and missing build
artifacts as `adapter-local-required`; do not certify portable setup until the
selection is normalized and tested in an isolated clone.

**Verification requirement:** Exercise a published package, a tracked workspace
adapter, an external filesystem path, an escaping symlink, and an absent runtime
entry. Only reproducible selections can pass portable-install certification.

## Resolution and validation

| Finding | Disposition | Revised specification sections                                                                          |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| SR2-01  | Addressed   | Evidence append recovery; core and adapter verification; Phase 1; acceptance criterion 17               |
| SR2-02  | Addressed   | Existing-project migration; Migration cutover tests; Phase 1; acceptance criterion 13                   |
| SR2-03  | Addressed   | Open plugin discovery; Cloud and clone contract; Portable-install test; Phase 4; acceptance criterion 7 |

Release gates now require evidence-append recovery, a verified migration
cutover, and reproducible plugin selection. The migration failure contract
distinguishes failure before activation from recovery after activation, so a
local rollback cannot silently switch the shared authority.

Documentation verification:

- Worktree environment and local package self-link verified.
- Prettier verification for both changed documents, explicitly including the
  normally ignored review directory.
- CSpell verification for both changed documents.
- Repository Markdown lint and documentation-anchor lint.
- Local Markdown links and embedded JSON examples validated.
- Git whitespace check and complete specification diff inspection.

These checks validate the documents. The adversarial runtime cases added to the
specification remain requirements for the separately approved implementation
phases. No runtime implementation, external state, or first-round review record
changed. Manual Claude review and implementation approval remain pending.
