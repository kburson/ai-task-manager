#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadConfig } from './config.mjs';
import { parseClosedAs } from './lib/close-disposition.mjs';
import { parseSupersededBy } from './lib/superseded-marker.mjs';
import { readTerminalDisposition, writeTerminalDisposition } from './lib/terminal-disposition.mjs';
import { GH_API_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import { confirmBlastRadius } from './lib/blast-radius-guard.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('backfill-disposition');
  process.exit(0);
}

const pexec = promisify(execFile);
const USAGE =
  'Usage: node scripts/task-tracker/backfill-disposition.mjs [--apply] [--issues N,N] [--yes]';

export function parseArgs(argv = []) {
  let apply = false;
  let issueNumbers = [];
  let yes = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--yes') {
      yes = true;
      continue;
    }
    if (arg === '--issues') {
      const raw = argv[++index];
      if (!raw) throw new Error('backfill-disposition: --issues requires a comma-separated list');
      issueNumbers = raw.split(',').map((token) => {
        const match = token.trim().match(/^#?(\d+)$/);
        if (!match) throw new Error(`backfill-disposition: invalid issue ${JSON.stringify(token)}`);
        return Number(match[1]);
      });
      issueNumbers = [...new Set(issueNumbers)];
      continue;
    }
    throw new Error(`backfill-disposition: unknown flag ${JSON.stringify(arg)}`);
  }
  return { apply, issueNumbers, yes };
}

export function deriveDisposition({ stateReason, body = '' } = {}) {
  if (parseSupersededBy(body)) return 'Replaced';
  const closedAs = parseClosedAs(body);
  if (closedAs?.reason === 'duplicate') return 'Duplicate';
  if (closedAs?.reason === 'not-planned') return 'Discarded';
  const reason = String(stateReason || '')
    .trim()
    .toUpperCase()
    .replaceAll(' ', '_');
  if (reason === 'DUPLICATE') return 'Duplicate';
  if (reason === 'NOT_PLANNED') return 'Discarded';
  if (reason === 'COMPLETED') return 'Delivered';
  return null;
}

export async function runBackfill({ cfg, issues = [], apply = false, deps = {} } = {}) {
  const readDisposition = deps.readDisposition || readTerminalDisposition;
  const writeDisposition = deps.writeDisposition || writeTerminalDisposition;
  const items = [];
  for (const issue of issues) {
    const disposition = deriveDisposition(issue);
    if (!disposition) {
      items.push({ number: issue.number, disposition: null, status: 'skipped' });
      continue;
    }
    if (!apply) {
      items.push({ number: issue.number, disposition, status: 'planned' });
      continue;
    }
    try {
      const current = await readDisposition({ cfg, issueNumber: issue.number });
      if (current === disposition) {
        items.push({ number: issue.number, disposition, status: 'unchanged' });
        continue;
      }
      await writeDisposition({ cfg, issueNumber: issue.number, disposition });
      items.push({ number: issue.number, disposition, status: 'updated' });
    } catch (error) {
      items.push({
        number: issue.number,
        disposition,
        status: 'failed',
        error: error.message,
      });
    }
  }
  return {
    apply,
    items,
    updated: items.filter((item) => item.status === 'updated').length,
    unchanged: items.filter((item) => item.status === 'unchanged').length,
    failed: items.filter((item) => item.status === 'failed').length,
  };
}

export async function fetchClosedIssues({ repo, issueNumbers = [], exec = pexec } = {}) {
  if (!repo) throw new Error('backfill-disposition: cfg.repo is required');
  if (issueNumbers.length > 0) {
    return Promise.all(
      issueNumbers.map(async (number) => {
        const { stdout } = await exec(
          'gh',
          ['issue', 'view', String(number), '-R', repo, '--json', 'number,body,state,stateReason'],
          { timeout: GH_API_TIMEOUT_MS }
        );
        return JSON.parse(stdout);
      })
    );
  }
  const { stdout } = await exec(
    'gh',
    [
      'issue',
      'list',
      '-R',
      repo,
      '--state',
      'closed',
      '--limit',
      '1000',
      '--json',
      'number,body,state,stateReason',
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return JSON.parse(stdout);
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log || ((line) => console.log(line));
  const err = deps.err || ((line) => console.error(line));
  try {
    const args = parseArgs(argv);
    const cfg = (deps.loadConfig || loadConfig)();
    const fetchIssues = deps.fetchClosedIssues || fetchClosedIssues;
    const issues = await fetchIssues({
      repo: cfg.repo,
      issueNumbers: args.issueNumbers,
    });
    if (args.apply) {
      const confirm = deps.confirmBlastRadius || confirmBlastRadius;
      const decision = await confirm({
        issueNumbers: issues.map((issue) => issue.number),
        yes: args.yes,
        log,
        warn: err,
      });
      if (!decision.proceed) return 2;
    }

    const executeBackfill = deps.runBackfill || runBackfill;
    const result = await executeBackfill({ cfg, issues, apply: args.apply });
    for (const item of result.items) {
      const suffix = item.error ? ` — ${item.error}` : '';
      log(`#${item.number}: ${item.disposition || '(unclassified)'} — ${item.status}${suffix}`);
    }
    log(
      `${args.apply ? 'Applied' : 'Planned'}: ${result.items.length}; ` +
        `updated=${result.updated}, unchanged=${result.unchanged}, failed=${result.failed}`
    );
    return result.failed > 0 ? 1 : 0;
  } catch (error) {
    err(error.message);
    err(USAGE);
    return 2;
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  process.exitCode = await main(process.argv.slice(2));
}
