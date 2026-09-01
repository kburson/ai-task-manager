# Verification Provider Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Node and project-declared verification planning behind one
policy-preserving provider contract consumed by Develop and Test.

**Architecture:** Built-in providers return immutable command plans; core alone
executes them and owns lifecycle, allowlist, exact-SHA receipts, and failure
policy. The Node provider preserves current behavior, while the explicit
project provider models Xcode environment, build, and test steps separately.

**Tech Stack:** Node.js ESM, `node:test`, existing AITM command allowlist,
detached Git worktrees, exact-SHA verification receipts, npm shim scripts, and
Xcode-shaped shell fixtures.

## Global Constraints

- Keep `aitm.verification-receipt/v1`; metadata additions are optional and
  backward compatible.
- Providers return frozen data and never spawn, mutate GitHub, move lifecycle
  state, or create evidence.
- Every project-declared command passes the existing allowlist before any step
  executes.
- No dynamic third-party module loading, Nx/TIA/cache work, Android discovery,
  or lifecycle-policy change.
- Preserve #1250 `developVerification.iterationSteps` compatibility.
- Execute serially in this recorded worktree; do not dispatch subagents.

---

### Task 1: Provider registry and immutable plans

**Files:**

- Create: `scripts/task-tracker/lib/verification-provider-registry.mjs`
- Create: `scripts/task-tracker/lib/verification-providers/node.mjs`
- Create: `scripts/task-tracker/lib/verification-providers/project.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs`
- Modify: `scripts/task-tracker/config.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/config.test.mjs`

**Interfaces:**

- Produces: `resolveVerificationProvider({ config, projectDir,
legacyDevelopVerification, deps })`.
- Produces: provider methods `planDevelopIteration(input)`,
  `planDevelopFinal(input)`, and `planTest(input)`.
- Produces: frozen plans with `providerId`, `stage`, `setup`, `steps`,
  `derivedSteps`, and `requiredClassifications`.

- [ ] Write failing registry tests for default Node resolution, explicit
      project resolution, unknown IDs/keys/kinds, unsafe argv, duplicate
      classifications, empty required final/Test stages, and deep immutability.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs`.
      Expect module-not-found and missing-config failures.
- [ ] Add `verificationProvider: null` to config defaults/types and prove project
      override precedence without changing unconfigured output.
- [ ] Implement strict shared step normalization with exact keys
      `classification`, `kind`, `command`, and optional `label`; delegate argv
      parsing to `validateVerificationCommand`.
- [ ] Implement the Node provider's current iteration, final, setup, complete
      lane, targeted, and derived aggregate plans.
- [ ] Implement the project provider's explicit configuration and non-empty
      Develop-final/Test floors.
- [ ] Run the focused registry and config suites; expect all tests green.
- [ ] Commit as `feat: add verification provider contract [#1218]`.

### Task 2: Route Develop through providers

**Files:**

- Modify: `scripts/task-tracker/verify-develop.mjs`
- Modify: `scripts/task-tracker/lib/develop-verification-steps.mjs`
- Modify: `scripts/tests/slow/task-tracker/core/verify-develop.test.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs`

**Interfaces:**

- Consumes: `resolveVerificationProvider` and provider Develop plan methods.
- Preserves: exports `buildIterationSteps()` and `buildFinalSteps()` as Node
  compatibility wrappers.

- [ ] Add failing Develop tests proving Node argv equivalence, the #1250 legacy
      adapter, explicit project iteration/final stages, full-plan validation
      before spawn, kind-aware first-red reasons, and non-empty zero-step
      refusal.
- [ ] Run the slow Develop file and observe failures against direct hardcoded
      planning.
- [ ] Resolve one provider before execution and replace local step synthesis
      with immutable provider plans.
- [ ] Preserve empty-change `no-changes`, Node affected-selection reporting,
      `shell: false`, and the current receipt/fingerprint owner.
- [ ] Add `providerId`, `kind`, and `allowlistSource` to command results without
      changing existing required fields.
- [ ] Run registry plus Develop suites; expect green.
- [ ] Commit as `refactor: route Develop verification through providers [#1218]`.

### Task 3: Route Test and receipts through providers

**Files:**

- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/lib/verification-receipt.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/verification-receipt.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/test-verb-result.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/stage-aware-verification.integration.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/verification-provider.integration.test.mjs`

**Interfaces:**

- Consumes: provider `planTest({ declaredCommands, includeCompleteLanes })`.
- Extends: `createVerificationReceipt({ provider })` with optional provider
  metadata and command `providerId`, `kind`, `allowlistSource` fields.
- Preserves: legacy five-class receipt requirements when metadata is absent.

- [ ] Write failing receipt tests for valid provider metadata, malformed IDs,
      duplicate/empty required classes, metadata preservation, and legacy
      fallback requirements.
- [ ] Write failing Test integration cases for Node plan equivalence, exact
      duplicate suppression, targeted VC composition, project Test floors, and
      first-red abort.
- [ ] Add optional provider metadata to receipt creation/validation and derive
      required Test classifications from the immutable receipt copy.
- [ ] Resolve the provider before sandbox setup; use its setup identity and
      generic executable/derived plan while leaving docs-only authority in core.
- [ ] Record the declared step kind in Test results and failure comments; do
      not parse native tool output.
- [ ] Run receipt, Test-verb, stage-aware, and provider integration suites;
      expect green.
- [ ] Commit as `refactor: execute Test plans from verification providers [#1218]`.

### Task 4: Xcode guidance and governed verification

**Files:**

- Modify: `docs/guides/non-javascript-verification.md`
- Modify: `docs/README.md` only if the existing index needs new wording.
- Test: all issue-specific and repository verification commands.

**Interfaces:**

- Documents: project-provider configuration, #1250 compatibility, required
  package shim, and separate `environment`/`build`/`test` Xcode wrappers.

- [ ] Extend the guide with the exact project-provider JSON and migration rules.
- [ ] Document that CoreSimulator readiness is a separate environment step and
      that `.tmp/` remains ignored for DerivedData.
- [ ] Run the two issue-specific provider test commands; expect green.
- [ ] Run `npm run lint`, `npm run format:check`, `npm test`, and
      `npm run test:slow`; expect green.
- [ ] Inspect `git diff --check`, the exact branch delta, and commit history.
- [ ] Commit as `docs: document polyglot verification providers [#1218]`.
