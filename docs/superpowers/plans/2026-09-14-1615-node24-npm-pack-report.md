# Node 24 and npm Pack Report Compatibility Implementation Plan (#1615)

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Preserve the Node.js 24 floor and make all AITM pack-report consumers
strictly compatible with npm 11 and npm 12 output.

**Architecture:** Centralize structural normalization in one test helper with an
explicit package-identity contract. Keep package policy in root metadata, keep
consumer assertions in their existing tests, and add a small hosted compatibility
matrix for the two npm majors.

**Tech Stack:** Node.js ESM, `node:test`, npm CLI JSON output, GitHub Actions,
JSON fixtures, Markdown.

## Decomposition Waiver

- **Rationale**: The parser contract, five migrations, and dual-npm CI evidence form one atomic compatibility boundary; landing any subset would preserve divergent or unproved normalization behavior.
- **Expected-focused-duration**: 13.5 hours
- **Milestone-checkpoint-plan**: Review the runtime-policy red/green cycle, then the parser red/green cycle, then all five migrated consumers, then the isolated AITM Test and Review receipts.
- **Why-no-nested-children**: Child branches would need to duplicate or sequence the same helper and fixtures, increasing integration and evidence risk without producing independently releasable behavior.
- **Approved-by**: kburson via Full-Auto authorization
- **Approved-at**: 2026-09-14T17:18:18Z

---

### Task 1: Lock the runtime and hosted-matrix policy

**Files:**

- Create: `scripts/tests/unit/task-tracker/core/node-runtime-policy.test.mjs`
- Modify: `.github/workflows/ci.yml`

- [ ] Write a policy test that parses root package metadata and CI YAML, proving
      Node `>=24`, Node 24 minimum coverage, intentional later/current coverage,
      no active Node 22 pin, and npm 11/npm 12 compatibility lanes.
- [ ] Run the focused test and confirm the missing compatibility matrix is the
      expected failure.
- [ ] Add a hosted matrix using supported Node 24-or-newer runtimes, pin and
      verify npm 11 and npm 12, then run the parser and all five consumer tests.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Define the fail-closed normalization contract

**Files:**

- Create: `scripts/tests/helpers/npm-pack-report.mjs`
- Create: `scripts/tests/unit/task-tracker/core/npm-pack-report.test.mjs`
- Create: `scripts/tests/fixtures/npm-pack-report/*.json`
- Create: `scripts/tests/fixtures/npm-pack-report/malformed.txt`

- [ ] Add literal npm 11 and npm 12 fixtures plus malformed, empty, multiple,
      unexpected-name, missing-files, and missing-filename cases.
- [ ] Write focused tests for every acceptance and rejection boundary and run
      them to confirm they fail because the helper does not yet exist.
- [ ] Implement the smallest structural parser that makes the focused tests
      pass without inspecting the npm version.
- [ ] Re-run the focused test and refactor only while it remains green.

### Task 3: Route every pack consumer through the helper

**Files:**

- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/memory-seed-packaged.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/scope-pack.test.mjs`
- Modify: `scripts/tests/integration/meta/package-test-corpus.test.mjs`
- Modify: `scripts/tests/slow/task-tracker/core/packaged-tail-profile-consumer.test.mjs`

- [ ] Add a contract assertion that detects any named consumer retaining direct
      array/object report normalization, then run it red against the baseline.
- [ ] Replace each local normalization expression with the shared helper; require
      `filename` only in the tail-profile consumer that uses it.
- [ ] Run the helper test and all five consumer tests together and confirm they
      pass under the active npm.

### Task 4: Verify, review, and deliver

- [ ] Run both focused contract commands, the five-consumer command, `npm test`,
      `npm run test:slow`, `npm run lint`, `npm run format:check`, and
      `git diff --check`.
- [ ] Commit the implementation with story-tagged tests and inspect the complete
      `origin/trunk...HEAD` diff.
- [ ] Run AITM Test and Review gates, record peer-review evidence, push the exact
      branch head, open a PR to `trunk`, and wait for hosted checks including both
      npm compatibility lanes.
- [ ] Merge only the reviewed green head, synchronize local and remote trunk,
      and close #1615 through the governed Done transition.
