// @story #1693
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  INSTALL_STATUSES,
  evaluateInstallation,
  resolveDoctorProjectRoot,
} from '../../../package/install-observer.mjs';

test('project root resolution permits only the read-only rev-parse query', () => {
  const calls = [];
  const result = resolveDoctorProjectRoot('/repo/subdir', {
    execFileSync(command, args, options) {
      calls.push({ command, args, options });
      return '/repo\n';
    },
  });
  assert.deepEqual(result, { ok: true, root: '/repo' });
  assert.deepEqual(calls[0].args, ['rev-parse', '--show-toplevel']);
});

test('evaluator exposes a closed status matrix with deterministic recovery', () => {
  const artifacts = [
    { id: 'a.missing', path: 'a', required: true },
    { id: 'b.untracked', path: 'b', required: true },
    { id: 'c.modified', path: 'c', required: true },
    { id: 'd.unsafe', path: 'd', required: true },
    { id: 'e.optional', path: 'e', required: false },
  ];
  const report = evaluateInstallation({
    projectRoot: '/repo',
    manifestResult: {
      ok: true,
      tracked: true,
      manifest: { artifacts },
    },
    contractResult: { compatible: true },
    observations: {
      byId: {
        'a.missing': { exists: false },
        'b.untracked': { exists: true, tracked: false, contentMatches: true },
        'c.modified': { exists: true, tracked: true, contentMatches: false },
        'd.unsafe': { exists: true, tracked: true, symlinkSafety: 'unsafe' },
        'e.optional': { exists: false },
      },
    },
  });
  assert.equal(report.healthy, false);
  assert.equal(report.summary.unhealthy, 4);
  assert.equal(report.summary.optional, 1);
  assert.deepEqual(
    report.checks.slice(5).map(({ status }) => status),
    ['missing', 'untracked', 'modified', 'unsafe', 'missing']
  );
  for (const check of report.checks) assert.ok(INSTALL_STATUSES.includes(check.status));
  assert.match(report.checks.find(({ id }) => id === 'b.untracked').recovery, /commit b/);
});

test('missing or invalid manifests do not infer provider artifacts', () => {
  for (const status of ['missing', 'invalid']) {
    const report = evaluateInstallation({
      projectRoot: '/repo',
      manifestResult: { ok: false, status, details: `${status} manifest` },
    });
    assert.equal(report.healthy, false);
    assert.deepEqual(
      report.checks.map(({ id }) => id),
      ['package.runtime', 'git.repository', 'manifest.file']
    );
  }
});
