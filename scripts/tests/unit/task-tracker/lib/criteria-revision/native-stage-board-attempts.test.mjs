// @story #1855
// Coherent recorded attempt DATA does not grant native board authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as codec from '../../../../../task-tracker/lib/criteria-revision/stage-execution.mjs';
import * as board from '../../../../../task-tracker/lib/move-state/github-mutation.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
const intent = {
  projectId: 'PVT_subject',
  itemId: 'PVTI_subject',
  fieldId: 'PVTF_status',
  optionId: 'OPTION_test',
};
const item = {
  id: intent.itemId,
  project: { id: intent.projectId },
  content: {
    __typename: 'Issue',
    id: 'I_subject',
    number: 124,
    repository: { nameWithOwner: 'example/criteria' },
  },
  fieldValues: {
    nodes: [
      {
        __typename: 'ProjectV2ItemFieldSingleSelectValue',
        id: 'VALUE_status',
        name: 'Develop',
        optionId: 'OPTION_develop',
        field: { id: intent.fieldId, name: 'Status' },
      },
      {
        __typename: 'ProjectV2ItemFieldTextValue',
        id: 'VALUE_note',
        text: 'keep exact text',
        field: { id: 'PVTF_note', name: 'Note' },
      },
    ],
    totalCount: 2,
    pageInfo: { hasNextPage: false, endCursor: null },
  },
};
const vector = (value) => ({
  stage: value.fieldValues.nodes[0].name.toLowerCase(),
  membership: {
    projectId: intent.projectId,
    itemId: intent.itemId,
    bytes: canonicalRecordJson(value),
  },
});
const before = vector(item);
const changed = structuredClone(item);
changed.fieldValues.nodes[0].name = 'Test';
changed.fieldValues.nodes[0].optionId = intent.optionId;
const after = vector(changed);
const previous = 'sha256:' + 'a'.repeat(64);
const request = () => ({ file: 'gh', args: board.statusWriteArgs(intent) });
const read = (optionId) => ({
  kind: 'returned',
  request: {
    query: board.STATUS_OPTION_QUERY,
    variables: { owner: 'example', repo: 'criteria', issue: 124 },
  },
  response: {
    repository: {
      issue: {
        projectItems: {
          nodes: [{ project: { id: intent.projectId }, fieldValueByName: { optionId } }],
        },
      },
    },
  },
});
const attempt = (number, start, optionId) => ({
  number,
  request: request(),
  before: structuredClone(start),
  write: { kind: 'returned', stdout: '' },
  read: read(optionId),
  after: structuredClone(after),
});
const input = (attempts) => ({
  repository: 'example/criteria',
  issue: 124,
  sourceOptionId: 'OPTION_develop',
  intent,
  before,
  previous,
  step: {
    ordinal: 14,
    kind: 'board-status',
    previous,
    intent,
    attempts,
    outcome: null,
    readback: null,
  },
});
const derive = (value) => {
  assert.equal(typeof codec.reconstructNativeStageBoardStep, 'function');
  return codec.reconstructNativeStageBoardStep(value);
};

test('board attempt keeps unknown write pending and preserves original raw resource', async () => {
  const value = input([
    {
      number: 1,
      request: request(),
      before: structuredClone(before),
      write: null,
      read: null,
      after: null,
    },
  ]);
  const original = canonicalRecordJson(value);
  const result = await derive(value);
  assert.deepEqual(result.before, before);
  assert.deepEqual(result.after, after);
  assert.equal(result.confirmed, false);
  assert.equal(canonicalRecordJson(value), original);
});

test('actual second read success is distinct from first mismatch and retains both attempts', async () => {
  const value = input([attempt(1, before, 'OPTION_develop'), attempt(2, after, intent.optionId)]);
  value.step.outcome = { kind: 'confirmed', attempt: 2, exit: null };
  value.step.readback = { attempt: 2, ...structuredClone(after) };
  const result = await derive(value);
  assert.equal(result.confirmed, true);
  assert.deepEqual(result.after, after);
  assert.equal(
    JSON.parse(result.after.membership.bytes).fieldValues.nodes[1].text,
    'keep exact text'
  );
});

