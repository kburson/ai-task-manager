# Remove AITM Co-Review Runtime Design

**Issue:** #1592  
**Status:** Approved under Full-Auto authorization  
**Dependency:** #1591 is closed with zero active legacy review rows

## Purpose

AITM now depends on the exact published `ai-peer-review@0.2.0` package, but it
still ships the older AITM-owned `co-review` command, protocol implementation,
index authority, and tests. This design completes the terminal migration by
removing that duplicate runtime while preserving historical evidence and the
narrow host integration AITM still needs.

The resulting ownership boundary is simple:

- `ai-peer-review` owns review commands, protocol state, schemas, recovery,
  participant roles, and new review collateral.
- AITM owns task lifecycle and strict main-worktree-anchored task occupancy.
- AITM may read one package review's status through the package's public API and
  cache it as a non-authoritative observation.
- AITM exposes no review compatibility command or package wrapper.

## Preconditions and evidence

The deletion gate is already satisfied by #1591. Immediately before this
design was recorded, the sanctioned legacy-index verifier reported:

- zero active legacy rows;
- 137 tracked archive files;
- reconciliation operation
  `sha256:cbff75990e0b9aa5505e492fe25e1c05894406832795ed3685644defb06f62d1`;
- index digest
  `sha256:3c3235f7e486c01edbd233683cc67ace7f039843266f41b7da26cefcac765816`;
- `migrationGuard: production-consumers`.

The governed branch, local `trunk`, and `origin/trunk` all began at
`0988881f5796d19c270e4121a851143bb5046a6f`. The worktree was clean and
`node_modules/ai-task-manager -> ..` was verified.

## Considered approaches

### 1. Remove legacy authority and require strict task occupancy

Delete the legacy tree, command, index resolver, reconciliation command, and
worktree-sharing exception. Keep the package adapter and non-authoritative
status cache. This is the selected approach because it leaves one review
authority and one task occupancy authority without inventing a bridge.

### 2. Rebuild worktree sharing from package status

This was rejected. The package exposes read-only status for a known workspace,
not a global sibling-worktree registry. AITM could not discover every live
package review or prove that an arbitrary second task binding belongs to one.
Adding such a cache would either become accidental review authority or fail
open when incomplete.

### 3. Retain a tombstone or compatibility wrapper

This was rejected because the story requires the `co-review` surface to be
absent and explicitly forbids `npx aitm peer-review`. A forwarding command
would recreate the command-contract drift the package extraction eliminated.

## Runtime architecture

### Package adapter

`scripts/task-tracker/lib/peer-review-adapter.mjs` remains the only production
AITM module that imports `ai-peer-review`. It keeps:

- `AITM_PEER_REVIEW_CONFIG`;
- the frozen set of published read-only/transport API functions;
- `peerReviewStartArgs` for AITM-specific issue and review-root settings;
- `peerReviewStatus` for normalized read-only observations.

It loses all legacy index parsing, migration guards, filesystem discovery, and
references to `scripts/review/**`. No package-internal path may be imported.

### Task occupancy

AITM's `.tmp/aitm/fleet/occupancy.json` remains authoritative for task
bindings. One session may occupy an issue and one editing session may occupy a
physical worktree. A second session in the same worktree is always refused.

Peer-review participants do not acquire AITM task bindings merely by joining a
review. Their roles and permissions are enforced by `ai-peer-review`; their
status may be cached through `cachePeerReviewStatus`, where every observation
is explicitly marked `authoritative: false`.

The legacy `.tmp/aitm/fleet/co-review-index.json` resolver is removed from
production. The already-reconciled machine-local file may remain on disk as
historical local evidence, but no new AITM runtime reads or writes it.

### Command surface

Remove `co-review` and `reconcile-legacy-index` from:

- executable entrypoint classification;
- `SELF_DOC` and normalized command catalog;
- orchestrator routing and grouped help;
- package-boundary expectations.

After removal, `npx aitm co-review` and
`npx aitm reconcile-legacy-index` must both return the ordinary unknown-command
exit. `npx peer-review` remains the only supported review CLI. AITM does not
add `peer-review` to its own command registry.

## Deletion boundary

Delete all files beneath `scripts/review/**`, including the reconciliation
utility delivered by #1591. Delete AITM-only `co-review` fixtures and suites
whose behavior is now owned by the package. Remove only legacy-claim-invariance
cases from otherwise generic task-guard suites.

Historical specifications, plans, research, postmortems, and review archives
are records of what existed and are not rewritten merely because the runtime is
retired. Current operator and maintainer guidance is updated so no supported
path promises the old command.

## Archive immutability

Before deletion, create
`scripts/tests/fixtures/legacy-review-archive-sha256.json` containing the
repo-relative path and SHA-256 digest of every tracked file currently under
`docs/superpowers/reviews/**`. The terminal migration test reads that manifest
and requires each listed file to exist with identical bytes.

The manifest intentionally permits additional future package-owned review
collateral. It prevents mutation or deletion of all evidence that existed at
the migration boundary without freezing the directory against append-only use.
No file under `docs/superpowers/reviews/**` is edited by #1592.

## Test strategy

Test-driven removal begins with
`scripts/tests/integration/review/peer-review-decommission.test.mjs`. Against
the pre-removal tree it must fail because the runtime and command still exist.
After implementation it proves:

- `scripts/review` and named AITM-only fixtures/suites are absent;
- neither legacy command exists in the catalog or orchestrator;
- no production file imports or routes to the legacy tree;
- AITM source contains no owned `aitm.co-review/*` protocol schema;
- the package adapter imports only the public package boundary;
- current operator documentation names `peer-review` as the sole command and
  does not promise `npx aitm co-review`.

The retained parity, Phase 2 compatibility, and rewritten terminal migration
suites run with the legacy directory physically absent. The archive manifest
test proves byte identity. Existing command-catalog, occupancy, package pack,
test-tree layout, generic guard, lint, format, fast, integration, and slow
suites guard the broader removal.

The package-entry ceiling is remeasured after deletion. It may be lowered to the
new observed boundary; it must not be raised or weakened to hide unexpected
growth.

## Error and recovery behavior

There is no runtime fallback. An AITM user invoking a retired command receives
the standard unknown-command response and the current command listing. An
artifact-review user invokes `npx peer-review`; package `APR_*` errors and
recovery help remain authoritative.

Task occupancy conflicts continue to fail closed and direct the second editing
session to an isolated worktree. A package review observation cannot grant a
task binding or override occupancy.

If archive validation fails, implementation stops without changing the
archives. If package parity fails after deletion, repair the bounded AITM
adapter/test integration; do not restore duplicate protocol ownership.

## Scope control

This issue does not change the package protocol, add review features, rewrite
archives, or create another compatibility command. It requires no sibling or
follow-up defect. Any regression directly caused by the removal is repaired
inside #1592, honoring the two-level defect-chain limit.
