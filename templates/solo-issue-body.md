<!--
SOLO issue body template (standalone work item, no epic parent).

Canonical heading order (the parity test enforces this):
  ## User Story
  ## Scope
  ## Acceptance Criteria          (must use `- [ ]` checkboxes)
  ## Plan Metadata
  ### Definition of Done          (appended by preflight tail)
  ## Pickup Directive             (appended by preflight tail)
  <!-- aitm-fields: ... -->       (appended by project-tether)

Placeholders (substituted by preflight-issue.mjs --shape solo):
{{title}} Issue title (verbatim)
{{scope}} Scope text from the spec (verbatim)
{{acceptance_criteria}} AC checkboxes, one per line, `- [ ] <text>`
{{plan_metadata}} Plan Metadata block (Size, Estimate, Priority, Sequence)

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

## Acceptance Criteria

{{acceptance_criteria}}

## Plan Metadata

{{plan_metadata}}
