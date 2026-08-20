# Tune Codex for Lower Token Burn on Long Unattended Runs

Use this when Codex Desktop will babysit a queue for hours and you are **not** reading the live chat. The goal is to cut billed tokens without dropping defect quality.

This guide is written for the **Codex Desktop Electron app** (the Dock / Applications icon, multiple chat windows, side chats, command drawers). You do not start Codex from a terminal. `codex --profile …` is a CLI flag and does not apply.

This guide is operator-local. The files you edit live under `~/.codex/` on the machine running the app, not in this repository. Do not commit those edits.

Related: [settings-guide.md](./settings-guide.md) (Codex bootstrap), [context-management-skill-architecture.md](../introduction/context-management-skill-architecture.md), [codex-local-worktree-environment.md](./codex-local-worktree-environment.md).

---

## What actually burns tokens

Codex does **not** re-bill the on-disk session file at full price on every tool call. Three different objects get confused:

| Object | What it is | What it costs |
|---|---|---|
| On-disk session JSONL | Append-only log under `~/.codex/sessions/` | Free. Local disk. |
| Live model window | Compacted prompt, capped by the model context (Sol ~258k–272k tokens) | Sent on **every model step**. |
| Prefix cache | Exact-prefix reuse of that live window | Matching prefix billed at the cached-input rate (~0.1×). New tail billed full price. |

A measured 18-hour Sol run on this machine (2026-08-19/20):

- Disk log: ~15 MB / ~523k content words / 793k raw `wc` words
- 1,659 model steps, 1,616 tool calls, 8 compactions
- 221M cumulative input tokens, **98.2% cached**, ~4.0M fresh
- Live window never exceeded ~234k tokens (compaction kept it there)
- Visible chat: 459 messages, **~20k words** — not the bill

The spend is **step count × live window**, not “600k words × every `cat`.” Cached tokens are cheap, not free. They still move the Codex weekly usage bar.

Compaction **resets the conversation prefix**. After each compact, the next step often drops to ~35–42% cache hit (only the ~11k static system/tools prefix remains), then warms again. Eight overnight compactions were eight full rewrites.

GPT-5.6 cache lifetime is 30 minutes, refreshed on reuse. Continuous tool looping stays hot. A pause can dump the cache.

### What does not save tokens

| Change | Effect |
|---|---|
| `hide_agent_reasoning = true` | Hides thinking in the UI. The model still thinks. Tokens still count. |
| Making chat glib | Modest. Overnight chat was ~20k words vs 221M input. |
| `personality = "none"` | Removes the personality block. The 60-second commentary cadence stays. |
| Switching effort mid-flight on a fat thread | Does not shrink the existing window. Adds a config change on top of it. |

### Do not starve defect work

`model_reasoning_effort` is thinking budget, not chat length.

- **High** — keep this for defect epics, blocking bugs, gate failures, cross-module contracts. Same model, larger thinking budget.
- **Medium** — everyday implementation and mechanical follow-through once the root cause is known.
- **Low** — Sol’s Codex catalog default. Fast, lighter. Not for assigned defects.

GPT-5.6-Sol + medium is a strong default for normal coding. It is the wrong cut for the #1263-class queue (spawned blockers, AITM gates, schema snapshots). Token-save that work with **shorter threads and less narration**, not by dropping High.

---

## Step 0 — Confirm which files you will edit

All of these are **outside the repo**:

