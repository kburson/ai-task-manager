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

import { decideCascadeChildClose } from '../../lib/cascade-child-close.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

test('source: cascade loop routes through decideCascadeChildClose', () => {
  assert.ok(
    /decideCascadeChildClose\(/.test(closeSrc),
    'close.mjs must call decideCascadeChildClose'
  );
  assert.ok(
    // close.mjs imports lazily via `await import('…')`; accept that idiom or a
    // static `import { … } from '…'`.
    /import\((['"])[^'"]*cascade-child-close\.mjs\1\)/.test(closeSrc) ||
      /import \{[^}]*decideCascadeChildClose[^}]*\} from '[^']*cascade-child-close\.mjs'/s.test(
        closeSrc
      ),
    'decideCascadeChildClose must be imported from lib/cascade-child-close.mjs'
  );
});

test('source: child gh issue close is gated by the decision, not unconditional', () => {
  // The decision must be evaluated, and the child `issue close` must be reachable
  // only on the shouldClose branch — the old shape (warn, then unconditional
  // `gh issue close`) is gone.
  const decIdx = closeSrc.indexOf('decideCascadeChildClose(');
  assert.ok(decIdx >= 0);
  const after = closeSrc.slice(decIdx, decIdx + 700);
  assert.ok(/shouldClose/.test(after), 'the shouldClose result must guard the child close');
  // A skip path (continue) must exist so a stuck child does not block the cascade.
  assert.ok(
    /shouldClose[\s\S]{0,400}continue/.test(after),
    'a non-closing child must continue to the next child'
  );
});
