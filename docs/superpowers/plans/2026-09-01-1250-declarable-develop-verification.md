# Declarable Develop Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Develop iteration verification execute auditable project-declared steps and fail closed when a non-empty changeset executes nothing.

**Architecture:** A small config normalizer converts the project declaration into allowlisted argv steps. `verify-develop.mjs` selects that plan when configured, otherwise preserves the current Node derivation, and owns explicit empty-change and zero-step outcomes.

**Tech Stack:** Node.js ES modules, `node:test`, existing AITM config and verification allowlist, child processes with `shell: false`, Markdown documentation.

## Global Constraints

- Follow red-green-refactor; no production behavior lands before its focused failing test is observed.
- `developVerification` is optional and project-local; absence preserves existing Node behavior.
- Configured commands must pass `validateVerificationCommand` and always spawn with `shell: false`.
- Only an empty changeset may return green with zero commands.
- Final Develop mode, Test receipts, lane taxonomy, cache, sandbox setup, and allowlist bins do not change.
- No provider module loading belongs in #1250.

---

## File map

- Create `scripts/task-tracker/lib/develop-verification-steps.mjs`: strict config validation and allowlisted argv normalization.
- Create `scripts/tests/unit/task-tracker/lib/develop-verification-steps.test.mjs`: declaration-shape and allowlist tests.
- Modify `scripts/task-tracker/config.mjs`: admit the optional object key.
- Modify `scripts/tests/unit/task-tracker/lib/config.test.mjs`: prove project precedence and default null.
- Modify `scripts/task-tracker/verify-develop.mjs`: select configured versus legacy steps and fail closed on non-empty zero-step plans.
- Modify `scripts/tests/slow/task-tracker/core/verify-develop.test.mjs`: outcome and command-record regressions.
- Modify `scripts/tests/integration/task-tracker/lib/stage-aware-verification.integration.test.mjs`: spawned non-JavaScript fixture.
- Create `docs/guides/non-javascript-verification.md` and modify `docs/README.md`: sanctioned shim and trust-boundary documentation.

### Task 1: Validate and normalize declarations

**Interfaces:**

- Produces `normalizeDevelopIterationSteps(config, { projectDir, validateCommand })` returning `{ configured, steps }` or throwing an error whose message begins `iteration-config-invalid:`.
- Each step is frozen and shaped as `{ classification, command, args, label, allowlistSource }`.

- [ ] Write `develop-verification-steps.test.mjs` with a valid two-step declaration and table-driven failures for unknown keys, malformed/duplicate classifications, empty commands, non-array steps, and allowlist rejection.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/develop-verification-steps.test.mjs`; expect `ERR_MODULE_NOT_FOUND`.
- [ ] Implement strict normalization. Build argv only from `validateVerificationCommand(step.command, { projectDir })`; never tokenize independently or invoke a shell.

```js
const normalized = validation.argv;
return Object.freeze({
  classification,
  command: normalized[0],
  args: Object.freeze(normalized.slice(1)),
  label: step.label || step.command.trim(),
  allowlistSource: 'verification-allowlist',
});
```

- [ ] Add `developVerification: null` to `DEFAULTS` and `developVerification: 'object'` to `TYPES`; test default null plus project override.
- [ ] Re-run both focused files; expect all pass, then commit `feat: validate declarable Develop verification steps [#1250]`.

### Task 2: Enforce iteration outcomes

**Interfaces:**

- `runDevelopVerification` accepts optional `developVerification`; CLI `main` supplies `loadConfig().developVerification`.
- Built-in steps gain `allowlistSource: 'core'`; executed records preserve it and `label`.

- [ ] Add a regression asserting a non-empty `Sources/App.swift` change with no declaration returns `ok: false`, zero commands, and reason `iteration-no-commands`. Run the focused slow test and observe the current unexpected green result.
- [ ] Add RED tests for empty changes returning `no-changes`, configured order, metadata retention, first-red abort, and invalid config refusing before spawn.
- [ ] Implement the smallest selection branch:

```js
if (changedPaths.length === 0) {
  return { ok: true, mode, changedPaths, commands: [], reasons: [{ code: 'no-changes' }] };
}
const declared = normalizeDevelopIterationSteps(developVerification, { projectDir });
const steps = declared.configured ? declared.steps : buildLegacyIterationSteps(...);
if (steps.length === 0) {
  return { ok: false, mode, changedPaths, commands: [], reasons: [{ code: 'iteration-no-commands' }] };
}
```

- [ ] Add the temporary non-JavaScript integration fixture with two executable project scripts, prove ordered real spawning and nonzero propagation, then run the unit, slow, and integration focused files.
- [ ] Run `node scripts/task-tracker/verify-develop.mjs --mode iteration` against a representative Node edit to confirm fallback parity, then commit `fix: fail closed on empty Develop verification plans [#1250]`.

### Task 3: Document and verify the migration path

**Interfaces:**

- `docs/guides/non-javascript-verification.md` provides complete-lane npm wrappers and the exact `developVerification.iterationSteps` schema.

- [ ] Write the guide with Swift/Xcode examples using project-owned `.sh` files under `scripts/verify/`, explain `shell: false`, ordering, empty-change semantics, zero-step refusal, and the fact that an `exit 0` shim cannot be proven honest by core.
- [ ] Add the guide to `docs/README.md` and run `npm run lint:md`; fix only documentation introduced by #1250.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/develop-verification-steps.test.mjs`, `node --test scripts/tests/slow/task-tracker/core/verify-develop.test.mjs`, and `node --test scripts/tests/integration/task-tracker/lib/stage-aware-verification.integration.test.mjs`.
- [ ] Run `npm test`, `npm run test:slow`, `npm run lint`, and `npm run format:check`; require zero failures.
- [ ] Commit `docs: explain non-JavaScript verification shim [#1250]`, then verify `git status --short` is clean and `git log --oneline -3` contains the three issue-attributed commits.
