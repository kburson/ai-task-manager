# Review-of-Record Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the main agent. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve one truthful, ordered human review-of-record bundle across multiple immutable protocol attempts and provide safe supported recovery and consolidation.

**Architecture:** Keep `review_id` as the immutable event-log authority and add `record_id` as immutable routing/lineage metadata. A focused record module plans and applies byte-preserving consolidation, while the protocol adds an explicit superseded terminal disposition and the Git boundary excludes only exact Codex capture refs.

**Tech Stack:** Node.js 24+, ECMAScript modules, `node:test`, append-only JSONL protocol events, Git exact-path transactions, Markdown/JSON collateral.

**Spec:** `docs/design/2026-09-13-21-review-record-recovery-design.md`

## Global Constraints

- Use strict test-first red-green-refactor cycles for every behavior change.
- `review_id` remains the sole protocol-attempt security boundary.
- `record_id` is immutable human routing/lineage metadata and never acceptance authority.
- Existing `<review-id>` templates and legacy contexts remain readable without rewriting sealed bytes.
- Dry-run performs no write, delete, stage, or commit.
- Apply never removes a source until every planned destination byte is present and digest-verified.
- Sealed collateral bytes and historical internal paths are never rewritten.
- Git operations stage and commit exact paths only and never capture unrelated worktree changes.

---

### Task 1: Correct the Codex capture-ref boundary

**Files:**

- Modify: `test/unit/repository.test.mjs`
- Modify: `src/git/repository.mjs`

**Interfaces:**

- Consumes: NUL-framed `git for-each-ref` output during reviewer boundary capture.
- Produces: the existing `reviewerBoundary()` result with exact checkpoint and capture namespaces omitted and every other ref retained.

- [ ] **Step 1: Write the failing boundary test**

  Extend the existing checkpoint test with `refs/codex/turn-diffs/captures/session/turn-1` mutations that must leave `refs_digest` unchanged. Add retained controls for `capture`, `captures-evil`, and an ordinary head.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `node --test test/unit/repository.test.mjs`

  Expected: the legitimate capture ref changes the digest before production code changes.

- [ ] **Step 3: Add the exact capture prefix**

  Add `refs/codex/turn-diffs/captures/` beside the checkpoint prefix. Preserve the existing nonempty-suffix check.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Run: `node --test test/unit/repository.test.mjs`

### Task 2: Separate record identity from attempt identity

**Files:**

- Modify: `test/unit/paths.test.mjs`
- Modify: `test/unit/cli-parse.test.mjs`
- Modify: the focused start/service tests located by `rg -n "startReview|review-context" test`
- Modify: `src/collateral/paths.mjs`
- Modify: `src/cli/parse.mjs`
- Modify: `src/cli/run.mjs`
- Modify: `src/protocol/events.mjs`
- Modify: `src/protocol/service.mjs`
- Modify: `src/manifest/render.mjs`

**Interfaces:**

- Consumes: `start --record-id <safe-id>` and templates containing `<record-id>` or `<review-id>`.
- Produces: startup context `{ review_id, record_id, ... }`; `resolveReviewPaths({ reviewId, recordId, ... })`; legacy-context normalization where absent `record_id` resolves to `review_id`.

- [ ] **Step 1: Write failing path tests**

  Prove `<record-id>` creates one stable destination while two attempt IDs produce distinct qualified filenames and distinct scratch workspaces. Prove unsafe record IDs fail and legacy `<review-id>` templates retain short filenames.

- [ ] **Step 2: Run path tests and verify RED**

  Run: `node --test test/unit/paths.test.mjs`

- [ ] **Step 3: Implement record-aware path rendering**

  Add the placeholder, safe-segment validation, destination-scope detection, and attempt-qualified file naming described by the spec.

- [ ] **Step 4: Write failing start/CLI tests**

  Prove `--record-id` parses, defaults to `review_id`, is sealed into startup context, appears in results/manifests, and rejects a conflicting idempotent retry. Prove a legacy context lacking the field remains readable.

- [ ] **Step 5: Run focused tests and verify RED**

  Run the exact affected unit files identified in Step 4.

- [ ] **Step 6: Implement startup and reader compatibility**

  Thread `recordId` through parsing, deterministic startup, routing, result rendering, context validation, and manifest building. Normalize only at read boundaries; never rewrite legacy authority.

- [ ] **Step 7: Run focused tests and verify GREEN**

  Run: `node --test test/unit/paths.test.mjs test/unit/cli-parse.test.mjs`

  Run the focused start/service/manifest files changed in this task.

### Task 3: Add explicit supersession

**Files:**

- Modify: `test/unit/events.test.mjs`
- Modify: `test/unit/reducer.test.mjs`
- Modify: `test/unit/cli-parse.test.mjs`
- Modify: the focused command test located by `rg -n "abandonReview|abandon" test`
- Modify: `src/protocol/events.mjs`
- Modify: `src/protocol/reducer.mjs`
- Modify: `src/cli/parse.mjs`
- Modify: `src/cli/run.mjs`
- Modify: `src/cli/help-data.mjs`
- Modify: `test/helpers/internal-api.mjs`

