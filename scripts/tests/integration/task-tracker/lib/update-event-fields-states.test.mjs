// @story #186 #1988
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  estimationIssueBody,
  estimationPublicationFixture,
  estimationObservation,
} from '../../../fixtures/estimation-publication.mjs';
import { parseIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const repoRoot = new URL('../../../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/update-event-fields.mjs');

function makeTempEnv(ghScript) {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-update-event-states-'));
  const binDir = join(temp, 'bin');
  mkdirSync(binDir);

  const ghMock = join(binDir, 'gh');
  writeFileSync(ghMock, ghScript);
  chmodSync(ghMock, 0o755);

  const aitm = join(temp, '.ai-task-manager');
  mkdirSync(aitm);
  writeFileSync(
    join(aitm, 'task-tracker.json'),
    JSON.stringify({
      repo: 'owner/repo',
      projectId: 'PVT_FAKE',
      fieldStartTime: 'F_START_FAKE',
      fieldIds: { startTime: 'F_START_FAKE' },
    })
  );

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AITM_GH_TEST_DOUBLE_BIN: binDir,
  };
  return { temp, env };
}

// Mock that returns issue body with no startTime, and succeeds for all graphql / edit calls.
const SUCCESS_GH = `#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const file=path.join(process.env.AITM_GH_TEST_DOUBLE_BIN,'body.json'),args=process.argv.slice(2);
if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({body:'<!-- aitm-fields: {"schema":1,"values":{"startTime":null}} -->'}));
if(args[0]==='issue'&&args[1]==='view'){
 const value=JSON.parse(fs.readFileSync(file,'utf8'));process.stdout.write(args.includes('-q')?value.body:JSON.stringify(value));
}else if(args[0]==='issue'&&args[1]==='edit'){
 const i=args.indexOf('--body-file');if(i>=0)fs.writeFileSync(file,JSON.stringify({body:fs.readFileSync(args[i+1]==='-'?0:args[i+1],'utf8')}));
}else if(args[0]==='api'&&args[1]==='graphql')process.stdout.write(JSON.stringify({data:{}}));
`;

// 1. Each of the 6 state args should be accepted (exit 0).
const states = ['refine', 'plan', 'develop', 'test', 'review', 'done'];
for (const state of states) {
  const { env } = makeTempEnv(SUCCESS_GH);
  const result = spawnSync(process.execPath, [script, '999', state, '--item-id', 'ITEM_FAKE'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });
  assert.equal(
    result.status,
    0,
    `expected exit 0 for state="${state}" but got ${result.status}\nstderr: ${result.stderr}`
  );
  // refine writes startTime (moved from develop in #133); plan/develop/test/review/done
  // have empty default bindings — no "set for #999" output expected.
  if (state === 'refine') {
    assert.match(
      result.stdout,
      /startTime set for #999/,
      `refine should emit startTime set\nstdout: ${result.stdout}`
    );
  } else {
    assert.ok(
      !/set for #999/.test(result.stdout),
      `state="${state}" should not write any fields with empty bindings\nstdout: ${result.stdout}`
    );
  }
  console.log(`PASS: state arg "${state}" accepted (exit 0)`);
}

// 2. Unknown state should exit 1 with usage message.
{
  const { env } = makeTempEnv(SUCCESS_GH);
  const result = spawnSync(process.execPath, [script, '999', 'bogus', '--item-id', 'ITEM_FAKE'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });
  assert.equal(result.status, 1, `expected exit 1 for unknown state, got ${result.status}`);
  assert.match(
    result.stderr,
    /Usage:.*backlog\|refine\|ready-for-plan\|plan\|develop\|test\|review\|done/
  );
  console.log('PASS: unknown state arg rejected with usage');
}

// 3. Regression: develop still triggers startTime set_once (already covered by
//    start-time-sync.test.mjs, but verified above with explicit assertion).

console.log('All update-event-fields state-arg tests passed.');

for (const hours of [23, 24, 25])
  test(`real numeric event Estimate 10→${hours} publishes before enclosing effects`, async () => {
    const module = await import('../../../../gh/update-event-fields.mjs');
    assert.equal(
      typeof module.runUpdateEventFields,
      'function',
      'numeric event has a real governed adapter'
    );
    const cfg = {
      repo: 'o/r',
      projectId: 'PVT_a',
      fieldIds: { estimate: 'EST', size: 'SIZE', startTime: 'START' },
    };
    let body = estimationIssueBody({ estimate: 10, size: 'M', startTime: null }),
      board = { estimate: 10, size: 'M' },
      fields = [];
    const fixture = estimationPublicationFixture({
      cfg,
      issueNumber: 1987,
      getBody: () => body,
      setBody: (b) => (body = b),
      getProject: () => board,
      getForecast: () =>
        estimationObservation({
          estimate: null,
          size: null,
          recordId: null,
          proposals: [],
          observedProjections: [],
        }),
    });
    const result = await module.runUpdateEventFields({
      cfg,
      issueNumber: 1987,
      itemId: 'ITEM_1987',
      state: 'develop',
      bindings: [
        { field: 'startTime', value: 'now' },
        { field: 'estimate', value: hours },
      ],
      fieldDefs: [
        { key: 'estimate', name: 'Estimate', type: 'number' },
        { key: 'size', name: 'Size', type: 'single_select' },
        { key: 'startTime', name: 'StartTime', type: 'text' },
      ],
      deps: {
        ...fixture,
        now: () => new Date('2026-10-11T12:00:00Z'),
        writeProjectFieldValue: async ({ fieldId, value }) => {
          assert.equal(
            readDecompositionRecords(body).publication?.status,
            'pending',
            'intent precedes every configured event effect'
          );
          fields.push(fieldId);
          if (fieldId === 'EST') board.estimate = value.number;
        },
      },
    });
    assert.equal(result.status, 'recorded', result.reason);
    assert.equal(board.estimate, hours);
    assert.equal(parseIssueFieldDb(body).values.estimate, hours);
    assert.deepEqual(fields, ['START', 'EST']);
    assert.equal(readDecompositionRecords(body).publication.writerId, 'event-field');
    assert.equal(readDecompositionRecords(body).publication.status, 'complete');
  });

