# Story #2054 independent code review — round 1

<!-- cspell:words hardlinks EEXIST RDONLY ETIMEDOUT nonregular NONBLOCK writability nlink pointerless -->

## Raw reviewer report

### Review scope

Reviewed base `ae230541e4bf11fd0cf2aec2b4f474d28f8ccf88` through head `1958a5dd5b820babe932bb77af7c7ee86c60e4e3`, against Task 5, original technical Task 2, the governing specification, and the committed #2054 deep-dive/TDD records.

Reviewer model: inherited configuration; exact model unspecified. Review performed independently, offline, without agents or tracked-file changes.

### Strengths

- Complete bundle validation occurs before pointer publication and again after rewriting content-addressed references.
- Exclusive creation, expected-generation checks, retained immutable files, and read-back verification provide a coherent cooperative-writer protocol.
- Required file/directory synchronization includes reused payloads and the cache-to-project namespace.
- Identity, permissions, hardlinks, symlinks, traversal, and missing/corrupt pointers receive explicit checks.
- Existing tests cover meaningful failure boundaries and maintain separation from claim/freshness authority.

### Issues

#### Critical

None found.

#### Important

**1. Interrupted payload writes permanently poison their content-addressed destination.**

- **Location:** `scripts/task-tracker/lib/story-cache/store.mjs:146–160`
- The store creates the final immutable filename before writing its contents. A partial write followed by an I/O error leaves truncated bytes at that filename. Subsequent attempts to store the same intended bytes encounter `EEXIST`, read the truncated file, and fail with `immutable-collision`.
- **Independent reproduction:** Commit generation 1. Inject a `writeFile` wrapper for generation 2’s new baseline payload that writes its first three bytes, then throws. Reopen with normal filesystem operations and retry the identical generation 2.
- **Observed output:**
  ```text
  partial-payload first STORY_STORE_UNAVAILABLE simulated partial write
  partial-payload restart-generation 1
  partial-payload retry STORY_STORE_UNAVAILABLE immutable-collision
  ```
- The prior generation remains readable, but a transient persistence failure prevents future storage of those exact bytes without manual filesystem intervention. Changing unrelated generation metadata cannot avoid the poisoned payload hash.
- **Recommendation:** Write and sync bytes under a unique temporary name, then publish the complete file atomically with no-replace semantics. Preserve collision refusal for existing different bytes. Add a partial-write/restart/retry test; current before/after injection does not simulate truncated writes.

**2. FIFO payloads hang before the regular-file check can reject them.**

- **Location:** `scripts/task-tracker/lib/story-cache/store.mjs:118`
- `read()` opens paths with blocking `O_RDONLY` before checking `handle.stat()`. Opening a FIFO with no writer blocks indefinitely, so `regular()` never executes.
- **Independent reproduction:** Commit a valid generation, replace a referenced baseline payload with `mkfifo -m 600 <payload-path>`, and reopen the store in a child process.
- **Observed output after a 2,000 ms subprocess timeout:**
  ```text
  fifo result ETIMEDOUT signal SIGTERM stderr
  ```
- An unsafe nonregular file should produce the promised typed refusal; instead it hangs startup/read operations. The same path also handles the manifest pointer.
- **Recommendation:** Open read handles with `O_NONBLOCK`, then retain the descriptor-based regular-file check before reading. An additional preliminary `lstat` can improve rejection but should not replace `fstat`. Add FIFO refusal tests for both a referenced payload and `manifest.json`.

#### Minor

None.

### Independent verification

- `node --test scripts/tests/unit/task-tracker/lib/story-cache/*.test.mjs`
  - **207 passed, 0 failed**
  - Reported **62 before/after persistence failures**
  - Duration: **10,312.565584 ms**
- `node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`
  - **9 passed, 0 failed**
  - Actual package inventory exercised.
- Additional isolated probes confirmed both findings above.
- A separate first-publication probe injected failure immediately before pointer rename:
  ```text
  initial-before-rename commit STORY_STORE_UNAVAILABLE
  initial-before-rename retained 1
  initial-before-rename restart STORY_STORE_UNAVAILABLE read
  ```
  This preserves evidence and refuses hydration, but requires later recovery intervention despite no successful initial publication.

### Recommendations

Add partial-write/retry and nonregular-file rejection coverage before accepting the storage primitive. Existing failure-matrix tests establish prior-generation integrity, but do not establish continued writability after a truncated immutable-file write.

### Declined to judge

