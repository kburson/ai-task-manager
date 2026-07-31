#!/usr/bin/env node
// ensure-wave-parent.mjs — controller-owned pre-flight for a fan-out.
//
// Mutating all-solo waves require --anchor. That already-existing controller
// owns one lease root for the full create/tether/body/reparent/title/timing
// chain; neither a child nor the newly-created parent becomes the authority.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { GH_API_TIMEOUT_MS } from '../task-tracker/lib/process-timeouts.mjs';
import { loadConfig } from '../task-tracker/config.mjs';
import { classify, rejectionMessage } from './lib/wave-detect.mjs';
import { gql, splitRepo } from './lib/github-projects.mjs';
import { ensureParentEpicTitle } from './lib/epic-retitle.mjs';
import { ensureWaveParentCore } from './lib/ensure-wave-parent-core.mjs';
import { createGovernedInternalIssue, reconcileGovernedInternalIssue } from './create-issue.mjs';
import { buildRow, postTimingEvent } from '../task-tracker/gh-timing-comment.mjs';
import { durableWordMarker } from '../task-tracker/state.mjs';
import { getProjectDir } from '../task-tracker/paths.mjs';
import { createRuntimeGovernedEffectAdapter } from '../task-tracker/lib/work-lease/governed-effect.mjs';
import { isGovernedAuthorityError } from '../task-tracker/lib/work-lease/governed-effect.mjs';
import { buildOwnedChildEnvironment } from '../task-tracker/lib/work-lease/child-environment.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(
  __dir,
  '..',
  '..',
  'skill',
  'shared',
  'templates',
  'wave-parent.md'
);

function parseArgs(argv) {
  const out = { children: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--children') {
      out.children.push(
        ...(argv[++i] || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      );
    } else if (arg === '--child') out.children.push(argv[++i]);
    else if (arg === '--purpose') out.purpose = argv[++i];
    else if (arg === '--anchor') out.anchor = argv[++i];
    else if (arg === '--priority') out.priority = argv[++i];
    else if (arg === '--rank') out.rank = argv[++i];
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '-h' || arg === '--help') out.help = true;
  }
  return out;
}

function usage() {
  return (
    'Usage: ensure-wave-parent.mjs --children N1,N2,... --purpose "<text>" ' +
    '--anchor <existing-controller-N> [--priority p0|p1|p2] [--rank <n>] [--dry-run]'
  );
}

function usageError(message) {
  const error = new Error(message);
  error.exitCode = 2;
  return error;
}

export function waveId(children) {
  const sorted = [...children]
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const hash = createHash('sha1').update(sorted.join(',')).digest('hex').slice(0, 10);
  return `${sorted.join('-')}.${hash}`;
}

function renderTemplate({ purpose, children, waveIdValue }) {
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  return template
    .replaceAll('{{purpose}}', purpose)
    .replaceAll('{{children}}', children.map((number) => `- [ ] #${number}`).join('\n'))
    .replaceAll('{{wave_id}}', waveIdValue);
}

export async function findExistingParentByWaveId({
  repo,
  waveIdValue,
  assignee,
  env,
  execFile = execFileSync,
}) {
  const marker = `wave-id: ${waveIdValue}`;
  const args = [
    'search',
    'issues',
    `"${marker}" in:body repo:${repo} state:open`,
    '--json',
    'number,body',
    '--limit',
    '20',
  ];
  if (assignee) args.push('--author', assignee.replace(/^@/, ''));
  let stdout;
  try {
    stdout = execFile('gh', args, {
      encoding: 'utf8',
      timeout: GH_API_TIMEOUT_MS,
      env,
    });
  } catch (error) {
    if (isGovernedAuthorityError(error)) throw error;
    throw new Error(`ensure-wave-parent: failed to search for existing wave parent: ${error.message}`);
  }
  try {
    return (
      JSON.parse(stdout || '[]').find(
        (row) => typeof row.body === 'string' && row.body.includes(marker)
      )?.number || null
    );
  } catch (error) {
    throw new Error(`ensure-wave-parent: malformed existing-parent search response: ${error.message}`);
  }
}