test('numeric event resumes an unknown Estimate effect across a later clock reading', async () => {
  const { runUpdateEventFields } = await import('../../../../gh/update-event-fields.mjs');
  const cfg = {
    repo: 'o/r',
    projectId: 'PVT_a',
    fieldIds: { estimate: 'EST', size: 'SIZE', startTime: 'START' },
  };
  let body = estimationIssueBody({ estimate: 10, size: 'M', startTime: null }),
    board = { estimate: 10, size: 'M' },
    failed = false,
    estimateWrites = 0,
    clock = 0;
  const fixture = estimationPublicationFixture({
    cfg,
    issueNumber: 1987,
    getBody: () => body,
    setBody: (b) => (body = b),
    getProject: () => board,
    getForecast: () =>
      estimationObservation({
        estimate: null,
        size: null,
        recordId: null,
        proposals: [],
        observedProjections: [],
      }),
  });
  const deps = {
    ...fixture,
    now: () => new Date(clock++ ? '2026-10-11T12:01:00Z' : '2026-10-11T12:00:00Z'),
    writeProjectFieldValue: async ({ fieldId, value }) => {
      if (fieldId === 'EST') {
        board.estimate = value.number;
        estimateWrites++;
        if (!failed) {
          failed = true;
          throw new Error('unknown Estimate outcome');
        }
      }
    },
  };
  const args = {
    cfg,
    issueNumber: 1987,
    itemId: 'ITEM_1987',
    state: 'develop',
    bindings: [
      { field: 'startTime', value: 'now' },
      { field: 'estimate', value: 25 },
    ],
    fieldDefs: [
      { key: 'estimate', name: 'Estimate', type: 'number' },
      { key: 'size', name: 'Size', type: 'single_select' },
      { key: 'startTime', name: 'StartTime', type: 'text' },
    ],
    deps,
  };
  assert.equal((await runUpdateEventFields(args)).status, 'partial');
  assert.equal(readDecompositionRecords(body).publication.status, 'pending');
  const retry = await runUpdateEventFields(args);
  assert.equal(retry.status, 'recorded', retry.reason);
  assert.equal(estimateWrites, 1);
  assert.equal(readDecompositionRecords(body).publication.status, 'complete');
});

for (const mode of ['invalid-estimate', 'inherited-owner', 'timestamp-only'])
  test(`event ${mode} cannot erase or invent publication authority`, async () => {
    const { runUpdateEventFields } = await import('../../../../gh/update-event-fields.mjs');
    const cfg = {
      repo: 'o/r',
      projectId: 'PVT_a',
      fieldIds: { estimate: 'EST', size: 'SIZE', startTime: 'START' },
    };
    let body = estimationIssueBody({ estimate: 10, size: 'M', startTime: null }),
      board = { estimate: 10, size: 'M' },
      writes = 0,
      fail = true;
    const fixture = estimationPublicationFixture({
      cfg,
      issueNumber: 1987,
      getBody: () => body,
      setBody: (b) => (body = b),
      getProject: () => board,
      getForecast: () =>
        estimationObservation({
          estimate: null,
          size: null,
          recordId: null,
          proposals: [],
          observedProjections: [],
        }),
    });
    const deps = {
      ...fixture,
      now: () => new Date('2026-10-11T12:00:00Z'),
      writeProjectFieldValue: async ({ fieldId, value }) => {
        writes++;
        if (fieldId === 'EST') {
          board.estimate = value.number;
          if (fail) throw new Error('unknown outcome');
        }
      },
    };
    const args = {
      cfg,
      issueNumber: 1987,
      itemId: 'ITEM_1987',
      state: 'develop',
      fieldDefs: [
        { key: 'estimate', name: 'Estimate', type: 'number' },
        { key: 'size', name: 'Size', type: 'single_select' },
        { key: 'startTime', name: 'StartTime', type: 'text' },
      ],
      deps,
    };
    if (mode === 'timestamp-only') {
      assert.equal(
        (await runUpdateEventFields({ ...args, bindings: [{ field: 'estimate', value: 25 }] }))
          .status,
        'partial'
      );
      const before = readDecompositionRecords(body).publication;
      fail = false;
      const result = await runUpdateEventFields({
        ...args,
        bindings: [{ field: 'startTime', value: 'now' }],
      });
      assert.equal(result.status, 'updated');
      assert.deepEqual(readDecompositionRecords(body).publication, before);
      assert.equal(board.estimate, 25);
      assert.equal(parseIssueFieldDb(body).values.estimate, 10);
    } else {
      const prior = process.env.AITM_ISSUE_LOCK_HELD;
      if (mode === 'inherited-owner') process.env.AITM_ISSUE_LOCK_HELD = '1';
      try {
        const result = await runUpdateEventFields({
          ...args,
          bindings: [
            { field: 'startTime', value: 'now' },
            { field: 'estimate', value: mode === 'invalid-estimate' ? 'now' : 25 },
          ],
        });
        assert.equal(result.status, 'refused');
        assert.equal(writes, 0);
        assert.equal(readDecompositionRecords(body).publication, null);
      } finally {
        if (prior === undefined) delete process.env.AITM_ISSUE_LOCK_HELD;
        else process.env.AITM_ISSUE_LOCK_HELD = prior;
      }
    }
  });
