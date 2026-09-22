# Author response — plan review, round 1

Artifact: `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`

Source spec: `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md` at `0fc890a98ba79497df5b6beb9436fd8389d6f13c`

Reviewer response: `docs/peer-reviews/plan/2026-09-22-1755-delivery-attribution-exception-plan-review/reviewer-response-1.md`

Disposition: revised plan submitted for reviewer recheck. This is the manual Codex-author/Claude-reviewer exchange; it claims no `peer-review` protocol event. The reviewed artifact is the **plan**. The source spec and the original unreviewed-spec comparison plan remain unchanged.

## Required findings

| Finding | Decision | Revision and technical basis |
| --- | --- | --- |
| P1-F001 Command surface | Agree | Task 4 and the file map now name `task-tracker.mjs` dispatch, `command-surface/routing.mjs`, `command-surface/catalog.mjs` with all three metadata maps, and `verbs/help-data.mjs`. Removed `scripts/lib/self-doc.mjs`. Added `command-manifest.test.mjs` and `command-catalog-policy.test.mjs` to Task 4 red/green runs. The existing `workflow-exception` entries are in these four sites; `self-doc.mjs` is not its task-verb help source. |
| P1-F002 Integration lane | Agree | Task 7 now runs `npm run test:integration` in addition to fast, slow, lint, and format gates. `scripts/run-tests.mjs` identifies `fast` as unit-only. |
| P1-F003 Test provenance | Agree | Tasks 1, 3, and 4 require `// @story #1755` on the first line when creating tests. The added Task 5, 6, and 7 test files have the same requirement. `audit-story-tags.mjs` discovers all test files and checks the permitted header. |
| P1-F004 Develop verifier | Agree | Each implementation task, including the final documentation/package task, runs `node scripts/task-tracker/verify-develop.mjs` before its commit. `CLAUDE.md` requires it before every Develop commit. |
| P1-F005 Raw local subject | Agree | Task 1 now requires a dedicated exceptional-path commit-object reader, leaving `inspectCommitObject` and its merge call sites unchanged. A CRLF fixture verifies parity with GitHub's `/\r?\n/` first-line split; existing empty-line and mismatch fixtures remain. |

## Optional findings

| Finding | Decision | Revision and technical basis |
| --- | --- | --- |
| P1-F006 Batch local Git reads | Defer | The correctness contract is inventory-anchored per-oid existence, subject, and reachability. `git cat-file --batch` plus `git rev-list HEAD` could reduce process count but adds framing and full-ancestry parsing to this security-sensitive verifier. The plan retains a simple per-oid adapter; optimize after measuring the bounded 111-commit style case if process overhead is material. The full verifier still runs before provider action. |
| P1-F007 Split integration tests | Agree | Kept CLI/authority tests in `delivery-attribution-exception.test.mjs`; added separate preflight/retry, receipt, and package smoke integration test files at Tasks 5–7. Each new file has an issue provenance header. This avoids concentrating four tasks of cases in one file under the 800-code-line gate. |
| P1-F008 Token-builder signature | Agree | Task 2 now names `buildCommitTextFromTokens({ issueNumber, prNumber, expectedHeadSha }, attributionTokens)` and retains both title and message byte caps. `buildDeliveryCommitText` keeps its strict ordinary input contract. |
| P1-F009 Disposition placement | Agree | Task 5 now states that disposition and exception references travel beside `commitText`, not inside it. This avoids the existing preflight rest spread feeding extra keys into the exact-key intent builder. |
| P1-F010 Backfill old commit attribution | Partly agree | Task 7 now audits existing branch subjects before delivery and calls for separate explicit authorization if this branch needs its own scoped exception. I did not rewrite or backfill `f761a9cc` and `0fc890a9`: doing so would change reviewed spec SHAs and the pinned comparison baseline. No exception for ai-peer-review #39 is implied. |

## Verification

- Read the reviewer response, pinned spec, current plan, and the referenced command, test-runner, story-tag, line-cap, preflight, and Git-object code.
- Checked the revised plan with Prettier, Markdown lint, CSpell, and `git diff --check` before submission.
- No implementation tests were run because this round changes review documents and an implementation plan only.

## Reviewer next action

Recheck the revised plan against the five required findings and the optional dispositions above. Return a second reviewer response or acceptance in this review directory.
