# Merge-Method Reconciliation Help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing merge-method reconciliation arguments and their exact recovery constraints in `deliver --help`.

**Architecture:** Extend the canonical `VERB_REFERENCE.deliver` metadata consumed by the help renderer and normalized command catalog. Pin the public contract in the existing focused help test without changing parser or delivery runtime code.

**Tech Stack:** Node.js 25, ECMAScript modules, built-in `node:test`, AITM command-surface metadata.

## Global Constraints

- The lane applies only on the already-merged external recovery path.
- The declared merge method must agree with observed merge topology.
- A substantive reason is required with `--reconcile-merge-method`.
- Squash-direction reconciliation remains unsupported.
- Delivery behavior, verification, receipts, and lifecycle state remain unchanged.

---

### Task 1: Register and verify the reconciliation help contract

**Files:**

- Modify: `scripts/tests/unit/task-tracker/verbs/help.test.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`

**Interfaces:**

- Consumes: `VERB_REFERENCE.deliver` and normalized `VERB_CONTRACTS.deliver`.
- Produces: rendered `deliver --help` metadata for `--reconcile-merge-method <merge|squash|rebase>` and `--reason <text>` plus exact recovery effects.

- [ ] **Step 1: Write the failing contract assertions**

  Extend the existing deliver help test with assertions equivalent to:

  ```js
  const flags = VERB_REFERENCE.deliver.flags;
  const reconcile = flags.find(({ flag }) => flag.startsWith('--reconcile-merge-method'));
  const reason = flags.find(({ flag }) => flag === '--reason <text>');

  assert.match(reconcile.flag, /<merge\|squash\|rebase>/);
  assert.match(reconcile.desc, /already-merged external recovery/i);
  assert.match(reason.desc, /required.*--reconcile-merge-method/i);
  assert.match(effects, /declared method.*observed merge topology/i);
  assert.match(effects, /squash-direction reconciliation.*unsupported/i);
  ```

- [ ] **Step 2: Run the focused test and verify the red state**

  Run:

  ```bash
  node --test scripts/tests/unit/task-tracker/verbs/help.test.mjs
  ```

  Expected: the existing test file fails because `VERB_REFERENCE.deliver.flags`
  and the reconciliation-specific effects do not yet exist.

- [ ] **Step 3: Add the minimal help metadata**

  Add this structure to `VERB_REFERENCE.deliver` and extend its summary/effects
  contract without editing delivery execution code:

  ```js
  flags: [
    {
      flag: '--reconcile-merge-method <merge|squash|rebase>',
      desc: 'declare the observed method for an already-merged external recovery; squash-direction reconciliation is unsupported',
    },
    {
      flag: '--reason <text>',
      desc: 'substantive explanation required with --reconcile-merge-method',
    },
  ],
  ```

  Amend the normalized deliver effects to say that the declared method must
  agree with observed merge topology and that squash-direction reconciliation
  is unsupported.

- [ ] **Step 4: Run the focused test and rendered-help probe**

  Run:

  ```bash
  node --test scripts/tests/unit/task-tracker/verbs/help.test.mjs
  npx aitm deliver --help
  ```

  Expected: the test passes and rendered help contains both flags plus the
  external-recovery, topology-agreement, and unsupported-direction contract.

- [ ] **Step 5: Run repository verification**

  Run, in order:

  ```bash
  npm run lint
  npm run format:check
  npm run test:unit
  npm test
  npm run test:slow
  ```

  Expected: every command exits 0 with no test failures.

- [ ] **Step 6: Commit the complete story**

  ```bash
  git add docs/superpowers/specs/2026-09-11-1573-merge-method-reconciliation-help-design.md \
    docs/superpowers/plans/2026-09-11-1573-merge-method-reconciliation-help.md \
    scripts/tests/unit/task-tracker/verbs/help.test.mjs \
    scripts/task-tracker/verbs/help-data.mjs
  git commit -m "docs(deliver): expose merge reconciliation help [#1573]"
  ```
