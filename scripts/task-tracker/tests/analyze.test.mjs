#!/usr/bin/env node
// Unit tests for the deep-dive-complete marker write in verbs/analyze.mjs.
//
// Covers AC #63 / #71 of issue #90: `markDeepDiveComplete` writes the hidden
// `<!-- aitm-deep-dive-complete: <ts> -->` marker once and is idempotent on
// re-run. I/O is injected via deps so the test does not touch network or fs.

import { strict as assert } from 'node:assert';
import { markDeepDiveComplete } from '../verbs/analyze.mjs';
import { hasDeepDiveCompleteMarker } from '../lib/markers.mjs';

const CFG = { repo: 'test/repo' };
const NOW = () => '2026-05-11T12:00:00.000Z';

const BARE_BODY = [
  '# Item',
  '',
  '## Acceptance Criteria',
  '- [ ] AC',
  '',
  '## Deep-Dive Analysis (2026-05-11)',
  '',
  'content',
  '',
].join('\n');

// ── Test 1: writes marker on first call ──────────────────────────────────────
{
  const state = { body: BARE_BODY, writes: 0 };
  const deps = {
    fetchBody: async () => state.body,
    writeBody: async (b) => {
      state.body = b;
      state.writes++;
    },
  };
  const res = await markDeepDiveComplete({ issueNumber: 123, cfg: CFG, now: NOW, deps });
  assert.equal(res.changed, true, 'first call must report changed=true');
  assert.equal(res.ts, '2026-05-11T12:00:00Z');
  assert.equal(state.writes, 1, 'writeBody invoked exactly once');
  assert.ok(hasDeepDiveCompleteMarker(state.body), 'body now carries the marker');
  assert.match(state.body, /<!-- aitm-deep-dive-complete: 2026-05-11T12:00:00Z -->/);
}

// ── Test 2: idempotent — second call is a no-op ──────────────────────────────
{
  const seeded = BARE_BODY + '\n<!-- aitm-deep-dive-complete: 2026-05-10T00:00:00Z -->\n';
  const state = { body: seeded, writes: 0 };
  const deps = {
    fetchBody: async () => state.body,
    writeBody: async (b) => {
      state.body = b;
      state.writes++;
    },
  };
  const res = await markDeepDiveComplete({ issueNumber: 123, cfg: CFG, now: NOW, deps });
  assert.equal(res.changed, false, 'second call must report changed=false');
  assert.equal(res.ts, null);
  assert.equal(state.writes, 0, 'writeBody must NOT be invoked on idempotent path');
  // Original marker timestamp preserved.
  assert.match(state.body, /<!-- aitm-deep-dive-complete: 2026-05-10T00:00:00Z -->/);
}

// ── Test 3: argument validation ──────────────────────────────────────────────
{
  await assert.rejects(() => markDeepDiveComplete({ cfg: CFG }), /issueNumber is required/);
  await assert.rejects(() => markDeepDiveComplete({ issueNumber: 1 }), /cfg\.repo is required/);
}

console.log('analyze.test.mjs: all passed');
