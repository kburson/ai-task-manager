<!-- cspell:words EPERM -->

# #1861 focused verification evidence

The [evidence index](../2026-10-03-1861-empty-runtime-task2-local-tia-findings.json) replaces the former 1,562,105-byte JSON file. It retains the exact run metadata and links to focused findings by run and recorded error category. Each subset is at most 96 KiB.

All 4,450 located findings across 15 runs and all seven supplemental records are preserved, including names, locations, durations, detail text, raw-output references and their original ordering. Empty finding arrays remain represented by their run metadata. Unlocated aggregate failure counts remain explicit in the original metadata; no new locations are inferred.

These are historical observations. Recorded EPERM flags distinguish an observed error category, with no waiver or changed attribution. The run base is the original recorded base; it is not a claim that the committed base contains every tested overlay. Passes on a focused scope do not establish whole-candidate acceptance. Positive genuine-host admission, current cloud verification, independent code review and governed Test ingestion remain pending.

## Runs

The rows follow the original run order. Follow each findings link for its complete records. Exact base, phase, counters, exit and private raw-output references are in the index.

| Run                               | Selected files | Tests | Pass | Fail | Located findings | Subsets                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | -------------: | ----: | ---: | ---: | ---------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01-task2-recovery                 |            904 |  6584 | 5710 |  874 |              873 | [recorded-eperm 01](01-task2-recovery/recorded-eperm-01.json), [recorded-eperm 02](01-task2-recovery/recorded-eperm-02.json), [recorded-eperm 03](01-task2-recovery/recorded-eperm-03.json), [recorded-eperm 04](01-task2-recovery/recorded-eperm-04.json), [other-failures 01](01-task2-recovery/other-failures-01.json)                          |
| 02-linked-first                   |            906 |  6608 | 5734 |  874 |              873 | [recorded-eperm 01](02-linked-first/recorded-eperm-01.json), [recorded-eperm 02](02-linked-first/recorded-eperm-02.json), [recorded-eperm 03](02-linked-first/recorded-eperm-03.json), [recorded-eperm 04](02-linked-first/recorded-eperm-04.json), [other-failures 01](02-linked-first/other-failures-01.json)                                    |
| 03-linked-status-first            |            906 |  6613 | 5739 |  874 |              873 | [recorded-eperm 01](03-linked-status-first/recorded-eperm-01.json), [recorded-eperm 02](03-linked-status-first/recorded-eperm-02.json), [recorded-eperm 03](03-linked-status-first/recorded-eperm-03.json), [recorded-eperm 04](03-linked-status-first/recorded-eperm-04.json), [other-failures 01](03-linked-status-first/other-failures-01.json) |
| 04-bootstrap-first                |            293 |  2383 | 1910 |  473 |              473 | [recorded-eperm 01](04-bootstrap-first/recorded-eperm-01.json), [recorded-eperm 02](04-bootstrap-first/recorded-eperm-02.json), [other-failures 01](04-bootstrap-first/other-failures-01.json)                                                                                                                                                     |
| 05-bootstrap-next                 |            293 |  2385 | 1913 |  472 |              472 | [recorded-eperm 01](05-bootstrap-next/recorded-eperm-01.json), [recorded-eperm 02](05-bootstrap-next/recorded-eperm-02.json), [other-failures 01](05-bootstrap-next/other-failures-01.json)                                                                                                                                                        |
| 06-compatibility-red              |              2 |    19 |   11 |    8 |                8 | [other-failures 01](06-compatibility-red/other-failures-01.json)                                                                                                                                                                                                                                                                                   |
| 07-compatibility-retry-red        |              2 |    19 |   18 |    1 |                1 | [other-failures 01](07-compatibility-retry-red/other-failures-01.json)                                                                                                                                                                                                                                                                             |
| 08-compatibility-first            |             17 |   132 |  132 |    0 |                0 | No findings                                                                                                                                                                                                                                                                                                                                        |
| 09-compatibility-successor-red    |              2 |    20 |   19 |    1 |                1 | [other-failures 01](09-compatibility-successor-red/other-failures-01.json)                                                                                                                                                                                                                                                                         |
| 10-compatibility-successor        |             17 |   133 |  133 |    0 |                0 | No findings                                                                                                                                                                                                                                                                                                                                        |
| 11-compatibility-concurrency-next |              2 |    22 |   22 |    0 |                0 | No findings                                                                                                                                                                                                                                                                                                                                        |
| 12-null-control-red               |              2 |    26 |   25 |    1 |                1 | [other-failures 01](12-null-control-red/other-failures-01.json)                                                                                                                                                                                                                                                                                    |
| 13-task5-first                    |            908 |  6638 | 5764 |  874 |              873 | [recorded-eperm 01](13-task5-first/recorded-eperm-01.json), [recorded-eperm 02](13-task5-first/recorded-eperm-02.json), [recorded-eperm 03](13-task5-first/recorded-eperm-03.json), [recorded-eperm 04](13-task5-first/recorded-eperm-04.json), [other-failures 01](13-task5-first/other-failures-01.json)                                         |
| 14-final-cases                    |              3 |    29 |   28 |    1 |                1 | [other-failures 01](14-final-cases/other-failures-01.json)                                                                                                                                                                                                                                                                                         |
| 15-final-cases-observed           |              3 |    29 |   28 |    1 |                1 | [other-failures 01](15-final-cases-observed/other-failures-01.json)                                                                                                                                                                                                                                                                                |

