### Strengths

Reviewed repair range `cf297b5466e35ae8d09b7b55b917b3ad4470c97b..57eeb00d5f2a3db7a5918254d043b14fe7bdef7b`, retaining overall baseline `bcdbb85ff2527eefdea62cf5ebe84740e22e87a8`.

- The live capability set fixes detached callbacks that begin acquisition after their native owning frame exits.
- Acquired-claim assertions now reject missing cache directories and symlink replacement without recreating storage or polling.
- The durable presence record closes individual claim-loss takeover across worktrees. Publishing it before cache creation also makes incomplete acquisition refuse subsequent implicit adoption.
- Presence contains ownership identifiers only; pending content remains in `.tmp/gh`.
- The original pure assertion seed and existing team-unassigned reads remain supported.
- The author dispositions explicitly address every first-round finding and declined boundary. Their correction is accepted: Task 8/#2056 owns shared registry reference APIs; Task 9/#2057 owns explicit handoff.

### Issues

#### Critical

None found.

#### Important

1. **[P1] Acquisition can publish after its borrowed native lock expires during an await**

   **Location:** `scripts/task-tracker/lib/story-cache/writer-claim.mjs:373–374`; the corresponding existing-owner continuation is at lines 349–353.

   Native owner lifetime is checked only when the acquisition callback enters. When acquisition starts inside an outer native lock but its promise is not awaited by that outer callback, it passes the live-owner check and then yields in `openStoryStore`. The outer lock exits. Acquisition subsequently publishes its final claim while another session holds the physical lock.

   I reproduced this at the reviewed head:

   ```js
   let detached;

   await withIssueLock(
     { issue: 2042, projDir: root, sessionId: 'author-A' },
     async () => {
       detached = acquireStoryWriter(inputForAuthorA);
     }
   );

   await withIssueLock(
     { issue: 2042, projDir: root, sessionId: 'author-B' },
     async () => {
       await detached;
     }
   );
   ```

   Using the supported injected registry filesystem, I inspected native authority at the final claim write:

   ```text
   actual-holder author-B
   final-claim-owner null physical-holder author-B
   unawaited-acquisition owned author-A
   ```

   Thus the repair rejects an already-expired capability at entry, but does not prevent an admitted operation from continuing after expiry. This still violates acquisition serialization with future flush/handoff consumers.

   Revalidate the same live owner capability after asynchronous store operations and before final publication or successful existing-claim return. Refuse conservatively if the original owner expired; do not adopt another frame’s owner. Add the unawaited-start regression alongside the expired-before-entry regression.

#### Minor

None requiring changes.

### Tests run and results

Ran:

```sh
node --test \
  scripts/tests/unit/task-tracker/lib/story-cache/writer-claim.test.mjs \
  scripts/tests/integration/task-tracker/lib/story-cache/writer-claim.integration.test.mjs \
  scripts/tests/unit/task-tracker/lib/issue-lock-reentrancy.test.mjs \
  scripts/tests/integration/task-tracker/lib/lock-env-leak-regression.test.mjs \
  scripts/tests/integration/task-tracker/lib/issue-lock-pid-liveness.test.mjs \
  scripts/tests/integration/task-tracker/lib/issue-worktree-publication.test.mjs \
  scripts/tests/unit/task-tracker/lib/plan-publication-recovery.test.mjs
```

**Result: 84 passed, zero failed, zero skipped.**

This independently verifies the new repair tests, genuine nested locking, sibling contention, inherited environment behavior, stale-process handling, linked-worktree publication, and selected publication recovery.

Also ran the offline continuation probe above in an admitted runtime fixture. It reproduced the remaining P1. Fixture data was cleaned up. No source, index, HEAD, issue, or app metadata edits were made.

I did not rerun full `npm test`, full lint, formatting, CI, or the author’s historical RED/GREEN sequence. Parent-reported results are not independent evidence from this review.

### Recommendations

Close the asynchronous continuation gap before consumers rely on this foundation. The new presence record should remain retained when that refusal occurs, preserving the current conservative recovery policy.

### Declined to judge

- **Task 8/#2056 `registerStoryWriter`/`resolveStoryWriter` implementation:** a subsequent slice; I assessed conservative compatibility of this foundation without claiming those APIs complete.
- **Task 9/#2057 explicit handoff/export/reassignment and recipient verification:** a subsequent slice; no transfer or release mechanism is claimed here.
- **Public staging/publication routing and local-hook integration:** subsequent accepted slices.
- **Locking independent machines or arbitrary GitHub editors:** outside the repository-local registry guarantee.
- **Authenticity and freshness of caller-supplied assignment observations:** collected by native consumers; this offline API validates the supplied bounded observation.
- **Authenticating arbitrary plain claims through the original pure seed:** the pinned technical contract requires that structural seed to succeed. Acquired claims receive the stronger persistent checks.
- **General payload integrity and survival after simultaneous destruction of all ownership and pending artifacts:** accepted store/recovery responsibilities; no backup survival guarantee is claimed.
- **Native lifecycle, full CI, merge, and delivery authority:** not requested or established by this read-only review.

### Assessment

**Ready for this slice’s acceptance: With fixes.**

The cache-loss and individual-claim-loss findings are resolved, and 84 focused tests pass. The remaining reproducible asynchronous lock-lifetime gap must be fixed before acceptance.
