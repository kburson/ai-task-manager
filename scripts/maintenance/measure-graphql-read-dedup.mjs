// @story #2037
// Read-only, isolated readiness-body benchmark. No lifecycle commands or effects.
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { prepareGraphqlQuery } from '../task-tracker/lib/graphql-usage/identity.mjs';
import {
  beginObservation,
  prepareUsageEnv,
} from '../task-tracker/lib/graphql-usage/collection.mjs';
import { readUsage, resolveUsageRoot } from '../task-tracker/lib/graphql-usage/storage.mjs';
import { currentSessionId } from '../task-tracker/word-counter.mjs';
import { readLastKnownState } from '../task-tracker/gh-timing-comment.mjs';

const MODULE = 'scripts/task-tracker/lib/action-decision/session.mjs';
const SCHEMA = 'aitm.graphql-read-dedup-measurement/v1';
const ENDPOINT = 'https://api.github.com/graphql';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const hash = (value) => /^[a-f0-9]{64}$/.test(value ?? '');
const fail = (reason) => {
  throw new Error(`measurement:${reason}`);
};

export function verifyMeasurement(value) {
  if (value?.schema !== SCHEMA || value.scope !== 'readiness-body' || value.endpoint !== ENDPOINT)
    fail('scope');
  if (!Number.isSafeInteger(value.account?.id) || value.account.id <= 0 || !value.account.login)
    fail('account');
  if (!Array.isArray(value.runs) || value.runs.length !== 4) fail('runs');
  const keys = new Set(),
    bodies = new Set(),
    queries = new Set(),
    resets = new Set(),
    ids = new Set();
  let requests = 0,
    points = 0;
  for (const run of value.runs) {
    const key = `${run.variant}:${run.action}`;
    if (
      !['baseline', 'candidate'].includes(run.variant) ||
      !['bind', 'resume'].includes(run.action) ||
      keys.has(key)
    )
      fail('variant');
    keys.add(key);
    if (!hash(run.source?.sha256) || !/^[a-f0-9]{40}$/.test(run.source.commit ?? ''))
      fail('source');
    if (
      run.result?.status !== 'ready' ||
      !Array.isArray(run.result.blockers) ||
      run.result.blockers.length
    )
      fail('decision');
    if (!Array.isArray(run.observations) || !run.observations.length) fail('observations');
    for (const row of run.observations) {
      const t = row.telemetry;
      if (
        !Number.isSafeInteger(row.cost) ||
        row.cost < 1 ||
        row.httpStatus !== 200 ||
        !hash(row.bodyHash) ||
        !hash(row.queryHash) ||
        !/^\d+$/.test(row.reset ?? '') ||
        !Number.isSafeInteger(row.remaining) ||
        row.remaining < 0
      )
        fail('response');
      if (
        !t?.callId ||
        ids.has(t.callId) ||
        t.observationKind !== 'http-attempt' ||
        t.outcome !== 'success' ||
        t.kind !== 'query' ||
        t.pointCost !== row.cost ||
        t.costSource !== 'same-response-rate-limit' ||
        t.costCoverage !== 'complete-observation' ||
        t.hiddenRequestCount !== 0 ||
        t.sessionSource !== 'runtime'
      )
        fail('coverage');
      ids.add(t.callId);
      bodies.add(row.bodyHash);
      queries.add(row.queryHash);
      resets.add(row.reset);
      requests++;
      points += row.cost;
    }
  }
  if (bodies.size !== 1 || queries.size !== 1) fail('subject-drift');
  if (requests > 12 || points > 24) fail('budget');
  const total = (run) => ({
    requests: run.observations.length,
    points: run.observations.reduce((s, r) => s + r.cost, 0),
  });
  const comparisons = ['bind', 'resume'].map((action) => {
    const beforeRun = value.runs.find((r) => r.action === action && r.variant === 'baseline');
    const afterRun = value.runs.find((r) => r.action === action && r.variant === 'candidate');
    if (!isDeepStrictEqual(beforeRun.result, afterRun.result)) fail('decision-drift');
    const before = total(beforeRun),
      after = total(afterRun);
    if (before.requests <= after.requests || before.points <= after.points) fail('no-reduction');
    return {
      action,
      before,
      after,
      savedPoints: before.points - after.points,
      savedPercent: (100 * (before.points - after.points)) / before.points,
    };
  });
  return {
    comparisons,
    requests,
    points,
    resetWindows: [...resets].sort(),
    sharedBudgetKnown: false,
  };
}

