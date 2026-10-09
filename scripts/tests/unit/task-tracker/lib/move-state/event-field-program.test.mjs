// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureIssueFieldDb } from '../../../../../task-tracker/issue-field-db.mjs';
const load = () => import('../../../../../task-tracker/lib/event-field-update.mjs');
test('empty event bindings still read and normalize the actual issue field database', async () => {
  const { eventFieldUpdateProgram } = await load();
  const program = eventFieldUpdateProgram({
    cfg: { repo: 'o/r' },
    issue: '124',
    itemId: 'I',
    eventName: 'Test',
  });
  assert.deepEqual(program.next(), {
    done: false,
    value: { kind: 'read-bindings', eventName: 'Test' },
  });
  assert.equal(program.next([]).value.kind, 'read-definitions');
  assert.equal(program.next([]).value.kind, 'read-body');
  const body = 'Issue body\n\n\n';
  const write = program.next(body);
  assert.deepEqual(write.value, {
    kind: 'write-body',
    body: ensureIssueFieldDb(body, [], {}).body,
  });
  assert.notEqual(write.value.body, body);
  assert.deepEqual(program.next(), { done: true, value: undefined });
});
test('event binding samples its clock then yields the real field write before log and body', async () => {
  const { eventFieldUpdateProgram } = await load();
  const program = eventFieldUpdateProgram({
    cfg: { repo: 'o/r', projectId: 'P', fieldIds: { start: 'F' } },
    issue: '124',
    itemId: 'I',
    eventName: 'Test',
  });
  program.next();
  assert.equal(
    program.next([{ field: 'start', value: 'today', mode: 'set_once' }]).value.kind,
    'read-definitions'
  );
  assert.equal(
    program.next([{ key: 'start', name: 'Start', type: 'date' }]).value.kind,
    'read-body'
  );
  assert.equal(program.next('Issue body').value.kind, 'today');
  assert.deepEqual(program.next('2026-10-08').value, {
    kind: 'write-field',
    input: { projectId: 'P', itemId: 'I', fieldId: 'F', value: { date: '2026-10-08' } },
  });
  assert.deepEqual(program.next(true).value, { kind: 'log', message: '✓ start set for #124' });
  assert.equal(program.next().value.kind, 'write-body');
  assert.equal(program.next().done, true);
});
test('body write retains directory and clock order, late repo access and exact cleanup error semantics', async () => {
  const { eventFieldBodyWriteProgram } = await load();
  let reads = 0;
  const cfg = {
    get repo() {
      reads++;
      return 'o/r';
    },
  };
  const program = eventFieldBodyWriteProgram({ body: 'BODY', issue: '124', cfg });
  assert.deepEqual(program.next().value, { kind: 'tmp-directory' });
  assert.deepEqual(program.next('.scratch/event-data').value, { kind: 'tmp-clock' });
  assert.deepEqual(program.next(42).value, {
    kind: 'write-file',
    file: '.scratch/event-data/aitm-event-fields-124-42.md',
    body: 'BODY',
    encoding: 'utf8',
  });
  assert.equal(reads, 0);
  assert.deepEqual(program.next().value, {
    kind: 'edit-body',
    args: [
      'issue',
      'edit',
      '124',
      '-R',
      'o/r',
      '--body-file',
      '.scratch/event-data/aitm-event-fields-124-42.md',
    ],
  });
  assert.equal(reads, 1);
  const original = new Error('original edit failure');
  assert.deepEqual(program.throw(original).value, {
    kind: 'unlink-file',
    file: '.scratch/event-data/aitm-event-fields-124-42.md',
  });
  assert.throws(
    () => program.throw(new Error('cleanup failed')),
    (error) => error === original
  );
});
test('body directory failure never invents a cleanup step before original try boundary', async () => {
  const { eventFieldBodyWriteProgram } = await load();
  const program = eventFieldBodyWriteProgram({ body: 'BODY', issue: '124', cfg: { repo: 'o/r' } });
  assert.equal(program.next().value.kind, 'tmp-directory');
  const original = new Error('directory failed');
  assert.throws(
    () => program.throw(original),
    (error) => error === original
  );
  assert.equal(program.next().done, true);
});

