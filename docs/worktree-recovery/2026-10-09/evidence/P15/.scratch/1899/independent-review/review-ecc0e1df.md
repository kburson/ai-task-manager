# Independent whole-branch #1899 review

Reviewed head: ecc0e1dfe9f9984de602488c6e85c534d35bc31a.
Base: 15faa18e18b31a5965a15d0482750c6c0b9d125d.
Worktree: /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1899-cloud-coverage.
Branch: codex/1899-cloud-coverage.
PR: https://github.com/kburson/ai-task-manager/pull/1900.

## Assessment

With fixes: one actionable P2 at the configured-prerequisite/targeted-classification boundary. Complete seven-file review, not a subset review. All46 affected tests pass at the exact head, but the isolated public Test fixture below demonstrates a missed failed-prerequisite case. No source/config/issue/CI/PR changes or native Test/lifecycle stage actions were performed.

## Strengths and requirement coverage

The optional coverage declaration is opt-in and closed to command/requires keys. Every entry is validated before a provider is returned, including unused entries. Command keys preserve allowlisted argv boundaries with JSON identity; whitespace/quote aliases map without shell interpretation. Requirements are nonempty, unique, configured Test classifications of kind test. Unknown/empty/non-Test references, rejected commands, normalized coverage duplicates and overlap with configured executable commands refuse. Normalized configuration and returned plans are frozen.

Only matching declarations become derived steps. Unused mappings grant no outcome. Uncovered/rejected declarations remain in targeted validation. Source spelling is retained for issue outcome matching, while identical source declarations are deduplicated. Derived labels avoid configured test-covered-N names. Native Test uses actual configured results and emits execution receipts only for actual/reused commands, with no fake npm receipt for derived suites. Multi-prerequisite ordinary cases require all successes. Node/no-coverage/empty-coverage defaults remain unchanged.

The repository config adds only two mappings, npm test and npm run test:slow, requiring the real test-cloud-complete wrapper. Read the actual unchanged verify-ci-receipts.mjs implementation: it verifies authenticated exact source run identity and successful completion, one workflow attempt, all unit/integration/slow aggregate and worker artifacts, lane inventory/counts, worker exit/output/timing agreement, and tested merge-parent identity where applicable. This makes the mapping explicit and grounded; no semantic inference from the classification name is introduced. Its genuine exact-head execution remains a later delivery prerequisite.

Current public plan from the fresh live issue/config is retained in coverage-inventory-and-current-plan.json: executable whole suites are empty, both suites are derived only, and cloud verifier plus affected declarations remain executable.

## Important finding — P2: a targeted result can overwrite a failed configured prerequisite

Changed consumer: scripts/task-tracker/lib/verification-providers/project.mjs:52–54.
Allocator: scripts/task-tracker/lib/verification-provider-registry.mjs:178 and191.
Observable downstream derivation: scripts/task-tracker/verbs/test.mjs:1138–1141.

A valid configured Test step can be named test-targeted-1. Coverage requires that exact configured classification. Appending the first uncovered issue command assigns the same test-targeted-1 classification, because targetedSteps does not reserve configured classifications. The new derived outcome then uses the last result in byClassification, which is the uncovered command, rather than the configured prerequisite.

Public-seam reproduction: use the committed runCloudCoverageFixture configuration and I/O boundary, changing only the configured prerequisite classification/requires from test-cloud-complete to test-targeted-1. The actual cloud argv returns exit1; the uncovered affected argv returns exit0. Results contain two test-targeted-1 entries (false then true). Both derived npm suites report passed:true despite their failed prerequisite. The overall Test remains failed, and no successful Test receipt is emitted; this is not a demonstrated task promotion bypass. It is nevertheless a direct violation of the accepted failed-prerequisite result rule and misreports the suite outcomes.

