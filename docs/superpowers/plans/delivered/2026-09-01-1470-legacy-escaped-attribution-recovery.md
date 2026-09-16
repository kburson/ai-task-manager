# Legacy Escaped Attribution Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow #1464's exact legacy escaped-attribution squash commit to receive a historical delivery receipt without weakening canonical attribution checks.

**Architecture:** Add one closed predicate at the delivery-verification boundary. It is eligible only for external historical recovery after complete single-source squash proof and requires exact issue, source SHA, title, token count, and literal body bytes; every other path continues through the existing physical terminal attribution-line check.

**Tech Stack:** Node.js ESM, `node:test`, AITM governed delivery verifier.

## Global Constraints

- Do not rewrite PR #1465 or fabricate delivery records.
- Do not accept title-only, arbitrary escaped, multi-token, non-squash, or ordinary-delivery attribution.
- Preserve all exact-SHA, review, test, CI, tree, ancestry, branch-disposition, and trunk-reachability gates.
- Do not create another chained defect.

---

### Task 1: Closed legacy attribution proof

**Files:**

- Modify: `scripts/task-tracker/lib/delivery-verification.mjs`
- Test: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`

**Interfaces:**

- Consumes: verified external recovery intent, inspected merge bytes, and the already-proven single-source squash boolean.
- Produces: a boolean legacy-attribution proof used only as an alternative to the canonical terminal attribution line.

- [ ] **Step 1: Write the captured failing test**

Add `external recovery accepts exact legacy escaped attribution after squash proof`. Configure the harness with one complete source commit, matching parent/tree evidence, exact governed merge title, and the literal body `Source: ${HEAD}\\nHosted fast CI passed.\\nLocal governed sandbox including slow tests passed.` Assert `status === 'delivered'`, `recovery === true`, `mergeMethod === 'squash'`, and exactly two comments.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test --test-name-pattern "external recovery accepts exact legacy escaped attribution" scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

Expected: FAIL with `delivery-verification:attribution` and no intent or receipt comments.

- [ ] **Step 3: Add adversarial failing/refusal coverage**

Add `external recovery refuses altered legacy escaped attribution` as a compact scenario loop. Cover altered title, altered source SHA, physical newlines, an appended physical attribution line that is not terminal/canonical, and multiple attribution tokens. Each case must reject with `delivery-verification:attribution` and write zero comments.

- [ ] **Step 4: Implement the minimal predicate**

Add a pure helper equivalent to:

```js
function provesExactLegacyEscapedAttribution({ intent, inspection, provenSingleSourceSquash }) {
  const token = `#${intent.issueNumber}`;
  return (
    provenSingleSourceSquash === true &&
    intent.provider === 'external' &&
    intent.attributionTokens.length === 1 &&
    intent.attributionTokens[0] === token &&
    inspection.commitTitle === `[${token}] Governed PR delivery` &&
    inspection.commitMessage ===
      `Source: ${intent.expectedHeadSha}\\nHosted fast CI passed.\\nLocal governed sandbox including slow tests passed.`
  );
}
```

Retain the result of `provesSingleSourceSquash` during rewritten-one-parent classification. At attribution verification, accept only the canonical physical line or this exact legacy predicate.

- [ ] **Step 5: Verify GREEN and regression behavior**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

Expected: all commands exit 0; refusal cases create no comments.

- [ ] **Step 6: Commit and record governed evidence**

```bash
git add docs/superpowers/plans/2026-09-01-1470-legacy-escaped-attribution-recovery.md scripts/task-tracker/lib/delivery-verification.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
git commit -m "[#1470] fix: recover exact legacy delivery attribution"
npx aitm commit-trace
```

Expected: clean worktree and commit trace at the accepted SHA.
