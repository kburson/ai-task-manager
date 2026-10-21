# Story #2054 independent code review — round 2

<!-- cspell:words NONBLOCK -->

## Raw reviewer report

### Repair review scope

Reviewed `1958a5dd5b820babe932bb77af7c7ee86c60e4e3` through `6aa87b3296a3ee54ce767707f023fd1e761d2ac3`, including production repairs, regression tests, and recorded author dispositions. Review remained offline and read-only.

Reviewer model: inherited configuration; exact model unspecified.

### Strengths

- Both round-1 Important findings are resolved.
- Preliminary regular-file validation, `O_NONBLOCK`, and retained descriptor validation prevent FIFO reads from hanging.
- Unique temporary files isolate partial writes from immutable destinations. Files are written, synced, and closed before atomic publication under the cooperative writer lock.
- Exact-byte checks preserve collision refusal before staging and immediately before publication.
- The namespace regression correctly identifies the final `manifest.json` rename after introducing intermediate payload renames.

### Issues

- **Critical:** None.
- **Important:** None remaining.
- **Minor:** None.

### Independent verification

Command:

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/*.test.mjs
```

Observed:

```text
Injected 72 before/after persistence failures
tests 210
pass 210
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 14133.078959
```

The passing suite includes both FIFO regressions and identical-successor retry after a partial payload write.

Additional independent temporary probes:

1. **Partial generation-metadata write:** Wrote three bytes into a generation staging file, then threw. Reopening retained generation 1; retrying the identical successor committed generation 2.

   ```text
   partial-generation failure STORY_STORE_UNAVAILABLE partial generation
   partial-generation prior 1
   partial-generation retry 2
   ```

2. **Conflicting destination installed during staging:** Created different bytes at the intended final payload path while its staging file was being written. Publication refused, preserved generation 1, and left the conflicting destination unchanged.

   ```text
   collision-during-stage failure STORY_STORE_UNAVAILABLE immutable-collision
   collision-during-stage prior 1
   collision-during-stage destination collision
   ```

`git diff --check 1958a5dd5b820babe932bb77af7c7ee86c60e4e3..HEAD` completed successfully with no output.

Package-boundary tests were independently verified **9/9** in round 1. They were not repeated because the repair changes neither package inclusion nor inventory declarations.

### Recommendations

No additional changes requested within this slice.

### Declined to judge

- Automatic recovery/adoption after interrupted initial publication: later recovery owner; current behavior retains evidence and refuses hydration.
- Stale-lock removal and ownership transfer: later ownership/handoff policy; automatic lock stealing remains prohibited.
- Claim ownership, assignment, and cloud freshness: outside this persistence primitive.
- Retention, migration, purge protection, and temporary-file cleanup: later slices.
- Arbitrary same-user path replacement between checks and rename: documented limitation; cooperative writers remain serialized.
- Predecessor schema/domain-policy completeness: accepted dependencies, not repair targets.
- Physical power-loss guarantees beyond supported filesystem synchronization semantics: not established by injected process-level tests.
- Exact-head CI and native lifecycle receipts: prohibited network/cloud access; offline review does not establish them.

### Assessment

**Ready to merge? Yes, for the reviewed storage slice.**

Both reported defects are repaired, the full story-cache suite passes, and additional probes confirm retry after partial metadata writes and refusal to overwrite conflicting destination bytes. Native CI and lifecycle acceptance remain separate requirements.

## Author disposition

Accepted the clean repair review. No additional actionable findings remain and no further production change is made after this report. Preserve the two round-1 fixes and their observed regression evidence. The independently passing suite is 210/210 with 72 injected failure cases; package verification remains the actual 9/9 result from round 1.

All eight declined topics retain their individual round-1 rulings and costs: initial-publication recovery, stale locks/transfer, live claim/assignment/freshness authority, retention/migration/cleanup, same-user path races, predecessor domain semantics, physical durability limits and exact-head CI/native receipts. None is silently waived by a clean offline review. The later owners must supply their own policy and authority; the author still requires final committed-head CI and native lifecycle acceptance for this child.
