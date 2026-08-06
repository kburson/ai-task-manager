# AC and VC Contract-Source Gate Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Acceptance Criteria and Verification Command lifecycle decisions through the normalized Delivery Contract source without import cycles, proof-marker loss, legacy API breaks, or directory-to-body fallback.

**Architecture:** A neutral legacy AC parser supplies the immutable contract-source adapter and remains re-exported by the existing code-complete module. Two later consumers independently adopt the resulting model: the async code-complete AC gate resolves it directly, while the synchronous body validator retains its public API and gains a directory-aware async adapter for VC state.

**Tech Stack:** Node.js ESM, `node:test`, AITM lifecycle gates, GitHub-record Delivery Contracts, injected GraphQL/comment readers.

**Governing specification:** `docs/superpowers/specs/2026-07-31-github-native-authority-records-design.md`

**Architecture decision:** `docs/decisions/0002-github-native-authority-records.md`

**Reference commit:** `dd99fa8aecffae91ae4e501cd1bd69d2d2603ac1`

## Global Constraints

- A GitHub issue directory makes its Delivery Contract authoritative; every directory, reader, record, contract, and projection failure must refuse without reparsing the embedded legacy body.
- Preserve `parseAcceptanceCriteria(body)` and `validateBody(body, options)` public call contracts for existing consumers and fixtures.
- Keep Definition-of-Done and evidence-reader integration in #1119; do not change write-side lifecycle verbs in these tasks.
- Retain raw evidence declarations needed by `aitm-verified-by`, `aitm-non-demonstrable`, and sanctioned waiver checks while also exposing normalized display text.
- Follow test-driven development and use repository-local `.tmp/` helpers for any test sandboxes.

---

### Task 1: Neutral AC Parser and Evidence-Bearing Contract Model

**Files:**

- Create: `scripts/task-tracker/lib/acceptance-criteria.mjs`
- Modify: `scripts/task-tracker/lib/code-complete-gate.mjs`
- Modify: `scripts/task-tracker/lib/github-records/contract-source.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`

**Interfaces:**

- Produces `parseAcceptanceCriteria(body) -> null | Array<{ label: string, checked: boolean, verifiedBy: string | null }>` from the neutral module.
- Preserves the existing named export from `code-complete-gate.mjs` via re-export.
- Extends normalized AC items to `{ logicalId, text, declaration, checked }`, where `text` is display-normalized and `declaration` retains proof/waiver HTML markers.
- Supplies Tasks 2 and 3 through `resolveContractSource(...)` without importing either consumer.

- [ ] **Step 1: Add failing parity and compatibility assertions**

Extend the focused test so equivalent legacy and record contracts carry the same evidence-bearing declaration, the returned objects remain deeply frozen, and `parseAcceptanceCriteria` remains importable from `code-complete-gate.mjs` with its current return shape.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`

Expected: FAIL because normalized AC items do not expose `declaration` and the neutral parser module does not exist.

- [ ] **Step 3: Extract the parser and extend normalization**

Move the existing pure parser constants and function into `acceptance-criteria.mjs`; import and re-export that function from `code-complete-gate.mjs`. Import it directly from `contract-source.mjs`. Populate `declaration` from the full legacy checkbox label and from the Delivery Contract AC text, while retaining the existing cleaned `text` field and lifecycle-projected checked state. Do not introduce a consumer import into `contract-source.mjs`.

Use this normalized mapping shape in both adapters:

```js
{
  logicalId,
  text: cleanText(declaration),
  declaration,
  checked,
}
```

The neutral parser must retain the existing result shape exactly:

```js
items.push({
  label,
  checked,
  verifiedBy: verifiedBy ? verifiedBy.trim() : null,
});
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`

Expected: PASS for immutable legacy/record parity, stable IDs, fail-closed source errors, and parser compatibility.

- [ ] **Step 5: Commit the independently reviewable model boundary**

Commit only the neutral parser, contract-source model, compatibility re-export, and focused tests. Use the bound generated child issue number in the repository-standard subject, followed by `refactor: normalize evidence-bearing acceptance criteria`.

---

### Task 2: Code-Complete Acceptance-Criteria Contract Routing

**Files:**

- Modify: `scripts/task-tracker/lib/code-complete-gate.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/code-complete-gate.test.mjs`

**Interfaces:**

- Consumes `resolveContractSource({ repository, issue, issueBody, graphql, readContractRecord })` and each AC item's `{ declaration, checked }` fields from Task 1.
- Preserves `gateCodeComplete({ cfg, issueNumber, body, deps }) -> Promise<{ ok, blockers, shas }>`.
- Adds injectable `deps.resolveContractSource`, `deps.graphql`, and `deps.readContractRecord` seams while retaining all current comment, commit, audit-kind, touch-set, and dirty-file seams.

- [ ] **Step 1: Add failing paired-consumer tests**

Add legacy-body and directory-backed cases with equivalent checked, unchecked, verified, non-demonstrable, and audit-waived AC declarations. Assert equal code-complete AC blocker decisions after neutralizing commit-trail dependencies. Add a valid embedded legacy body plus unavailable directory record and assert a deterministic `code-complete-contract-source-failed` blocker.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs scripts/task-tracker/tests/unit/lib/code-complete-gate.test.mjs`