async function measure({ baselineRoot, candidateRoot, repository, issue }) {
  const env = await prepareUsageEnv({
    cwd: candidateRoot,
    env: { ...process.env, AITM_GRAPHQL_USAGE: '1' },
    runtimeSessionId: currentSessionId(),
  });
  const root = await resolveUsageRoot(candidateRoot);
  if (!root.available) fail('collector-root');
  const token = execFileSync(
    process.env.AITM_CAPTURE_REAL_GH || 'gh',
    ['auth', 'token', '--hostname', 'github.com'],
    { encoding: 'utf8' }
  ).trim();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'AITM-read-only-cost-measurement',
  };
  const identityResponse = await fetch('https://api.github.com/user', {
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!identityResponse.ok) fail('identity');
  const { login, id } = await identityResponse.json();
  const value = {
    schema: SCHEMA,
    scope: 'readiness-body',
    endpoint: ENDPOINT,
    account: { login, id },
    budgetScopeId: null,
    exclusions:
      'Other readiness ports are local and fixed; no lifecycle effects. One REST identity read is excluded from GraphQL point totals.',
    runs: [],
  };
  let requestCount = 0,
    pointCount = 0,
    remaining = null,
    halted = false;
  const [owner, repo] = repository.split('/');
  for (const [variant, action] of [
    ['baseline', 'bind'],
    ['candidate', 'bind'],
    ['candidate', 'resume'],
    ['baseline', 'resume'],
  ]) {
    const directory = variant === 'baseline' ? baselineRoot : candidateRoot;
    const { evaluateSessionReadiness } = await import(
      pathToFileURL(path.join(directory, MODULE)).href
    );
    const source = {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: directory,
        encoding: 'utf8',
      }).trim(),
      sha256: digest(readFileSync(path.join(directory, MODULE))),
      dirty: Boolean(
        execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
          cwd: directory,
          encoding: 'utf8',
        }).trim()
      ),
    };
    const run = { variant, action, source, observations: [] };
    let body;
    const result = await evaluateSessionReadiness({
      actionId: action,
      issue,
      stateBefore: { active: null, paused: false },
      config: { repo: repository, preferences: { gateAssigneeMatch: false } },
      projectDir: '/controlled',
      invokingDir: '/controlled',
      deps: {
        gql: async (query, variables) => {
          if (
            halted ||
            requestCount >= 12 ||
            pointCount >= 24 ||
            (remaining !== null && remaining < 1000)
          )
            fail('budget');
          if (variables.owner !== owner || variables.repo !== repo || variables.issue !== issue)
            fail('subject');
          const prepared = prepareGraphqlQuery(query);
          if (prepared.identity.kind !== 'query' || !prepared.alias) fail('read-only');
          const logicalOperationId = randomUUID();
          const finish = await beginObservation({
            cwd: candidateRoot,
            env,
            query,
            alias: prepared.alias,
            observationKind: 'http-attempt',
            logicalOperationId,
            context: { repository, issueNumber: issue },
          });
          if (!finish) fail('collector-unavailable');
          const startedAt = new Date().toISOString();
          requestCount++;
          let response, data;
          try {
            response = await fetch(ENDPOINT, {
              method: 'POST',
              headers,
              redirect: 'error',
              body: JSON.stringify({ query: prepared.query, variables }),
              signal: AbortSignal.timeout(15000),
            });
            data = await response.json();
          } catch (error) {
            halted = true;
            await finish({
              error,
              responseReceived: Boolean(response),
              httpStatus: response?.status ?? null,
            });
            throw error;
          }
          await finish({ response: data, headers: response.headers, httpStatus: response.status });
          if (
            !response.ok ||
            data.errors?.length ||
            !Number.isSafeInteger(data.data?.[prepared.alias]?.cost)
          ) {
            halted = true;
            fail('incomplete-response');
          }
          const cost = data.data[prepared.alias].cost;
          pointCount += cost;
          const rawRemaining = response.headers.get('x-ratelimit-remaining');
          remaining = rawRemaining === null ? null : Number(rawRemaining);
          if (!Number.isSafeInteger(remaining) || !response.headers.get('x-ratelimit-reset')) {
            halted = true;
            fail('rate-limit-headers');
          }
          body = data.data?.repository?.issue?.body;
          if (typeof body !== 'string') fail('body');
          run.observations.push({
            logicalOperationId,
            startedAt,
            endedAt: new Date().toISOString(),
            cost,
            bodyHash: digest(body),
            queryHash: digest(query),
            responseHash: digest(JSON.stringify(data)),
            requestId: response.headers.get('x-github-request-id'),
            httpStatus: response.status,
            remaining,
            reset: response.headers.get('x-ratelimit-reset'),
          });
          delete data.data[prepared.alias];
          return data.data;
        },
        fetchAssignmentSnapshot: async () => ({
          state: readLastKnownState(body).state,
          assignees: [],
        }),
        readWorktreeIdentity: () => ({ worktreePath: '/controlled' }),
        resolveProjectDir: () => '/controlled',
        readOccupancy: () => ({}),
        findMainWorktreePath: () => '/controlled',
        currentSessionId: () => 'controlled',
        loadMigrationJournal: () => null,
        decomposition: {
          subject: { repository, issue, projectId: null, projectItemId: null },
          runtime: {
            collect: async () => {
              throw new Error('Isolated body-read measurement; decomposition excluded');
            },
          },
        },
      },
    });
    run.result = { status: result.status, blockers: result.blockers, warnings: result.warnings };
    value.runs.push(run);
  }
  const usage = await readUsage(root.root);
  for (const run of value.runs)
    for (const observation of run.observations) {
      const rows = usage.observations.filter(
        (r) => r.logicalOperationId === observation.logicalOperationId
      );
      if (rows.length !== 1) fail('collector-count');
      observation.telemetry = rows[0];
    }
  verifyMeasurement(value);
  return value;
}

