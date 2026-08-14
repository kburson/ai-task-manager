// @story #645
// Offline coverage-lift for scripts/gh/lib/github-projects.mjs. Drives the gh()
// CLI wrapper (execFile no-input path + spawn stdin path, success/failure/error
// branches), gql() (parse + API-error surfacing), and every project helper
// (splitRepo, projectItemForIssue, addIssueToProject, fieldOptionMap,
// projectValuesForIssue, writeProjectFieldValue, clearProjectFieldValue) through the injectable
// child_process `deps` seam — no gh, no network, no live board.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  deps,
  gh,
  gql,
  splitRepo,
  projectItemForIssue,
  addIssueToProject,
  fieldOptionMap,
  projectValuesForIssue,
  writeProjectFieldValue,
  clearProjectFieldValue,
} from '../../../../../gh/lib/github-projects.mjs';

const realExecFile = deps.execFile;
const realSpawn = deps.spawn;

afterEach(() => {
  deps.execFile = realExecFile;
  deps.spawn = realSpawn;
});

// A fake execFile matching the node callback signature promisify expects:
// (file, args, options, cb) → cb(err, stdout, stderr).
// promisify(execFile) in production resolves to { stdout, stderr } (execFile
// carries a custom promisify symbol). A plain fake has no such symbol, so
// default promisify resolves the raw second callback arg — pass the object.
function fakeExecFile(result) {
  return (file, args, options, cb) => {
    if (result.error) cb(result.error);
    else cb(null, { stdout: result.stdout ?? '', stderr: '' });
  };
}

// A fake spawn returning a child emitter that replays canned stdout/stderr and
// a close code (or an 'error' event) on the next tick.
function fakeSpawn({ stdout = '', stderr = '', code = 0, error = null } = {}) {
  const calls = [];
  const spawnFn = (file, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end: (input) => calls.push({ file, args, options, input }) };
    queueMicrotask(() => {
      if (error) {
        child.emit('error', error);
        return;
      }
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      if (stderr) child.stderr.emit('data', Buffer.from(stderr));
      child.emit('close', code);
    });
    return child;
  };
  spawnFn.calls = calls;
  return spawnFn;
}

// ── gh(): execFile no-input path ──────────────────────────────────────────────
test('gh: no input uses execFile and returns stdout', async () => {
  deps.execFile = fakeExecFile({ stdout: 'hello\n' });
  const out = await gh(['api', 'x']);
  assert.equal(out, 'hello\n');
});

// ── gh(): spawn stdin path ────────────────────────────────────────────────────
test('gh: with input spawns, feeds stdin, resolves stdout on close 0', async () => {
  const sp = fakeSpawn({ stdout: '{"ok":true}', code: 0 });
  deps.spawn = sp;
  const out = await gh(['api', 'graphql', '--input', '-'], { input: 'payload' });
  assert.equal(out, '{"ok":true}');
  assert.equal(sp.calls[0].input, 'payload');
});

test('gh: with input rejects with stderr on nonzero close', async () => {
  deps.spawn = fakeSpawn({ stderr: 'boom', code: 3 });
  await assert.rejects(
    () => gh(['api'], { input: 'x' }),
    (err) => {
      assert.equal(err.code, 3);
      assert.match(err.stderr, /boom/);
      assert.match(err.message, /gh exited 3/);
      return true;
    }
  );
});

test('gh: with input rejects on child error event', async () => {
  deps.spawn = fakeSpawn({ error: new Error('spawn failed') });
  await assert.rejects(() => gh(['api'], { input: 'x' }), /spawn failed/);
});

// ── gql() ─────────────────────────────────────────────────────────────────────
test('gql: parses data payload', async () => {
  deps.spawn = fakeSpawn({ stdout: JSON.stringify({ data: { hello: 'world' } }) });
  const data = await gql('query{}', { a: 1 });
  assert.deepEqual(data, { hello: 'world' });
});

test('gql: throws joined message when API returns errors', async () => {
  deps.spawn = fakeSpawn({
    stdout: JSON.stringify({ errors: [{ message: 'bad1' }, { message: 'bad2' }] }),
  });
  await assert.rejects(() => gql('query{}'), /bad1; bad2/);
});

// ── splitRepo ─────────────────────────────────────────────────────────────────
test('splitRepo: valid owner/repo', () => {
  assert.deepEqual(splitRepo('owner/name'), { owner: 'owner', repoName: 'name' });
});

test('splitRepo: invalid throws', () => {
  assert.throws(() => splitRepo('nope'), /invalid repo/);
});

// ── projectItemForIssue ───────────────────────────────────────────────────────
test('projectItemForIssue: returns matching item id', async () => {
  deps.spawn = fakeSpawn({
    stdout: JSON.stringify({
      data: {
        repository: {
          issue: { id: 'ISS1', projectItems: { nodes: [{ id: 'IT1', project: { id: 'P1' } }] } },
        },
      },
    }),
  });
  const r = await projectItemForIssue({ repo: 'o/r', projectId: 'P1', issueNumber: 5 });
  assert.deepEqual(r, { issueId: 'ISS1', itemId: 'IT1' });
});

test('projectItemForIssue: no matching project → empty itemId', async () => {
  deps.spawn = fakeSpawn({
    stdout: JSON.stringify({
      data: {
        repository: {
          issue: { id: 'ISS2', projectItems: { nodes: [{ id: 'IT9', project: { id: 'OTHER' } }] } },
        },
      },
    }),
  });
  const r = await projectItemForIssue({ repo: 'o/r', projectId: 'P1', issueNumber: 6 });
  assert.deepEqual(r, { issueId: 'ISS2', itemId: '' });
});

