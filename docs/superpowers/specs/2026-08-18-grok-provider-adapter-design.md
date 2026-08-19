# Grok Provider Adapter Design

**Date:** 2026-08-18
**Status:** Draft pending operator review (conversation-approved sections 1–5)
**Issue:** none yet — do not commit this spec until a `[#N]` issue exists
**Surface:** `npx ai-task-manager install`, provider registry, `/task` under Grok Build TUI

## Problem

AITM’s workflow core (states, gates, evidence, timing) is host-agnostic. Hosts plug
in through `scripts/providers/` plus a thin `skill/adapters/<host>/SKILL.md`. Only
Claude and Codex are registered.

Grok Build TUI is already a hook-capable coding host. In this repo it loads the
Codex task stub from `.agents/skills/task` because Grok scans `.agents/skills/`.
`detectProvider()` does not know `GROK_SESSION_ID`, so the process is classified
as Claude. Word-count looks under Claude’s flat `~/.claude/projects/...` layout
and misses Grok’s `~/.grok/sessions/<urlencoded-cwd>/<sid>/chat_history.jsonl`.
`.codex/hooks.json` is not a Grok hook source. Claude hook compat may fire some
guards if `.claude/settings.json` is trusted, but session-ref and timing are wrong.

There is no Grok string in the codebase and no Grok card on project 11.

## Goals

1. Grok is a first-class host at Codex parity: registry row, skill, hooks,
   detection, transcripts, installer target.
2. Default install writes **every known provider**. Installed files are inert
   until that host opens the folder and runs commands.
3. Several hosts may live in one repo. Development uses one worktree per
   editing provider. One issue has at most one bound session.
4. Same worktree is allowed only for co-review: one author edits tracked files;
   reviewers write only the named review artifact.
5. Assignment policy stays `#1212`: unassigned through Plan; singleton assignee
   required before Plan → Develop and before tracked code changes.

## Non-goals

- GitHub-native work leases (`#1048`).
- Changing `#1212` (no assign-at-Refine gate).
- Grok statusline.
- Superpowers bootstrap for Grok (Claude-compat skill scan already loads them).
- Provider uninstall.
- Word-count from `updates.jsonl`, `events.jsonl`, or encrypted reasoning.
- Mutating `~/.grok/config.toml`.
- Keeping `--agent both`.

## Constraints

- Provider adapters stay pure data modules. Call sites loop `listProviders()`;
  no new `if (name === 'grok')` ladders in `bin/cli.mjs`.
- Install is idempotent and additive. Re-running a host refreshes stubs, hooks,
  and version stamps. It does not duplicate hook entries. Installing a subset
  does not delete other hosts.
- The package is unpublished; there is no backward-compat duty to `--agent both`.
- Project `.grok/config.toml` cannot disable `compat.claude.hooks` (user-global
  only). Double-fire of Claude settings + `.grok/hooks` is expected unless the
  operator turns compat off. Timing must stay correct anyway.
- Project `.grok/hooks` require folder trust (`/hooks-trust` or `--trust`).
- Commits that land this work use a `[#N]` subject token. This spec file is not
  committed until that issue exists.
- Develop-phase verification is `node scripts/task-tracker/verify-develop.mjs`,
  not `npm run test:all`.

## Considered approaches

### A — Third hardcoded host

Copy `installCodex` to `installGrok`, add `--agent grok|all`, detect
`GROK_SESSION_ID`, teach the word-counter a Grok path. Exclusive bind only when
the process is Grok.

Rejected: fights “install all known providers” and “one issue, one provider.”

### B — Registry-driven host + local exclusive bind (selected)

`install` loops `listProviders()`. Grok is one new row. Exclusive bind and
co-review write rules are core, main-worktree-anchored, host-agnostic. Local
only; `#1048` remains the cross-clone lease.

### C — GitHub lease in this epic

Same Grok module as B, but occupancy is a `#1048` comment/field lease from day
one.

Rejected: pulls the unfinished authority epic into the first Grok ship.

## Architecture

```text
npx ai-task-manager install [--agent <names>]
  -> listProviders() (or the requested subset)
  -> each adapter.install(targetDir, ctx)
       skill stub + host hook file + version stamp

live Grok session
  -> GROK_SESSION_ID / GROK_AGENT
  -> detectProvider() === grok
  -> skill: .grok/skills/task -> skill/adapters/grok/SKILL.md
       -> skill/shared/router.md
  -> hooks: .grok/hooks/aitm.json
       -> seed-check, hook-handler (idempotent), guards
  -> transcripts: $GROK_HOME/sessions/<encodeURIComponent(cwd)>/<sid>/chat_history.jsonl
  -> occupancy: .tmp/aitm/fleet/ (main-worktree-anchored)
```

