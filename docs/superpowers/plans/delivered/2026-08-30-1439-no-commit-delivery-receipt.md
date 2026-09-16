# No-Commit Delivery Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let reviewed no-commit issues record delivery authorization and close without fabricating a pull request.

**Architecture:** Add a canonical, issue-comment-backed no-commit authorization record and route only explicit no-commit kinds through it. Delivery posts and reads back the record without a provider action; Close validates it against current issue-kind, deliverable, and accepted-SHA evidence before leaving the existing PR receipt path untouched for commit-bearing issues.

**Tech Stack:** Node.js ESM, `node:test`, GitHub issue comments, AITM marker grammar and canonical JSON.

## Global Constraints

- No production code before a focused failing test.
- Only explicit `audit`, `research`, `spike`, or `epic` markers enter the no-commit path.
- No provider action, pull request, merge, or synthetic commit is created for no-commit delivery.
- Missing, malformed, duplicate, conflicting, stale, or mismatched authorization fails closed.
- Existing commit-bearing delivery behavior must remain unchanged.

---

### Task 1: Canonical no-commit authorization record

**Files:**

- Create: `scripts/task-tracker/lib/no-commit-delivery-record.mjs`
- Test: `scripts/tests/unit/task-tracker/verbs/deliver-no-commit.test.mjs`

**Interfaces:**

- Consumes: canonical JSON and record-ID helpers; normalized repository, issue, kind, deliverable URL, accepted SHA, provider, session, and timestamps.
- Produces: `buildNoCommitDeliveryRecord`, `renderNoCommitDeliveryComment`, `parseNoCommitDeliveryComment`, and `projectNoCommitDeliveryRecords`.

- [ ] Write a failing test that constructs a valid no-commit issue and expects `/task deliver` to return `delivered`, persist one canonical record, and return `action: null`.
- [ ] Run `node --test scripts/tests/unit/task-tracker/verbs/deliver-no-commit.test.mjs` and confirm failure because the no-commit path does not exist.
- [ ] Implement exact-key record construction, canonical marker rendering/parsing, bounded-field validation, and duplicate/conflict projection.
- [ ] Re-run the focused test and keep the record-only unit cases green.

### Task 2: No-commit Deliver branch

**Files:**

- Modify: `scripts/task-tracker/lib/issue-kind.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Test: `scripts/tests/unit/task-tracker/verbs/deliver-no-commit.test.mjs`

**Interfaces:**

- Consumes: explicit no-commit kind, exact deliverable marker, accepted Test/Review SHA, review authorization, issue comments.
- Produces: `delivered` or `already-delivered` result with one authorization record and no provider action.

- [ ] Add failing cases for missing kind, missing/malformed deliverable marker, stale SHA, duplicate/conflicting records, and idempotent readback.
- [ ] Run the focused suite and confirm each new case fails for the intended missing behavior.
- [ ] Export exact deliverable marker parsing and add the early no-commit branch after top-level lineage resolution.
- [ ] Persist then exhaustively read back the canonical record; preserve the existing PR path without fallback.
- [ ] Run the focused suite and existing `deliver-source-inventory.test.mjs` to green.

### Task 3: No-commit Close authorization

**Files:**

- Modify: `scripts/task-tracker/lib/close-delivery-receipt.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Create: `scripts/tests/unit/task-tracker/verbs/close-no-commit-delivery.test.mjs`

**Interfaces:**

- Consumes: issue body, repository, accepted SHA, and parsed no-commit comment projection.
- Produces: frozen close authorization with `mode: no-commit`, or a categorized `close-delivery-receipt:*` refusal.

- [ ] Write failing tests for valid authorization and missing, malformed, duplicate, conflicting, wrong-issue, wrong-kind, wrong-URL, and wrong-SHA evidence.
- [ ] Run `node --test scripts/tests/unit/task-tracker/verbs/close-no-commit-delivery.test.mjs` and confirm the valid case currently fails as receipt-missing.
- [ ] Load comments for no-commit issues and route the pure receipt gate through exact record matching.
- [ ] Revalidate the live body and accepted Review SHA at close time; bypass only PR-specific fresh verification for the validated no-commit mode.
- [ ] Run the focused Close suite plus `close-delivery-receipt.test.mjs` to green.

### Task 4: Lifecycle evidence and delivery

**Files:**

- Modify: the issue #1439 governed record only through AITM verbs.

**Interfaces:**

- Consumes: passing focused and repository-wide verification.
- Produces: checked AC/VC evidence, commit attribution, hosted CI evidence, governed delivery receipt, and close transaction.

- [ ] Run `npm run lint` and `npm run format:check`.
- [ ] Run both focused suites and all directly affected delivery/close suites.
- [ ] Run `npm test`, `npm run test:slow`, and the Test-stage sandbox.
- [ ] Stamp each VC and AC only after reviewing its successful output.
- [ ] Commit with issue attribution, approve under `TT_FULL_AUTO=1`, deliver through the provider-action envelope when one is emitted, and close #1439.
- [ ] Resume #1407, rerun `/task deliver` to create its no-commit authorization, and close the epic.
