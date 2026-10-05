# Canonical Acceptance Criteria Heading Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in the existing isolated #1897 worktree. No additional agents.

**Goal:** Select the issue's canonical level-two Acceptance Criteria before embedded source headings while preserving legacy fallback.

**Architecture:** Keep the shared AC section locator and all public callers. Prefer a level-two heading match; use the existing level-one-through-four match when no canonical heading exists. Do not change section termination or verifier grammar.

**Tech Stack:** Node.js ESM and node:test.

**Spec:** GitHub issue #1897 and its mirrored Deep-Dive Analysis, comment 6002726040.

## Story Intent

- **Beneficiary:** AITM delivery operator.
- **Capability:** Locate, stamp, and evidence-check canonical acceptance criteria even when approved Scope contains source-plan AC headings.
- **Need:** The current first-match locator selects an embedded lower-level heading before the issue's canonical level-two section, hiding declared verifier citations.
- **Value or failure prevented:** Verified delivery can finish without rewriting approved Scope or bypassing evidence gates.

## Global Constraints

- Preserve approved downstream Scope and evidence bytes.
- Preserve verifier citation resolution, marker provenance and evidence-gated checking.
- Keep legacy level-one-through-four headings when no canonical heading exists.
- Do not modify unrelated VC or DoD scanners or import reviewed-scope scanning into AC evidence.
- Run only affected tests on the host; full suites belong to hosted CI.

## Review Focus

- Embedded level-one, level-three and level-four AC headings precede canonical criteria.
- Canonical vc-list commands resolve exactly, including multiple citations.
- Stamping changes only the canonical AC line and preserves source Scope and citations.
- Unstamped canonical criteria remain refused by the evidence gate.
- Legacy heading and declaration forms remain supported without canonical H2.

### Task 1: Canonical heading precedence

**Files:**

- Modify: scripts/task-tracker/lib/ac-evidence.mjs
- Create: scripts/tests/unit/task-tracker/lib/ac-evidence-heading-selection.test.mjs

**Interfaces:**

- Consumes: parseEvidenceAcs(body), findEvidenceAc(body, label), findAcSectionCheckbox(body, label), stampAcEvidenceMarker(body, label, evidence), gateEvidenceTick(body, label).
- Produces: unchanged signatures and result shapes, with canonical AC section precedence.

- [ ] Step 1: Write regression tests for canonical precedence and the five review-focus cases. Use an embedded source AC plus canonical AC with vc-list references. Fixture evidence is grammar data, not a native verifier receipt.

```js
const body = [
  '## Scope',
  '#### Acceptance Criteria',
  '- [ ] Embedded source criterion <!-- aitm-verified cmd="`embedded-command`" -->',
  '## Acceptance Criteria',
  '- [ ] Canonical criterion <!-- aitm-verified vc-list="vc:1" -->',
  '## Verification Commands',
  '- [ ] `node --test canonical.test.mjs` <!-- id=1 -->',
].join('\n');
assert.equal(findEvidenceAc(body, 'Canonical criterion').label, 'Canonical criterion');
assert.equal(gateEvidenceTick(body, 'Canonical criterion').kind, 'refuse-ac-evidence');
```

- [ ] Step 2: Run the new test file and retain genuine failures before production edits.

```sh
node --test scripts/tests/unit/task-tracker/lib/ac-evidence-heading-selection.test.mjs
```

- [ ] Step 3: Add the canonical pattern beside the legacy pattern and prefer its match in locateAcSection.

```js
const CANONICAL_AC_HEADING_RE = /^##\s+Acceptance Criteria\b[^\n]*$/im;
const m = src.match(CANONICAL_AC_HEADING_RE) || src.match(AC_HEADING_RE);
```

- [ ] Step 4: Run all issue-declared affected AC verifiers and preserve legacy, marker and non-demonstrable behavior.

```sh
node --test scripts/tests/unit/task-tracker/lib/ac-evidence-heading-selection.test.mjs scripts/tests/unit/task-tracker/lib/ac-evidence.test.mjs scripts/tests/unit/task-tracker/lib/ac-evidence-vc-list-774.test.mjs scripts/tests/unit/task-tracker/lib/ac-evidence-non-demonstrable-marker.test.mjs
npm run lint
npm run format:check
git diff --check
```

- [ ] Step 5: Commit the focused change with [#1897], stamp actual native AC evidence through the public verb, publish and open a draft PR with Refs #1897. Hand actual lifecycle/CI receipts to root for serial Test, Review and delivery.

```sh
git add scripts/task-tracker/lib/ac-evidence.mjs scripts/tests/unit/task-tracker/lib/ac-evidence-heading-selection.test.mjs docs/superpowers/plans/2026-10-05-1897-canonical-ac-heading.md
git commit -m "[#1897] Select canonical acceptance criteria before embedded source headings"
```

## Author Self-Review

The single shared locator covers all requested parser, checkbox, stamp and gate APIs. The new regression file covers each review-focus case; existing affected tests cover consolidated/legacy markers and citation refusals. No new module, circular import, public API or generalized Markdown policy is introduced. Native Full-Auto approval is machine approval, not independent human review.
