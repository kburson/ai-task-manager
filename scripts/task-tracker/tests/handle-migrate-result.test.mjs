#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { handleMigrateResult } from '../task-tracker.mjs';

function makeCaptures() {
  const writes = [];
  const exits = [];
  return {
    stderr: { write: (s) => writes.push(String(s)) },
    exit: (code) => exits.push(code),
    writes,
    exits,
  };
}

// status === 0 → no-op
{
  const c = makeCaptures();
  handleMigrateResult({ status: 0, signal: null, error: null }, c);
  assert.equal(c.writes.length, 0);
  assert.equal(c.exits.length, 0);
}

// signal-killed (status null, signal SIGTERM) → exit 1, log signal
{
  const c = makeCaptures();
  handleMigrateResult({ status: null, signal: 'SIGTERM', error: null }, c);
  assert.deepEqual(c.exits, [1], 'signal-kill must exit non-zero');
  assert.equal(c.writes.length, 1);
  assert.match(c.writes[0], /killed by signal: SIGTERM/);
}

// spawn error (ENOENT) → exit 1, log error message
{
  const c = makeCaptures();
  const err = new Error('spawn ENOENT');
  handleMigrateResult({ status: null, signal: null, error: err }, c);
  assert.deepEqual(c.exits, [1]);
  assert.equal(c.writes.length, 1);
  assert.match(c.writes[0], /migrate spawn error: spawn ENOENT/);
}

// non-zero exit code preserved
{
  const c = makeCaptures();
  handleMigrateResult({ status: 42, signal: null, error: null }, c);
  assert.deepEqual(c.exits, [42], 'exit code must propagate');
  assert.equal(c.writes.length, 0);
}

// error + signal both set → both logged
{
  const c = makeCaptures();
  handleMigrateResult({ status: null, signal: 'SIGKILL', error: new Error('boom') }, c);
  assert.deepEqual(c.exits, [1]);
  assert.equal(c.writes.length, 2);
}

console.log('handle-migrate-result.test.mjs: all passed');
