// `board` verb (#715) — first-class board-Status read.
//
// CLI: /task board [#N]
//
// `aitm status` reports timing / "No active task" — never the Project-board
// `Status` field. That gap pushed agents to improvise raw `gh project` /
// `gh api graphql` reads with a guessed, owner-relative project number, which
// can resolve to the wrong board. This verb closes the gap: it resolves the
// board Status for the target issue through `ctx.getIssueBoardState`, which
// filters `project.id === cfg.projectId` internally — the bound projectId is
// read from `task-tracker.json`, never guessed.
//
// Target: the first `#N` / `N` token in `ctx.rest`, else the active bound
// issue. With neither, prints usage and sets a non-zero exit code.
//
// `resolveBoardTarget` is exported and pure so the argument/active-issue
// resolution is unit-testable without network or filesystem.

import { loadState } from '../state.mjs';

// First `#N` / `N` in `rest` wins; else the bound `activeIssue`; else null.
export function resolveBoardTarget(rest, activeIssue) {
  for (const tok of rest ?? []) {
    const m = String(tok).match(/^#?(\d+)$/);
    if (m) return Number(m[1]);
  }
  if (activeIssue) {
    const m = String(activeIssue).match(/^#?(\d+)$/);
    if (m) return Number(m[1]);
  }
  return null;
}

export async function verbBoard(ctx) {
  const { rest, statePath } = ctx;
  let activeIssue = null;
  try {
    activeIssue = loadState(statePath)?.active ?? null;
  } catch {
    activeIssue = null;
  }
  const target = resolveBoardTarget(rest, activeIssue);
  if (!target) {
    console.error('Usage: /task board [#N] — no issue given and no active task bound.');
    process.exitCode = 1;
    return;
  }

  const state = await ctx.getIssueBoardState(target);
  if (state == null) {
    console.log(`#${target} is not on the bound project board.`);
    return;
  }
  console.log(`#${target} board Status: ${state}`);
}
