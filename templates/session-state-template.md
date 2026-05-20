<!-- aitm-doc: session-state-template v1 -->

# Session State Template

Canonical 9-field working-state artifact for a single task. Copy this
template to `.ai-task-manager/claude/session-tracking/<issue>-state.md`
(gitignored) and keep it current as the task progresses. After `Compact`
or `Clear`, re-read this file to recover the structured working set the
compacted narrative cannot preserve.

Compacted summaries lose structure first: which decisions are settled,
which files are touched, what is verified. This template is the durable
shape that survives.

---

## Goal

One sentence. The outcome that closes this task — not the method.

## Non-Negotiable Rules

Verbatim, copy-pasted from `.ai-task-manager/pickup-directive.md` Hard
Rules and any task-specific constraints from the issue body. Do not
paraphrase. Re-paste on every state transition.

## Active Files

Paths currently in scope, one per line with a one-line role. Includes
files you are editing, files you must not break, and files whose contents
you depend on.

## Decisions

Date-stamped, with rationale. One bullet per decision. When a decision
is revisited, leave the original entry and add a follow-up entry rather
than rewriting history.

## Plan

Ordered, numbered steps from the deep-dive. The same list that will
appear under "Step-by-step implementation plan" in the issue body.

## Completed

Checked items from the plan. Move items here only after their
verification command has actually run and passed.

## Remaining

Open items from the plan plus any new discoveries that arose during
implementation. New discoveries get a one-line note on origin
("found while editing X").

## Verification

Each command that must pass before the task is Done, paired with its
current status (`pending`, `running`, `pass`, `fail`). Includes
acceptance-criteria verification commands from the issue body, plus
`npm test`, `npm run lint`, `npm run format:check`, and any task-
specific checks.

## Risks

Open hazards plus mitigations. One bullet per risk. Resolved risks
move to a struck-through line rather than being deleted.
