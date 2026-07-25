---
name: Deep-Dive Analysis section placement in issue body
description: Deep-Dive Analysis is a plain `## Deep-Dive Analysis` section placed AFTER Pickup Directive and BEFORE Acceptance Criteria (canonical #810 order), NOT a bottom appendix
type: feedback
originSessionId: 7450cf38-8e9d-4f12-bc09-46a449c835e2
modified: 2026-07-22T02:20:09.894Z
---
CORRECTED 2026-07-21 (was: deep-dive as a bottom `<details>` appendix after DoD). The Agent Review Gate (#810) body-sections validator enforces a fixed canonical section ORDER, and the Deep-Dive sits BEFORE Acceptance Criteria, not at the bottom.

**Canonical `##` section order (body-sections validator):** User Story → Scope → Plan Metadata → Pickup Directive → Deep-Dive Analysis → Acceptance Criteria → Verification Commands → Definition of Done → AITM Progress Markers. Only exactly-`##` headings are section boundaries (`###` are not); extra non-canonical `##` sections may interleave as long as the canonical ones stay strictly-increasing in order. Source of truth: `CANONICAL_SECTIONS` in `scripts/task-tracker/lib/agent-review/validators/body-sections.mjs`.

**Why:** an issue authored with the old layout (deep-dive collapsed at bottom, no Plan Metadata) FAILS the Review gate with `section 'Acceptance Criteria' appears before 'Deep Dive'` and `section 'Plan Metadata' is missing`, and cannot reach approve/close until restructured. Hit live on #804 (2026-07-21).

**How to apply:** write the deep-dive as a plain `## Deep-Dive Analysis (YYYY-MM-DD)` section (use `###` subsections inside — a nested `##` zeroes the plan→develop char-count gate, see [[reference_deep_dive_heading_trap]]) positioned right after the Pickup Directive block and right before `## Acceptance Criteria`. Do NOT wrap it in `<details>`. Every issue also needs a `## Plan Metadata` section (Size/Estimate/Priority/Sequence bullets) at canonical position after Scope. If an in-flight issue was authored old-style, restructure in place via `mutateIssueBody` (Review permits WRITE_ISSUE/WRITE_DOCS) then re-run `/task review`. Legacy single-checkbox Lifecycle DoD must also migrate to the 4-item canonical block (Agent Review Passed + Final Review Passed + Story closed + Timing flushed) or the pass-evidence stamp no-ops and approve is permanently blocked — see [[reference_agent_review_gate_legacy_close]].
