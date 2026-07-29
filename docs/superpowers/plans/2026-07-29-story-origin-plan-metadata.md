# Story Origin and Plan Metadata Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate create-time story provenance from plan-time planning output without weakening issue-body, lifecycle, marker, or evidence gates.

**Architecture:** Introduce a small heading-parameterized metadata-section core, preserve the existing Plan Metadata API through wrappers, and add Story Origin wrappers and provenance migration. Creation always renders both top-level headings, lifecycle validation moves the non-empty Plan Metadata requirement to Plan exit, and the existing corpus backfill becomes the idempotent migration path.

**Tech Stack:** Node.js ES modules, `node:test`, GitHub CLI-backed AITM issue workflow, Markdown issue-body templates.

## Global Constraints

- `## Story Origin` and `## Plan Metadata` remain flat top-level sections; nested metadata subheadings are forbidden.
- Creation requires populated Story Origin and permits empty Plan Metadata.
- Provenance is amendable after creation; all live writes still use `mutateIssueBody`.
- Migration moves only `kind`, `discovered-during`, `related`, `blocks`, `parent`, `size-note`, and `size-guess`; unknown fields remain in Plan Metadata.
- `size-note` is renamed to `size-guess`.
- Existing hidden markers, verifier IDs, and checkboxes must survive all transformations.
- Work is performed sequentially in the seeded #892 worktree; no subagent dispatch is authorized.

---

### Task 1: Shared metadata-section grammar and Story Origin API

**Files:**

- Create: `scripts/task-tracker/lib/metadata-section.mjs`
- Create: `scripts/task-tracker/lib/story-origin.mjs`
- Modify: `scripts/task-tracker/lib/plan-metadata.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/story-origin-lib.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/plan-metadata-lib.test.mjs`

**Interfaces:**

- Produces: `sectionBounds(lines, heading)`, `normalizeMetadataValue(value)`, `normalizeMetadataSection(body, heading)`, `findUnboldMetadataLabels(body, heading)`, `hasMetadataFields(body, heading)`, and `upsertMetadataField(body, heading, key, value)`.
- Preserves: `normalizePlanMetadataLine`, `normalizePlanMetadataValue`, `normalizePlanMetadataSection`, and `findUnboldPlanMetadataLabels`.
- Adds: `normalizeStoryOriginValue`, `normalizeStoryOriginSection`, `findUnboldStoryOriginLabels`, `hasStoryOriginFields`, and `upsertStoryOriginField`.

- [ ] **Step 1: Write failing adjacent-boundary and amendment tests**

Add tests that place Story Origin immediately before Plan Metadata, prove each normalizer stops at the next heading, prove `parent` and `blocks` can be inserted/replaced, and prove unrelated markers are byte-identical.

- [ ] **Step 2: Verify the tests fail for the missing Story Origin module**

Run: `node --test scripts/task-tracker/tests/unit/lib/story-origin-lib.test.mjs`

Expected: FAIL because `lib/story-origin.mjs` does not exist.

- [ ] **Step 3: Extract the shared primitives and add wrappers**

Use strict `## <heading>` matching and stop bounds at `^#{1,6}\s+`. Treat only flat `- **key**: value` or `- key: value` lines as metadata fields; comments and prose do not satisfy `hasMetadataFields`.

- [ ] **Step 4: Run focused metadata tests**

Run: `node --test scripts/task-tracker/tests/unit/lib/story-origin-lib.test.mjs scripts/task-tracker/tests/unit/lib/plan-metadata-lib.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the metadata core**

Run:

```bash
git add scripts/task-tracker/lib/metadata-section.mjs scripts/task-tracker/lib/story-origin.mjs scripts/task-tracker/lib/plan-metadata.mjs scripts/task-tracker/tests/unit/lib/story-origin-lib.test.mjs scripts/task-tracker/tests/unit/lib/plan-metadata-lib.test.mjs
git commit -m "[#892] refactor(metadata): share story section grammar"
```

### Task 2: Creation and templates emit Story Origin with optional Plan Metadata

**Files:**

- Modify: `scripts/task-tracker/preflight-issue.mjs`
- Modify: `scripts/gh/create-issue.mjs`
- Modify: `templates/stub-body.md`
- Modify: `templates/epic-body.md`
- Modify: `templates/sub-issue-body.md`
- Modify: `templates/solo-issue-body.md`
- Create: `scripts/task-tracker/tests/unit/lib/story-origin-authoring.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/preflight-issue.test.mjs`
- Modify: `scripts/gh/create-issue.test.mjs`
- Modify: `scripts/task-tracker/tests/slow/lib/issue-authoring.test.mjs`

**Interfaces:**

- Consumes: `normalizeStoryOriginValue` and the existing Plan Metadata normalizer.
- Produces: shaped CLI contract `--story-origin-file <path>` required for epic, sub-issue, and solo; `--plan-metadata-file <path>` optional for all shaped forms.
- Stub origin: `- **kind**: <resolved-kind>`; Plan Metadata body is empty.

- [ ] **Step 1: Write failing authoring tests**

Cover solo creation with a Story Origin file and no Plan Metadata file, stub creation with no section files, absence of the retired plan placeholder, adjacent heading order, optional early planning input, and sub-issue `parent` placement in Story Origin.

- [ ] **Step 2: Verify the focused authoring test fails**

Run: `node --test scripts/task-tracker/tests/unit/lib/story-origin-authoring.test.mjs`

Expected: FAIL because the CLI and templates do not accept/render Story Origin.

- [ ] **Step 3: Update templates and preflight fills**

Add `{{story_origin}}` under `## Story Origin`; always emit `## Plan Metadata`, substituting an empty string when no plan fragment is supplied. Normalize both fill values before template substitution.