Hosts are support modules. Writing `.grok/` into a consumer repo does not start
Grok. Claude, Codex, and Grok files may coexist. Only the host that actually
runs a process binds work.

## Section 1 — Registry and install

### Grok adapter row

`scripts/providers/grok.mjs` (pure data):

| Field | Value |
|---|---|
| `name` | `grok` |
| `installTarget` | `.grok/skills/task` |
| `skillAdapterPath` | `skill/adapters/grok/SKILL.md` |
| `stateDir` | `.tmp/aitm/app/grok` |
| `transcriptLocator` | `sessions` (relative to Grok home, not `homedir()`) |
| `transcriptHomeEnv` | `GROK_HOME` |
| `transcriptHomeDefault` | `.grok` (joined to `homedir()` when the env var is unset) |
| `transcriptLayout` | `cwd-session-dir` (new) |
| `transcriptSchema` | `grok-chat-v1` (new) |
| `sessionIdEnvKeys` | `['GROK_SESSION_ID']` |
| `detectionEnvKeys` | `['GROK_SESSION_ID', 'GROK_AGENT']` |
| `hookCapability` | `true` |
| hook file | `.grok/hooks/aitm.json` (declared on the adapter) |

Detection order: **grok → codex → claude**. Claude remains the no-signal
fallback. A live Grok TUI always exports `GROK_SESSION_ID`.

Each adapter exposes an install recipe (skill stub writer + hook writer) so
`bin/cli.mjs` does not switch on host names. Claude still writes
`.claude/settings.json` and `.claude/commands/task.md`. Codex still writes
`.codex/hooks.json`. Grok writes `.grok/skills/task/SKILL.md` and
`.grok/hooks/aitm.json`.

### Skill

Thin adapter, Codex pattern: load-once sentinel, then `skill/shared/router.md`.
Host-only notes:

- `/task` is a native Grok skill slash command (`user-invocable: true`).
- Hooks live under `.grok/hooks`.
- Do not assume `.codex/hooks.json` is loaded.

`.grok/skills/task` outranks `.agents/skills/task` in Grok discovery, so this
repo stops treating Grok as Codex.

### Install API

| Invocation | Effect |
|---|---|
| no `--agent` / `--agent all` | every registered provider |
| `--agent grok` | Grok only (additive) |
| `--agent claude,grok` or repeated `--agent` | that subset (additive) |

Rules:

- **No `--agent both`.** Unknown names list `listProviders()` and exit non-zero.
- **Additive, not replace.** `--agent grok` on a repo that already has Claude
  does not remove Claude. A later default `install` fills missing hosts.
- **Idempotent.** Second install of the same host does not duplicate hook
  blocks. Patch by command-string identity.

## Section 2 — Detection, transcripts, word-count

**Session id.** `resolveSessionId` already walks the active provider’s
`sessionIdEnvKeys`. After Grok is registered, bind, fleet, and the word-counter
share `GROK_SESSION_ID`. Override remains `AI_TASK_MANAGER_SESSION_ID`. Missing
env still falls back to `default-session`.

**Home.** Grok’s session tree is `$GROK_HOME/sessions`, and `GROK_HOME` defaults
to `~/.grok`. Do **not** join `homedir()` + `.grok/sessions` when `GROK_HOME` is
set — that would resolve `~/.grok/.grok/sessions`. Claude/Codex keep
`homedir() + transcriptLocator`. Grok declares `transcriptHomeEnv` /
`transcriptHomeDefault` so the resolver computes:

```text
grokHome = env.GROK_HOME || join(homedir(), adapter.transcriptHomeDefault)
root     = join(grokHome, adapter.transcriptLocator)   # .../sessions
```

**Layout `cwd-session-dir`.** On disk:

```text
<GROK_HOME>/sessions/<encodeURIComponent(cwd)>/<sid>/chat_history.jsonl
```

This is not AITM’s dash-flattened `projectKey()`. `resolveTranscriptPath`
implements the third layout: return the path if `chat_history.jsonl` exists,
else `null` (Codex `#477` rule: sid-only session-ref, no placeholder path).

`word-counter.jsonlPath` must call the resolver for **any** non-flat layout, not
only `date-bucketed`. The `transcriptDir() + projectKey()` Claude fallback must
not run for Grok.

