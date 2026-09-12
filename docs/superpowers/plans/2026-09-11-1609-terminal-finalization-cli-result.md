# #1609 Terminal Finalization CLI Result Implementation Plan

**Goal:** Make successful terminal peer-review finalization return a successful
CLI result and consume the fixed patch release in AITM.

## Task 1: Repair and verify the upstream CLI

**Files:** `src/cli/run.mjs`, `test/integration/finalization.test.mjs`

1. Add a regression that invokes the real package CLI after constructing an
   accepted normal review.
2. Confirm the first finalization currently exits 1 after committing.
3. Make `writeResult` null-safe without changing nonterminal rendering.
4. Confirm first finalization and retry both exit zero, retain one commit, and
   retain one terminal event.
5. Run upstream unit, golden, integration, packaging, smoke, MCP, lint, and
   format checks.

## Task 2: Publish patch version 0.2.1

**Files:** `package.json`, `package-lock.json`

1. Update both package manifests to `0.2.1` without creating a tag.
2. Commit and push the exact reviewed release head; open and merge its PR after
   hosted CI passes.
3. Create a signed annotated `v0.2.1` tag on the merged release commit and push
   only that tag.
4. Monitor the Release workflow until npm and GitHub publication pass.
5. Verify the registry version, tarball integrity, release tag target, and
   GitHub release.

## Task 3: Consume and guard the patch in AITM

**Files:** `package.json`, `package-lock.json`,
`scripts/tests/integration/review/peer-review-finalization-cli.test.mjs`, and
`scripts/tests/integration/review/peer-review-package-parity.test.mjs`

1. Install exact `ai-peer-review@0.2.1` and verify lockfile integrity.
2. Add the public-CLI host regression for author-only finalization and retry.
3. Update the existing exact package-version assertion.
4. Run the focused test and the complete governed AITM verification lanes.
5. Deliver #1609, then resume #1516.
