# GitHub Issues & Kanban Workflow

Full workflow rules for projects using `ai-task-manager`. These rules define how Claude Code, Codex, and human operators should manage issues, move Kanban states, and handle cleanup.

---

## Vocabulary (canonical)

Stage names are nouns describing a process; the corresponding activity is a verb. We shorten both to the verb form for brevity (e.g., we say "Refine stage" rather than "Refinement stage" — same column, shorter label).

| Stage (column)                     | Full process name | Activity verb | Also known as               | What happens here                                                                                                               |
| ---------------------------------- | ----------------- | ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Discover _(agent-side, pre-issue)_ | Discovery         | discover      | Ideation, Triage            | Untracked ideation bucket. Not a kanban column — `/task discover` opens a scratch bucket for pre-Backlog work.                  |
| Backlog                            | Backlog           | —             | —                           | Collection of prioritized backlog items (user stories, tasks).                                                                  |
| Refine                             | Refinement        | refine        | —                           | Backlog item is shaped to be ready for planning: acceptance criteria, estimate, size, priority, labels.                         |
| Plan                               | Planning          | plan          | —                           | Team performs a deep-dive on the story to determine a plan of action: enhanced ACs, refined estimate.                           |
| Develop                            | Development       | develop       | In Progress                 | Code changes are made and committed against the story, including test automation.                                               |
| Test                               | Testing           | verify        | Verify, QA                  | Committed source is run against all ACs and test automation in a sandboxed environment.                                         |
| Review                             | Review            | review        | Ready for Acceptance        | Story waits for product owner to review functionality in a live demo and confirm all ACs (functional + non-functional) are met. |
| Done                               | Done              | —             | Complete, Ready for Release | All ACs and Definition of Done are satisfied.                                                                                   |

**Retired terms** (do not use):

- ~~Groom / Grooming~~ — replaced by **Refine / Refinement**. The activity of sizing + estimating + prioritizing + adding rationale is "refining", not "grooming". Marker names, helper modules, comment prefixes, and docs use the `refine` form going forward. Legacy `aitm-groom-*` markers are read-accepted on existing issues for backward compatibility but never written.

### Naming rules

These rules tell you which spelling to use when introducing new code, markers, or doc references:

| Where it appears                | Form                                            | Example                                             |
| ------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Stage / column name             | Noun (shortened to verb form for column labels) | `Refine` column, `Refinement` process               |
| Body marker (artifact identity) | Noun                                            | `aitm-refinement-rationale`                         |
| Comment marker (action taken)   | Past-tense verb                                 | `aitm-refined-estimate`                             |
| Module constant (process)       | Noun                                            | `REFINEMENT_HEADER`                                 |
| Function name (action)          | Verb                                            | `applyRefinementEstimate`, `planRefinementEstimate` |
| CLI verb (`/task ...`)          | Verb                                            | `/task refine`, `/task discover`, `/task verify`    |

Backward-compat read paths accept the legacy `aitm-groom-*` forms; write paths emit only the new forms.

**Verb-to-state-entry mapping** (state-entry verbs do the prep + transition atomically):

