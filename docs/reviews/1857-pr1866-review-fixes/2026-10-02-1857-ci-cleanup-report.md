# #1857 / PR #1866 CI Cleanup Report

## Scope and identity

Commit `45f3a6bfec811b8e71ae66ae46c435e6e3aca300` resolves the known 36-file unit-test failure set from predecessor `0cf1905c95772ea85370d560095903daf371761d`. The correction is test-only: one shared fixture-actor helper and 36 legacy unit-test call sites, 37 changed files total.

Each test file initializes an explicit, unique, file-specific fake Claude session identity before exercising actor-owned state. The helper preserves production actor validation. Existing assertions, mocks, expectations, skips, and test bodies are unchanged, and no production file changed.

This report covers only the CI fixture cleanup and its reconciliation with newer trunk. It does not approve the whole PR, complete #1857 or C1–C5, or authorize lifecycle, migration, activation, cleanup, or release actions.

## Corrected failure class

The historical 36 failures recorded at `0cf1905c` came from legacy test fixtures invoking real actor-owned state without explicit fixture identity. The cleanup gives those fixtures the identity now required by the production contract.

The helper writes both `AI_TASK_MANAGER_SESSION_ID` and `AI_TASK_MANAGER_APP_NAME`. The repository unit runner isolates files in separate child processes, so one file's actor does not spill into another. Identity-fallback tests explicitly clear and restore the fixture identity around their fallback assertions.

Some compatibility fixtures still write legacy shared-state JSON directly. Their existing targeted assertions remain useful, but this cleanup does not turn shared legacy active state into general actor authority.

## Completed evidence

| Evidence                 |                               Result | Receipt                                                                                        |
| ------------------------ | -----------------------------------: | ---------------------------------------------------------------------------------------------- |
| Root full unit lane      |                 936/936 files passed | [1857-cleanup-full-unit.log.txt](ci-cleanup-receipts/1857-cleanup-full-unit.log.txt)           |
| Targeted cleanup batch   |                 225/225 tests passed | [1857-unit-cleanup-first.log.txt](ci-cleanup-receipts/1857-unit-cleanup-first.log.txt)         |
| Full lint                |                               Passed | [1857-cleanup-lint-final.log.txt](ci-cleanup-receipts/1857-cleanup-lint-final.log.txt)         |
| Full format check        |                               Passed | [1857-cleanup-format.log.txt](ci-cleanup-receipts/1857-cleanup-format.log.txt)                 |
| Independent Astra review | 61/61 passed; no actionable findings | [1866-astra-ci-cleanup-review.md.txt](ci-cleanup-receipts/1866-astra-ci-cleanup-review.md.txt) |

Astra reviewed the helper and all 36 current call sites. Its captured diff SHA256 is `6104b15de67376f94293028c24cc8f60de9a799c0c994899a1e49747f72ea9be`; helper SHA256 is `637cf6c6b1f12eed204696724c47c26262ac8e393c9943352b3b6c30d518d273`. The independent isolated batch covered 10 representative state-sensitive files and found no actionable defect in this bounded cleanup.

The [exact committed `45f3a6bf` unit rerun](ci-cleanup-receipts/1857-cleanup-45f3a6bf-unit.log.txt) also passed all 936 files. That result remains historical evidence for that checkpoint after subsequent corrections.

## Later bounded corrections

Checkpoint `5de3` added the guidance-provenance correction. Subsequent root fixes remain bounded to CI and fixture correctness:

- canonical actor identity and test Git working-directory setup;
- estimation fixtures, with 28/28 targeted tests passing;
- timing fixtures, with 24/24 plus 2/2 targeted tests passing;
- guidance provenance, with 48/48 targeted tests passing;
- rehearsal-helper isolation at its intended boundary; and
- the three exact CodeQL annotations: two escaped-literal findings and the Pause regular expression.

The Pause expression has retained RED/GREEN evidence: the old expression timed out under the adversarial case, while the corrected targeted batch passed 32/32.

The cleanup did not edit the five old #1558 raw final/residual fixture bytes that newer trunk legitimately changed. The merge preserves those incoming trunk bytes together with their Git provenance. Historical receipts outside that incoming trunk change remain preserved. This scope-relative statement supersedes any absolute claim that every old raw archive byte remained unchanged.

These are bounded fixes to exercised fixture, parser, and static-analysis paths. They do not complete the runtime, cleanup, installation, activation, or lifecycle scope assigned to C1–C5.

## New trunk boundary

PR #1868 merged as trunk commit `5b06fe9590d29e186d1b505dd0b2186f6ad8d236`. The repair branch merged that trunk at `e545522e467e484bd96db3b327fc8ccd0047c086`, with parents `01e06747` and `5b06fe95`.