Evidence:
- classification-collision-probe.mjs: inert scratch diagnostic built from committed fixture definitions, rebinding relative imports to the unchanged current public implementation; no product mutation.
- classification-collision-probe.json: exact executed fixture argv and results, overall failed status, both derived suites incorrectly true.
- boundary-probes.json: real registry plan contains duplicate configured/targeted classifications under the same valid input.

Fix: allocate targeted classifications against all already-used configured classifications (and ensure no configured/executed/derived ambiguity), or refuse collisions before execution. Keep the coverage requirements bound to their actual configured steps rather than allowing a later unrelated result to shadow them. Add public registry and Test regressions for a configured test-targeted-N prerequisite plus uncovered check, including failed configured/pass uncovered and distinct execution identities. Do not fix by renaming only this repository's one classification, weakening receipt validation, or inferring cloud names.

## Reviewed inventory

Allseven changed files read fully, plus the full diff:
1. .ai-task-manager/task-tracker.json — existing ordinary configuration preserved; explicit coverage adopted.
2. docs/guides/non-javascript-verification.md — optional grammar, trust boundary, honest derived outcomes.
3. docs/superpowers/plans/2026-10-05-1899-project-provider-cloud-coverage.md — complete approved38-line plan.
4. scripts/task-tracker/lib/verification-provider-registry.mjs — closed normalization, ordering, freezing, allowlist and allocator.
5. scripts/task-tracker/lib/verification-providers/project.mjs — declaration partition and derived plan.
6. scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs — entire684-line file; real exported Test seam with mocked external I/O and honest receipt assertions.
7. scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs — entire435-line file, existing defaults and added refusals.

Exact bytes/lines/SHA inventory: coverage-inventory-and-current-plan.json. Residual unreviewed changed paths: none.
Additional seams inspected: Test provider validation before setup, actual execution/derived loop, receipt creation/reuse and classification validation, complete allowlist tokenizer/rules, unchanged default Node provider, actual cloud verifier and execution-ledger.md.

## Actual verification and authority

Own genuine role-agent start1899, correct recorded worktree/branch/head and fresh preferences/live body/Explain were retained. Start exited0 with a truthful warning: timing-row start was queued rather than posted after a GraphQL comment-read failure. No posted timing claim was inferred. Explain remained blocked by the three untickedACs; review did not change them.

Independent affected command:
node --test scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs
Actual46/46pass, no skips; affected-tests.json includes command/timestamps/fulloutput.

Focused public plan probes also verified quoted argument-boundary separation, configured test-covered-1 reservation, rejected metachar declarations remaining rejected/uncovered, and invalid unused requirement refusal. These are fixtures/plan probes, not genuine cloud or native delivery receipts.

Author actual receipts inspected: RED25pass/21fail at exit1; initialGREEN45/1 exposed and then repaired existing validation-order behavior; finalGREEN46/46 exit0; lint/format exit0; pre-native plan has no executable whole suites. Scratch fixtures do not constitute native Test completion. No full host suites ran.

## Declined to judge

- Arbitrary project wrapper correctness: the documented trust boundary cannot prove arbitrary wrapper semantics; the actual repository cloud wrapper was inspected separately above.
- New semantic aliases such as npm run test versus npm test, beyond identical allowlisted argv: deliberately not inferred; explicit entries are required.
- General pre-existing allowlist policy-shape rejection, interpreter/script trust and non-JSON programmatic objects: unchanged and outside this bounded optional-config change; no shell or provider authority expansion is authorized.
- General cross-stage/custom verification fingerprint policy and other pre-existing targeted command behavior: unchanged; reviewed relevant receipt seams, not claiming a full unrelated receipt-security audit. The newly observable prerequisite classification collision is judged above and not waived.
- Hosted CI completion, artifact downloads/current native receipt success, Test promotion, Review/approval/delivery/Close and downstream installation: root-owned pending workflow; passing affected fixtures do not establish these.
- Production provider launches, new external reviews and other issue bindings: outside read-only code review and not performed.

No additional actionable findings in the reviewed branch. Correct P2, then obtain fresh exact-head verification and root-owned lifecycle evidence.
