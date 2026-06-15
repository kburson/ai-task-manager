<!--
STUB issue body template (lightweight idea capture, no epic parent).

A stub is the fast idea-capture shape: only a title (and an optional free-text
idea seed via --idea-file) are supplied at creation. The Scope / Acceptance
Criteria / Plan Metadata sections are placeholders the Refine stage fills.
The Refine→Plan gate still enforces substantive ACs, Plan Metadata, Size,
Estimate, Sequence, and labels later — so a stub cannot advance past Refine
until it is fleshed out. Use `--shape solo` instead when you already have the
full scope/AC/plan worked out at creation time.

Canonical heading order (the parity test enforces this):
  ## Scope
  ## Acceptance Criteria          (must use `- [ ]` checkboxes)
  ## Plan Metadata
  ### Definition of Done          (appended by preflight tail)
  ## Pickup Directive             (appended by preflight tail)
  <!-- aitm-fields: ... -->       (appended by project-tether)

Placeholders (substituted by preflight-issue.mjs --shape stub):
{{scope}} Idea seed (from --idea-file) or a TBD placeholder
{{acceptance_criteria}} Placeholder checkbox — filled at Refine
{{plan_metadata}} Placeholder — filled at Refine

Stub policy — DO NOT include an implementation plan, task breakdown, code
snippets, or step-by-step instructions. The deep-dive happens at pickup time
against the current state of the repo, not at creation time.
-->

## Scope

{{scope}}

## Acceptance Criteria

{{acceptance_criteria}}

## Plan Metadata

{{plan_metadata}}
