# Protected work recovery and review queue

Owner: @kburson. Coordination story: [#1953](https://github.com/kburson/ai-task-manager/issues/1953). This is a reviewable recovery record, not implementation acceptance. Original working directories and indexes were preserved during capture; authorized worktree removal is recorded below.

## Review order and dependencies

1. Complete and review this index and provenance first; it does not change product behavior.
2. Derive narrow current-trunk project lookup/tether fixes from #1958 under #1954; retain current ownership and lifecycle rules.
3. Continue #1957 through the #1919/#1918 repair stack, then #1855/#1847. Reconcile #1928 and #1907; do not merge the aggregate directly to trunk.
4. Select applicable #1956 work onto the newer #1871 kernel; complete #1861/#1862 through the #1857 joint integration/release gates.
5. #1961–#1965 are closed and their PR branches deleted. Their representation and exact historical preservation are recorded in the retirement manifest below.
6. #1959/#1960 remain historical collateral/observations for a separate retention decision; #1981 is small #1514 planning provenance.
7. Curate evidence by its owning purpose and final source candidate, without bulk-merging historical raw logs or treating them as current acceptance.

These are review sequencing suggestions, not a claim that any source PR is ready to merge. Tests, lint and current independent review must be established on each chosen final branch.

## Originally protected groups

| Group | Owning story                                                    | Visible source PR                                                                                                            | Original branch stored on origin                           | Evidence files | Decision                                                                                    |
| ----- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------: | ------------------------------------------------------------------------------------------- |
| P01   | [#1861](https://github.com/kburson/ai-task-manager/issues/1861) | [PR](https://github.com/kburson/ai-task-manager/pull/1956)                                                                   | `codex/recovery-1861-wip-20261009`                         |           2736 | Review recovery PR and select applicable changes                                            |
| P02   | [#1918](https://github.com/kburson/ai-task-manager/issues/1918) | [PR](https://github.com/kburson/ai-task-manager/pull/1957)                                                                   | `codex/recovery-1918-wip-20261009`                         |            255 | Review recovery PR and select applicable changes                                            |
| D08   | [#1725](https://github.com/kburson/ai-task-manager/issues/1725) | [#1726](https://github.com/kburson/ai-task-manager/pull/1726), [#1724](https://github.com/kburson/ai-task-manager/pull/1724) | `codex/aitm-mcp-adapter-architecture`                      |            307 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| D09   | [#1953](https://github.com/kburson/ai-task-manager/issues/1953) | [PR](https://github.com/kburson/ai-task-manager/pull/1961)                                                                   | `codex/recovery-1953-cleanup-session-20261009`             |              6 | Review recovery PR and select applicable changes                                            |
| P04   | [#1859](https://github.com/kburson/ai-task-manager/issues/1859) | [PR](https://github.com/kburson/ai-task-manager/pull/1962)                                                                   | `codex/recovery-1859-ci-replay-20261009`                   |              0 | Review recovery PR and select applicable changes                                            |
| P05   | [#1859](https://github.com/kburson/ai-task-manager/issues/1859) | [PR](https://github.com/kburson/ai-task-manager/pull/1962)                                                                   | `codex/recovery-1859-ci-replay-20261009`                   |              0 | Review recovery PR and select applicable changes                                            |
| P06   | [#1725](https://github.com/kburson/ai-task-manager/issues/1725) | [PR](https://github.com/kburson/ai-task-manager/pull/1963)                                                                   | `codex/recovery-1725-interrupted-review-planning-20261009` |            131 | Review recovery PR and select applicable changes                                            |
| P07   | [#1953](https://github.com/kburson/ai-task-manager/issues/1953) | [PR](https://github.com/kburson/ai-task-manager/pull/1960)                                                                   | `codex/recovery-1220-local-test-observations-20261009`     |              0 | Review recovery PR and select applicable changes                                            |
| P08   | [#1954](https://github.com/kburson/ai-task-manager/issues/1954) | [PR](https://github.com/kburson/ai-task-manager/pull/1958)                                                                   | `codex/recovery-1207-assignment-wip-20261009`              |              2 | Review recovery PR and select applicable changes                                            |
| P09   | [#1953](https://github.com/kburson/ai-task-manager/issues/1953) | [PR](https://github.com/kburson/ai-task-manager/pull/1959)                                                                   | `codex/recovery-1558-review-invitation-20261009`           |              0 | Review recovery PR and select applicable changes                                            |
| P10   | [#1953](https://github.com/kburson/ai-task-manager/issues/1953) | [PR](https://github.com/kburson/ai-task-manager/pull/1964)                                                                   | `codex/recovery-1728-authority-observations-20261009`      |              7 | Review recovery PR and select applicable changes                                            |
| P11   | [#1926](https://github.com/kburson/ai-task-manager/issues/1926) | [#1927](https://github.com/kburson/ai-task-manager/pull/1927)                                                                | `codex/recovery-1953-p11-original-20261009`                |            281 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| P12   | [#1889](https://github.com/kburson/ai-task-manager/issues/1889) | [#1890](https://github.com/kburson/ai-task-manager/pull/1890)                                                                | `codex/recovery-1953-p12-original-20261009`                |             43 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| P13   | [#1897](https://github.com/kburson/ai-task-manager/issues/1897) | [#1898](https://github.com/kburson/ai-task-manager/pull/1898)                                                                | `codex/recovery-1953-p13-original-20261009`                |            348 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| P14   | [#1897](https://github.com/kburson/ai-task-manager/issues/1897) | Evidence in this PR                                                                                                          | `codex/recovery-1953-p14-original-20261009`                |             19 | Review evidence and classification under #1953                                              |
| P15   | [#1899](https://github.com/kburson/ai-task-manager/issues/1899) | [#1900](https://github.com/kburson/ai-task-manager/pull/1900)                                                                | `codex/recovery-1953-p15-original-20261009`                |            111 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| P16   | [#1902](https://github.com/kburson/ai-task-manager/issues/1902) | [#1903](https://github.com/kburson/ai-task-manager/pull/1903)                                                                | `codex/recovery-1953-p16-original-20261009`                |            113 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| P17   | [#1955](https://github.com/kburson/ai-task-manager/issues/1955) | [PR](https://github.com/kburson/ai-task-manager/pull/1965)                                                                   | `codex/recovery-1955-hybrid-insights-proposals-20261009`   |              2 | Review recovery PR and select applicable changes                                            |
| P18   | [#1904](https://github.com/kburson/ai-task-manager/issues/1904) | [#1905](https://github.com/kburson/ai-task-manager/pull/1905)                                                                | `codex/recovery-1953-p18-original-20261009`                |            156 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| D01   | [#1953](https://github.com/kburson/ai-task-manager/issues/1953) | Evidence in this PR                                                                                                          | `trunk`                                                    |            511 | Review evidence and classification under #1953                                              |

## Evidence and archives

Each unique meaningful local file is stored under evidence/ in the linked evidence PR branches with a manifest mapping its original path, owning group, original content hash and stored Git blob. Files already reachable from current origin were not duplicated. Large logs and metadata are individually gzip-compressed; their original SHA-256 and encoding are recorded. Source snippets ending .snapshot are inert copies for review, not runnable replacements.

49 archive/control snapshots were inspected. 46 original archived source HEADs are published as named origin branches in their owning repositories. Unique archive evidence was unpacked into individual files under evidence/archives/; recovery does not depend on retaining an opaque tarball. Generated dependency caches, Node compile caches, active runtime fixtures and generated test copies are explicitly classified as reconstructible instead of being presented as unfinished source.

See index.json for story/PR/branch ownership and archive details. file-dispositions.json.gz records every inspected disposition. Historical test logs remain historical evidence only; they do not certify the captured source HEADs.

## Evidence PRs

Review these as retention/provenance decisions after the owning source PR. They do not add executable product changes. The index PR deliberately remains small; payloads are grouped into bounded review diffs.

| Family                     | Owner story | Part | Files | PR                                                         |
| -------------------------- | ----------- | ---: | ----: | ---------------------------------------------------------- |
| local-and-archive-evidence | #1953       |  1/2 |   903 | [PR](https://github.com/kburson/ai-task-manager/pull/1967) |
| local-and-archive-evidence | #1953       |  2/2 |   613 | [PR](https://github.com/kburson/ai-task-manager/pull/1968) |
| 1725-architecture-evidence | #1725       |  1/1 |   438 | [PR](https://github.com/kburson/ai-task-manager/pull/1969) |
| 1861-runtime-evidence      | #1861       |  1/7 |   900 | [PR](https://github.com/kburson/ai-task-manager/pull/1970) |
| 1861-runtime-evidence      | #1861       |  2/7 |   900 | [PR](https://github.com/kburson/ai-task-manager/pull/1971) |
| 1861-runtime-evidence      | #1861       |  3/7 |   900 | [PR](https://github.com/kburson/ai-task-manager/pull/1972) |
| 1861-runtime-evidence      | #1861       |  4/7 |   900 | [PR](https://github.com/kburson/ai-task-manager/pull/1973) |
| 1861-runtime-evidence      | #1861       |  5/7 |   900 | [PR](https://github.com/kburson/ai-task-manager/pull/1974) |
| 1861-runtime-evidence      | #1861       |  6/7 |   900 | [PR](https://github.com/kburson/ai-task-manager/pull/1975) |
| 1861-runtime-evidence      | #1861       |  7/7 |   222 | [PR](https://github.com/kburson/ai-task-manager/pull/1976) |
| 1918-criteria-evidence     | #1918       |  1/1 |   343 | [PR](https://github.com/kburson/ai-task-manager/pull/1977) |
| publication-qa-evidence    | #1953       |  1/1 |   249 | [PR](https://github.com/kburson/ai-task-manager/pull/1978) |
| delivered-story-evidence   | #1953       |  1/2 |   900 | [PR](https://github.com/kburson/ai-task-manager/pull/1979) |
| delivered-story-evidence   | #1953       |  2/2 |   188 | [PR](https://github.com/kburson/ai-task-manager/pull/1980) |

Additional Superpowers task reports, publication QA images/PDFs and inert recovery-tool source copies are included in these evidence PRs. supplement-dispositions.json.gz records the final ignored-file sweep.

## Final coverage check

D10 (#1514) was clean but contained seven ignored planning/AC operator fragments. [PR #1981](https://github.com/kburson/ai-task-manager/pull/1981) stores them individually and records their provenance. #1514 is open and unassigned; @kburson owns this recovery review through #1953. The original planning was already merged in PR #1515; no new implementation acceptance is inferred.

The final source-preservation check found unchanged original HEADs, unchanged staged state (including the original staged rename), and no content drift across all six uncommitted-source/collateral captures. Three final helper scripts are preserved as inert source copies in [PR #1967](https://github.com/kburson/ai-task-manager/pull/1967).

There are 10 source/collateral recovery PRs, 15 evidence/planning review PRs, and this index PR. All were created as drafts. Capture itself performed no merges or deletions; subsequent cleanup and retirement are recorded below.

## Authorized stale-worktree cleanup completed 2026-10-10

After rechecking exact live origin heads and 17,541 meaningful file contents, 19 stale worktree paths and registrations were removed, including nested and broken test registrations. All original source and evidence branches were retained. Only the primary repository and active cleanup checkout remain registered.

The 55 previously unarchived Codex sessions whose actual workspace paths matched the removed trees were archived through the app API. Five matched sessions were already archived. The active cleanup chat remains available. The app API exposes archival, so permanent chat deletion was not performed.

The [cleanup receipt](cleanup-receipt-2026-10-10.json) records original worktree HEADs, removed paths, associated session IDs, retained checkouts, authorization, and final verification. This records cleanup, without changing implementation or merge readiness.

## Obsolete recovery PR retirement

The user requested closing superseded or obsolete PRs and deleting their branches. The selected set is #1961–#1965. [The retirement manifest](retired-prs/manifest.json) records exact original heads, reasons, current-trunk representation and individual retained byte snapshots. No unique historical file depends on a retired branch for storage.

| PR    | Disposition                                                                               |
| ----- | ----------------------------------------------------------------------------------------- |
| #1961 | Temporary cleanup hook settings; retain operational history only.                         |
| #1962 | CI replay source already shipped, including corrected integration/meta placement.         |
| #1963 | Architecture already delivered; retain excluded experiment and obsolete setup as history. |
| #1964 | Authority evaluator already shipped with stronger identity checks.                        |
| #1965 | SQLite authority proposals superseded by accepted ADR0002; retain research only.          |

The .snapshot files preserve exact bytes without installing hooks, weakening current code, or restoring old plans as active execution instructions. Current work continues in #1956–#1958 and the remaining evidence/planning PRs. Retirement is complete: #1961–#1965 are closed, their five PR branches are absent from origin and local heads, and all retained snapshot blobs were verified. No source was merged, no owning issue was closed, and the remaining source/evidence PRs stay open.