| Verb               | Enters stage           | Notes                                                                                                                         |
| ------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/task refine #N`  | Refine                 | Sets Size + Estimate + Priority + writes `aitm-refine-rationale` marker, then promotes Backlog → Refine.                      |
| `/task discover`   | (pre-backlog ideation) | Opens an untracked discovery bucket; promote to an issue with `/task new <title>`. Legacy `/task plan` is a deprecated alias. |
| `/task plan #N`    | Plan                   | (Reserved; currently use `/task promote` from Refine.)                                                                        |
| `/task develop #N` | Develop                | (Reserved; currently use `/task promote` from Plan after `/task plan-approve`.)                                               |
| `/task verify #N`  | Test                   | Runs sandboxed verification of all ACs and test automation; stamps `aitm-dod-verified` marker. (To be built per epic #107.)   |
| `/task review #N`  | Review                 | Promotes Test → Review after verification passes.                                                                             |
| `/task approve #N` | (gate stamp)           | Stamps the human-approval marker for the current gate (plan→develop or review→done).                                          |
| `/task close #N`   | Done                   | Closes the issue and moves Review → Done.                                                                                     |
| `/task promote #N` | next stage             | Generic one-step advance; used for transitions without bespoke prep.                                                          |

---

## Issue Creation

**Always assign new issues to yourself** — every `gh issue create` must include `--assignee <your-github-login>`.

```bash
gh issue create \
  --title "Feature: ..." \
  --body "## Description\n...\n\n## Acceptance Criteria\n- [ ] ..." \
  --label needs-triage \
  --assignee <your-login>
```

Immediately after creating, set **both** `Estimate` (hours) and `Size` on the GitHub Projects board — see `docs/guides/ai-value-framework.md` for the GraphQL mutations. Never leave an issue without these two fields.

---

## Kanban Board States

Issues move through seven states:

```
Backlog → Refine → Plan → Develop → Test → Review → Done
```

Move issues using the helper script (reads all IDs from `.ai-task-manager/task-tracker.json`):

```bash
scripts/gh/move-state.mjs <issue#> <state>
# States: backlog | refine | plan | develop | test | review | done

scripts/gh/move-state.mjs 42 develop
```

- Move to **Refine** when an issue is being shaped (sized, AC drafted).
- Move to **Plan** after the deep-dive analysis is posted.
- Move to **Develop** when `/task #N` activates an issue and code work begins.
- Before `/task review`, commit the implementation and run `/task commit-trace #N`; Review requires a clean tracked worktree and a canonical `### 🔗 Commits` comment containing the current `HEAD`.
- **Test** is entered automatically by `/task review` while the verification gate runs.
- Move to **Review** automatically when verification passes (ready-for-review).
- Move to **Done** only by `/task close` after a human approves.

### Human Gates

Two transitions require explicit human approval. Both are toggleable via config; defaults preserve today's behavior (human required).

| Gate           | Config key                  | Default | Bypass behavior when `false`                                                                            |
| -------------- | --------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| Plan → Develop | `gateAnalysisToDevelopment` | `true`  | `/task promote #N` auto-writes the approval marker and moves the issue; emits a `gate-bypassed` status. |
| Review → Done  | `gateReviewToDone`          | `true`  | `/task close` posts a `gate-bypassed` timing-log row instead of refusing.                               |

The config key `gateAnalysisToDevelopment` retains its legacy name for backward-compatibility with existing project configs; semantically it gates Plan → Develop.

The Plan → Develop gate is enforced by a hidden marker `<!-- aitm-plan-approved: <ISO ts> -->` written into the issue body by `/task approve #N`. `move-state.mjs` refuses (exit 4, `BLOCKED: plan -> develop requires <!-- aitm-plan-approved: <ts> --> marker`) when the marker is missing and the current state is Plan. The legacy `- [ ] Plan approved by human` checkbox is no longer recognized — run `scripts/task-tracker/migrate-plan-approved.mjs <issue#>` on any in-flight issue that still carries it.

The Review → Done gate is enforced by a hidden marker `<!-- aitm-review-approved: <ISO ts> -->` written into the issue body by `/task approve #N`. `/task close` refuses (exit 7, `PROMPT_REQUIRED: review-approval #N`) when the marker is missing and `gateReviewToDone=true`.

The Plan → Develop gate also requires a hidden marker `<!-- aitm-deep-dive-complete: <ISO ts> -->` written into the issue body by `/task check "Deep dive complete"` after the Deep-Dive Analysis section is posted. `/task approve #N` refuses with `deep-dive-required` when the marker is missing. As with the other two markers, the legacy visible `- [x] Deep dive complete` AC checkbox is no longer recognized — the marker is the sole source of truth. All three marker helpers live in [`scripts/task-tracker/lib/markers.mjs`](../../scripts/task-tracker/lib/markers.mjs) and write to the body only via the canonical encoding (legacy fenced field-DB blocks are normalized on the same write).

**`--answer yes` does not satisfy human gates.** `/task close #N --answer yes` when no review-approval marker is present exits 8 with a refusal message. The only ways to satisfy the gate are running `/task approve #N` (human) or setting `gateReviewToDone false` in config. `--answer yes|no` still works at the dirty-workspace prompt, which is operational, not a human gate.

Toggle a gate (project-wide, persisted to `.ai-task-manager/task-tracker.json`):

```bash
/task config gateAnalysisToDevelopment false   # full-auto Plan → Develop
/task config gateReviewToDone false            # full-auto Review → Done
```

### Session-scoped auto-mode (`/task auto`)

For one-off parallel batches (e.g., dispatching several sub-issues without pausing on each human gate), prefer **session-scoped overrides** over editing project config. They live in `.claude/task-tracker.session.<session-id>.json` when a session ID is available, are gitignored, and apply only to the current agent session.

```bash
/task auto both      # both gates OFF (full auto)
/task auto plan      # Plan→Develop OFF, Review→Done ON
/task auto review    # Plan→Develop ON,  Review→Done OFF
/task auto off       # both gates ON (safe default)
/task auto reset     # clear session override → fall back to project config
```

**Precedence**: session override > project config > built-in defaults (both gates ON).

**Per-parent prompt**: when both `gateAnalysisToDevelopment` and `gateReviewToDone` are _not_ explicitly set in project config, the first `/task #N` bind under a new parent emits a `PROMPT_REQUIRED: auto-mode #<rootKey>` line so the skill can ask the user which gates to toggle. The `lastPromptedParent` field is keyed by `parentOf(#N) || #N`, so further binds under the same parent do not re-prompt; switching to a different epic does.

**Orphan GC**: on `SessionStart`, override files older than `deadSessionMaxAgeMs` (default 7 days) are swept. Tunable via `/task config deadSessionMaxAgeMs <ms>`.

### Sequence-as-wave-id

Sequence is a numeric field on each issue. Sub-issues sharing the same Sequence
form a wave: they may be dispatched in parallel, but a sub-issue at Sequence
N+1 cannot start until every Sequence-N sibling reaches Done. The
`wave-admission` gate enforces this on `/task promote` (entering Plan). Solo issues with no
parent epic bypass the gate. See [DESIGN.md](../DESIGN.md) for the
discovered-sub-issue and same-wave-newcomer semantics.

Within a wave, child flow is further constrained:

- **WIP rule** — at most one child advances out of Refine per epic at a time
  (`planRefineWipGate`, entering Plan). A child _parked_ on a dependency does
  not count against the budget, and a blocker may run ahead of the parked
  sibling it unblocks. Override: `TASK_TRACKER_FORCE_PROMOTE=1`.
- **Dependency representation** — a parked child carries the `BLOCKED` label
  plus an `aitm-blocked-by: #N[, #M]` body marker.
- **Dependency-aware JIT selection** — the next child pulled Refine → Plan
  prefers blockers and excludes any child whose blockers are not all Done. When
  a blocker reaches Done its dependents are auto-unparked.
- **Discovered work** may be created and driven Refine → Review (never straight
  to Done) at any epic state except a Done epic; the `childCreationAllowedAtEpicState`
  guard refuses new children under a Done parent (override
  `AITM_SKIP_PARENT_STATE_GATE=1`). Children are no longer required to all reach
  Refine before the epic may move to Plan — that exit-gate requirement was retired.

### Backlog vs Refine

Backlog and Refine are not interchangeable — they encode different states of issue readiness:

- **Backlog** = raw, unvetted ideas. No `Size`, no `Estimate`, no fully-formed acceptance criteria required. Backlog is the idea inbox; pulling from Backlog requires shaping work first.
- **Refine** = stories that are fully formed and ready to pick up. Acceptance criteria, `Size`, and `Estimate` are all set. Pulling from Refine never requires additional shaping.

All issues are created in Backlog — no exceptions (#272). `scripts/gh/create-issue.mjs` no longer accepts `--status`. When an agent or human files a new issue with full ACs and sizing already set, create it (lands in Backlog and stamps `aitm-entered-backlog`) and immediately chain `node scripts/task-tracker/task-tracker.mjs promote <N>` to advance through Refine. The previous "tether straight to Refine" shortcut left `aitm-entered-backlog` unstamped and broke the contiguity guard on later forward transitions.

`scripts/gh/project-tether.mjs` and `scripts/gh/move-state.mjs` emit non-blocking warnings when this rule is violated (e.g. tethering a sized + estimated issue to Backlog, or moving a sized issue back to Backlog).

---

## Priority Tiers

Use P0/P1/P2 only. Sub-issues must share the same Priority as their parent epic — mismatched priority causes sub-issues to appear in the wrong swim lane.

```bash
scripts/gh/set-priority.mjs <issue#> <priority> [--cascade]
# Priorities: p0 | p1 | p2

# Always use --cascade when setting priority on an epic:
scripts/gh/set-priority.mjs 42 p1 --cascade
```

---

## Sub-Issues Hierarchy

Use native GitHub sub-issues to track epic completion. **A parent issue cannot be marked Done until all child issues are complete.**

Link a new issue as a sub-issue of its parent epic:

```bash
# Get the parent issue's node ID
PARENT_ID=$(gh api graphql -f query='{ repository(owner:"<owner>", name:"<repo>") { issue(number:<N>) { id } } }' --jq '.data.repository.issue.id')

# Get the child issue's node ID
CHILD_ID=$(gh api graphql -f query='{ repository(owner:"<owner>", name:"<repo>") { issue(number:<M>) { id } } }' --jq '.data.repository.issue.id')

# Link as sub-issue
gh api graphql -f query="mutation { addSubIssue(input: { issueId: \"$PARENT_ID\" subIssueId: \"$CHILD_ID\" }) { issue { id } } }"
```

Cross-link in issue bodies: use "Parent: #N" and "Blocked by: #M" in the issue description.

---

## Estimates and Size (required)

Every issue/sub-issue needs both fields set **before work starts**:

| Field      | Type           | Purpose                                                |
| ---------- | -------------- | ------------------------------------------------------ |
| `Estimate` | Number (hours) | Mid-level human-equivalent hours — the ROI denominator |
| `Size`     | Single select  | XS/S/M/L/XL — coarse sizing for swim-lane views        |

Size options: **XS** (1–2h), **S** (3–4h), **M** (6–10h), **L** (12–20h), **XL** (24h+).

See `docs/guides/ai-value-framework.md` for the sizing guide, field IDs after `init`, and GraphQL mutation snippets.

**At `/task #N` activation**: if either field is missing, set both before touching any code.

### Three-stage estimation

Size and Estimate move through three distinct stages. Only the first two ever mutate fields; the third is read-only.

| Stage  | Verb that fires it                              | Mutates fields?               | Comment surface           |
| ------ | ----------------------------------------------- | ----------------------------- | ------------------------- |
| Refine | `/task promote <N>` (backlog → refine boundary) | Yes — initial set (manual)    | `### 🛠 Refine estimate`  |
| Plan   | `/task promote <N>` (plan → develop boundary)   | Yes — rebucket from Deep Dive | `### 🔁 Plan re-estimate` |
| Review | `/task close <N>` (review → done)               | **No** — read-only delta      | `### 📊 Review delta`     |

**Refine estimate.** When `/task promote <N>` advances an issue from Backlog to Refine, the harness pre-checks two signals and posts an audit comment:

- **Board values.** Size, Estimate, and Priority must already be set on the project board. The agent/human sets these manually before invoking promote.
- **Rationale marker.** The agent embeds a one-line hidden marker in the issue body before promoting: `<!-- aitm-refinement-rationale: {"size":"...","estimate":"...","priority":"..."} -->` (legacy `aitm-groom-rationale` still read-accepted on existing issues).
- If either is missing, promote refuses with one `BLOCKED:` line per signal and exits non-zero — no board move happens.
- Otherwise, the move proceeds and a `### 🛠 Refine estimate` comment is posted with a Size/Estimate/Priority table. A hidden `<!-- aitm-refined-estimate: <N> -->` marker makes the post idempotent; re-running promote will not duplicate it. The rationale marker is stripped from the body after a successful post.

**Plan re-estimate.** When `/task promote <N>` advances an issue from Plan to Develop, the harness re-evaluates Size + Estimate from the Deep-Dive Analysis section:

- Signals: count of files-to-edit, plan steps, identified risks, and `Depends on:` dependencies.
- Score → bucket → median hours. Constants live in `scripts/task-tracker/lib/reevaluate-estimate.mjs`.
- If the new (size, estimate) match the current values, the re-estimate is a silent no-op.
- If they differ within one tier, the project fields and body fields-block are updated and a `### 🔁 Plan re-estimate` audit comment is posted with a from→to table.
- If they differ by **≥2 size tiers**, no fields are mutated — instead a `⚠ HUMAN ATTENTION` comment is posted under the same header so a human can resolve the scope question.

Override: set `TASK_TRACKER_SKIP_REEVAL=1` to skip the analyze-stage hook. The bypass still posts a one-line audit comment so the gap is visible per-issue.

**Discovered work — estimate inflation.** When scope expands during Develop (new defects found, design gaps surfaced, architecture decisions forced), update the estimate and record the change in the existing `<!-- aitm-refined-estimate: <N> -->` comment (legacy `aitm-groom-estimate:` still recognized) — do not post a new comment. Append a `### Discovered work — estimate inflation (<date>, Develop)` section with this structure:

1. A single prose sentence stating what was discovered and why it pushed effort past the current size-bucket ceiling.
2. A numbered defect/work-item table with an effort column per item, so the total delta is traceable to individual discoveries.
3. A summary before/after table showing Size and Estimate with a Delta column; include the size-bucket ceiling in the Delta cell (e.g. `+1 bucket (total effort exceeded S ceiling of 3h)`).

Then update the board fields and the `aitm-fields` block in the issue body to match.

> Future automation: `/task inflate-estimate <N> --size <S|M|L> --estimate <Nh>` will find the marker, prompt for per-item rationale, append this section, and update board fields atomically. Until that verb exists, follow the manual steps above.

**Review delta.** When `/task close <N>` advances an issue to Done, the harness posts a read-only retrospective comment recording Estimate vs. Actual:

- Reads `Estimate` (hours) and `Engaged Time` (hours) from the project board.
- Posts a `### 📊 Review delta` comment with the Δ percentage and a footer noting that Size/Estimate are not modified.
- If `Actual` is missing, the cells render as `—` and a fallback note is included; no crash.

Override: set `TASK_TRACKER_SKIP_DELTA=1` to skip the close-stage hook. The bypass still posts a one-line note so the gap is visible per-issue.

---

## Inline Update Cadence

If work traces to a GitHub issue, update it inline (not just at cleanup):

- Comment when a sub-phase lands: include the commit SHA, what landed, and what's deferred and why.
- Check off acceptance criteria checkboxes as they are met.
- Open new issues for follow-on work discovered during the session; cross-link them.

In git commit messages, reference issue numbers (`fixes #42`) to auto-link commits on GitHub.

---

## Timing Log

Each issue carries a single `⏱ Timing Log` comment that records its full lifecycle as rows. The canonical event table lives in [`scripts/task-tracker/phase-events.mjs`](../../scripts/task-tracker/phase-events.mjs).

### Lifecycle phase rows

There are 11 lifecycle events: 7 `enter` rows (one per kanban state) and 4 `complete` rows (only for the non-terminal middle states). Terminal states — `backlog`, `review`, `done` — emit only an `enter` row.

| Event slug       | State   | Kind     | Description                       | Emitted by                 |
| ---------------- | ------- | -------- | --------------------------------- | -------------------------- |
| `created`        | backlog | enter    | task created in Backlog           | `new` (issue creation)     |
| `refine:start`   | refine  | enter    | start refinement                  | `promote` / `refine`       |
| `refine:done`    | refine  | complete | refinement completed              | `refine` (on exit)         |
| `plan:start`     | plan    | enter    | plan started                      | `refine` / `promote`       |
| `plan:done`      | plan    | complete | plan completed — waiting approval | `plan-approve` / `promote` |
| `develop:start`  | develop | enter    | start development                 | `promote`                  |
| `develop:done`   | develop | complete | development complete              | `review` (on exit)         |
| `test:start`     | test    | enter    | start testing                     | `review` / `promote`       |
| `test:done`      | test    | complete | testing complete                  | `review` (on exit)         |
| `review:waiting` | review  | enter    | waiting in review                 | `review`                   |
| `approved`       | done    | enter    | story approved                    | `approve` / `close`        |

### Paired-emission rule

State-moving verbs emit **both** a `<prev>:complete` row and a `<next>:enter` row in a single invocation; there are no separate "complete" verbs. For example, a single `/task review #N` call on an issue in `develop` writes `develop:done` _and_ `test:start` to the timing log as a paired entry. Likewise `/task promote #N` from `plan` writes `plan:done` _and_ `develop:start`. The chokepoint is `scripts/gh/move-state.mjs`, which derives the pair from the canonical `PHASE_EVENTS` table.

### Task switching

`/task switch <id>` is asymmetric — the timing log on the **outgoing** issue gets a single `switch-out → task <id>` row; the incoming issue records only its normal start or `resumed` row. There is no matching `switch-in` row on the outgoing side, and an issue that is switched away from and never returned to retains the outgoing-only marker as its final row (no synthetic close).

A returning task (one whose timing log is reopened after a `switch-out`) records a plain `resumed` row when re-bound; the gap between `switch-out` and `resumed` is the time the agent spent elsewhere.

### Parallel worktrees

Timing logs are strictly **per-issue and single-writer**. When an epic fans out into parallel sub-agent worktrees, each child sub-agent appends only to its own child issue's timing log; the parent epic's log records **epic-level** phase rows only — for example, when a wave is dispatched, when all children in the wave reach Review, and when the epic itself transitions. No child ever writes to the parent's timing log, and no two agents share a writer for a single issue.

### Sample timing log

A complete Backlog → Done sequence interleaved with one pause/resume cycle and one pre-/post-compact pair:

```
| Timestamp (UTC)        | Event                  | Description                          |
| ---------------------- | ---------------------- | ------------------------------------ |
| 2026-05-19T12:00:00Z   | created                | task created in Backlog              |
| 2026-05-19T12:05:00Z   | refine:start           | start refinement                     |
| 2026-05-19T12:18:00Z   | refine:done            | refinement completed                 |
| 2026-05-19T12:18:00Z   | plan:start             | plan started                         |
| 2026-05-19T12:40:00Z   | plan:done              | plan completed — waiting approval    |
| 2026-05-19T12:41:00Z   | develop:start          | start development                    |
| 2026-05-19T13:10:00Z   | pause                  | pause for question                   |
| 2026-05-19T13:25:00Z   | resumed                | question answered                    |
| 2026-05-19T14:02:00Z   | pre-compact-flush      | context approaching limit            |
| 2026-05-19T14:03:00Z   | post-compact-resume    | resumed after /compact               |
| 2026-05-19T14:55:00Z   | develop:done           | development complete                 |
| 2026-05-19T14:55:00Z   | test:start             | start testing                        |
| 2026-05-19T15:10:00Z   | test:done              | testing complete                     |
| 2026-05-19T15:10:00Z   | review:waiting         | waiting in review                    |
| 2026-05-19T15:30:00Z   | approved               | story approved                       |
```

Note the paired emissions on the state-moving rows (`refine:done` + `plan:start`, `plan:done` + `develop:start`, `develop:done` + `test:start`, `test:done` + `review:waiting`), and that `pause`/`resumed`/`pre-compact-flush`/`post-compact-resume` are session-lifecycle rows that interleave freely inside any state.

---

## Context management

AI sessions accumulate large live context: global instructions, repo memory,
task-tracker rules, loaded skills, tool output, issue bodies, evolving
implementation state. Once the transcript grows large enough, the assistant
can start missing active rules or over-weighting stale context. Treat
context management as a first-class lifecycle concern.

**Three operations, one rule:** after any of them, reload the boot index.

- **Compact** — preserves narrative; loses structural enforceability of
  hard rules. Use when continuing the same task and a current
  `session-state.md` artifact exists.
- **Clear** — drops live context entirely. Use when the transcript is
  stale, noisy, contradictory, or above the reliability threshold (rules
  being missed, repeated re-derivation of known facts).
- **Fresh worker** — a new session (parallel worker, return after a long
  break). Same boot procedure applies.

**Boot index:** `.ai-task-manager/session-boot.md` lists the Tier-1 files
every session must reload (router, pickup-directive, task-tracker.json,
active issue body). After Compact or Clear, re-read all of them — a
compacted paraphrase of a rule is **not** the rule. See the
"Post-Compact/Clear Recovery" section in
`.ai-task-manager/pickup-directive.md` and Hard Rule 11 in
`skill/shared/router.md`.

**Per-task state:** copy `.ai-task-manager/session-state-template.md` to
`.ai-task-manager/claude/session-tracking/<issue>-state.md` (gitignored)
and keep its 9 fields current. The template preserves the structure
(Goal, Non-Negotiable Rules, Active Files, Decisions, Plan, Completed,
Remaining, Verification, Risks) that a compacted summary cannot.

**Practical thresholds:** keep active context small where possible.
Compact around sustained medium-large sessions; don't compact mid-verb.
Prefer Clear/reload when transcript noise dominates. Compacted summaries
are hints, not authoritative configuration.

---

## Cleanup Procedure

When the user says **"cleanup"**, execute in order:

1. **Update docs** — update any `docs/` files that reflect this session's work.

2. **Update GitHub issues** — for completed issues, post a session log comment using the template in `docs/guides/ai-value-framework.md`. Set `Session Time` and `Engaged Time` fields on the board. Open follow-on issues; close completed ones with a resolution comment.

3. **Commit** — stage all changes and commit with a descriptive message referencing issue numbers.

4. **Post-commit issue updates** — after the commit lands:
   - Check off completed acceptance criteria.
   - Post a comment with the SHA + what landed + what's deferred.
   - Open follow-on issues and cross-link them.
   - Move completed sub-issues to Done: `scripts/gh/move-state.mjs <N> done`.
   - Update the parent issue body with progress; move parent to Done when all children are complete.

5. **Feature value summary** — if a feature/epic completed this session, generate a value summary using the template in `docs/guides/ai-value-framework.md`. Post it as a comment on the parent epic issue.

6. **Compact** — `/compact` to free context for the next phase.

---

## Backlog healing

`scripts/task-tracker/heal-backlog.mjs` walks every issue in the project board and performs three jobs in one pass:

1. **Encoding normalization** — strips legacy fenced `<!-- ai-task-manager:fields:start/end -->` blocks and emits a single `<!-- aitm-fields: ... -->` HTML comment; converts visible "Plan approved by human" checkboxes into `<!-- aitm-plan-approved: <ts> -->` markers. Vestigial AC bullets (`- [x] approved by Human`, `- [x] Deep dive complete`) are stripped only when the corresponding hidden marker is present — this preserves history on issues that predate the marker model.
2. **Timing reconciliation** — parses the `⏱ Timing Log` comment, recomputes `engagedTime` / `sessionTime` / `reviewTime` / `startTime` from the rollup, rewrites the fields-DB if they disagree, and posts a `### 🛠 Backlog heal` comment with a deltas table. Static fields (`priority`, `size`, `estimate`, `sequence`) are never touched.
3. **Schema validation** — fetches the project's GraphQL field schema and diffs against the canonical set; reports missing / extra fields, type mismatches, and option drift (including Status column options). Exit code 3 on drift.

### Usage

```bash
# Dry run, all issues (default) — writes report to .tmp/heal/heal-backlog-<ISO>.md
node scripts/task-tracker/heal-backlog.mjs

# Apply changes for real
node scripts/task-tracker/heal-backlog.mjs --apply

# Scope to specific issues
node scripts/task-tracker/heal-backlog.mjs --scope 41,87 --apply

# Filter by state
node scripts/task-tracker/heal-backlog.mjs --state open
node scripts/task-tracker/heal-backlog.mjs --state closed

# Skip schema validation
node scripts/task-tracker/heal-backlog.mjs --no-schema-check

# Run apply despite schema drift (not recommended)
node scripts/task-tracker/heal-backlog.mjs --apply --ignore-schema-drift
```

### Idempotence

Re-running on a healed body is a no-op: encoding is already canonical, timing fields already match the rollup, plan-approved marker is already in place. The heal comment is only posted when there are deltas to surface.

---

## Close Tracking (required)

At issue close, set these two fields on the GitHub Projects board:

- **Session Time** — total active AI session minutes across all sessions touching this issue.
- **Engaged Time** — session time plus review-time adjustments used by reports.

The `/task end` command (or `scripts/gh/move-state.mjs <N> done`) handles this automatically when the task skill is active. If closing without the skill, set both fields manually via the GraphQL mutations in `docs/guides/ai-value-framework.md`.

---

## Planning Issues

Log planning and design sessions against a dedicated planning issue, not the implementation issue. This keeps the `Estimate / Engaged Hours` ratio clean for implementation work and makes planning cost visible on its own.

```bash
gh issue create \
  --title "Planning: <epic title>" \
  --body "Planning and design sessions for #<epic>. Log actual planning hours here." \
  --label planning \
  --assignee <your-login>
```

Use `/task discover` in Claude Code to open an untracked discovery bucket; use `/task new <title>` to promote it to a real issue when the scope is clear. (Legacy `/task plan` still works with a deprecation warning.)

---

## Load-Once Skill Files

Frequently-loaded skill detail files (`skill/adapters/claude/SKILL.md`, `skill/shared/SKILL.md`, `templates/pickup-directive.md`) carry an `<!-- aitm-skill-version: X.Y.Z -->` marker stamped from `package.json#version` at `npm install` time. The installed Claude shim instructs the agent to:

1. Read just the marker line from each file.
2. Grep the current conversation context for `aitm-skill-loaded:<id>:<version>`.
3. Skip the full read when the sentinel is present; otherwise read fully and emit the sentinel.

After `/clear`, `/compact`, or `npm update ai-task-manager`, the sentinel/marker mismatches and a reload happens automatically. v1 is text-instruction only — no hook enforces the contract. The `AITM_FORCE_STAMP=1` env var makes install stamp dev checkouts (otherwise stamping skips when `.git` is present at the package root).

---

## Quality Gates

Code/docs/spelling are gated by four tools wired through `package.json` scripts.

| Script                 | Tool                     | Scope                                  |
| ---------------------- | ------------------------ | -------------------------------------- |
| `npm run format:check` | Prettier                 | All files (write via `npm run format`) |
| `npm run lint:js`      | ESLint (flat config, v9) | `**/*.{mjs,js}`                        |
| `npm run lint:md`      | markdownlint-cli2        | `**/*.md`                              |
| `npm run lint:spell`   | CSpell                   | `**/*.{md,mjs,js,json}`                |
| `npm run lint`         | composite                | js + md + spell                        |
| `npm run quality`      | composite                | `format:check && lint && test`         |

Config files (all at repo root):

- `.prettierrc.json` + `.prettierignore`
- `eslint.config.mjs` (flat config; uses `@eslint/js` + `globals`)
- `.markdownlint-cli2.jsonc` + `.markdownlintignore`
- `cspell.json` + `cspell-dictionary.txt`

Ignored paths in every tool include `node_modules/`, `.tmp/`, `.worktrees/`, `.claude/worktrees/`, `reports/`, `coverage/`, `docs/postmortems/`.

When CSpell flags a legitimate token (project jargon, library name, person name), add it to `cspell-dictionary.txt` — keep the file sorted (`sort -u -o cspell-dictionary.txt cspell-dictionary.txt`). Don't disable spell-check inline.

`npm run quality` must exit 0 before close. CI runs the same script.
