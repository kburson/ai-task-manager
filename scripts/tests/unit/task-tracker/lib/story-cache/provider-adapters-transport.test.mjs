// @story #2089 #2103
import assert from 'node:assert/strict';
import { execFile as nodeExecFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ghClient } from '../../../../../gh/lib/gh-client.mjs';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';
import {
  createStoryProviderAdapters,
  confirmResourceEffect,
} from '../../../../../task-tracker/lib/story-cache/provider-adapters.mjs';

const identity = {
  host: 'github.example.com',
  repository: 'owner/repo',
  issueNumber: 2089,
  issueNodeId: 'I_issue',
  projectId: 'P_project',
  projectItemId: 'PI_item',
};
const ports = () => ({ observe: async () => null, capabilities: [], validateIssue: () => true });
const fieldEffect = (type, value) => ({
  kind: 'project-field-update',
  target: { identity, projectId: 'P_project', itemId: 'PI_item', fieldId: 'F_field' },
  candidate: { type, value },
});

// Only replace the external process boundary. Production defaultGraphql still
// constructs and serializes stdin, handles the child, and parses its real stdout.
function offlineTransport(t, { response, raw, exitCode = 0 } = {}) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'date-transport-'));
  const script = path.join(dir, 'offline-gh.mjs');
  writeFileSync(
    script,
    `let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { stdin += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(stdin);
  if (${exitCode}) { process.stderr.write('offline transport refused'); process.exit(${exitCode}); }
  const result = ${JSON.stringify(response ?? null)};
  const raw = ${JSON.stringify(raw ?? null)};
  process.stdout.write(raw ?? JSON.stringify(result ?? { data: { request, argv: process.argv.slice(2) } }));
});
`
  );
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  t.mock.method(ghClient, 'execFile', (file, args, options, callback) => {
    assert.equal(file, 'gh');
    calls.push({ args, timeout: options.timeout, maxBuffer: options.maxBuffer });
    return nodeExecFile(process.execPath, [script, ...args], options, callback);
  });
  return calls;
}

for (const [type, value, scalar, property, serialized] of [
  ['NUMBER', 2.75, 'Float!', 'number', 2.75],
  ['TEXT', 'line 1\n"quoted" \\ café\t', 'String!', 'text', 'line 1\n"quoted" \\ café\t'],
  ['DATE', '2026-10-28', 'Date!', 'date', '2026-10-28'],
  ['SINGLE_SELECT', { optionId: 'option_1' }, 'String!', 'singleSelectOptionId', 'option_1'],
  ['ITERATION', 'iteration_1', 'String!', 'iterationId', 'iteration_1'],
]) {
  test(`${type} default transport sends the provider scalar and exact JSON value`, async (t) => {
    const calls = offlineTransport(t);
    const result = await createStoryProviderAdapters(ports()).apply(fieldEffect(type, value));
    const { query, variables } = result.data.request;
    assert.ok(query.includes(`$value:${scalar}`), query);
    assert.ok(query.includes(`value:{${property}:$value}`), query);
    assert.deepEqual(variables, {
      project: 'P_project',
      item: 'PI_item',
      field: 'F_field',
      value: serialized,
    });
    assert.deepEqual(result.data.argv, [
      'api',
      'graphql',
      '--hostname',
      'github.example.com',
      '--input',
      '-',
    ]);
    assert.deepEqual(calls, [
      {
        args: ['api', 'graphql', '--hostname', 'github.example.com', '--input', '-'],
        timeout: 30000,
        maxBuffer: 4194304,
      },
    ]);
  });
}

for (const type of ['NUMBER', 'TEXT', 'DATE', 'SINGLE_SELECT', 'ITERATION']) {
  for (const value of [null, { state: 'absent' }]) {
    test(`${type} ${value === null ? 'null' : 'absent'} remains a clear mutation`, async (t) => {
      offlineTransport(t);
      const result = await createStoryProviderAdapters(ports()).apply(fieldEffect(type, value));
      assert.match(result.data.request.query, /clearProjectV2ItemFieldValue/);
      assert.doesNotMatch(result.data.request.query, /updateProjectV2ItemFieldValue|\$value/);
      assert.deepEqual(result.data.request.variables, {
        project: 'P_project',
        item: 'PI_item',
        field: 'F_field',
      });
    });
  }
}

