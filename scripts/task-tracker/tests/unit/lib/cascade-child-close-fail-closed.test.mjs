#!/usr/bin/env node
// @story #512
// Epic cascade close (`verbs/close.mjs`) must NOT close a child issue when that
// child's board move to Done genuinely fails (non-benign). Before #512 the code
// `console.warn`ed the failed move and then unconditionally ran `gh issue close`,
// leaving the child CLOSED while its board card was not Done — split-brain.
//
// The fix routes the move result through a pure
// `decideCascadeChildClose({ childMove })` helper (lib/cascade-child-close.mjs)
// that returns `shouldClose:false` only for a non-benign failure; the cascade
// loop closes the child only on the `shouldClose` path and surfaces actionable
// recovery guidance otherwise. The benign `done → done` no-op still closes.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideCascadeChildClose } from '../../../lib/cascade-child-close.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const closeSrc = readFileSync(path.resolve(__dirname, '..', '..', 'verbs', 'close.mjs'), 'utf8');

// ── AC1: a non-benign failed move blocks the child close ───────────────────────

test('decideCascadeChildClose: non-benign failed move → shouldClose:false with detail', () => {
  const d = decideCascadeChildClose({
    childMove: { ok: false, benign: false, stderr: 'item-edit refused: gate failed' },
  });
  assert.equal(d.shouldClose, false);
  assert.match(d.detail, /gate failed/);
});

test('decideCascadeChildClose: detail falls back to exit status when stderr is empty', () => {
  const d = decideCascadeChildClose({
    childMove: { ok: false, benign: false, stderr: '', status: 3 },
  });
  assert.equal(d.shouldClose, false);
  assert.match(d.detail, /exited 3/);
});

// ── benign no-op and success still close ───────────────────────────────────────

test('decideCascadeChildClose: benign done→done no-op → shouldClose:true', () => {
  const d = decideCascadeChildClose({ childMove: { ok: false, benign: true } });
  assert.equal(d.shouldClose, true);
});

test('decideCascadeChildClose: successful move → shouldClose:true', () => {
  const d = decideCascadeChildClose({ childMove: { ok: true } });
  assert.equal(d.shouldClose, true);
});

test('decideCascadeChildClose: absent move result → shouldClose:true (preserve prior behavior)', () => {
  assert.equal(decideCascadeChildClose({}).shouldClose, true);
  assert.equal(decideCascadeChildClose().shouldClose, true);
});

// ── AC2 + AC3: close.mjs wiring closes the child only on the shouldClose path ───

test('source: close no longer cascades child mutations under the parent lease', () => {
  assert.ok(
    !/decideCascadeChildClose\(/.test(closeSrc),
    'parent close must not reuse its lease to mutate child issues'
  );
});

test('source: Review children are refused before any parent terminal mutation', () => {
  assert.ok(
    /child issue\(s\) require their own work lease/.test(closeSrc),
    'close must direct each Review child to its own governed close session'
  );
  assert.ok(
    !/for\s*\([^)]*reviewChildren[\s\S]*?'issue',\s*'close'/s.test(closeSrc),
    'parent close must not invoke gh issue close for child issues'
  );
});