| File | Role |
|---|---|
| `~/.codex/config.toml` | Model, effort, verbosity, personality, desktop UI. Top-level keys apply to new Desktop chat windows. |
| `~/.codex/AGENTS.md` | Global user instructions (this machine’s Codex). Currently may be empty. |
| `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | Append-only logs. Do not hand-edit. Measure only. |

Do **not** put an always-on “never narrate” rule in this repo’s `AGENTS.md`. AITM requires skill-load sentinels (`aitm-skill-loaded:…`) in the chat, and interactive sessions still need readable updates.

Open the config from the running app: **Settings → Codex Settings → Open config.toml**. That is the same file the Electron app already reads. You never need a terminal to launch Codex.

---

## Step 1 — Set Desktop defaults in `config.toml` (keep High)

The Desktop app applies **top-level** keys in `~/.codex/config.toml` to **new** chat windows. It does not expose CLI `--profile`. A `[profiles.unattended]` block is ignored unless you later start the CLI. Do not rely on it here.

Edit `~/.codex/config.toml` (from Settings as above). Keep the default on High if this machine’s main work is defects:

```toml
personality = "pragmatic"
model = "gpt-5.6-sol"
model_reasoning_effort = "high"
model_verbosity = "low"
model_reasoning_summary = "none"
```

`model_verbosity = "low"` is the Responses-API length control for visible output. Sol already defaults to low; set it so it cannot drift. This is **not** reasoning effort.

Optional UI-only (saves nothing, reduces visual noise):

```toml
hide_agent_reasoning = true
```

Desktop-only narration mode (this machine already has it). Lives under `[desktop]`:

```toml
[desktop]
conversationDetailMode = "STEPS_PROSE"
```

`STEPS_PROSE` is the less-prose step listing in the app. It does not cancel the model’s baked-in “comment at least every 60 seconds” rule. Step 2 overrides that.

Save the file. **New chat windows** pick this up. An already-running window keeps its current model/effort/personality until you change that window with slash commands (below) or you open a new window.

### Per-window controls (the message box, not a terminal)

The **composer** is the text field at the bottom of a chat window where you type a prompt and press Send. Slash commands (`/personality`, `/model`, `/status`) go there, same as any other message. It is not a terminal and not a config file.

Each chat **window** is its own thread and its own live token window. Side chats and subagent drawers are extra threads (extra JSONL, extra billed steps). The terminal/command drawer runs local shell; it is not a second model session unless you paste that output back into a chat.

Do this in the **message box of the window you want to tune**, not in a system Terminal.app:

1. New window or **New chat** in the sidebar. Do not keep typing into the 12-hour thread.
2. Before or with the first prompt, send these slash commands (own line, send, wait for the confirmation chip):

```text
/personality pragmatic
```

```text
/model
```

In the picker that opens: keep `gpt-5.6-sol`. Effort **High** for defects. **Medium** only for a mechanical babysit window (prettier, one test file, known one-line fix).

```text
/status
```

Confirm that **this** window shows Sol, the effort you intended, and remaining context. The other open windows are unchanged.

You can also use the thread header model/effort control if the app shows one. Same rule: change it on the new window, not on the fat one.

Do not drop High on a live defect window to “save tokens.” Open a new window if you need different settings.

---

## Step 2 — Override the 60-second commentary rule

GPT-5.6-Sol’s system prompt tells the model to send `commentary` before tools and to not go more than 60 seconds without a user update. Config verbosity does not cancel that. User instructions do.

Edit `~/.codex/AGENTS.md` (create it if empty). Add a **gated** block so interactive sessions stay readable:

```markdown
## Unattended / autonomous runs

Apply this section only when the user says "unattended", "babysit",
"Full-Auto", or pastes an unattended restart prompt. Ignore it for
interactive pairing.

The human is not reading live chat.

- Do not narrate tool-by-tool.
- Do not send status every 30–60 seconds.
- Commentary only when: blocked, a decision is required, or the turn is done.
- Keep AITM skill-load sentinels (`aitm-skill-loaded:…`) and the
  post-compact boot lines. Those are workflow, not narration.
- Final answers: outcome, files touched, tests run, blocker. Five lines max.
- Do not recap skills, plans, or files just read.
```

Save. This applies to **new** Codex threads on this machine.

Repo `AGENTS.md` stays the AITM/Superpowers bootstrap. Do not merge the silence rule into it.

---

## Step 3 — Cut the live window: one issue, one thread

The 12-hour JSONL is not the prompt. The compacted window is. A restart still refilled **~225k live tokens in ~40 minutes** because it reloaded skills, the worktree, issue bodies, and tool output.

Do this instead of one marathon:

1. In the current chat **window**, pause at a safe checkpoint (no half-written patch, worktree clean or committed).
2. Ask that window for a **restart prompt** (copy-paste block in Step 4).
3. Open a **new chat window** (or New chat) on the same project. Do not reuse the old window. Do not put the restart into a side chat of the old window — that is another live context sitting on top of the fat parent.
4. Paste the restart prompt as the first composer message in the **new** window, with the unattended stanza and `/personality pragmatic`.
5. Leave the old window paused. Close it or ignore it. Do not send more work there.

Split at issue boundaries, not after 12 hours. Child `#N` done → new **window** for `#N+1`. Subagents and side chats already get their own JSONL files; the parent window still accumulates their reports — another reason not to babysit an epic in one window.

`/compact` in the composer shrinks the prompt **and** busts the prefix cache. Use it when the window is rotten, not as a periodic saver. Prefer a new window with a restart prompt.

---

## Step 4 — First composer message in a new Desktop window

Paste this as the **first user message** in a **new chat window**. Fill the placeholders. Keep High for defect work. Send it from that window’s composer; do not type it in a terminal.

```text
Unattended babysit. I am not reading live chat.

Apply ~/.codex/AGENTS.md "Unattended / autonomous runs":
no tool-by-tool narration, no 30–60s status, commentary only on
block / decision / turn-complete. Keep AITM sentinels.

/personality pragmatic

Continue driving issue #<N> in Full-Auto.
Do not start #<blocked-issue>. Skip #<excluded-issue>.

Worktree:
<absolute path>

Branch:
<branch>

Safe checkpoint:
- <closed issues / merged PRs>
- <current state of #N>
- <blockers and rank order>
- HEAD: <sha>
- No implementation started on <paused child> (if true)

Rules:
- One issue at a time, deepest blocker first.
- Do not drop reasoning effort below High on defect / gate work.
- Stop and write a fresh restart prompt if you compact more than twice
  or the live window is exhausted.
```

For **mechanical** follow-through only (formatter, one failing test, known one-line fix), add:

```text
This turn is mechanical. Use medium reasoning effort.
```

Then in **that** window send `/model` and pick Medium. Do not change the defect window’s effort.