test('empty and mismatched exhausted reads stay unconfirmed without successful readback', async () => {
  const value = input([
    attempt(1, before, ''),
    attempt(2, after, 'OPTION_develop'),
    attempt(3, after, ''),
  ]);
  value.step.outcome = { kind: 'unconfirmed', attempt: 3, exit: 7 };
  assert.equal((await derive(value)).confirmed, false);
});

test('board attempt refuses reordered, invented-success, altered resource and unknown outcome claims', async () => {
  const valid = input([attempt(1, before, intent.optionId)]);
  valid.step.outcome = { kind: 'confirmed', attempt: 1, exit: null };
  valid.step.readback = { attempt: 1, ...structuredClone(after) };
  for (const change of [
    (x) => {
      x.step.attempts[0].number = 2;
    },
    (x) => {
      x.step.attempts.push(structuredClone(x.step.attempts[0]));
    },
    (x) => {
      x.step.attempts[0].request.args[5] = 'PVTI_foreign';
    },
    (x) => {
      x.step.attempts[0].read.response.repository.issue.projectItems.nodes[0].fieldValueByName.optionId =
        '';
    },
    (x) => {
      x.step.attempts[0].after = structuredClone(before);
    },
    (x) => {
      x.step.attempts[0].after.membership.bytes = x.step.attempts[0].after.membership.bytes.replace(
        'keep exact text',
        'changed'
      );
    },
    (x) => {
      x.step.attempts[0].write = null;
    },
    (x) => {
      x.step.outcome = { kind: 'unconfirmed', attempt: 1, exit: 7 };
    },
    (x) => {
      x.step.ready = true;
    },
  ]) {
    const value = structuredClone(valid);
    change(value);
    await assert.rejects(derive(value), /native-stage-board/);
  }
});

test('no attempted write recognizes only before, and a completed resource read fixes that exact prefix', async () => {
  assert.deepEqual((await derive(input([]))).prefixes, [before]);
  const unknown = input([
    {
      number: 1,
      request: request(),
      before: structuredClone(before),
      write: null,
      read: null,
      after: null,
    },
  ]);
  assert.deepEqual((await derive(unknown)).prefixes, [before, after]);
  const observed = input([attempt(1, before, '')]);
  assert.deepEqual((await derive(observed)).prefixes, [after]);
});

test('actual thrown write and swallowed read failure remain distinct from successful completion', async () => {
  const error = {
    kind: 'threw',
    name: 'Error',
    message: 'original transport outcome unavailable',
    code: null,
  };
  const failed = input([
    {
      number: 1,
      request: request(),
      before: structuredClone(before),
      write: error,
      read: null,
      after: null,
    },
  ]);
  failed.step.outcome = { kind: 'exception', attempt: 1, exit: null };
  assert.equal((await derive(failed)).confirmed, false);
  const readFailure = input([attempt(1, before, '')]);
  readFailure.step.attempts[0].read = {
    ...error,
    request: readFailure.step.attempts[0].read.request,
  };
  assert.equal((await derive(readFailure)).confirmed, false);
  readFailure.step.outcome = { kind: 'confirmed', attempt: 1, exit: null };
  await assert.rejects(derive(readFailure), /native-stage-board/);
});

test('an unknown repeated write cannot resurrect the original before-board value', async () => {
  const value = input([
    attempt(1, before, ''),
    {
      number: 2,
      request: request(),
      before: structuredClone(after),
      write: null,
      read: null,
      after: null,
    },
  ]);
  const result = await derive(value);
  assert.ok(
    result.prefixes.every((prefix) => canonicalRecordJson(prefix) === canonicalRecordJson(after))
  );
});

test('a completed repeated write rejects a full resource regression despite a lagging scalar read', async () => {
  const value = input([attempt(1, before, ''), attempt(2, after, 'OPTION_develop')]);
  value.step.attempts[1].after = structuredClone(before);
  await assert.rejects(derive(value), /native-stage-board/);
});
