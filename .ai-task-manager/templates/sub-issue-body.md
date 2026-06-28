<!--
SUB-ISSUE body template (child of an epic).

Canonical heading order (the parity test enforces this):
  ## User Story
  ## Scope
  ## Plan Metadata                (must include `**Parent epic:** #<EPIC_N>`)
  ## Acceptance Criteria          (must use `- [ ]` checkboxes)
  ## Definition of Done           (2-hash; appended by preflight tail, #480)
  ## Pickup Directive             (appended by preflight tail)
  <!-- aitm-fields: ... -->       (appended by project-tether)

Placeholders (substituted by preflight-issue.mjs --shape sub-issue):
{{title}} Sub-issue title (verbatim)
{{scope}} Sub-issue Scope text from the spec (verbatim)
{{acceptance_criteria}} AC checkboxes, one per line, `- [ ] <text>`
{{plan_metadata}} Plan Metadata block (Size, Estimate, Priority, Sequence, Parent)
{{parent_epic}} Parent epic reference, e.g. `#42` — required for sub-issues

Stub policy — DO NOT include implementation plan, task breakdown, code snippets,
file maps, or step-by-step instructions. The deep-dive happens at pickup time
against the current state of the repo, not at creation time. See SKILL.md:355.
-->

## User Story

As a [who wants to accomplish something]
I want to [what they want to accomplish]
So that [why they want to accomplish that thing]

## Scope

{{scope}}

## Plan Metadata

{{plan_metadata}}

**Parent epic:** {{parent_epic}}

## Acceptance Criteria

{{acceptance_criteria}}
