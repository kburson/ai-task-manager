#!/usr/bin/env node
// @story #627
// #627 — coverage lift for `lib/unpark-dependents.mjs`. The pre-existing
// `unpark-dependents.test.mjs` suite injects the full `deps` surface, so it
// exercises the orchestration core (lines 93-152) but NEVER instantiates the
// default gh-backed factories, leaving them (and two error arms) at 0%.
//
// This suite closes that gap WITHOUT spawning real `gh`, using the
// behavior-preserving `deps.exec` seam: a `pexec`-shaped fake is threaded into
// the default factories so their real bodies run against canned stdout. It
// covers:
//
//   1. `defaultListCandidates` + `defaultFetchBody` — driven through
//      `unparkDependents` with ONLY `deps.exec`, a candidate that does not
//      reference the Done issue (so the default `mutateBody`/`runLabel` — which
//      would `spawn` real gh via `versionedWriteBody` — are never reached),
//   2. the `listCandidates` failure catch (returns a single `{issue:null}` row),
//   3. the `writeBlockedByField` mirror catch — a throwing injected
//      `writeFieldValue` must not abort the already-committed release.
//
// `defaultMutateBody`'s single inner line is deliberately not unit-covered: it
// funnels into `versionedWriteBody`, which `spawn`s `gh` directly rather than
// through the injected exec, so exercising it would require a live `gh`.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { unparkDependents } from '../../../lib/unpark-dependents.mjs';
import { parseBlockedBy } from '../../../lib/blocked-marker.mjs';

// A `pexec`-shaped fake: records every call and routes by gh sub-command.
function makeExec(routes) {
  const calls = [];
  return {
    calls,
    exec: async (cmd, args) => {
      calls.push({ cmd, args });
      const verb = `${args[0]} ${args[1]}`; // e.g. "issue list"
      const route = routes[verb];
      if (!route) throw new Error(`unexpected exec: ${cmd} ${args.join(' ')}`);
      if (typeof route === 'function') return route(args);
      return route;
    },
  };
}

test('default factories: list + fetch run against the exec seam (no-clear path)', async () => {
  const { exec, calls } = makeExec({
    // stray blank line + whitespace prove the number parser trims/filters.
    'issue list': { stdout: '700\n\n' },
    // CRLF in the body proves defaultFetchBody normalizes to \n. Marker refs a
    // DIFFERENT issue so the candidate does not reference the Done issue.
    'issue view': { stdout: 'Body 700.\r\n\r\n<!-- aitm-blocked-by refs="#999" -->\r\n' },
  });

  const out = await unparkDependents({
    doneIssueNumber: 500,
    cfg: { repo: 'o/r' },
    deps: { exec },
  });

  // No candidate referenced #500, so nothing was cleared.
  assert.deepEqual(out, []);

  const listCall = calls.find((c) => c.args[0] === 'issue' && c.args[1] === 'list');
  assert.ok(listCall, 'defaultListCandidates issued a gh issue list');
  assert.deepEqual(listCall.args, [
    'issue',
    'list',
    '-R',
    'o/r',
    '--label',
    'BLOCKED',
    '--state',
    'open',
    '--json',
    'number',
    '--jq',
    '.[].number',
  ]);

  const viewCall = calls.find((c) => c.args[0] === 'issue' && c.args[1] === 'view');
  assert.ok(viewCall, 'defaultFetchBody issued a gh issue view for the candidate');
  assert.deepEqual(viewCall.args, [
    'issue',
    'view',
    '700',
    '-R',
    'o/r',
    '--json',
    'body',
    '--jq',
    '.body',
  ]);
});

test('default listCandidates failure → single {issue:null} error row', async () => {
  const { exec } = makeExec({
    'issue list': () => {
      throw new Error('gh boom');
    },
  });

  const out = await unparkDependents({
    doneIssueNumber: 500,
    cfg: { repo: 'o/r' },
    deps: { exec },
  });

  assert.equal(out.length, 1);
  assert.equal(out[0].issue, null);
  assert.match(out[0].error, /listCandidates failed: gh boom/);
});

test('mirror field-write failure is swallowed — release still reported', async () => {
  const store = new Map([[104, 'Body.\n\n<!-- aitm-blocked-by: #101 -->\n']]);
  const labelCalls = [];
  const out = await unparkDependents({
    doneIssueNumber: 101,
    // fieldBlockedBy present so writeBlockedByField does NOT skip; the injected
    // writeFieldValue then throws, exercising the mirror catch in unpark.
    cfg: { repo: 'o/r', projectId: 'PVT_x', fieldBlockedBy: 'FIELD_x' },
    deps: {
      listCandidates: async () => [...store.keys()],
      fetchBody: async (n) => store.get(n),
      mutateBody: async (n, mutate) => store.set(n, mutate(store.get(n))),
      runLabel: async (args) => labelCalls.push(args),
      writeFieldValue: async () => {
        throw new Error('field API down');
      },
    },
  });

  // The body edit + label removal committed; the mirror throw was swallowed.
  assert.deepEqual(parseBlockedBy(store.get(104)), []);
  assert.deepEqual(labelCalls[0], ['issue', 'edit', '104', '--remove-label', 'BLOCKED']);
  assert.deepEqual(out, [{ issue: 104, cleared: 'full' }]);
});

test('child authority governs each dependent body, label, and field mutation', async () => {
  const store = new Map([[104, 'Body.\n\n<!-- aitm-blocked-by: #101 -->\n']]);
  const events = [];
  const roots = [];
  const out = await unparkDependents({
    doneIssueNumber: 101,
    cfg: { repo: 'o/r', projectId: 'PVT_x', fieldBlockedBy: 'FIELD_x' },
    deps: {
      withGovernedEffect: async (options, callback) => {
        roots.push(options);
        events.push('root');
        return callback({
          reverify: async () => events.push('reverify'),
        });
      },
      listCandidates: async () => [...store.keys()],
      fetchBody: async (n) => store.get(n),
      mutateBody: async (n, mutate) => {
        events.push('body');
        store.set(n, mutate(store.get(n)));
      },
      runLabel: async () => events.push('label'),
      writeFieldValue: async () => {
        events.push('field');
        return true;
      },
    },
  });

  assert.deepEqual(roots, [
    {
      issueId: '104',
      operation: 'lifecycle-mutation',
      heartbeat: true,
    },
  ]);
  assert.deepEqual(
    events,
    ['root', 'reverify', 'body', 'reverify', 'label', 'reverify', 'field'],
    'each child mutation consumes exact authority immediately before its write'
  );
  assert.deepEqual(out, [{ issue: 104, cleared: 'full' }]);
});
