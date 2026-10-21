### Review scope

Independent read-only review of Task 9 / #2057.

- Base: `c08f3a26673656511322956f818b40238853c36a`
- Head: `7698014fa784d63d24bba1113a4ecdf9e5e7f9de`
- Governing requirements: active Task 9 at `0ad57329`, technical Task 3 at `f2894455`, specification at `dafb1d`, and committed #2057 deep-dive/audit rulings.

No source, index, HEAD, branch, or repository files were changed. Verification used disposable fixture roots only. No network, GitHub, AITM lifecycle, or subagent calls were made. HEAD remained the reviewed commit and the checkout remained clean.

### Strengths

- The implementation preserves native registry authority and claim identity while transferring the complete owner tuple.
- Source freezing precedes export publication, and independent inventories cover opaque journal bytes alongside native generations and payloads.
- Recipient read-back retains a separate archive. Forged return values alone cannot authorize pointer replacement.
- Native binding inspection avoids initializing missing caches or registries, and checks occur before terminal-ledger/location mutations.
- Existing integration tests exercise real Git roots, native issue locks, changed assignment, byte drift, ownership drift, and completed replay.
- The pure claim validator extraction preserves the existing validation behavior. All five added runtime modules receive explicit package-presence assertions.

### Issues

#### Critical

None found.

#### Important

**1. An interrupted acknowledgment publication permanently blocks matching retries**

Location: `scripts/task-tracker/lib/story-cache/writer-handoff-io.mjs:312-315`, with early callers at `writer-handoff.mjs:314-317`.

`publishFile` publishes metadata through a hardlink from its retained stage, then removes that stage. An interruption after the acknowledgment link succeeds but before stage removal leaves a legitimate acknowledgment with `nlink === 2`.

Both sender retry and recipient retry call `existingAck` before any recovery of the acknowledgment metadata. `acknowledgment` uses ordinary `readMetadata`, which rejects the two-link file. Neither path reaches `publishMetadata`/`recoverAlias`, so the exact retained acknowledgment cannot reconcile.

Independent reproduction:

1. Create the existing native handoff fixture with a recipient filesystem proxy.
2. For `.writer-handoff/received/<transferId>.json`, execute the real `fs.linkSync`, then throw `EIO` once.
3. Retry the same transfer twice with the fault disabled.

Observed:

```text
ack attempt 1 STORY_HANDOFF_UNAVAILABLE acknowledgment ack link response lost
ack attempt 2 STORY_HANDOFF_UNAVAILABLE file
ack attempt 3 STORY_HANDOFF_UNAVAILABLE file
owner after retries author-A
ack nlink 2
```

Impact: a supported publication crash window leaves the original owner frozen indefinitely despite complete retained bytes and an exact acknowledgment. The existing receiver-ack interruption test throws before the link occurs and therefore misses this case.

Recommendation: add explicit matching-intent recovery for acknowledgment stage aliases before ordinary acknowledgment validation. Continue rejecting unknown or nonmatching hardlinks. Add an after-link lost-response regression.

**2. Same-cache session handoff cannot settle the former session’s binding**

Location: `scripts/task-tracker/lib/story-cache/writer-handoff-bindings.mjs:144-146`.

The settlement dispatcher identifies the current owner using only worktree equality. In a supported same-cache transfer from session A to session B, both sessions share that worktree. A later settlement request for former session A therefore enters `cleanGeneration` instead of checking A’s completed explicit transfer.

Independent reproduction:

1. Create the native fixture containing pending work and its opaque publication journal.
2. Set the recipient to session `author-B` in the source worktree/cache.
3. Perform the transfer successfully.
4. Call:

```js
assertStoryBindingSettled({
  projectRoot: fixture.root,
  issue: 2057,
  sessionId: 'author-A',
});
```

Observed:

```text
STORY_HANDOFF_UNAVAILABLE binding-opaque-directory
```

Ownership has correctly moved to B, but A cannot release its old binding through the integrated native boundary. Without the opaque journal, pending generation data also makes the clean-owner path refuse.

Impact: the supported same-cache transfer completes ownership movement but fails its old-binding settlement behavior. The current recipient must remain protected without treating the former session as the current owner.