Do not put `/personality` and a 2,000-word dump of the old transcript in the same prompt. The restart prompt should be a checkpoint, not the 12-hour log.

---

## Step 5 — Measure the running thread (JSONL is not `wc`)

Session files are append-only JSONL. `wc -w` counts keys, timestamps, and punctuation. Editors often fail while the file is still being written.

**Find the live file**

```bash
ls -lt ~/.codex/sessions/$(date +%Y/%m/%d)/rollout-*.jsonl | head
ls -lt ~/.codex/thread-writer-locks/*.lock | head
```

The lock named `01a0…lock` matches `rollout-…-01a0….jsonl`. Subagent threads are separate, smaller files with no user message.

**Word and token snapshot** (safe to run while Codex is writing):

```bash
python3 - <<'PY'
import json, time
from pathlib import Path
from collections import Counter

# Paste the rollout path you care about:
p = Path.home() / "codex/sessions/YYYY/MM/DD/rollout-….jsonl"
# Example:
# p = Path("/Users/you/.codex/sessions/2026/08/20/rollout-2026-08-20T07-02-29-01a01f0d-21c3-7572-b3db-9a7a77bef773.jsonl")

raw_words = 0
with p.open("rb") as f:
    for chunk in iter(lambda: f.read(1 << 20), b""):
        raw_words += len(chunk.split())

n_lines = n_bad = 0
first_user = last_agent = None
words_user = words_agent = 0
last_usage = total_usage = None
event_types = Counter()
first_ts = last_ts = None

with p.open(errors="replace") as f:
    for line in f:
        n_lines += 1
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            n_bad += 1
            continue
        ts = obj.get("timestamp")
        if ts:
            first_ts = first_ts or ts
            last_ts = ts
        payload = obj.get("payload") or {}
        if obj.get("type") != "event_msg":
            continue
        et = payload.get("type")
        event_types[et] += 1
        if et == "user_message":
            m = payload.get("message") or ""
            first_user = first_user or m
            words_user += len(m.split())
        elif et == "agent_message":
            m = payload.get("message") or ""
            last_agent = m
            words_agent += len(m.split())
        elif et == "token_count":
            info = payload.get("info") or {}
            last_usage = info.get("last_token_usage") or last_usage
            total_usage = info.get("total_token_usage") or total_usage

print("file", p)
print("bytes", p.stat().st_size, "mtime", time.strftime("%H:%M:%S", time.localtime(p.stat().st_mtime)))
print("lines", n_lines, "bad_json_lines", n_bad)
print("raw wc-words", raw_words)
print("span", first_ts, "->", last_ts)
print("user_words", words_user, "agent_chat_words", words_agent)
print("events", event_types.most_common(8))
print("last_step", last_usage)
print("cumulative", total_usage)
print("first_user_head:")
print((first_user or "")[:500])
PY
```

Read:

- `last_step.input_tokens` — live window **now** (this is the prompt)
- `last_step.cached_input_tokens / input_tokens` — cache hit this step (healthy unattended is ~99% between compactions)
- `cumulative.input_tokens` — counted input across the thread (mostly cached)
- `agent_chat_words` — narration. If this climbs like a novel, Step 2 did not take.

A restart that is “small on disk” (1–2 MB) can still have `input_tokens` ≈ 220k. That is a full window. Pause and split.

---

## Step 6 — Checklist before leaving it overnight

Do these in order. Skip any that would drop High on a live defect thread.

1. `~/.codex/config.toml` has `personality = "pragmatic"`, `model_verbosity = "low"`, `model_reasoning_summary = "none"`, and top-level `model_reasoning_effort = "high"` for defect work. Opened from **Settings → Open config.toml**, not a CLI profile.
2. `~/.codex/AGENTS.md` has the gated unattended block.
3. You opened a **new chat window**. The 12-hour window is paused and idle.
4. First composer message in the new window is the Step 4 restart prompt, not the old transcript. `/personality pragmatic` is in that message or already sent.
5. In that same window, `/status` shows Sol + High (defects) or Medium (mechanical only).
6. Worktree path, branch, HEAD, and “do not start #X” are in that first message.
7. Side chats / drawers are not a second copy of the epic. Use them for a bounded subtask or local commands, then come back to the new window.
8. Next issue boundary → another new window, not `/compact` in the same window for hours.

---

## Quick reference

| Want | Do | Where |
|---|---|---|
| Shorter visible chat | `model_verbosity = "low"` + gated `AGENTS.md` block | `~/.codex/config.toml` (Settings → Open config.toml), `~/.codex/AGENTS.md` |
| Terse personality | `personality = "pragmatic"` in config, and `/personality pragmatic` in the new window’s composer | config + composer |
| Mechanical babysit | New window, then `/model` → Medium | that window only |
| Defect epic | Keep High. New **window** per child. Restart prompt in that composer. | Desktop |
| Hide thinking in the UI | `hide_agent_reasoning = true` | config (no token save) |
| See this window’s cost | `/status` in that composer, plus the JSONL snapshot | Step 5 |
| Kill a 12-hour window | Pause it → restart prompt → **new chat window** | do not `/compact` as the only move |
| CLI `--profile` | Not used. Desktop ignores it. | — |