## Supplemental records

These records retain the original evidence exactly, including incomplete execution, fixture corrections, the genuine-host refusal and the two observed cloud regressions.

- [01-linked-history-first](supplemental/01-linked-history-first.json)
- [02-linked-status-red](supplemental/02-linked-status-red.json)
- [03-admission-table](supplemental/03-admission-table.json)
- [04-admission-table-fixed](supplemental/04-admission-table-fixed.json)
- [05-concurrency-incomplete](supplemental/05-concurrency-incomplete.json)
- [06-genuine-host-refusal](supplemental/06-genuine-host-refusal.json)
- [07-cloud-ad03-red](supplemental/07-cloud-ad03-red.json)

## Integrity and reconstruction

The index records each subset's byte length and SHA-256, the original source commit and file hash, and a hash of the original JSON serialization. Reconstruction is checked against the entire original object, with no changed or missing fields. The original bytes also remain in Git at the source commit.

To reconstruct: validate every referenced byte length and SHA-256; place each finding at its recorded zero-based position; use the original key order and metadata to rebuild each run; restore the follow-up runs and supplemental records in their recorded order. The reconstructed JSON serialization must match the source canonical JSON SHA-256 recorded in the index.

The in-file spelling directive applies only to verbatim evidence text. It changes no test discovery, test selection, acceptance requirement, runtime authority or global configuration. The original monolith and complete raw outputs are also preserved in private collateral.

## Subsequent focused evidence

[Node 26 census repair](current-runs/node-label-census.json) preserves the later exact-head cloud failure, complete local RED/affected/unit runs, findings and raw-output hashes. It is separate from the original 39-subset reconstruction; the original records and index remain unchanged.

[Node 24 observed-label correction](current-runs/node24-mainthread-census.json) retains the actual failed cloud diagnostic, corrected attribution and complete later regression/affected/unit runs. The earlier Node 26 repair remains preserved as an incomplete first diagnosis.

## Final code review repair evidence

[Complete focused repair receipts](current-runs/final-review-fix.json) retain the four Important findings' actual RED/GREEN runs, the initial invalid child-code fixture run, final19-file/152-test canonical selection and sole unchanged native process-observation failure. [Full reviewer report and all author dispositions](../1861-final-code-review/README.md) keep code review separate from accepted design review and Test/delivery authority. Original4450 findings remain lossless and unchanged.

[Report-link verification correction](current-runs/review-report-links.json) preserves two failed cloud Markdown diagnostics, actual full833-file Markdown success, the documentation-only zero-test TIA selection and all six intentionally malformed retained-output lint findings. Source behavior and original evidence remain unchanged.
