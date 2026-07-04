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
import { GH_API_TIMEOUT_MS } from '../task-tracker/lib/process-timeouts.mjs';
import { durableWordMarker } from '../task-tracker/state.mjs';
import { getProjectDir } from '../task-tracker/paths.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// Injectable seam (#649): production wiring defaults to the real bindings; tests
// override these to drive the arg-parse, guard, move-state exec, and timing-row
// branches offline without gh, move-state, or the network. Behaviour-preserving.
export const deps = {
  execFile,
  loadConfig,
  buildRow,
  postTimingEvent,
  durableWordMarker,
  getProjectDir,
  emitSelfDoc,
  log: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  exit: (c) => process.exit(c),
};

export function parseArgs(argv) {
  const out = { issue: null, description: 'orchestrator dispatch — agent boot pending' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--description') {
      out.description = argv[++i];
      continue;
    }
    if (a === '-h' || a === '--help') {
      out.help = true;
      continue;
    }
    if (!out.issue) {
      out.issue = a.replace(/^#/, '');
      continue;
    }
  }
  return out;
}

export async function main(argv, overrides = {}) {
  const d = { ...deps, ...overrides };
  const skipNetwork =
    overrides.skipNetwork !== undefined
      ? overrides.skipNetwork
      : process.env.TT_SKIP_NETWORK === '1';
  const pexec = promisify(d.execFile);

  const rawArgs = argv.slice(2);
  if (wantsHelp(rawArgs)) {
    d.emitSelfDoc('dispatch-prep');
    return d.exit(0);
  }
  const args = parseArgs(rawArgs);
  if (!args.issue) {
    d.err('Usage: dispatch-prep.mjs <issue#> [--description "<text>"]\n');
    return d.exit(2);
  }
  if (!/^\d+$/.test(args.issue)) {
    d.err(`dispatch-prep: invalid issue: ${args.issue}\n`);
    return d.exit(2);
  }

  const cfg = d.loadConfig();
  if (!cfg.repo) {
    d.err('dispatch-prep: config-not-found — no repo configured. Run /task config init.\n');
    return d.exit(2);
  }

  // 1. Flip board to Development (orchestrator-owned transition).
  const moveScript = path.join(__dir, 'move-state.mjs');
  await pexec('node', [moveScript, args.issue, 'develop'], {
    // move-state internally makes gh calls; gh-class budget is the right floor.
    timeout: GH_API_TIMEOUT_MS,
    env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'dispatch' },
  });

  // 2. Post a `start` row so the issue's timing log shows the dispatch moment
  //    even if the agent's bootstrap never lands. The agent's own subsequent
  //    `start` row becomes a confirmation rather than the load-bearing entry.
  if (!skipNetwork) {
    const row = d.buildRow({
      ts: new Date().toISOString(),
      event: 'start',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      // #475 AC1 — carried-forward durable marker (orchestrator dispatch start row)
      wordMarker: d.durableWordMarker(d.getProjectDir()),
      description: args.description,
    });
    await d.postTimingEvent({
      issueNumber: `#${args.issue}`,
      repo: cfg.repo,
      row,
      timeoutMs: cfg.hookNetworkTimeoutMs ?? 5000,
    });
  }

  d.log(`dispatch-prep: #${args.issue} flipped to In Progress and start row posted\n`);
  return undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((err) => {
    process.stderr.write(`dispatch-prep error: ${err.message}\n`);
    process.exit(1);
  });
}
