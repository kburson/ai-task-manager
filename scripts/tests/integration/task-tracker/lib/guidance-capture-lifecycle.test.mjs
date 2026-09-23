// @story #1765
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  captureGuidanceLifecycle,
  measureLifecycleTraffic,
  validateLifecycleTranscript,
} from '../../../../maintenance/capture-guidance-lifecycle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const historical = JSON.parse(
  readFileSync(path.join(root, 'scripts/tests/fixtures/1558/actual-explain-traffic.json'))
);
let generated;
const capture = () => (generated ??= captureGuidanceLifecycle());
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

test('a selected list of isolated action queries is not a lifecycle transcript', () => {
  assert.throws(() => validateLifecycleTranscript(historical), /lifecycle:events/);
});

test('the corrected public CLI capture has one contiguous authority history', () => {
  const result = capture();
  assert.equal(result.schema, 'aitm.guidance-lifecycle-capture/v1');
  assert.equal(validateLifecycleTranscript(result), true);
  assert.equal(result.authority, 'deterministic-fixture');
  assert.match(result.limitation, /no lifecycle action, approval, or merge was executed/);
  for (const event of result.events.filter(({ kind }) => kind === 'transition')) {
    assert.equal(event.source, 'fixture-injection');
    assert.equal(event.executedAction, null);
    assert.equal(event.agentVisible, false);
  }
  assert.deepEqual(
    result.events.filter(({ kind }) => kind === 'transition').map(({ to }) => to.state),
    ['plan', 'plan', 'develop', 'test', 'review', 'review', 'done']
  );
  assert.deepEqual(
    result.events.filter(({ kind }) => kind !== 'transition').map(({ name }) => name),
    [
      'ready-first-load',
      'matching-receipt',
      'compaction-reset',
      'blocked-migration-freeze',
      'diagnostic',
      'refusal-remediation',
      'agent-change',
      'source-only-change',
      'lifecycle-resume',
      'lifecycle-promote',
      'lifecycle-test',
      'lifecycle-review',
      'lifecycle-deliver',
      'external-approval',
      'external-merge',
      'lifecycle-close',
      'post-close-state',
    ]
  );
  assert.deepEqual(result.measurement.traffic, measureLifecycleTraffic(result.events));
  assert.equal(result.identity.transcriptSha256, sha256(JSON.stringify(result.events)));
  const byName = (name) => result.events.find((event) => event.name === name);
  assert.equal(byName('ready-first-load').typed.guidanceStatuses[0], 'expanded');
  assert.equal(byName('matching-receipt').typed.guidanceStatuses[0], 'not-modified');
  assert.equal(byName('compaction-reset').typed.guidanceStatuses[0], 'expanded');
  assert.equal(byName('blocked-migration-freeze').typed.status, 'blocked');
  assert.ok(JSON.parse(byName('diagnostic').stdout).fullDecision);
  assert.equal(byName('refusal-remediation').typed.status, 'ready');
  assert.equal(byName('agent-change').typed.guidanceStatuses[0], 'expanded');
  assert.equal(byName('source-only-change').typed.guidanceStatuses[0], 'not-modified');
  assert.match(byName('external-approval').stdout, /APPROVED/);
  assert.match(byName('external-merge').stdout, /mergedAt/);
  assert.equal(byName('post-close-state').state, 'done');
  assert.equal(JSON.parse(byName('post-close-state').stdout).state, 'CLOSED');
});

test('required query and external boundaries cannot disappear from the total', () => {
  const missingDiagnostic = structuredClone(capture());
  missingDiagnostic.events = missingDiagnostic.events.filter(({ name }) => name !== 'diagnostic');
  assert.throws(
    () => validateLifecycleTranscript(missingDiagnostic),
    /lifecycle:required:diagnostic/
  );

  const missingMerge = structuredClone(capture());
  missingMerge.events = missingMerge.events.filter(({ name }) => name !== 'external-merge');
  assert.throws(
    () => validateLifecycleTranscript(missingMerge),
    /lifecycle:required:external-merge/
  );

  const duplicatedTraffic = structuredClone(capture());
  duplicatedTraffic.measurement.traffic.categories.query.characters += 10;
  assert.throws(
    () => validateLifecycleTranscript(duplicatedTraffic),
    /lifecycle:traffic-accounting/
  );

  const disconnected = structuredClone(capture());
  disconnected.events.find(({ name }) => name === 'enter-test').to.revision += 1;
  assert.throws(() => validateLifecycleTranscript(disconnected), /lifecycle:transition-chain/);
});

test('the committed corrected artifact is bound to its runner and preserves the historical capture', () => {
  const artifact = JSON.parse(
    readFileSync(
      path.join(root, 'scripts/tests/fixtures/1558/actual-explain-traffic-corrected.json')
    )
  );
  assert.equal(validateLifecycleTranscript(artifact), true);
  const runnerPath = 'scripts/maintenance/capture-guidance-lifecycle.mjs';
  const runner = artifact.identity.implementationFiles.find(
    ({ path: file }) => file === runnerPath
  );
  const committed = spawnSync('git', ['show', `${artifact.identity.sourceCommit}:${runnerPath}`], {
    cwd: root,
  });
  assert.equal(committed.status, 0);
  assert.equal(runner.sha256, sha256(committed.stdout));
  assert.equal(artifact.identity.transcriptSha256, sha256(JSON.stringify(artifact.events)));
  assert.deepEqual(
    artifact.events.map(({ kind, name, stateRevision }) => [kind, name, stateRevision ?? null]),
    capture().events.map(({ kind, name, stateRevision }) => [kind, name, stateRevision ?? null])
  );
  assert.deepEqual(artifact.measurement.traffic, measureLifecycleTraffic(artifact.events));
  const historicalPath = 'scripts/tests/fixtures/1558/actual-explain-traffic.json';
  const historicalAtSource = spawnSync(
    'git',
    ['show', `${artifact.identity.sourceCommit}:${historicalPath}`],
    { cwd: root }
  );
  assert.equal(historicalAtSource.status, 0);
  assert.equal(
    sha256(readFileSync(path.join(root, historicalPath))),
    sha256(historicalAtSource.stdout)
  );
});
