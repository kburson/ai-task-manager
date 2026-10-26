// @story #2073 — stateful lowest-port transport with fail-closed shape registration.
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { promisify } from 'node:util';
import {
  identifyGraphqlOperation,
  prepareGraphqlQuery,
} from '../../task-tracker/lib/graphql-usage/identity.mjs';
import { parseSelection, selectResponse } from './refinement-query-selection.mjs';

export function assertTrafficBudget(ledger, budget) {
  const counts = {};
  for (const entry of ledger) {
    if (!Object.hasOwn(budget.families, entry.family))
      throw new Error('unclassified request: ' + entry.family);
    counts[entry.family] = (counts[entry.family] ?? 0) + 1;
  }
  if (ledger.length > budget.total) throw new Error('total budget exceeded');
  for (const [family, count] of Object.entries(counts))
    if (count > budget.families[family]) throw new Error(family + ' budget exceeded');
}

export function createTrafficProvider({ population, shapes, failureSchedule = [] }) {
  const state = structuredClone(population),
    ledger = [],
    registry = new Map();
  for (const shape of shapes) {
    const fingerprint = identifyGraphqlOperation(shape.query).queryFingerprint;
    if (!fingerprint) throw new Error('invalid registered query');
    if (registry.has(fingerprint)) throw new Error('ambiguous request shape');
    registry.set(fingerprint, shape);
    const prepared = prepareGraphqlQuery(shape.query);
    registry.set(identifyGraphqlOperation(prepared.query).queryFingerprint, shape);
  }
  const findNode = (id) => {
    const seen = new Set();
    const visit = (value) => {
      if (!value || typeof value !== 'object' || seen.has(value)) return null;
      seen.add(value);
      if (value.id === id) return value;
      for (const child of Object.values(value)) {
        const hit = visit(child);
        if (hit) return hit;
      }
      return null;
    };
    const node = visit(state);
    if (!node) throw new Error('unknown node ID: ' + id);
    return node;
  };
  function resolve(source, field) {
    const { name, args } = field;
    if (source === state && name === 'node') return findNode(args.id);
    if (name === 'repository' && source === state) {
      if (args.owner + '/' + args.name !== state.repository.nameWithOwner)
        throw new Error('foreign repository');
    }
    if (name === 'issue' && args.number !== undefined && source.issue?.number !== args.number)
      throw new Error('unknown issue');
    let value = source[name];
    if (value?.nodes && Object.hasOwn(args, 'first')) {
      const offset = args.after == null ? 0 : Number(String(args.after).replace(/^page:/, ''));
      if (
        args.after != null &&
        (!/^page:\d+$/.test(args.after) || offset <= 0 || offset >= value.nodes.length)
      )
        throw new Error('unknown cursor');
      const nodes = value.nodes.slice(offset, offset + args.first),
        next = offset + nodes.length;
      value = {
        nodes,
        pageInfo: {
          hasNextPage: next < value.nodes.length,
          endCursor: next < value.nodes.length ? 'page:' + next : null,
        },
      };
    }
    if (name === 'rateLimit') return { cost: null };
    return value;
  }
  async function dispatch(entry, action) {
    const record = {
      index: ledger.length + 1,
      phase:
        state.phase ??
        (entry.family?.startsWith('hook-')
          ? entry.family
          : entry.family?.startsWith('target-')
            ? 'target-observation'
            : entry.family?.includes('write')
              ? 'publication-write'
              : 'authority-observation'),
      target: state.repository?.issue?.id ?? null,
      byteLayer:
        entry.transport === 'graphql'
          ? 'serialized-graphql-response-envelope'
          : 'serialized-cli-result-envelope',
      cost: null,
      costStatus: 'unknown-offline',
      outcome: 'pending',
      serializedResponseBytes: null,
      ...entry,
    };
    ledger.push(record);
    const failures = failureSchedule.filter(
      (failure) =>
        failure.afterDispatch === ledger.length ||
        (failure.family === entry.family &&
          failure.occurrence === ledger.filter((row) => row.family === entry.family).length)
    );
    try {
      if (failures.some((failure) => failure.failBefore || failure.mode === 'fail-before-apply'))
        throw new Error('injected failure before apply');
      const result = await action();
      for (const failure of failures)
        if (failure.change) Object.assign(state, structuredClone(failure.change));
      record.serializedResponseBytes = Buffer.byteLength(
        typeof result === 'string' ? result : JSON.stringify(result)
      );
      if (failures.some((failure) => failure.loseAck || failure.mode === 'apply-then-throw'))
        throw new Error('injected lost acknowledgement');
      record.outcome = 'success';
      return result;
    } catch (error) {
      record.outcome = 'failure';
      record.error = error.message;
      throw error;
    }
  }
  const graphql = async ({ query, variables = {} }) => {
    const identity = identifyGraphqlOperation(query),
      shape = registry.get(identity.queryFingerprint);
    if (!shape) throw new Error('unclassified query: ' + identity.queryFingerprint);
    return dispatch(
      {
        family: shape.family,
        ...identity,
        transport: 'graphql',
        target:
          variables.item ??
          variables.project ??
          variables.issue ??
          state.repository?.issue?.id ??
          null,
        ...(variables.field
          ? {
              field:
                variables.field ===
                state.repository.issue.projectItems?.nodes[0]?.fieldValues?.nodes.find(
                  (value) => value.__typename === 'ProjectV2ItemFieldNumberValue'
                )?.field?.id
                  ? 'estimate'
                  : 'size',
            }
          : {}),
        selectedChildProjectFields: /subIssues[\s\S]*projectItems/.test(query),
      },
      () => {
        if (shape.apply) shape.apply({ state, variables, query, findNode });
        const fields = parseSelection(query, variables);
        return { data: selectResponse(state, fields, resolve) };
      }
    );
  };
  const pexec = async (file, args = [], options = {}) => {
    if (file !== 'gh') throw new Error('unclassified executable');
    if (args[0] === 'api' && args[1] === 'graphql') {
      let query,
        variables = {};
      if (args.includes('--input')) ({ query, variables = {} } = JSON.parse(options.input));
      else {
        const at = args.findIndex((arg) => arg.startsWith('query='));
        query = args[at]?.slice(6);
        for (let i = 0; i < args.length; i++)
          if (['-f', '-F'].includes(args[i]) && i + 1 !== at) {
            const text = args[i + 1];
            const eq = text.indexOf('=');
            if (eq < 0) throw new Error('unclassified argument');
            const key = text.slice(0, eq),
              value = text.slice(eq + 1);
            variables[key] = args[i] === '-F' ? JSON.parse(value) : value;
          }
      }
      return { stdout: JSON.stringify(await graphql({ query, variables })), stderr: '' };
    }
    const validRepo = ['--repo', '-R'].some(
      (flag) =>
        args.includes(flag) && args[args.indexOf(flag) + 1] === state.repository.nameWithOwner
    );
    if (args[0] !== 'issue' || Number(args[2]) !== state.repository.issue.number || !validRepo)
      return dispatch({ family: 'unclassified', transport: 'opaque-cli' }, () => {
        throw new Error('unclassified command');
      });
    if (args[1] === 'view')
      return dispatch(
        {
          family: args[args.indexOf('--json') + 1] === 'labels' ? 'route-read' : 'issue-body-read',
          transport: 'opaque-cli',
        },
        () => {
          const keys = args[args.indexOf('--json') + 1]?.split(',');
          if (!keys?.every((key) => ['number', 'body', 'labels'].includes(key)))
            throw new Error('unclassified issue selection');
          const output =
            args.includes('-q') || args.includes('--jq')
              ? keys[0] === 'labels'
                ? state.repository.issue.labels.nodes.map((label) => label.name).join('\n')
                : state.repository.issue.body
              : JSON.stringify(
                  Object.fromEntries(keys.map((key) => [key, state.repository.issue[key]]))
                );
          return { stdout: output, stderr: '' };
        }
      );
    if (args[1] === 'edit' && args.includes('--body-file') && typeof options.input === 'string')
      return dispatch({ family: 'body-write', transport: 'opaque-cli' }, () => {
        state.repository.issue.body = options.input;
        return { stdout: '', stderr: '' };
      });
    throw new Error('unclassified command');
  };
  const execFile = (file, args, options, callback) => {
    const done = typeof options === 'function' ? options : callback;
    pexec(file, args, typeof options === 'function' ? {} : options).then(
      ({ stdout, stderr }) => done(null, stdout, stderr),
      (error) => done(error, '', error.message)
    );
    return new EventEmitter();
  };
  execFile[promisify.custom] = pexec;
  const spawn = (file, args, options = {}) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    let input = '';
    child.stdin.on('data', (bytes) => (input += bytes));
    child.stdin.on('end', () =>
      pexec(file, args, { ...options, input }).then(
        ({ stdout, stderr }) => {
          child.stdout.end(stdout);
          child.stderr.end(stderr);
          setImmediate(() => child.emit('close', 0));
        },
        (error) => {
          child.stdout.end();
          child.stderr.end(error.message);
          setImmediate(() => child.emit('close', 1));
        }
      )
    );
    if (!args.includes('--input') && !args.includes('--body-file')) child.stdin.end();
    return child;
  };
  return {
    graphql,
    pexec,
    execFile,
    spawn,
    ledger,
    state,
    failureSchedule,
    close() {},
    assertNoEscapes() {},
  };
}