**Schema `grok-chat-v1`.** Count `chat_history.jsonl` only. `updates.jsonl` is
the ACP resume stream (chunks, hook executions) and would double-count.

| `type` | Count? |
|---|---|
| `user` | yes — string or `[{type:"text", text}]` |
| `assistant` | yes — same; `tool_calls` become tool-chip events, no body double-count |
| `tool_result` | tool-result text |
| `reasoning` | no — `encrypted_content` only |
| `system` | no — same as Codex skipping `system`/`developer` |

`normalizeTranscriptRecord` stays filesystem-free. Claude envelopes keep
`message.content`. Grok puts `content` on the record. Discriminate on shape
(`message` present → Claude; else Grok `user`/`assistant`/`tool_result` /
`reasoning`/`system`). Unknown records return `{ events: [], recognized: false }`
and do not throw.

Sid present and file not yet created: count `0`, keep the sid. Do not fall back
to `~/.claude/projects`.

## Section 3 — Hooks and double-fire

Grok install writes **one** project file: `.grok/hooks/aitm.json` (Codex JSON
shape).

| Event | Matcher | Commands |
|---|---|---|
| `SessionStart` | `startup\|resume\|clear\|compact` | worktree seed check first, then `hook-handler.mjs`, optional `memory-index.mjs` |
| `PreCompact` / `PostCompact` | `manual\|auto` | `hook-handler.mjs` (+ memory-index on PostCompact when seeds exist) |
| `PreToolUse` | `Bash` | `bash-guard.mjs`, `activity-guard.mjs` |
| `PreToolUse` | `Edit\|Write\|NotebookEdit\|search_replace\|write` | `source-edit-gate.mjs`, `activity-guard.mjs` |
| `PreToolUse` | `Agent\|Task\|spawn_subagent` | `agent-guard.mjs` |

Grok aliases `Bash` → `run_terminal_command` and `Edit`/`Write` →
`search_replace`. Native names are listed so a missing alias still matches.
Command strings are the existing `node -e` entrypoints. Install patches by
command-string identity.

Project hooks run only if the folder is trusted. AITM does not install into
`~/.grok/hooks`.

Default Grok also loads `.claude/settings.json` when `compat.claude.hooks` is
true. We do not write `~/.grok/config.toml`. PreToolUse guards may run twice
(allow/deny). `hook-handler.mjs` must not flush timing twice.

**Idempotency** applies only to `hook-handler.mjs` on SessionStart / PreCompact /
PostCompact:

- Key: `(sid, hookEventName, promptId or "session", event timestamp)`
- Stamp: atomic create under `.tmp/aitm/locks/` (main-worktree-anchored)
- First handler flushes; a second handler with the same key exits 0
- A later compact/resume has a new timestamp and runs

This is not “SessionStart once per session forever.”

Seed-check and memory-index may run twice. Guards stay fail-closed on a missing
entrypoint (`exit 2`). Grok treats `exit 2` as deny; other crashes fail-open.

`--agent grok` still writes `.grok/hooks/aitm.json`. No Claude files means no
double-fire; the stamp is still present.

## Section 4 — Exclusive bind and co-review

Host-agnostic, fail-closed:

1. **One issue → one bound session.** `/task start`, `resume`, and `#N` refuse
   if another session already holds `#N`.
2. **One worktree → one editing provider**, except an active co-review.

**Store.** One main-worktree-anchored file beside fleet:
`.tmp/aitm/fleet/occupancy.json`. Shape: a JSON object keyed by issue number.
Each value is
`{ issue, sid, provider, worktreePath, boundAt, lastHeartbeatAt }`.
Heartbeat from `hook-handler` on SessionStart and from `/task update`.

**Bind.**

- `#N` held by another `sid` → refuse; print provider, worktree, sid prefix.
- This worktree already has a bound session from a different `sid`/`provider`
  and there is no active co-review for this tree → refuse (use a worktree).
- Same session re-binding `#N` is idempotent.
- Switching `#N` → `#M` in one session moves occupancy and releases `#N`.

**Release.** `/task stop` and `/task close` release. **`/task pause` does not.**
Handoff is explicit: stop, then the other host starts.

**Stale.** No silent TTL steal. Recovery is `/task occupancy --release #N` (or
`stop` from the owning session). `--steal` is out of v1.

**Co-review.** Two providers may share a worktree only when `npx aitm co-review`
has an active session for that tree.

- The **author** is the only session that may be **bound** to the issue.
- **Reviewers** do not `/task start #N`. If they try while the author holds it,
  exclusive bind refuses.
