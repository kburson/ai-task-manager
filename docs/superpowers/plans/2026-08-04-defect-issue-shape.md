# Defect Issue Shape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class defect shape whose CLI, agent, full-auto, title, and GitHub web-form intake converge on one governed AITM issue contract.

**Architecture:** Extend the existing generic shape renderer and label-prefix authority instead of building a parallel issue creator. A narrow web adapter parses GitHub form fields and invokes that same renderer; shared rules route local defect intent to the shape and preserve `/task report` for upstream reporting.

**Tech Stack:** Node.js ES modules, `node:test`, Markdown templates, GitHub issue forms and Actions, existing AITM preflight/create wrappers.

## Global Constraints

- Never call `gh issue create`; all local creation stays behind `create-issue.mjs`.
- `defect` requires the same Scope, AC, and Story Origin fragments as `solo`.
- The shape adds `bug` and `🐞 [BUG]` automatically and idempotently.
- Existing `stub`, `solo`, `sub-issue`, and `epic` output stays compatible.
- Web normalization reuses preflight and is a no-op for canonical or non-bug issues.
- `/task report` remains limited to upstream external-product reporting.
- Scratch files live under `.tmp/gh/` or `.tmp/plan/`, never system temp.

---

### Task 1: Defect shape rendering and creation defaults

**Files:**

- Create: `templates/defect-body.md`
- Create: `.ai-task-manager/templates/defect-body.md`
- Create: `scripts/task-tracker/tests/unit/lib/defect-shape.test.mjs`
- Modify: `scripts/task-tracker/preflight-issue.mjs`
- Modify: `scripts/gh/create-issue.mjs`

**Interfaces:**

- Consumes: `--shape defect`, title, Scope, AC, Story Origin, and optional diagnostic fragments.
- Produces: `applyShapeDefaults(args)` and canonical defect body output from preflight.

- [ ] **Step 1: Write RED shape tests**

Assert that dry-run accepts `defect`, renders all required headings and a title-derived User Story, and that `applyShapeDefaults({shape:'defect',label:[]})` returns one `bug` label. Assert a solo input remains label-free.

- [ ] **Step 2: Run RED**

Run: `node --test scripts/task-tracker/tests/unit/lib/defect-shape.test.mjs`

Expected: FAIL because the shape, template, and exported default helper do not exist.

- [ ] **Step 3: Implement shape validation, flags, defaults, and templates**

Add `defect` to both valid-shape sets and usage text. Forward `--title` plus the four optional diagnostic files only for defect. Add safe default diagnostic prose and fill `defect_summary`, `reproduction`, `root_cause`, `fix_direction`, and `out_of_scope`. Apply `bug` once before body/title creation.

- [ ] **Step 4: Run GREEN and legacy shape regression**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/defect-shape.test.mjs \
  scripts/task-tracker/tests/unit/lib/preflight-issue.test.mjs \
  scripts/gh/create-issue.test.mjs \
  scripts/task-tracker/tests/slow/lib/issue-authoring.test.mjs
```

Expected: all files pass; legacy shape snapshots remain unchanged.

### Task 2: Canonical label-driven title reconciliation

**Files:**

- Modify: `scripts/task-tracker/lib/beta-report-title-reconcile.mjs`
- Modify: `.github/workflows/label-beta-report.yml`
- Modify: `scripts/task-tracker/tests/unit/lib/beta-report-title-reconcile.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/beta-report-templates-497.test.mjs`
- Modify: `scripts/task-tracker/lib/config-init/issue-templates.mjs`

**Interfaces:**

- Consumes: issue title plus effective label names after durable beta-marker reconciliation.
- Produces: `reconcileIssueTitle(title, labels)` using `KIND_PREFIXES` and `stripKnownPrefix`.

- [ ] **Step 1: Write RED canonical-prefix tests**

Pin `bug → 🐞 [BUG]`, `beta-defect → 🐞 [Defect]`, `beta-feature → 🙏 [Feature Request]`, no-signal stripping, and idempotency. Assert the workflow calls the label-driven helper and the generated bug form mirrors `KIND_PREFIXES.bug`.

- [ ] **Step 2: Run RED**

Run: `node --test scripts/task-tracker/tests/unit/lib/beta-report-title-reconcile.test.mjs scripts/task-tracker/tests/unit/core/beta-report-templates-497.test.mjs`

Expected: FAIL on bare-emoji results and missing helper wiring.

- [ ] **Step 3: Implement the shared reconciliation path**

Import the existing kind-prefix authority, expose `reconcileIssueTitle`, update the workflow to pass effective labels, and update generated issue-form content. Keep beta labels marker-derived; never infer them from titles.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/beta-report-title-reconcile.test.mjs \
  scripts/task-tracker/tests/unit/core/beta-report-templates-497.test.mjs \
  scripts/task-tracker/tests/unit/gh/lib/issue-template-prefix.test.mjs \
  scripts/task-tracker/tests/unit/gh/create-issue-kind-prefix.test.mjs
```

Expected: all prefix authorities agree.

### Task 3: GitHub web-form convergence

**Files:**

- Create: `scripts/task-tracker/lib/defect-web-intake.mjs`
- Modify: `.github/workflows/label-beta-report.yml`
- Modify: `.github/ISSUE_TEMPLATE/bug.yml`
- Modify: `scripts/task-tracker/tests/unit/lib/defect-shape.test.mjs`

