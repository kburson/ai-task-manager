# Test Corpus Baseline Reset Design

Status: approved on 2026-08-27

## Context

The Writing Studio extraction removed the article and publishing subsystem from
AITM. The first cleanup preserved the retired tests through frozen-retirement
receipts, historical hydration, a graduation command, and a scheduled cleanup
workflow.

The first graduation run exposed a circular proof requirement. The cleanup
branch deletes the active receipts, but the focused guards require those same
receipt deletions to be reachable from canonical `origin/trunk` before the
branch can pass. A pull request cannot prove that its own unmerged deletion is
already canonical.

Repairing that loop would add more machinery to preserve historical test
membership in the current tree. That is the wrong maintenance boundary for
AITM. The extraction is complete, the retired work remains in Git history, and
the current package should describe only the code and tests that exist now.

## Governing principle

Acceptance receipts are commit-scoped evidence. They prove that work was done,
verified, and accepted at the historical revision where the receipt applies.
They do not permanently constrain the HEAD of `trunk`.

A later story may refactor, rename, replace, or remove an accepted file or test.
The earlier receipt remains valid for the history of `trunk`; it is not expected
to remain valid for the current tree. Closed stories and their supporting code,
tests, and evidence remain discoverable together through Git history.

Current HEAD is therefore authoritative for the current test corpus. Historical
provenance is an audit capability of version control, not a live runtime
dependency of the test harness.

## Decision

Reset the AITM test-corpus baseline to the post-extraction current tree and
remove all Writing Studio cleanup scaffolding from HEAD.

The reset is complete rather than incremental:

- remove the old pre-move manifest and all post-snapshot membership records;
- remove the four frozen-retirement receipts and their shared temporary
  evidence;
- remove receipt loading, historical hydration, graduation tooling, and the
  scheduled graduation workflow;
- remove tests and documentation whose only purpose is to enforce or explain
  those mechanisms; and
- regenerate the generic tree-layout baseline from the final live AITM test
  corpus.

No tombstone, replacement receipt, or historical-membership registry remains in
HEAD. The deleted artifacts remain available in Git history.

## Current-state authority

The live test tree is discovered by the existing `discoverTestFiles()` and
`laneManifest()` helpers. The retained baseline is a current-state regression
floor, not a migration ledger.

The final authority flow is:

```text
live test discovery ──→ lane and placement checks
         │
         └────────────→ compare with current tree-layout baseline
```

The baseline records the expected current corpus after this reset. A baseline
test that disappears fails reconciliation. A new test is allowed when it is
canonically placed and passes the ordinary test-authoring guards. A future
intentional removal requires an explicit baseline refresh in the same change.

The baseline must not contain migration-era terms, historical path mappings,
retirement records, provenance commits, or Writing Studio-specific exceptions.

## Removed artifacts

The implementation removes these authorities and mechanisms:

- `scripts/tests/fixtures/test-corpus-pre-move.json`
- every record beneath
  `scripts/tests/fixtures/test-corpus-post-snapshot/`
- every receipt beneath
  `scripts/tests/fixtures/test-corpus-frozen-retirements/`
- `docs/evidence/temporary-test-retirements/2026-08-25-writing-studio-extraction.md`
- `scripts/tests/lib/frozen-test-retirements.mjs`
- `scripts/tests/lib/test-corpus-membership.mjs`
- `scripts/maintenance/graduate-frozen-test-retirements.mjs`
- `.github/workflows/graduate-frozen-test-retirements.yml`
- the dedicated unit, integration, and maintenance tests for those mechanisms;
  and
- the `graduate:frozen-tests` package command.

References to those artifacts are removed from the test-impact manifest,
strict-argument coverage, residue-audit coverage, package-corpus coverage,
test-authoring documentation, installation documentation, and spelling
vocabulary where the terms are no longer used.

## Retained safeguards

The reset does not weaken the current package's ordinary quality controls. The
following remain authoritative for HEAD:

- valid unit, integration, and slow-lane placement and partitioning;
- current tree-layout baseline reconciliation;
- required story tags and other test metadata;
- test file line caps and test reach checks;
- sandbox and fixture isolation;
- package exclusions and dry-run package-content auditing;
- current package-corpus assertions that do not depend on migration history;
  and
- the normal fast and slow quality lanes.

The package-corpus and tree-layout tests are simplified rather than replaced.
They retain current-state assertions and discard old-manifest, post-snapshot,
retirement, lane-correction, and Git-history coupling.

## Failure behavior

Current-state guards report actionable present-tense failures:

- a baseline test is missing;
- a live test is outside the canonical lane layout;
- a required package exclusion or test invariant is violated; or
- the checked-in baseline is malformed or stale.

No current guard reads historical commits, remote refs, receipt evidence, or
migration records. Shallow clones and unavailable `origin/trunk` history cannot
affect test discovery or package verification.

## Migration sequence

Implementation proceeds as one coherent reset:

1. Characterize the current guards that must survive the simplification.
2. Remove the historical membership, retirement, and graduation mechanisms and
   their dedicated tests.
3. Simplify the retained layout and package tests to current-state authority.
4. Regenerate the tree-layout baseline from the final live test corpus.
5. Remove all remaining wiring, documentation, vocabulary, and residue
   assertions that refer only to the retired system.
6. Verify focused guards, repository-wide quality, the slow lane, and package
   contents.

The implementation must not temporarily weaken assertions merely to obtain a
green result. Every retained assertion must have a clear current-state owner.

## Acceptance criteria

- HEAD contains no pre-move manifest, post-snapshot membership record,
  frozen-retirement receipt, temporary retirement evidence, retirement loader,
  historical hydrator, graduation command, or graduation workflow.
- Repository searches find no executable or documentary dependency on the
  removed mechanisms, except deliberate historical discussion in this design
  and predecessor design documents.
- The tree-layout baseline accurately represents the final live corpus and uses
  only current-state semantics.
- The retained layout, package, metadata, isolation, and reach guards pass.
- `npm run quality` passes.
- `npm run test:slow` passes.
- The package dry-run contains no Writing Studio article or publishing
  subsystem and no removed cleanup artifact.
- The complete change is delivered from the existing
  `claude/articles-book-publication-6a7dfe` branch and linked worktree.

## Non-goals

- No GitHub issue is created or bound; this remains an intentionally unbound
  cleanup chore.
- Defect #1421 and the terminal Review timer/resume behavior are not changed.
- The main checkout and its active #1367 work are not touched.
- No general history hydrator, retirement protocol, tombstone format, or
  automatic graduation mechanism is retained or introduced.
- Existing Git history is not rewritten or pruned.
- Closed-story receipts are not revalidated against current HEAD.

## Delivery

After this design and its implementation plan are approved, the reset will be
implemented and verified in the existing linked worktree. It will be delivered
as a corrective pull request from the existing cleanup branch. The failed
automation run creates no delivery dependency and no automation-generated pull
request will be merged.