async function main() {
  const { values } = parseArgs({
    options: {
      verify: { type: 'string' },
      'baseline-root': { type: 'string' },
      repo: { type: 'string' },
      issue: { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'Read-only: --baseline-root PATH --repo OWNER/REPO --issue N --output FILE; offline: --verify FILE'
    );
    return;
  }
  if (values.verify) {
    if (Object.keys(values).length !== 1) fail('arguments');
    const value = JSON.parse(readFileSync(values.verify, 'utf8'));
    const result = verifyMeasurement(value);
    if (
      value.runs.some(
        (r) => r.variant === 'candidate' && r.source.sha256 !== digest(readFileSync(MODULE))
      )
    )
      fail('candidate-source-drift');
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const issue = Number(values.issue);
  if (
    !values['baseline-root'] ||
    !/^[\w.-]+\/[\w.-]+$/.test(values.repo ?? '') ||
    !Number.isSafeInteger(issue) ||
    issue <= 0 ||
    !values.output
  )
    fail('arguments');
  const value = await measure({
    baselineRoot: path.resolve(values['baseline-root']),
    candidateRoot: process.cwd(),
    repository: values.repo,
    issue,
  });
  mkdirSync(path.dirname(values.output), { recursive: true });
  writeFileSync(values.output, JSON.stringify(value, null, 2) + '\n');
  console.log(JSON.stringify(verifyMeasurement(value), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
