#!/usr/bin/env node
// @story #215
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pendingPausePath } from '../hooks/on-stop.mjs';

// #215 AC7 — foreign-session refusal. When pending-pause.json.sessionId
// does not match the caller's sid, finalizeOrphanPause must:
//   1. Log a warning to stderr.
//   2. Return null.
//   3. NOT delete the marker file (the real owner can recover it).

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-foreign-'));

const sidCaller = 'caller-sid';
const sidOwner = 'real-owner-sid';

// Write a marker UNDER caller-sid's session dir but claiming to belong to
// real-owner-sid. This simulates the case where two sessions raced and the
// caller picked up the wrong marker.
const markerPath = pendingPausePath(sidCaller, tmp);
mkdirSync(path.dirname(markerPath), { recursive: true });
writeFileSync(
  markerPath,
  JSON.stringify({
    stoppedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    issue: '#500',
    state: 'develop',
    sessionId: sidOwner,
  })
);

// Run finalizeOrphanPause in a child process so we can capture stderr.
const script = `
import { finalizeOrphanPause } from '${path.resolve('scripts/task-tracker/orphan-finalize.mjs')}';
const r = await finalizeOrphanPause({
  sid: ${JSON.stringify(sidCaller)},
  reason: 'natural',
  projDir: ${JSON.stringify(tmp)},
});
process.stdout.write(JSON.stringify({ r }));
`;
const res = spawnSync('node', ['--input-type=module', '-e', script], {
  encoding: 'utf8',
  env: { ...process.env },
});
assert.equal(res.status, 0, `exit 0, got ${res.status}\n${res.stderr}`);

const parsed = JSON.parse(res.stdout);
assert.equal(parsed.r, null, 'returns null');
assert.match(
  res.stderr,
  /refusing to consume pending-pause\.json from foreign session real-owner-sid/,
  'stderr carries refusal warning naming the foreign sid'
);
assert.equal(existsSync(markerPath), true, 'marker NOT deleted — owner can recover');

rmSync(tmp, { recursive: true });
console.log('foreign-session-refusal.test.mjs: all passed');