**Interfaces:**

- Consumes: `peer-review supersede <workspace> --reason <text> --by <successor-review-id>` from a registered participant.
- Produces: terminal `superseded` state and event payload `{ reason, successor_review_id, retained_paths }`; exact-retry idempotency; released reservation.

- [ ] **Step 1: Write failing event and reducer tests**

  Cover transition from representative nonterminal author/reviewer states, terminal-state refusal, payload validation, wrong actor, and preservation of non-accepting terminal evidence.

- [ ] **Step 2: Run protocol tests and verify RED**

  Run: `node --test test/unit/events.test.mjs test/unit/reducer.test.mjs`

- [ ] **Step 3: Implement the closed event and state transition**

  Add the event definition, lifecycle transitions, current actor/next action, projection fields, and immutable terminal disposition.

- [ ] **Step 4: Write failing CLI and command tests**

  Cover required `--reason` and `--by`, safe successor IDs, participant authorization, exact retry, mismatched retry, reservation release, and refusal after accepted/abandoned/superseded terminal states.

- [ ] **Step 5: Run command tests and verify RED**

  Run the exact parser and command files changed in Step 4.

- [ ] **Step 6: Implement command parsing, execution, and help**

  Follow the existing abandonment shape while preserving the distinct supersession contract.

- [ ] **Step 7: Run focused tests and verify GREEN**

  Run: `node --test test/unit/events.test.mjs test/unit/reducer.test.mjs test/unit/cli-parse.test.mjs`

  Run the focused command test changed in this task.

### Task 4: Build the record planner and truthful index

**Files:**

- Create: `src/collateral/review-record.mjs`
- Create: `test/unit/review-record.test.mjs`
- Modify: `src/public-api.mjs`

**Interfaces:**

- Consumes: `{ workspaces, destination, now }` plus real event authority and collateral bytes.
- Produces: `planReviewRecord(input)` returning a deeply frozen operation plan; `renderReviewHistory(plan)` returning deterministic UTF-8 Markdown.

- [ ] **Step 1: Write failing compatibility tests**

  Name the mutations: accepting a cross-record attempt, accepting two terminal authorities, ignoring an unterminated predecessor, trusting response prose instead of submission events, treating an untouched template as a decision, losing chronological ordering, permitting a symlink, or permitting a path escape.

- [ ] **Step 2: Run the new unit suite and verify RED**

  Run: `node --test test/unit/review-record.test.mjs`

- [ ] **Step 3: Implement authority loading and compatibility checks**

  Read each workspace through protocol authority, derive record/artifact identity, terminal disposition, response registry, and sealed paths, then enforce one-record/one-artifact/at-most-one-acceptance constraints.

- [ ] **Step 4: Implement evidence classification and ordering**

  Classify only from parsed metadata plus matching events. Detect an untouched generated template structurally; label completed unsubmitted drafts `not-submitted`; sort by timestamp, attempt ID, and sequence.

- [ ] **Step 5: Implement the immutable mapping plan and index renderer**

  Resolve contained regular files, compute literal source/destination mappings and SHA-256 digests, report collision status, and render all required timeline entries.

- [ ] **Step 6: Run the unit suite and verify GREEN**

  Run: `node --test test/unit/review-record.test.mjs`

### Task 5: Apply consolidation as a verified transaction

**Files:**

- Modify: `test/unit/review-record.test.mjs`
- Modify: `src/collateral/review-record.mjs`
- Modify: `src/git/transaction.mjs` only if its existing exact-path interface cannot represent the operation without widening staging

**Interfaces:**

- Consumes: a fresh `planReviewRecord()` result and `{ mode: 'no-commit' | 'normal' }`.
- Produces: `applyReviewRecord(plan, deps)` with verified destinations, removed originals, `review-history.md`, and `relocation-receipt.json`.

- [ ] **Step 1: Write failing transaction tests**

  Cover no mutation in dry-run, occupied identical and nonidentical destinations, injected copy failure, injected digest mismatch, successful byte-identical relocation, removal only after complete verification, deterministic exact retry, and unrelated dirty-file preservation.

- [ ] **Step 2: Run the focused suite and verify RED**

  Run: `node --test test/unit/review-record.test.mjs`

- [ ] **Step 3: Implement exclusive destination creation and verification**

  Use temporary sibling files, fsync, atomic rename, and reread digest checks. Do not remove any source during this phase.

- [ ] **Step 4: Implement receipt/index creation and source cleanup**

  Write the additive v1 receipt, verify the complete destination set, remove mapped source files, and prune only now-empty source directories.

