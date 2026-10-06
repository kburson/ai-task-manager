# #1904 Formal Root AC Consumer Repair

> Use executing-plans inline; no additional agent. Root owns independent review and delivery.

## Scope

Select the formal root AC checklist for functional completion and verifier/citation guards when Scope embeds accepted source headings. Preserve the original body and proof markers. The governing design is the bounded live #1904 Fix Direction and exact delivered-source reproduction.

## Context

Delivered e802e425 derives zero criteria from restored ai-peer-review #144 v102 although its formal AC is checked. functional-dod-evidence and both body-invariant AC finders use the first raw H1-H4 match. Historical #1897/#1899 fixed ac-evidence separately. The authoritative downstream Scope cannot be rewritten.

## Story Intent

- **Beneficiary:** Release operators delivering issues whose Scope embeds accepted source requirements
- **Capability:** Evaluate the formal acceptance criteria without confusing embedded source headings with the governed checklist
- **Need:** Functional completion currently reports zero criteria for the restored approved #144 Scope and can inspect the wrong verifier section
- **Value or failure prevented:** Prevent false completion refusals and skipped verifier checks while preserving immutable approved requirements

## Plan Metadata

- Priority: P0
- Size: XS
- Estimate: 2 hours

## Acceptance Criteria

- [ ] Real functional projection and body guards see the formal root AC and preserve Scope bytes.
- [ ] Legacy heading forms remain supported; duplicate live root selection fails closed and malformed canonical body validation remains effective.

## Global Constraints

- No APR edits, installed-module patch, private state changes or approval/evidence bypass.
- Keep existing body proof parsing, legacy section termination and original source offsets.
- Host tests are affected/TIA only with 800-second ceiling; full suites use exact-head hosted CI.
- No native Test/Review/Close by this author.

## Review Focus

- Embedded H4 with checked source examples cannot hide an unchecked formal root AC.
- Fenced/commented canonical examples cannot shadow the real root section.
- Duplicate live canonical roots cannot select a favorable checked section.
- Legacy supported H1/H3/H4 bodies still derive and validate their ACs.
- Verifier/citation offenders retain their actual root source line indices.

## Implementation Tasks

### Task 1: Repair the bounded AC consumer seam

**Files**

- Create scripts/task-tracker/lib/ac-section.mjs, a pure original-offset locator.
- Modify scripts/task-tracker/lib/functional-dod-evidence.mjs and body-invariants.mjs only at their local AC section lookup.
- Create scripts/tests/unit/task-tracker/lib/root-ac-consumers.test.mjs.

**Interfaces**

- Consumes original body string and existing proof/citation validators.
- Produces locateAcSection(body) returning null or {start,end,section}; duplicate live root AC headings throw a descriptive TypeError.
- The three consumer signatures/return shapes stay unchanged for valid supported input.

- [ ] Write real consumer tests first. Build an embedded H4 checked source example followed by one unchecked formal H2 AC; expect total=1,ticked=0 and no derived ACS tick. Make a checked formal case and assert projectFunctionalDod stamps/ticks only its DoD while the entire Scope substring is identical. Root no-verifier and legacy-cmd offenders must be returned at their exact source lines. Test backtick/tilde fences and multiline comments before formal root, legacy H1/H3/H4 forms, missing AC and duplicate root refusal.
- [ ] Run node --test scripts/tests/unit/task-tracker/lib/root-ac-consumers.test.mjs; preserve genuine RED before product code.
- [ ] Implement one pure locator. Scan original lines with offsets and existing owned fence/comment logic; collect live canonical H2 AC headings. Throw if more than one, choose the one if present, otherwise use the supported legacy live match. Retain existing section-end regex and return exact original slice. Import only this dependency-free module into the three consumers; do not import reviewed-scope or alter public evidence grammar.
- [ ] Run VC1 plus affected functional projection/derivation, body guards, citation and body-sections tests. Replay the actual public downstream body read-only and verify root AC total/ticked 1 and original Scope hash unchanged. All assertions must exercise real source functions.
- [ ] Run full lint/format/diff checks; commit attributed [#1904] source/test/plan. Trace, push and open attached draft PR with Refs #1904 and ci-slow. Genuine host full-suite result is not claimed.
- [ ] Handoff exact head/proofs and remaining gates; pause/release own occupancy and repeat no-claim. Root owns exact-head full CI/native Test/Review/provider delivery/Close.

## Semantic Review

All seven questions are yes based on the actual public body/source diagnosis: real release operator, concrete formal-checklist safeguard, reproducible shadowing gap, avoided false refusals/skipped verifier checks, pinned source grounding, distinct remaining consumer seam from closed #1897/#1899, standalone readable narrative. This is an explicit machine review under requested Full-Auto, not observed human technical approval.
