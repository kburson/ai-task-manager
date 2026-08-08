import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { evaluateIssueDecomposition } from '../lib/decomposition-plan-exit-guard.mjs';
import {
  classifyDecomposition,
  linkedPlanPath,
  visibleMetadataFieldValue,
} from '../lib/decomposition-policy.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import { buildSplitProposals, writeProposalFragments } from '../lib/split-plan.mjs';
import { resolveProjectDir } from '../lib/project-dir.mjs';

const pexec = promisify(execFile);
const DEFAULT_GOVERNING_SPEC =
  'docs/superpowers/specs/2026-08-03-nested-epic-decomposition-design.md';
const ISSUE_URL_RE = /\/issues\/(\d+)\b/;
const CREATED_ISSUE_TOKEN_RE = /^AITM_CREATED_ISSUE=(\d+)$/m;

async function defaultFetchIssueBody({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return stdout || '';
}

async function defaultResolveHead({ projectDir }) {
  const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], {
    cwd: projectDir,
    timeout: GH_API_TIMEOUT_MS,
  });
  return stdout.trim();
}

async function defaultReadPlanAtCommit({ projectDir, planCommit, planPath }) {
  const { stdout } = await pexec('git', ['show', `${planCommit}:${planPath}`], {
    cwd: projectDir,
    timeout: GH_API_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function defaultRunCreator(args, { projectDir }) {
  const orchestrator = path.join(projectDir, 'bin', 'aitm.mjs');
  try {
    const { stdout, stderr } = await pexec(process.execPath, [orchestrator, ...args], {
      cwd: projectDir,
      timeout: GH_API_TIMEOUT_MS * 3,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { exitCode: 0, stdout: stdout || '', stderr: stderr || '' };
  } catch (error) {
    return {
      exitCode: typeof error.code === 'number' ? error.code : 1,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || error.message || ''),
    };
  }
}

function parseCreatedIssueNumber(output) {
  const match = ISSUE_URL_RE.exec(String(output || ''));
  return match ? Number(match[1]) : null;
}

function parseCreatedIssueToken(output) {
  const match = CREATED_ISSUE_TOKEN_RE.exec(String(output || ''));
  return match ? Number(match[1]) : null;
}

async function defaultFetchParentIssue({ issueNumber, cfg }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { number parent { number } }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) },
    { timeout: GH_API_TIMEOUT_MS }
  );
  const issue = data?.repository?.issue;
  if (!issue) throw new Error(`split-plan: source issue #${issueNumber} was not found`);
  return issue.parent?.number ?? null;
}

function assertMode(mode) {
  if (mode !== 'dry-run' && mode !== 'confirm') {
    throw new Error('split-plan: exactly one of --dry-run and --confirm is required');
  }
}

export async function runSplitPlan({
  issueNumber,
  mode,
  planOverride = null,
  cfg,
  deps = {},
} = {}) {
  const sourceIssue = Number(issueNumber);
  if (!Number.isInteger(sourceIssue) || sourceIssue <= 0) {
    throw new Error('split-plan: issueNumber must be a positive integer');
  }
  assertMode(mode);
  if (!cfg?.repo) throw new Error('split-plan: cfg.repo is required');

  const projectDir = (deps.resolveProjectDir ?? resolveProjectDir)({
    issue: sourceIssue,
    deps,
  });
  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const evaluate = deps.evaluateIssueDecomposition || evaluateIssueDecomposition;
  const readPlanAtCommit = deps.readPlanAtCommit || defaultReadPlanAtCommit;
  const fetchParentIssue = deps.fetchParentIssue || defaultFetchParentIssue;
  const resolveHead = deps.resolveHead || defaultResolveHead;
  const runCreator = deps.runCreator || defaultRunCreator;
  const body = await fetchIssueBody({ issueNumber: sourceIssue, repo: cfg.repo });
  const evaluated = await evaluate({
    issueNumber: sourceIssue,
    cfg,
    body,
    planOverride,
    deps: deps.decomposition || {},
  });
  if (!evaluated.planDiagnostic?.path) {
    throw new Error(`split-plan: ${evaluated.planDiagnostic?.diagnostic || 'plan is unavailable'}`);
  }

  const planPath = planOverride || linkedPlanPath(body);
  if (!planPath) throw new Error('split-plan: source plan provenance is unavailable');
  const governingSpec =
    visibleMetadataFieldValue(body, 'Plan Metadata', 'Governing-spec') || DEFAULT_GOVERNING_SPEC;
  const [outerParent, planCommit] = await Promise.all([
    fetchParentIssue({ issueNumber: sourceIssue, cfg }),
    resolveHead({ projectDir }),
  ]);
  if (outerParent !== null && (!Number.isInteger(outerParent) || outerParent <= 0)) {
    throw new Error('split-plan: resolved parent must be null or a positive integer');
  }
  if (!String(planCommit || '').trim()) throw new Error('split-plan: HEAD commit is unavailable');
  const normalizedPlanCommit = String(planCommit).trim();
  const planText = await readPlanAtCommit({
    projectDir,
    planCommit: normalizedPlanCommit,
    planPath,
  });
  const classification = classifyDecomposition({
    size: evaluated.values?.size ?? null,
    estimateHours: evaluated.values?.estimate ?? null,
    planText,
  });
  if (classification.status === 'story-ok') {
    throw new Error('split-plan: source issue is story-ok and does not require decomposition');
  }
  const proposals = buildSplitProposals({
    sourceIssue,
    outerParent,
    planPath,
    planCommit: normalizedPlanCommit,
    governingSpec,
    planText,
  });
  const scratchDir =
    deps.scratchDir ||
    mkdtempSync(path.join(projectScratchDir('plan', projectDir), `split-${sourceIssue}-`));
  const drafts = [];
  for (const proposal of proposals) {
    const fragments = await writeProposalFragments({ proposal, scratchDir });
    drafts.push({ proposal, fragments, creatorArgs: fragments.creatorArgs });
  }

  const preflight = [];
  for (const draft of drafts) {
    const result = await runCreator([...draft.creatorArgs, '--dry-run'], { projectDir });
    preflight.push(result);
    if (result.exitCode !== 0) {
      throw new Error(
        `split-plan: preflight failed for ${draft.proposal.title} (exit ${result.exitCode}): ${result.stderr}`
      );
    }
  }
  const publicProposals = drafts.map((draft, index) => ({
    ...draft.proposal,
    creatorArgs: [...draft.creatorArgs],
    fragments: draft.fragments,
    renderedBody: preflight[index].stdout,
  }));
  if (mode === 'dry-run') {
    return { status: 'dry-run', issueNumber: sourceIssue, proposals: publicProposals };
  }

  const createdChildren = [];
  for (const draft of drafts) {
    const result = await runCreator([...draft.creatorArgs], { projectDir });
    if (result.exitCode !== 0) {
      const incompleteIssue = parseCreatedIssueToken(`${result.stdout}\n${result.stderr}`);
      if (incompleteIssue) {
        createdChildren.push({
          title: draft.proposal.title,
          issueNumber: incompleteIssue,
          incomplete: true,
        });
      }
      return {
        status: 'partial-success',
        issueNumber: sourceIssue,
        proposals: publicProposals,
        createdChildren,
        failed: {
          taskNumber: draft.proposal.task.number,
          title: draft.proposal.title,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        },
        recovery:
          'Inspect the created children before retrying; do not delete them. Resolve any duplicate-child refusal explicitly.',
      };
    }
    const createdIssue = parseCreatedIssueNumber(result.stdout);
    if (!createdIssue) {
      return {
        status: 'partial-success',
        issueNumber: sourceIssue,
        proposals: publicProposals,
        createdChildren,
        failed: {
          taskNumber: draft.proposal.task.number,
          title: draft.proposal.title,
          exitCode: 1,
          stdout: result.stdout,
          stderr: 'creator succeeded without an /issues/<N> URL',
        },
        recovery:
          'Inspect the created children before retrying; do not delete them. Resolve any duplicate-child refusal explicitly.',
      };
    }
    createdChildren.push({ title: draft.proposal.title, issueNumber: createdIssue });
  }
  return {
    status: 'created',
    issueNumber: sourceIssue,
    proposals: publicProposals,
    createdChildren,
  };
}

export function parseSplitPlanArgs(rest = []) {
  let issueNumber = null;
  let mode = null;
  let planOverride = null;
  let json = false;
  for (let index = 0; index < rest.length; index += 1) {
    const token = String(rest[index]);
    const issue = token.match(/^#?(\d+)$/);
    if (issue && issueNumber == null) issueNumber = Number(issue[1]);
    else if (token === '--dry-run' || token === '--confirm') {
      const nextMode = token.slice(2);
      if (mode) throw new Error('exactly one of --dry-run and --confirm is required');
      mode = nextMode;
    } else if (token === '--plan') {
      const value = rest[index + 1];
      if (!value || String(value).startsWith('--')) throw new Error('--plan requires a path');
      planOverride = rest[++index];
    } else if (token === '--json') json = true;
    else throw new Error(`unrecognized argument ${token}`);
  }
  return { issueNumber, mode, planOverride, json };
}

function formatProposal(proposal, index) {
  return [
    `## Child ${index + 1}: ${proposal.title}`,
    '',
    '### Scope',
    proposal.scope,
    '',
    '### Acceptance Criteria',
    proposal.acceptanceCriteria,
    '',
    '### Verification Commands',
    ...proposal.verificationCommands.map((command) => `- ${command}`),
    '',
    '### Story Origin',
    proposal.storyOrigin,
    '',
    '### Plan Metadata',
    proposal.planMetadata,
    '',
    `Creator argv: ${['npx', 'aitm', ...proposal.creatorArgs].map((token) => JSON.stringify(token)).join(' ')}`,
  ].join('\n');
}

export function formatSplitPlanResult(result) {
  if (result.status === 'dry-run') {
    return [
      `split-plan: ${result.proposals.length} child proposal(s) preflighted for #${result.issueNumber}`,
      '',
      ...result.proposals.flatMap((proposal, index) => [formatProposal(proposal, index), '']),
    ]
      .join('\n')
      .trimEnd();
  }
  if (result.status === 'created') {
    return `split-plan: created ${result.createdChildren.map((child) => `#${child.issueNumber}`).join(', ')}`;
  }
  return `split-plan: partial success after ${result.createdChildren.length} child(ren); task ${result.failed.taskNumber} (${result.failed.title}) failed (exit ${result.failed.exitCode}). ${result.recovery}`;
}

export async function verbSplitPlan(ctx) {
  let parsed;
  try {
    parsed = parseSplitPlanArgs(ctx.rest);
    if (!parsed.issueNumber || !parsed.mode) throw new Error('issue and mode are required');
  } catch (error) {
    process.stderr.write(`split-plan: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    const result = await runSplitPlan({
      issueNumber: parsed.issueNumber,
      mode: parsed.mode,
      planOverride: parsed.planOverride,
      cfg: ctx.cfg,
      deps: ctx.deps || {},
    });
    console.log(parsed.json ? JSON.stringify(result, null, 2) : formatSplitPlanResult(result));
    if (result.status === 'partial-success') process.exitCode = 6;
  } catch (error) {
    process.stderr.write(`split-plan: ${error.message}\n`);
    process.exitCode = 1;
  }
}
