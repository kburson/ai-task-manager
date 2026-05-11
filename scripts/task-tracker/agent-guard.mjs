#!/usr/bin/env node
// PreToolUse hook — refuses `Agent` tool spawns in the main git worktree.
//
// Spawn-class failure (epic #61): an orchestrator running in the main worktree
// invokes the Agent tool, sub-agents inherit the same cwd, concurrent edits
// corrupt code + issue state. This hook makes that mechanically impossible.
//
// Logic:
//   1. Read tool input JSON from stdin (malformed → safe pass).
//   2. cwd = process.env.PWD || process.cwd()
//   3. main = findMainWorktreePath(cwd)   ← reused from fleet-registry
//   4. If cwd === main → emit {decision:"block", reason: ...}
//   5. Else → exit 0, no output.
//
// No env-var bypass. No override flag. By design.

import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { findMainWorktreePath } from './fleet-registry.mjs';

function canon(p) {
  try { return realpathSync(path.resolve(p)); }
  catch { return path.resolve(p); }
}

let input = {};
try {
  input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
} catch {
  process.exit(0); // malformed payload — don't block
}

// Defensive: tolerate missing tool_input but proceed; the hook key is cwd, not payload contents.
void input;

const cwd = canon(process.env.PWD || process.cwd());
const main = canon(findMainWorktreePath(cwd));

if (cwd === main) {
  const reason =
    `Agent tool spawns are forbidden in the main worktree ` +
    `(cwd=${cwd}, main=${main}). ` +
    `Create a worktree first (see superpowers:using-git-worktrees). ` +
    `No override exists.`;
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

process.exit(0);
