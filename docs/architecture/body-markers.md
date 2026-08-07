# Issue-Body Markers

Hidden HTML-comment markers (`<!-- aitm-<name>: <value> -->`) are the canonical
state record for an issue. They are invisible in rendered GitHub Markdown but
parseable from the raw body string. The state machine reads them; gates write
them; humans rarely interact with them directly.

This page catalogues the **Deep-Dive Analysis** marker pair introduced by
issues `#297` / `#300` / `#294`, and the full invariant marker-family list
enforced by `lib/body-invariants.mjs`. For the body-version + write-contract
markers (`aitm-body-version`, `aitm-fields`) see
[`body-writes.md`](./body-writes.md). For the state-transition entry markers
(`aitm-entered-<stage>`) see [`state-machine.md`](./state-machine.md#entry-markers).

## Marker-family catalogue

The set below is the authoritative list of hidden markers
`lib/body-invariants.mjs` (`INVARIANT_MARKER_PATTERNS`) protects from being
silently dropped by a `mutateIssueBody` write — the same list is mirrored in
`lib/gh-edit-guard.mjs` to backstop external `gh issue edit` invocations.
`kind` matches the vocabulary used by `findLostMarkers`: `single` (0-or-1
occurrence), `multi` (one occurrence per stage, used only by
`aitm-entered-<stage>`), or `count` (append-only; occurrence count must never
decrease).

| Marker                     | Kind   | Purpose                                                                                                                                                      |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `aitm-fields`              | single | Structured JSON blob of board fields (priority, size, estimate, timing, etc).                                                                                |
| `aitm-body-version`        | single | Optimistic-concurrency token for `versionedWriteBody`; see [`body-writes.md`](./body-writes.md).                                                             |
| `aitm-stage-rollup`        | single | Per-stage cumulative time-in-state JSON, updated on every transition.                                                                                        |
| `aitm-refine-complete`     | single | Timestamp of Refine-stage completion (Backlog/On-Deck → Refine exit gate input).                                                                             |
| `aitm-plan-approved`       | single | Timestamp of the human/full-auto Plan approval; gates Plan → Develop.                                                                                        |
| `aitm-epic-ac-reconciled`  | single | Timestamp an epic's AC list was reconciled against its children's delivered scope (#887).                                                                    |
| `aitm-unauthorized-close`  | single | Flags an issue closed outside the sanctioned `close` verb, for convergence recovery.                                                                         |
| `aitm-deep-dive-posted`    | single | See [Deep-Dive Marker Pair](#deep-dive-marker-pair) below.                                                                                                   |
| `aitm-deep-dive-complete`  | single | See [Deep-Dive Marker Pair](#deep-dive-marker-pair) below.                                                                                                   |
| `aitm-last-known-state`    | single | The board `state` this session/mutator last confirmed for the issue; read by `bound-state.mjs` and diffed for drift by `gh-edit-guard.mjs`.                  |
| `aitm-last-known-state-ts` | single | Timestamp companion to `aitm-last-known-state` (legacy colon grammar keeps this as a separate marker; the new property grammar folds both into one comment). |
| `aitm-entered-<stage>`     | multi  | Stage-entry audit trail, one per stage visited. See [`state-machine.md` → Entry markers](./state-machine.md#entry-markers).                                  |
| `aitm-session-ref`         | count  | Append-only provider-session chain. See "Session-Reference Chain" further down this page.                                                                    |
| `aitm-ac-struck`           | count  | Append-only record of an epic AC withdrawn from a child's delivered scope (#888).                                                                            |

## Deep-Dive Marker Pair

The Plan → Develop promotion arc refuses unless **all three** of the following
signals appear in the issue body:

| Signal                                       | Type            | What it means                                          |
| -------------------------------------------- | --------------- | ------------------------------------------------------ |
| `<!-- aitm-deep-dive-posted: <iso-ts> -->`   | hidden marker   | Deep-dive appendix has been written into the body.     |
| `## Deep-Dive Analysis` _(or H3)_            | visible heading | Deep-dive appendix exists at the documented placement. |
| `<!-- aitm-deep-dive-complete: <iso-ts> -->` | hidden marker   | Author has acknowledged the deep dive is complete.     |

The two markers + the heading form a three-signal check (see #297). Splitting
"posted" from "complete" makes a partially-authored deep dive fail loudly:
posting the appendix without explicitly marking it complete still blocks
promotion, so a draft deep dive cannot accidentally pass the gate.

### `aitm-deep-dive-posted`

- **Regex (reader):** `/<!--\s*aitm-deep-dive-posted:\s*[^>]*?-->/i` — defined
  in `scripts/task-tracker/lib/deep-dive-gate.mjs` (`POSTED_RE`).
- **Writer:** `ensureDeepDive` (`scripts/task-tracker/lib/deep-dive.mjs`). One
  transactional `mutateIssueBody` call that:
  1. Injects the marker immediately above a new `## Deep-Dive Analysis
(<yyyy-mm-dd>)` heading when `prose` is supplied; otherwise injects the
     marker above an existing heading. Refuses with
     `DeepDiveSectionMissingError` if `posted: true` is requested without
     `prose` AND the body has no heading.
  2. Splices the heading + prose AFTER the `## Pickup Directive`
     block and its trailing `---` separator (fallback: before the
     `aitm-fields` trailer).
  3. Returns `{ status: 'no-op' }` if the marker already exists (idempotent).
- **Reader:** `planDeepDiveGate({ body })` (`lib/deep-dive-gate.mjs`),
  delegating to `readDeepDiveSignals` in `lib/deep-dive.mjs`.
- **Gate failure code:** `plan-develop-deep-dive-posted-marker-missing`. The
  blocker string names `ensureDeepDive (scripts/task-tracker/lib/deep-dive.mjs)`
  as the canonical remediation.

### `aitm-deep-dive-complete`

- **Regex (reader):** `/<!--\s*aitm-deep-dive-complete:\s*[^>]*?-->/i`
  (`COMPLETE_RE`).
- **Writer:** `/task ensureChecked "Deep dive complete"`
  (`scripts/task-tracker/verbs/check.mjs`). This is the only writer in the
  codebase. #300 migrated this signal from the legacy `- [x] Deep dive
complete` checkbox to the hidden marker; `gh-edit-guard` refuses bodies
  that reintroduce the checkbox.
- **Reader:** `planDeepDiveGate({ body })`.
- **Gate failure code:** `plan-develop-deep-dive-complete-marker-missing`.
  The blocker string instructs the operator to run `/task ensureChecked "Deep dive
complete"` to stamp the marker.

## Why two markers instead of one

A single marker would conflate "the appendix exists" with "the appendix is
complete." That conflation broke the pre-#297 workflow: agents could write a
stub `## Deep-Dive Analysis` heading, leave the body otherwise empty, and
sail through the promote because no gate distinguished draft from final.

Splitting the signal:

- **`posted`** is mechanical — stamped by the tool that appends the prose
  (`ensureDeepDive`). Cannot be forgotten while the appendix lands.
- **`complete`** is intentional — stamped by an explicit `/task ensureChecked`
  invocation. Forces a beat where the author rereads what they just wrote.

The visible H2/H3 heading is the third signal so a stripped-down body
(markers without prose) is also refused.

## Operator workflow

```bash
# 1. Author the deep dive prose, then stamp posted + heading in one call.
node -e "
  import('./scripts/task-tracker/lib/deep-dive.mjs').then(({ ensureDeepDive }) =>
    ensureDeepDive({
      issueNumber: 294,
      repo: 'kburson/ai-task-manager',
      prose: 'Root cause: ...\\n### Files to edit\\n...\\n### Risks\\n...',
    }).then(console.log)
  );
"
# → { status: 'ok', attempts: 1, version: <N+1> }

# 2. Acknowledge completion (writes aitm-deep-dive-complete).
node scripts/task-tracker/task-tracker.mjs ensureChecked 294 "Deep dive complete"

# 3. Promote — now all three signals are present.
node scripts/task-tracker/task-tracker.mjs promote 294 develop --reason "..."
```

## Failure modes the gate catches

| Body state                                      | Refusal code                                                         | Fix                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Neither marker, no heading                      | All three blockers fire simultaneously.                              | Call `ensureDeepDive({ prose, complete: true })`, then `/task ensureChecked`.           |
| Posted marker only (no heading)                 | `section-missing`                                                    | Heading must be `## Deep-Dive Analysis` or `### …`; `ensureDeepDive` writes it for you. |
| Heading only (no posted marker)                 | `posted-marker-missing`                                              | Use `ensureDeepDive({ posted: true })` — do not hand-write the marker.                  |
| Posted + heading, no `/task ensureChecked` run  | `complete-marker-missing`                                            | `/task ensureChecked "Deep dive complete"`.                                             |
| Legacy `- [x] Deep dive complete` checkbox only | `complete-marker-missing` + `gh-edit-guard` refusal on future writes | Remove the checkbox; rely on the marker.                                                |

## Session-Reference Chain (`aitm-session-ref`) — #476

An **append-only** chain of markers records which provider session(s) worked the
story and where each session's JSONL transcript lives, so any timing-log row can
be traced back to the conversation that produced it.

```
<!-- aitm-session-ref sid="<session-id>" jsonl="<absolute path>" ts="<iso>" -->
```

- **Entry format.** Each entry carries the session id (`sid`), the on-disk
  transcript path (`jsonl`, from `jsonlPath(sid)`), and a timestamp (`ts`) of
  when that reference became active.
- **Append-only.** Entries accumulate in document order (just above the
  `aitm-fields` trailer). The **last** entry is the currently-active reference.
  Prior entries are never modified or removed — a mid-story session changeover is
  preserved as history, not overwritten.
- **When written.** On every timing-emitting verb, `runtime.mjs → flushActiveToGH`
  compares the live `sid`/`jsonl` against the most-recent entry. Normally a no-op
  sanity check; a new entry is appended only when either value changes (or on the
  first bind, when no entry yet exists). With no `sid` (remote/iOS) the check is
  skipped cleanly — no placeholder is written.
- **Going from an entry to the transcript.** Read the last `aitm-session-ref`
  marker; its `jsonl` path **is** the transcript file. Its `sid` is the session
  behind every timing-log row whose timestamp falls at or after that entry's `ts`
  (and before the next entry's `ts`, if any).
- **Invariants.** Registered in `body-invariants.mjs` as a `count`-kind marker
  (occurrence count must never decrease) and mirrored in `gh-edit-guard.mjs`, so
  `mutateIssueBody` and the bash backstop both flag a dropped prior entry.
- **Reader/writer:** `scripts/task-tracker/lib/session-ref.mjs`
  (`parseSessionRefs`, `mostRecentSessionRef`, `recordSessionRefOnChange`).
- **Cross-provider source (`#477`).** The `jsonl` path is provider-agnostic: it
  comes from `jsonlPath(sid)`, which delegates to the active adapter's
  declarative `transcriptLayout` via `providers/transcript-resolver.mjs`. No
  `if (claude)`/`if (codex)` branching exists in the recording path.
  - **Claude** (`transcriptLayout: 'flat'`): `~/.claude/projects/<projectKey>/<sid>.jsonl`.
    Deterministic without the file — recorded even before the transcript exists.
  - **Codex** (`transcriptLayout: 'date-bucketed'`): `CODEX_THREAD_ID` is the
    authoritative Desktop identity and precedes legacy `CODEX_SESSION_ID`.
    Transcripts live at
    `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<sid>.jsonl` (sid is the trailing
    thread ID; `payload.cwd` in line 1 records the project). The resolver
    searches the date buckets for the file whose basename ends `-<sid>.jsonl`.
  - **Degradation.** When a date-bucketed provider's transcript cannot be
    resolved (sid known but no rollout file yet on disk, or remote/iOS),
    `jsonlPath` returns `''` and a **sid-only** entry is written (`jsonl=""`) —
    never a placeholder or deterministic-but-wrong path. The word measurement
    separately reports `codex-session-unresolved`,
    `codex-transcript-unresolved`, or `codex-schema-unrecognized`; it never
    fabricates a successful zero measurement.
- **Codex Word Marker source (`#1092`).** Only authoritative Codex
  `response_item` records feed the three word tiers. Visible user/assistant
  message text and compact tool-call chips feed stay-abreast; expanded tool
  inputs and outputs feed full expansion. Developer/system messages, reasoning,
  `event_msg` mirrors, and Desktop context injections are excluded. These rules
  apply prospectively; historical Timing Log rows and prior session-reference
  markers are not rewritten.

## Related

- [`body-writes.md`](./body-writes.md) — `mutateIssueBody` contract,
  `aitm-body-version`, stale-input refusals.
- [`state-machine.md`](./state-machine.md#entry-markers) — entry markers per
  state, audit trail.
- `scripts/task-tracker/lib/deep-dive-gate.mjs` — the three-signal gate.
- `scripts/task-tracker/lib/deep-dive.mjs` — the `ensureDeepDive` writer and
  `readDeepDiveSignals` reader.
- `scripts/task-tracker/verbs/check.mjs` — the `aitm-deep-dive-complete`
  writer.
