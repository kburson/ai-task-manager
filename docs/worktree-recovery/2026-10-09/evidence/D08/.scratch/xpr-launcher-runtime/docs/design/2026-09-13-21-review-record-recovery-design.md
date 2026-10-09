# Review-of-Record Recovery Design

## Status

Approved for implementation under issue #21 and the user's explicit Full-Auto authorization.

## Problem

`ai-peer-review` correctly gives every protocol attempt an immutable `review_id`, but version 0.2.2 also uses that ID as the default human-collateral directory key. A failed submission or replacement start therefore turns one human review into several unrelated folders. Earlier attempts can remain nonterminal, draft responses can look deceptively final, and the product offers no supported way to consolidate the evidence without rewriting files manually.

The immediate incident also exposed a narrower boundary bug: reviewer ref hashing excludes exact Codex checkpoint refs but still retains the separate `refs/codex/turn-diffs/captures/**` namespace. A host-created capture ref can invalidate an otherwise read-only reviewer turn.

## Goals

- Preserve immutable protocol-attempt authority.
- Give related attempts one stable human review-of-record identity and deterministic destination.
- Classify draft, failed, superseded, abandoned, and accepted evidence truthfully.
- Terminate a replaced nonterminal attempt without fabricating acceptance.
- Consolidate existing attempt folders with dry-run visibility, collision refusal, byte verification, exact-path Git commits, and an additive relocation receipt.
- Exclude only the authenticated Codex capture namespace from reviewer ref hashing while retaining all lookalikes and ordinary refs.

## Non-goals

- Merging event logs or reusing a `review_id` across attempts.
- Rewriting sealed response frontmatter, manifests, or historical path claims.
- Weakening artifact, HEAD, index, worktree, or retained-ref integrity.
- Treating provider session handles or operational scratch as durable review evidence.
- Reopening an already accepted artifact because its collateral moved.

## Identity Model

Two identifiers have separate jobs:

- `review_id` identifies one immutable protocol attempt, its event log, claims, workspace, and security boundary.
- `record_id` identifies the human review process that may contain several attempts.

`peer-review start` accepts `--record-id <id>`. When omitted, `record_id` defaults to the generated `review_id`; existing single-attempt behavior therefore remains deterministic. A replacement attempt joins an existing human record only through an explicit `--record-id`. Both IDs use the existing safe identifier grammar.

The startup context seals `record_id` beside `review_id`. Reducers continue to enforce a single `review_id` per event log. `record_id` is immutable routing and lineage metadata, never acceptance authority.

## Collateral Routing

The path renderer adds `<record-id>` while retaining `<review-id>`. The default template becomes:

```text
<kind>/<date>-<name>-<record-id>
```

Scratch remains `.scratch/peer-review/<review-id>`. In a record-scoped destination, generated files are qualified with the attempt ID:

```text
<review-id>-author-startup.md
<review-id>-reviewer-invitation.md
<review-id>-reviewer-response-1.md
<review-id>-author-response-1.md
<review-id>-review-manifest.md
```

This prevents collisions when several attempts share one record. A legacy template containing `<review-id>` retains its existing short filenames and physical layout. Shared templates containing neither identifier retain the existing date/name/review-ID qualification.

## Attempt Disposition

Add a terminal protocol state and event named `superseded`. A registered participant may run:

```text
peer-review supersede <workspace> --reason <text> --by <successor-review-id>
```

The command is allowed from every nonterminal state. It records the actor, reason, successor attempt ID, and retained workspace paths, then releases that attempt's collateral reservation. It is idempotent only when the retry matches the original actor, reason, and successor exactly. It cannot run against accepted, overridden, abandoned, or already superseded attempts and never creates terminal acceptance evidence.

`abandon` keeps its existing intervention-only meaning. Supersession is not a synonym for failure or abandonment: it records that another immutable attempt replaced this one.

## Review Index and Truth Classification

A new record module reads complete attempt authority and builds one ordered human index. Ordering uses event timestamps, then attempt ID and event sequence as deterministic tie-breakers. The index covers:

- startup and invitation collateral;
- reviewer and author responses;
- submission failures visible in retained attempt state;
- explicit supersession or abandonment;
- artifact revision commits and seals; and
- the single accepted or overridden terminal manifest.

Classification is authority-derived:

- `submitted` requires the matching reviewer or author submission event and sealed response metadata.
- `not-submitted` describes a materially completed response whose `submitted_at` is null and lacks a matching submission event.
- `incomplete` describes an untouched generated response template and is not represented as a decision.
- `superseded` and `abandoned` come only from their terminal protocol events.
- `accepted` comes only from the one terminal acceptance or override event and manifest.

