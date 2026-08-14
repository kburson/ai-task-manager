// @story #632
// Coverage-lift unit test for `lib/blocked-by-field.mjs`: the pure
// `formatBlockedByValue`, the exported `writeBlockedByField` (driven through its
// `deps.writeFieldValue` seam), and the module-private `defaultWriteFieldValue`
// (driven through the #632 `deps.exec` default-through seam). Zero subprocess.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatBlockedByValue,
  writeBlockedByField,
} from '../../../../task-tracker/lib/blocked-by-field.mjs';

const cfg = {
  projectId: 'P_1',
  repo: 'kburson/ai-task-manager',
  fieldBlockedBy: 'F_blocked',
};

test('formatBlockedByValue: non-array yields empty string', () => {
  assert.equal(formatBlockedByValue(null), '');
  assert.equal(formatBlockedByValue(undefined), '');
  assert.equal(formatBlockedByValue('nope'), '');
});

test('formatBlockedByValue: empty array yields empty string', () => {
  assert.equal(formatBlockedByValue([]), '');
});

test('formatBlockedByValue: single ref', () => {
  assert.equal(formatBlockedByValue([5]), '#5');
});

test('formatBlockedByValue: sorts ascending and dedupes', () => {
  assert.equal(formatBlockedByValue([11, 3, 7, 3]), '#3, #7, #11');
});

test('formatBlockedByValue: drops non-positive, non-integer, and junk entries', () => {
  assert.equal(formatBlockedByValue([0, -3, 2.5, 4, '9', 6]), '#4, #6');
});

test('formatBlockedByValue: all-junk input yields empty string', () => {
  assert.equal(formatBlockedByValue([0, -1, 'x', null]), '');
});

test('writeBlockedByField: missing cfg yields skipped no-field-id', async () => {
  const res = await writeBlockedByField({ issueNumber: 632, refs: [1] });
  assert.deepEqual(res, { skipped: 'no-field-id' });
});

test('writeBlockedByField: cfg without fieldBlockedBy yields skipped no-field-id', async () => {
  const res = await writeBlockedByField({
    issueNumber: 632,
    refs: [1],
    cfg: { projectId: 'P_1', repo: 'x/y' },
  });
  assert.deepEqual(res, { skipped: 'no-field-id' });
});

test('writeBlockedByField: non-positive-integer issueNumber throws', async () => {
  await assert.rejects(
    () => writeBlockedByField({ issueNumber: 0, refs: [1], cfg }),
    /must be a positive integer/
  );
  await assert.rejects(
    () => writeBlockedByField({ issueNumber: 1.5, refs: [1], cfg }),
    /must be a positive integer/
  );
});

test('writeBlockedByField: writer returning false yields skipped no-item', async () => {
  const res = await writeBlockedByField({
    issueNumber: 632,
    refs: [3, 1],
    cfg,
    deps: { writeFieldValue: async () => false },
  });
  assert.deepEqual(res, { skipped: 'no-item' });
});

test('writeBlockedByField: writer returning true yields ok with formatted value', async () => {
  const seen = [];
  const res = await writeBlockedByField({
    issueNumber: 632,
    refs: [3, 1],
    cfg,
    deps: {
      writeFieldValue: async (a) => {
        seen.push(a);
        return true;
      },
    },
  });
  assert.deepEqual(res, { ok: true, value: '#1, #3' });
  assert.equal(seen[0].value, '#1, #3');
  assert.equal(seen[0].issueNumber, 632);
});

test('defaultWriteFieldValue (via deps.exec): missing field config returns skipped no-item', async () => {
  // projectId present in the passed cfg but fieldBlockedBy stripped at the
  // writeBlockedByField guard — so drive the default writer with a cfg that
  // has fieldBlockedBy (to pass the outer guard) but the inner default-writer
  // sees a repo missing → false. Use a cfg lacking repo.
  let calls = 0;
  const res = await writeBlockedByField({
    issueNumber: 632,
    refs: [1],
    cfg: { projectId: 'P_1', fieldBlockedBy: 'F_blocked' }, // no repo
    deps: {
      exec: async () => {
        calls += 1;
        return { stdout: '{}' };
      },
    },
  });
  assert.deepEqual(res, { skipped: 'no-item' });
  assert.equal(calls, 0, 'exec never called when repo is absent');
});

test('defaultWriteFieldValue (via deps.exec): resolves item id and fires the mutation', async () => {
  const calls = [];
  const viewJson = JSON.stringify({
    data: {
      repository: {
        issue: {
          projectItems: {
            nodes: [
              { id: 'ITEM_other', project: { id: 'P_other' } },
              { id: 'ITEM_match', project: { id: 'P_1' } },
            ],
          },
        },
      },
    },
  });
  const res = await writeBlockedByField({
    issueNumber: 632,
    refs: [7, 3],
    cfg,
    deps: {
      exec: async (bin, args) => {
        // args[3] holds the `query=...` graphql string; distinguish view vs mutation.
        const q = args[3] || '';
        calls.push(q.includes('updateProjectV2ItemFieldValue') ? 'mutation' : 'view');
        if (q.includes('updateProjectV2ItemFieldValue')) return { stdout: '{}' };
        return { stdout: viewJson };
      },
    },
  });
  assert.deepEqual(res, { ok: true, value: '#3, #7' });
  assert.deepEqual(calls, ['view', 'mutation']);
});

test('defaultWriteFieldValue (via deps.exec): no matching project node yields no-item', async () => {
  const calls = [];
  const viewJson = JSON.stringify({
    data: {
      repository: {
        issue: { projectItems: { nodes: [{ id: 'ITEM_x', project: { id: 'P_other' } }] } },
      },
    },
  });
  const res = await writeBlockedByField({
    issueNumber: 632,
    refs: [4],
    cfg,
    deps: {
      exec: async (bin, args) => {
        const q = args[3] || '';
        calls.push(q.includes('updateProjectV2ItemFieldValue') ? 'mutation' : 'view');
        return { stdout: viewJson };
      },
    },
  });
  assert.deepEqual(res, { skipped: 'no-item' });
  assert.deepEqual(calls, ['view'], 'mutation never fired when no node matches');
});

test('defaultWriteFieldValue (via deps.exec): malformed view JSON yields no-item', async () => {
  const res = await writeBlockedByField({
    issueNumber: 632,
    refs: [4],
    cfg,
    deps: {
      exec: async () => ({ stdout: 'not-json{' }),
    },
  });
  assert.deepEqual(res, { skipped: 'no-item' });
});
