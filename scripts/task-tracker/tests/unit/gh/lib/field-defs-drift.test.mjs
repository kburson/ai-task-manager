// @story #45
import assert from 'node:assert/strict';
import { detectFieldDefsDrift, formatDrift } from '../../../../../gh/lib/field-defs-drift.mjs';

// Identical arrays — in sync
{
  const a = [{ key: 'priority' }, { key: 'size' }];
  const b = [{ key: 'priority' }, { key: 'size' }];
  const r = detectFieldDefsDrift(a, b);
  assert.deepEqual(r, { added: [], removed: [], inSync: true });
  assert.equal(formatDrift(r), 'in-sync');
}

// Default has new key — `added` populated
{
  const local = [{ key: 'priority' }];
  const dflt = [{ key: 'priority' }, { key: 'startTime' }];
  const r = detectFieldDefsDrift(local, dflt);
  assert.deepEqual(r.added, ['startTime']);
  assert.deepEqual(r.removed, []);
  assert.equal(r.inSync, false);
  assert.match(formatDrift(r), /added: startTime/);
}

// Local has obsolete key — `removed` populated
{
  const local = [{ key: 'priority' }, { key: 'startDate' }, { key: 'endDate' }];
  const dflt = [{ key: 'priority' }];
  const r = detectFieldDefsDrift(local, dflt);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.removed.sort(), ['endDate', 'startDate']);
  assert.equal(r.inSync, false);
}

// Both directions diverge
{
  const local = [{ key: 'priority' }, { key: 'startDate' }];
  const dflt = [{ key: 'priority' }, { key: 'startTime' }];
  const r = detectFieldDefsDrift(local, dflt);
  assert.deepEqual(r.added, ['startTime']);
  assert.deepEqual(r.removed, ['startDate']);
  assert.equal(r.inSync, false);
  const f = formatDrift(r);
  assert.match(f, /added: startTime/);
  assert.match(f, /removed: startDate/);
}

// Empty arrays — in sync
{
  const r = detectFieldDefsDrift([], []);
  assert.equal(r.inSync, true);
}

// Order independence
{
  const a = [{ key: 'a' }, { key: 'b' }];
  const b = [{ key: 'b' }, { key: 'a' }];
  assert.equal(detectFieldDefsDrift(a, b).inSync, true);
}

console.log('field-defs-drift.test.mjs: all passed');