Text that says “accepted” is never sufficient. The index may describe an unsubmitted accepting draft, but it cannot elevate it to protocol acceptance.

## Consolidation Command

The closed CLI adds:

```text
peer-review consolidate <workspace>... --destination <repository-relative-directory> --dry-run
peer-review consolidate <workspace>... --destination <repository-relative-directory> --apply
```

At least two workspaces are required. Exactly one mode is required. All attempts must share repository root, artifact path, artifact kind, and `record_id`. Every non-accepting attempt must be terminally superseded or abandoned, and at most one attempt may carry accepting terminal authority.

### Planning phase

The command resolves every source and destination physically inside the repository and refuses symlinks, duplicate sources, overlapping source/destination trees, unsafe identifiers, incomplete workspace authority, more than one accepted terminal attempt, and occupied nonidentical destinations. For every regular source file it reports:

- original repository-relative path;
- destination repository-relative path;
- classification;
- collision status; and
- expected SHA-256 digest.

Dry-run returns this exact plan and performs no write, removal, staging, or commit.

### Apply phase

Apply recomputes the plan from fresh authority, then:

1. creates every destination exclusively through temporary sibling files;
2. fsyncs and atomically renames each file;
3. rereads every destination and verifies its planned digest;
4. writes `review-history.md` and `relocation-receipt.json` exclusively;
5. verifies the complete destination set;
6. removes original files and now-empty original directories;
7. stages only the mapped additions, mapped deletions, index, and receipt; and
8. commits those exact paths in normal commit mode.

If creation or verification fails before source removal, originals remain intact. A retry accepts only byte-identical planned destinations and the same operation identity. Historical paths inside sealed files remain unchanged; `relocation-receipt.json` maps each original path and digest to the new path and digest.

The receipt schema is `ai-peer-review.relocation-receipt/v1` and records `record_id`, attempt IDs, artifact path, operation timestamp, mode, index digest, and the complete ordered mapping. It is additive evidence, not replacement authority.

## Git Boundary Correction

Reviewer ref hashing excludes these exact prefixes:

```text
refs/codex/turn-diffs/checkpoints/
refs/codex/turn-diffs/captures/
```

The parser requires at least one segment after the prefix. Singular names, dash-suffixed lookalikes, and every other ref remain authenticated. Tests mutate both legitimate capture refs and attacker-controlled lookalikes to prove the boundary.

## Interfaces and Compatibility

- The event envelope remains `ai-peer-review.event/v1`; the closed event enum gains `superseded`.
- Startup context remains `ai-peer-review.context/v1` with required `record_id` for newly created attempts. Readers accept legacy contexts by deriving `record_id = review_id` before path resolution, without rewriting stored bytes.
- Manifest schema remains v1 and adds `record_id`; legacy manifest readers already tolerate rendering as data while new validation requires the field for new manifests.
- Existing `--review-path-template` values remain accepted. `<record-id>` is additive and the new default affects only newly started reviews.
- Public API exports only the record planner/apply operation if CLI and integration consumers need a stable programmatic boundary.

## Failure Model

All new failures use stable `APR_*` errors with an inspection-oriented recovery message. Consolidation fails closed before mutation for invalid authority, incompatible attempts, collisions, path escape, symlinks, or ambiguous terminal authority. Digest mismatch after a copy stops before deleting sources. A failure after source deletion is recoverable from the verified destination plus receipt and Git index; exact-path transaction journaling prevents unrelated changes from entering the commit.

## Verification Strategy

Development follows strict red-green-refactor cycles. Focused unit tests cover capture refs, path rendering, event validation, reducer transitions, CLI grammar, classification, mapping, collision, digest, and idempotency. The three-attempt integration fixture reproduces the incident end-to-end: an unsubmitted accepting draft, an incomplete attempt, and one accepted attempt become one ordered record folder with byte-identical collateral and one terminal authority.

The issue's complete unit, slow, integration, MCP, packaging, smoke, lint, format, pack, diff, and commit checks remain the delivery gate.

## Decomposition Decision

Keep #21 as one issue with four internal checkpoints: capture boundary, identity/routing, supersession, and consolidation. These are not independently safe product increments because every part protects the same invariant. Splitting them would leave intermediate versions that invite another fragmented or unterminable recovery. The expected focused duration remains eight hours and Size remains L.

## Dependency Order

Issue #21 precedes #9 because durable wake/recovery must consume truthful attempt and terminal authority. #9 precedes #10 because phased sessions consume the wake coordinator's transport boundary. The remaining sequence is #21, #9, then #10, subject to a fresh live dependency check after each delivery.
