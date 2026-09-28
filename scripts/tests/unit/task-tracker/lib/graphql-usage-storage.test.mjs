// @story #1836
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as usage from '../../../../task-tracker/lib/graphql-usage/index.mjs';
import path from 'node:path';
import { observation } from '../../../helpers/graphql-usage/observation.mjs';
async function repository(t) {
  await fs.mkdir('.tmp', { recursive: true });
  const base = await fs.mkdtemp(path.resolve('.tmp/graphql-unit-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const cwd = path.join(base, 'main');
  await fs.mkdir(path.join(cwd, '.git', 'objects'), { recursive: true });
  await fs.writeFile(path.join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main');
  return { cwd, base };
}
const options = (cwd, extra = {}) => ({
  cwd,
  permissionContext: 'test-sandbox',
  runGit: async (args) => (args.includes('--show-toplevel') ? cwd : path.join(cwd, '.git')),
  ...extra,
});

test('runtime and launcher identity propagate, unknown descendants stay unknown', async (t) => {
  const { cwd } = await repository(t);
  assert.equal(typeof usage.enrollUsage, 'function');
  const runtime = await usage.enrollUsage(
    options(cwd, { runtimeSessionId: 'private/provider/session', trustedRuntime: true })
  );
  assert.equal(runtime.context.sessionSource, 'runtime');
  assert.match(runtime.context.sessionId, new RegExp('^sha256:[a-f0-9]{64}$'));
  const a = await usage.enrollUsage(options(cwd));
  const b = await usage.enrollUsage(options(cwd));
  assert.notEqual(a.context.sessionId, b.context.sessionId);
  assert.equal(a.context.sessionSource, 'measurement-launcher');
  const child = await usage.enrollUsage(options(cwd, { descendant: true, env: a.env }));
  const nested = await usage.enrollUsage(options(cwd, { descendant: true, env: child.env }));
  assert.equal(nested.context.sessionId, a.context.sessionId);
  assert.equal(nested.context.enrollmentId, a.context.enrollmentId);
  for (const env of [{}, { AITM_GRAPHQL_USAGE_CONTEXT: 'bad secret' }]) {
    const unknown = await usage.enrollUsage(options(cwd, { descendant: true, env }));
    assert.equal(unknown.context.sessionId, null);
    assert.equal(unknown.context.sessionSource, 'unknown');
    assert.ok(unknown.diagnostics.some((d) => d.code === 'invalid-inherited-context'));
  }
});

test('cache expires in 60 minutes and root, permission, version, session changes require fresh probes', async (t) => {
  const { cwd } = await repository(t);
  const start = Date.parse('2026-09-28T00:00:00.000Z');
  const a = await usage.enrollUsage(options(cwd, { now: start }));
  for (const extra of [
    { now: start + 3_600_000 },
    { permissionContext: 'other' },
    { collectorVersion: 'v2' },
    { runtimeSessionId: 'other', trustedRuntime: true },
  ]) {
    const b = await usage.enrollUsage(options(cwd, { now: start + 1, env: a.env, ...extra }));
    assert.notEqual(b.context.enrollmentId, a.context.enrollmentId);
  }
  const other = await repository(t);
  const b = await usage.enrollUsage(options(other.cwd, { env: a.env, now: start + 1 }));
  assert.notEqual(b.context.commonRootId, a.context.commonRootId);
  assert.notEqual(b.context.enrollmentId, a.context.enrollmentId);
});

test('probe diagnoses scope, access, disk, disabled and absent Git without leaking paths', async (t) => {
  const { cwd, base } = await repository(t);
  for (const [code, proven, wanted] of [
    ['EACCES', true, 'shared-root-out-of-sandbox-scope'],
    ['EACCES', false, 'shared-root-access-denied'],
    ['ENOSPC', false, 'storage-failure'],
  ]) {
    const io = {
      ...fs,
      open: async () => {
        throw Object.assign(new Error('secret-token'), { code });
      },
    };
    const r = await usage.enrollUsage(
      options(cwd, { io, scopeDenialConfirmed: proven, stderr: () => {} })
    );
    assert.equal(r.available, false);
    assert.equal(r.diagnostics.at(-1).code, wanted);
    assert.equal(r.env.AITM_GRAPHQL_USAGE_CONTEXT, undefined);
    assert.equal(JSON.stringify(r.diagnostics).includes('secret'), false);
  }
  assert.equal(
    (await usage.enrollUsage(options(cwd, { enabled: false }))).diagnostics[0].code,
    'collection-disabled'
  );
  assert.equal(
    (
      await usage.enrollUsage(
        options(base, {
          runGit: async () => {
            throw new Error('no Git');
          },
        })
      )
    ).diagnostics[0].code,
    'git-root-resolution-failed'
  );
});

test('writer queues overlapping records, rejects payloads, invalidates enrollment on write failure and bounds fallback', async (t) => {
  const { cwd } = await repository(t);
  const e = await usage.enrollUsage(options(cwd));
  const w = await usage.createUsageWriter(e);
  assert.equal(await w.append({ ...observation(e.context), query: 'secret' }), false);
  await Promise.all(
    Array.from({ length: 40 }, (_, i) => w.append(observation(e.context, `c${i}`)))
  );
  await w.close();
  const read = await usage.readUsage(e.root);
  assert.equal(read.observations.length, 40);
  assert.equal(read.diagnostics.filter((d) => d.code === 'writer-start').length, 1);
  assert.equal(read.diagnostics.filter((d) => d.code === 'writer-close').length, 1);
  assert.equal((await fs.stat(w.file)).mode & 0o777, 0o600);
  const warnings = [];
  const broken = await usage.createUsageWriter(e, { stderr: (s) => warnings.push(s) });
  await fs.rm(broken.file);
  await fs.mkdir(broken.file);
  for (let i = 0; i < 10; i++) assert.equal(await broken.append(observation(e.context)), false);
  assert.equal(e.available, false);
  assert.equal(e.env.AITM_GRAPHQL_USAGE_CONTEXT, undefined);
  assert.ok(warnings.join('').length < 1024);
  assert.equal(warnings.join('').includes(cwd), false);
  await broken.close();
});

test('reader preserves complete lines and reports malformed, partial and conflicting duplicates', async (t) => {
  const { cwd } = await repository(t);
  const e = await usage.enrollUsage(options(cwd));
  const w = await usage.createUsageWriter(e);
  const row = observation(e.context);
  await w.append(row);
  await w.append(row);
  await w.append({ ...row, pointCost: 2 });
  await w.close();
  await fs.appendFile(w.file, 'bad-json\n{"partial":');
  const r = await usage.readUsage(e.root);
  assert.equal(r.observations.length, 0);
  assert.equal(r.duplicateCount, 1);
  assert.equal(r.conflictCount, 1);
  assert.equal(r.partialLineCount, 1);
  assert.ok(r.diagnostics.some((d) => d.code === 'malformed-record'));
});

test('cleanup requires export, excludes active writers, persists intervals and pause gaps; soft caps never delete', async (t) => {
  const { cwd } = await repository(t);
  const e = await usage.enrollUsage(options(cwd));
  const active = await usage.createUsageWriter(e);
  const closed = await usage.createUsageWriter(e);
  await closed.append(observation(e.context));
  await closed.close();
  const stats = await usage.usageRetention(e.root, { softBytes: 1, softFiles: 1 });
  assert.ok(stats.bytes > 1);
  assert.ok(stats.files >= 3);
  assert.deepEqual(stats.warnings, ['soft-byte-cap', 'soft-file-cap']);
  await assert.rejects(usage.cleanupUsage(e.root, {}), new RegExp('export'));
  const result = await usage.cleanupUsage(e.root, { afterExport: true, operatorDirected: true });
  assert.ok(result.removed.some((r) => r.startedAt === '2026-09-28T00:00:00.000Z'));
  assert.ok(await fs.stat(active.file));
  await usage.pauseUsage(e.root);
  const read = await usage.readUsage(e.root);
  assert.ok(read.controls.some((r) => r.action === 'cleanup'));
  assert.ok(read.controls.some((r) => r.action === 'pause'));
  assert.throws(() =>
    usage.validateUsageControl({ ...read.controls[0], payload: { token: 'secret' } })
  );
  await active.close();
});

test('shared-root symlink redirects cannot authorize storage outside the dedicated Git subtree', async (t) => {
  const { cwd, base } = await repository(t);
  const resolved = await usage.resolveUsageRoot(cwd, options(cwd));
  const outside = base + '/outside';
  await fs.mkdir(outside);
  await fs.mkdir(resolved.commonDir + '/aitm');
  await fs.symlink(outside, resolved.root);
  const e = await usage.enrollUsage(options(cwd, { stderr: () => {} }));
  assert.equal(e.available, false);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('malformed inherited context reprobes, foreign records are rejected and writer soft caps warn without deletion', async (t) => {
  const { cwd } = await repository(t);
  const a = await usage.enrollUsage(options(cwd));
  for (const change of [
    { probedAt: 'secret' },
    { payload: { token: 'secret' } },
    { sessionId: '../escape' },
  ]) {
    const env = { AITM_GRAPHQL_USAGE_CONTEXT: JSON.stringify({ ...a.context, ...change }) };
    const b = await usage.enrollUsage(options(cwd, { descendant: true, env }));
    assert.equal(b.context.sessionId, null);
    assert.notEqual(b.context.enrollmentId, a.context.enrollmentId);
  }
  const warnings = [];
  const w = await usage.createUsageWriter(a, {
    stderr: (s) => warnings.push(s),
    softBytes: 1,
    softFiles: 1,
    checkEvery: 1,
  });
  assert.equal(await w.append({ ...observation(a.context), commonRootId: 'foreign' }), false);
  await w.append(observation(a.context));
  await w.close();
  assert.ok(warnings.some((s) => s.includes('soft-byte-cap')));
  assert.equal((await usage.readUsage(a.root)).observations.length, 1);
});

test('participant helper records denied and unknown sessions and refuses nested payloads', async (t) => {
  const { cwd } = await repository(t);
  const e = await usage.enrollUsage(options(cwd));
  const row = usage.manifestRow(
    { ...e.context, sessionId: null, sessionSource: 'unknown' },
    'denied',
    Date.now(),
    'permission-denied'
  );
  await usage.writeParticipant(e.root, row);
  await assert.rejects(usage.writeParticipant(e.root, { ...row, payload: { secret: 'value' } }));
  assert.ok(
    (await usage.readUsage(e.root)).participants.some(
      (p) => p.outcome === 'denied' && p.sessionId === null
    )
  );
});

test('reader rejects inherited property schema names instead of returning unvalidated payloads', async (t) => {
  const { cwd } = await repository(t);
  const e = await usage.enrollUsage(options(cwd));
  const w = await usage.createUsageWriter(e);
  await w.close();
  await fs.appendFile(
    w.file,
    JSON.stringify({ schemaVersion: 'toString', payload: { token: 'secret' } }) + '\n'
  );
  const read = await usage.readUsage(e.root);
  assert.equal(read.controls.length, 0);
  assert.equal(JSON.stringify(read).includes('secret'), false);
});

test('soft cap chatter cannot suppress the required storage failure fallback', async (t) => {
  const { cwd } = await repository(t);
  const e = await usage.enrollUsage(options(cwd));
  const warnings = [];
  const w = await usage.createUsageWriter(e, {
    stderr: (s) => warnings.push(s),
    softBytes: 1,
    softFiles: 1,
    checkEvery: 1,
  });
  for (let i = 0; i < 4; i++) await w.append(observation(e.context, 'warn-' + i));
  await fs.rm(w.file);
  await fs.mkdir(w.file);
  await w.append(observation(e.context));
  await w.close();
  assert.ok(warnings.some((s) => s.includes('storage-failure')));
  assert.ok(warnings.join('').length < 1024);
});

test('cleanup refuses a shared-root symlink swapped after enrollment', async (t) => {
  const { cwd, base } = await repository(t);
  const e = await usage.enrollUsage(options(cwd));
  const moved = path.join(base, 'moved');
  await fs.rename(e.root, moved);
  await fs.symlink(moved, e.root);
  await assert.rejects(usage.cleanupUsage(e.root, { afterExport: true, operatorDirected: true }));
});

test('conflicting call IDs remain excluded when repeated again, preserving unrelated calls', async (t) => {
  const { cwd } = await repository(t);
  const e = await usage.enrollUsage(options(cwd));
  const a = await usage.createUsageWriter(e);
  const b = await usage.createUsageWriter(e);
  const row = observation(e.context, 'conflict');
  await a.append(row);
  await a.append(observation(e.context, 'valid'));
  await b.append({ ...row, pointCost: 2 });
  await b.append(row);
  await a.close();
  await b.close();
  const read = await usage.readUsage(e.root);
  assert.deepEqual(
    read.observations.map((r) => r.callId),
    ['valid']
  );
  assert.equal(read.invalidCallIds.includes('conflict'), true);
});

test('unknown ancestor launch route remains explicitly unknown without throwing in descendants', async (t) => {
  const { cwd } = await repository(t);
  const ancestor = await usage.enrollUsage(options(cwd, { launchRoute: 'unknown' }));
  assert.equal(ancestor.available, true);
  const child = await usage.enrollUsage(options(cwd, { descendant: true, env: ancestor.env }));
  assert.equal(child.available, true);
  assert.equal(child.context.sessionId, ancestor.context.sessionId);
  assert.equal(child.context.collectorLaunchRoute, 'unknown');
  assert.equal(child.context.originatingLaunchRoute, null);
  assert.ok(child.diagnostics.some((d) => d.code === 'unsupported-context'));
});

test('writer refuses filename and root redirection after startup without touching outside files', async (t) => {
  for (const redirectRoot of [false, true]) {
    const { cwd, base } = await repository(t);
    const e = await usage.enrollUsage(options(cwd));
    const w = await usage.createUsageWriter(e, { stderr: () => {} });
    const outside = path.join(base, 'outside');
    await fs.mkdir(outside);
    const target = path.join(outside, 'target.jsonl');
    await fs.writeFile(target, 'unchanged');
    if (redirectRoot) {
      await fs.rename(e.root, path.join(base, 'old-root'));
      await fs.symlink(outside, e.root);
      const redirected = path.join(outside, path.relative(e.root, w.file));
      await fs.mkdir(path.dirname(redirected), { recursive: true });
      await fs.symlink(target, redirected);
    } else {
      await fs.unlink(w.file);
      await fs.symlink(target, w.file);
    }
    assert.equal(await w.append(observation(e.context)), false);
    assert.equal(e.available, false);
    assert.equal(await fs.readFile(target, 'utf8'), 'unchanged');
    await w.close();
  }
});

test('reader bounds each active-file read to the extent captured before concurrent append', async (t) => {
  const { cwd } = await repository(t);
  const e = await usage.enrollUsage(options(cwd));
  const w = await usage.createUsageWriter(e);
  await w.append(observation(e.context, 'before'));
  let appended = false;
  const io = {
    ...fs,
    open: async (...args) => {
      const handle = await fs.open(...args);
      const stat = handle.stat.bind(handle);
      handle.stat = async () => {
        const extent = await stat();
        if (args[0] === w.file && !appended) {
          appended = true;
          await w.append(observation(e.context, 'after'));
        }
        return extent;
      };
      return handle;
    },
  };
  const snapshot = await usage.readUsage(e.root, { io });
  assert.equal(appended, true);
  assert.deepEqual(
    snapshot.observations.map((r) => r.callId),
    ['before']
  );
  assert.equal((await usage.readUsage(e.root)).observations.length, 2);
  await w.close();
});