**Interfaces:**

- Consumes: `{ issue, projectDir, renderDefect? }` where `issue` contains title, body, labels, and `created_at`.
- Produces: frozen `{ status:'normalized'|'skip', body?, reason? }`; default rendering invokes preflight through repository-local scratch fragments.

- [ ] **Step 1: Write RED web normalization tests**

Use a realistic GitHub form body with problem, reproduction, AC, priority, size, estimate, and rank headings. Assert parsed values reach the renderer, the output receives the original Backlog timestamp, a second pass skips, and non-bug/beta/canonical bodies skip.

- [ ] **Step 2: Run RED**

Run: `node --test scripts/task-tracker/tests/unit/lib/defect-shape.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the fail-closed adapter and workflow update**

Parse only recognized H3 form fields. Default missing AC and diagnostic values to concrete policy text. Write fragments beneath `.tmp/gh/`, execute `preflight-issue.mjs --shape defect`, stamp the Backlog entry marker, and return the body. Update the workflow body only when status is `normalized`; let thrown parse/render failures fail the Action without changing the issue.

- [ ] **Step 4: Run GREEN and workflow structure tests**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/defect-shape.test.mjs \
  scripts/task-tracker/tests/unit/core/beta-report-templates-497.test.mjs \
  scripts/task-tracker/tests/unit/core/templates.test.mjs
```

Expected: web intake converges and declarative YAML remains valid.

### Task 4: Agent and full-auto routing contract

**Files:**

- Modify: `skill/shared/router.md`
- Modify: `skill/shared/rules/create-issue.md`
- Modify: `skill/shared/rules/block.md`
- Modify: `skill/shared/rules/report-on-block.md`
- Modify: `skill/adapters/codex/SKILL.md`
- Modify: `skill/adapters/claude/SKILL.md`
- Modify: `AGENTS.md`
- Modify: `scripts/task-tracker/codex-superpowers.mjs`
- Modify: `scripts/task-tracker/bash-guard.mjs`
- Modify: `scripts/task-tracker/lib/gh-edit-guard.mjs`
- Modify: `skill/shared/rules/bind.md`
- Modify: `skill/shared/rules/plan-mode-backlog.md`
- Modify: `docs/guides/workflow.md`
- Modify: `scripts/task-tracker/tests/unit/lib/defect-shape.test.mjs`

**Interfaces:**

- Consumes: conversational local defect intent and full-auto defect discovery.
- Produces: deterministic `--shape defect` routing, create-then-block sequencing, and explicit local-versus-upstream reporting language.

- [ ] **Step 1: Write RED documentation/routing assertions**

Assert that the shared creation rule maps create/file/generate defect or bug-story wording to `--shape defect`, the blocking rule orders creation before `npx aitm block`, report-on-block limits `/task report` to upstream external products, and every hard-coded sanctioned shape menu includes defect.

- [ ] **Step 2: Run RED**

Run: `node --test scripts/task-tracker/tests/unit/lib/defect-shape.test.mjs`

Expected: FAIL on missing routing and stale shape menus.

- [ ] **Step 3: Update all shared and generated instruction surfaces**

Make the source rule authoritative, keep adapters as pointers, and synchronize generated/project guard text. Update the workflow guide's shape table and local blocker sequence without broadening `/task report`.

- [ ] **Step 4: Run GREEN plus instruction audits**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/defect-shape.test.mjs \
  scripts/task-tracker/tests/unit/core/docs-no-raw-gh-create.test.mjs \
  scripts/task-tracker/tests/unit/core/codex-support-matrix.test.mjs \
  scripts/task-tracker/tests/unit/core/adapter-dedup.test.mjs \
  scripts/task-tracker/tests/unit/core/command-catalog-policy.test.mjs
```

Expected: all instruction and help surfaces agree.

### Task 5: Repository proof and governed delivery

**Files:**

- Verify every file above plus this plan and its design document.

**Interfaces:**

- Consumes: exact committed #1096 candidate SHA.
- Produces: focused/full verification, commit trace, exact-SHA review, Test receipt, Review approval, trunk integration, and sanctioned close.

- [ ] **Step 1: Run targeted and static proof**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/defect-shape.test.mjs
npm run lint
npm run format:check
git diff --check
node scripts/dev-env/verify-local-worktree.mjs
```

Expected: all pass and diff check is silent.

- [ ] **Step 2: Run repository lanes**

Run:

```bash
npm run test:unit
npm run test:integration
npm run test:slow
```

Expected: every lane passes within its configured ceiling.

- [ ] **Step 3: Commit, trace, and review exact SHA**

Stage only #1096 paths, commit as `feat(issue): add governed defect shape [#1096]`, and run `npx aitm commit-trace 1096`. Review the exact SHA for correctness, compatibility, and fail-closed web mutation. Resolve every Critical or Important finding before continuing.

- [ ] **Step 4: Complete governed lifecycle and integration**

Run `TT_FULL_AUTO=1 npx aitm test 1096`, then Review and audited full-auto approval. Fetch and compare local trunk, remote trunk, and candidate; integrate only after exact ancestry/mergeability evidence. Verify merged trunk, push, close through `npx aitm close 1096`, then remove the merged worktree and branch.
