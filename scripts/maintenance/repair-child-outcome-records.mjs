#!/usr/bin/env node

import { canonicalRecordJson } from '../task-tracker/lib/github-records/canonical-json.mjs';
import { confirmBlastRadius } from '../task-tracker/lib/blast-radius-guard.mjs';
import { createAitmRecordEnvelope } from '../task-tracker/lib/github-records/record-envelope.mjs';
import { activeEstimationOutcomes } from '../task-tracker/lib/estimation/outcome-chain.mjs';
import { validateEstimationOutcome } from '../task-tracker/lib/estimation/outcome-record.mjs';
import {
  createGitHubEstimationRecordIo,
  issueAttributedDiffEvidence,
} from '../task-tracker/lib/estimation/runtime-adapter.mjs';

export function buildCorrectedOutcomePayload({ payload, diff } = {}) {
  if (!payload || typeof payload !== 'object' || !diff || typeof diff !== 'object') {
    throw new TypeError('repair-child-outcome-records:payload');
  }
  return {
    ...structuredClone(payload),
    landscape: {
      ...structuredClone(payload.landscape),
      filesChanged: diff.filesChanged,
      modules: [...diff.modules],
      lanes: [...diff.lanes],
      dependencyBreadth: diff.dependencyBreadth,
    },
  };
}

export async function repairChildOutcomeRecords({
  issueNumbers,
  mode = 'check',
  projectDir,
  deps = {},
} = {}) {
  if (
    !Array.isArray(issueNumbers) ||
    issueNumbers.length === 0 ||
    issueNumbers.some((issue) => !Number.isInteger(issue) || issue <= 0)
  ) {
    throw new TypeError('repair-child-outcome-records:issues');
  }
  if (!['apply', 'check'].includes(mode)) {
    throw new TypeError('repair-child-outcome-records:mode');
  }
  for (const dependency of [
    'listIssueRecords',
    'readDiffEvidence',
    ...(mode === 'apply' ? ['createEnvelope', 'writeOutcome'] : []),
  ]) {
    if (typeof deps[dependency] !== 'function') {
      throw new TypeError(`repair-child-outcome-records:${dependency}`);
    }
  }

  const results = [];
  for (const issue of issueNumbers) {
    const records = await deps.listIssueRecords({ issue });
    const active = activeEstimationOutcomes(records).filter(
      (record) => record.envelope.issue === issue
    );
    if (active.length !== 1) {
      throw new Error(`repair-child-outcome-records:#${issue}:active-outcome-${active.length}`);
    }
    const current = active[0];
    const diff = await deps.readDiffEvidence({ projectDir, issueNumber: issue });
    const corrected = buildCorrectedOutcomePayload({ payload: current.envelope.payload, diff });
    validateEstimationOutcome(corrected, { expectedIssue: issue });
    if (canonicalRecordJson(corrected) === canonicalRecordJson(current.envelope.payload)) {
      results.push({ issue, status: 'verified', recordId: current.envelope.recordId });
      continue;
    }
    if (mode === 'check') {
      throw new Error(`repair-child-outcome-records:#${issue}:correction-required`);
    }

    const envelope = deps.createEnvelope({
      issue,
      payload: corrected,
      supersedes: current.envelope.recordId,
    });
    const written = await deps.writeOutcome({ issue, envelope });
    if (
      written?.envelope?.recordType !== 'estimation-outcome' ||
      written.envelope.issue !== issue ||
      written.envelope.supersedes !== current.envelope.recordId ||
      canonicalRecordJson(written.envelope.payload) !== canonicalRecordJson(corrected)
    ) {
      throw new Error(`repair-child-outcome-records:#${issue}:write-readback`);
    }
    results.push({
      issue,
      status: 'repaired',
      recordId: written.envelope.recordId,
      supersedes: current.envelope.recordId,
    });
  }
  return results;
}

function usage() {
  return (
    'repair-child-outcome-records — verify or append issue-scoped corrections to immutable estimation outcomes.\n\n' +
    'Usage: node scripts/maintenance/repair-child-outcome-records.mjs --issues N,N [--check|--apply] [--yes]\n'
  );
}

async function main(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--issues') {
      index += 1;
      continue;
    }
    if (!['--apply', '--check', '--yes', '--help', '-h'].includes(argument)) {
      process.stderr.write(`repair-child-outcome-records: unknown flag: ${argument}\n${usage()}`);
      process.exitCode = 2;
      return;
    }
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(usage());
    return;
  }
  const issuesIndex = argv.indexOf('--issues');
  const issueNumbers = String(issuesIndex >= 0 ? argv[issuesIndex + 1] : '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  const apply = argv.includes('--apply');
  const check = argv.includes('--check');
  const yes = argv.includes('--yes');
  if (issuesIndex < 0 || issueNumbers.length === 0 || (apply && check)) {
    process.stderr.write(usage());
    process.exitCode = 2;
    return;
  }

  if (apply) {
    const decision = await confirmBlastRadius({ issueNumbers, yes });
    if (!decision.proceed) {
      process.exitCode = 2;
      return;
    }
  }

  const { loadConfig } = await import('../task-tracker/config.mjs');
  const cfg = loadConfig();
  const projectDir = cfg.projectDir || process.cwd();
  const io = createGitHubEstimationRecordIo();
  const results = await repairChildOutcomeRecords({
    issueNumbers,
    mode: apply ? 'apply' : 'check',
    projectDir,
    deps: {
      listIssueRecords: ({ issue }) => io.listIssueRecords({ repository: cfg.repo, issue }),
      readDiffEvidence: issueAttributedDiffEvidence,
      createEnvelope: ({ issue, payload, supersedes }) =>
        createAitmRecordEnvelope({
          recordType: 'estimation-outcome',
          repository: cfg.repo,
          issue,
          payload,
          actor: 'aitm/outcome-repair',
          supersedes,
        }),
      writeOutcome: ({ envelope }) => io.write({ envelope }),
    },
  });
  for (const result of results) process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`repair-child-outcome-records: ${error.message}\n`);
    process.exit(1);
  });
}