test('unsupported field type refuses before external transport', async (t) => {
  const calls = offlineTransport(t);
  await assert.rejects(createStoryProviderAdapters(ports()).apply(fieldEffect('UNKNOWN', 'x')), {
    code: 'STORY_EFFECT_UNCONFIRMED',
    reason: 'field-type',
  });
  assert.equal(calls.length, 0);
});

test('provider field errors stay unconfirmed evidence for the publisher', async (t) => {
  const response = { data: null, errors: [{ message: 'provider refused field' }] };
  offlineTransport(t, { response });
  assert.deepEqual(
    await createStoryProviderAdapters(ports()).apply(fieldEffect('DATE', '2026-10-28')),
    response
  );
});

test('transport failure is propagated rather than returned as field success', async (t) => {
  offlineTransport(t, { exitCode: 7 });
  await assert.rejects(createStoryProviderAdapters(ports()).apply(fieldEffect('NUMBER', 2.75)), {
    code: 7,
  });
});

test('malformed provider JSON cannot become success', async (t) => {
  offlineTransport(t, { raw: 'not-json' });
  await assert.rejects(
    createStoryProviderAdapters(ports()).apply(fieldEffect('TEXT', 'x')),
    SyntaxError
  );
});

for (const [kind, select, nodePath, candidate, wantedVariables] of [
  [
    'issue-update',
    'updateIssue',
    'issue',
    { body: 'issue\nbytes', title: 'title' },
    { id: 'I_issue', body: 'issue\nbytes', title: 'title' },
  ],
  [
    'comment-update',
    'updateIssueComment',
    'issueComment',
    'comment\nbytes',
    { id: 'IC_comment', body: 'comment\nbytes' },
  ],
  [
    'comment-create',
    'addComment',
    'commentEdge',
    'new\nbytes',
    { id: 'I_issue', body: 'new\nbytes' },
  ],
]) {
  test(`${kind} preserves its existing content transport and explicit unedited observation`, async (t) => {
    const node = {
      id: kind === 'issue-update' ? 'I_issue' : 'IC_comment',
      body: typeof candidate === 'string' ? candidate : candidate.body,
      lastEditedAt: null,
      userContentEdits: { totalCount: 0, nodes: [] },
      ...(kind === 'issue-update' ? { title: 'title' } : {}),
    };
    const graphqlCalls = [];
    const adapter = createStoryProviderAdapters({
      ...ports(),
      graphql: async (input) => {
        graphqlCalls.push(input);
        return { data: { [select]: { [nodePath]: kind === 'comment-create' ? { node } : node } } };
      },
    });
    const result = await adapter.apply({
      kind,
      target: { identity, issueNodeId: 'I_issue', commentNodeId: 'IC_comment' },
      candidate,
    });
    assert.deepEqual(graphqlCalls[0].variables, wantedVariables);
    assert.equal(graphqlCalls[0].host, 'github.example.com');
    assert.equal(result.body, node.body);
    assert.equal(result.node.includesCreatedEdit, false);
    assert.equal(result.complete, true);
    assert.deepEqual(result.identity, identity);
  });
}

test('content provider errors refuse and missing content returns no observation', async () => {
  const effect = {
    kind: 'comment-update',
    target: { identity, commentNodeId: 'IC_comment' },
    candidate: 'x',
  };
  await assert.rejects(
    createStoryProviderAdapters({ ...ports(), graphql: async () => ({ errors: [{}] }) }).apply(
      effect
    ),
    {
      code: 'STORY_EFFECT_UNCONFIRMED',
      reason: 'provider-errors',
    }
  );
  assert.equal(
    await createStoryProviderAdapters({ ...ports(), graphql: async () => ({ data: {} }) }).apply(
      effect
    ),
    null
  );
});

test('missing adapter ports and unknown effects refuse', async () => {
  assert.throws(() => createStoryProviderAdapters(), {
    code: 'STORY_EFFECT_UNCONFIRMED',
    reason: 'ports',
  });
  await assert.rejects(
    createStoryProviderAdapters(ports()).apply({ kind: 'unknown', target: { identity } }),
    {
      code: 'STORY_EFFECT_UNCONFIRMED',
      reason: 'effect-kind',
    }
  );
});

