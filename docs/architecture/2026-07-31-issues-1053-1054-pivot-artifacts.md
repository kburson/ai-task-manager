# Issues 1053 and 1054 Pivot Artifact Record

**Captured:** 2026-07-31
**Reason:** Preserve all pre-pivot work before replacing database-backed
work-lease authority with GitHub-native authority records.

## Summary

Issues [#1053](https://github.com/kburson/ai-task-manager/issues/1053) and
[#1054](https://github.com/kburson/ai-task-manager/issues/1054) were both in
Develop when the architecture changed. Neither branch was reachable on GitHub
before this capture. Both exact tips are now preserved on dedicated remote
archive branches.

The branches are historical evidence and salvage sources. They are not approved
for direct integration into the GitHub-native implementation.

## Preserved References

| Issue | Local branch         | Exact tip                                  | Remote archive                                                                                                                             |
| ----- | -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| #1053 | `feature/epic/1053`  | `c71eec20e9465ac21f4e8246a7746699bc7d8bd9` | [`codex/archive-1053-pre-github-native-pivot`](https://github.com/kburson/ai-task-manager/tree/codex/archive-1053-pre-github-native-pivot) |
| #1054 | `feature/child/1054` | `51780578f0ee0bdeaae7fb099ea287a00f553eda` | [`codex/archive-1054-pre-github-native-pivot`](https://github.com/kburson/ai-task-manager/tree/codex/archive-1054-pre-github-native-pivot) |

Both branches descend from `origin/trunk` commit
`6c3c45e8fc5a95b438ed6b6bbf9b1ff9779add1f`.

No worktree, local branch, or archived remote branch was deleted during
capture.

## Issue 1053 Artifact Inventory

### State at capture

- GitHub state: Open
- Project state: Develop
- AITM session: stopped and unbound before Chore documentation began
- Worktree: clean
- Local branch tip: `c71eec20e9465ac21f4e8246a7746699bc7d8bd9`
- Delta from `origin/trunk`: 157 commits, 392 changed files,
  53,256 insertions, and 5,039 deletions

The branch contains the work associated with the broader #1048 authority
program, including:

- #1050 review-epoch authority changes;
- #1049 SQLite/HTTPS work-lease foundation;
- #1065 bounded verification and package evidence;
- work-lease plans, specs, package files, fixtures, and operator documentation;
  and
- extensive lifecycle, fleet, review, close, and orchestration modifications.

### Reusable findings

- Review and approval must be bound to the current Review epoch and verified SHA.
- Stale actors require monotonic fencing or authority epochs.
- Fleet data is observational and cannot grant authority.
- Crash recovery requires stable operation IDs, idempotent replay, and exact
  read-back.
- Package verification must inspect actual packed artifacts.
- Test lanes need deterministic bounded partitions when aggregate execution is
  vulnerable to process contention.
- Full-Auto records must distinguish automated approval from human approval.

### Rejected implementation assumptions

- main-worktree `.db/aitm/project.sqlite` as shared local authority;
- `@kburson/aitm-ledger` SQLite lease storage as the primary distributed model;
- an authenticated HTTPS/PostgreSQL authority as a required cloud path;
- environment-local lease databases that disappear with a cloud worker;
- lease-store receipts as the final GitHub lifecycle truth; and
- hosted infrastructure as a prerequisite for cross-workstation coordination.

### Disposition

Issue #1053 is superseded as a delivery epic. The remote archive remains readable for
targeted archaeology. The new nested epic may port storage-neutral invariants
through new failing tests, but must not merge the branch wholesale.

## Issue 1054 Artifact Inventory

### State at capture

- GitHub state: Open
- Project state: Develop
- AITM session: already stopped; the issue timing log records the architectural
  pivot pause
- Worktree: clean
- Base: #1053 tip `c71eec20e9465ac21f4e8246a7746699bc7d8bd9`
- Unique commits: 2
- Unique delta: 5 files changed, 991 insertions, 2 deletions

### Unique commits

1. [`34fd3709`](https://github.com/kburson/ai-task-manager/commit/34fd3709)
   — `[#1054] feat(lease): add lifecycle journal core`
2. [`51780578`](https://github.com/kburson/ai-task-manager/commit/51780578)
   — `[#1054] fix(lease): enforce lifecycle crash boundaries`

### Files

- `scripts/task-tracker/lib/work-lease/lifecycle-orchestration.mjs`
- `scripts/task-tracker/session-state.mjs`
- `scripts/task-tracker/state.mjs`
- `scripts/task-tracker/tests/helpers/work-lease-lifecycle-fixtures.mjs`
- `scripts/task-tracker/tests/unit/lib/work-lease-lifecycle.test.mjs`

### Fresh capture verification

Executed at the preserved tip:

```bash
node --test scripts/task-tracker/tests/unit/lib/work-lease-lifecycle.test.mjs
```

Result: 10 tests passed, 0 failed.

The focused suite proves the archived implementation's internal contract. It
does not approve the SQLite/HTTPS architecture and is not substitute evidence
for a GitHub-native implementation.

### Reusable invariants

- Create stable operation identity before any externally observable mutation.
- Reject credentials, bearer material, token names, and non-durable values from
  persisted records.
- Treat request, receipt, and completed checkpoint attachments as immutable.
- Derive projection identities from stable operation identity.
- Complete projections in a declared order.
- Authorize cleanup only from exact committed replay proof.
- Keep repair state intact after unavailable, rejected, or mismatched replay.
- Clear recovery state only when the expected operation and old authority fence
  still match.
- Inject crashes at each write boundary and prove deterministic recovery.

### Database-specific coupling

The implementation imports canonical request, response, and replay contracts
from `@kburson/aitm-ledger`; stores sticky lease/holder/binding state in local
session files; and treats lease mutation receipts as authority. Those concrete
types do not carry into the GitHub-native design.

### Disposition

Issue #1054 is superseded by the new append-first lifecycle-transition child. That
child must port the reusable invariants as RED tests against GitHub capsules,
record-chain heads, contract epochs, coordinator grants, and singleton revision
repair. It must not cherry-pick either archived commit.

## Historical Neighbor Issues

| Issue       | Disposition                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| #1049       | Remains closed as historical work-lease-foundation delivery on the archived branch; not a new-architecture prerequisite |
| #1050       | Remains closed; its Review-epoch findings are salvage candidates and must be revalidated against current trunk          |
| #1055–#1064 | Unimplemented lease-specific scopes are superseded by new GitHub-native children                                        |
| #1065       | Remains closed as historical verification/package evidence                                                              |
| #1066       | Old work-lease final gate is superseded by the new nested epic's final integration child                                |

## Retention Rules

1. Do not delete either remote archive branch until the GitHub-native nested epic
   is integrated and its final evidence links this record.
2. Do not delete the local #1053 or #1054 worktree merely to clean the fleet.
3. Do not force-update either archive branch.
4. Any salvaged behavior cites the original commit and the new regression that
   re-establishes it.
5. Any later cleanup verifies the archive ref through `git ls-remote` before
   removing local state.

## Governing Pivot Documents

- `docs/decisions/0002-github-native-authority-records.md`
- `docs/superpowers/specs/2026-07-31-github-native-authority-records-design.md`
- `docs/superpowers/plans/2026-07-31-github-native-authority-records.md`
