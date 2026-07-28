#!/usr/bin/env node
import { loadConfig } from '../task-tracker/config.mjs';
import { fieldOptionMap } from './lib/github-projects.mjs';
import { tetherIssueToProject, backlogSizingWarning } from './lib/project-tether.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { stateIds } from '../task-tracker/lib/lifecycle-policy/index.mjs';

function usage() {
  return `Usage: project-tether.mjs --issue <N> [--parent <N>] [--status ${stateIds().join('|')}] [--priority P0|P1|P2] [--size XS|S|M|L|XL] [--estimate <hours>] [--rank <N>]`;
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = value;
      i += 1;
    }
  }
  return parsed;
}

function numberFlag(value, name) {
  if (value === undefined || value === true || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

const VALID_STATUSES = new Set(stateIds());

async function main() {
  if (wantsHelp(process.argv.slice(2))) {
    emitSelfDoc('project-tether');
    process.exit(0);
  }
  const args = parseArgs(process.argv.slice(2));
  const issueNumber = numberFlag(args.issue, '--issue');
  if (!issueNumber) {
    console.error(usage());
    process.exit(2);
  }

  if (args.status && !VALID_STATUSES.has(String(args.status).toLowerCase())) {
    console.error(
      `project-tether: invalid --status "${args.status}". Valid values: ${[...VALID_STATUSES].join('|')}`
    );
    process.exit(2);
  }

  const sizingWarn = backlogSizingWarning({
    status: args.status,
    size: args.size,
    estimate: args.estimate,
  });
  if (sizingWarn) process.stderr.write(`${sizingWarn}\n`);

  const cfg = loadConfig();
  if (args.size) {
    const options = await fieldOptionMap(cfg.projectId);
    cfg.sizeOptionMap = options[cfg.sizeFieldId] || {};
  }

  const result = await tetherIssueToProject({
    cfg,
    issueNumber,
    parentIssueNumber: numberFlag(args.parent, '--parent'),
    status: args.status,
    priority: args.priority,
    size: args.size,
    estimate: numberFlag(args.estimate, '--estimate'),
    rank: numberFlag(args.rank, '--rank'),
  });

  console.log(
    `✓ #${issueNumber} tethered to ${result.projectTitle || cfg.projectId}: ${result.itemId}`
  );
}

main().catch((err) => {
  console.error(`project-tether: ${err.message}`);
  process.exit(1);
});