function recordedInput() {
  return {
    projectDir: process.cwd(),
    cfg: { repo: 'o/r', projectId: 'P', fieldIds: { start: 'F' } },
    issue: '124',
    itemId: 'I',
    eventName: 'moveToTest',
    bindings: [],
    definitions: [],
    body: 'Issue body\n\n\n',
    clocks: [],
    temporary: { epochMs: 1791417600000 },
  };
}
test('recorded event derivation retains body normalization and actual temporary operation order', async () => {
  const { deriveRecordedEventFieldOperations: derive } = await load();
  assert.equal(typeof derive, 'function');
  const input = recordedInput();
  const result = derive(input);
  assert.deepEqual(
    result.operations.map((value) => value.kind),
    ['read-bindings', 'read-definitions', 'read-body', 'write-body']
  );
  assert.deepEqual(
    result.bodyOperations.map((value) => value.kind),
    ['tmp-directory', 'tmp-clock', 'write-file', 'edit-body', 'unlink-file']
  );
  assert.equal(result.body, ensureIssueFieldDb(input.body, [], {}).body);
  assert.notEqual(result.body, input.body);
  assert.equal(result.bodyOperations[2].body, result.body);
  assert.deepEqual(result.bodyOperations[3].args, [
    'issue',
    'edit',
    '124',
    '-R',
    'o/r',
    '--body-file',
    result.bodyOperations[2].file,
  ]);
  assert.equal(result.bodyOperations[4].file, result.bodyOperations[2].file);
  assert.deepEqual(input, recordedInput());
  assert.equal(Object.isFrozen(result.operations[0]), true);
});
test('recorded event clocks retain UTC today and actual offset-rendered now without resampling', async () => {
  const { deriveRecordedEventFieldOperations: derive } = await load();
  assert.equal(typeof derive, 'function');
  const input = recordedInput();
  input.definitions = [
    { key: 'start', name: 'Start', type: 'date' },
    { key: 'stamp', name: 'Stamp', type: 'text' },
  ];
  input.cfg.fieldIds.stamp = 'T';
  input.bindings = [
    { field: 'start', value: 'today', mode: 'set' },
    { field: 'stamp', value: 'now', mode: 'set' },
  ];
  input.clocks = [
    { kind: 'today', iso: '2026-10-08T00:30:00.000Z', offsetMin: null },
    { kind: 'now', iso: '2026-10-08T00:31:00.000Z', offsetMin: -300 },
  ];
  const result = derive(input);
  assert.deepEqual(
    result.operations
      .filter((value) => value.kind === 'write-field')
      .map((value) => value.input.value),
    [{ date: '2026-10-08' }, { text: '2026-10-07 19:31:00 -05:00' }]
  );
  assert.deepEqual(result.clocks, input.clocks);
});
test('recorded event derivation refuses missing, foreign, duplicate and unused clock data', async () => {
  const { deriveRecordedEventFieldOperations: derive } = await load();
  assert.equal(typeof derive, 'function');
  const input = recordedInput();
  input.definitions = [{ key: 'start', name: 'Start', type: 'date' }];
  input.bindings = [{ field: 'start', value: 'today', mode: 'set' }];
  const sample = { kind: 'today', iso: '2026-10-08T00:30:00.000Z', offsetMin: null };
  for (const clocks of [
    [],
    [{ ...sample, kind: 'now', offsetMin: 0 }],
    [sample, sample],
    [{ ...sample, iso: 'not-a-date' }],
  ]) {
    assert.throws(
      () => derive({ ...input, clocks }),
      (error) => error instanceof TypeError && error.message === 'native-event-field-data'
    );
  }
});
test('recorded event derivation rejects nested getters before access and forbids unrelated keys', async () => {
  const { deriveRecordedEventFieldOperations: derive } = await load();
  assert.equal(typeof derive, 'function');
  let gets = 0;
  const input = recordedInput();
  Object.defineProperty(input.cfg, 'repo', {
    enumerable: true,
    get() {
      gets++;
      return 'o/r';
    },
  });
  assert.throws(
    () => derive(input),
    (error) => error instanceof TypeError && error.message === 'native-event-field-data'
  );
  assert.equal(gets, 0);
  assert.throws(
    () => derive({ ...recordedInput(), ready: true }),
    (error) => error instanceof TypeError && error.message === 'native-event-field-data'
  );
});
test('recorded event derivation requires exact original body-write clock consumption and no fabricated temp operations', async () => {
  const { deriveRecordedEventFieldOperations: derive } = await load();
  assert.equal(typeof derive, 'function');
  const input = recordedInput();
  assert.throws(
    () => derive({ ...input, temporary: null }),
    (error) => error instanceof TypeError && error.message === 'native-event-field-data'
  );
  input.body = ensureIssueFieldDb(input.body, [], {}).body;
  input.temporary = null;
  const result = derive(input);
  assert.deepEqual(result.bodyOperations, []);
  assert.equal(result.body, input.body);
  assert.throws(
    () => derive({ ...input, temporary: { epochMs: 1791417600000 } }),
    (error) => error instanceof TypeError && error.message === 'native-event-field-data'
  );
});

