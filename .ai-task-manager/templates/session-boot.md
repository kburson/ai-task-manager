<!-- aitm-doc: session-boot v1 -->

# Session Boot Index

Ordered context-reload contract for ai-task-manager sessions. Read this file
**before any verb** if the current session was just started, `Clear`-ed, or
`Compact`-ed. Compacted summaries are **not** a substitute for the source-of-
truth files listed here — a paraphrase of a rule is not the same as the rule.

## Tier 0 — Always live

These files are loaded automatically by the host (Claude Code / Copilot CLI /
Gemini CLI) at session start. You do not need to re-read them on every turn,
but you must trust the on-disk copy over any compacted paraphrase.

- `~/.claude/CLAUDE.md` — global user instructions
- `./CLAUDE.md` — project instructions (behavior, workflow, tool rules)

## Tier 1 — Required on bind

Re-read these in order whenever you bind (or rebind) to an issue, after every
`Clear`, and after every `Compact`. These are the files whose enforceability
degrades when summarized.

1. `skill/shared/router.md` — Tier-1 router: hard rules + verb → rule routing table
2. `.ai-task-manager/templates/pickup-directive.md` — per-issue pickup contract
3. `.ai-task-manager/task-tracker.json` — project preferences + per-issue config
4. `gh issue view <N>` — the active issue body (deep-dive + ACs + DoD)

## Tier 2 — JIT on verb

Loaded by the router on demand for the verb you are about to run. You do not
need to pre-load these — the router will pull them in.

- `skill/shared/rules/<verb>.md` for `bind`, `refine`, `plan`, `develop`,
  `test`, `review`, `done`, `close`, `parallel`, etc.

## Recovery protocol (post-Compact / post-Clear)

If the current context shows a compaction or summary banner — for example, a
message that begins `"This session is being continued from a previous
conversation"` or any equivalent fresh-session preamble — do the following
**before** any tool call other than reading the files below:

1. Discard any prior `aitm-skill-loaded:*` sentinels in the conversation;
   treat them as expired.
2. Re-read every Tier-1 file in the order above. Use the Read tool, not a
   paraphrase from memory.
3. Re-emit fresh `aitm-skill-loaded:<id>:<version>` sentinels for any skill
   files you reloaded.
4. Emit a one-shot `aitm-boot-recovered:<session-id>:<timestamp>` sentinel.
   Subsequent turns in the same session can detect this sentinel and skip
   the reload until the next `Clear` / `Compact`.

If no compaction banner is present and an `aitm-boot-recovered:*` sentinel
already appears in the live context, the boot has already happened — do not
reload.

## When to Compact vs Clear vs Restart

- **Compact** when continuing the same task and a current session-state
  artifact (see `session-state-template.md`) exists. Compaction preserves the
  narrative; the state file preserves the structure.
- **Clear** when the live context is stale, noisy, contradictory, or above
  the reliability threshold (rules being missed, repeated re-derivation of
  known facts).
- **Restart from state** (new fresh session) when even `Clear` would leave
  you with a degraded mental model — e.g. handing the task off to a parallel
  worker, or returning after a long break.

In all three cases, the next step is the same: follow this boot index.

## Practical thresholds

- Keep active context small where possible. Prefer pointer files
  (`router.md`, `session-boot.md`) over inlining their content.
- Compact around sustained medium-large sessions (long deep-dive +
  implementation arcs). Don't compact in the middle of a verb transition.
- Prefer Clear/reload when transcript becomes noisy: many failed tool
  calls, contradictory edits, repeated rule re-statements.
- Compacted summaries are hints, **not** authoritative configuration.
  Source-of-truth lives on disk.

## Verification

A fresh session can confirm the boot index is consistent with the repo:

```sh
for f in \
  skill/shared/router.md \
  .ai-task-manager/templates/pickup-directive.md \
  .ai-task-manager/task-tracker.json
do
  test -e "$f" && echo "ok: $f" || echo "MISSING: $f"
done
```

If any line prints `MISSING:`, the boot index is out of sync — fix the
index or restore the file before continuing.
