# #1901 review-comment consolidation

The user requested one issue-comment block for each artifact and review type instead of separate per-round reviewer, author, and manifest comments. The reference to #1902 was treated as a typo because the quoted comment and active work both concern #1901; #1902 is untouched.

## Consolidated issue blocks

| Block | Retained comment | Reviewed artifact revision |
| --- | --- | --- |
| Design Specification Review: SAR | [6068898651](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6068898651) | 80c7482fc8b1dcfeec331dd13af3493d28b0fa77 |
| Design Specification Review: XPR | [6069202280](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069202280) | bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8 |
| Implementation Plan Review: SPR | [6072894128](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6072894128) | b20d1255fde08ab16b9ed7ddb8b76dbeef9b0355 |
| Implementation Plan Review: XPR | [6073603720](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073603720) | e8a34e7b1fbb39cafddae7a4189d819f005ba4b9 |

Each block includes File Under Review with an immutable origin link, reviewer/author identity and effort, outcome, available joint elapsed timing, and a table linking every round's reviewer notes and author disposition. Astra SAR, Astra plan SPR, and the two Claude XPRs retain their distinct reviewed revisions; no earlier acceptance is attributed to later artifact bytes.

## Redundant comments selected for removal

All original full comment bodies were preserved and published at 9a0156bf2d19cfd764775c5ccfabd971b3c57cb7 before removal. Canonical sealed responses, author dispositions, manifests, specifications, plans, and process records remain tracked. Removing redundant issue comments does not remove review evidence.

| Comment ID | Ownership key | Consolidated record |
| --- | --- | --- |
| 6068074337 | design.spec-review | [6069202280](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069202280) |
| 6069268844 | design.xpr-reviewer-round-1 | [6069202280](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069202280) |
| 6069270729 | design.xpr-author-round-1 | [6069202280](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069202280) |
| 6069884526 | design.xpr-reviewer-round-2 | [6069202280](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069202280) |
| 6069887888 | design.xpr-author-round-2 | [6069202280](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069202280) |
| 6069889519 | design.xpr-reviewer-round-3 | [6069202280](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069202280) |
| 6069891027 | design.xpr-manifest | [6069202280](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069202280) |
| 6073604670 | plan.xpr-claude-reviewer-round-1 | [6073603720](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073603720) |
| 6073605664 | plan.xpr-claude-reviewer-round-2 | [6073603720](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073603720) |
| 6073606624 | plan.xpr-claude-reviewer-round-3 | [6073603720](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073603720) |
| 6073607605 | plan.xpr-claude-reviewer-round-4 | [6073603720](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073603720) |
| 6073613115 | plan.xpr-claude-author-round-1 | [6073603720](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073603720) |
| 6073614164 | plan.xpr-claude-author-round-2 | [6073603720](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073603720) |
| 6073615122 | plan.xpr-claude-author-round-3 | [6073603720](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073603720) |
| 6073616358 | plan.xpr-claude-manifest | [6073603720](https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073603720) |

Historical original texts:

- [Specification acceptance summaries](2026-10-09-issue-archive-spec-records.md).
- [Specification XPR responses and manifest](2026-10-09-issue-archive-spec-responses.md).
- [Plan XPR responses and manifest](2026-10-09-issue-archive-plan-responses.md).

## Boundary and verification

The retained blocks are updated through their original AITM owned-comment keys. AITM's comment command has no deletion operation, so the user's explicit consolidation instruction authorizes narrowly scoped GitHub API deletion of the 15 exact redundant IDs above, after checking their issue association and ownership. Protected timing, commit-trace, state-transition provenance, refinement, deep-dive body evidence, and user-authored content are not deletion targets.

Verify by exhaustively enumerating issue comments: each of the four retained ownership keys appears exactly once, the 15 selected IDs are absent, and there are no per-round or manifest review-comment ownership keys. The issue body, accepted artifacts, and sealed responses remain unchanged. Documentation and this removal mapping are committed and pushed separately from the reviewed artifacts.
