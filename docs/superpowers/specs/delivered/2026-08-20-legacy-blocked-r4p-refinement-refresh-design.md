# Legacy Blocked R4P Refinement Refresh Design

**Issue:** #1341

**Status:** Approved under the operator's explicit Full-Auto authorization

**Blocks:** #1263

## Problem

AITM can hold a Ready-for-Planning issue with a valid schema-1 refinement
snapshot that was stamped while the issue was unblocked. If a blocker is later
added through the governed blocker command, the protected marker becomes
authoritative but the parked snapshot remains historically unblocked.

That state is deliberately rejected as stale by current snapshot verification.
However, it also has no sanctioned recovery path:

- `shelve` refuses because ordinary shelving requires a current snapshot before
  it can write immutable history;
- `refine` refuses because refinement completion is not available from Ready for
  Planning; and
- directly editing or restamping the body would bypass lifecycle authority and
  destroy the distinction between historical evidence and current evidence.

The result is a recovery deadlock. It currently prevents #1335 through #1338
from obtaining current refinement evidence and therefore blocks epic #1263.

## Decision

Extend the governed Shelve command with an explicit migration intent:

```text
npx aitm shelve <issue> --reason "..." --refresh-stale-blockers
```

The flag is not a general stale-snapshot override. It authorizes exactly one
legacy shape: a cryptographically and structurally valid schema-1 snapshot whose
only current mismatch is that a non-empty, authoritative blocker list was added
after the snapshot was stamped.

Ordinary Shelve behavior remains unchanged when the flag is absent.

## Authorization Boundary

Migration mode accepts a source only when every condition below holds:

1. The issue is in Ready for Planning and otherwise satisfies normal Shelve
   ownership, lifecycle, and source-state checks.
2. The serialized refinement snapshot is schema 1.
3. The schema-1 digest, provenance, priority, size, estimate, and rank remain
   valid under the historical schema-1 rules.
4. The snapshot's serialized blocker list is semantically different from the
   live protected blocker marker.
5. The body contains exactly one syntactically complete protected blocker
   marker with one or more unique positive issue references.
6. The protected marker, visible `BLOCKED` label, and configured Project
   `Blocked By` text field agree on the same canonical blocker set.
7. No other stale, malformed, ambiguous, or tampered evidence is present.

Failure of any condition is a refusal before mutation. The refusal must preserve
the ordinary fail-closed contract and identify the migration boundary that was
not satisfied.

## Carrier Agreement

The protected marker is the source for the blocker reference set, but migration
requires the other carriers to agree before it can use that set as recovery
evidence:

| Carrier               | Required blocked representation                       |
| --------------------- | ----------------------------------------------------- |
| Protected body marker | exactly one strict marker with canonical unique refs  |
| Visible label         | `BLOCKED` present                                     |
| Project text field    | canonical `#N, #M` rendering of the same ordered refs |

An unblocked source does not need this migration and is refused in migration
mode. A missing label, a stale Project field, duplicate markers, invalid tokens,
or differing references also refuses. Migration does not heal blocker carriers.

## Historical Evidence

The immutable refinement-history record must preserve two truths:

- the exact legacy snapshot that was previously accepted; and
- the canonical live blocker set that authorized this migration.

Migration records add authenticated, migration-specific evidence to the existing
history payload, for example a migration discriminator and numeric
`liveBlockedBy` refs. Those properties participate in the record digest.

Compatibility is conditional and explicit:

- existing ordinary history records and partial journals retain their current
  digest and replay semantics;
- a migration record must contain and validate the extra evidence; and
- source matching includes the extra evidence only for a migration record.

This preserves already-written history without allowing a new migration record
to omit or alter the blocker set after capture.

## Transaction and Retry Semantics

The migration flag is part of the Shelve transaction intent. A retry cannot
start as ordinary Shelve and resume as migration, or vice versa.

After the migration-specific source check and history capture succeed, the
existing ordered Shelve phases remain authoritative:

1. record immutable refinement history;
2. clear active refinement/planning evidence;
3. clear active planning fields;
4. return the issue to Backlog;
5. reconcile ownership; and
6. verify the final state.

Blocker carriers are retained throughout. They are not active planning fields
and the migration does not remove, rewrite, or resolve blockers.

## Return to Current Evidence

Shelve does not silently restamp the issue. After successful migration, the
operator follows the normal lifecycle:

```text
Backlog -> Refine -> Ready for Planning
```

The normal refinement completion path emits schema 2. Its serialized blocker
refs must match the protected marker, `BLOCKED` label, and Project field. The
epic admission check can then recognize the child as carrying current refinement
evidence while still respecting its open dependency.

## Refusal Matrix

| Source                                            | Migration result                 |
| ------------------------------------------------- | -------------------------------- |
| Valid schema 1, later blocker, all carriers agree | accept                           |
| Same source without explicit flag                 | ordinary stale-snapshot refusal  |
| Current schema 2 snapshot                         | refuse: migration not applicable |
| Schema-1 digest or provenance tampered            | refuse                           |
| Staleness in priority, size, estimate, or rank    | refuse                           |
| Missing, malformed, or duplicate protected marker | refuse                           |
| Marker, label, or Project field disagree          | refuse                           |
| Empty live blocker set                            | refuse                           |
| Retry intent differs from recorded journal        | refuse                           |

## Public Surface

- Shelve accepts `--refresh-stale-blockers` once.
- Help describes it as a schema-1 blocker migration, not a general repair flag.
- Unknown or duplicate flags remain deterministic command errors.
- The normal output makes the migration path visible for auditability.

## Verification

Focused tests cover successful migration, immutable history evidence, carrier
retention, schema-2 restamping, ordinary-path compatibility, transaction retry,
and every refusal row above. Existing refinement snapshot schema tests remain a
backstop against weakening strict marker parsing or schema compatibility. The
repository fast lane, slow lane, lint, and formatting gates remain required.

## Out of Scope

- General stale-snapshot repair.
- Automatic fallback from ordinary Shelve.
- Healing blocker carriers.
- Removing or resolving blockers.
- Reinterpreting schema 1 with schema-2 digest semantics.
- Changing #1263's test-corpus registry design.
