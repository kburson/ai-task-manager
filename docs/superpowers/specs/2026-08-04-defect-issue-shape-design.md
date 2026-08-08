# Defect Issue Shape Design

## Problem

AITM's sanctioned creator has no defect shape. Operators must use `solo`, remember a `bug` label, repair the generic User Story, and hand-author diagnostic sections. The label workflow then downgrades the canonical `🐞 [BUG]` prefix to a bare ladybug. GitHub's bug form captures useful data but emits a non-canonical body that cannot traverse the normal lifecycle unchanged.

## Decision

Add `defect` as a fifth sanctioned shape. It requires the same governed inputs as a code-bearing solo issue—Scope, Acceptance Criteria, and Story Origin—while automatically applying the `bug` label, deriving the canonical title prefix, and rendering a defect-specific body. Optional diagnostic fragments can replace safe default guidance for Reproduction, Root Cause, Fix Direction, and Out of Scope.

All local defect intake converges on this renderer:

- conversational create, generate, or file requests route to `--shape defect`;
- full-auto discoveries create the defect before applying the parent blocker protocol;
- the GitHub bug-form workflow parses the submitted fields and invokes the same preflight renderer before updating the live issue body.

`/task report` remains the upstream external-product reporting channel and never substitutes for a local defect story.

## CLI Contract

The sanctioned command is:

```bash
npx aitm create-issue --shape defect \
  --title "concise failure" \
  --scope-file ./.tmp/plan/scope.md \
  --ac-file ./.tmp/plan/acs.md \
  --story-origin-file ./.tmp/plan/story-origin.md
```

`--plan-metadata-file` and `--verification-commands-file` retain their existing optional meaning. Defect-only optional inputs are `--reproduction-file`, `--root-cause-file`, `--fix-direction-file`, and `--out-of-scope-file`. Omitting them produces specific, non-placeholder deep-dive/fix guidance; it does not produce `TBD` text.

The shape appends `bug` to the caller's label list exactly once. The existing `ensureKindPrefix` authority then produces `🐞 [BUG]`, stripping stale known prefixes first. Other shapes and explicit labels retain current behavior.

## Body Contract

`templates/defect-body.md` and its `.ai-task-manager/templates/` override contain, in order:

1. a title-derived, non-placeholder User Story;
2. Scope;
3. Reproduction;
4. Root Cause;
5. Fix Direction;
6. Out of Scope;
7. Story Origin;
8. Plan Metadata;
9. Pickup Directive;
10. Acceptance Criteria.

Preflight then supplies the existing Verification Commands, Definition of Done, issue-kind/field trailers, and body-version marker. The create wrapper supplies the Backlog entry marker and project tether exactly as it does for every shaped issue.

## Web Intake

`defect-web-intake.mjs` is a narrow adapter, not a second renderer. It recognizes only an internal `bug`-labeled issue that lacks the canonical AITM body and carries known GitHub form headings. It extracts the submitted problem, reproduction, AC, priority, size, estimate, and rank values; creates repository-local `.tmp/gh/` fragments; and invokes `preflight-issue.mjs --shape defect`.

The normalized body receives the issue's original creation timestamp as its Backlog entry marker. Already-canonical bodies, unrelated issues, and external `beta-defect` reports are fixed points. Parse or renderer failures fail closed: the workflow reports the error and leaves the body unchanged.

The existing issue workflow remains responsible for applying beta labels from durable beta markers. After that step it passes the effective labels to a canonical label-driven title reconciler. Internal `bug`, `beta-defect`, `beta-feature`, and `idea` titles therefore match `KIND_PREFIXES` rather than a separate emoji vocabulary.

## Agent Routing

The shared router, creation rule, blocking rule, adapters, generated AGENTS instructions, guard diagnostics, and workflow guide list `defect` in the shape menu. The creation rule explicitly maps natural-language defect/bug-story requests to the shape. The blocking rule makes local full-auto discovery deterministic:

1. create the governed defect through `--shape defect`;
2. capture its issue number;
3. run `npx aitm block <parent> --by <defect>`;
4. bind the defect and drive deepest-first.

The report-on-block rule explicitly distinguishes `/task report` as an upstream public-product channel.

## Error and Compatibility Policy

- Invalid shapes still exit 2; help and diagnostics include all five shapes.
- Defect requires the same base fragments as solo and preserves the current optional planning/VC fragments.
- Shape defaults never add `bug` to another shape.
- Existing four shape renderings remain unchanged apart from shared menu/help text.
- Web normalization never creates a second issue and never mutates a canonical body.
- Title reconciliation never infers a beta label from a ladybug title.
- No raw `gh issue create`, `gh issue close`, or direct arbitrary state mutation is introduced.

## Verification

The issue-specific test `scripts/task-tracker/tests/unit/lib/defect-shape.test.mjs` covers the full invariant. Existing creator, preflight, template, prefix, workflow, agent-routing, help, and legacy-shape suites protect compatibility. Final verification runs lint, formatting, unit, integration, slow, exact-SHA review, and the governed sandbox Test.