- [ ] **Step 5: Implement exact-path commit behavior**

  In normal mode, reuse the repository transaction helper or add the smallest focused interface needed to stage mapped additions/deletions only. In no-commit mode, return the verified relocation without invoking Git mutation.

- [ ] **Step 6: Run focused tests and verify GREEN**

  Run: `node --test test/unit/review-record.test.mjs`

### Task 6: Expose consolidation through the closed CLI

**Files:**

- Modify: `test/unit/cli-parse.test.mjs`
- Modify: focused CLI runner tests located by `rg -n "run\(\[|COMMANDS|helpRequest" test/unit test/golden`
- Modify: `src/cli/parse.mjs`
- Modify: `src/cli/run.mjs`
- Modify: `src/cli/help-data.mjs`
- Modify: relevant golden help fixtures

**Interfaces:**

- Consumes: `consolidate <workspace>... --destination <path> (--dry-run | --apply)`.
- Produces: `ai-peer-review.cli-result/v1` with `record_id`, mode, mappings, collisions, digests, index path, receipt path, and commit information.

- [ ] **Step 1: Write failing parser/help tests**

  Require at least two workspaces, one destination, and exactly one of `--dry-run` or `--apply`. Reject duplicate workspaces and incompatible flags.

- [ ] **Step 2: Run parser/help tests and verify RED**

  Run the exact files changed in Step 1.

- [ ] **Step 3: Implement the closed grammar and help contract**

  Add the command, repeatable positional grammar, booleans, usage, searchable help, and error explanations.

- [ ] **Step 4: Write failing runner tests**

  Prove dry-run calls planning only, apply recomputes fresh authority and invokes the transaction, JSON/text output is deterministic, and stable errors retain recovery guidance.

- [ ] **Step 5: Run runner tests and verify RED**

  Run the focused runner files changed in Step 4.

- [ ] **Step 6: Wire planner/apply into the runner**

  Resolve identity and configuration consistently with existing commands and preserve no-shell invocation.

- [ ] **Step 7: Run parser/help/runner tests and verify GREEN**

  Run all focused files changed in this task.

### Task 7: Reproduce the three-attempt incident end to end

**Files:**

- Create: `test/integration/review-record.test.mjs`
- Modify: existing test helpers only where reusable real protocol operations require it

**Interfaces:**

- Consumes: three real attempt workspaces sharing one `record_id`.
- Produces: one verified accepted review-of-record folder and relocation receipt.

- [ ] **Step 1: Write the failing integration fixture**

  Attempt one records revisions requested, author revision, and a completed accepting draft whose `submitted_at` remains null. Attempt two leaves an untouched generated response template. Attempt three reaches accepted finalization. Explicitly supersede attempts one and two.

- [ ] **Step 2: Run the integration test and verify RED**

  Run: `node --test test/integration/review-record.test.mjs`

- [ ] **Step 3: Complete only the minimal integration gaps**

  Adjust production code only for behavior the real fixture proves missing; keep test-only orchestration in test helpers.

- [ ] **Step 4: Run the integration test and verify GREEN**

  Run: `node --test test/integration/review-record.test.mjs`

- [ ] **Step 5: Run mutation checks mentally and add only earned cases**

  Confirm tests fail for wrong record ID, wrong decision classification, missing supersession, wrong ordering, wrong digest, premature source deletion, and a second accepted terminal attempt.

### Task 8: Document and deliver the governed change

**Files:**

- Modify: `README.md`
- Modify: `docs/manual-cross-provider-peer-review.md`
- Modify: any release/extraction records required by repository policy

**Interfaces:**

- Consumes: final CLI and identity contracts.
- Produces: user documentation distinguishing protocol attempts, review records, scratch workspaces, terminal authority, supersession, and consolidation recovery.

- [ ] **Step 1: Update identity and lifecycle documentation**

  Add concise examples for starting replacement attempts with `--record-id`, superseding predecessors, dry-running consolidation, and applying a verified relocation.

- [ ] **Step 2: Run focused suites**

  Run: `node --test test/integration/review-record.test.mjs`

  Run: `node --test test/unit/repository.test.mjs`

- [ ] **Step 3: Run the complete issue verification matrix**

  Run: `npm test`

  Run: `npm run test:slow`

  Run: `npm run test:integration`

  Run: `npm run test:mcp`

  Run: `npm run test:packaging`

  Run: `npm run test:smoke`

  Run: `npm run lint`

  Run: `npm run format:check`

  Run: `npm pack --dry-run`

  Run: `git diff --check`

- [ ] **Step 4: Commit the governed implementation**

  Stage only #21 files and commit with `[#21]` attribution.

- [ ] **Step 5: Advance through governed Test and Review**

  Stamp every acceptance criterion from its cited command receipt, push the exact branch head, open a PR with `Refs #21`, require hosted CI on that SHA, use provider-action delivery, verify the delivery receipt and remote trunk, approve under Full-Auto, and close through AITM.
