// Unit tests for lib/derive-drivers.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMisestimate,
  detectSandboxRetries,
  detectRepickup,
  detectLargeDiff,
  deriveDrivers,
} from '../lib/derive-drivers.mjs';

test('detectMisestimate fires when |Δ%| > 100', () => {
  const r = detectMisestimate({ fields: { estimate: 3, engagedTime: 18 } }); // est 180min, act 18min => -90%
  assert.equal(r, null);
  const r2 = detectMisestimate({ fields: { estimate: 1, engagedTime: 300 } }); // est 60, act 300 => +400%
  assert.match(r2, /significant misestimate/);
  assert.match(r2, /\+400%/);
});

test('detectMisestimate parses board duration strings (#243)', () => {
  // engagedTime arrives as a board Text duration string (integer seconds).
  // est 1h (60min) vs actual "00d 05h 00m 00s" (300min) => +400%.
  const r = detectMisestimate({ fields: { estimate: 1, engagedTime: '00d 05h 00m 00s' } });
  assert.match(r, /significant misestimate/);
  assert.match(r, /\+400%/);
  // Malformed string => clean no-op, not a throw.
  assert.equal(detectMisestimate({ fields: { estimate: 1, engagedTime: 'garbage' } }), null);
});

test('detectMisestimate returns null on missing inputs', () => {
  assert.equal(detectMisestimate({ fields: {} }), null);
  assert.equal(detectMisestimate({ fields: { estimate: 0, engagedTime: 5 } }), null);
});

test('detectSandboxRetries fires at >= 2', () => {
  const comments = [
    { body: '## ✗ Sandboxed verification failed\nbody', createdAt: 'a' },
    { body: '## ✗ Sandboxed verification failed\nbody', createdAt: 'b' },
  ];
  assert.match(detectSandboxRetries({ comments }), /2 test-cycle retries/);
  assert.equal(detectSandboxRetries({ comments: comments.slice(0, 1) }), null);
});

test('detectRepickup fires on > 1 entered-develop markers', () => {
  const body =
    '<!-- aitm-entered-develop: 2026-05-01 -->\n<!-- aitm-entered-develop: 2026-05-02 -->';
  assert.match(detectRepickup({ body }), /re-entry/);
  assert.equal(detectRepickup({ body: '<!-- aitm-entered-develop: x -->' }), null);
});

test('detectLargeDiff fires when total exceeds Size threshold', () => {
  const body = '<!-- aitm-commits: abc +200/-100 def +500/-50 -->';
  const r = detectLargeDiff({ body, fields: { size: 'S' } }); // S threshold 150, total 850
  assert.match(r, /scope larger/);
  const r2 = detectLargeDiff({ body, fields: { size: 'XL' } });
  assert.equal(r2, null);
});

test('deriveDrivers composes detectors', () => {
  const signals = {
    body: '<!-- aitm-entered-develop: x --><!-- aitm-entered-develop: y -->',
    comments: [],
    fields: { estimate: 1, engagedTime: 300 },
  };
  const out = deriveDrivers(signals);
  assert.ok(out.some((d) => /misestimate/.test(d)));
  assert.ok(out.some((d) => /re-entry/.test(d)));
});

test('deriveDrivers fallback when no signals fire', () => {
  const out = deriveDrivers({ body: '', comments: [], fields: {} });
  assert.equal(out.length, 1);
  assert.match(out[0], /no notable drivers/);
});

test('deriveDrivers tolerates undefined signals', () => {
  const out = deriveDrivers();
  assert.equal(out.length, 1);
});
