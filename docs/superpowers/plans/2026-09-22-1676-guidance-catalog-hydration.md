# Guidance Catalog Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map every migrating lifecycle obligation to enforcement or retained protocol and complete the validated catalog and human guide.

**Architecture:** A machine-checked rule map links source clauses to existing enforcement, catalog entries, and shipped human documentation. The catalog stays read-only guidance. #1767 owns the corrected post-catalog feasibility recheck after #1765 repairs the actual CLI capture.

**Tech Stack:** Node.js ESM, `node:test`, YAML through the existing guidance parser/validator, GitHub issue #1676.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; accepted WBS contract: `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md` Task 24.

## Global Constraints

- Keep the action vocabulary and catalog schema closed; add no shell-command operation or YAML authority.
- Preserve the frozen Task 1a baseline and earlier candidate reports as historical inputs.
- Retain installed router, pickup, and adapter prose in this child.
- Retain #1676's committed NO-GO measurement and comparison as historical, fail-closed evidence. They are not proof of a coherent lifecycle or authority to migrate installed skills.
- Fixed absolute proxy ceilings are 5,000 / 300 / 500 / 7,000 and working maxima are 4,000 / 240 / 400 / 5,600.
- A revised estimate of at least 24 hours stops execution for decomposition or revision. A current feasibility GO is #1767's closure and downstream entry gate.

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

### Task 3: Verify and deliver the bounded catalog work

**Files:** The catalog, rule map, documentation, and focused tests named in Tasks 1 and 2. Preserve the already committed `feasibility-recheck-1676.json` and `context-comparison-1676.json` as historical NO-GO artifacts.

**Interfaces:** #1676 hands a complete, validated obligation map and catalog to #1767. The historical measurement is a fail-closed diagnostic, not the post-correction GO assertion. #1767 retains ownership of proposed static text and the corrected CLI recheck; #1677 remains blocked until #1767 is Done.

- [ ] Inspect every source obligation against the map, including bind discussion and deferred pickup; repair omitted rows and prove row-deletion failures in the focused coverage test.
- [ ] Run VC15 and published validation on final catalog and documentation bytes. Keep installed router, pickup, and adapter prose intact.
- [ ] Run the declared fast and slow suites, lint, formatting, and `git diff --check`; commit any corrections with #1676 attribution. Deliver #1676 only after its catalog and documentation criteria have actual evidence.
