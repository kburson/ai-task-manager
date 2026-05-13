<!--
SUB-ISSUE body template (child of an epic).

Canonical heading order (the parity test enforces this):
  ## Scope
  ## Acceptance Criteria          (must use `- [ ]` checkboxes)
  ## Plan Metadata                (must include `**Parent epic:** #<EPIC_N>`)
  ### Definition of Done          (appended by preflight tail)
  ## Pickup Directive             (appended by preflight tail)
  <!-- aitm-fields: ... -->       (appended by project-tether)

Placeholders (substituted by preflight-issue.mjs --shape sub-issue):
  {{title}}              Sub-issue title (verbatim)
  {{scope}}              Sub-issue Scope text from the spec (verbatim)
  {{acceptance_criteria}} AC checkboxes, one per line, `- [ ] <text>`
  {{plan_metadata}}      Plan Metadata block (Size, Estimate, Priority, Sequence, Parent)
  {{parent_epic}}        Parent epic reference, e.g. `#42` — required for sub-issues

Stub policy — DO NOT include implementation plan, task breakdown, code snippets,
file maps, or step-by-step instructions. The deep-dive happens at pickup time
against the current state of the repo, not at creation time. See SKILL.md:355.
-->

## Scope

{{scope}}

## Acceptance Criteria

{{acceptance_criteria}}

## Plan Metadata

{{plan_metadata}}

**Parent epic:** {{parent_epic}}