function bodyPrefixInput(derive) {
  const source = recordedInput();
  const projection = derive(source);
  const initial = { body: source.body, directoryExists: false, file: null };
  let resources = structuredClone(initial);
  const steps = projection.bodyOperations.map((operation) => {
    if (operation.kind === 'tmp-directory') resources.directoryExists = true;
    if (operation.kind === 'write-file')
      resources.file = { path: operation.file, bytes: operation.body };
    if (operation.kind === 'edit-body') resources.body = projection.body;
    if (operation.kind === 'unlink-file') resources.file = null;
    return { operation, readback: structuredClone(resources) };
  });
  return { source, initial, steps };
}
test('recorded body prefix derives directory, file, body and cleanup effects from the original program', async () => {
  const {
    deriveRecordedEventFieldOperations: derive,
    reconstructRecordedEventFieldBodyPrefix: fold,
  } = await load();
  assert.equal(typeof fold, 'function');
  const input = bodyPrefixInput(derive);
  for (let length = 1; length <= input.steps.length; length++) {
    const prefix = structuredClone({ ...input, steps: input.steps.slice(0, length) });
    const result = fold(prefix);
    assert.deepEqual(result.after, prefix.steps.at(-1).readback);
    assert.equal(result.complete, length === input.steps.length);
    prefix.steps.at(-1).readback = null;
    const interrupted = fold(prefix);
    assert.equal(interrupted.complete, false);
    assert.deepEqual(
      interrupted.before,
      length === 1 ? input.initial : input.steps[length - 2].readback
    );
  }
  assert.equal(input.steps[0].readback.directoryExists, true);
  assert.equal(input.steps[2].readback.body, input.initial.body);
  assert.notEqual(input.steps[3].readback.body, input.initial.body);
  assert.equal(input.steps[4].readback.file, null);
});
test('recorded body prefix refuses foreign temp files, reordered operations, body drift and completed-resource regression', async () => {
  const {
    deriveRecordedEventFieldOperations: derive,
    reconstructRecordedEventFieldBodyPrefix: fold,
  } = await load();
  assert.equal(typeof fold, 'function');
  const input = bodyPrefixInput(derive);
  for (const mutate of [
    (value) => {
      value.initial.file = { path: value.steps[2].operation.file, bytes: 'foreign' };
    },
    (value) => {
      [value.steps[0], value.steps[1]] = [value.steps[1], value.steps[0]];
    },
    (value) => {
      value.steps[3].readback.body += 'foreign';
    },
    (value) => {
      value.steps[3].readback = structuredClone(value.initial);
    },
    (value) => {
      value.steps[0].readback = null;
    },
    (value) => {
      value.steps[2].operation.file += '-foreign';
    },
  ]) {
    const changed = structuredClone(input);
    mutate(changed);
    assert.throws(
      () => fold(changed),
      (error) => error instanceof TypeError && error.message === 'native-event-field-body-prefix'
    );
  }
});
