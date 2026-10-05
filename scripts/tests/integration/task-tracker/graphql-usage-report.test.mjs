// @story #1838
// cspell:ignore xychart
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { repository } from '../../helpers/graphql-usage/fixture.mjs';
import { observation } from '../../helpers/graphql-usage/observation.mjs';
import {
  enrollUsage,
  createUsageWriter,
  cleanupUsage,
  readUsage,
} from '../../../task-tracker/lib/graphql-usage/storage.mjs';
const api = await import('../../../task-tracker/lib/graphql-usage/report.mjs').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
async function offline(root, opts = {}) {
  assert.equal(typeof api.reportUsage, 'function', 'offline report must exist');
  return api.reportUsage(root, opts);
}

async function recorded(t) {
  const { cwd } = await repository(t);
  const e = await enrollUsage({ cwd, permissionContext: 'test' });
  const w = await createUsageWriter(e);
  await w.append(observation(e.context));
  await w.close();
  return { e, w };
}

test('offline report and CLI render supplied records without any GitHub requests', async (t) => {
  const { e } = await recorded(t);
  const previous = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('unexpected network request');
  };
  t.after(() => {
    globalThis.fetch = previous;
  });
  const r = await offline(e.root);
  assert.equal(r.totals.observations, 1);
  assert.equal(r.commonRootId, e.context.commonRootId);
  assert.ok(r.aggregation.fileOpenCount >= 2);
  assert.ok(r.aggregation.elapsedMs >= 0);
  const blocked = path.join(e.root, 'blocked-bin');
  await fs.mkdir(blocked);
  const gh = path.join(blocked, 'gh');
  await fs.writeFile(gh, '#!/bin/sh\nexit 99\n');
  await fs.chmod(gh, 0o700);
  const guard = path.join(e.root, 'network-guard.mjs');
  await fs.writeFile(
    guard,
    `import http from 'node:http'; import https from 'node:https'; import {syncBuiltinESMExports} from 'node:module';
const fail=()=>{throw Error('unexpected network request');};
globalThis.fetch=fail;http.request=fail;http.get=fail;https.request=fail;https.get=fail;syncBuiltinESMExports();`
  );
  const exec = promisify(execFile);
  const cli = path.resolve('scripts/task-tracker/graphql-usage-report.mjs');
  const { stdout } = await exec(
    process.execPath,
    ['--import', guard, cli, '--root', e.root, '--format', 'markdown'],
    {
      env: { ...process.env, PATH: blocked },
      cwd: process.cwd(),
    }
  );
  assert.match(stdout, /known-point subtotal/i);
  assert.match(stdout, /Hourly/);
  assert.match(stdout, /Daily/);
  assert.match(stdout, /xychart-beta/);
  assert.match(stdout, /transport-unavailable|not-returned/);
  const { stdout: json } = await exec(
    process.execPath,
    ['--import', guard, cli, '--root', e.root, '--format', 'json'],
    { env: { ...process.env, PATH: blocked } }
  );
  assert.equal(JSON.parse(json).totals.observations, 1);
  assert.equal((await readUsage(e.root)).observations.length, 1);
  assert.match(stdout, /preliminary/i);
});

test('malformed, unsupported, partial and conflicting records are diagnosed while valid earlier rows survive', async (t) => {
  const { e, w } = await recorded(t);
  const source = observation(e.context);
  await fs.appendFile(
    w.file,
    [
      JSON.stringify(source),
      JSON.stringify({ ...source, pointCost: 9 }),
      'broken-json',
      JSON.stringify({ ...source, schemaVersion: 'aitm.graphql-usage.observation/v99' }),
      JSON.stringify({ ...source, callId: 'keep' }),
      '{"partial":',
    ].join('\n')
  );
  const r = await offline(e.root);
  assert.equal(r.totals.observations, 1);
  assert.equal(r.coverage.identicalDuplicates, 1);
  assert.equal(r.coverage.conflictingDuplicates, 1);
  assert.equal(r.coverage.unsupportedVersions, 1);
  assert.equal(r.coverage.malformedLines, 1);
  assert.equal(r.coverage.partialLines, 1);
});

test('active append cannot grow a snapshotted readable extent or appear prematurely in the report', async (t) => {
  const { e, w } = await recorded(t);
  let appended = false;
  const io = {
    ...fs,
    open: async (file, ...args) => {
      const handle = await fs.open(file, ...args);
      return {
        stat: async () => {
          const snapshot = await handle.stat();
          if (file === w.file && !appended) {
            appended = true;
            await fs.appendFile(
              file,
              JSON.stringify({ ...observation(e.context), callId: 'after-snapshot' }) + '\n'
            );
          }
          return snapshot;
        },
        read: handle.read.bind(handle),
        close: handle.close.bind(handle),
      };
    },
  };
  const first = await offline(e.root, { io });
  assert.equal(first.totals.observations, 1);
  assert.ok(first.aggregation.extents.every((x) => x.readBytes <= x.readableBytes));
  assert.equal((await offline(e.root)).totals.observations, 2);
});

test('cleanup-removed intervals remain gaps and unclosed writers remain active or unclean', async (t) => {
  const { e } = await recorded(t);
  await cleanupUsage(e.root, { afterExport: true, operatorDirected: true });
  const w = await createUsageWriter(e);
  await w.append(observation(e.context, 'still-active'));
  t.after(() => w.close());
  const r = await offline(e.root);
  assert.equal(r.coverage.storageGaps.length, 1);
  assert.equal(r.coverage.storageGaps[0].action, 'cleanup');
  assert.equal(r.coverage.activeOrUncleanWriters, 1);
  assert.equal(r.coverage.fleetCompleteness, 'lower-bound');
  assert.equal((await readUsage(e.root)).observations.length, 1);
});

test('unreadable source files remain visible as unknown coverage rather than disappearing', async (t) => {
  const { e, w } = await recorded(t);
  const io = {
    ...fs,
    open: async (file, ...args) => {
      if (file === w.file)
        throw Object.assign(new Error('fixture access refused'), { code: 'EACCES' });
      return fs.open(file, ...args);
    },
  };
  const r = await offline(e.root, {
    io,
    startedAt: '2026-09-28T00:00:00.000Z',
    endedAt: '2026-09-29T00:00:00.000Z',
  });
  assert.equal(r.coverage.unreadableFiles, 1);
  assert.equal(r.totals.observations, 0);
  assert.equal(r.coverage.fleetCompleteness, 'lower-bound');
});
