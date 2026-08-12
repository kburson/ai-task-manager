#!/usr/bin/env node
// Compatibility spelling for Shelve (#1215). Park no longer preserves active
// estimates or accepts Plan; every call uses the canonical Shelve transaction.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGAL_FROM, SHELVE_TARGET, parseArgs, runShelve, verbShelve } from './shelve.mjs';
import { defaultRunMoveState } from '../lib/shelve-transaction.mjs';

export const PARK_TARGET = SHELVE_TARGET;
export { LEGAL_FROM, parseArgs, defaultRunMoveState };

export function runPark(options = {}) {
  return runShelve(options);
}

export function verbPark(rest, cfg, deps = {}) {
  return verbShelve(rest, cfg, deps);
}

const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  const { loadConfig } = await import('../config.mjs');
  await verbPark(process.argv.slice(2), loadConfig());
}
