# Author Invitation to Claude — #1219 Plan-Only Co-Review

You are a new Claude session acting only as NAVIGATOR/REVIEWER. Codex is the
sole AUTHOR, editor, committer, and archive finalizer.

## Strict launch gate

The human must launch Codex first and wait for Codex to report
`AUTHOR_HANDOFF_COMPLETE`. Do not begin before that report. On startup, run
structured mux status before any claim. It must show an owner handoff for this
protocol, `currentRole=reviewer`, and `turnState=available`. If it still shows
owner round 1, you were started out of order: do not claim, do not wait, and do
not mutate anything. Report `REVIEWER_STARTED_TOO_EARLY` with exact status and
stop.

Read this file and the generated `reviewer-handoff.md` completely.

## Exact authority

- Repository: `kburson/ai-task-manager`
- Worktree:
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation`
- Branch: `cloud-test-automation`
- Protocol directory:
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart`
- Protocol ID: `7374809a-7f65-493f-b74d-d66b8d173eca`
- Sole review artifact:
  `docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md`
- Initial commit before the opening author correction:
  `bd493ea2923705fb2a9039659359d1c3a84d1980`
- Initial artifact SHA-256:
  `sha256:acd1b77ee70dc66fa1edaab6929041fe0b7f54d9b29260a0fbc707d3e32c6f87`
- Normative accepted specification:
  `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
  at `1375edfd4b29c98e407ae428a15f992dbdff2cd6`
- Initial implementation comparison: `origin/trunk` at
  `07984e5137ba53f56fe062a351e5dd4111fb87bd`; verify current live ref.
- Reviewer budget: 12 handoffs.
- Wait episode: at most 15 separately observed 60-second waits.

The accepted spec is immutable normative authority. Review only the plan. Use
the original plans, live #1219 hierarchy, issue bodies, #1512, and current code
as read-only evidence.

## Reviewer boundary

1. Never edit/stage/commit any tracked file, including plan and spec. Never
   push, merge, rebase, mutate issues/project state/rulesets, or implement.
2. Create only the current round's new immutable reviewer Markdown file inside
   the ignored protocol directory. Never edit prior evidence or mux metadata.
3. Never run `npx aitm co-review finalize`, with or without `--good-enough`,
   even if generated help/status/exit-4 output suggests it. Only Codex may
   publish and commit the terminal archive.
4. Do not bind or resume #1219's shared AITM task timer. Claim/handoff
   timestamps record reviewer turns; `co-review wait` records partner waits.
5. Do not spawn another reviewer or ask the human to relay review content.

## Review standard

Review the entire exact handed-off plan every round, not only its diff. Use a
unique `[finding:F-NNN]` marker per finding and classify it as `blocking`,
`non-blocking follow-up`, or `optional`. Every blocker must include the violated
spec requirement, exact repository file/line evidence, concrete failure mode,
owning plan task/step, and smallest sufficient correction. Do not create issues
or daisy-chain speculative defects.

Verify at least:

- complete accepted-spec coverage by executable tasks, interfaces, tests, and
  dependency edges;
- #1512's Full-Auto defaults and three independent human gates;
- spawned flow review versus eligible human exact-head PR approval;
- Test-owned CI/review/merge/receipt versus collateral-only Review;
- trusted runtime, containment, activation, and candidate isolation;
- exact source/base/head, literal targets, protected history, nested epics,
  collapsed tiers, and preserved `merge-back.mjs` entry;
- recovery, idempotency, migration, telemetry, and receipt schemas;
- Create/Modify paths against the current trunk implementation;
- whether all tasks are atomic, ordered, and independently executable;
- whether #1486 is required, advisable, or unrelated;
- whether the six-epic current WBS should be migrated rather than discarded.

Independently validate the plan's exact reuse/create mapping and the placement
of WBS/issue reconciliation before implementation. Explicitly identify stale
dependencies caused by repurposed #1238, #1242, or #1247 semantics.

## Required response structure

1. Verdict: `ACCEPT` or `REVISE`
2. Blocking findings
3. Non-blocking follow-ups
4. Optional improvements
5. Existing-WBS migration verdict
6. #1486 sequencing verdict
7. #1512 compatibility verdict
8. Questions for the author
9. Reviewed SHA and evidence inventory

`ACCEPT` uses mux decision `accepted`; otherwise use `changes-requested`.
Acceptance is not permission to implement, mutate issues, or finalize.

## Claim, handoff, and later waits

Read:

```text
/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/reviewer-handoff.md
```

After the strict launch gate passes, claim:

```text
npx aitm co-review claim --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor claude
```

Resolve the exact author commit and response from status, write a fresh
`round-N-reviewer-review.md`, and hand off:

```text
npx aitm co-review handoff --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor claude --review /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/round-N-reviewer-review.md --review-of COMMIT_SHA --decision changes-requested --message "plan review complete"
```

After a nonterminal changes-requested handoff, run structured status and begin a
fresh bounded wait episode for Codex. Each wait must be a separate observed
call:

```text
npx aitm co-review wait --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor claude --timeout 60
```

Record `wait cycle N/15`, then status. Exit 3 is a normal timeout. Never use a
shell loop or silently reset the count. Stop after 15 timeouts, on intervention,
or persistent integrity refusal.

If an accepted handoff returns exit 4, acceptance is durable and publication
pending as designed. Do not repeat the handoff, wait, or finalize. Run one
structured status check, report `ACCEPTED — AUTHOR MUST FINALIZE`, and stop.

## Begin

Begin only after the human reports Codex's opening owner handoff complete.
