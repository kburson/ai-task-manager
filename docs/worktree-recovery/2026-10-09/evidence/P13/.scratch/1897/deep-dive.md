## Deep-Dive Analysis

### Story Intent
- **Beneficiary:** AITM delivery operator.
- **Capability:** Locate, stamp, and evidence-check canonical acceptance criteria even when approved Scope contains source-plan AC headings.
- **Need:** The current first-match locator selects an embedded lower-level heading before the issue's canonical level-two section, hiding declared verifier citations.
- **Value or failure prevented:** Verified delivery can finish without rewriting approved Scope or bypassing evidence gates.

### Root Cause and Bounded Design
The shared locateAcSection in scripts/task-tracker/lib/ac-evidence.mjs selects the first level-one-through-four Acceptance Criteria heading. An embedded #### Acceptance Criteria inside Scope precedes the actual ## Acceptance Criteria. parseEvidenceAcs, findEvidenceAc, findAcSectionCheckbox, stamping, and gateEvidenceTick consequently target the wrong section.

Prefer an exact level-two Acceptance Criteria heading using the existing case/suffix conventions, then fall back to the existing level-one-through-four pattern only when there is no canonical heading. Keep section termination, verifier citation resolution, marker provenance and all existing callers unchanged. Do not import the reviewed-scope scanner: it already imports ac-evidence and would introduce a circular seam. General Markdown replacement and unrelated VC/DoD scanners are outside scope.

### Implementation Plan
1. Add scripts/tests/unit/task-tracker/lib/ac-evidence-heading-selection.test.mjs with @story #1897. Cover embedded level-one/three/four headings preceding canonical criteria, exact vc-list resolution, checkbox lookup, unstamped gate refusal, successful fixture stamping/gating, unchanged Scope/citation bytes, and legacy heading/declaration forms without canonical H2.
2. Run the new tests before production edits and retain genuine RED.
3. Add the canonical heading pattern and choose its match before the existing fallback in locateAcSection. No public signatures change.
4. Run the exact VC1 affected group, lint, format and diff checks; retain actual receipts. Full suites run only in hosted CI.
5. Commit with [#1897], publish the branch, open a draft PR with Refs #1897, and hand off native lifecycle/CI state to root.

### Semantic Seven-Question Review
Stakeholder: the delivery operator is explicit. Capability: canonical AC lookup, stamping and checking is concrete. Need: an observed embedded-heading failure blocks native evidence. Counterfactual value: absent this change, delivery needs prohibited approved-content rewrites or bypasses. Source grounding: the current shared locator and actual downstream #144 refusal support the story. Sibling distinctness: this is AC precedence only, distinct from #144's document Scope compatibility. Standalone readability: the issue supplies reproduction, affected APIs, legacy boundary and exact verifier command.

### Scope and Verification Limits
Fixture stamps demonstrate grammar and gate behavior; they are not native verification receipts. Actual AC stamping will run the issue-declared command through the public native verb. No #144 source or accepted artifacts are changed. Root owns native Test serialization, Review, integration and Close.
