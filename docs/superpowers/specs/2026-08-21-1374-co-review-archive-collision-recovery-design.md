# Co-Review Archive Collision Recovery Design

**Issue:** #1374  
**Status:** Proposed  
**Scope:** Guided co-review startup, accepted archive publication, and status recovery

## Problem

Guided co-review derives one archive destination from the host issue and artifact kind:

```text
docs/superpowers/reviews/<issue>/<spec|plan>
```

Initialization validates that this path is inside the repository, outside the ignored runtime, and not ignored. It does not require the path to be unoccupied. A second protocol can therefore record a destination that already contains a complete archive from an earlier protocol.

Finalization correctly refuses to overwrite different bytes and correctly rejects a different `--archive-dir` when the protocol recorded a configured destination. Those two safety properties compose into an unrecoverable accepted state: the configured destination conflicts, every other destination is rejected, and status repeats the impossible configured retry.

The accepted #939 runtime `62212b77-b7e7-402c-8136-c1b231283cd2` is the concrete reproduction. Its configured destination contains the complete archive for protocol `1dcbcbad-40c3-4810-8dbe-fd430ea29628`. The newer protocol and all immutable evidence pass integrity validation, but publication has no sanctioned path.

## Goals

1. Prevent a new protocol from starting with an already-occupied configured archive destination.
2. Recover already-accepted protocols created before that prevention exists.
3. Preserve configured-destination pinning; recovery must not become an arbitrary path override.
4. Preserve both protocols, both evidence sets, and every existing archive byte.
5. Keep publication deterministic, exact-byte verified, idempotent, repository-contained, and race-safe.
6. Make status print the exact recovery action and recognize successful recovered publication.

## Non-Goals

- Deleting, renaming, merging, or modifying a prior archive.
- Editing accepted protocol state or appending a post-acceptance protocol event.
- Reusing accepted evidence in a replacement protocol.
- Allowing an operator-selected arbitrary recovery destination.
- Relaxing symlink, containment, Git-ignore, evidence-hash, or staging-race protections.

## Selected Design

### 1. Initialization reserves only absent destinations

`initializeProtocol` will perform a read-only occupancy check after exact-retry detection and before writing `events.jsonl` or `state.json`.

- If the protocol already exists and its initialization bytes match, exact retry retains current behavior. A later published archive must not make retry fail.
- For a genuinely new protocol, the configured archive leaf must not exist. The parent `<issue>/` directory may already exist; only the derived `<spec|plan>` leaf is reserved. A file, symlink, empty directory, non-empty directory, or unreadable entry at that leaf refuses with `archive-destination-occupied` before protocol mutation.
- An empty leaf deliberately refuses rather than being treated as absent. Ordinary publication atomically renames a staging directory into an absent leaf; accepting or removing an existing empty directory would either defer the same conflict until finalization or destroy unexplained filesystem state. The refusal distinguishes an empty leaf so the host can investigate and remove it through normal repository governance when it is proven disposable.
- The check is inside the initialization mutex. It cannot prevent an unrelated process from creating the archive after initialization; accepted-session recovery remains necessary for that race and for legacy runtimes.

This rule applies to both guided `start` and direct `init`, because both route through `initializeProtocol`.

### 2. A foreign archive must be complete and canonical

Recovery is eligible only when the configured destination is a complete co-review archive for a different protocol. A new archive inspection helper will:

1. require a regular, non-symlink directory;
2. require a regular `README.md` containing exactly one canonical `aitm-co-review-manifest` block;
3. parse schema `aitm.co-review.archive/v1`;
4. require `manifest.protocol.id` to differ from the accepted runtime's protocol ID;
5. validate the required v1 manifest fields while tolerating documented optional v1 fields;
6. derive the exact expected evidence and optional artifact-copy filenames from the manifest;
7. require no missing, extra, non-regular, or symlink entries; and
8. recompute every archived SHA-256 digest and require the manifest values to match.

Foreign eligibility does not re-render the old manifest with the current serializer. The manifest block is parsed from its recorded bytes, and its required structure plus self-recorded file digests authenticate the preserved evidence. This keeps recovery compatible with valid legacy v1 archives whose JSON key order, whitespace, escaping, or optional fields differ from the current renderer. Unknown required structure, unsupported schema versions, invalid paths, and digest disagreement still fail closed.

A partial archive, corrupt archive, unrecognized directory, same-protocol mismatch, or tampered manifest remains a hard conflict. Recovery cannot be used to route around corruption of the current protocol's own archive.

### 3. Recovery destination is deterministic

For configured destination `D` and accepted protocol ID `P`, the only permitted recovery destination is:

```text
<D>-recovery-<P>
```

For #939 this is:

```text
docs/superpowers/reviews/939/spec-recovery-62212b77-b7e7-402c-8136-c1b231283cd2
```

The existing `--archive-dir` option carries this exact path. No new general override is introduced. When a configured destination exists:

- an equivalent spelling of the configured destination retains ordinary behavior;
- the exact deterministic recovery path is accepted only after the foreign-archive proof above succeeds; and
- every other path retains `archive-destination-mismatch`.

The recovery destination then passes the same containment, ignored-path, runtime-conflict, preparation, staging, rename-race, and exact-byte validation used by ordinary publication.

