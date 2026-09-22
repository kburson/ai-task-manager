// @story #1675
// Fresh, read-only operational explanations. This module receives no mutation port.
import { enforceDirectGuidance } from '../lib/direct-guidance-admission.mjs';
enforceDirectGuidance(import.meta.url, 'explain', { surface: 'direct-verb' });
import { buildExplanationEnvelope } from '../../../guidance/protocol.mjs';
import { loadGuidance } from '../../../guidance/cache.mjs';
import { pexec } from '../../gh/lib/gh-client.mjs';
import { loadConfig } from '../config.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { getProjectDir, statePath } from '../paths.mjs';
import { loadState } from '../state.mjs';
import { resolveProjectDir } from '../lib/project-dir.mjs';
import { fetchAssignmentSnapshot } from '../lib/assignment-snapshot.mjs';
import { loadReadyForPlanMigrationJournal } from '../lib/ready-for-plan-migration-freeze.mjs';
import { createObservationAttempt } from '../lib/action-decision/observations.mjs';
import { evaluateAction } from '../lib/action-decision/evaluate.mjs';
import { evaluateSessionReadiness } from '../lib/action-decision/session.mjs';
import { evaluateTestReadiness } from '../lib/action-decision/test.mjs';
import { evaluateReviewReadiness } from '../lib/action-decision/review.mjs';
import { evaluateCloseReadiness } from '../lib/action-decision/close.mjs';

const ALIASES = Object.freeze({ next: 'promote', review: 'review', close: 'close' });
const VALUE_FLAGS = new Set(['--action', '--known', '--known-source']);
const SINGLETON_FLAGS = new Set(['--action', '--known-source', '--diagnostic', '--json']);

function fail(reason) {
  throw new TypeError(`explain:${reason}`);
}

function issueNumber(value) {
  const normalized = String(value ?? '').replace(/^#/, '');
  if (!/^[1-9]\d*$/.test(normalized)) fail('issue');
  const issue = Number(normalized);
  if (!Number.isSafeInteger(issue)) fail('issue');
  return issue;
}

/** Return `{ matched: false }` for ordinary lifecycle execution. */
export function parseExplainInvocation(argv = []) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== 'string')) fail('argv');
  const [verb, rawIssue, ...rawFlags] = argv;
  const alias = Object.hasOwn(ALIASES, verb);
  const canonical = verb === 'explain';
  const explainFlag = rawFlags.includes('--explain');
  if (!canonical && !(alias && explainFlag)) return { matched: false };
  const issue = issueNumber(rawIssue);
  const flags = alias ? rawFlags.filter((flag) => flag !== '--explain') : rawFlags;
  if (alias && rawFlags.filter((flag) => flag === '--explain').length !== 1) fail('explain-flag');
  const seen = new Set();
  const known = [];
  let actionId = alias ? ALIASES[verb] : 'promote';
  let knownSource = null;
  let diagnostic = false;
  let json = false;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (!VALUE_FLAGS.has(flag) && !['--diagnostic', '--json'].includes(flag))
      fail(`option:${flag}`);
    if (SINGLETON_FLAGS.has(flag) && seen.has(flag)) fail(`duplicate:${flag}`);
    seen.add(flag);
    if (VALUE_FLAGS.has(flag)) {
      const value = flags[index + 1];
      if (!value || value.startsWith('--')) fail(`value:${flag}`);
      index += 1;
      if (flag === '--action') actionId = value;
      else if (flag === '--known') known.push(value);
      else knownSource = value;
    } else if (flag === '--diagnostic') diagnostic = true;
    else json = true;
  }
  if (!json) fail('json-required');
  if (alias && seen.has('--action')) fail('alias-action');
  return { matched: true, issue, actionId, known, knownSource, diagnostic };
}

/** Injectable command core; `evaluate` must perform exactly one fresh read-only evaluation. */
export async function runExplain(
  request,
  {
    evaluate,
    loadAgentIndex = ({ projectRoot }) => {
      const loaded = loadGuidance({ projectRoot, need: 'agent' });
      if (!loaded.valid || !loaded.agentIndex) throw new TypeError('explain:guidance');
      return loaded.agentIndex;
    },
    projectRoot = process.cwd(),
    admissionWarnings = [],
    stdout = process.stdout,
  } = {}
) {
  if (typeof evaluate !== 'function') fail('evaluator');
  const evaluated = await evaluate({
    issue: request.issue,
    actionId: request.actionId,
    diagnostic: request.diagnostic,
  });
  const agentIndex = await loadAgentIndex({ projectRoot });
  const envelope = buildExplanationEnvelope({
    decision: evaluated.decision,
    agentIndex,
    known: request.known,
    knownSource: request.knownSource,
    admissionWarnings,
    diagnostic: request.diagnostic,
    diagnosticMessages: request.diagnostic ? (evaluated.diagnosticMessages ?? []) : [],
  });
  stdout.write(`${JSON.stringify(envelope)}\n`);
  return envelope;
}

async function readIssueBody({ issue, repository }) {
  return (
    await pexec('gh', [
      'issue',
      'view',
      String(issue),
      '-R',
      repository,
      '--json',
      'body',
      '--jq',
      '.body',
    ])
  ).stdout;
}

function observationKey({ resource, identity, scope }) {
  return JSON.stringify([resource, identity, scope]);
}

