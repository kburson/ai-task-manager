### Strengths

- Reviewed `bcdbb85ff2527eefdea62cf5ebe84740e22e87a8..cf297b5466e35ae8d09b7b55b917b3ad4470c97b` against the three pinned requirement documents.
- The additive assignment gate preserves existing team-unassigned read behavior while rejecting zero, multiple, malformed, and foreign assignees.
- Persistent claims distinguish same-login sessions and worktrees, reject identity drift, and survive process restart.
- Registry writes use private files, complete staged bytes, file synchronization, non-overwriting publication, directory synchronization, and read-back.
- The original `assertStoryWriter` seed and canonical API signatures remain supported. Added runtime inventory accounting is explicit.
- The documentation accurately separates this foundation from later staging, publication, and handoff work.

### Issues

#### Critical

None found.

#### Important

1. **[P1] Detached async contexts retain native lock authority after release**

   **Location:** `scripts/task-tracker/lib/story-cache/writer-claim.mjs:307` and `scripts/task-tracker/issue-mutator-lock.mjs:365`.

   `acquireStoryWriter` trusts `currentIssueLockOwner`, but the native owner capability remains available through inherited `AsyncLocalStorage` after its owning `withIssueLock` frame finishes. A detached callback then takes the reentrant shortcut and passes the owner check without holding the physical lock.

   I reproduced acquisition by session A while session B held the genuine native lock. Minimal probe shape:

   ```js
   let release;
   const gate = new Promise((resolve) => {
     release = resolve;
   });
   let detached;

   await withIssueLock(
     { issue: 2042, projDir: root, sessionId: 'author-A' },
     async () => {
       detached = gate.then(() => acquireStoryWriter(inputForAuthorA));
     }
   );

   await withIssueLock(
     { issue: 2042, projDir: root, sessionId: 'author-B' },
     async () => {
       release();
       await detached;
     }
   );
   ```

   Observed output:

   ```text
   actual-holder author-B
   detached-acquisition author-A owned
   ```

   This breaks the required acquisition serialization and could overlap later flush or handoff operations. Native capabilities need an active lifetime check invalidated when the owning frame exits; reentrancy and owner accessors must reject stale detached contexts. Add this regression alongside the existing nested/sibling tests.

2. **[P2] Acquired-claim assertion accepts a missing owned cache**

   **Location:** `scripts/task-tracker/lib/story-cache/writer-claim.mjs:65–73`.

   The persistent assertion verifies the registry record but never checks the recorded cache. After acquiring a genuine claim and deleting its cache directory, this call succeeds:

   ```js
   assertStoryWriter(claim, {
     sessionId: claim.sessionId,
     worktree: claim.worktree,
     assignment: ['tester'],
   });
   ```

   I reproduced that behavior: `assert-with-missing-cache accepted`.

   The specified local guard must surface unavailable unpublished evidence. A consumer using the canonical assertion currently receives permission to proceed despite that loss. For acquired claims, validate the recorded cache’s existence and safe physical path before returning. Preserve the original pure seed behavior separately.

3. **[P2] Loss of an individual claim permits another worktree to acquire a replacement**

   **Location:** `scripts/task-tracker/lib/story-cache/writer-claim.mjs:312–331`.

   A missing claim file is treated as first acquisition. The only subsequent evidence check is whether the requesting worktree already has the cache. Consequently:

   - Worktree A owns a claim and retains unpublished cache content.
   - Its individual registry claim file disappears; the registry identity and namespace survive.
   - Worktree B requests the same issue with another session and no local cache.
   - This branch creates B’s cache and publishes a new claim.

   The surviving registry identity protects against namespace loss, but does not distinguish a never-claimed issue from a lost individual ownership record. A’s pending work is therefore bypassed without explicit handoff.

   This conclusion follows directly from the branch conditions; I did not run an additional linked-worktree reproduction. Retain durable per-issue claim-presence evidence, or another repository-wide ownership check, so partial registry loss refuses acquisition rather than becoming automatic takeover.

#### Minor

None requiring changes.

### Tests run and results

- Ran:

  ```sh
  node --test --test-name-pattern='^(?!linked worktrees)' \
    scripts/tests/unit/task-tracker/lib/story-cache/writer-claim.test.mjs \
    scripts/tests/integration/task-tracker/lib/story-cache/writer-claim.integration.test.mjs
  ```

  **Result: 61 passed, zero failed, zero skipped.** The runner included the existing linked-worktree fixture test despite the attempted exclusion. Its fixture setup and cleanup ran; I created no additional worktree manually.

- Ran an offline fixture probe covering detached native-lock authority and missing-cache assertion. Both reproduced findings 1 and 2.
- Ran an additional offline probe replacing an existing claim record with JSON `null` and removing its cache. Acquisition refused with `STORY_WRITER_UNAVAILABLE`; no owning replacement claim was returned.
- Probe files and directories stayed within the admitted runtime fixture location and were cleaned up.
- Did not run full `npm test`, network commands, native AITM commands, or estimation-history lookups. Parent-reported RED/GREEN history and broader regression results were not independently rerun.

### Recommendations

Repair the lock lifetime issue first, then add explicit regressions for acquired-claim cache loss and individual claim loss across worktrees. Re-run native nested/sibling lock coverage after changing capability lifetime checks.

### Declined to judge

- **Explicit handoff, export, reassignment, and recipient verification:** assigned to Task 8/#2056.
- **Public staging/publication routing and local-hook integration:** later plan slices; this change accurately avoids claiming them complete.
- **Locking independent machines or arbitrary GitHub editors:** explicitly outside the repository-local registry guarantee.
- **Authenticity and freshness of caller-supplied assignment observations:** this offline interface receives those observations; live observation collection belongs to its consumers.
- **Authenticating arbitrary plain claims through the original pure assertion seed:** the pinned contract explicitly requires that seed to succeed. Later consumers must distinguish that structural validation from persistent acquired-claim authority.
- **General cache payload validation and backup survival after arbitrary destruction:** owned by the accepted store and later recovery mechanisms. I did evaluate the writer guard’s handling of missing cache and ownership evidence.
- **Native lifecycle completion, issue state, CI success, merge, and delivery authority:** unavailable within this read-only offline review and not requested.

### Assessment

**Ready for this slice’s acceptance: With fixes.**

The core ownership and persistence design is conservative, and all 61 existing writer tests pass. The reproduced expired-lock authority and missing-cache guard gaps, plus the individual-claim-loss acquisition path, need resolution before consumers rely on this foundation.