Post-resolution focused evidence includes 37/37 Close tests passing and the refusal inventory passing. The older aggregate run against source `01e06747` was stopped when the user redirected work to the new trunk and is not a green receipt.

The exact post-merge source passed the full unit lane, 936/936 files, plus full lint and format checks. Focused verification also passed 37/37 Close tests and 49/49 guidance tests. Immutable logs and the [raw Astra merge review](ci-cleanup-receipts/1866-astra-merge1868-review.md.txt) are retained under [`ci-cleanup-receipts/`](ci-cleanup-receipts/), including the [full unit](ci-cleanup-receipts/1866-merge1868-full-unit.log.txt), [lint](ci-cleanup-receipts/1866-merge1868-lint.log.txt), and [format](ci-cleanup-receipts/1866-merge1868-format.log.txt) receipts.

After the earlier CodeQL checkpoint, one low-impact fixture-only correction added the `dotAll` flag to the `discover-promote-aged-bucket` regular expression. CodeQL annotation `110917335719` documents the old `01e06747` expression, and the existing integration case passes with the correction. This change does not alter production behavior.

The first pre-merge 230-file integration aggregate failed two stale guidance-report reads while guidance provenance was being recaptured. Guidance source/Close evidence subsequently changed and requires the new actual recapture; the stale-read failures are preserved as historical evidence rather than relabeled. A final pre-merge full unit lane passed 936/936 files, but it does not certify the later trunk merge.

## Post-merge verification snapshot

This snapshot records verification for merge commit `e545522e467e484bd96db3b327fc8ccd0047c086`. The repair branch was subsequently published at `e8410286b9fa73805f75f83e004b2b587a2d6e55` with the narrow fixture correction and current raw source data. This report will be committed separately.

| Gate                               | Status                   | Evidence                                                                                                                                                                   |
| ---------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full unit lane                     | **PASSED**               | 936/936 files at exact post-merge source                                                                                                                                   |
| Full lint and format               | **PASSED**               | exact post-merge source                                                                                                                                                    |
| Close and guidance focused batches | **PASSED**               | 37/37 Close and 49/49 guidance tests                                                                                                                                       |
| Refusal inventory                  | **PASSED**               | exact post-resolution source                                                                                                                                               |
| Local full integration lane        | **FILES PASSED; EXIT 1** | [232/232 files passed](ci-cleanup-receipts/1866-merge1868-full-integration.log.txt); 635.6s exceeded 600s runner ceiling                                                   |
| GitHub CI for published `e8410286` | **PASSED**               | CI run `37032077522`, fast job `110921131234`; unit 936 files in 67.4s and integration 232 files in 251.8s/600s; [full log](ci-cleanup-receipts/1866-ci-e841-fast.log.txt) |
| GitHub CodeQL                      | **PASSED**               | run `37032075185`; no open findings from the merged review                                                                                                                 |

The local integration runner returned exit 1 solely because its serial duration, 635.6 seconds, exceeded the fixed 600-second ceiling; all 232 files passed. The ceiling was not relaxed, and focused results were not subtracted from the aggregate. GitHub CI provides the authoritative fresh-head full-baseline pass for `e8410286`. GitHub also reported the published commit mergeable and `CLEAN`; the immutable [green-state capture](ci-cleanup-receipts/1866-ci-e841-green-state.json.txt) preserves that status with the check identities.

This documentation-only commit comes after the verified source snapshot, so its resulting head still requires the repository's normal CI verification. The results above certify their stated source boundaries; they do not pre-approve checks for a future head.

## Historical evidence and remaining limits

The earlier continuation handoff and its 36-of-936 failure result remain truthful historical evidence for `0cf1905c`; they must not be rewritten as if that candidate passed. The later `45f3a6bf` 936/936 unit result and the final pre-merge 936/936 result remain truthful for their exact checkpoints. The stopped `01e06747` run and two-failure stale-guidance integration run also retain their actual dispositions. The post-merge full unit result and published-source GitHub baseline are green. The local integration receipt separately preserves its all-files-passed result and time-ceiling exit.

Passing the cleanup tests does not complete the accepted #1857 remaining-work plan. Runtime transaction and migration work, writer adoption, cleanup capability, provider/install parity, combined exact-SHA verification, live activation, lifecycle approval, and operational admission remain assigned to C1–C5.

The original dirty `1857-artifact-writes` worktree at `d4c42d7809c22acc9576d51da8938952588c207e`, including its staged rename and uncommitted runtime candidate, remains untouched.
