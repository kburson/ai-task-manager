#!/usr/bin/env node
// dispatch-prep.mjs — orchestrator-side pre-flight for a sub-issue about to be
// handed to an agent. Flips the board to In Progress and posts a `start` timing
// row, so the issue is observably claimed even if the agent's bootstrap fails.
//
// Usage:  dispatch-prep.mjs <issue#> [--description "<text>"]

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../task-tracker/config.mjs';
import { buildRow, postTimingEvent } from '../task-tracker/gh-timing-comment.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { issue: null, description: 'orchestrator dispatch — agent boot pending' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--description') { out.description = argv[++i]; continue; }
    if (a === '-h' || a === '--help') { out.help = true; continue; }
    if (!out.issue) { out.issue = a.replace(/^#/, ''); continue; }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.issue) {
    process.stdout.write('Usage: dispatch-prep.mjs <issue#> [--description "<text>"]\n');
    process.exit(args.help ? 0 : 2);
  }
  if (!/^\d+$/.test(args.issue)) {
    process.stderr.write(`dispatch-prep: invalid issue: ${args.issue}\n`);
    process.exit(2);
  }

  const cfg = loadConfig();
  if (!cfg.repo) {
    process.stderr.write('dispatch-prep: config-not-found — no repo configured. Run /task config init.\n');
    process.exit(2);
  }

  // 1. Flip board to In Progress (orchestrator-owned transition).
  const moveScript = path.join(__dir, 'move-state.mjs');
  await pexec('node', [moveScript, args.issue, 'in-progress'], { timeout: 15000 });

  // 2. Post a `start` row so the issue's timing log shows the dispatch moment
  //    even if the agent's bootstrap never lands. The agent's own subsequent
  //    `start` row becomes a confirmation rather than the load-bearing entry.
  if (process.env.TT_SKIP_NETWORK !== '1') {
    const row = buildRow({
      ts: new Date().toISOString(),
      event: 'start',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: 0,
      description: args.description,
    });
    await postTimingEvent({
      issueNumber: `#${args.issue}`,
      repo: cfg.repo,
      row,
      timeoutMs: cfg.hookNetworkTimeoutMs ?? 5000,
    });
  }

  process.stdout.write(`dispatch-prep: #${args.issue} flipped to In Progress and start row posted\n`);
}

main().catch(err => {
  process.stderr.write(`dispatch-prep error: ${err.message}\n`);
  process.exit(1);
});
