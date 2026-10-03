// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { classifyCaptureRecord } from '../../../../task-tracker/lib/runtime-capture-catalog.mjs';

const base =
  'action-capture/repositories/owner__repo/issue-1857/000001-01J00000000000000000000800/';
const binary = Buffer.from([255, 254, 0, 128]);
const descriptor = {
  bytes: binary.length,
  sha256: 'sha256:' + createHash('sha256').update(binary).digest('hex'),
  stored: true,
  redacted: false,
  file: 'stdin.bin',
};
const intent = {
  schema: 'aitm.github-action-capture/v1',
  actionId: '01J00000000000000000000800',
  sequence: 1,
  repository: 'owner/repo',
  issue: 1857,
  invocation: { id: 'one', command: 'fixture' },
  startedAt: '2026-10-01T00:00:00Z',
  process: { pid: 1 },
  operationClass: 'read',
  mutationKind: null,
  attempt: 1,
  preconditions: {},
  request: {
    argv: { ...descriptor, stored: false, redacted: true, file: null },
    stdin: descriptor,
    files: [],
  },
};
const bytes = (value) => Buffer.from(JSON.stringify(value));

test('capture metadata refuses invalid UTF-8 and unsupported operation classes', () => {
  const selected = classifyCaptureRecord({ relative: base + 'intent.json' });
  const malformed = bytes(intent);
  malformed[malformed.indexOf(Buffer.from('fixture'))] = 255;
  assert.equal(selected.validate(malformed), false);
  assert.equal(selected.validate(bytes({ ...intent, operationClass: 'arbitrary' })), false);
});

test('capture producer padding is a minimum width, not a maximum record count', () => {
  const relative = base.replace('000001-', '1000000-');
  const record = {
    ...intent,
    sequence: 1000000,
    request: {
      ...intent.request,
      files: [{ ...descriptor, file: 'request-100.bin', kind: 'body' }],
    },
  };
  assert.equal(
    classifyCaptureRecord({ relative: relative + 'intent.json' })?.validate(bytes(record)),
    true
  );
  assert.equal(
    classifyCaptureRecord({
      relative: relative + 'request-100.bin',
      readSibling: () => bytes(record),
    })?.validate(binary),
    true
  );
});

test('capture payload migration verifies exact binary length/hash against its stored intent', () => {
  const selected = classifyCaptureRecord({
    relative: base + 'stdin.bin',
    readSibling: () => bytes(intent),
  });
  assert.equal(selected.scope, 'shared');
  assert.equal(selected.validate(binary), true);
  assert.equal(selected.validate(Buffer.from(binary.toString('utf8'))), false);
  assert.equal(
    classifyCaptureRecord({ relative: base + 'other.bin', readSibling: () => bytes(intent) }),
    null
  );
  assert.equal(
    classifyCaptureRecord({
      relative: base + 'stdin.bin',
      readSibling: () => bytes({ ...intent, schema: 'unknown/v2' }),
    }).validate(binary),
    false
  );
});

test('capture metadata preserves pending outcome absence but refuses malformed identity and unknown schema', () => {
  const selected = classifyCaptureRecord({ relative: base + 'intent.json' });
  assert.equal(selected.validate(bytes(intent)), true);
  assert.equal(selected.validate(bytes({ ...intent, issue: 1 })), false);
  assert.equal(selected.validate(bytes({ ...intent, actionId: 'other' })), false);
  assert.equal(selected.validate(bytes({ ...intent, schema: 'unknown/v2' })), false);
});

test('capture counters and enablement use closed typed shapes, never arbitrary file bytes', () => {
  const counter = classifyCaptureRecord({
    relative: 'action-capture/repositories/owner__repo/issue-1857/.sequence',
  });
  assert.equal(counter.validate(Buffer.from('17\n')), true);
  assert.equal(counter.validate(Buffer.from('17garbage')), false);
  const marker = classifyCaptureRecord({
    relative: 'action-capture/enabled/owner__repo/issue-1857.json',
  });
  assert.equal(
    marker.validate(
      bytes({
        schema: 'aitm.github-action-capture/v1',
        repository: 'owner/repo',
        issue: 1857,
        enabledAt: '2026-10-01T00:00:00Z',
      })
    ),
    true
  );
  assert.equal(
    marker.validate(bytes({ schema: 'aitm.github-action-capture/v1', issue: 1 })),
    false
  );
});
