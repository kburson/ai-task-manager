// @story #1767
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  captureGuidanceLifecycle,
  validateLifecycleTranscript,
} from '../../../../maintenance/capture-guidance-lifecycle.mjs';
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

test('recertification captures a separate contiguous public CLI authority history', () => {
  const capture = captureGuidanceLifecycle({ mode: 'recertification' });
  assert.equal(capture.identity.mode, 'recertification');
  assert.equal(validateLifecycleTranscript(capture), true);
  for (const name of [
    'lifecycle-promote',
    'lifecycle-test',
    'lifecycle-review',
    'lifecycle-deliver',
    'lifecycle-close',
  ]) {
    const event = capture.events.find((item) => item.name === name);
    assert.equal(event?.typed.status, 'ready', `${name} must have complete authority`);
    assert.ok(event.remoteAuthorityReads > 0, `${name} must read authority`);
  }
});
