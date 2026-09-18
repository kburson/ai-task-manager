// @story #1693
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DoctorUsageError,
  parseDoctorArgs,
  renderDoctorHuman,
  renderDoctorJson,
  runDoctor,
} from '../../../package/doctor.mjs';

const fixture = (healthy) => ({
  schema: 'aitm.doctor/v1',
  healthy,
  projectRoot: '/repo',
  summary: { ok: healthy ? 1 : 0, unhealthy: healthy ? 0 : 1, optional: 0 },
  checks: [
    {
      id: 'manifest.file',
      status: healthy ? 'ok' : 'missing',
      required: true,
      details: healthy ? 'present' : 'missing',
    },
  ],
});

test('doctor accepts only the empty and single JSON argument forms', () => {
  assert.deepEqual(parseDoctorArgs([]), { json: false });
  assert.deepEqual(parseDoctorArgs(['--json']), { json: true });
  for (const argv of [['--json', '--json'], ['--json=true'], ['unknown']]) {
    assert.throws(() => parseDoctorArgs(argv), DoctorUsageError);
  }
});

test('JSON mode emits one document and maps unhealthy to exit 1', () => {
  let stdout = '';
  let stderr = '';
  const code = runDoctor({
    argv: ['--json'],
    cwd: '/repo',
    stdout: (value) => (stdout += value),
    stderr: (value) => (stderr += value),
    deps: { diagnose: () => fixture(false) },
  });
  assert.equal(code, 1);
  assert.equal(JSON.parse(stdout).schema, 'aitm.doctor/v1');
  assert.equal(stderr, '');
});

test('healthy report exits 0 and renderers preserve row identity and status', () => {
  const report = fixture(true);
  let stdout = '';
  assert.equal(
    runDoctor({
      argv: [],
      stdout: (value) => (stdout += value),
      deps: { diagnose: () => report },
    }),
    0
  );
  assert.equal(stdout, renderDoctorHuman(report));
  assert.match(stdout, /manifest\.file/);
  assert.match(stdout, /\[OK\]/);
  assert.deepEqual(JSON.parse(renderDoctorJson(report)).checks, report.checks);
});

test('usage failures exit 2 without a health document and help exits 0', () => {
  let stderr = '';
  assert.equal(runDoctor({ argv: ['bad'], stderr: (value) => (stderr += value) }), 2);
  assert.match(stderr, /Usage: npx aitm doctor/);
  let help = '';
  assert.equal(runDoctor({ argv: ['help'], stdout: (value) => (help += value) }), 0);
  assert.match(help, /writes nothing/i);
});