- [ ] **Step 4: Update create-issue validation and flag forwarding**

Require `--story-origin-file` for non-stub shapes, make `--plan-metadata-file` optional, preserve it when supplied, and update usage/self-documentation tests. For sub-issues, inject `parent` into Story Origin through the normalized fill instead of rendering `**Parent epic:**` outside a metadata section.

- [ ] **Step 5: Run focused authoring suites**

Run: `node --test scripts/task-tracker/tests/unit/lib/story-origin-authoring.test.mjs scripts/task-tracker/tests/unit/lib/preflight-issue.test.mjs scripts/gh/create-issue.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the creation contract**

Run:

```bash
git add scripts/task-tracker/preflight-issue.mjs scripts/gh/create-issue.mjs templates scripts/task-tracker/tests/unit/lib/story-origin-authoring.test.mjs scripts/task-tracker/tests/unit/lib/preflight-issue.test.mjs scripts/gh/create-issue.test.mjs scripts/task-tracker/tests/slow/lib/issue-authoring.test.mjs
git commit -m "[#892] feat(issue): split story origin from plan metadata"
```

### Task 3: Move Plan Metadata enforcement to Plan exit

**Files:**

- Modify: `scripts/task-tracker/verbs/refine.mjs`
- Modify: `scripts/task-tracker/lib/refine-exit-stub-placeholder-guard.mjs`
- Create: `scripts/task-tracker/lib/plan-exit-plan-metadata-guard.mjs`
- Modify: `scripts/task-tracker/states/plan.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/plan-metadata-exit-guard.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/refine-tbd-placeholder.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/guard-registry-plan-exit.test.mjs`
- Modify: `scripts/task-tracker/lib/guard-registry.mjs`

**Interfaces:**

- Consumes: `hasMetadataFields(body, 'Plan Metadata')`.
- Produces: guard ID `plan-exit-plan-metadata` with a Plan→Develop-only refusal naming the empty/missing section.
- Preserves: the Acceptance Criteria stub sentinel and Refine→Plan refusal.

- [ ] **Step 1: Write failing guard tests**

Cover missing heading, blank section, comment-only section, prose-only section, a populated flat label, rollback to Refine, undefined body, state registration, and aggregated guard execution.

- [ ] **Step 2: Verify the guard test fails**

Run: `node --test scripts/task-tracker/tests/unit/lib/plan-metadata-exit-guard.test.mjs`

Expected: FAIL because the guard module does not exist.

- [ ] **Step 3: Implement and register the Plan-exit guard**

Return `{ok:true}` for non-Develop destinations and undefined bodies, matching existing pure Plan-exit guard conventions. Return one deterministic blocker for missing or empty planning metadata.

- [ ] **Step 4: Retire only the Plan Metadata stub placeholder**

Delete `STUB_PLAN_METADATA_PLACEHOLDER` and its `body.includes` checks from preflight, refine, and the refine-exit guard. Keep Scope and Acceptance Criteria stub behavior unchanged.

- [ ] **Step 5: Run focused lifecycle tests**

Run: `node --test scripts/task-tracker/tests/unit/lib/plan-metadata-exit-guard.test.mjs scripts/task-tracker/tests/unit/lib/refine-tbd-placeholder.test.mjs scripts/task-tracker/tests/unit/lib/guard-registry-plan-exit.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the lifecycle policy**

Run:

```bash
git add scripts/task-tracker/verbs/refine.mjs scripts/task-tracker/lib/refine-exit-stub-placeholder-guard.mjs scripts/task-tracker/lib/plan-exit-plan-metadata-guard.mjs scripts/task-tracker/states/plan.mjs scripts/task-tracker/lib/guard-registry.mjs scripts/task-tracker/tests/unit/lib/plan-metadata-exit-guard.test.mjs scripts/task-tracker/tests/unit/lib/refine-tbd-placeholder.test.mjs scripts/task-tracker/tests/unit/lib/guard-registry-plan-exit.test.mjs
git commit -m "[#892] feat(plan): require planning output at plan exit"
```

