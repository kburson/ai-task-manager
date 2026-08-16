import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { evaluateIssueDecomposition } from '../lib/decomposition-plan-exit-guard.mjs';

const pexec = promisify(execFile);

async function defaultFetchIssueBody({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return stdout || '';
}

export async function runDecomposeCheck({ issueNumber, cfg, planOverride = null, deps = {} } = {}) {
  if (!Number.isInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
    throw new Error('decompose-check: issueNumber must be a positive integer');
  }
  if (!cfg?.repo) throw new Error('decompose-check: cfg.repo is required');
  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const body = await fetchIssueBody({ issueNumber: Number(issueNumber), repo: cfg.repo });
  const evaluated = await evaluateIssueDecomposition({
    issueNumber: Number(issueNumber),
    cfg,
    body,
    planOverride,
    deps: deps.decomposition || {},
  });
  const blocked =
    !evaluated.planSelection.ok ||
    (evaluated.classification.status === 'must-split' && !evaluated.waiver.ok);
  return { issueNumber: Number(issueNumber), ...evaluated, exitCode: blocked ? 3 : 0 };
}

export function formatDecomposeCheck(result) {
  const lines = [`${result.classification.status} #${result.issueNumber}`];
  for (const signal of result.classification.signals) {
    lines.push(`- ${signal.level}: ${signal.code}=${signal.value} (threshold ${signal.threshold})`);
  }
  if (result.planDiagnostic?.diagnostic) {
    lines.push(`- plan: ${result.planDiagnostic.diagnostic}`);
  } else if (result.planDiagnostic?.path) {
    lines.push(`- plan: ${result.planDiagnostic.path}`);
  }
  if (!result.planSelection.ok) {
    lines.push(`- source-plan-section: ${result.planSelection.diagnostic}`);
  } else if (result.planSelection.applied) {
    lines.push(`- source-plan-section: ${result.planSelection.heading}`);
  }
  lines.push(`- waiver: ${result.waiver.ok ? 'valid' : result.waiver.reason}`);
  return lines.join('\n');
}

export function parseDecomposeCheckArgs(rest = []) {
  let issueNumber = null;
  let planOverride = null;
  let json = false;
  for (let index = 0; index < rest.length; index += 1) {
    const token = String(rest[index]);
    const issue = token.match(/^#?(\d+)$/);
    if (issue && issueNumber == null) issueNumber = Number(issue[1]);
    else if (token === '--plan') {
      const value = rest[index + 1];
      if (!value || String(value).startsWith('--')) {
        throw new Error('decompose-check: --plan requires a path');
      }
      planOverride = rest[++index];
    } else if (token === '--json') json = true;
    else throw new Error(`decompose-check: unrecognized argument ${token}`);
  }
  return { issueNumber, planOverride, json };
}

export async function verbDecomposeCheck(ctx) {
  let parsed;
  try {
    parsed = parseDecomposeCheckArgs(ctx.rest);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  if (!parsed.issueNumber) {
    process.stderr.write('Usage: /task decompose-check <issue> [--plan <path>] [--json]\n');
    process.exit(2);
  }
  try {
    const result = await runDecomposeCheck({
      issueNumber: parsed.issueNumber,
      cfg: ctx.cfg,
      planOverride: parsed.planOverride,
      deps: ctx.deps || {},
    });
    console.log(parsed.json ? JSON.stringify(result, null, 2) : formatDecomposeCheck(result));
    if (result.exitCode) process.exit(result.exitCode);
  } catch (error) {
    process.stderr.write(`decompose-check: ${error.message}\n`);
    process.exit(1);
  }
}