async function replayAttempt({ repository, issue, actionId, bundle }) {
  const observations = new Map(
    bundle.observations.map((observation) => [observationKey(observation), observation])
  );
  const attempt = createObservationAttempt({
    repository,
    issue,
    boundaryId: `explain:${actionId}:${issue}`,
    now: () => new Date().toISOString(),
    read: async (request) => {
      const observation = observations.get(observationKey(request));
      if (!observation || observation.status !== 'observed') {
        throw new Error(observation?.provenance?.detail ?? 'authority observation unavailable');
      }
      return { ...request, value: observation.value, revision: observation.revision ?? undefined };
    },
  });
  for (const observation of bundle.observations) {
    await attempt.observe({
      resource: observation.resource,
      identity: observation.identity,
      scope: observation.scope,
    });
  }
  return attempt;
}

function liveAttempt({ repository, issue, actionId, body, cfg, projectRoot }) {
  return createObservationAttempt({
    repository,
    issue,
    boundaryId: `explain:${actionId}:${issue}`,
    now: () => new Date().toISOString(),
    read: async (request) => {
      let value;
      if (request.resource === 'issue-body') value = { number: issue, body };
      else if (request.resource === 'project-board') {
        value = await fetchAssignmentSnapshot({ issueNumber: issue, cfg });
      } else if (request.resource === 'migration-journal') {
        const journal = loadReadyForPlanMigrationJournal({ projectDir: projectRoot });
        value = { active: Boolean(journal && journal.phase !== 'final-verification') };
      } else {
        throw new TypeError(`explain:unsupported-read:${request.resource}`);
      }
      return { ...request, value };
    },
  });
}

function failedAttempt({ repository, issue, actionId }) {
  return createObservationAttempt({
    repository,
    issue,
    boundaryId: `explain:${actionId}:${issue}`,
    now: () => new Date().toISOString(),
    read: async () => {
      throw new Error('initial authority read unavailable');
    },
  });
}

/** Production evaluation entry. It exposes read ports only and never builds the mutation context. */
export async function evaluateExplanation({ issue, actionId, projectRoot = getProjectDir() } = {}) {
  const cfg = loadConfig();
  const repository = cfg.repo;
  if (typeof repository !== 'string' || !repository.includes('/')) fail('repository');
  let body;
  let head;
  let sessionState;
  try {
    body = await readIssueBody({ issue, repository });
    head = (await pexec('git', ['rev-parse', 'HEAD'], { cwd: projectRoot })).stdout.trim();
    sessionState = loadState(statePath(projectRoot));
  } catch {
    const decision = await evaluateAction({
      actionId,
      repository,
      issue,
      inputs: {
        state: 'unknown',
        head: '0'.repeat(40),
        body: '',
        sessionState: {},
        config: cfg,
      },
      attempt: failedAttempt({ repository, issue, actionId }),
      deps: { effectAttempts: () => [] },
    });
    return { decision, diagnosticMessages: [] };
  }
  const state = readLastKnownState(body).state ?? 'unknown';
  const requestedAction = actionId;
  const resolveBoundDirSilently = ({ issue: targetIssue }) =>
    resolveProjectDir({
      issue: targetIssue,
      deps: { invokingDir: projectRoot, logOverride: () => {} },
    });
  const effectiveAction =
    actionId === 'promote' && state === 'develop'
      ? 'test'
      : actionId === 'promote' && state === 'test'
        ? 'review'
        : actionId === 'promote' && state === 'review'
          ? 'close'
          : actionId;
  let readiness = null;
  if (effectiveAction === 'bind' || effectiveAction === 'resume') {
    readiness = await evaluateSessionReadiness({
      actionId: effectiveAction,
      issue,
      stateBefore: sessionState,
      config: cfg,
      projectDir: projectRoot,
      invokingDir: projectRoot,
    });
  } else if (effectiveAction === 'test') {
    readiness = await evaluateTestReadiness({
      issue,
      cfg,
      projectDir: projectRoot,
      body,
      head,
      deps: { resolveBoundDir: resolveBoundDirSilently },
    });
  } else if (effectiveAction === 'review') {
    readiness = await evaluateReviewReadiness({
      issue,
      cfg,
      projectDir: projectRoot,
      deps: { resolveBoundDir: resolveBoundDirSilently },
    });
  } else if (effectiveAction === 'close') {
    readiness = await evaluateCloseReadiness({
      issue,
      cfg,
      projectDir: projectRoot,
      deps: { resolveBoundDir: resolveBoundDirSilently },
    });
  }
  const attempt = readiness?.bundle
    ? await replayAttempt({ repository, issue, actionId, bundle: readiness.bundle })
    : liveAttempt({ repository, issue, actionId, body, cfg, projectRoot });
  const decision = await evaluateAction({
    actionId: requestedAction,
    repository,
    issue,
    inputs: { state, head, body, sessionState, config: cfg },
    attempt,
    deps: {
      effectAttempts: () => [],
      ...(readiness?.bundle
        ? {
            collectReadiness: async () => {
              const { bundle: _bundle, ...result } = readiness;
              return result;
            },
          }
        : {}),
      promotePorts: { cfg, projectDir: projectRoot },
      testPorts: { cfg, projectDir: projectRoot },
      reviewPorts: { cfg, projectDir: projectRoot },
      closePorts: { cfg, projectDir: projectRoot },
    },
  });
  return { decision, diagnosticMessages: [] };
}