### Task 4: Idempotent provenance migration and validation surfaces

**Files:**

- Modify: `scripts/task-tracker/backfill-plan-metadata.mjs`
- Create: `scripts/task-tracker/tests/unit/core/backfill-story-origin.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/backfill-plan-metadata.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/coverage-backfill-plan-metadata.test.mjs`
- Modify: `scripts/gh/lib/issue-body-verifier.mjs`
- Modify: `scripts/task-tracker/lib/agent-review/validators/body-sections.mjs`
- Modify: affected validator/template/command tests and `scripts/task-tracker/tests/unit/meta/test-tree-layout.baseline.json`

**Interfaces:**

- Produces: `buildPlanMetadataBackfill(body)` with status `skip` or `healed`, a marker-preserving transformed body, and changed-field reporting.
- Migration rule: insert Story Origin immediately before Plan Metadata; move only the allowlisted provenance keys; rename `size-note`; normalize both sections; never reorder verifier or lifecycle sections.

- [ ] **Step 1: Write failing migration tests**

Cover a mixed legacy Plan Metadata section, unknown-field preservation, existing Story Origin merge, already-split no-op, section ordering, hidden-marker preservation, and repeated execution.

- [ ] **Step 2: Verify the migration test fails**

Run: `node --test scripts/task-tracker/tests/unit/core/backfill-story-origin.test.mjs`

Expected: FAIL because the legacy backfill only bolds Plan Metadata.

- [ ] **Step 3: Implement the pure migration transform**

Parse by strict heading bounds, remove allowlisted provenance lines from Plan Metadata, merge them into Story Origin without duplicate keys, normalize both sections, and report moved/renamed/bolded keys. Return `skip` when the output is byte-identical.

- [ ] **Step 4: Update canonical section validators and fixtures**

Require Story Origin between Scope and Plan Metadata. Plan Metadata may be empty before Plan exit, so creation-time verification checks presence/order while the Plan-exit guard owns non-empty planning output.

- [ ] **Step 5: Run migration and validator tests**

Run: `node --test scripts/task-tracker/tests/unit/core/backfill-story-origin.test.mjs scripts/task-tracker/tests/unit/core/backfill-plan-metadata.test.mjs scripts/task-tracker/tests/unit/lib/issue-body-verifier.test.mjs scripts/task-tracker/lib/agent-review/validators/body-sections.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit migration and validation**

Run:

```bash
git add scripts/task-tracker/backfill-plan-metadata.mjs scripts/task-tracker/tests/unit/core/backfill-story-origin.test.mjs scripts/task-tracker/tests/unit/core/backfill-plan-metadata.test.mjs scripts/task-tracker/tests/unit/core/coverage-backfill-plan-metadata.test.mjs scripts/gh/lib/issue-body-verifier.mjs scripts/task-tracker/lib/agent-review/validators/body-sections.mjs scripts/task-tracker/tests
git commit -m "[#892] feat(migrate): relocate provenance into story origin"
```

### Task 5: Integrated verification and delivery

**Files:**

- Modify: any focused fixture or documentation surfaced by the full suite, only when it encodes the intentionally changed contract.
- Verify: the complete branch delta and live #892 issue body.

- [ ] **Step 1: Run formatter and inspect the diff**

Run: `npm run format`

Expected: formatter exits 0; only #892-scoped files change.

- [ ] **Step 2: Run all focused verifier commands**

Run each root VC independently:

```bash
node --test scripts/task-tracker/tests/unit/lib/story-origin-authoring.test.mjs
node --test scripts/task-tracker/tests/unit/lib/plan-metadata-exit-guard.test.mjs
node --test scripts/task-tracker/tests/unit/lib/story-origin-lib.test.mjs
node --test scripts/task-tracker/tests/unit/core/backfill-story-origin.test.mjs
```

Expected: all PASS.

- [ ] **Step 3: Run lint and format verification**

Run: `npm run lint`

Expected: PASS.

Run: `npm run format:check`

Expected: PASS.

- [ ] **Step 4: Run fast and slow suites**

Run: `npm test`

Expected: PASS.

Run: `npm run test:slow`

Expected: PASS.

- [ ] **Step 5: Verify commits and branch delta**

Run:

```bash
git diff --check
git status --short
git log --oneline origin/trunk..HEAD
git diff --name-status origin/trunk...HEAD
```

Expected: no whitespace errors, clean worktree, every commit contains `[#892]`, and only planned files are present.

- [ ] **Step 6: Complete AITM evidence and orchestration**

Run the sanctioned AC/DoD stamp and `npx aitm test 892` commands, then let the orchestrator run review. Integration must be verified against a freshly fetched `origin/trunk`; closure waits for a qualifying `[#892]` commit reachable from `origin/trunk` and explicit human Final Review approval.