- Automatic recovery of an interrupted initial publication: characterized its fail-closed behavior above; recovery/adoption and cleanup policy belong to later slices.
- Stale-lock removal or ownership transfer: explicitly excluded; no lock stealing is required here.
- Claim ownership, assigned-human checks, and cloud freshness: later authorization owners; stored `claimId` is metadata.
- Cache retention, migration, purge protection, and operator handoff: later slices.
- Same-user directory replacement between path checks and operations: explicitly documented directory-fd TOCTOU limitation.
- Predecessor schema/domain-policy completeness: accepted dependencies, inspected only as necessary to evaluate store behavior.
- Physical power-loss guarantees and filesystem-specific durability semantics: process-level tests cannot establish them.
- Exact-head CI and native lifecycle receipts: network/cloud access prohibited for this review.

### Assessment

**Ready to merge? With fixes.**

The implementation preserves prior committed generations and passes its existing verification. Partial writes can nevertheless poison future commits, and FIFO cache files can hang operations instead of producing a typed refusal; both should be corrected before downstream storage users depend on this API.

## Raw technical clarification

Temp+rename is sufficient under the supported cooperative-writer model.

Hold `write.lock` throughout, check any existing final file with the current no-follow/regular-file/exact-byte checks, and refuse different bytes. If absent, create a unique same-directory temporary file, write and sync it, close it, rename it to the final name, then sync the containing directory.

Cooperative writers cannot create the destination between that check and rename because they share the exclusive lock. External same-user replacement falls within the documented limitation. A crash before rename leaves an unreferenced temporary file; afterward, the final file contains complete bytes.

I agree that hardlink publication introduces an avoidable `nlink === 2` crash state under the existing guard. No supported cooperative-writer reason requires it here.

## Author dispositions and verification

Accepted both Important findings at their reported severity. No Critical or Minor findings were reported. The author reproduced all three regression cases before changing production code: two FIFO subprocesses timed out, and partial-write retry failed immutable-collision. Original failures remain in .tmp/2054-review-red.log.

FIFO repair adds preliminary lstat regular-file/permission validation, O_NONBLOCK to read handles and the retained descriptor-based regular-file check. Both manifest and referenced-payload tests passed after the repair. Partial-write repair stages unique private temporary files in the same directory, writes/syncs/closes them, checks any final filename for exact-byte reuse and collision refusal, then atomically renames under the held cooperative writer lock and syncs the directory. Partial bytes remain unreferenced. The identical successor now commits after a failed truncated write and restart. Existing different final bytes are still refused. The reviewer explicitly accepted this approach in the retained clarification; no portable atomic no-replace guarantee against arbitrary same-user processes is claimed.

Final author verification: all 210 story-cache tests passed, including 30 storage tests and 72 injected before/after persistence failures. Focused ESLint and CSpell passed. The package's runtime inventory remains exactly one additional store module; round 1 independently verified the actual pack result 9/9. Native exact-head CI and lifecycle acceptance remain pending.

Rulings on every declined item:

- Interrupted initial publication: retain and refuse a pointerless generation rather than guess whether unpublished intent may be discarded. Recovery requires a later explicit recovery owner. Cost if wrong: unavailable initial cache until a deliberate recovery operation, with retained bytes.
- Stale locks and transfer: retain refusal; do not steal a lock or infer the owner died. Later ownership/handoff slices own settlement. Cost if wrong: explicit recovery is needed before further writes.
- Claim, assignment and freshness: store integrity is not a live authorization capability. Callers must supply the later claim/authority checks. Cost if wrong: misuse of the store alone would skip publication authorization; no such caller is introduced here.
- Retention, migration, purge and handoff: preserve scope separation and do not delete unknown temporary or retained generations. Later slices own policy. Cost if wrong: extra local files persist until governed cleanup.
- Same-user path replacement: retain the documented portable Node directory-fd limitation and cooperative-writer boundary. Existing symlink/nonregular checks remain mandatory. Cost if wrong: a hostile same-user process can still race path operations.
- Predecessor domain completeness: keep accepted schema contracts; this module adds persistence and reuses validation rather than redefining timing/batch semantics. Cost if wrong: a predecessor semantic defect requires its own correction before integration.
- Physical power loss: require actual sync operations and injected failures, while making no hardware/filesystem guarantee beyond their supported semantics. Cost if wrong: a filesystem that does not honor sync can lose acknowledged data.
- Exact-head CI and native receipts: the author must run those through the ordinary captured workflow after collateral is committed. Offline review is not a replacement. Cost if wrong: acceptance would be refused by native exact-head gates.
