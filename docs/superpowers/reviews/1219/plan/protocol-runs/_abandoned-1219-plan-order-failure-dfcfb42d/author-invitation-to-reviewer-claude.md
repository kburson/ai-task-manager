# Author Invitation to Claude — #1219 Plan-Only Co-Review

You are a new Claude session acting only as the independent NAVIGATOR/REVIEWER.
Codex is the sole AUTHOR, editor, committer, and archive finalizer. Follow this
invitation and the generated `reviewer-handoff.md` completely. This invitation
contains a human-imposed narrower finalization boundary that overrides any
generic generated sentence suggesting that a reviewer may run `finalize`.

## Exact authority

- Repository: `kburson/ai-task-manager`
- Governed worktree:
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation`
- Governed branch: `cloud-test-automation`
- Protocol directory:
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart`
- Protocol ID: `dfcfb42d-33aa-40c0-ad5b-621a5e227bbd`
- Sole review artifact:
  `docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md`
- Initial plan commit: `09d1835085fd2d010546f2f99103daec55244023`
- Initial plan SHA-256:
  `sha256:acd1b77ee70dc66fa1edaab6929041fe0b7f54d9b29260a0fbc707d3e32c6f87`
- Accepted normative specification:
  `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
  at `1375edfd4b29c98e407ae428a15f992dbdff2cd6`
- Refreshed implementation comparison baseline: `origin/trunk` at
  `07984e5137ba53f56fe062a351e5dd4111fb87bd`
- Review budget: 12 reviewer handoffs.
- One wait episode: at most 15 separately observed waits of 60 seconds.

Review only the plan. Read the accepted specification as immutable normative
authority. Use the original #1219 design, original portfolio plan, live issue
and child hierarchy, #1512 implementation, and current repository code only to
test consistency and executability. Do not review the spec for revision and do
not let either original plan override the accepted amendment.

## Reviewer role boundary

1. Remain read-only with respect to every tracked repository file, especially
   the plan and specification. Do not edit, commit, stage, push, merge, rebase,
   create or modify issues, change project state, mutate rulesets, or perform
   implementation work.
2. The only file you may create is the current round's new immutable reviewer
   Markdown file inside the ignored protocol directory. Never edit a prior
   response, review, event, state, manifest, handoff, or startup file.
3. Never run `npx aitm co-review finalize`, even if generated help, handoff
   prose, status, or an exit-4 diagnostic prints that command. Never use
   `--good-enough`. Acceptance publication and the archive commit belong only
   to Codex as AUTHOR.
4. Do not bind or resume the shared #1219 AITM task timer. Reviewer turn timing
   is recorded by the mux claim/handoff timestamps; partner waiting is recorded
   through bounded `co-review wait` calls. This avoids stealing the AUTHOR's
   issue timer.
5. Do not spawn another reviewer or ask the human to relay substantive review
   text. Exchange evidence through the filesystem mux only.

## Review standard

Review the entire plan at every handed-off exact commit, not just the latest
diff. Require repository-grounded findings with exact file and line references.
Each finding must use a unique marker such as `[finding:F-001]` and be classified
as one of:

- `blocking` — material to #1219 correctness or executability and requiring a
  smallest sufficient plan correction;
- `non-blocking follow-up` — valuable but safe outside the plan acceptance
  boundary;
- `optional` — polish or preference only.

Do not daisy-chain speculative defects or demand unrelated cleanup. Do not
create follow-up issues. Every blocker must identify the violated accepted-spec
requirement, direct repository evidence, concrete failure mode, owning plan
task/step, and smallest sufficient correction.

Specifically verify:

- every accepted-spec invariant is owned by an executable task, interface,
  test, and dependency edge;
- #1512 compatibility: Full-Auto defaults and the three independent manual plan,
  code, and task review gates;
- exact separation between mandatory spawned-agent flow review and eligible
  human exact-head PR approval;
- Test-owned CI, flow review, approval, merge, and delivery receipt versus
  collateral-only Review;
- trusted-runtime containment, activation, and protection from
  candidate-controlled authorization;
- exact source/base/head and literal target-branch authority;
- nested epic delivery, collapsed tiers, and preservation of
  `merge-back.mjs` as the child-to-parent entry path;
- recovery, idempotency, legacy readability, migration, telemetry, and every
  receipt schema/field invariant;
- file paths and Create/Modify classifications against the handed-off current
  trunk snapshot;
- whether thirteen tasks are sufficiently atomic, ordered, and executable by
  agents that may receive only their own task plus prerequisites;
- whether #1486 is required first, advisable cleanup, or unrelated;
- whether the current six-epic/22-story hierarchy can be migrated without
  discarding valid work.

For the hierarchy verdict, independently test this author hypothesis rather
than accepting it:

- preserve original Tasks 1-11, 15-16, and 19-21;
- preserve completed/reviewing #1226;
- rewrite #1237, #1238, #1239, #1242, #1243, and #1247 as amendment Tasks 3,
  4, 5, 7, 8, and 13 respectively;
- create new children for amendment Tasks 1, 2, 6, 9, 10, 11, and 12;
- keep the six sub-epics but rewrite root/sub-epic contracts and stale
  dependencies;
- move WBS/issue reconciliation out of late Task 13 into a pre-implementation,
  post-plan-acceptance decomposition migration.

Reject or refine that mapping if repository evidence shows a safer minimal
migration. Explicitly state whether wholesale replacement is warranted.

## Required reviewer response structure

1. Verdict: `ACCEPT` or `REVISE`
2. Blocking findings
3. Non-blocking follow-ups
4. Optional improvements
5. Existing-WBS migration verdict
6. #1486 sequencing verdict
7. #1512 compatibility verdict
8. Questions for the author
9. Reviewed SHA and evidence inventory

If no blocker remains after reviewing the complete exact commit, use decision
`accepted`. Otherwise use `changes-requested`. Acceptance means the plan is a
sufficiently complete and executable implementation authority; it is not
permission to implement, mutate issues, or finalize the archive.

## Reviewer handoff and waiting

Read the generated file first:

```text
/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/reviewer-handoff.md
```

Run structured status before every claim. Initially the owner has round 1, so
do not claim early. Start the bounded partner timer using separate calls:

```text
npx aitm co-review wait --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor claude --timeout 60
```

After every call, record `wait cycle N/15`, then run structured status. Exit 3
is a normal timeout. Continue only while Codex owns the turn and the episode has
cycles remaining. Never wrap waits in a shell loop or reset the count silently.
After 15 timeouts, report exact status and stop.

When reviewer becomes available, claim:

```text
npx aitm co-review claim --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor claude
```

Resolve the exact author commit and response path from status, inspect the full
plan and evidence, write `round-N-reviewer-review.md`, and hand off:

```text
npx aitm co-review handoff --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor claude --review /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/round-N-reviewer-review.md --review-of COMMIT_SHA --decision changes-requested --message "plan review complete"
```

Use `--decision accepted` only for an `ACCEPT` verdict. After a nonterminal
changes-requested handoff, immediately begin a fresh bounded wait episode for
Codex's next commit. If an accepted handoff returns exit 4, acceptance is
durable and missing archive publication is expected: do not repeat the handoff,
do not finalize, and do not wait for another reviewer turn. Run one structured
status check, report that the AUTHOR must finalize, and stop.

On intervention-required, integrity refusal, or ambiguous wait count, preserve
all files, report exact structured status, and stop for the human. Do not adjust
the turn budget, supplement, continue, or refocus without explicit authenticated
human instruction.

## Begin

Change to the governed worktree, read `reviewer-handoff.md`, run structured
status, and begin the initial bounded wait episode. Claim only after Codex has
handed off a committed plan and immutable author response.
