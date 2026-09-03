// @story #1497
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { recordFixture } from '../../../../helpers/evidence-v2/records.mjs';
import { journalPorts } from '../../../../helpers/evidence-v2/journal-ports.mjs';
import { encodeRecord } from '../../../../../task-tracker/lib/evidence-v2/codec.mjs';
import { readJournal, appendRecord } from '../../../../../task-tracker/lib/evidence-v2/journal.mjs';
function args(f, record = f.cycle, ports = journalPorts(f.sandbox.context)) {
  return {
    record,
    expectedHead: record.predecessorId,
    authority: { context: f.sandbox.context, hostId: f.authorityHostId },
    ports,
  };
}
function read(f, ports = journalPorts(f.sandbox.context)) {
  return readJournal({ repositoryId: f.repositoryId, issueNumber: 1000001, ports });
}
function physical(f, record) {
  return f.sandbox.provider.apply({
    kind: 'comment',
    issueNumber: 1000001,
    operationId: randomUUID(),
    payload: { body: encodeRecord(record) },
  });
}
test('uncertain append is read back exactly and cold restart reuses its logical operation', async () => {
  const f = recordFixture();
  try {
    const first = await appendRecord(
      args(f, f.cycle, journalPorts(f.sandbox.context, { fault: 'after-effect' }))
    );
    assert.equal(first.record.recordId, f.cycle.recordId);
    assert.equal(f.sandbox.provider.comments(1000001).length, 1);
    const script = `import {appendRecord} from ${JSON.stringify(new URL('../../../../../task-tracker/lib/evidence-v2/journal.mjs', import.meta.url).href)};import {journalPorts} from ${JSON.stringify(new URL('../../../../helpers/evidence-v2/journal-ports.mjs', import.meta.url).href)};const input=${JSON.stringify({ ...args(f), ports: null })};input.ports=journalPorts(input.authority.context);console.log(JSON.stringify(await appendRecord(input)));`;
    const result = f.sandbox.probe(script);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(f.sandbox.provider.comments(1000001).length, 1);
    await appendRecord(args(f, f.candidate));
    await appendRecord(args(f, f.verification));
    const journal = await read(f);
    assert.equal(journal.records.length, 3);
    assert.equal(journal.headId, f.verification.recordId);
  } finally {
    f.sandbox.dispose();
  }
});
test('pagination retains identical physical duplicates and refuses operation conflicts forks and wrong references', async () => {
  const f = recordFixture();
  try {
    physical(f, f.cycle);
    physical(f, f.cycle);
    physical(f, f.candidate);
    physical(f, f.verification);
    const journal = await read(f);
    assert.equal(journal.records.length, 3);
    assert.equal(journal.physical[f.cycle.recordId].length, 2);
    const conflict = f.make(
      'cycle-opened',
      { ...f.cycle.payload, reason: 'changed' },
      { operationId: f.cycle.operationId }
    );
    physical(f, conflict);
    await assert.rejects(() => read(f), /operation-conflict/);
  } finally {
    f.sandbox.dispose();
  }
  const g = recordFixture();
  try {
    physical(g, g.cycle);
    physical(g, g.candidate);
    physical(g, g.make('candidate', g.candidate.payload, { predecessorId: g.cycle.recordId }));
    await assert.rejects(() => read(g), /journal-fork/);
  } finally {
    g.sandbox.dispose();
  }
  const h = recordFixture();
  try {
    physical(h, h.cycle);
    physical(
      h,
      h.make('verification', h.verification.payload, { predecessorId: h.cycle.recordId })
    );
    await assert.rejects(() => read(h), /reference/);
  } finally {
    h.sandbox.dispose();
  }
});
test('durable local observations detect manual edit deletion and foreign-host writes before effects', async () => {
  const f = recordFixture();
  try {
    await appendRecord(args(f));
    const foreign = {
      ...args(f, f.candidate),
      authority: { context: f.sandbox.context, hostId: randomUUID() },
    };
    await assert.rejects(() => appendRecord(foreign), /authority-host-mismatch/);
    assert.equal((await read(f)).records.length, 1);
    const file = path.join(f.sandbox.root, 'provider.json');
    const state = JSON.parse(readFileSync(file, 'utf8'));
    state.comments = [];
    writeFileSync(file, JSON.stringify(state));
    await assert.rejects(() => appendRecord(args(f, f.candidate)), /journal-drift/);
  } finally {
    f.sandbox.dispose();
  }
});
test('lost response before any visible effect stays uncertain instead of blindly repeating create', async () => {
  const f = recordFixture();
  try {
    await assert.rejects(
      () =>
        appendRecord(args(f, f.cycle, journalPorts(f.sandbox.context, { fault: 'before-effect' }))),
      /append-uncertain/
    );
    await assert.rejects(() => appendRecord(args(f)), /append-uncertain/);
    assert.equal(f.sandbox.provider.comments(1000001).length, 0);
  } finally {
    f.sandbox.dispose();
  }
});
test('independent processes sharing authority serialize conflicting appends', async () => {
  const f = recordFixture();
  try {
    await appendRecord(args(f));
    const other = f.make('candidate', f.candidate.payload, { predecessorId: f.cycle.recordId });
    const launch = (record) =>
      new Promise((resolve) => {
        const input = { ...args(f, record), ports: null };
        const code = `import {appendRecord} from ${JSON.stringify(new URL('../../../../../task-tracker/lib/evidence-v2/journal.mjs', import.meta.url).href)};import {journalPorts} from ${JSON.stringify(new URL('../../../../helpers/evidence-v2/journal-ports.mjs', import.meta.url).href)};const input=${JSON.stringify(input)};input.ports=journalPorts(input.authority.context);try{await appendRecord(input);console.log('appended')}catch(e){console.error(e.message);process.exitCode=1}`;
        const p = spawn(process.execPath, ['--input-type=module', '-e', code], {
          env: f.sandbox.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        p.stdout.on('data', (s) => (output += s));
        p.stderr.on('data', (s) => (output += s));
        p.on('close', (status) => resolve({ status, output }));
      });
    const results = await Promise.all([launch(f.candidate), launch(other)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [0, 1], JSON.stringify(results));
    assert.match(results.find((r) => r.status === 1).output, /expected-head/);
    assert.equal((await read(f)).records.length, 2);
  } finally {
    f.sandbox.dispose();
  }
});

test('unrelated mutable comments do not become immutable evidence history', async () => {
  const f = recordFixture();
  try {
    f.sandbox.provider.apply({
      kind: 'comment',
      issueNumber: 1000001,
      operationId: randomUUID(),
      payload: { body: 'Timing report' },
    });
    await appendRecord(args(f));
    const file = path.join(f.sandbox.root, 'provider.json');
    const state = JSON.parse(readFileSync(file, 'utf8'));
    state.comments[0].body = 'Updated timing report';
    writeFileSync(file, JSON.stringify(state));
    assert.equal((await appendRecord(args(f, f.candidate))).record.recordId, f.candidate.recordId);
  } finally {
    f.sandbox.dispose();
  }
});

test('a process death after response resumes the saved operation and recovers only a dead local lock', async () => {
  const f = recordFixture();
  try {
    const input = { ...args(f), ports: null };
    const code = `import {appendRecord} from ${JSON.stringify(new URL('../../../../../task-tracker/lib/evidence-v2/journal.mjs', import.meta.url).href)};import {journalPorts} from ${JSON.stringify(new URL('../../../../helpers/evidence-v2/journal-ports.mjs', import.meta.url).href)};const input=${JSON.stringify(input)};input.ports=journalPorts(input.authority.context,{checkpoint:async point=>{if(point==='after-response')process.exit(86)}});await appendRecord(input);`;
    const status = await new Promise((resolve) => {
      const p = spawn(process.execPath, ['--input-type=module', '-e', code], {
        env: f.sandbox.env,
        stdio: 'ignore',
      });
      p.on('close', resolve);
    });
    assert.equal(status, 86);
    assert.equal(f.sandbox.provider.comments(1000001).length, 1);
    assert.equal((await appendRecord(args(f))).record.recordId, f.cycle.recordId);
    assert.equal(f.sandbox.provider.comments(1000001).length, 1);
  } finally {
    f.sandbox.dispose();
  }
});

test('authority storage refuses symlink redirection before writing journal files', async () => {
  const f = recordFixture();
  try {
    symlinkSync(
      f.sandbox.root,
      path.join(f.sandbox.context.authorityRoot, '.ai-task-manager', 'evidence-v2')
    );
    await assert.rejects(() => appendRecord(args(f)), /authority-path/);
    assert.equal(f.sandbox.provider.comments(1000001).length, 0);
  } finally {
    f.sandbox.dispose();
  }
});

test('an unresolved operation blocks a different operation ID for the same issue', async () => {
  const f = recordFixture();
  try {
    await assert.rejects(
      () =>
        appendRecord(args(f, f.cycle, journalPorts(f.sandbox.context, { fault: 'before-effect' }))),
      /append-uncertain/
    );
    const rotated = f.make('cycle-opened', f.cycle.payload);
    await assert.rejects(
      () => appendRecord(args(f, rotated)),
      /pending-operation-recovery-required/
    );
    assert.equal(f.sandbox.provider.comments(1000001).length, 0);
  } finally {
    f.sandbox.dispose();
  }
});
