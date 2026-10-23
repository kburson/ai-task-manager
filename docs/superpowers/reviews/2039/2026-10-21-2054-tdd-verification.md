# Story #2054 verification

Bound scope: Task 5, crash-safe immutable cache generation storage. Source and concrete protocol are retained in 2026-10-21-2054-deep-dive.md. The implementation adds store.mjs, its exact focused verifier and exactly one runtime package inventory entry. No ownership, publication, cleanup or historical estimation policy is added.

## Observed test sequence

- Initial verifier failed with ERR_MODULE_NOT_FOUND for story-cache/store.mjs; no production module existed. The first implementation passed 21 focused tests.
- A new directory durability test failed because the parent of a newly created .tmp directory was not synced. Required parent-directory sync made it pass; 22 focused tests passed.
- Reused immutable files failed a test proving they were not synced again before a new manifest. Revalidation now syncs existing exact bytes and their directory; 23 passed. This covers an earlier failed file sync leaving a file that exists but lacks acknowledged durability.
- Two recovery-inventory tests failed: a deleted pointer plus a symlinked empty manifests directory incorrectly returned null, and a missing manifests directory leaked an untyped ENOENT. Recovery inventory now receives the same contained/private directory validation and a typed refusal; both passed.
- An existing-namespace test failed because only leaf directories were synced before pointer publication. Commits now flush the complete cache-to-project namespace before payload publication, covering interrupted directory initialization. Combined story-cache verification passed 206/206.
- Added a compatibility test for separate baseline and working comment blocks without changing production code. Final focused storage verification passed 27/27. It explicitly retains comment inventory and exact body/comment bytes across reopen.

The persistence matrix injected 62 failures, before and after every observed file-creation, write, file/directory sync, rename and lock-removal boundary of a normal successor commit. Each fresh read returned a complete validated old or new generation, with original baseline bytes retained. Failure after pointer replacement is reported as unavailable, never claimed to have rolled back. Existing crash locks refuse writes without stealing ownership; verified reads remain available. These are process-level injected I/O tests, not a physical power-loss experiment or a claim of immunity to arbitrary same-user directory replacement.

## Commands and results

- `node --test scripts/tests/unit/task-tracker/lib/story-cache/store.test.mjs`: final 27 passed, zero failed.
- `node --test scripts/tests/unit/task-tracker/lib/story-cache/*.test.mjs`: 206 passed before the final additive comment characterization; existing 180 predecessor tests remained green.
- `node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`: 9 passed, zero failed, using the actual npm pack inventory. Exactly one new runtime store module is declared; test helpers and review collateral stay outside the runtime package.
- Focused ESLint, CSpell, Prettier and diff-whitespace checks were run during development. Native exact-head CI and Test receipts remain required before acceptance.

Local logs retained under .tmp/2054-*.log include missing-module RED, directory RED/GREEN, reused-file RED/GREEN, inventory RED, namespace RED, combined output, final comment output and package output. These logs are supporting local data, not invented native receipts. The accepted publication protocol, expected-generation race refusal and manifest checksum validation remain necessary; this store does not confer a live claim or cloud-freshness capability.

## Review repairs and final verification

Independent round 1 reproduced partial-write poisoning and FIFO blocking. The author observed three regression failures before repairs: payload FIFO and manifest FIFO child processes timed out, and retry after a truncated payload failed immutable-collision. Preliminary file validation, nonblocking descriptor opens and retained descriptor checks now refuse both FIFO cases. Unique same-directory staged files are synced and closed before atomic rename under the exclusive store lock; exact-byte collision checks still refuse unexpected final content. Retry after partial write now succeeds without discarding prior bytes.

Final author and independent repair-review suites both passed all 210 story-cache tests, including 30 storage tests and 72 injected before/after persistence failures. Independent probes additionally proved identical-successor retry after partial generation-metadata writes and collision refusal when a different destination appeared during staging. Round 2 requests no further changes. Full raw reports, the technical clarification and individual author dispositions are retained in both code-review-round files. Final native CI and lifecycle results are recorded by the ordinary workflow after these documents are committed.
