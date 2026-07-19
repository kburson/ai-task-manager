#!/usr/bin/env node
// @story #885
// Verifier for the epic-kind `commits` DoD item (#885, parent epic #883).
//
// A container epic has no commit of its own, so `git log --oneline -1` proves
// nothing about it. The equivalent question for an epic is "is every child's
// deliverable present on this branch?" — which is exactly what #884's derived
// trail answers. Exit 0 when the trail builds; exit 1, naming every unreachable
// child, when it does not.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadConfig } from './config.mjs';
import { fetchEpicChildren } from './lib/epic-children-gate.mjs';
import {
  buildEpicDerivedTrail,
  epicTrailLogArgs,
  parseEpicTrailLog,
} from './lib/epic-derived-commit-trail.mjs';
import { GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';

const pexec = promisify(execFile);

async function main(argv) {
  const args = argv.filter((a) => a !== '');
  const unknown = args.filter((a) => a.startsWith('-'));
  if (unknown.length) {
    console.error(`verify-epic-trail: unknown flag(s): ${unknown.join(', ')}`);
    return 2;
  }
  const epicNumber = Number(String(args[0] || '').replace(/^#/, ''));
  if (!Number.isInteger(epicNumber) || epicNumber <= 0) {
    console.error('Usage: node scripts/task-tracker/verify-epic-trail.mjs <epic#>');
    return 2;
  }

  const cfg = loadConfig();
  const children = await fetchEpicChildren({ cfg, parentEpicNumber: epicNumber });
  if (!children.length) {
    console.error(`verify-epic-trail: epic #${epicNumber} has no children to derive a trail from`);
    return 1;
  }

  const { stdout } = await pexec('git', epicTrailLogArgs('HEAD'), { timeout: GIT_TIMEOUT_MS });
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
    `verify-epic-trail: every child of epic #${epicNumber} (${children.length}) has a [#N] commit reachable from HEAD`
  );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(`verify-epic-trail: ${err.message}`);
    process.exit(1);
  }
);
