#!/usr/bin/env node
// Canonical Shelve verb (#1215).

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectDir } from '../paths.mjs';
import { IssueLockError, withIssueLock } from '../issue-mutator-lock.mjs';
import { parseStrict, StrictArgvError } from '../lib/argv-strict.mjs';
import { assertBoundToIssue } from '../lib/bind-context.mjs';
import { actionPolicyFor } from '../lib/lifecycle-policy/index.mjs';
import { runShelveTransaction } from '../lib/shelve-transaction.mjs';

const SHELVE_POLICY = actionPolicyFor('shelve');
export const SHELVE_TARGET = SHELVE_POLICY.target;
export const LEGAL_FROM = new Set(SHELVE_POLICY.allowedStates);
export const SHELVE_USAGE = 'Usage: shelve <N> --reason <text> [--remove-owner]';

export function parseArgs(rest = []) {
  const parsed = parseStrict(rest.map(String), {
    flags: ['--remove-owner'],
    options: ['--reason'],
    positionals: { min: 1, max: 1 },
    usage: SHELVE_USAGE,
  });
  const issue = String(parsed.positionals[0]).match(/^#?([1-9]\d*)$/);
  if (!issue) throw new StrictArgvError('issue must be a positive number', { usage: SHELVE_USAGE });
  return {
    issueNumber: Number(issue[1]),
    reason: parsed.values['--reason'] ?? null,
    removeOwner: parsed.values['--remove-owner'] === true,
  };
}

export async function runShelve({ issueNumber, reason, removeOwner = false, cfg, deps = {} } = {}) {
  const why = String(reason || '').trim();
  if (!why) return { status: 'reason-required' };
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('shelve: issueNumber must be a positive integer');
  }
  if (!cfg?.repo || !cfg?.projectId) throw new Error('shelve: cfg is required');
  (deps.assertBound || assertBoundToIssue)(issueNumber);
  const runTransaction = deps.runTransaction || runShelveTransaction;
  return runTransaction({ issueNumber, reason: why, removeOwner: Boolean(removeOwner), cfg, deps });
}

export async function verbShelve(rest, cfg, deps = {}) {
  let args;
  try {
    args = parseArgs(rest);
  } catch (error) {
    if (!(error instanceof StrictArgvError)) throw error;
    process.stderr.write(`${error.message}\n${SHELVE_USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  if (!String(args.reason || '').trim()) {
    process.stderr.write(`${SHELVE_USAGE}\n`);
    process.exitCode = 2;
    return;
  }

  let result;
  try {
    result = await (deps.withIssueLock || withIssueLock)(
      { issue: args.issueNumber, verb: 'shelve', projDir: deps.projectDir || getProjectDir() },
      () => runShelve({ ...args, cfg, deps })
    );
  } catch (error) {
    process.stderr.write(`shelve: ${error.message}\n`);
    process.exitCode = error instanceof IssueLockError ? 7 : 1;
    return;
  }

  if (result.status === 'shelved') {
    process.stdout.write(
      `shelve: #${args.issueNumber} ${result.from} → backlog; refinement history ${result.tx}\n`
    );
    return;
  }
  const detail = result.error ? `: ${result.error}` : '';
  process.stderr.write(`shelve: refused (${result.status})${detail}\n`);
  process.exitCode = result.status === 'reason-required' ? 2 : 4;
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
  await verbShelve(process.argv.slice(2), loadConfig());
}
