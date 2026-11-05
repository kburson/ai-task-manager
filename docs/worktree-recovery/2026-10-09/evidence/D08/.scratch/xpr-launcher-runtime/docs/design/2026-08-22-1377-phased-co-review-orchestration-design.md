---
date: 2026-08-22
status: historical draft (unreviewed)
issue: https://github.com/kburson/ai-peer-review/issues/10
source_issue: https://github.com/kburson/ai-task-manager/issues/1377
source_commit: ad944209e2b719e9b0ecadbd1d3d710ceacfb498
supersedes: none
related:
  - Spec A: docs/superpowers/specs/2026-08-22-1376.md (consumer of the approved spec+plan references this design produces)
  - '#1266 reusable co-review handshake (base protocol)'
  - '#1269 guided start + bounded wait discipline'
co_review:
  status: unreviewed
---

<!-- cspell:words handshaked unreviewed -->

# Phased Co-Review Orchestration

> [!IMPORTANT]
> This is a provenance-preserving copy of the unmerged #1377 draft from
> `kburson/ai-task-manager` commit
> `ad944209e2b719e9b0ecadbd1d3d710ceacfb498`. It is design input for
> `kburson/ai-peer-review#10`, not a ratified description of the current package.
> The liveness-beacon portion predates `ai-peer-review@0.2.1` and the separate
> wake-coordinator work in #9; planning must rebase the phase model onto those
> delivered and pending boundaries before implementation.

## Problem

