# Issue-Body Markers

Hidden HTML-comment markers (`<!-- aitm-<name>: <value> -->`) are the canonical
state record for an issue. They are invisible in rendered GitHub Markdown but
parseable from the raw body string. The state machine reads them; gates write
them; humans rarely interact with them directly.

This page catalogues the **Deep-Dive Analysis** marker pair introduced by
issues `#297` / `#300` / `#294`. For the body-version + write-contract markers
(`aitm-body-version`, `aitm-fields`) see [`body-writes.md`](./body-writes.md).
For the state-transition entry markers (`aitm-entered-*`) see
[`state-machine.md`](./state-machine.md).

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
- **Writer:** `/task check "Deep dive complete"`
  (`scripts/task-tracker/verbs/check.mjs`). This is the only writer in the
  codebase. #300 migrated this signal from the legacy `- [x] Deep dive
complete` checkbox to the hidden marker; `gh-edit-guard` refuses bodies
  that reintroduce the checkbox.
- **Reader:** `planDeepDiveGate({ body })`.
- **Gate failure code:** `plan-develop-deep-dive-complete-marker-missing`.
  The blocker string instructs the operator to run `/task check "Deep dive
complete"` to stamp the marker.

## Why two markers instead of one

A single marker would conflate "the appendix exists" with "the appendix is
complete." That conflation broke the pre-#297 workflow: agents could write a
stub `## Deep-Dive Analysis` heading, leave the body otherwise empty, and
sail through the promote because no gate distinguished draft from final.

Splitting the signal:

- **`posted`** is mechanical — stamped by the tool that appends the prose
  (`ensureDeepDive`). Cannot be forgotten while the appendix lands.
- **`complete`** is intentional — stamped by an explicit `/task check`
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
node scripts/task-tracker/task-tracker.mjs check 294 "Deep dive complete"

# 3. Promote — now all three signals are present.
node scripts/task-tracker/task-tracker.mjs promote 294 develop --reason "..."
```

## Failure modes the gate catches

| Body state                                      | Refusal code                                                         | Fix                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Neither marker, no heading                      | All three blockers fire simultaneously.                              | Call `ensureDeepDive({ prose, complete: true })`, then `/task check`.                   |
| Posted marker only (no heading)                 | `section-missing`                                                    | Heading must be `## Deep-Dive Analysis` or `### …`; `ensureDeepDive` writes it for you. |
| Heading only (no posted marker)                 | `posted-marker-missing`                                              | Use `ensureDeepDive({ posted: true })` — do not hand-write the marker.                  |
| Posted + heading, no `/task check` run          | `complete-marker-missing`                                            | `/task check "Deep dive complete"`.                                                     |
| Legacy `- [x] Deep dive complete` checkbox only | `complete-marker-missing` + `gh-edit-guard` refusal on future writes | Remove the checkbox; rely on the marker.                                                |

## Session-Reference Chain (`aitm-session-ref`) — #476

An **append-only** chain of markers records which Claude Code session(s) worked
the story and where each session's JSONL transcript lives, so any timing-log row
can be traced back to the conversation that produced it.

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
  - **Codex** (`transcriptLayout: 'date-bucketed'`): transcripts live at
    `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<sid>.jsonl` (sid is the trailing
    UUID; `payload.cwd` in line 1 records the project). The resolver searches
    the date buckets for the file whose basename ends `-<sid>.jsonl`.
  - **Degradation.** When a date-bucketed provider's transcript cannot be
    resolved (sid known from `CODEX_SESSION_ID` but no rollout file yet on disk,
    or remote/iOS), `jsonlPath` returns `''` and a **sid-only** entry is written
    (`jsonl=""`) — never a placeholder or deterministic-but-wrong path.

## Related

- [`body-writes.md`](./body-writes.md) — `mutateIssueBody` contract,
  `aitm-body-version`, stale-input refusals.
- [`state-machine.md`](./state-machine.md) — entry markers per state, audit
  trail.
- `scripts/task-tracker/lib/deep-dive-gate.mjs` — the three-signal gate.
- `scripts/task-tracker/lib/deep-dive.mjs` — the `ensureDeepDive` writer and
  `readDeepDiveSignals` reader.
- `scripts/task-tracker/verbs/check.mjs` — the `aitm-deep-dive-complete`
  writer.
