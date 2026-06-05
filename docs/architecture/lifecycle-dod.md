<!-- cspell:ignore optout optouts Optouts -->

# Lifecycle DoD

The `#### Lifecycle (auto-ticked at Review/Close)` subsection of the issue body
contains checkboxes that are **side effects of verb execution**, not
user-verified work. Functional DoD items get verified at Test; Lifecycle items
get auto-ticked by the verb whose run produced the side effect.

## Canonical labels

Defined by `LIFECYCLE_LABELS` in `scripts/task-tracker/lib/lifecycle-dod.mjs`:

| Key                   | Label                            | Ticked by                                |
| --------------------- | -------------------------------- | ---------------------------------------- |
| `passed-final-review` | `Passed final human review`      | `verbs/approve.mjs` (human or Full-Auto) |
| `story-closed`        | `Story closed and moved to Done` | `verbs/close.mjs`                        |
| `timing-flushed`      | `Timing data flushed to issue`   | timing-comment flush at close            |

## The tick contract

`tickLifecycleItem(body, key)` is idempotent and returns the body unchanged
when the box is already `[x]`. It **also** returns the body unchanged when:

- the `#### Lifecycle` heading is absent (legacy DoD), or
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

A user with a customized DoD that intentionally drops a Lifecycle checkbox can
stamp `<!-- aitm-lifecycle-optout: <key> -->` in the body to acknowledge the
gate skip. `parseLifecycleOptouts(body)` returns the set of opted-out keys;
`approve.mjs` suppresses the warning when the relevant key is opted out.

## Reconciliation — manual tick under Full-Auto

A previous memory rule
(`feedback_full_auto_tick_review_box.md`) required operators to manually flip
`- [ ] Passed final human review` to `- [x]` before running `/task close` under
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