Today a co-review session validates **one** artifact and terminates at
`accepted` / `intervention-required`. Reviewing a spec _and then_ a plan means
two separately-initialized sessions, each re-handshaked by hand, with the human
relaying every phase transition. Worse, the reviewer's wait discipline is a
fixed cycle cap (#1269: 20×60s ≈ 20 min); when the author needs longer than that
to generate the next artifact — or when either agent **compacts** (2–8 min of
silence that is _not_ death) — the waiter gives up and the walk-away session
stalls.

We want one session to accept an **ordered list** of artifacts (spec, plan, or
either alone), advance autonomously across phase boundaries, and survive
compaction, so a human can start it and walk away. Spec A's R4P gate then
consumes the per-artifact approvals this session produces.

## Relationship to Spec A (do not conflate)

- **Spec A** decides _whether_ an item warrants a co-reviewed spec+plan
  (Depth-Probe → R4P block) and _reads_ per-artifact `co_review:` approval
  references to clear that block.
- **Spec B (this)** is the orchestrator that _produces_ those approvals: it runs
  the actual multi-phase co-review and stamps each accepted artifact.

The seam between them is the **per-artifact finalization stamp** (Component 4),
designed into A as forward-compatible and closed here. A works today with a
human manually driving co-review; B automates the driving. Neither requires the
other to ship.

## What already exists (reused unchanged)

- **Base protocol** (`scripts/review/lib/protocol.mjs`, `aitm.co-review/v1`):
  `init`, `status`, `claim`, `wait`, `handoff`, the `active ↔ changes-requested`
  review loop, mutex/lock semantics, immutable-artifact hashing.
- **Bounded wait discipline** (#1269): `wait --timeout 60`, exit 3 = timeout,
  exit 0 = wake, exit 1/2 = refusal; post-compaction "reread handoff + status"
  recovery.
- **Finalization archive** (`scripts/review/lib/archive.mjs`,
  `aitm.co-review.archive/v1`): sha256-verified git-tracked evidence folder;
  decision basis `reviewer-consensus` | `human-good-enough`.

B adds a **phase cursor**, a **liveness beacon**, and **per-phase
auto-finalization** on top. It does not fork the review loop or the archive.

## Design

### Component 1 — Phased state machine

State schema bumps `aitm.co-review/v1 → /v2`, adding a phases block:

```yaml
phases: [spec, plan] # ordered labels; any list; single label == today
phaseCursor: 0
autonomous: true # recorded human consent for auto-finalize (see C4)
```

- A session with **no `--phases`** is a one-phase session and behaves
  byte-identically to today; existing `v1` sessions still validate.
- Within a phase, the existing `active ↔ changes-requested` loop runs unchanged,
  bounded by a **per-phase reviewer-turn budget** (`--max-turns`, default 10) so
  a contentious spec cannot starve the plan review.
- **`accepted` is terminal only on the last phase.** On `accepted` at cursor _i_:
  - _last phase_ → terminal (exactly as today);
  - _otherwise_ → author **auto-finalizes** phase _i_ (Component 4), advances
    `phaseCursor → i+1`, and the acceptance handoff rolls the reviewer into a
    fresh wait episode for phase _i+1_ (base rule: any successful handoff starts
    a new waiting episode).
- **`intervention-required`** (reviewer-declared _or_ per-phase budget
  exhaustion) **halts the whole session at the cursor.** Downstream phases are
  moot — you cannot plan on an unapproved spec. Earlier phases keep their
  finalized archives. No silent skipping, no fabricated acceptance.

### Component 2 — Bind-at-entry + re-engagement handoff

Later-phase artifacts usually do not exist at `init` (the plan is written
_because_ the spec passed), so artifacts bind at phase entry, not up front.

- `init` records phase **labels only**; no artifact paths required.
- **Phase entry = the author's handoff binds that phase's artifact**: the author
  commits the artifact for phase _i_ and the handoff records
  `{phase: i, artifact: <repo-path>, commit: <sha>}`.
- Phase 1's artifact binds at the first handoff. Phase 2's binds at the
  **re-engagement handoff** the author writes _after_ generating the plan — an
  ordinary `handoff` carrying a new phase-scoped artifact binding, not a new
  protocol.
- The reviewer, sitting in its beacon-gated wait after accepting phase 1, wakes
  on this handoff, runs `status`, sees `phaseCursor` advanced, and reviews the
  newly-bound artifact. The only new datum over today's handoff is the phase tag.

### Component 3 — Liveness beacon (compaction-survivable waiting)

The fixed cycle cap is replaced by **turn-holder liveness**. Whoever holds the
turn emits a beacon while working; the waiter loops **indefinitely while the
beacon is live**, stopping only when it goes stale (the counterpart is genuinely
dead). This is symmetric: author beats while revising/generating → reviewer
waits; reviewer beats while reviewing → author waits.

**Beacon file** — one per actor in the protocol dir, rewritten every beat and on
transitions:

```text
seq        monotonic counter (proves forward progress, not just a clock tick)
ts         last-beat timestamp
turnOwner  who holds the turn now
state      working | compacting | resumed
activity   free text: "reviewing finding 3/7", "generating plan artifact",
           "resumed after compaction (silent 6m)"
```

Both roles know both actor ids from `init`, so classification and monitoring are
bidirectional.

**Declared compaction (preferred, best-effort).** A shipped writer
`co-review beacon --state <working|compacting|resumed> [--activity <text>]` is
wired into the participant's harness hooks:

- **PreCompact hook** → `beacon --state compacting` before the agent goes silent.
- **SessionStart hook (`source=compact`)** → `beacon --state resumed`, which
  re-beats and flips the peer's view back to `working` (dovetails with #1269's
  post-compaction reread-handoff recovery).

The **contract surface is the protocol-dir beacon file**, never the raw session
`jsonl` (provider-internal, often cross-worktree-unreadable, absent for
non-Claude agents). Reading a transcript stays an optional provider-specific
enricher.

**Inferred compaction (cross-provider fallback).** When no beacon signal is
available (the provider has no hook, or a hard mid-turn kill fires none), the
waiter classifies by silence duration:

| State                  | Silence                      | Waiter action                                        |
| ---------------------- | ---------------------------- | ---------------------------------------------------- |
| `working`              | ≤ ~2m                        | keep waiting; surface `activity` to human            |
| `quiet`                | 2–4m                         | keep waiting (long tool-call or entering compaction) |
| `compaction-suspected` | 4–20m                        | keep waiting; report "counterpart likely compacting" |
| `stale`                | **> 20m** continuous silence | escalate                                             |

**20-minute stale threshold** (`--stale-after`, tunable) is the safe full-auto
limit: it clears the observed 2–8 min compaction band with wide margin, so only
a genuinely dead process crosses it. A present, fresh `compacting` beacon
suspends the inference clock entirely; the outer safety bound is then measured
from the `compacting` signal so a compaction that never returns still eventually
escalates.

**Self-heal:** a returning agent rereads its handoff, runs `status`, and writes a
fresh beat; the peer sees `seq` advance and reclassifies as `working`. Silence
bounded by resumption never trips stale.

**Bidirectional monitoring, formalized:** on each wake the waiting role reads the
peer's beacon + recent protocol events and may surface a one-line progress note
to the human ("reviewer on finding 4/7") — the author-narrates-the-reviewer
behavior, made a contract, working both directions.

**`stale` in walk-away** (no human to escalate to): the session **parks** — writes
a stale-halt marker + status snapshot, stops polling (no token burn against a
dead peer), and a full-auto runner pulls next work. The parked-stale session is
visible on the human's return. Consistent with Spec A's park-and-skip.

### Component 4 — Per-phase auto-finalization + Spec A reciprocity

On every non-final `accepted`, the author runs the **existing** `archive.mjs`
finalization for that phase:

- **One archive per phase** (spec archive, plan archive), each sha256-self-
  verifying, decision basis `reviewer-consensus` on the autonomous path.
- Each phase's finalization stamps the accepted artifact's YAML frontmatter with
  the **exact per-artifact block Spec A consumes**:

  ```yaml
  co_review:
    status: approved
    protocol: <uuid>
    archive: <repo-relative evidence dir>
    basis: reviewer-consensus
  ```

- The session's `autonomous: true` consent, recorded by the human at `init`, is
  the standing authorization that satisfies finalization governance for every
  auto-finalize in the session (finalization is human-authorized; the human
  authorized it once, up front, by starting a phased autonomous session).

This is the closing half of Spec A's forward-compatible seam: A's R4P gate reads
these stamps; B writes them.

## Command surface & back-compat

- `init` / `start` gain `--phases <ordered,list>`, `--autonomous`,
  `--stale-after <min>` (default 20). Omitting `--phases` ⇒ one-phase session ⇒
  byte-identical to today.
- New verb: `beacon --state <working|compacting|resumed> [--activity <text>]`.
- `wait` gains a beacon-gated mode; the legacy fixed 20×60s mode is preserved
  unchanged for non-phased sessions (#1269 contract untouched).
- Handoff records a phase-scoped artifact binding `{phase, artifact, commit}`.

## Autonomy summary (walk-away flow)

1. Human runs `start --phases spec,plan --autonomous`, hands both prompts to the
   two agents, walks away.
2. Author commits + hands off the spec; reviewer reviews under beacon-gated
   waiting; `changes-requested` loops until `accepted`.
3. On spec `accepted`: author auto-finalizes the spec (archive + frontmatter
   stamp), advances the cursor, generates the plan (beating throughout), commits
   it, writes the re-engagement handoff.
4. Reviewer wakes, reviews the plan; on `accepted` (final phase) the session
   terminates with the plan finalized.
5. Both artifacts now carry approved `co_review:` stamps → Spec A's R4P gate
   clears for the tracking issue.
6. Any dead-counterpart (stale beacon) at any point parks the session for the
   human instead of stalling on a fixed timer.

## Non-goals

- **Automating the human's participant/model/effort selection** — still chosen by
  the human at `init`. B automates the _relay_, not the _casting_.
- **Guaranteeing a pre-compaction signal on every provider** — declared
  compaction is best-effort; the silence-inference fallback is mandatory and must
  not be removed because the hook "usually" works. A hard mid-turn kill fires no
  hook by definition.
- **Spec A's Depth-Probe / R4P routing** — that is Spec A.
- **Changing the review loop or archive internals** — reused unchanged.

## Open questions (resolve during planning)

- Beacon file schema id + whether `activity` is free text or a small enum.
- Where a per-phase `--max-turns` override lives when phases differ in expected
  contentiousness (session-level default vs per-phase map).
- Exact `v1 → v2` migration/validation for an in-flight legacy session.
- Whether the re-engagement handoff needs a distinct event type in the event log
  (`aitm.co-review-event/v1`) or rides the existing handoff event with a phase tag.
- Precise semantics of the outer safety bound when a `compacting` beacon is
  present but never transitions to `resumed`.