### 4. Recovered archives carry explicit provenance

Ordinary archive bytes remain unchanged. `recovery` is an optional, version-tolerated v1 field. It is absent—not `null`—for ordinary archives. For a recovered archive it is appended after the existing `normative` key without reordering any existing manifest keys, and its own keys are emitted in the fixed order shown below. All v1 readers and validators must tolerate this optional object while continuing to require the existing v1 fields.

A recovered archive adds this manifest object:

```json
{
  "recovery": {
    "configuredDestination": "docs/superpowers/reviews/939/spec",
    "occupiedProtocolId": "1dcbcbad-40c3-4810-8dbe-fd430ea29628",
    "recoveryDestination": "docs/superpowers/reviews/939/spec-recovery-62212b77-b7e7-402c-8136-c1b231283cd2",
    "occupiedAcceptedAt": "2026-08-21T16:30:32.732Z",
    "relationship": "newer-than-occupied"
  }
}
```

`relationship` is derived by comparing the current decision timestamp with the occupied manifest's decision timestamp and is one of `newer-than-occupied`, `older-than-occupied`, or `same-time-as-occupied`. This provenance is derived entirely from validated protocol state and the foreign manifest. It does not depend on operator prose and does not mutate the accepted runtime.

The recovered archive's rendered prose explicitly links the configured archive and states both acceptance timestamps and the derived relationship. Directory placement therefore communicates publication order, not authority or recency: the canonical `<issue>/<kind>` path is the first published archive, while a recovery sibling may contain a later superseding design. Readers determine recency from `decision.at` and the recovery relationship rather than from the directory name.

### 5. Status treats recovered publication as terminally complete

For an accepted protocol with a configured archive:

1. Inspect the configured destination against the current protocol's expected bytes.
2. If it is complete and identical, report the existing `complete-and-identical` result.
3. If it is an eligible complete foreign archive, derive and inspect the deterministic recovery destination.
4. If the recovered archive is complete and identical, report it as the effective archive destination with `completion: complete-and-identical` and include the configured destination as recovery provenance.
5. If the recovery destination is absent, expose one `finalize` action containing its exact path.
6. If either destination is ineligible or the recovery destination conflicts, report a conflict and no unsafe alternate path.

The protocol remains terminal and immutable throughout. Repeated status and finalization calls derive the same destination from the same protocol ID.

## Command Behavior

The current accepted #939 session will recover with:

```text
npx aitm co-review finalize \
  --dir .tmp/co-review/939-governed-pr-delivery-design-claude-4 \
  --archive-dir docs/superpowers/reviews/939/spec-recovery-62212b77-b7e7-402c-8136-c1b231283cd2
```

The command succeeds only if the configured archive is validated as a complete foreign archive. A retry after successful publication is an exact-byte no-op.

Help text will distinguish three cases:

- configured or unconfigured ordinary publication;
- occupied-destination refusal before a new protocol starts; and
- deterministic collision recovery for a legacy accepted protocol.

## Security and Failure Semantics

- No existing archive path is ever opened for write during recovery.
- The prior archive is authenticated structurally and cryptographically before it authorizes the sibling path.
- The sibling name is protocol-derived, so an operator cannot redirect evidence elsewhere.
- A pre-created conflicting recovery directory fails closed.
- Publication continues to write a unique staging directory and atomically rename it into place.
- An external race after initialization can cause acceptance publication to return exit 4, but status then provides the deterministic safe recovery instead of an impossible retry.
- Every failure before publication leaves protocol state and immutable evidence byte-identical.

## Test Plan

The focused verifier remains:

```text
node --test scripts/tests/unit/review/co-review.test.mjs
```

Add cases proving:

1. guided `start` refuses a pre-existing empty or non-empty host archive destination before creating protocol state;
2. direct `init` applies the same rule;
3. exact retry of an already-initialized protocol remains valid even if its archive later exists;
4. an accepted legacy runtime with a complete foreign archive can prepare and publish only to the deterministic recovery path;
5. recovery preserves the prior archive, runtime state, events, and immutable evidence byte-for-byte;
6. arbitrary paths, same-protocol corruption, partial archives, corrupt manifests, symlinks, and conflicting recovery paths remain refused;
7. a recovery retry is idempotent and does not rewrite archive files;
8. status reports the exact recovery command before publication and the recovered destination after publication; and
9. a structurally valid legacy v1 foreign manifest with different JSON whitespace or key order remains recoverable when all recorded file digests match; and
10. ordinary configured, unconfigured, reference-mode, copy-mode, and legacy-copy finalization remain byte-compatible.

## Documentation

`docs/superpowers/reviews/README.md` will state that the primary `<issue>/<kind>` directory is the first published archive, not necessarily the newest accepted design, and that a collision-recovery sibling is independently preserved evidence rather than a replacement. It will direct readers to compare manifest `decision.at` values and follow the recovered archive's configured-destination link. Both directories remain independently immutable evidence; the primary archive is never edited merely to add a backlink.

## Rollout

After focused and full verification, publish the fix through the governed #1374 branch. Then run the exact recovery command for the preserved #939 runtime, commit the generated recovered archive on #939's branch, and resume #939 from its accepted design into implementation planning.