- Author edits tracked files under the existing source-edit-gate (Develop+,
  deep-dive, `#1212` assignee).
- Reviewer is unbound. `source-edit-gate` allows only the named co-review
  review file plus the existing `.tmp/**` allowlist. Tracked source, tests, and
  issue bodies stay denied.
- Co-review `--owner` / `--reviewer` remain caller-supplied identity strings,
  not GitHub assignees and not provider names.

**Cross-machine.** Different GitHub users are already stopped by `#1212` once
the card is in Develop. The same login on two clones is not visible to local
occupancy. That gap stays `#1048`. No new git-push identity check. Issue-mutating
verbs keep using `ownership-policy.mjs`.

## Section 5 — Tests, docs, epic shape

### v1 in / out

In: Grok registry host; default install-all; idempotent subset `--agent`;
exclusive occupancy; co-review reviewer write gate.

Out: listed under Non-goals.

### Tests

Synthetic fixtures only. Do not read live `~/.grok/sessions`.

| Area | Pins |
|---|---|
| Registry | `getProvider('grok')`; `listProviders()` includes `grok`; detect `GROK_SESSION_ID` / `GROK_AGENT`; unknown name throws |
| Install | no flag → all hosts; `--agent grok`; `--agent claude,grok`; second run does not duplicate hooks; subset does not delete other hosts; no `both` token |
| Transcripts | `cwd-session-dir` resolves `encodeURIComponent(cwd)/sid/chat_history.jsonl`; missing file → `null`; counts user/assistant/tool_result; skips reasoning/system |
| Hooks | same `(sid, event, promptId, ts)` second call is a no-op; later ts still flushes |
| Occupancy | second sid cannot bind `#N`; pause holds; stop releases; second provider in the same worktree refused unless co-review; reviewer `/task start` refused; reviewer write to the named review file allowed; tracked source denied |

Develop verification: `node scripts/task-tracker/verify-develop.mjs`.

### Docs

- README install table: default all, `--agent <name>[,name]`, no `both`.
- Short Grok subsection: `/hooks-trust`, occupancy, unbound reviewers.
- Workflow guide: one issue / one session, worktree isolation, pause holds bind.
- `DESIGN.md` provider list; adapter file; registry comments.

### Board shape

XL epic, no parent, two children:

1. **Grok provider module** — registry row, install-all loop, skill, hooks,
   detection, transcripts, install/Grok docs. Ship first so this TUI can
   `/task` as Grok with honest word-count.
2. **Occupancy + co-review write gate** — host-agnostic bind store,
   start/resume/stop, source-edit-gate reviewer path, occupancy docs.

Until child 2 lands, dogfood stays one host per worktree by convention.

### Operator-visible errors

- Unknown `--agent` lists registered names.
- Occupancy refuse names the holder (provider, worktree, sid prefix).
- Missing Grok transcript: silent zero words + sid-only session-ref, no throw.
- Untrusted `.grok/hooks`: Grok skips them; docs say `/hooks-trust`.

## Error handling (cross-cutting)

- Normalizer never throws on malformed JSONL lines; skip and continue.
- Hook-handler stamp create is atomic (`O_EXCL` or write-tmp-rename of a
  sentinel). If the stamp cannot be written, fail closed for the flush (do not
  double-post); print a diagnostic on stderr.
- Occupancy writes use the existing fleet lock directory.
- `detectProvider` with both Grok and Codex env set prefers Grok because Grok
  is first in registration order.

## Implementation order

1. Registry row + `listProviders()`-driven install API + Grok skill stub.
2. `.grok/hooks/aitm.json` + hook-handler idempotency.
3. `cwd-session-dir` + `grok-chat-v1` + `jsonlPath` dispatch.
4. Occupancy store + bind/refuse/release (child 2).
5. source-edit-gate co-review reviewer path (child 2).
6. Docs.

Child 1 is steps 1–3 and 6 (install/Grok docs). Child 2 is steps 4–5 and
occupancy docs.

## Success criteria

- In a trusted Grok session in this repo, `detectProvider()` is `grok`,
  `/task` loads `skill/adapters/grok/SKILL.md`, and word-count reads this
  session’s `chat_history.jsonl`.
- `npx ai-task-manager install` with no flags writes Claude, Codex, and Grok
  files. A second run does not duplicate hooks.
- Two sessions cannot bind the same issue. Pause keeps the bind. Stop releases
  it.
- A co-review reviewer cannot edit tracked source and cannot bind the author’s
  issue.
- `#1212` and `#1048` are unchanged.
