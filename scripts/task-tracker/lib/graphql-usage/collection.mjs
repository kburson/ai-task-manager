// @story #1837
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrollUsage, createUsageWriter } from './storage.mjs';
import { sessionIdEnvKeys } from '../session-id.mjs';
import { prepareGraphqlQuery, identifyGraphqlOperation } from './identity.mjs';

export function usageEnabled(env = process.env) {
  return env.AITM_GRAPHQL_USAGE === '1';
}
const warning = (code = 'collection-failure') =>
  process.stderr.write('[aitm graphql-usage] ' + code + '\n');
async function reportDiagnostics(enrollment, writer = null) {
  const entries = enrollment.diagnostics || [];
  for (const entry of entries) warning(entry.code);
  if (!enrollment.available || entries.length === 0) return;
  const sink = writer || (await createUsageWriter(enrollment));
  try {
    for (const entry of entries) await sink.appendDiagnostic(entry);
  } finally {
    if (!writer) await sink.close();
  }
}
export async function prepareUsageEnv({
  cwd = process.cwd(),
  env = process.env,
  launchRoute = 'measurement-launcher',
  permissionContext,
  runtimeSessionId,
} = {}) {
  if (!usageEnabled(env)) return env;
  try {
    runtimeSessionId ||=
      !env.AITM_GRAPHQL_USAGE_CONTEXT &&
      sessionIdEnvKeys(env)
        .map((key) => env[key])
        .find((value) => typeof value === 'string' && value.length > 0);
    const enrollment = await enrollUsage({
      cwd,
      env,
      descendant: Boolean(env.AITM_GRAPHQL_USAGE_CONTEXT),
      launchRoute,
      permissionContext: permissionContext || env.AITM_GRAPHQL_USAGE_PERMISSION_CONTEXT,
      trustedRuntime: Boolean(runtimeSessionId),
      runtimeSessionId,
    });
    await reportDiagnostics(enrollment);
    const shimDir = fileURLToPath(new URL('../../action-capture-bin', import.meta.url));
    const realGh =
      env.AITM_CAPTURE_REAL_GH ||
      String(env.PATH || '')
        .split(path.delimiter)
        .filter((entry) => path.resolve(entry || '.') !== shimDir)
        .map((entry) => path.resolve(entry || '.', 'gh'))
        .find((file) => {
          try {
            fs.accessSync(file, fs.constants.X_OK);
            return fs.statSync(file).isFile();
          } catch {
            return false;
          }
        });
    if (!realGh) return env;
    return {
      ...env,
      ...enrollment.env,
      PATH: [
        shimDir,
        ...String(env.PATH || '')
          .split(path.delimiter)
          .filter((entry) => entry !== shimDir),
      ].join(path.delimiter),
      AITM_CAPTURE_REAL_GH: realGh,
      AITM_GRAPHQL_USAGE_PROJECT_DIR: cwd,
      ...(permissionContext ? { AITM_GRAPHQL_USAGE_PERMISSION_CONTEXT: permissionContext } : {}),
    };
  } catch {
    warning();
    return env;
  }
}

const ghValueFlags = new Set([
  '--add-assignee',
  '--add-blocked-by',
  '--add-blocking',
  '--add-label',
  '--add-project',
  '--add-sub-issue',
  '--assignee',
  '--body',
  '--body-file',
  '--comment',
  '--hostname',
  '--json',
  '--jq',
  '--limit',
  '--milestone',
  '--parent',
  '--remove-assignee',
  '--remove-blocked-by',
  '--remove-blocking',
  '--remove-label',
  '--remove-project',
  '--remove-sub-issue',
  '--repo',
  '--search',
  '--state',
  '--template',
  '--title',
  '--type',
  '-R',
  '-F',
  '-b',
  '-m',
  '-t',
]);
const ghSwitchFlags = new Set([
  '--help',
  '--remove-milestone',
  '--remove-parent',
  '--remove-type',
  '--web',
]);

export function parseGhArguments(args = []) {
  const operands = [];
  let hostname = null;
  let repository = null;
  let ambiguous = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index]);
    if (arg === '--') {
      operands.push(...args.slice(index + 1).filter((_, offset) => index + 1 + offset > 1));
      break;
    }
    const option = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    if (ghValueFlags.has(option)) {
      const value = option === arg ? args[++index] : arg.slice(option.length + 1);
      if (value === undefined) ambiguous = true;
      if (option === '--hostname') hostname = value || null;
      if (option === '--repo' || option === '-R') repository = value || null;
      continue;
    }
    if (arg.length > 2 && ghValueFlags.has(arg.slice(0, 2))) {
      if (arg.startsWith('-R')) repository = arg.slice(2);
      continue;
    }
    if (ghSwitchFlags.has(arg)) continue;
    if (arg.startsWith('-')) {
      ambiguous = true;
      continue;
    }
    if (index > 1) operands.push(arg);
  }
  return { operands, hostname, repository, ambiguous };
}

function issueOperandNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/[^/]+\/[^/]+\/issues\/(\d+)\/?$/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}
export function dispatchContext({
  args = [],
  variables = {},
  repository = null,
  lifecycleState = null,
  stateSource = 'argument',
  issueNumber = null,
} = {}) {
  const parsed = parseGhArguments(args);
  const targetArgs = args[0] === 'issue' ? parsed.operands : [];
  const explicit = targetArgs.map(issueOperandNumber);
  const ambiguousTargets =
    args[0] === 'issue' &&
    (parsed.ambiguous || explicit.some((value) => !Number.isSafeInteger(value)));
  const values = [
    issueNumber,
    ...explicit,
    variables.issue,
    variables.issueNumber,
    ...(Array.isArray(variables.issues) ? variables.issues : []),
  ]
    .filter((value) => Number.isSafeInteger(Number(value)) && Number(value) > 0)
    .map(Number);
  const issues = ambiguousTargets ? [] : [...new Set(values)];
  return {
    repository: /^[\w.-]+\/[\w.-]+$/.test(repository || '') ? repository : null,
    issueNumber: issues.length === 1 ? issues[0] : null,
    draftId: null,
    lifecycleState:
      issues.length === 1 && /^[a-z][a-z-]*$/.test(lifecycleState || '')
        ? lifecycleState
        : 'unknown',
    stateSource:
      issues.length === 1 &&
      /^[a-z][a-z-]*$/.test(lifecycleState || '') &&
      ['local', 'argument'].includes(stateSource)
        ? stateSource
        : 'unknown',
    contextScope:
      issues.length > 1 ? 'multiple-issues' : issues.length === 1 ? 'single-issue' : 'unknown',
  };
}