// ── addIssueToProject ─────────────────────────────────────────────────────────
test('addIssueToProject: returns new item id', async () => {
  deps.spawn = fakeSpawn({
    stdout: JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'NEW1' } } } }),
  });
  const id = await addIssueToProject('P1', 'ISS1');
  assert.equal(id, 'NEW1');
});

// ── fieldOptionMap ────────────────────────────────────────────────────────────
test('fieldOptionMap: builds map, skips nodes lacking id or options', async () => {
  deps.spawn = fakeSpawn({
    stdout: JSON.stringify({
      data: {
        node: {
          fields: {
            nodes: [
              {
                id: 'F1',
                options: [
                  { id: 'o1', name: 'Todo' },
                  { id: 'o2', name: 'Done' },
                ],
              },
              {},
              { id: 'F2' },
            ],
          },
        },
      },
    }),
  });
  const map = await fieldOptionMap('P1');
  assert.deepEqual(map, { F1: { Todo: 'o1', Done: 'o2' } });
});

// ── projectValuesForIssue ─────────────────────────────────────────────────────
test('projectValuesForIssue: returns {} when cfg missing repo/projectId', async () => {
  assert.deepEqual(await projectValuesForIssue({ cfg: {}, fieldDefs: [], issueNumber: 1 }), {});
});

test('projectValuesForIssue: maps number/date/text/name field values', async () => {
  const cfg = {
    repo: 'o/r',
    projectId: 'P1',
    fieldStatus: 'FS',
    fieldEstimate: 'FE',
    fieldStart: 'FD',
    fieldNote: 'FT',
  };
  deps.spawn = fakeSpawn({
    stdout: JSON.stringify({
      data: {
        repository: {
          issue: {
            projectItems: {
              nodes: [
                {
                  project: { id: 'P1' },
                  fieldValues: {
                    nodes: [
                      { number: 4, field: { id: 'FE' } },
                      { date: '2026-07-03', field: { id: 'FD' } },
                      { text: 'hi', field: { id: 'FT' } },
                      { name: 'Develop', field: { id: 'FS' } },
                      { number: null, field: { id: 'FE' } },
                      { field: { id: 'UNMAPPED' } },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    }),
  });
  const fieldDefs = [
    { key: 'estimate' },
    { key: 'start' },
    { key: 'note' },
    { key: 'status' },
    { key: 'missingFieldId' },
  ];
  const vals = await projectValuesForIssue({ cfg, fieldDefs, issueNumber: 7 });
  assert.equal(vals.estimate, 4);
  assert.equal(vals.start, '2026-07-03');
  assert.equal(vals.note, 'hi');
  assert.equal(vals.status, 'Develop');
});

test('projectValuesForIssue: returns {} when no item matches project', async () => {
  const cfg = { repo: 'o/r', projectId: 'P1', fieldEstimate: 'FE' };
  deps.spawn = fakeSpawn({
    stdout: JSON.stringify({
      data: { repository: { issue: { projectItems: { nodes: [{ project: { id: 'OTHER' } }] } } } },
    }),
  });
  assert.deepEqual(
    await projectValuesForIssue({ cfg, fieldDefs: [{ key: 'estimate' }], issueNumber: 8 }),
    {}
  );
});

// ── writeProjectFieldValue ────────────────────────────────────────────────────
function okSpawn() {
  return fakeSpawn({
    stdout: JSON.stringify({
      data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'X' } } },
    }),
  });
}

test('writeProjectFieldValue: number value', async () => {
  deps.spawn = okSpawn();
  assert.equal(
    await writeProjectFieldValue({
      projectId: 'P',
      itemId: 'I',
      fieldId: 'F',
      value: { number: 3 },
    }),
    true
  );
});

test('writeProjectFieldValue: date value', async () => {
  deps.spawn = okSpawn();
  assert.equal(
    await writeProjectFieldValue({
      projectId: 'P',
      itemId: 'I',
      fieldId: 'F',
      value: { date: '2026-07-03' },
    }),
    true
  );
});

test('writeProjectFieldValue: text value', async () => {
  deps.spawn = okSpawn();
  assert.equal(
    await writeProjectFieldValue({
      projectId: 'P',
      itemId: 'I',
      fieldId: 'F',
      value: { text: 'hello' },
    }),
    true
  );
});

test('writeProjectFieldValue: single-select resolves option id', async () => {
  deps.spawn = okSpawn();
  const r = await writeProjectFieldValue({
    projectId: 'P',
    itemId: 'I',
    fieldId: 'F',
    value: { singleSelectOptionName: 'Done' },
    optionMap: { F: { Done: 'opt1' } },
  });
  assert.equal(r, true);
});

test('writeProjectFieldValue: single-select missing option → false, no write', async () => {
  deps.spawn = fakeSpawn({ error: new Error('should not spawn') });
  const r = await writeProjectFieldValue({
    projectId: 'P',
    itemId: 'I',
    fieldId: 'F',
    value: { singleSelectOptionName: 'Nope' },
    optionMap: { F: { Done: 'opt1' } },
  });
  assert.equal(r, false);
});

test('clearProjectFieldValue: uses the canonical ProjectV2 clear mutation', async () => {
  const sp = fakeSpawn({
    stdout: JSON.stringify({
      data: { clearProjectV2ItemFieldValue: { projectV2Item: { id: 'I' } } },
    }),
  });
  deps.spawn = sp;
  assert.equal(await clearProjectFieldValue({ projectId: 'P', itemId: 'I', fieldId: 'F' }), true);
  const payload = JSON.parse(sp.calls[0].input);
  assert.match(payload.query, /clearProjectV2ItemFieldValue/);
  assert.deepEqual(payload.variables, { project: 'P', item: 'I', field: 'F' });
});