async function getIssueNodeId({ repo, issueNumber, runGql = gql }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await runGql(
    `query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){issue(number:$n){id}}}`,
    { owner, name: repoName, n: Number(issueNumber) }
  );
  return data?.repository?.issue?.id || null;
}

async function addSubIssue({ parentId, childId, runGql = gql }) {
  await runGql(
    `mutation($parent:ID!,$child:ID!){addSubIssue(input:{issueId:$parent,subIssueId:$child}){issue{id} subIssue{id}}}`,
    { parent: parentId, child: childId }
  );
}

export async function runEnsureWaveParent({
  rawArgs = process.argv.slice(2),
  cfg: suppliedConfig,
  deps = {},
} = {}) {
  if (wantsHelp(rawArgs)) {
    emitSelfDoc('ensure-wave-parent');
    return { status: 'help' };
  }
  const args = parseArgs(rawArgs);
  if (args.children.length === 0) {
    throw usageError(`ensure-wave-parent: --children is required\n${usage()}`);
  }
  const cfg = suppliedConfig || loadConfig();
  if (!cfg.repo) throw usageError('ensure-wave-parent: no repo configured');

  const classification = await (deps.classify || classify)({
    candidates: args.children,
    repo: cfg.repo,
  });
  if (classification.kind === 'empty' || classification.kind === 'single') {
    process.stdout.write('NO_WAVE_PARENT_NEEDED\n');
    return { status: 'no-parent' };
  }
  if (classification.kind === 'all-parented-shared') {
    const parentNumber = Number([...classification.parents][0]);
    process.stdout.write(`PARENT: #${parentNumber}\n`);
    return { status: 'existing-parent', parentNumber };
  }
  if (classification.kind === 'mixed' || classification.kind === 'multi-parent') {
    throw usageError(rejectionMessage(classification));
  }
  if (!args.purpose) {
    throw usageError('ensure-wave-parent: --purpose is required for solo fan-out');
  }
  if (args.dryRun) {
    process.stdout.write(`DRY_RUN: would create parent for [${classification.solos.join(',')}]\n`);
    return { status: 'dry-run' };
  }
  if (!/^#?\d+$/.test(String(args.anchor || ''))) {
    throw usageError(
      'ensure-wave-parent: --anchor <existing-controller-N> is required for solo fan-out'
    );
  }

  const controllerIssueId = Number(String(args.anchor).replace(/^#/, ''));
  const projectDir = deps.projectDir || getProjectDir(deps.env);
  const withGovernedEffect =
    deps.withGovernedEffect ||
    createRuntimeGovernedEffectAdapter({
      projectDir,
      config: cfg,
    });
  const runGql = deps.runGql || gql;
  const findExisting = deps.findExistingParentByWaveId || findExistingParentByWaveId;
  const createInternal = deps.createGovernedInternalIssue || createGovernedInternalIssue;
  const reconcileInternal = deps.reconcileGovernedInternalIssue || reconcileGovernedInternalIssue;

  const parent = await ensureWaveParentCore({
    controllerIssueId,
    children: classification.solos,
    purpose: args.purpose,
    cfg,
    withGovernedEffect,
    deps: {
      waveId,
      findExistingParent: async ({ waveIdValue, leaseContext }) => {
        const env = buildOwnedChildEnvironment({
          baseEnv: deps.env ?? process.env,
          leaseContext,
          tokenEnv: cfg.workLease?.tokenEnv,
        });
        const existing = await findExisting({
          repo: cfg.repo,
          waveIdValue,
          assignee: cfg.assignee,
          env,
        });
        if (existing) {
          process.stderr.write(
            `ensure-wave-parent: reusing existing parent #${existing} ` +
              `(wave-id ${waveIdValue})\n`
          );
        }
        return existing;
      },
      createParent: ({ children, purpose, waveIdValue, withGovernedEffect, leaseContext }) =>
        createInternal({
          title: `Wave: ${purpose}`.slice(0, 200),
          bodyContent: renderTemplate({ purpose, children, waveIdValue }),
          cfg,
          priority: args.priority,
          rank: args.rank,
          finalStatus: 'develop',
          withGovernedEffect,
          authorityIssueId: controllerIssueId,
          env: buildOwnedChildEnvironment({
            baseEnv: deps.env ?? process.env,
            leaseContext,
            tokenEnv: cfg.workLease?.tokenEnv,
          }),
          deps: deps.createIssueDeps || {},
          reconcile: false,
        }),
      ensureParentReady: ({ parentNumber, withGovernedEffect, leaseContext }) =>
        reconcileInternal({
          issueNumber: parentNumber,
          cfg,
          priority: args.priority,
          rank: args.rank,
          finalStatus: 'develop',
          withGovernedEffect,
          authorityIssueId: controllerIssueId,
          env: buildOwnedChildEnvironment({
            baseEnv: deps.env ?? process.env,
            leaseContext,
            tokenEnv: cfg.workLease?.tokenEnv,
          }),
          deps: deps.createIssueDeps || {},
        }),
      getIssueNodeId: ({ issueNumber, leaseContext }) =>
        (deps.getIssueNodeId || getIssueNodeId)({
          repo: cfg.repo,
          issueNumber,
          runGql: (query, variables, options = {}) =>
            runGql(query, variables, {
              ...options,
              env: buildOwnedChildEnvironment({
                baseEnv: deps.env ?? process.env,
                leaseContext,
                tokenEnv: cfg.workLease?.tokenEnv,
              }),
            }),
        }),
      addSubIssue: ({ parentId, childId, leaseContext }) =>
        (deps.addSubIssue || addSubIssue)({
          parentId,
          childId,
          runGql: (query, variables, options = {}) =>
            runGql(query, variables, {
              ...options,
              env: buildOwnedChildEnvironment({
                baseEnv: deps.env ?? process.env,
                leaseContext,
                tokenEnv: cfg.workLease?.tokenEnv,
              }),
            }),
        }),
      ensureParentEpicTitle: ({
        parentId,
        withGovernedEffect: controllerContinuation,
        leaseContext,
      }) =>
        (deps.ensureParentEpicTitle || ensureParentEpicTitle)({
          parentId,
          runGql: (query, variables, options = {}) =>
            runGql(query, variables, {
              ...options,
              env: buildOwnedChildEnvironment({
                baseEnv: deps.env ?? process.env,
                leaseContext,
                tokenEnv: cfg.workLease?.tokenEnv,
              }),
            }),
          withGovernedEffect: controllerContinuation,
          authorityIssueId: controllerIssueId,
        }),
      postTimingEvent: async ({
        parentNumber,
        waveIdValue,
        withGovernedEffect: controllerContinuation,
        leaseContext,
      }) => {
        if ((deps.env || process.env).TT_SKIP_NETWORK === '1') return;
        const row = buildRow({
          ts: new Date().toISOString(),
          event: 'start',
          activeSec: 0,
          idleSec: 0,
          deltaWords: 0,
          wordMarker: durableWordMarker(projectDir),
          description: `orchestration start — wave fan-out (${classification.solos.length} children)`,
        });
        const remapToController = (_requested, callback) =>
          controllerContinuation(
            {
              issueId: String(controllerIssueId),
              operation: 'evidence-mutation',
              heartbeat: true,
            },
            callback
          );
        return (deps.postTimingEvent || postTimingEvent)({
          issueNumber: `#${parentNumber}`,
          repo: cfg.repo,
          row,
          projectionId: `wave-parent:${waveIdValue}`,
          subOperationId: `controller:${controllerIssueId}:orchestration-start`,
          timeoutMs: cfg.hookNetworkTimeoutMs ?? 5000,
          env: buildOwnedChildEnvironment({
            baseEnv: deps.env ?? process.env,
            leaseContext,
            tokenEnv: cfg.workLease?.tokenEnv,
          }),
          withGovernedEffect: remapToController,
          deps: deps.timing || {},
        });
      },
    },
  });

  process.stdout.write(`PARENT: #${parent.parentNumber}\n`);
  return { status: 'parent', ...parent };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runEnsureWaveParent().catch((error) => {
    process.stderr.write(`ensure-wave-parent error: ${error.message}\n`);
    process.exit(error.exitCode || 1);
  });
}
