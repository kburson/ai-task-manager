<!--
EPIC issue body template.

Canonical heading order (the parity test enforces this):
  ## Scope
  ## Acceptance Criteria          (must use `- [ ]` checkboxes)
  ## Plan Metadata
  ## Sub-Issues                   (list inserted after sub-issue loop)
  ### Definition of Done          (appended by preflight tail)
  ## Pickup Directive             (appended by preflight tail)
  <!-- aitm-fields: ... -->       (appended by project-tether)

Placeholders (substituted by preflight-issue.mjs --shape epic):
  {{title}}              Epic title (verbatim, no "EPIC:" prefix)
  {{scope}}              Epic Scope text from the spec (verbatim)
  {{acceptance_criteria}} AC checkboxes, one per line, `- [ ] <text>`
  {{plan_metadata}}      Plan Metadata block (Size, Estimate, Priority, Sequence)
  {{sub_issue_list}}     Optional — sub-issue summary table; pass empty to omit

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

{{sub_issue_list}}
