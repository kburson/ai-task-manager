// @story #1767 #1859
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  captureGuidanceLifecycle,
  validateLifecycleTranscript,
} from '../../../helpers/capture-guidance-release.mjs';
import { capturedCommitBytes } from '../../../helpers/captured-commit-bytes.mjs';
import { deliveryExplainReadPorts } from '../../../../task-tracker/verbs/explain.mjs';

test('delivery Explain exposes only named read ports', () => {
  const ports = deliveryExplainReadPorts({
    cfg: { repo: 'fixture/repository' },
    projectRoot: '/fixture',
    factory: () =>
      new Proxy(
        { providerActionAvailable: true, requestPullRequestReview: () => {} },
        { get: (target, name) => target[name] ?? (() => {}) }
      ),
  });
  assert.equal(typeof ports.fetchPullRequest, 'function');
  assert.equal(typeof ports.requestPullRequestReview, 'undefined');
  assert.equal(typeof ports.createPullRequest, 'undefined');
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const digest = (value) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const archived = JSON.parse(
  readFileSync(
    new URL(
      '../../../../tests/fixtures/1558/actual-explain-traffic-recertification.json',
      import.meta.url
    ),
    'utf8'
  )
);
let current;
const capture = () => (current ??= captureGuidanceLifecycle({ mode: 'recertification' }));

test('archived recertification retains its observed authority and original runner provenance', () => {
  assert.equal(archived.identity.mode, 'recertification');
  assert.equal(validateLifecycleTranscript(archived), true);
  assert.equal(archived.identity.transcriptSha256, digest(JSON.stringify(archived.events)));
  const runnerPath = 'scripts/maintenance/capture-guidance-lifecycle.mjs';
  const runner = archived.identity.implementationFiles.find(
    ({ path: file }) => file === runnerPath
  );
  assert.equal(
    runner.sha256,
    digest(capturedCommitBytes(root, archived.identity.sourceCommit, runnerPath))
  );
  const certification = JSON.parse(
    readFileSync(path.join(root, 'scripts/tests/fixtures/1558/feasibility-recheck-1767.json'))
  );
  const recorded = certification.inputs.records.find(
    ({ role }) => role === 'recertification-capture'
  );
  assert.equal(digest(readFileSync(path.join(root, recorded.path))), recorded.sha256);
  for (const name of [
    'lifecycle-promote',
    'lifecycle-test',
    'lifecycle-review',
    'lifecycle-deliver',
    'lifecycle-close',
  ]) {
    const event = archived.events.find((item) => item.name === name);
    assert.equal(event?.typed.status, 'ready', name + ' records historical authority');
    assert.ok(event.remoteAuthorityReads > 0);
  }
});

test('current recertification captures complete simulated authority without executing actions', () => {
  const result = capture();
  assert.equal(validateLifecycleTranscript(result), true);
  for (const name of [
    'lifecycle-promote',
    'lifecycle-test',
    'lifecycle-review',
    'lifecycle-deliver',
    'lifecycle-close',
  ]) {
    const event = result.events.find((item) => item.name === name);
    assert.equal(event?.typed.status, 'ready', name + ' must have complete simulated authority');
    assert.ok(event.remoteAuthorityReads > 0);
  }
  assert.match(result.limitation, /does not authorize a delivery GO/);
  for (const event of result.events.filter(({ kind }) => kind === 'transition')) {
    assert.equal(event.executedAction, null);
    assert.equal(event.source, 'fixture-injection');
  }
});

test('current recertification replays start from identical current authority bytes', () => {
  const first = capture();
  const second = captureGuidanceLifecycle({ mode: 'recertification' });
  assert.equal(second.identity.initialFixtureSha256, first.identity.initialFixtureSha256);
  assert.equal(second.identity.initialBodySha256, first.identity.initialBodySha256);
  assert.deepEqual(
    second.events.filter(({ kind }) => kind === 'transition'),
    first.events.filter(({ kind }) => kind === 'transition')
  );
});
