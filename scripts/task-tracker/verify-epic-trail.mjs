#!/usr/bin/env node
// @story #885
// Verifier for the epic-kind `commits` DoD item (#885, parent epic #883).
//
// A container epic has no commit of its own, so `git log --oneline -1` proves
// nothing about it. The equivalent question for an epic is "is every child's
// deliverable present on this branch?" — which is exactly what #884's derived
// trail answers. Exit 0 when the trail builds; exit 1, naming every unreachable
// child, when it does not.
//
// #900: the DoD template ships this command BARE (`node …/verify-epic-trail.mjs`
// with no epic number). A `<this-issue-#>` template placeholder is impossible —
// `<`/`>` are FORBIDDEN checklist-lint redirect tokens (verification-allowlist),
// so the epic number cannot be interpolated into the backtick command. Instead,
// a bare invocation resolves the epic from the active bound session (the issue
// whose Test run is executing this verifier). An explicit `<epic#>` positional
// still wins, so #885's direct/scripted callers are byte-for-byte unaffected.

import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.mjs';
import { loadState } from './state.mjs';
import { statePath as defaultStatePath } from './paths.mjs';
import { fetchEpicChildren } from './lib/epic-children-gate.mjs';
import {
  buildEpicDerivedTrail,
  epicTrailLogArgs,
  parseEpicTrailLog,
} from './lib/epic-derived-commit-trail.mjs';
import { GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';

const pexec = promisify(execFile);

// Resolve the target epic number. An explicit first positional (`123` or `#123`)
// always wins. With no positional, fall back to the active bound session's issue
// so the bare template command self-targets the issue currently at Test. Returns
// a positive integer, or null when neither source yields a valid number.
export function resolveEpicNumber(args, deps = {}) {
  const { loadState: loadStateDep = loadState, statePath: statePathDep = defaultStatePath } = deps;

  const explicit = String(args[0] || '').replace(/^#/, '');
  if (explicit) {
    const n = Number(explicit);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  try {
    const s = loadStateDep(statePathDep());
    const active = String(s.active || '').replace(/^#/, '');
    const n = Number(active);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function main(argv, deps = {}) {
  const {
    loadConfig: loadConfigDep = loadConfig,
    fetchEpicChildren: fetchChildrenDep = fetchEpicChildren,
    pexec: pexecDep = pexec,
    loadState: loadStateDep = loadState,
    statePath: statePathDep = defaultStatePath,
  } = deps;

  const args = argv.filter((a) => a !== '');
  const unknown = args.filter((a) => a.startsWith('-'));
  if (unknown.length) {
    console.error(`verify-epic-trail: unknown flag(s): ${unknown.join(', ')}`);
    return 2;
  }

  const epicNumber = resolveEpicNumber(args, {
    loadState: loadStateDep,
    statePath: statePathDep,
  });
  if (!epicNumber) {
    console.error(
      'Usage: node scripts/task-tracker/verify-epic-trail.mjs [<epic#>] [<epic-ref>]\n' +
        '  With no <epic#>, resolves the epic from the active bound session.'
    );
    return 2;
  }

  const cfg = loadConfigDep();
  const children = await fetchChildrenDep({ cfg, parentEpicNumber: epicNumber });
  if (!children.length) {
    console.error(`verify-epic-trail: epic #${epicNumber} has no children to derive a trail from`);
    return 1;
  }

  // Optional second positional: the epic ref to scope the log to. Defaults to
  // HEAD (the branch under review). Naming another ref lets the trail be
  // verified for an epic whose branch is not currently checked out — read-only,
  // with none of `review`'s board side effects.
  const epicRef = args[1] || 'HEAD';
  const { stdout } = await pexecDep('git', epicTrailLogArgs(epicRef), { timeout: GIT_TIMEOUT_MS });
  try {
    buildEpicDerivedTrail({
      epicNumber,
      children,
      commits: parseEpicTrailLog(stdout),
    });
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  console.log(
    `verify-epic-trail: epic #${epicNumber} trail verified for ${children.length} child(ren); every delivery-requiring child has a [#N] commit reachable from HEAD`
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`verify-epic-trail: ${err.message}`);
      process.exit(1);
    }
  );
}
