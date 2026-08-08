# GitHub-Native Authority Records Integration Evidence

This artifact closes delivery-sequence Task 16 for #1067. It freezes the
integration boundaries, child/review audit, preserved pre-pivot history,
clean-consumer proof, and the commands required to reproduce the final result.

## Frozen boundaries

| Boundary                                    | Value                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Governing design reference                  | `098c9e084bf82e19aee8615794ab0e196718d9a8`                                              |
| Actual #1067 / #1048 merge base             | `6c3c45e8fc5a95b438ed6b6bbf9b1ff9779add1f`                                              |
| Last predecessor before Task 16             | `3c1cb9199c8e9765d74824f773140bb3eabfa365` (#1177)                                      |
| #1048 integration ref observed during audit | `c71eec20e9465ac21f4e8246a7746699bc7d8bd9`                                              |
| Final nested-epic SHA                       | The enclosing #1088 commit, frozen in #1088's commit-trace and exact-SHA review comment |

A Git commit cannot contain its own hash without changing that hash. The final
SHA is therefore published in the governed issue evidence that reviews this
file. This artifact fixes every predecessor and ancestry boundary needed to
reproduce it.

## Child-to-commit map

The live sub-issue graph contained 30 direct children at audit time. Before the
enclosing #1088 commit, 29 were closed with reason `completed`; #1088 was the
only open child. Every closed child had complete Acceptance Criteria and
Verification Commands, an Agent Review pass, a commit trace, and a reachable
attributed commit.

The table records each primary delivery story's complete attributed span and
count. `first … last` means the ordered set produced by the reproduction command
below, not every unrelated commit between those SHAs.

| Order | Issue | Attributed commits                                                                      | Count | State                   |
| ----: | ----: | --------------------------------------------------------------------------------------- | ----: | ----------------------- |
|     1 | #1068 | `fe1425f85f18fa2c60e350eacf6a22a25cba28fb` … `1301e4e2041ed1b620211e03bc15f893cdf67941` |     3 | closed/completed        |
|     2 | #1069 | `3ce12b3260ec21cb9daa27982f0bacb71f1f4b2c` … `1df5d2804eaca914997c7a71833c7813d4a57cb3` |    14 | closed/completed        |
|     3 | #1070 | `ae465c2caeb8525675becb8ffb794b03700f8db7` … `863086bb40aeed3d49ed730604b99663423119ec` |    11 | closed/completed        |
|     4 | #1071 | `ee243fa05b9efc053942d57994a47566759190d6` … `731a762e0bf826e06634021709e86ee8963dd59c` |     6 | closed/completed        |
|     5 | #1072 | `091f5134dd0f848feeb83b1aed3947dd16f15e32` … `879ff038daa2874cb08090b1efe4b24abc035e71` |     6 | closed/completed        |
|     6 | #1073 | `f1778578ed486d4f94885ffeb5d09973a719d35d` … `a03ac00b51fd5cfcdf3295a513bcb040566bee13` |     5 | closed/completed        |
|     7 | #1075 | `df273263d5ffdeefdb8cdfd0ced4ccbc81635122` … `e3fab5c8680c0617fd5d2fb1b7e6728c46137a8b` |    10 | closed/completed        |
|     8 | #1077 | `43d37d315a09bb7daaafc7fe7a55f76585840146` … `0133018ff6b57270b5bd3d058ba22fdeff12435f` |    20 | closed/completed        |
|     9 | #1079 | `3f39ab69c78f00767382b41a4d398a0f4d0c30af` … `e1785f5545d4e3d0fa1987b73cf68dc7b905bc21` |     3 | closed/completed        |
|    10 | #1081 | `6a803cca01466d11fb86018d63ad7abd1c0439db`                                              |     1 | closed/completed        |
|    11 | #1083 | `b5aabdd3598794cee63c4046e266d982424cb66b`                                              |     1 | closed/completed        |
|    12 | #1084 | `5c136abfc2ecd654bda68ed6335773e3b1731c93`                                              |     1 | closed/completed        |
|    13 | #1085 | `87dd339d74f84f335265528899075e43feab053d`                                              |     1 | closed/completed        |
|    14 | #1086 | `b2f27bc40d90cee8eb007e92fa8d2026f87eba4f`                                              |     1 | closed/completed        |
|    15 | #1087 | `4ad8ea7bff36c98290351a07aaf7bcac27be4c2f`                                              |     1 | closed/completed        |
|    16 | #1088 | Enclosing commit, published in governed exact-SHA evidence                              |     1 | final integration story |

Discovered work integrated directly under #1067:

| Issue | Commit                                     | Purpose                                        |
| ----: | ------------------------------------------ | ---------------------------------------------- |
| #1113 | `b2d34edb73bd5a70ccf590a4f718fe913cfa0be4` | Package-entry attribution repair               |
| #1114 | `489953f9e0461e3883bc6c2b2c548ad3c2308f14` | `pull-next` bind preservation                  |
| #1115 | `91655677ce3b9d9cdf2cd0714ab1207cf84ae391` | Numeric lifecycle record normalization         |
| #1118 | `d1344b33d5e44267d5f6ebf7742c3dd3990b7c15` | AC and VC contract-source decomposition        |
| #1119 | `377d7945d800f3171a428691c4e158d259c0bf3d` | DoD and evidence contract-source reads         |
| #1120 | `68042566243dcd7d2e9c634d11fa7a0a253528ee` | Delivery Contract envelope support             |
| #1143 | `79fd61bc47a6b6df1798c40511a4f42fc8d99c36` | Test and Review lifecycle evidence reads       |
| #1144 | `4999049aefd68249739699e17bf9475a28d0e402` | Approval and close lifecycle evidence reads    |
| #1156 | `3997d80855b0f418cd10fcc30f7bd18902cfdcf6` | Concurrent fleet test isolation                |
| #1157 | `5d39c60aa9c4cbdf5f9437eb1f849707bcd4cb15` | Bounded unit-lane sections                     |
| #1160 | `bc6d23417b43e59d6ee3dca33623d0ffb0c97219` | Merged-HEAD Test receipt acceptance            |
| #1161 | `53e7d9185a86d43770d45c3968a8e76693e6fae5` | Approval re-entry carrier refresh              |
| #1172 | `69763b30add75a1ebf362bd02c284e67b814a231` | Stale Full-Auto footnote removal               |
| #1177 | `3c1cb9199c8e9765d74824f773140bb3eabfa365` | Legacy trailing attribution read compatibility |

Reproduce every exact attributed set from the final SHA:

```bash
git log --reverse --format='%H%x09%s' <final-sha> --grep='\[#1068\]'
git log --reverse --format='%H%x09%s' <final-sha> --grep='\[#1069\]'
# Repeat for each issue in the two tables.
node scripts/task-tracker/verify-epic-trail.mjs 1067 <final-sha>
```

The primary stories' first attributed commits are monotonically ordered. Defects
appear at the point where their blocker was discovered; they do not reorder the
governing delivery sequence.

## Review-evidence compatibility

- #1068 and #1069 predate structured Test receipt markers. Their timelines each
  contain a final `## ✓ Sandboxed verification passed` comment at the mapped SHA,
  complete command checklists, Agent Review evidence, final approval, and
  Full-Auto audit comments.
- #1114 retains the historical unchecked visible `Final Review Passed` line that
  led to #1161. Its timeline contains an exact-SHA automated semantic review,
  `review:approved` timing, a passing Test receipt, and the durable
  `aitm-full-auto-approval` audit. The stale projection is preserved as historical
  evidence rather than rewritten.
- #1177 preserves the older trailing `[#N]` commit convention in immutable
  history while allowing only the epic-derived reader to recognize it. New
  commit writers and general attribution readers remain leading-token strict.

## Preserved and superseded work

The rejected database-backed branch tips remain retrievable and are not merged
wholesale:

| Remote archive branch                               | Exact tip                                  |
| --------------------------------------------------- | ------------------------------------------ |
| `origin/codex/archive-1053-pre-github-native-pivot` | `c71eec20e9465ac21f4e8246a7746699bc7d8bd9` |
| `origin/codex/archive-1054-pre-github-native-pivot` | `51780578f0ee0bdeaae7fb099ea287a00f553eda` |

Issues #1053 through #1064 and #1066 are closed `not planned` where superseded by the
GitHub-native sequence. #1054's two commits remain recovery-pattern evidence.
Issues #1049, #1050, and #1065 remain closed historical deliveries on the archived
line, not prerequisites for #1067. #1051 remains an independent open local
worktree-environment issue under #1048.

## Clean-consumer package proof

The working tree was packed and installed into a newly created npm consumer with
no AITM database, database service, hosted API, or database configuration. The
installed `aitm help` executable initialized successfully.

| Field                                 | Observed value                             |
| ------------------------------------- | ------------------------------------------ |
| Package                               | `@kburson/ai-task-manager@1.0.0`           |
| Tarball                               | `kburson-ai-task-manager-1.0.0.tgz`        |
| Tarball SHA-1                         | `2dd7a0f011e913746613b05cdc729129c88f95a3` |
| Entries                               | 621                                        |
| Packed / unpacked bytes               | 1,319,790 / 4,323,163                      |
| Declared runtime dependencies         | `espree@^10.4.0`                           |
| Installed transitive dependency names | 5                                          |
| Database dependencies                 | none                                       |
| Database configuration supplied       | none                                       |
| Packaged CLI help                     | passed                                     |

The tarball digest is a pre-commit packaging observation; the enclosing commit's
review receipt is the canonical final-SHA verification. GitHub remains the only
required remote authority. IndexedDB is rebuildable Insights state and cannot
satisfy lifecycle or coordination gates.

## Verification matrix

The enclosing #1088 exact-SHA Test and Review receipts are authoritative for the
final result. They must record green results for:

```bash
node --test scripts/task-tracker/tests/integration/lib/github-records-initialization.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check
npm pack --dry-run --json
node scripts/task-tracker/verify-epic-trail.mjs 1067 HEAD
```

The record integration suite also proves a full directory-governed lifecycle does
not mutate the issue body and that GitHub observations rebuild the complete
expected read model.

## Exact #1048 integration delta

At audit time, #1048 and #1067 had diverged from merge base
`6c3c45e8fc5a95b438ed6b6bbf9b1ff9779add1f`:

- #1048 ref `c71eec20` had 157 unique commits;
- #1067 pre-final ref `3c1cb919` had 312 unique commits;
- the #1067 merge-base delta changed 511 files with 67,443 insertions and 2,925
  deletions before the enclosing documentation commit.

This is not a fast-forward integration. The parent coordinator must preserve the
archive refs, freeze the final #1088 SHA from its review evidence, and reconcile
the two unique histories intentionally. Reproduce the handoff with:

```bash
git merge-base feature/epic/1048 <final-sha>
git rev-list --left-right --count feature/epic/1048...<final-sha>
git diff --stat feature/epic/1048...<final-sha>
git log --oneline feature/epic/1048..<final-sha>
git log --oneline <final-sha>..feature/epic/1048
```

No #1048 merge, rebase, push, or parent closure is part of #1088.
