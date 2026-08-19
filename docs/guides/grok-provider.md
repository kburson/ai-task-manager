# Grok Provider

AI Task Manager supports Grok as a first-class provider alongside Claude Code and Codex. The adapter installs a project-local task skill, native project hooks, required session identity, and transcript-based word counting without writing global Grok configuration.

## Install

The default install includes every registered provider:

```bash
npx ai-task-manager install
```

Install Grok alone or as part of an additive subset:

```bash
npx ai-task-manager install --agent grok
npx ai-task-manager install --agent claude,grok
npx ai-task-manager install --agent grok --agent codex
```

`--agent both` is not supported. Use explicit names or `--agent all`. A subset install preserves Claude and Codex files byte-for-byte when those providers are not selected.

The Grok install writes these project-local files:

- `.grok/skills/task/SKILL.md`
- `.grok/hooks/aitm.json`

AITM does not write `~/.grok/config.toml` or global `~/.grok/hooks` entries.

## Trust the project hooks

Grok runs project hooks only for a trusted folder. Review the repository, then trust it with Grok's `/hooks-trust` command or launch the trusted workspace with `--trust`, according to the Grok client you use.

The native hook file is `.grok/hooks/aitm.json`. Its commands route through `grok-wire.mjs`, which converts Grok's native envelope into the shared AITM hook shape. The bridge also converts an AITM `block` result into Grok's native `deny` result and exit status.

Grok may also load Claude-compatible hooks when that compatibility setting is enabled. Native and compatibility hooks can therefore fire twice. AITM deduplicates SessionStart, PreCompact, and PostCompact timing work by normalized session, event, prompt, and timestamp identity; later events still run.

## Session identity

Grok requires a real `GROK_SESSION_ID` in the tool environment. `AI_TASK_MANAGER_SESSION_ID` remains an explicit orchestrator override. If neither value is present, AITM refuses bind, occupancy, and word-count operations instead of using `default-session`, a Claude/Codex id, or a latest-session guess.

This fail-closed rule prevents two Grok sessions from collapsing into the same AITM session record.

## Transcript resolution

Grok stores the counted transcript at:

```text
$GROK_HOME/sessions/<encodeURIComponent(cwd)>/<sid>/chat_history.jsonl
```

When `GROK_HOME` is absent, it defaults to `~/.grok`. AITM treats `GROK_HOME` as the provider home itself; it does not prefix it with another `.grok` directory.

Only `chat_history.jsonl` is counted. AITM recognizes visible user and assistant text plus tool results, skips reasoning and system records, and never reads the ACP `updates.jsonl` stream. If a real sid exists but the transcript has not been created yet, the count is zero and the sid remains valid.

## Safety boundary

AITM enforces one editing provider per worktree with local authoritative occupancy. A second session cannot bind the same issue, pause retains the claim, and successful stop or close releases it. There is no TTL steal; after inspection, use `npx aitm occupancy --release #N` for issue-scoped recovery. Cross-clone coordination remains outside this local authority boundary.

Grok's native Bash, edit, and agent hooks share the same AITM guards as Claude and Codex after envelope normalization. A missing bridge or named handler denies the operation because policy could not run; a crash inside an existing shared handler preserves the package's documented diagnostic fail-open behavior.

Co-review reviewers stay unbound. A claimed reviewer session may write only its exact pending review artifact. Edit, Write, `apply_patch`, and Bash reject tracked source, authority files, other protocol or `.tmp/**` paths, mixed or malformed patches, ambiguous shell mutations, and symlink drift before ordinary scratch or chore allowances.
