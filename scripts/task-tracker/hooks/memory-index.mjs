#!/usr/bin/env node
// #728 — always-loaded memory-index hook. Fires on SessionStart and PostCompact
// and emits ONLY the lightweight `.ai-task-manager/memory/MEMORY.md` index as
// `hookSpecificOutput.additionalContext`, prefixed with a one-line recall-on-
// demand instruction. The full per-fact corpus is NEVER emitted — the index is
// cheap and bounded; individual fact files are read on demand when a one-line
// hook matches the task at hand.
//
// Registered by the installer (`patchSettingsJson`) ONLY when at least one seed
// file was accepted at install time; a `none` selection installs no hook, so a
// missing/empty index simply produces no context (exit 0, no output).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RECALL_PREFACE =
  'Operational-lessons memory index (recall on demand: grep `.ai-task-manager/memory/` ' +
  'and read the matching per-fact file before acting). Index is the only always-loaded ' +
  'surface; the full corpus is NOT in context.';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Resolve `.ai-task-manager/memory/MEMORY.md` relative to the project root. The
// hook is invoked from the project root by Claude/Codex, so cwd is the anchor.
export function memoryIndexPath(cwd = process.cwd()) {
  return path.join(cwd, '.ai-task-manager', 'memory', 'MEMORY.md');
}

// Build the additionalContext string, or null when there is no index to emit.
export function buildMemoryIndexContext({ indexPath, read = readFileSync, exists = existsSync }) {
  if (!exists(indexPath)) return null;
  let body;
  try {
    body = read(indexPath, 'utf8');
  } catch {
    return null;
  }
  if (!body || !body.trim()) return null;
  return `${RECALL_PREFACE}\n\n${body.trim()}`;
}

export async function runMemoryIndexHook({
  stdin = readStdin(),
  cwd = process.cwd(),
  stdout = (s) => process.stdout.write(s),
} = {}) {
  let payload;
  try {
    payload = JSON.parse(stdin || '{}');
  } catch {
    payload = {};
  }
  const event = payload.hook_event_name || payload.hookEventName || 'SessionStart';
  if (!['SessionStart', 'PostCompact'].includes(event)) return 0;

  const additionalContext = buildMemoryIndexContext({ indexPath: memoryIndexPath(cwd) });
  if (!additionalContext) return 0;

  stdout(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: event,
        additionalContext,
      },
    }) + '\n'
  );
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runMemoryIndexHook()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`[task-tracker] memory-index hook failed: ${err.message}\n`);
      process.exit(0);
    });
}
