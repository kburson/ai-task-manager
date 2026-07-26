# Codex Memory Index Hook Parity

## Goal

Codex should surface the same installed operational-lessons memory index that
Claude surfaces. Both providers must use the shared project corpus under
`.ai-task-manager/memory/` and the shared filtered index at
`.ai-task-manager/memory/MEMORY.md`.

## Current Behavior

The memory seed installer copies accepted records into
`.ai-task-manager/memory/` and writes one filtered `MEMORY.md` index for the
project. That corpus is provider-neutral.

Claude receives the `memory-index.mjs` hook when at least one memory seed file is
accepted during install. The hook emits only the lightweight `MEMORY.md` index as
additional context on `SessionStart` and `PostCompact`.

Codex installation writes `.codex/hooks.json` for timing, guards, commit trail,
stop, and prompt hooks, but it does not currently register the memory-index hook.
That means Codex can read the shared files manually, but does not automatically
receive the same recall index as Claude.

## Design

Extend Codex hook installation to accept the same `memoryIndexHook` decision that
Claude receives from install-time memory seed selection.

When `memoryIndexHook` is true, `patchCodexHooksJson()` registers
`MEMORY_INDEX_HOOK_CMD` for:

- `SessionStart`, using the same Codex lifecycle matcher style as existing
  lifecycle hooks: `startup|resume|clear|compact`
- `PostCompact`, using the existing compact matcher style: `manual|auto`

Do not register the memory-index hook for `PreCompact`. The memory-index hook is
for refreshing recall context after startup or compaction. `PreCompact` remains
reserved for timing flush behavior and is not a useful point to inject the memory
index.

When `memoryIndexHook` is false, Codex installs no memory-index hook. This keeps
`--memory-seed=none` behavior consistent across providers.

## Installation Flow

`cmdInstall()` already resolves the memory seed choice before installing provider
files:

1. `installMemorySeed()` copies selected files into `.ai-task-manager/memory/`.
2. `memoryIndexHook` becomes true when at least one file was accepted.
3. Claude receives that flag today.

Codex should receive the same flag:

- `installCodex(targetDir, linkMode, { memoryIndexHook })`
- `patchCodexHooksJson(hooksPath, { memoryIndexHook })`

This makes memory index surfacing standard whenever optional Codex support is
installed and the user accepts at least one memory seed file.

## Testing

Add or extend unit coverage around the installer and hook patcher:

- `patchCodexHooksJson(..., { memoryIndexHook: true })` writes memory-index
  commands on `SessionStart` and `PostCompact`.
- `patchCodexHooksJson(..., { memoryIndexHook: false })` does not write
  memory-index commands.
- Running the patcher twice is idempotent.
- A full install for `--agent codex --memory-seed=all` or `--agent both
  --memory-seed=all` includes the Codex memory-index hooks.
- A full install with `--memory-seed=none` does not include Codex memory-index
  hooks.

## Documentation

Update `docs/guides/codex-support-matrix.md` so the enforcement parity table
lists operational-lessons memory index surfacing for Codex. The row should make
clear that Claude and Codex share `.ai-task-manager/memory/MEMORY.md` and that
both providers load only the index, not the full per-fact corpus.

## Out of Scope

This change does not create provider-specific memory files, duplicate indexes,
or modify the memory resync format. It also does not change compaction timing
semantics: `PreCompact` and `PostCompact` timing rows remain separate from the
memory-index hook.
