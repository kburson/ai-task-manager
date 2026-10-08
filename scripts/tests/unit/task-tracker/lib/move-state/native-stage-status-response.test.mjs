// @story #1855
// cspell:words nonfinite
// Raw recognized-memory response DATA only; no transport or stage authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as projects from '../../../../../gh/lib/github-projects.mjs';
import * as board from '../../../../../task-tracker/lib/move-state/github-mutation.mjs';
const raw = (stdout, exitCode = 0, stderr = '') => ({ stdout, stderr, exitCode });
const derive = (response) =>
  board.deriveRecordedStageStatusResponse({ response, projectId: 'PVT_subject' });
const response = {
  repository: {
    issue: {
      projectItems: {
        nodes: [{ project: { id: 'PVT_subject' }, fieldValueByName: { optionId: 'OPTION_test' } }],
      },
    },
  },
};

test('closed native response parser preserves absent data, null and actual native JSON value', () => {
  assert.equal(typeof projects.parseNativeStageStatusResponse, 'function');
  assert.equal(projects.parseNativeStageStatusResponse({ response: raw('{}') }), undefined);
  assert.equal(projects.parseNativeStageStatusResponse({ response: raw('{"data":null}') }), null);
  assert.deepEqual(
    projects.parseNativeStageStatusResponse({ response: raw(JSON.stringify({ data: response })) }),
    response
  );
});

test('recorded native response distinguishes undefined and null and derives exact Status result', async () => {
  assert.equal(typeof board.deriveRecordedStageStatusResponse, 'function');
  assert.deepEqual(await derive(raw('{}')), {
    kind: 'returned',
    result: { kind: 'undefined' },
    status: { kind: 'returned', value: '' },
  });
  assert.deepEqual(await derive(raw('{"data":null}')), {
    kind: 'returned',
    result: { kind: 'json', value: null },
    status: { kind: 'returned', value: '' },
  });
  const input = raw(JSON.stringify({ data: response }));
  const result = await derive(input);
  assert.deepEqual(result, {
    kind: 'returned',
    result: { kind: 'json', value: response },
    status: { kind: 'returned', value: 'OPTION_test' },
  });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.result.value.repository));
  assert.equal(input.stdout, JSON.stringify({ data: response }));
});

for (const code of [3, null])
  test('recorded native close error preserves raw code ' + code, async () => {
    assert.equal(typeof projects.parseNativeStageStatusResponse, 'function');
    const input = raw('partial\n', code, 'failure\n');
    assert.throws(
      () => projects.parseNativeStageStatusResponse({ response: input }),
      (error) => {
        assert.equal(error.constructor, Error);
        assert.equal(error.message, `gh exited ${code}: failure\n`);
        assert.equal(error.code, code);
        assert.equal(error.stdout, input.stdout);
        assert.equal(error.stderr, input.stderr);
        return true;
      }
    );
    assert.deepEqual(await derive(input), {
      kind: 'threw',
      error: {
        kind: 'close',
        name: 'Error',
        message: `gh exited ${code}: failure\n`,
        code,
        stdout: input.stdout,
        stderr: input.stderr,
      },
    });
  });

test('recorded gql and Status-parser failures remain separate native outcomes', async () => {
  assert.equal(typeof board.deriveRecordedStageStatusResponse, 'function');
  for (const stdout of ['{', 'null', '{"errors":{}}', '{"errors":[]}']) {
    let actual;
    try {
      projects.parseNativeStageStatusResponse({ response: raw(stdout) });
    } catch (error) {
      actual = error;
    }
    assert.ok(actual instanceof Error);
    assert.deepEqual(await derive(raw(stdout)), {
      kind: 'threw',
      error: { kind: 'graphql', name: actual.name, message: actual.message },
    });
  }
  const data = { repository: { issue: { projectItems: { nodes: {} } } } };
  let actual;
  try {
    board.statusOptionFromData(data, 'PVT_subject');
  } catch (error) {
    actual = error;
  }
  assert.ok(actual instanceof TypeError);
  assert.deepEqual(await derive(raw(JSON.stringify({ data }))), {
    kind: 'returned',
    result: { kind: 'json', value: data },
    status: { kind: 'threw', name: actual.name, message: actual.message },
  });
});

test('closed recorded response rejects supplied parser, result, malformed envelopes and getters', async () => {
  assert.equal(typeof projects.parseNativeStageStatusResponse, 'function');
  for (const value of [
    { ...raw('{}'), ready: true },
    { stdout: '{}', stderr: '', exitCode: '0' },
    { stdout: '{}', stderr: '', exitCode: 0.5 },
    { stdout: {}, stderr: '', exitCode: 0 },
  ]) {
    assert.throws(
      () => projects.parseNativeStageStatusResponse({ response: value }),
      /native-stage-status-response/
    );
    await assert.rejects(derive(value), /native-stage-status-response/);
  }
  let calls = 0;
  const value = {
    get stdout() {
      calls++;
      return '{}';
    },
    stderr: '',
    exitCode: 0,
  };
  assert.throws(
    () => projects.parseNativeStageStatusResponse({ response: value }),
    /native-stage-status-response/
  );
  assert.equal(calls, 0);
  await assert.rejects(
    board.deriveRecordedStageStatusResponse({
      response: raw('{}'),
      projectId: 'PVT_subject',
      parser() {
        calls++;
      },
    }),
    /native-stage-status-response/
  );
  await assert.rejects(
    board.deriveRecordedStageStatusResponse({ response: raw('{}'), projectId: '' }),
    /native-stage-status-response/
  );
  assert.equal(calls, 0);
});

test('recorded response owns closed input before its fixed import await', async () => {
  let calls = 0;
  const input = { response: raw('{}'), projectId: 'PVT_subject' };
  const pending = board.deriveRecordedStageStatusResponse(input);
  Object.defineProperty(input, 'response', {
    get() {
      calls++;
      return raw('{"data":null}');
    },
  });
  const result = await pending;
  assert.equal(calls, 0);
  assert.deepEqual(result, {
    kind: 'returned',
    result: { kind: 'undefined' },
    status: { kind: 'returned', value: '' },
  });
});

for (const [name, stdout, inspect] of [
  ['nonfinite scalar', '{"data":1e999}', (value) => assert.equal(value, Infinity)],
  [
    'nested nonfinite',
    '{"data":{"nested":[1e999]}}',
    (value) => assert.equal(value.nested[0], Infinity),
  ],
  ['negative zero', '{"data":-0}', (value) => assert.ok(Object.is(value, -0))],
  [
    'unsupported Unicode',
    '{"data":"\\ud800"}',
    (value) => assert.equal(value.charCodeAt(0), 0xd800),
  ],
])
  test('recorded DATA refuses ' + name + ' without normalizing native parser output', async () => {
    inspect(projects.parseNativeStageStatusResponse({ response: raw(stdout) }));
    await assert.rejects(derive(raw(stdout)), /native-stage-status-record/);
  });
