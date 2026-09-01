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
export const SHELVE_USAGE =
  'Usage: shelve <N> --reason <text> [--remove-owner] [--refresh-stale-blockers]';

function usageFor(verb) {
  const migrationFlag = verb === 'shelve' ? ' [--refresh-stale-blockers]' : '';
  return `Usage: ${verb} <N> --reason <text> [--remove-owner]${migrationFlag}`;
}

export function parseArgs(rest = [], { verb = 'shelve' } = {}) {
  const usage = usageFor(verb);
  const argv = rest.map(String);
  const allowsRefreshStaleBlockers = verb === 'shelve';
  const refreshCount = argv.filter((arg) => arg === '--refresh-stale-blockers').length;
  if (allowsRefreshStaleBlockers && refreshCount > 1) {
    throw new StrictArgvError('duplicate flag: --refresh-stale-blockers', { usage });
  }
  const parsed = parseStrict(argv, {
    flags: ['--remove-owner', ...(allowsRefreshStaleBlockers ? ['--refresh-stale-blockers'] : [])],
    options: ['--reason'],
    positionals: { min: 1, max: 1 },
    usage,
  });
  const issue = String(parsed.positionals[0]).match(/^#?([1-9]\d*)$/);
  if (!issue) throw new StrictArgvError('issue must be a positive number', { usage });
  return {
    issueNumber: Number(issue[1]),
    reason: parsed.values['--reason'] ?? null,
    removeOwner: parsed.values['--remove-owner'] === true,
    refreshStaleBlockers:
      allowsRefreshStaleBlockers && parsed.values['--refresh-stale-blockers'] === true,
  };
}

export async function runShelve({
  issueNumber,
  reason,
  removeOwner = false,
  refreshStaleBlockers = false,
  cfg,
  cursorCommand = 'shelve',
  deps = {},
} = {}) {
  const why = String(reason || '').trim();
  if (!why) return { status: 'reason-required' };
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('shelve: issueNumber must be a positive integer');
  }
  if (!cfg?.repo || !cfg?.projectId) throw new Error('shelve: cfg is required');
  (deps.assertBound || assertBoundToIssue)(issueNumber);
  const runTransaction = deps.runTransaction || runShelveTransaction;
  return runTransaction({
    issueNumber,
    reason: why,
    removeOwner: Boolean(removeOwner),
    refreshStaleBlockers: Boolean(refreshStaleBlockers),
    cfg,
    cursorCommand,
    deps,
  });
}

export async function verbShelveAs(displayVerb, rest, cfg, deps = {}) {
  const usage = usageFor(displayVerb);
  let args;
  try {
    args = parseArgs(rest, { verb: displayVerb });
  } catch (error) {
    if (!(error instanceof StrictArgvError)) throw error;
    process.stderr.write(`${error.message}\n${usage}\n`);
    process.exitCode = 2;
    return;
  }
  if (!String(args.reason || '').trim()) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = 2;
    return;
  }

  let result;
  try {
    result = await (deps.withIssueLock || withIssueLock)(
      { issue: args.issueNumber, verb: displayVerb, projDir: deps.projectDir || getProjectDir() },
      () => runShelve({ ...args, cfg, cursorCommand: displayVerb, deps })
    );
  } catch (error) {
    process.stderr.write(`${displayVerb}: ${error.message}\n`);
    process.exitCode = error instanceof IssueLockError ? 7 : 1;
    return;
  }

  if (result.status === 'shelved') {
    const migration = args.refreshStaleBlockers ? '; schema-1 stale-blocker migration' : '';
    process.stdout.write(
      `${displayVerb}: #${args.issueNumber} ${result.from} → backlog; refinement history ${result.tx}${migration}\n`
    );
    return;
  }
  const detail = result.error ? `: ${result.error}` : '';
  process.stderr.write(`${displayVerb}: refused (${result.status})${detail}\n`);
  process.exitCode = result.status === 'reason-required' ? 2 : 4;
}

export function verbShelve(rest, cfg, deps = {}) {
  return verbShelveAs('shelve', rest, cfg, deps);
}

const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  process.stderr.write(
    'shelve: direct execution refused; use `npx aitm shelve <N> --reason <text>` so hub preflight runs\n'
  );
  process.exitCode = 2;
}
