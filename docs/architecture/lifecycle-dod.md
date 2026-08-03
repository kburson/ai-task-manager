<!-- cspell:ignore optout optouts Optouts -->

# Lifecycle DoD

Canonical issue bodies separate verb-owned Definition-of-Done side effects into
two exact subsections:

- `### Lifecycle (verified at Review)` contains Review-owned evidence.
- `### Housekeeping (verified at Close)` contains Close-owned finalization.

These checkboxes are **side effects of verb execution**, not user-verified work.
Functional DoD items are verified at Test; Lifecycle and Housekeeping items are
ticked only by the verb whose run produced the side effect.

## Canonical labels

Defined by `LIFECYCLE_LABELS` in `scripts/task-tracker/lib/lifecycle-dod.mjs`:

| Key                   | Category     | Label                            | Ticked by                                |
| --------------------- | ------------ | -------------------------------- | ---------------------------------------- |
| `agent-review-passed` | Lifecycle    | `Agent Review Passed`            | Agent Review gate                        |
| `passed-final-review` | Lifecycle    | `Final Review Passed`            | `verbs/approve.mjs` (human or Full-Auto) |
| `story-closed`        | Housekeeping | `Story closed and moved to Done` | `verbs/close.mjs`                        |
| `timing-flushed`      | Housekeeping | `Timing data flushed to issue`   | close timing flush                       |

The historical `Passed final human review` label remains an accepted alias for
`passed-final-review`; it is not emitted by canonical templates.

## Compatibility and section precedence

Existing bodies with
`### Lifecycle (auto-ticked at Review/Close)` remain readable and mutable. The
combined section is a legacy fallback, not canonical output. When a body carries
either new canonical section, canonical sections take precedence and the parser
does not merge items from a duplicate legacy section. Reads aggregate Lifecycle
and Housekeeping in document order; mutations route each key to its owning
canonical section.

## The tick contract

`tickLifecycleItem(body, key)` is idempotent and returns the body unchanged
when the box is already `[x]`. It **also** returns the body unchanged when:

- the key's owning canonical section (or legacy combined section) is absent, or
- the heading exists but the label is missing (customized DoD).

These three cases are structurally distinct but produce the same return value.
Callers that need to distinguish them must consult `lifecycleItemState({ body,
key })` — a pure inspection helper returning
`{ sectionPresent, labelFound, alreadyTicked }`.

## The lifecycle-tick-noop warning

`verbs/approve.mjs` emits a `lifecycle-tick-noop` warning to stderr and posts a
`lifecycle-warn` timing row when it detects that its lifecycle tick had no
effect AND the operator has not stamped a per-key opt-out marker.

**The warning fires only when the label is genuinely not findable**
(`labelFound === false`). The "box already ticked" case (`alreadyTicked ===
true`) is silent — that is the legitimate Full-Auto happy path under which the
operator (or another verb run) flipped the box before approve reached it.

Pre-#302, the warning fired on every Full-Auto approval that respected the
manual-tick rule (see Reconciliation below), polluting the audit trail with
false positives. The fix replaced the
`updated === beforeTick` equality check with an explicit `!state.labelFound`
test backed by `lifecycleItemState`.

## Opt-out marker

A user with a customized DoD that intentionally drops a verb-owned checkbox can
stamp `<!-- aitm-lifecycle-optout: <key> -->` in the body to acknowledge the
gate skip. `parseLifecycleOptouts(body)` returns the set of opted-out keys;
`approve.mjs` suppresses the warning when the relevant key is opted out.

## Reconciliation — manual tick under Full-Auto

A previous memory rule
(`feedback_full_auto_tick_review_box.md`) required operators to manually flip
`- [ ] Final Review Passed` to `- [x]` before running `/task close` under
Full-Auto. That rule predates `approve.mjs:231`, which already calls
`tickLifecycleItem(updated, 'passed-final-review')` inside its authoritative
body-write closure.

**Decision (Option A — adopted #302):** the manual tick is redundant.
`/task approve` flips the box itself, and the `lifecycle-tick-noop` warning
now stays silent when it finds the box pre-ticked. The memory rule is marked
superseded. Operators may still pre-tick — approve will detect, no-op silently,
and the audit trail stays clean.

The audit-comment requirement (`feedback_full_auto_review_audit.md`) is
unchanged: when Full-Auto bypasses human review, post an audit comment
documenting it. That comment + the `aitm-full-auto-approved` body marker + the
footnote between `<!-- aitm-full-auto-footnote:start/end -->` remain the
authoritative trail.
