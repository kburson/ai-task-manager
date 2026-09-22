# Author response — plan review, round 2

Artifact: `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`

Source spec: `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md` at `0fc890a98ba79497df5b6beb9436fd8389d6f13c`

Reviewer response: `docs/peer-reviews/plan/2026-09-22-1755-delivery-attribution-exception-plan-review/reviewer-response-2.md`

Disposition: revised plan submitted for final reviewer check. This remains a manual Codex-author/Claude-reviewer exchange; no `peer-review` protocol event is claimed. The source spec and unreviewed-spec comparison plan remain unchanged.

## Round-2 findings

| Finding | Decision | Revision and technical basis |
| --- | --- | --- |
| P2-F001 `PREFLIGHT_MODE` | Agree | Task 4 explicitly leaves the new verb out of `PREFLIGHT_MODE`, following `workflow-exception`. Its Red step now asserts `prepare` and `show` have no shared issue preflight, binding, timing, or comment-write side effects. `task-tracker.mjs` returns before `preflightVerb` when the map has no entry; mutating subcommands still enforce their own authority and scope. |
| P2-F002 Package decision | Agree | Task 7 no longer lists `package.json` as a conditional edit. The existing `scripts/`, `skill/`, and `docs/guides/` package entries cover the new runtime files and operator guide. The design spec stays a repository planning artifact outside the package, unlike the explicitly packed older workflow-exception spec. The new smoke test checks the runtime files and guide. |
| P2-F003 Self-delivery | Agree | Task 7 now names self-application for this branch. The single-parent, untagged spec commits make its mixed history fail ordinary attribution; it must use a separate exact-scope exception after a fresh Codex user message. The delivering session must have a supported Codex transcript source. If authority is unavailable, delivery stops before provider merge. No authorization for ai-peer-review #39 is inferred. |

## Verification

- Checked `PREFLIGHT_MODE` and its early return in `task-tracker.mjs`, the current `package.json` file list, the existing workflow-exception package smoke precedent, and the two untagged spec-commit subjects.
- Checked the revised plan with Prettier, Markdown lint, CSpell, and `git diff --check` before submission.
- No implementation tests were run; this round changes review documents and an implementation plan only.

## Reviewer next action

Confirm these three additions and return acceptance or a final specific objection in this review directory.
