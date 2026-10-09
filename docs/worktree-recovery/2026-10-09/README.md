# Protected work recovery and review queue

Owner: @kburson. Coordination story: [#1953](https://github.com/kburson/ai-task-manager/issues/1953). This is a reviewable recovery record, not implementation acceptance. Original working directories and indexes were preserved.

## Review order and dependencies

1. Review this index and provenance first; it does not change product behavior.
2. Review #1958 / story #1954 to decide which assignment/tether changes remain applicable to current trunk.
3. Review #1956 before updating #1871; runtime kernel work belongs to #1861 and the #1857 integration/release gates.
4. Review #1957 with #1907 and #1928; the criteria-revision repair branch targets the #1855 integration branch. Do not merge it directly to trunk out of stack order.
5. Review #1962 for the three retained #1859 CI replay changes, then #1963/#1964 for historical planning/evaluator reconciliation. Compare against shipped behavior before choosing any code.
6. Review #1965 / story #1955 as historical proposals against current GitHub-native authority; no approval of a local authority database is implied.
7. #1959 and #1960 are collateral/observations. #1961 is temporary cleanup configuration and must not become a permanent hook-disable default.

These are review sequencing suggestions, not a claim that any source PR is ready to merge. Tests, lint and current independent review must be established on each chosen final branch.

## Protected groups

| Group | Owning story | Visible source PR | Original branch stored on origin | Evidence files | Decision |
|---|---|---|---|---:|---|
| P01 | [#1861](https://github.com/kburson/ai-task-manager/issues/1861) | [PR](https://github.com/kburson/ai-task-manager/pull/1956) | `codex/recovery-1861-wip-20261009` | 2736 | Review recovery PR and select applicable changes |
| P02 | [#1918](https://github.com/kburson/ai-task-manager/issues/1918) | [PR](https://github.com/kburson/ai-task-manager/pull/1957) | `codex/recovery-1918-wip-20261009` | 255 | Review recovery PR and select applicable changes |
| D08 | [#1725](https://github.com/kburson/ai-task-manager/issues/1725) | [#1726](https://github.com/kburson/ai-task-manager/pull/1726), [#1724](https://github.com/kburson/ai-task-manager/pull/1724) | `codex/aitm-mcp-adapter-architecture` | 307 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| D09 | [#1953](https://github.com/kburson/ai-task-manager/issues/1953) | [PR](https://github.com/kburson/ai-task-manager/pull/1961) | `codex/recovery-1953-cleanup-session-20261009` | 6 | Review recovery PR and select applicable changes |
| P04 | [#1859](https://github.com/kburson/ai-task-manager/issues/1859) | [PR](https://github.com/kburson/ai-task-manager/pull/1962) | `codex/recovery-1859-ci-replay-20261009` | 0 | Review recovery PR and select applicable changes |
| P05 | [#1859](https://github.com/kburson/ai-task-manager/issues/1859) | [PR](https://github.com/kburson/ai-task-manager/pull/1962) | `codex/recovery-1859-ci-replay-20261009` | 0 | Review recovery PR and select applicable changes |
| P06 | [#1725](https://github.com/kburson/ai-task-manager/issues/1725) | [PR](https://github.com/kburson/ai-task-manager/pull/1963) | `codex/recovery-1725-interrupted-review-planning-20261009` | 131 | Review recovery PR and select applicable changes |
| P07 | [#1953](https://github.com/kburson/ai-task-manager/issues/1953) | [PR](https://github.com/kburson/ai-task-manager/pull/1960) | `codex/recovery-1220-local-test-observations-20261009` | 0 | Review recovery PR and select applicable changes |
| P08 | [#1954](https://github.com/kburson/ai-task-manager/issues/1954) | [PR](https://github.com/kburson/ai-task-manager/pull/1958) | `codex/recovery-1207-assignment-wip-20261009` | 2 | Review recovery PR and select applicable changes |
| P09 | [#1953](https://github.com/kburson/ai-task-manager/issues/1953) | [PR](https://github.com/kburson/ai-task-manager/pull/1959) | `codex/recovery-1558-review-invitation-20261009` | 0 | Review recovery PR and select applicable changes |
| P10 | [#1953](https://github.com/kburson/ai-task-manager/issues/1953) | [PR](https://github.com/kburson/ai-task-manager/pull/1964) | `codex/recovery-1728-authority-observations-20261009` | 7 | Review recovery PR and select applicable changes |
| P11 | [#1926](https://github.com/kburson/ai-task-manager/issues/1926) | [#1927](https://github.com/kburson/ai-task-manager/pull/1927) | `codex/recovery-1953-p11-original-20261009` | 281 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| P12 | [#1889](https://github.com/kburson/ai-task-manager/issues/1889) | [#1890](https://github.com/kburson/ai-task-manager/pull/1890) | `codex/recovery-1953-p12-original-20261009` | 43 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| P13 | [#1897](https://github.com/kburson/ai-task-manager/issues/1897) | [#1898](https://github.com/kburson/ai-task-manager/pull/1898) | `codex/recovery-1953-p13-original-20261009` | 348 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| P14 | [#1897](https://github.com/kburson/ai-task-manager/issues/1897) | Evidence in this PR | `codex/recovery-1953-p14-original-20261009` | 19 | Review evidence and classification under #1953 |
| P15 | [#1899](https://github.com/kburson/ai-task-manager/issues/1899) | [#1900](https://github.com/kburson/ai-task-manager/pull/1900) | `codex/recovery-1953-p15-original-20261009` | 111 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| P16 | [#1902](https://github.com/kburson/ai-task-manager/issues/1902) | [#1903](https://github.com/kburson/ai-task-manager/pull/1903) | `codex/recovery-1953-p16-original-20261009` | 113 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| P17 | [#1955](https://github.com/kburson/ai-task-manager/issues/1955) | [PR](https://github.com/kburson/ai-task-manager/pull/1965) | `codex/recovery-1955-hybrid-insights-proposals-20261009` | 2 | Review recovery PR and select applicable changes |
| P18 | [#1904](https://github.com/kburson/ai-task-manager/issues/1904) | [#1905](https://github.com/kburson/ai-task-manager/pull/1905) | `codex/recovery-1953-p18-original-20261009` | 156 | Already delivered; review evidence and reconcile provenance, no duplicate implementation PR |
| D01 | [#1953](https://github.com/kburson/ai-task-manager/issues/1953) | Evidence in this PR | `trunk` | 511 | Review evidence and classification under #1953 |

## Evidence and archives

Each unique meaningful local file is stored under evidence/ in the linked evidence PR branches with a manifest mapping its original path, owning group, original content hash and stored Git blob. Files already reachable from current origin were not duplicated. Large logs and metadata are individually gzip-compressed; their original SHA-256 and encoding are recorded. Source snippets ending .snapshot are inert copies for review, not runnable replacements.

49 archive/control snapshots were inspected. 46 original archived source HEADs are published as named origin branches in their owning repositories. Unique archive evidence was unpacked into individual files under evidence/archives/; recovery does not depend on retaining an opaque tarball. Generated dependency caches, Node compile caches, active runtime fixtures and generated test copies are explicitly classified as reconstructible instead of being presented as unfinished source.

See index.json for story/PR/branch ownership and archive details. file-dispositions.json.gz records every inspected disposition. Historical test logs remain historical evidence only; they do not certify the captured source HEADs.

## Evidence PRs

Review these as retention/provenance decisions after the owning source PR. They do not add executable product changes. The index PR deliberately remains small; payloads are grouped into bounded review diffs.

| Family | Owner story | Part | Files | PR |
|---|---|---:|---:|---|
| local-and-archive-evidence | #1953 | 1/2 | 900 | [PR](https://github.com/kburson/ai-task-manager/pull/1967) |
| local-and-archive-evidence | #1953 | 2/2 | 613 | [PR](https://github.com/kburson/ai-task-manager/pull/1968) |
| 1725-architecture-evidence | #1725 | 1/1 | 438 | [PR](https://github.com/kburson/ai-task-manager/pull/1969) |
| 1861-runtime-evidence | #1861 | 1/7 | 900 | [PR](https://github.com/kburson/ai-task-manager/pull/1970) |
| 1861-runtime-evidence | #1861 | 2/7 | 900 | [PR](https://github.com/kburson/ai-task-manager/pull/1971) |
| 1861-runtime-evidence | #1861 | 3/7 | 900 | [PR](https://github.com/kburson/ai-task-manager/pull/1972) |
| 1861-runtime-evidence | #1861 | 4/7 | 900 | [PR](https://github.com/kburson/ai-task-manager/pull/1973) |
| 1861-runtime-evidence | #1861 | 5/7 | 900 | [PR](https://github.com/kburson/ai-task-manager/pull/1974) |
| 1861-runtime-evidence | #1861 | 6/7 | 900 | [PR](https://github.com/kburson/ai-task-manager/pull/1975) |
| 1861-runtime-evidence | #1861 | 7/7 | 222 | [PR](https://github.com/kburson/ai-task-manager/pull/1976) |
| 1918-criteria-evidence | #1918 | 1/1 | 343 | [PR](https://github.com/kburson/ai-task-manager/pull/1977) |
| publication-qa-evidence | #1953 | 1/1 | 249 | [PR](https://github.com/kburson/ai-task-manager/pull/1978) |
| delivered-story-evidence | #1953 | 1/2 | 900 | [PR](https://github.com/kburson/ai-task-manager/pull/1979) |
| delivered-story-evidence | #1953 | 2/2 | 188 | [PR](https://github.com/kburson/ai-task-manager/pull/1980) |

Additional Superpowers task reports, publication QA images/PDFs and inert recovery-tool source copies are included in these evidence PRs. supplement-dispositions.json.gz records the final ignored-file sweep.
