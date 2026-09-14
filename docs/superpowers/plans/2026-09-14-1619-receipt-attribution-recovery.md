# #1619 Receipt Attribution Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an already-merged external delivery obtain a warning-bearing receipt when attribution metadata is wholly absent but all safety authority agrees, while preventing and narrowly repairing the related same-second timing artifact.

**Architecture:** Keep canonical delivery unchanged and introduce one recovery-only source-attribution classifier. Carry bounded warning codes through the existing independent verifier into a backward-compatible v2 receipt, retain exact category prefixes while adding actionable failure properties, and add an exact timing suppression/repair predicate rather than a general row deletion surface.

**Tech Stack:** Node.js ECMAScript modules, built-in `node:test`, GitHub issue comments as canonical records, AITM v1 delivery orchestration, strict Timing Log parser/validator.

**Spec:** `docs/superpowers/specs/2026-09-14-1619-receipt-attribution-recovery-design.md`

## Global Constraints

- Missing attribution is recoverable only for already-merged external current-head recovery or historical no-intent reconstruction.
- Complete accepted-head, PR/base/head, CI where applicable, merge-method, tree, trunk-reachability, Test, Review, ownership, and read-back checks remain unchanged.
- Any present malformed, partial, missing-target, extra, duplicate, or conflicting attribution claim remains fatal.
- Historical `aitm.delivery-receipt/v1` records remain byte-exact; only warning-bearing receipts use v2.
- Timing repair deletes exactly one proved zero-duration same-second `resumed` row and remains dry-run-first.
- No provider action is added before Review, no general row deletion is added, and no system `/tmp` path is used.

---

### Task 1: Recovery-only source attribution classification

**Files:**

- Modify: `scripts/task-tracker/lib/delivery-attribution.mjs`
- Modify: `scripts/task-tracker/lib/delivery-preflight.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs`

**Interfaces:**

- Produces: `buildExternalRecoveryCommitText(input) -> { attributionTokens, commitTitle, commitMessage, commitTitleSha256, commitMessageSha256, metadataWarnings }`.
- Consumes: the existing exact input shape `{ issueNumber, prNumber, expectedHeadSha, commitSubjects }`.
- Produces: optional `preflight.metadataWarnings` only on the wholly-absent recovery path.

- [ ] **Step 1: Add RED tests for absent and conflicting source attribution**

Add direct preflight cases that use a merged PR with a complete single-source inventory. Prove that `['legacy source subject']` succeeds only through `validateMergedDeliveryPreflight`, returns `['missing-source-attribution']`, and produces target-only canonical commit text. Prove the same input still fails through `validateDeliveryPreflight`.

Add table cases for these subjects and require `delivery-preflight:attribution`:

```js
[
  ['legacy source', '[#999] conflicting source'],
  ['[#999] conflicting source'],
  ['[#1619 malformed'],
  ['[#1619] target', 'unattributed partial subject'],
  ['[#1619] target [#1619] duplicate'],
];
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs
```

Expected: the new missing-attribution recovery cases fail because the recovery builder/result does not exist; existing canonical and conflict cases pass.

- [ ] **Step 3: Extract deterministic commit-text construction**

In `delivery-attribution.mjs`, keep `buildDeliveryCommitText`'s public behavior byte-identical. Extract its final token-to-text logic into a private helper and add:

