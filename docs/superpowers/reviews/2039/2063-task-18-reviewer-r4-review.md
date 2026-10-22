### Review scope

Independent R4 review of `4b007b56b993838f26f5a804d6e4adae732ecaa8..bf537f6d19a6c2d28a26c08bf497ac4c18953453`, limited to:

`scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation-projection.integration.test.mjs`

The actual Git diff contains exactly one changed file, with 42 insertions and nine deletions. HEAD matches the assigned candidate. I read the review template, repository AGENTS/task guidance, Task 18 brief, pinned/current Task 18 plan requirements, R4 package/report, actual source and delta, production root resolver, maintained hermetic fixture pattern, and named R4 receipts. No files, dependencies, native sessions, lifecycle state, branch state, or cloud state were changed. No subagents or cloud reads were used.

### Strengths

1. **The repair addresses the fixture boundary directly.** At lines 172–177, `fixtureEnvironment()` creates a new environment object and removes every canonical `PROJECT_ROOT_ALIASES` member. The disposable Git fixture’s `cwd` therefore selects its own root without modifying the actual author process environment or production admission policy.

2. **All affected physical child paths use the same helper.** The activity hook at line 197, direct/packaged CLI at lines 281–284, and physical configuration fixtures at lines 370–374 retain their existing fixture identity and explicit overrides while clearing outer root selectors.

3. **The regression exercises actual entry points.** Lines 220–247 supply all four canonical aliases to the outer checkout and reexecute the real hook, direct/package CLI, and physical provenance cases. This verifies the repaired integration boundary rather than merely asserting that an object lacks environment keys.

4. **Nested execution is finite and avoids the prior runner setup failure.** The name pattern at line 232 excludes the alias regression itself, preventing recursive nesting. Line 227 removes `NODE_TEST_CONTEXT` only from the nested child environment, allowing a distinct test runner. Exit status and expected test names are checked.

5. **Behavior assertions remain intact.** The repair preserves typed disabled/local/invalid estimation diagnostics, malformed configuration provenance, missing project behavior, current-target lifecycle read allowlists, unexpected transport markers, and quoted-command behavior. It does not convert foreign-root refusal into expected success or relax any production assertion.

6. **Production root protection remains unchanged.** `runtime-storage.mjs` still validates all aliases, including shadowed values, and refuses foreign roots without registered admission. The recorded 18-check guard receipt includes foreign override refusal, conflicting/shadowed alias handling, and scoped registered admission.

7. **Evidence separates distinct failures accurately.** The initial nested runner setup failure is retained separately from the corrected semantic RED. The declared pair’s former 54/new 55 count is distinguished from the four-file former 64/new 65 count.

### Issues

#### Critical — Must Fix

None found.

#### Important — Should Fix

None found.

#### Minor — Nice to Have

None found.

### Verification and limits

I independently executed read-only Git/source inspection commands and `git diff --check` for the assigned range; the diff check passed. I did **not** independently execute test suites, lint, formatting, native Test, or CI. The available source and receipts did not expose a concrete verification gap requiring another test execution.

I inspected these author-produced receipts:

- `r4-native-context-red.log`: controlled outer-root launch header; 54 tests, 38 passed and 16 failed, with real `ROOT_IDENTITY_MISMATCH` failures.
- `r4-alias-regression-red.log`: initial runner setup failure with empty nested output; correctly excluded as semantic RED.
- `r4-alias-regression-corrected-red.log`: corrected nested execution; 32 inner tests, 16 passed and 16 failed.
- `r4-native-context-green.log`: controlled outer-root launch header; 55 passed, zero failed/skipped.
- `r4-named-65.log`: 65 passed, zero failed/skipped.
- `r4-root-guard-regressions.log`: 18 passed, zero failed/skipped.
- `r4-full-fast.log`: all 991 test files passed.
- `r4-full-lint.log`: reaches final guidance-release success, with zero new reach offenders.
- `r4-full-format.log`: formatting check succeeded.

These are inspected receipts, not reviewer-executed results. The launch headers explicitly assert that the actual worker environment was unchanged; I did not observe or independently reconstruct the author’s launch process. The helper’s source independently supports child-only environment mutation.

### Declined to judge

DECLINED: Reapproval of the earlier R1/R2 production changes and R3 fixture identity repair; those are unchanged durable context outside this one-file R4 delta.

DECLINED: Independent confirmation of the published aggregate CI run and original native Test failure/reentry; those are root-supplied historical facts, and this review performed no cloud or foreign raw-log inspection.

DECLINED: Historical bootstrap/self-link and prior Stop/timing reconstruction; current source inspection cannot retroactively establish those events.

DECLINED: Native actor, binding, occupancy, and release-audit certification; the assignment supplies current release evidence, but this technical review does not independently certify native lifecycle state.

DECLINED: Production malformed-root behavior beyond checking the unchanged resolver and guard receipt; R4 deliberately removes ambient selectors from disposable fixture children and does not change production malformed-input policy.

DECLINED: A separate malformed-alias fixture matrix for this helper; unconditional deletion applies equally to inherited alias contents, while actual malformed configuration tests remain exercised and production alias validation is unchanged.

DECLINED: Treating file-size advisories as automatic defects; the additional helper and finite integration regression have clear local responsibilities, and no concrete maintenance failure justifies splitting this repair. The new 406-code-line and retained 782-code-line advisories remain visible.

DECLINED: General subprocess timeout/reporting infrastructure changes; this repair follows existing synchronous fixture execution, and no new recursive or unbounded test expansion was found.

DECLINED: Neighbor #2043/#2046 verification or changes; neither is modified by this delta, and their results are not reviewer-executed evidence for this report.

DECLINED: Full slow-suite, new candidate aggregate CI, and genuine native Test acceptance; these remain pending and cannot be inferred from targeted/local receipts or the earlier aggregate.

DECLINED: The author’s first apply_patch transport incident as a product defect or authority bypass; the reported parser failure preceded a write, and the actual candidate contains only the authorized fixture repair. I did not independently audit that tooling incident.

### Out-of-scope observations

The report preserves count corrections, original failures, setup-failure distinctions, collector diagnostics, and historical evidence limits rather than rewriting them as successful acceptance. No cap, native policy, production source guard, lifecycle authority, or provider mutation appears in the reviewed delta.

### Recommendations

Carry this exact repair candidate into the orchestrator’s required aggregate CI and native acceptance workflow. Preserve the distinction between inspected local verification receipts and genuine native Test acceptance.

### Assessment

**Technical verdict: PASS.**

**Task quality:** The scoped repair is coherent, appropriately hermetic, and supported by a meaningful physical regression without assertion weakening.

**Ready to merge?** Yes for this scoped technical delta, subject to the outstanding governed integration and native acceptance requirements.

Native CI/Test/Review/Close and delivery remain pending. This report grants no lifecycle, release, or delivery authority.
