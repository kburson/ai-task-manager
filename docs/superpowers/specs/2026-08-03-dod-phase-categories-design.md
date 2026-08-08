# Definition of Done Phase Categories Design

**Issue:** #982
**Status:** Approved under explicit Full-Auto authority
**Date:** 2026-08-03

## Problem

AITM's canonical Definition of Done currently separates Functional items from a
single `Lifecycle (auto-ticked at Review/Close)` subsection. That second
subsection mixes two different owners:

- Review owns `Agent Review Passed` and `Final Review Passed`.
- Close owns `Story closed and moved to Done` and `Timing data flushed to issue`.

The mixed heading makes phase ownership less obvious to authors, operators, and
reviewers. It also makes documentation describe Review and Close as one phase
even though AITM enforces them separately.

## Goals

1. New issue bodies expose three explicit DoD categories:
   `Functional (verified at Test)`, `Lifecycle (verified at Review)`, and
   `Housekeeping (verified at Close)`.
2. Review-owned and Close-owned labels retain their existing keys, spelling,
   automatic tick behavior, and close-gate semantics.
3. Existing bodies with the combined
   `Lifecycle (auto-ticked at Review/Close)` heading remain fully supported.
4. Packaged and dogfood templates stay byte-for-byte aligned.
5. Architecture and workflow documentation name the responsible phase for each
   canonical item.

## Non-Goals

- Renaming lifecycle keys or visible checkbox labels.
- Changing which verb ticks an item.
- Rewriting the historical issue corpus.
- Introducing a new persisted schema or marker format.
- Reclassifying Functional evidence or verification commands.

## Considered Approaches

### 1. Heading-only template change

Split the template but leave the parser bound to the old combined heading.
This is the smallest textual change, but new bodies would fail automatic ticks
and close checks. Rejected because presentation and enforcement would diverge.

### 2. Add per-item phase annotations

Keep one heading and attach markers such as `dod:phase="review"`. This would be
machine-readable, but it adds a new schema without improving the visible layout
requested by #982. Rejected as unnecessary complexity.

### 3. Split headings with compatibility-aware parsing

Render two owned subsections and teach the existing lifecycle helper to find the
appropriate new section, falling back to the legacy combined section. This
keeps keys and callers stable while making ownership visible. Adopted.

## Canonical Structure

New templates render this order inside `## Definition of Done`:

```markdown
### Functional (verified at Test)

<existing Functional items>

### Lifecycle (verified at Review)

- [ ] Agent Review Passed
- [ ] Final Review Passed

### Housekeeping (verified at Close)

- [ ] Story closed and moved to Done
- [ ] Timing data flushed to issue
```

The category headings are exact canonical strings. The four checkbox labels and
their existing lifecycle keys do not change.

## Parser and Mutation Design

`scripts/task-tracker/lib/lifecycle-dod.mjs` remains the public compatibility
module. It gains exact locators for the new Lifecycle and Housekeeping headings
and retains an exact locator for the legacy combined heading.

Item ownership is fixed by key:

| Key                   | Canonical section | Owner              |
| --------------------- | ----------------- | ------------------ |
| `agent-review-passed` | Lifecycle         | Agent Review       |
| `passed-final-review` | Lifecycle         | Review approval    |
| `story-closed`        | Housekeeping      | Close              |
| `timing-flushed`      | Housekeeping      | Close timing flush |

`parseLifecycleItems` continues returning all four owned items in document
order. For new bodies it aggregates the Lifecycle and Housekeeping sections.
For legacy bodies it parses the combined section once. It never merges both
forms in one body: canonical sections take precedence so a partially migrated
or malformed duplicate cannot double-count a key.

`tickLifecycleItem`, `untickLifecycleItem`, `lifecycleItemState`, and
`detectLifecyclePretick` route each key to its canonical section and fall back
to the combined legacy section. Their signatures and return contracts remain
unchanged, preserving all Review and Close callers.

## Compatibility and Failure Behavior

- A body with only the legacy combined heading behaves exactly as it does now.
- A new body with both canonical headings exposes all four items to satisfaction
  and pre-tick scans.
- A missing canonical section produces the existing `labelFound: false` /
  `absent` behavior; the change does not invent evidence or silently tick text
  outside an owned section.
- Descriptive headings such as `Lifecycle and operational boundaries` or
  `Housekeeping notes` are never treated as owned DoD sections.
- Existing per-key opt-outs and Full-Auto approval evidence continue to satisfy
  the same keys.

## Template and Documentation Changes

Both `templates/definition-of-done.md` and
`.ai-task-manager/templates/definition-of-done.md` adopt the three-category
layout and explain that Lifecycle is Review-owned while Housekeeping is
Close-owned. `docs/architecture/lifecycle-dod.md` documents the new headings,
key mapping, legacy fallback, and tick contract. Workflow documentation that
names the combined heading is updated to the new ownership vocabulary.

## Verification

Focused tests must prove:

1. New canonical bodies parse all four keys in order.
2. Each key ticks only inside its owned canonical section.
3. Pre-tick detection scans both canonical sections.
4. Legacy combined bodies still parse, tick, un-tick, and satisfy close gates.
5. Lookalike descriptive headings do not shadow either canonical section.
6. Packaged and dogfood templates remain identical and render the three exact
   headings in order.
7. Review approval and Close integration fixtures work with the new layout.

The sanctioned final gate is `TT_FULL_AUTO=1 npx aitm test 982`, followed by
AITM Agent Review and the normal Review-to-Done close path.
