<!--
STUB issue body template (lightweight idea capture, no epic parent).

A stub is the fast idea-capture shape: only a title (and an optional free-text
idea seed via --idea-file) are supplied at creation. The Scope / Acceptance
Criteria / Plan Metadata sections are placeholders the Refine stage fills.
The Refine→Ready for Planning gate still enforces substantive ACs, Plan Metadata, Size,
Estimate, Sequence, and labels later — so a stub cannot advance past Refine
until it is fleshed out. Use `--shape solo` instead when you already have the
full scope/AC/plan worked out at creation time.

Canonical heading order (the parity test enforces this):
  ## Scope
  ## Story Origin
  ## Plan Metadata
  ## Pickup Directive             (static; sits under Plan Metadata, #700)
  ## Acceptance Criteria          (must use `- [ ]` checkboxes)
  ## Definition of Done           (2-hash; appended by preflight tail, #480)
  <!-- aitm-fields: ... -->       (appended by project-tether)

Placeholders (substituted by preflight-issue.mjs --shape stub):
{{scope}} Idea seed (from --idea-file) or a TBD placeholder
{{acceptance_criteria}} Placeholder checkbox — filled at Refine
{{story_origin}} Minimal create-time provenance
{{plan_metadata}} Empty until planning

Stub policy — DO NOT include an implementation plan, task breakdown, code
snippets, or step-by-step instructions. The deep-dive happens at pickup time
against the current state of the repo, not at creation time.
-->

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
