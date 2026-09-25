# Project Provider npm-ci Args Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let project verification providers declare deterministic, allowlisted npm ci arguments for Test sandbox setup without changing the default Node setup path.

**Architecture:** Extend the project verification provider schema with a small validated `test.npmCiArgs` array. Thread the normalized args into the project-provider Test sandbox setup command and surface the effective setup policy in Test evidence/diagnostics.

**Tech Stack:** Node.js ESM, `node:test`, existing AITM task-tracker modules.

**Spec:** GitHub issue #1782 and its mirrored deep-dive analysis.

## Story Intent

- **Beneficiary:** AITM maintainer
- **Capability:** configure deterministic npm ci arguments for project-provider Test sandbox setup
- **Need:** downstream repositories can require valid lockfile install arguments that plain `npm ci` cannot satisfy
- **Value or failure prevented:** governed Test can run without unsafe ambient overrides, root `.npmrc` leakage, or unaudited dependency-policy changes

## Global Constraints

- Preserve the default Node verification setup command: `npm ci --no-audit --no-fund`.
- Do not add a root `.npmrc` or rely on ambient npm environment variables.
- Accept only explicitly allowlisted npm install arguments; reject arbitrary command or option passthrough.
- Keep the change scoped to project verification provider Test setup.
- Verification commands are the root issue commands on #1782.

---

### Task 1: Provider Schema Validation

**Files:**

- Modify: `scripts/task-tracker/lib/verification-provider-registry.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs`

**Interfaces:**

- Consumes: existing project verification provider config parsing.
- Produces: validated project-provider Test config with `npmCiArgs: string[]`, defaulting to `[]`.

- [ ] **Step 1: Add failing validation tests**

Add tests proving:

```js
test('project provider accepts allowlisted npm-ci args', () => {
  const provider = loadProvider({
    verificationProvider: {
      id: 'project',
      test: {
        setup: 'npm-ci',
        npmCiArgs: ['--legacy-peer-deps'],
        commands: ['npm test'],
      },
    },
  });
  assert.deepEqual(provider.test.npmCiArgs, ['--legacy-peer-deps']);
});

test('project provider rejects unsafe npm-ci args', () => {
  assert.throws(
    () =>
      loadProvider({
        verificationProvider: {
          id: 'project',
          test: {
            setup: 'npm-ci',
            npmCiArgs: ['--script-shell=/bin/sh'],
            commands: ['npm test'],
          },
        },
      }),
    /npmCiArgs|unsupported/i
  );
});
```

- [ ] **Step 2: Run the targeted validation test**

Run: `node --test scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs`

Expected: FAIL because `npmCiArgs` is not yet accepted or normalized.

- [ ] **Step 3: Implement validation**

In `verification-provider-registry.mjs`, add an allowlist such as:

```js
const ALLOWED_NPM_CI_ARGS = new Set(['--legacy-peer-deps']);
```

Normalize missing `test.npmCiArgs` to `[]`, require an array of strings, reject empty strings, duplicates, whitespace-bearing values, and values outside the allowlist.

- [ ] **Step 4: Re-run the validation test**

Run: `node --test scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs`

Expected: PASS.

### Task 2: Test Sandbox Setup Threading

**Files:**

- Modify: `scripts/task-tracker/lib/verification-providers/project.mjs`
- Modify: `scripts/task-tracker/lib/verification-receipt.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Create: `scripts/tests/unit/task-tracker/verbs/test-project-provider-npm-ci-args.test.mjs`

**Interfaces:**

- Consumes: validated `provider.test.npmCiArgs`.
- Produces: project-provider Test setup command equivalent to `npm ci --no-audit --no-fund <args...>` and evidence that names the effective setup policy.

- [ ] **Step 1: Add failing Test verb coverage**

Create tests proving project-provider setup invokes npm ci with `--legacy-peer-deps`, default Node setup remains unchanged, and the effective setup policy is visible in the returned Test evidence or diagnostics.

- [ ] **Step 2: Run the new test**

Run: `node --test scripts/tests/unit/task-tracker/verbs/test-project-provider-npm-ci-args.test.mjs`

Expected: FAIL because Test setup ignores provider npm ci args.

- [ ] **Step 3: Thread args into setup**

In `test.mjs`, pass validated project-provider `npmCiArgs` into the Test sandbox setup helper only when the provider is `project` and `test.setup` is `npm-ci`.

Keep the default path byte-for-byte equivalent to:

```text
npm ci --no-audit --no-fund
```

- [ ] **Step 4: Surface setup policy**

Include the effective project-provider setup policy in persisted Test evidence or the structured diagnostic object already emitted by the Test verb.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/test-project-provider-npm-ci-args.test.mjs
```

Expected: PASS.

### Task 3: Governed Verification And Commit

**Files:**

- Modify: implementation and test files from Tasks 1-2.

**Interfaces:**

- Consumes: passing targeted tests.
- Produces: committed implementation with `[#1782]` attribution.

- [ ] **Step 1: Run issue verification commands**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/test-project-provider-npm-ci-args.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run formatting or focused lint if touched files require it**

Run the smallest repo-established lint/format command covering the touched files.

- [ ] **Step 3: Commit**

Run:

```bash
git add scripts/task-tracker/lib/verification-provider-registry.mjs scripts/task-tracker/lib/verification-providers/project.mjs scripts/task-tracker/lib/verification-receipt.mjs scripts/task-tracker/verbs/test.mjs scripts/tests/unit/task-tracker/lib/verification-provider-registry.test.mjs scripts/tests/unit/task-tracker/verbs/test-project-provider-npm-ci-args.test.mjs docs/superpowers/plans/2026-09-24-1782-project-provider-npm-ci-args.md
git commit -m "[#1782] Support project npm ci args"
```

### Self-Review

- Spec coverage: The plan covers provider validation, Test setup threading, default-path preservation, and setup evidence visibility.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: `test.npmCiArgs` is the single planned config property name across validation and Test setup.