```js
export function buildExternalRecoveryCommitText(input = {}) {
  try {
    return { ...buildDeliveryCommitText(input), metadataWarnings: [] };
  } catch (canonicalError) {
    // Validate the same exact input and every bounded source string.
    // Fallback only when every subject contains no `[#` claim at all.
    if (!allSubjectsAreReadableAndWhollyUnattributed(input.commitSubjects)) throw canonicalError;
    return deepFreeze({
      ...buildCommitTextFromTokens(input, [`#${input.issueNumber}`]),
      metadataWarnings: ['missing-source-attribution'],
    });
  }
}
```

The absence predicate must reject an empty/incomplete array and any subject containing `[#`, even if malformed.

- [ ] **Step 4: Route only merged recovery preflights through the classifier**

In `validatePreflight`, choose the builder by mode:

```js
const commitText = merged
  ? buildExternalRecoveryCommitText(commitInput)
  : buildDeliveryCommitText(commitInput);
```

Return canonical commit fields under `commitText`; when `metadataWarnings.length > 0`, return a sibling `metadataWarnings` property. Apply the same recovery builder to `validateHistoricalReconstructionPreflight`. Leave `validateHistoricalRecoveryPreflight` on the strict canonical builder because it verifies previously authorized intent bytes.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run the command from Step 2. Expected: all cases pass, with no changes to canonical output bytes.

- [ ] **Step 6: Commit the source-classification slice**

```bash
git add \
  scripts/task-tracker/lib/delivery-attribution.mjs \
  scripts/task-tracker/lib/delivery-preflight.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs
git commit -m "[#1619] Classify missing recovery attribution"
```

### Task 2: Warning-bearing receipt and delivery idempotency

**Files:**

- Modify: `scripts/task-tracker/lib/delivery-verification.mjs`
- Modify: `scripts/task-tracker/lib/delivery-records.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs`
- Test: `scripts/tests/integration/task-tracker/lib/evidence-v2/delivery-flow.test.mjs`

**Interfaces:**

- Produces: `verification.receiptInput.metadataWarnings?: string[]`.
- Produces: `aitm.delivery-receipt/v2` with required nonempty `metadataWarnings`.
- Consumes: `preflight.metadataWarnings ?? []` in `verifyAndFinalize`.
- Preserves: v1 receipt build/parse/render/project behavior for warning-free deliveries.

- [ ] **Step 1: Add RED verifier tests for warning return values**

For canonical trailer success, assert `metadataWarnings` is absent. For the topology-proven external default squash/merge fallbacks, assert:

```js
assert.deepEqual(verified.receiptInput.metadataWarnings, ['missing-merge-attribution-trailer']);
```

Retain all existing malformed/duplicate/nonterminal/extra-token rejection cases.

- [ ] **Step 2: Add RED receipt v1/v2 tests**

In `delivery-records.test.mjs`, prove:

- warning-free input builds the existing exact v1 key set;
- one or both sorted known warnings build v2 with exactly one added field;
- v1 and v2 round trip and project against the same intent;
- empty, duplicate, unsorted, unknown, non-string, or extra warning data refuses;
- visible v2 receipt text names each warning code; and
- two receipts for one intent with divergent warning bytes remain a conflict.

- [ ] **Step 3: Add a RED public delivery integration case**

In `delivery-flow.test.mjs`, construct a v1 `runDeliver` current-head merged recovery harness with complete source/tree/CI evidence and wholly absent attribution. Assert the final result is `delivered`, `action === null`, exactly one intent and one receipt are written, the receipt is v2 with both warning codes, and a retry returns `already-delivered` without another write. Add a conflicting-token variant and assert zero comments.

- [ ] **Step 4: Run receipt and focused delivery tests and confirm RED**

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs \
  scripts/tests/integration/task-tracker/lib/evidence-v2/delivery-flow.test.mjs
```

Expected: new warning fields/schema and public recovery assertions fail.

- [ ] **Step 5: Return warning codes from semantic attribution proof**

Change `assertMergeCommitAttribution` to return a frozen warning array:

```js
if (canonicalTrailerMatches) return [];
if (legacyEscapedProof) return ['missing-merge-attribution-trailer'];
if (defaultSquashProof || defaultMergeProof) {
  return ['missing-merge-attribution-trailer'];
}
throw verificationError('attribution');
```

Attach the array to `receiptInput` only when nonempty. Do not alter any proof predicate or canonical-claim precedence.

- [ ] **Step 6: Add exact receipt v2 support**

In `delivery-records.mjs`:

```js
const RECEIPT_SCHEMA_V1 = 'aitm.delivery-receipt/v1';
const RECEIPT_SCHEMA_V2 = 'aitm.delivery-receipt/v2';
const METADATA_WARNING_CODES = new Set([
  'missing-merge-attribution-trailer',
  'missing-source-attribution',
]);
```

Validate v1 against its original key set. Validate v2 against that set plus `metadataWarnings`, requiring a nonempty sorted unique array of known codes. `buildDeliveryReceipt` emits v2 only when the optional input array is nonempty. Update parser, projector filters, order checks, and visible rendering to accept both schema versions without changing intent correlation.

- [ ] **Step 7: Merge warnings at the orchestration boundary**

Add a private helper in `deliver.mjs`:

```js
function combinedMetadataWarnings(...lists) {
  return [...new Set(lists.flat().filter(Boolean))].sort();
}
```

Pass `preflight.metadataWarnings ?? []` into current-head external recovery and historical reconstruction `verifyAndFinalize` calls. Combine those with `verification.receiptInput.metadataWarnings ?? []`, then call `buildDeliveryReceipt` with the optional merged field. Return the read-back receipt exactly as today.

- [ ] **Step 8: Run focused tests and confirm GREEN**

Run the command from Step 4. Expected: all v1 compatibility, v2 warning, recovery, refusal, and retry cases pass.

- [ ] **Step 9: Commit the receipt slice**

```bash
git add \
  scripts/task-tracker/lib/delivery-verification.mjs \
  scripts/task-tracker/lib/delivery-records.mjs \
  scripts/task-tracker/verbs/deliver.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs \
  scripts/tests/integration/task-tracker/lib/evidence-v2/delivery-flow.test.mjs
git commit -m "[#1619] Record delivery metadata warnings"
```

### Task 3: Predicate-specific recovery diagnostics

**Files:**

- Modify: `scripts/task-tracker/lib/delivery-preflight.mjs`
- Modify: `scripts/task-tracker/lib/delivery-verification.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs`

**Interfaces:**

- Produces: `DeliveryPreflightError.category`, `.predicate`, `.recoveryAction`.
- Produces: `DeliveryVerificationError.category`, `.predicate`, `.recoveryAction`.
- Preserves: message prefixes `delivery-preflight:<category>` and `delivery-verification:<category>`.

- [ ] **Step 1: Add RED assertions for structured errors**

Capture representative source conflict, required-check failure, merge-message conflict, wrong expected head, and trunk-reachability errors. Assert both the existing prefix and exact properties, for example:

```js
assert.equal(error.category, 'attribution');
assert.equal(error.predicate, 'merge-message-attribution-conflict');
assert.match(error.recoveryAction, /governed non-delivery|corrective delivery/);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run the Task 1 focused command. Expected: property assertions fail while existing category-prefix assertions pass.

- [ ] **Step 3: Add closed diagnostic mappings**

Implement error classes whose constructors resolve each stable category to a predicate and supported action. Override attribution failures at the call site so source absence/conflict and merge-message conflict are distinguishable. Format messages as:

```text
delivery-verification:attribution predicate=merge-message-attribution-conflict recovery="use a governed non-delivery disposition or create a new corrective delivery; immutable conflicting bytes cannot be warning-recovered"
```

Do not include shell interpolation, guessed issue numbers, or a force-push recommendation.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the Task 1 focused command. Expected: stable prefixes and structured details both pass.

- [ ] **Step 5: Commit diagnostic behavior**

```bash
git add \
  scripts/task-tracker/lib/delivery-preflight.mjs \
  scripts/task-tracker/lib/delivery-verification.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs
git commit -m "[#1619] Explain delivery recovery predicates"
```

### Task 4: Prevent and repair redundant same-second reengagement

**Files:**

- Modify: `scripts/task-tracker/lib/bind-event.mjs`
- Modify: `scripts/task-tracker/verbs/resume.mjs`
- Modify: `scripts/task-tracker/lib/heal-timing-departure.mjs`
- Modify: `scripts/task-tracker/heal-timing-departure.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/heal-timing-departure-repair.test.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs`
- Test: `scripts/tests/unit/task-tracker/maintenance/heal-timing-departure-cli.test.mjs`

**Interfaces:**

- Extends: `shouldSuppressActiveBindEvent({ timingBody, readStatus, paused, nowTs, proposedEvent })`.
- Produces: `recoverRedundantSameSecondReengagement(body, { rowIndex }) -> string`.
- Adds CLI flag: `--recover-redundant-same-second-reengagement`.
- Preserves: `--recover-redundant-same-second-pair` and missing-departure insertion modes.

- [ ] **Step 1: Add RED prevention tests**

Import `shouldSuppressActiveBindEvent` in the cited timing validator test and build an exact three-row sequence at one second. Assert suppression only for `paused: true`, `proposedEvent: 'resumed'`, no open interruption, `demoted:develop` tail, and a bind timestamp in the same whole second. Assert false for an older demotion, another audit event, an open pause, unreadable comments, or another proposed event.

- [ ] **Step 2: Add RED pure repair and validator tests**

Use this canonical malformed core:

```text
| 2026-09-14 08:00:00 -05:00 | demoted:develop | ... cursors 100 / 200 ... |
| 2026-09-14 08:00:00 -05:00 | resumed | blank duration, delta 0, cursors 100 / 200 | row-sec a=0 i=0 |
| 2026-09-14 08:00:00 -05:00 | develop:started | ... cursors 100 / 200 ... |
```

Assert the validator fails before, the transform removes only `resumed`, and the validator passes after. Add near-miss refusals for nonzero row seconds, changed delta/cursors, different seconds, non-adjacent rows, wrong previous/next events, and a transformed log that still has another sequence failure.

- [ ] **Step 3: Add RED CLI dry-run/apply/read-back tests**

Assert the new flag parses, appears in usage/self-doc, requires `--row-index`, conflicts with insertion options and the old pair flag, makes no write by default, writes exactly once with `--apply --yes`, re-reads the exact body, and refuses on mismatched or invalid read-back.

- [ ] **Step 4: Run focused timing tests and confirm RED**

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/heal-timing-departure-repair.test.mjs \
  scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs \
  scripts/tests/unit/task-tracker/maintenance/heal-timing-departure-cli.test.mjs
```

Expected: missing predicate, transform, flag, and read-back behavior fail.

- [ ] **Step 5: Implement exact prevention**

In `shouldSuppressActiveBindEvent`, preserve the existing unpaused active-bind suppression. For paused state, return true only when the proposed event is `resumed`, the last parsed event is `demoted:develop`, no interruption is open, and:

```js
Math.floor(lastMs / 1000) === Math.floor(nowMs / 1000);
```

Pass `bindEvent` as `proposedEvent` from `resume.mjs`.

- [ ] **Step 6: Implement the pure standalone-row transform**

Add `recoverRedundantSameSecondReengagement`. Resolve rows by zero-based data-row index, require the exact neighbors/adjacency/timestamps/zero duration/cursor equality from the spec, remove only the selected row, and refuse any mismatch before returning bytes.

- [ ] **Step 7: Wire CLI mode and sequence validation**

Add a separate boolean option and strict-argv flag. In `runHealDeparture`, reject simultaneous recovery modes, run the new transform, validate the transformed body through the existing timing-log sequence validator with lifecycle markers covering the observed stages, and return `recoveredRows: 1`.

On apply, update under the existing lock, fetch the timing comment again, require byte equality with the proposed body, and rerun validation. Any failure throws; no second mutation is attempted.

- [ ] **Step 8: Run focused timing tests and confirm GREEN**

Run the Step 4 command. Expected: prevention, exact repair, near-miss refusals, old-mode compatibility, and CLI read-back all pass.

- [ ] **Step 9: Commit the timing slice**

```bash
git add \
  scripts/task-tracker/lib/bind-event.mjs \
  scripts/task-tracker/verbs/resume.mjs \
  scripts/task-tracker/lib/heal-timing-departure.mjs \
  scripts/task-tracker/heal-timing-departure.mjs \
  scripts/lib/self-doc.mjs \
  scripts/tests/unit/task-tracker/lib/heal-timing-departure-repair.test.mjs \
  scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs \
  scripts/tests/unit/task-tracker/maintenance/heal-timing-departure-cli.test.mjs
git commit -m "[#1619] Repair redundant timing reengagement"
```

### Task 5: Documentation, exact-head verification, and governed handoff

**Files:**

- Modify: `docs/guides/workflow.md`
- Modify: `docs/guides/architecture-overview.md`
- Modify: `docs/guides/settings-guide.md`
- Modify: `scripts/tests/unit/inspect/delivery-doc-parity.test.mjs`

**Interfaces:**

- Documents: v1/v2 receipt compatibility, safety authority, warning codes, fatal conflicts, and timing repair command.
- Proves: every issue Verification Command and DoD verifier at one committed SHA.

- [ ] **Step 1: Add RED documentation parity assertions**

Require all three guides to distinguish `safety authority` from `audit convention`, name both warning codes, state that present conflicts remain fatal, and document `--recover-redundant-same-second-reengagement` as exact and dry-run-first.

- [ ] **Step 2: Run the parity test and confirm RED**

```bash
node --test scripts/tests/unit/inspect/delivery-doc-parity.test.mjs
```

Expected: new prose anchors are absent.

- [ ] **Step 3: Update the three guides**

Describe the authority/convention split beside the existing governed delivery sections. List the exact v2 warning codes and state that they are canonical receipt bytes, not authorization substitutes. Add the healer command in the operational recovery prose with check-only first and `--apply --yes` second.

- [ ] **Step 4: Run parity and all focused issue commands**

```bash
node --test scripts/tests/unit/inspect/delivery-doc-parity.test.mjs
node --test scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs
node --test scripts/tests/integration/task-tracker/lib/evidence-v2/delivery-flow.test.mjs
node --test scripts/tests/unit/task-tracker/lib/heal-timing-departure-repair.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs scripts/tests/unit/task-tracker/maintenance/heal-timing-departure-cli.test.mjs
```

Expected: every command exits 0.

- [ ] **Step 5: Run repository formatting and static gates before the suites**

```bash
npm run lint
npm run format:check
git diff --check
```

Expected: every command exits 0 and formatting makes no uncommitted rewrite.

- [ ] **Step 6: Commit documentation and any final mechanical corrections**

```bash
git add docs/guides scripts/tests/unit/inspect/delivery-doc-parity.test.mjs
git commit -m "[#1619] Document receipt recovery authority"
```

- [ ] **Step 7: Run the committed fast and slow suites**

```bash
npm test
npm run test:slow
git log --oneline -1
```

Expected: both suites exit 0 and the final commit subject carries `[#1619]`.

- [ ] **Step 8: Stamp issue evidence individually and enter Test**

Run `npx aitm ac-stamp` for each acceptance criterion only after its cited command is green. Run `npx aitm dod-stamp tests`, `npx aitm dod-stamp lint`, and `npx aitm dod-stamp commits` individually. Then run:

```bash
npx aitm test 1619
```

Expected: the isolated exact-head Test receipt is green and #1619 reaches Test.

- [ ] **Step 9: Complete governed Review and Full-Auto approval**

As orchestrator, run `npx aitm review 1619` at the Test SHA, resolve any finding by demoting through the sanctioned rework path, and rerun Test/Review. On a clean Review result, run `npx aitm approve 1619` so the Full-Auto marker and Review Notes are durable.

- [ ] **Step 10: Push, create the PR, wait for exact-head hosted CI, deliver, and close**

Push `codex/1619-receipt-attribution-recovery`, create the pull request with the governed branch and trunk base, and verify the PR head equals the accepted Review SHA. Wait for required hosted checks to pass at that SHA. Run `npx aitm deliver 1619`, execute only the emitted provider action if one is required, rerun delivery for the receipt, verify the receipt/merge/trunk read-back, and finish through `npx aitm close 1619`.