Expected: FAIL because `gateCodeComplete` still reparses the body and never resolves directory authority.

- [ ] **Step 3: Route only AC decisions through the resolver**

Resolve the contract once near the start of `gateCodeComplete`. Evaluate `checked`, `verifiedBy`, non-demonstrable, and waiver semantics from each normalized AC declaration. Catch source errors only to append the deterministic fail-closed blocker; never invoke the legacy parser after a directory was detected. Leave audit deliverables, epic reconciliation, commit-trail lookup, SHA touch sets, and dirty-file checks unchanged.

The adapter boundary must follow this single-attempt shape:

```js
const resolve = deps.resolveContractSource || resolveContractSource;
let contractSource;
try {
  contractSource = await resolve({
    repository: cfg.repo,
    issue: Number(issueNumber),
    issueBody: body,
    graphql: deps.graphql,
    readContractRecord: deps.readContractRecord,
  });
} catch (error) {
  blockers.push(`code-complete-contract-source-failed: ${error.message}`);
}
```

When resolution succeeds, convert each normalized item to the existing consumer shape from `declaration`, then run the unchanged checked/evidence policy over that array.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs scripts/task-tracker/tests/unit/lib/code-complete-gate.test.mjs`

Expected: PASS with equivalent legacy/record decisions and fail-closed directory refusal.

- [ ] **Step 5: Commit the independently reviewable AC consumer**

Commit the code-complete adapter and tests. Use the bound generated child issue number in the repository-standard subject, followed by `feat: route code-complete AC gates through contract source`.

---

### Task 3: Verification-Command Body-Gate Contract Routing

**Files:**

- Modify: `scripts/task-tracker/lib/body-gates.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/body-gates.test.mjs`

**Interfaces:**

- Consumes normalized `verificationCommands: Array<{ logicalId, command, checked }>` from Task 1.
- Preserves synchronous `validateBody(body, { gates })` behavior for every existing legacy caller.
- Produces `validateBodyWithContractSource({ repository, issue, issueBody, graphql, readContractRecord, gates, deps }) -> Promise<ValidationResult>` as the directory-aware adapter.
- Allows the pure validator to receive a pre-resolved contract in options without performing I/O.

- [ ] **Step 1: Add failing VC parity and refusal tests**

Add paired checked and unchecked legacy/directory contracts and assert equal verification-command refusals through the async adapter. Assert the original synchronous signature and custom-gates fixtures remain byte-for-byte compatible. Add unavailable and projection-mismatched directory records beside a valid legacy VC section and assert fail-closed refusal without body fallback.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs scripts/task-tracker/tests/unit/lib/body-gates.test.mjs`

Expected: FAIL because no directory-aware body-gate adapter exists and the verification rule reads only Markdown checkboxes.

- [ ] **Step 3: Add the async adapter and pure normalized evaluation**

Keep structural placement and deep-dive rules body-based. Teach the verification-command rule to evaluate the supplied normalized command list when present and otherwise retain its current Markdown scan. Implement the async adapter as one resolver call followed by the pure validator. Convert resolver errors into a deterministic refused rule result and never retry against the body.

Keep the pure and async boundaries explicit:

```js
export function validateBody(body, { gates = DEFAULT_GATES, contractSource = null } = {}) {
  // Existing structural rules read body; the VC rule reads
  // contractSource.contract.verificationCommands when supplied.
}

export async function validateBodyWithContractSource({
  repository,
  issue,
  issueBody,
  graphql,
  readContractRecord,
  gates = DEFAULT_GATES,
  deps = {},
} = {}) {
  const resolve = deps.resolveContractSource || resolveContractSource;
  try {
    const contractSource = await resolve({
      repository,
      issue,
      issueBody,
      graphql,
      readContractRecord,
    });
    return validateBody(issueBody, { gates, contractSource });
  } catch (error) {
    return {
      ok: false,
      refusedRules: [
        { rule: 'verification-commands', reason: `contract-source-failed: ${error.message}` },
      ],
    };
  }
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test scripts/task-tracker/tests/unit/lib/github-records/contract-source.test.mjs scripts/task-tracker/tests/unit/lib/body-gates.test.mjs`

Expected: PASS for legacy compatibility, directory parity, and fail-closed VC resolution.

- [ ] **Step 5: Commit the independently reviewable VC consumer**

Commit the body-gate adapter and tests. Use the bound generated child issue number in the repository-standard subject, followed by `feat: route verification gates through contract source`.
