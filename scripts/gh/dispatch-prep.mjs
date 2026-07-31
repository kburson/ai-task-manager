#!/usr/bin/env node
// dispatch-prep.mjs — orchestrator-side pre-flight for a sub-issue about to be
// handed to an agent. Flips the board to In Progress and posts a `start` timing
// row, so the issue is observably claimed even if the agent's bootstrap fails.
//
// Usage:  dispatch-prep.mjs <issue#> --anchor <parent-or-controller#> [--description "<text>"]

import { loadConfig } from '../task-tracker/config.mjs';
import { buildRow, postTimingEvent } from '../task-tracker/gh-timing-comment.mjs';
import { durableWordMarker } from '../task-tracker/state.mjs';
import { getProjectDir } from '../task-tracker/paths.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { runMoveStateHost } from './move-state.mjs';
import { createRuntimeGovernedEffectAdapter } from '../task-tracker/lib/work-lease/governed-effect.mjs';
import { buildOwnedChildEnvironment } from '../task-tracker/lib/work-lease/child-environment.mjs';

// #764 — flip the board to Development through the in-process runMoveStateHost
// seam (was: spawn `node scripts/gh/move-state.mjs <issue> develop`). Mirrors
// demote/promote's migrated helper: runMoveStateHost returns the numeric exit
// code the child exit code used to give us, so the caller's non-zero handling is
// unchanged. host is injectable for offline tests.
export function defaultRunMoveState(
  { issue, anchor, withGovernedEffect, env },
  { host = runMoveStateHost } = {}
) {
  return host({
    argv: [process.execPath, 'move-state.mjs', String(issue), 'develop'],
    env: { ...env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'dispatch' },
    governedIssueId: String(anchor),
    governedOperation: 'branch-worktree-orchestration',
    withGovernedEffect,
  });
}

// Injectable seam (#649): production wiring defaults to the real bindings; tests
// override these to drive the arg-parse, guard, move-state flip, and timing-row
// branches offline without gh, move-state, or the network. Behaviour-preserving.
export const deps = {
  runMoveState: defaultRunMoveState,
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
  const out = {
    issue: null,
    anchor: null,
    description: 'orchestrator dispatch — agent boot pending',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--description') {
      out.description = argv[++i];
      continue;
    }
    if (a === '--anchor') {
      out.anchor = String(argv[++i] ?? '').replace(/^#/, '');
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

  const rawArgs = argv.slice(2);
  if (wantsHelp(rawArgs)) {
    d.emitSelfDoc('dispatch-prep');
    return d.exit(0);
  }
  const args = parseArgs(rawArgs);
  if (!args.issue) {
    d.err(
      'Usage: dispatch-prep.mjs <issue#> --anchor <parent-or-controller#> [--description "<text>"]\n'
    );
    return d.exit(2);
  }
  if (!/^\d+$/.test(args.issue)) {
    d.err(`dispatch-prep: invalid issue: ${args.issue}\n`);
    return d.exit(2);
  }
  if (!/^[1-9]\d*$/.test(String(args.anchor ?? ''))) {
    d.err('dispatch-prep: --anchor <parent-or-controller-issue> is required\n');
    return d.exit(2);
  }
  if (args.anchor === args.issue) {
    d.err('dispatch-prep: child issue cannot authorize its own dispatch\n');
    return d.exit(2);
  }

  const cfg = d.loadConfig();
  if (!cfg.repo) {
    d.err('dispatch-prep: config-not-found — no repo configured. Run /task config init.\n');
    return d.exit(2);
  }

  const withGovernedEffect =
    d.withGovernedEffect ??
    createRuntimeGovernedEffectAdapter({
      projectDir: d.getProjectDir(),
      config: cfg,
    });
  const outcome = await withGovernedEffect(
    {
      issueId: args.anchor,
      operation: 'branch-worktree-orchestration',
      heartbeat: true,
    },
    async (effect) => {
      // The outer controller owns the one command heartbeat. The move-state
      // host receives a narrow reverify-only continuation so it obtains a
      // fresh proof at its own post-lock boundary without starting/stopping a
      // second controller or accepting any other issue/operation.
      const withDispatchAuthorization = async (options, callback) => {
        if (
          String(options?.issueId).replace(/^#/, '') !== args.anchor ||
          options?.operation !== 'branch-worktree-orchestration'
        ) {
          throw new Error('dispatch authorization scope mismatch');
        }
        await effect.reverify();
        return callback(effect);
      };
      // 1. Flip board to Development (orchestrator-owned transition), in-process.
      const moveCode = await d.runMoveState({
        issue: args.issue,
        anchor: args.anchor,
        withGovernedEffect: withDispatchAuthorization,
        env: buildOwnedChildEnvironment({
          baseEnv: d.baseEnv ?? process.env,
          leaseContext: effect.leaseContext,
          tokenEnv: cfg.workLease?.tokenEnv,
        }),
      });
      if (moveCode !== 0) return { moveCode };

      // 2. Post a start row only after the board move.
      if (!skipNetwork) {
        const row = d.buildRow({
          ts: new Date().toISOString(),
          event: 'start',
          activeMin: 0,
          idleMin: 0,
          deltaWords: 0,
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
      return { moveCode: 0 };
    }
  );
  if (outcome.moveCode !== 0) {
    d.err(`dispatch-prep: move-state ${args.issue} develop exited ${outcome.moveCode}\n`);
    return d.exit(outcome.moveCode);
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
