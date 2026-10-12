Refs #1490

Adds a narrowly bounded, fail-closed recovery mode for a COMPLETED delivered-close transaction that survived a reopen.

## Why

Delivering #1490's own attribution repair required reopening it after it had already been delivered and closed at accepted SHA `d6a3dece`. The completed `aitm.delivered-close/v1` transaction `ad96d1e1-8c17-471e-a060-279975761e50` survived the reopen with all eight steps recorded, so `close` refuses with `close-convergence:terminal-state-conflict`: a record asserting the issue was closed contradicts an open issue.

That transaction records a true historical delivery and must not be hand-retired. #1466's `--restart-stale-transaction` deliberately does not cover this shape — it accepts at most three completed steps and requires a null disposition with a ToDo/BLOCKED label, because it restarts a close interrupted PARTWAY, not one that ran to completion.

## What

A new `scripts/task-tracker/lib/reopened-close-recovery.mjs` and an explicit new flag, `npx aitm close <N> --restart-reopened-transaction`. `--restart-stale-transaction` is untouched; the new flag is incompatible with it and with `--force`, `--repair`, `--as`, and `--answer`.

Authorization requires all of: exactly one valid transaction; completed steps exactly the ordered eight-step terminal sequence; accepted SHA differing from current authority; issue OPEN with state reason REOPENED; board Review; terminal disposition `Delivered`; clean worktree; pending binding; immutable historical delivery evidence for the old SHA; and exact current Test, review-approval, and live-verified delivery evidence for the new SHA. Any contradictory state refuses before mutation.

Note this deliberately requires disposition `Delivered` and does NOT require a managed label — the inverse of #1466's pre-terminal predicates, because a completed close legitimately removed its labels and set the disposition.

Durable supersession evidence — both transaction ids, both accepted SHAs, both delivery authorities, actor, timestamp, and reason `completed-close-reopened-corrective-delivery` — is written and read-back verified BEFORE the active marker is replaced. Ordering is the point: a crash between the two steps leaves recoverable evidence rather than an unexplained replacement. The recovery id is a fingerprint of the intent, so a retry after a lost response resolves to the same recovery instead of minting a second one. The replacement transaction carries the current accepted SHA and zero completed steps, so the normal eight-step saga runs unchanged.

Without the flag, the existing `terminal-state-conflict` refusal is the default. Generic issue-body mutation continues to protect the marker.

## Verification at `1e8901ef`

- 13 focused recovery tests: exact shape authorizes; partial, reordered, malformed, same-SHA, and every contradictory live state refuse; record contents; deterministic identity; zero-step replacement; idempotent re-replacement; foreign and ambiguous bodies refuse; tampered record refuses
- Close and supersession suites 138/138 — `--restart-stale-transaction`, ordinary close, and convergence behavior unchanged
- Fast and slow lanes green; `verify-develop`, `npm run lint`, `npm run format:check` clean

The second commit realigns four line-number-pinned timing-emitter baseline entries shifted by the close-verb wiring. Each shifted line was confirmed to still contain the same emitter expression; no emitter behavior changed.
