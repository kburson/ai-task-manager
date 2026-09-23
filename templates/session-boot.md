<!-- aitm-doc: session-boot v1 -->

# Session Boot Index

Use after Compact, Clear, Restart, fresh worker start, or a changed installed guidance sentinel. A compacted summary is not authoritative and not a substitute for the source-of-truth files. A disk ledger does not restore instruction authority.

## Tier 1 — Required on bind

Read these current files in order and verify their identity:

1. `skill/shared/router.md` — permanent boundary and command routes.
2. `.ai-task-manager/templates/pickup-directive.md` — issue pickup contract.
3. `.ai-task-manager/task-tracker.json` — project preferences.
4. `gh issue view <N>` — current issue body, ACs, DoD, and worktree marker.

The selected provider adapter remains the platform bridge. Tier-2 `skill/shared/rules/<verb>.md` is JIT human guidance, not an automatically restored context pack.

## Recovery protocol (post-Compact / post-Clear)

1. Discard prior `aitm-skill-loaded:*`, `aitm-boot-recovered:*`, and guidance receipt digests after Compact, Clear, fresh worker start, Restart, or changed source sentinel. A prior digest match in a summary is not a live receipt.
2. Reload the current adapter, router, pickup directive, preferences, and issue body. Verify the current issue, worktree, branch, and command argument agree.
3. Emit fresh load sentinels and one `aitm-boot-recovered:<session-id>:<timestamp>` sentinel for the current context.
4. Ask `npx aitm explain #N --json` at the next lifecycle decision; use its current digest and typed result. Mutations revalidate live authority. Ordinary reads, edits, tests, and Git commands need no mandatory query.

If a required file, identity, or live result is unavailable, stop the lifecycle action and report the precise refusal. Never fill the gap with a paraphrase.