export async function beginObservation({
  env = process.env,
  cwd = env.AITM_GRAPHQL_USAGE_PROJECT_DIR || process.cwd(),
  query,
  selectedOperation,
  context = {},
  observationKind = 'opaque-cli-invocation',
  logicalOperationId,
  pageIndex = null,
  alias = null,
  endpointHost = 'api.github.com',
} = {}) {
  if (!usageEnabled(env)) return null;
  try {
    const enrollment = await enrollUsage({
      cwd,
      env,
      descendant: true,
      permissionContext: env.AITM_GRAPHQL_USAGE_PERMISSION_CONTEXT,
    });
    if (!enrollment.available) {
      await reportDiagnostics(enrollment);
      return null;
    }
    const writer = await createUsageWriter(enrollment);
    await reportDiagnostics(enrollment, writer);
    const c = enrollment.context;
    const callId = randomUUID();
    const startedAt = new Date().toISOString();
    const row = {
      schemaVersion: 'aitm.graphql-usage.observation/v1',
      callId,
      logicalOperationId: logicalOperationId || callId,
      startedAt,
      endedAt: startedAt,
      durationMs: 0,
      ...Object.fromEntries(
        [
          'worktreeId',
          'sessionId',
          'sessionSource',
          'enrollmentId',
          'commonRootId',
          'collectorLaunchRoute',
          'originatingLaunchRoute',
        ].map((key) => [key, c[key]])
      ),
      processId: process.pid,
      ...dispatchContext(context),
      observationKind,
      dispatchStatus: 'unknown',
      pageIndex,
      ...identifyGraphqlOperation(query, { selectedOperation }),
      outcome: 'unknown',
      httpStatus: null,
      processExitCode: null,
      errorClass: null,
      pointCost: null,
      costSource: null,
      costUnknownReason: 'unknown',
      costCoverage: 'unknown',
      hiddenRequestCount: observationKind === 'http-attempt' ? 0 : null,
      costBasis: 'instrumented-request',
      augmentationVersion: alias ? 'v1' : null,
      collectorVersion: 'v1',
      endpointHost,
      budgetScopeId: null,
      rateLimit: null,
      rateLimitUnavailableReason:
        observationKind === 'http-attempt' ? 'not-returned' : 'transport-unavailable',
    };
    let completed = false;
    return async ({
      response = null,
      headers = null,
      httpStatus = null,
      processExitCode = null,
      error = null,
      signal = null,
      responseReceived = false,
    } = {}) => {
      if (completed) return;
      completed = true;
      try {
        row.endedAt = new Date().toISOString();
        row.durationMs = Math.max(0, Date.parse(row.endedAt) - Date.parse(startedAt));
        row.httpStatus = httpStatus;
        row.processExitCode = processExitCode;
        const timeout = signal || ['TimeoutError', 'AbortError'].includes(error?.name);
        row.dispatchStatus =
          error?.code === 'ENOENT'
            ? 'not-sent'
            : responseReceived
              ? 'sent'
              : error || signal
                ? 'unknown'
                : 'sent';
        row.errorClass = timeout
          ? 'timeout'
          : error
            ? error.code === 'ENOENT'
              ? 'spawn-error'
              : responseReceived
                ? httpStatus >= 400
                  ? 'http-error'
                  : 'parse-error'
                : 'unknown'
            : httpStatus >= 400
              ? 'http-error'
              : response?.errors
                ? 'graphql-errors'
                : processExitCode
                  ? 'unknown'
                  : null;
        row.outcome = timeout
          ? 'timeout'
          : row.errorClass
            ? response?.data && row.errorClass === 'graphql-errors'
              ? 'partial'
              : 'failure'
            : 'success';
        const cost = alias && response?.data?.[alias]?.cost;
        if (
          row.kind === 'query' &&
          row.dispatchStatus === 'sent' &&
          Number.isSafeInteger(cost) &&
          cost >= 0
        ) {
          row.pointCost = cost;
          row.costSource = 'same-response-rate-limit';
          row.costUnknownReason = null;
          row.costCoverage =
            observationKind === 'http-attempt' ? 'complete-observation' : 'visible-response-only';
        } else
          row.costUnknownReason =
            row.dispatchStatus === 'not-sent'
              ? 'not-dispatched'
              : row.dispatchStatus === 'unknown'
                ? 'ambiguous-dispatch'
                : row.kind === 'mutation'
                  ? 'mutation-cost-unavailable'
                  : ['mixed', 'unknown'].includes(row.kind)
                    ? 'unsupported-syntax'
                    : observationKind === 'opaque-cli-invocation'
                      ? 'opaque-cli'
                      : 'no-same-response-cost';
        if (headers) {
          const budget = {};
          for (const key of ['limit', 'remaining', 'used', 'reset']) {
            const value = headers.get(`x-ratelimit-${key}`);
            budget[key] =
              value !== null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
                ? Number(value)
                : null;
          }
          const resource = headers.get('x-ratelimit-resource');
          budget.resource = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(resource || '')
            ? resource
            : null;
          if (Object.values(budget).some((value) => value !== null)) {
            row.rateLimit = budget;
            row.rateLimitUnavailableReason = null;
          }
        }
        await writer.append(row);
      } catch {
        warning();
      } finally {
        await writer.close().catch(warning);
      }
    };
  } catch {
    warning();
    return null;
  }
}

export async function observeGraphqlHttp(
  url,
  options,
  {
    fetch: transport = globalThis.fetch,
    env = process.env,
    cwd,
    logicalOperationId,
    pageIndex,
    context = {},
  } = {}
) {
  if (!usageEnabled(env)) return (await transport(url, options)).json();
  let payload;
  try {
    payload = JSON.parse(options.body);
  } catch {
    return (await transport(url, options)).json();
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return (await transport(url, options)).json();
  const prepared = prepareGraphqlQuery(payload.query, { selectedOperation: payload.operationName });
  const finish = await beginObservation({
    env,
    cwd,
    query: payload.query,
    selectedOperation: payload.operationName,
    context: { ...context, variables: payload.variables },
    observationKind: 'http-attempt',
    logicalOperationId,
    pageIndex,
    alias: prepared.alias,
    endpointHost: new URL(url).hostname,
  });
  let response;
  try {
    response = await transport(url, {
      ...options,
      body: prepared.alias ? JSON.stringify({ ...payload, query: prepared.query }) : options.body,
    });
    const result = await response.json();
    await finish?.({ response: result, headers: response.headers, httpStatus: response.status });
    if (prepared.alias && result?.data) delete result.data[prepared.alias];
    return result;
  } catch (error) {
    await finish?.({
      error,
      httpStatus: response?.status ?? null,
      headers: response?.headers,
      responseReceived: Boolean(response),
    });
    throw error;
  }
}