Recommendation: distinguish the requesting session from the current owner when dispatching settlement. Verify an exact completed transfer for the former session while retaining refusal for the current recipient’s pending work. Add paired former-owner/current-owner regressions for same-cache handoff.

**3. The final assignment check can validate a different human from the committed recipient**

Location: `scripts/task-tracker/lib/story-cache/writer-handoff.mjs:248-254`, and `assigned` at lines `64-69`.

The recipient tuple is checked before awaiting the final assignment callback. After that await, `assigned` compares the returned assignment with mutable `target.human`, while `ctx.commit` uses the original recipient stored in the manifest. There is no subsequent target-tuple check.

Independent reproduction using the existing fixture:

```js
let reads = 0;
fixture.target.assignment = async () => {
  if (++reads === 2) {
    fixture.target.human = 'replacement';
    return ['replacement'];
  }
  return ['tester'];
};
await transfer(fixture);
```

Observed:

```json
{
  "status": "transferred",
  "assignmentReads": 2,
  "lastAssignment": ["replacement"],
  "committedHuman": "tester",
  "targetHuman": "replacement"
}
```

Impact: the pointer commits recipient `tester` even though the final assignment observation names only `replacement`. This defeats the final assignment gate when the supported asynchronous callback or another caller changes the target during that awaited boundary. No filesystem tampering or forged acknowledgment is needed.

Recommendation: validate assignment against the captured destination human and recheck the complete target tuple after the awaited assignment observation, before commit. Add a regression that changes the tuple during the second assignment callback.

#### Minor

None identified.

### Independent verification

Executed:

```sh
node --test \
  scripts/tests/unit/task-tracker/lib/story-cache/handoff.test.mjs \
  scripts/tests/integration/task-tracker/lib/story-cache/handoff.integration.test.mjs \
  scripts/tests/integration/task-tracker/lib/story-cache/handoff-bindings.integration.test.mjs
```

Result: **83 tests passed; zero failures, cancellations, or skips**.

Separately executed three disposable-fixture probes reproducing all three findings above. These probes were inline review commands, not committed test additions. The acknowledgment probe attempted the same transfer three times.

The broad suite, large-inventory recovery test, full lint/format, package build, and cloud CI were not rerun. Historical counts in the implementation audit were not treated as independent verification.

### Declined to judge

- **Public writer activation, cloud publication, and model calculation:** deliberately deferred by the active Task 9 boundary.
- **Actual remote assignment freshness, authentication, and captured cloud-read provenance:** caller-owned observations under the accepted local primitive contract; no network calls were permitted or performed.
- **Arbitrary foreign-host adoption and independent-machine serialization:** expressly excluded by the accepted shared-host/native-registry ruling.
- **Hostile same-user filesystem fabrication or arbitrary direct invocation of internal proof helpers:** outside the accepted cooperative local ownership boundary; the report does not claim cryptographic recipient attestation.
- **Survival after destruction of all retained cache/registry evidence:** explicitly excluded by the governing specification and deep-dive ruling.
- **Hardware power-loss durability and filesystem-specific fsync guarantees:** inspected structurally but not physically tested; injected lost-response failures do not establish those guarantees.
- **Multi-hop transfer followed by delayed cleanup of an earlier source binding:** considered but not independently exercised; no acceptance claim is made for that sequence.
- **Redesign of the preexisting pure, unacquired claim-validation seed:** retained compatibility behavior, distinct from acquired native registry authority.
- **Live workflow admission, issue state, commit tracing, cloud CI, and eventual Close readiness:** administrative acceptance remains with the executor; this review performed no lifecycle or cloud verification.

### Recommendations

Repair the three Important findings and add focused regressions for each. Preserve conservative ownership retention and exact alias validation while fixing recovery and settlement; no broader takeover or cleanup permission is needed.

### Assessment

**Ready to merge: No.**

The implementation establishes a strong preservation boundary, and the independently executed existing tests pass. However, a realistic acknowledgment crash cannot recover, same-cache handoff cannot settle the former binding, and asynchronous target mutation can bypass the final assignment check. These defects should be fixed before Task 9 acceptance.