const digest = (value) => createHash('sha256').update(value).digest('hex');
const unedited = (id) => ({
  id,
  lastEditedAt: null,
  includesCreatedEdit: false,
  userContentEdits: { totalCount: 0, nodes: [] },
});

test('field confirmation requires exact identity, candidate and digest', () => {
  const effect = {
    ...fieldEffect('NUMBER', 2.75),
    intendedDigest: digest('{"type":"NUMBER","value":2.75}'),
  };
  const value = { complete: true, identity, field: { type: 'NUMBER', value: 2.75 } };
  const result = confirmResourceEffect(effect, value);
  assert.equal(result.outcome.state, 'confirmed');
  assert.equal(result.outcome.providerId, 'F_field');
  assert.deepEqual(result.field, { type: 'NUMBER', value: 2.75 });
  for (const change of [
    { complete: false },
    { identity: { ...identity, issueNumber: 1 } },
    { field: { type: 'NUMBER', value: 2 } },
  ])
    assert.throws(() => confirmResourceEffect(effect, { ...value, ...change }), {
      code: 'STORY_EFFECT_UNCONFIRMED',
    });
  assert.throws(() => confirmResourceEffect({ ...effect, intendedDigest: 'bad' }, value), {
    reason: 'field-readback',
  });
});

test('issue confirmation tolerates only trailing whitespace and checks title and target', () => {
  const effect = {
    kind: 'issue-update',
    target: { identity, issueNodeId: 'I_issue' },
    candidate: { body: 'body\n', title: 'title' },
  };
  const value = {
    complete: true,
    identity,
    node: unedited('I_issue'),
    body: 'body\n\n',
    title: 'title',
  };
  assert.equal(confirmResourceEffect(effect, value).outcome.state, 'confirmed');
  assert.throws(() => confirmResourceEffect(effect, { ...value, title: 'other' }), {
    reason: 'target-readback',
  });
  assert.throws(() => confirmResourceEffect(effect, { ...value, body: 'different' }), {
    reason: 'content-readback',
  });
});

test('comment update confirmation requires exact bytes and target', () => {
  const effect = {
    kind: 'comment-update',
    target: { identity, commentNodeId: 'IC_comment' },
    candidate: 'body\n',
  };
  const value = { complete: true, identity, node: unedited('IC_comment'), body: 'body\n' };
  assert.equal(confirmResourceEffect(effect, value).outcome.state, 'confirmed');
  assert.throws(() => confirmResourceEffect(effect, { ...value, body: 'body' }), {
    reason: 'content-readback',
  });
  assert.throws(() => confirmResourceEffect(effect, { ...value, node: unedited('IC_other') }), {
    reason: 'target-readback',
  });
});

test('comment creation confirmation requires a new uniquely owned comment and unchanged inventory', () => {
  const body = 'report\n<!-- aitm-owned-comment key="transport.report" -->';
  const effect = { kind: 'comment-create', target: { identity }, candidate: body };
  const baseline = {
    inventory: ['IC_old'],
    resources: { 'comment:IC_old': { digest: digest('old') } },
  };
  const value = {
    complete: true,
    identity,
    node: unedited('IC_new'),
    body,
    inventory: [
      { id: 'IC_old', body: 'old' },
      { id: 'IC_new', body },
    ],
  };
  assert.equal(confirmResourceEffect(effect, value, { baseline }).outcome.state, 'confirmed');
  assert.throws(() => confirmResourceEffect(effect, value), { reason: 'creation-inventory' });
  assert.throws(
    () =>
      confirmResourceEffect(
        effect,
        { ...value, inventory: [{ id: 'IC_new', body }] },
        { baseline }
      ),
    { reason: 'creation-inventory-drift' }
  );
  assert.throws(
    () =>
      confirmResourceEffect(
        effect,
        {
          ...value,
          inventory: [
            { id: 'IC_old', body: 'changed' },
            { id: 'IC_new', body },
          ],
        },
        { baseline }
      ),
    { reason: 'creation-content-drift' }
  );
});
