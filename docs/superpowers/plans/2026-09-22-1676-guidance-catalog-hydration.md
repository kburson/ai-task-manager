# Guidance Catalog Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map every migrating lifecycle obligation to enforcement or retained protocol, complete the validated catalog and human guide, and replace the provisional static feasibility assumption with an obligation-complete measurement.

**Architecture:** A machine-checked rule map links source clauses to existing enforcement, catalog entries, and shipped human documentation. The catalog stays read-only guidance. An exact-byte proposed static fixture and the #1675 actual CLI capture feed the one #1660 feasibility decision before any installed skill prose changes.

**Tech Stack:** Node.js ESM, `node:test`, YAML through the existing guidance parser/validator, GitHub issue #1676.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; accepted WBS contract: `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md` Task 24.

## Global Constraints

- Keep the action vocabulary and catalog schema closed; add no shell-command operation or YAML authority.
- Preserve the frozen Task 1a baseline and earlier candidate reports as historical inputs.
- Retain installed router, pickup, and adapter prose in this child.
- Use the actual #1675 public-CLI capture for the intermediate recheck; label remaining modeled static text as proposed.
- Fixed absolute proxy ceilings are 5,000 / 300 / 500 / 7,000 and working maxima are 4,000 / 240 / 400 / 5,600.
- A NO-GO or a revised estimate of at least 24 hours stops execution for decomposition or revision.

---

### Task 1: Prove obligation coverage and hydrate catalog

**Files:**

- Create: `scripts/tests/fixtures/1558/rule-guidance-map.json`
- Create: `scripts/tests/unit/task-tracker/lib/guidance-rule-coverage.test.mjs`
- Modify: `guidance/requirements.mjs`, `instructions/aitm-guidance.yml`, `instructions/aitm-guidance.release.json`

**Interfaces:** Each map row identifies a source path and exact anchored clause, a required existing enforcement path or retained protocol rule, a catalog guidance ID, and a shipped human-document reference. The unit test validates the map against current source text, the published catalog, the closed operation registry, and resolved shipped-document anchors.

- [ ] Inventory the active router, pickup, bind/resume, state-walk, Test, Review, deliver, close, and commit-trail obligations. Record one stable row per independently enforceable or retained protocol requirement. Reject missing source anchors, duplicate row IDs, and deleted source clauses.
- [ ] Write the failing coverage test. First assert that every mapped operational row has an enforcement path or retained protocol rule, a catalog entry with the expected binding, and a shipped document reference that resolves. Add negative tests that delete a map row, remove an entry or binding, and break an anchor; each must fail for its intended reason.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/guidance-rule-coverage.test.mjs` and record the expected RED result before changing catalog production files.
- [ ] Hydrate the existing catalog entries with concise closed agent operations and complete human summary, trigger, execution, example, and documentation fields. Extend `coreGuidanceRequirements()` only where the mapped required entries need machine enforcement. Keep protocol receipts in adapters and existing execution guards in code.
- [ ] Regenerate the release fingerprint with `node scripts/maintenance/generate-guidance-release.mjs --write`. Run the unit test and `node scripts/task-tracker/guidance.mjs validate --published --refresh --json` to GREEN, then commit this task's files with #1676 attribution.

### Task 2: Complete shipped human documentation

**Files:**

- Modify: `docs/guides/ask-the-script.md`, `docs/guides/workflow.md`, `docs/guides/guard-architecture.md`, `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md`
- Test: `scripts/tests/unit/task-tracker/lib/guidance-rule-coverage.test.mjs`

**Interfaces:** Documentation headings supply stable anchors for catalog references. The historical design receives only a pointer that Epic A's accepted #1558 guidance design supersedes that portion; its other epics remain intact.

- [ ] Extend the RED documentation checks for `npx aitm guidance source`, human copying of the reported package source into the tracked project override, all trust classes, invalid-source recovery, validator modes, independent source and instruction receipts, compaction invalidation, annotation refusal, and disposable cache recovery.
- [ ] Run the coverage unit test and confirm the new documentation assertions fail on the current short guide.
- [ ] Write the guide sections and align the workflow and guard guides with the existing read-only decision boundary. Add the scoped Epic A pointer without changing historical #1559, #1560, or #1561 decisions.
- [ ] Run the coverage unit test and published validation, inspect every catalog documentation anchor, then commit the documentation and any catalog reference corrections with #1676 attribution.

### Task 3: Revalidate obligation-complete static feasibility

**Files:**

- Create: `scripts/tests/fixtures/1558/obligation-complete-static/` files for router, pickup, and both adapters
- Modify: `scripts/maintenance/measure-guidance-candidate.mjs`, `scripts/tests/fixtures/1558/context-comparison.json`, `scripts/tests/fixtures/1558/feasibility-decision.json`
- Test: `scripts/tests/unit/task-tracker/lib/guidance-candidate-measurement.test.mjs`, `scripts/tests/unit/task-tracker/lib/guidance-rule-coverage.test.mjs`

**Interfaces:** The recheck reads exact proposed static files, hashes the completed rule map and actual #1675 CLI capture, keeps baseline identities unchanged, and publishes one deterministic decision with separate current-versus-proposed labels. It does not replace installed skills or claim final release proof.

- [ ] Add RED measurement tests that reject a missing map/static file, a static byte or digest change, an absent actual capture, and any attempt to substitute the earlier provisional static assumption. Require both adapters and all four fixed working maxima.
- [ ] Run the focused measurement tests to RED. Then derive concise router/pickup/adapter proposals that retain every map row's protocol obligation and use the existing closed `aitm explain` route for dynamic guidance.
- [ ] Update the measurement builder to bind map, proposed static bytes, and actual CLI capture identities; retain old candidate reports as historical records. Write the new comparison and sole feasibility decision from the same deterministic inputs.
- [ ] Run `node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json`. If it returns NO-GO, revise proposed text or catalog within fixed budgets, rerun exact measurement, and stop if the accepted constraints still cannot be met.
- [ ] Run VC15, fast and slow tests, lint, formatting, release validation, and `git diff --check` on final bytes. Commit with #1676 attribution only after fresh outputs pass.
