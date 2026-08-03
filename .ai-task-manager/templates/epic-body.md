<!--
EPIC issue body template.

Canonical heading order (the parity test enforces this):
  ## User Story
  ## Scope
  ## Story Origin
  ## Plan Metadata
  ## Pickup Directive             (static; sits under Plan Metadata, #700)
  ## Acceptance Criteria          (must use `- [ ]` checkboxes)
  ## Sub-Issues                   (list inserted after sub-issue loop)
  ## Definition of Done           (2-hash; appended by preflight tail, #480)
  <!-- aitm-fields: ... -->       (appended by project-tether)

Placeholders (substituted by preflight-issue.mjs --shape epic):
{{title}} Epic title (verbatim, no "EPIC:" prefix)
{{scope}} Epic Scope text from the spec (verbatim)
{{acceptance_criteria}} AC checkboxes, one per line, `- [ ] <text>`
{{story_origin}} Story Origin block (kind, provenance, relationships, size guess)
{{plan_metadata}} Optional Plan Metadata block (Size, Estimate, Wave, Dependencies)
{{sub_issue_list}} Optional — sub-issue summary table; pass empty to omit

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

## Story Origin

{{story_origin}}

## Plan Metadata

{{plan_metadata}}

## Pickup Directive — MANDATORY, DO NOT SKIP

> Follow: `.ai-task-manager/templates/pickup-directive.md`

## Acceptance Criteria

{{acceptance_criteria}}

{{sub_issue_list}}
