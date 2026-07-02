#!/usr/bin/env node
// @story #625
// Coverage tests for scripts/task-tracker/lib/stamp-start-time.mjs.
//
// One exported async function, stampStartTime({cfg,issueNumber,now,deps}), with
// every I/O seam injectable via `deps` (resolveItem / writeProjectFieldValue)
// and the clock via `now`. The tests drive each return path directly without a
// real `gh`/GraphQL call:
//   - missing cfg / missing issueNumber → throws
//   - no Start-time field configured → {status:'skipped', no-field-configured}
//   - resolveItem rejects → {status:'error', resolve failed}
//   - resolveItem yields no item → {status:'skipped', no-project-item}
//   - existing non-empty Start-time value → {status:'idempotent'}
//   - blank existing value falls through to a fresh stamp
//   - writeField resolves → {status:'stamped'} with a formatted value
//   - writeField rejects → {status:'error', write failed}
// The stamped value is asserted against a fixed `now` so formatStartTime's
// zero-padding + timezone-offset branch is exercised deterministically.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { stampStartTime, defaultResolveItem } from '../../lib/stamp-start-time.mjs';

const FIELD_ID = 'PVTF_startTime';
const cfgWithField = { repo: 'o/r', projectId: 'PVT_proj', fieldStartTime: FIELD_ID };

function itemWith(fieldValueNodes = []) {
  return { id: 'PVTI_item', fieldValues: { nodes: fieldValueNodes } };
}

test('stampStartTime: missing cfg throws', async () => {
  await assert.rejects(() => stampStartTime({ issueNumber: 1 }), /cfg is required/);
});

test('stampStartTime: missing issueNumber throws', async () => {
  await assert.rejects(() => stampStartTime({ cfg: cfgWithField }), /issueNumber is required/);
});

test('stampStartTime: no Start-time field configured → skipped', async () => {
  const res = await stampStartTime({ cfg: { repo: 'o/r', projectId: 'p' }, issueNumber: 7 });
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'no-field-configured');
});

test('stampStartTime: resolveItem rejects → error', async () => {
  const res = await stampStartTime({
    cfg: cfgWithField,
    issueNumber: 7,
    deps: {
      resolveItem: async () => {
        throw new Error('graphql boom');
      },
    },
  });
  assert.equal(res.status, 'error');
  assert.match(res.message, /resolve failed: graphql boom/);
});

test('stampStartTime: no project item → skipped', async () => {
  const res = await stampStartTime({
    cfg: cfgWithField,
    issueNumber: 7,
    deps: { resolveItem: async () => null },
  });
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'no-project-item');
});

test('stampStartTime: existing non-empty value → idempotent', async () => {
  const res = await stampStartTime({
    cfg: cfgWithField,
    issueNumber: 7,
    deps: {
      resolveItem: async () =>
        itemWith([{ field: { id: FIELD_ID }, text: '2026-01-02 03:04 +0000' }]),
      writeProjectFieldValue: async () => {
        throw new Error('must not write when idempotent');
      },
    },
  });
  assert.equal(res.status, 'idempotent');
  assert.equal(res.value, '2026-01-02 03:04 +0000');
});

test('stampStartTime: blank existing value falls through to a fresh stamp', async () => {
  let written = null;
  const res = await stampStartTime({
    cfg: cfgWithField,
    issueNumber: 7,
    now: () => new Date('2026-03-04T05:06:00Z'),
    deps: {
      resolveItem: async () => itemWith([{ field: { id: FIELD_ID }, text: '   ' }]),
      writeProjectFieldValue: async (args) => {
        written = args;
      },
    },
  });
  assert.equal(res.status, 'stamped');
  assert.equal(written.fieldId, FIELD_ID);
  assert.equal(written.itemId, 'PVTI_item');
  assert.equal(written.value.text, res.value);
});

test('stampStartTime: writeField resolves → stamped with formatted value', async () => {
  let written = null;
  // Fixed instant in UTC; assert against the runner's local-tz formatting so
  // formatStartTime's offset branch is exercised on any machine.
  const instant = new Date('2026-07-08T09:05:00Z');
  const res = await stampStartTime({
    cfg: cfgWithField,
    issueNumber: 7,
    now: () => instant,
    deps: {
      resolveItem: async () => itemWith([]),
      writeProjectFieldValue: async (args) => {
        written = args;
      },
    },
  });
  assert.equal(res.status, 'stamped');
  assert.match(res.value, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} [+-]\d{4}$/);
  assert.equal(written.projectId, 'PVT_proj');
  assert.equal(written.value.text, res.value);
});

test('stampStartTime: writeField rejects → error', async () => {
  const res = await stampStartTime({
    cfg: cfgWithField,
    issueNumber: 7,
    now: () => new Date('2026-07-08T09:05:00Z'),
    deps: {
      resolveItem: async () => itemWith([]),
      writeProjectFieldValue: async () => {
        throw new Error('write boom');
      },
    },
  });
  assert.equal(res.status, 'error');
  assert.match(res.message, /write failed: write boom/);
});

test('defaultResolveItem: returns the node matching cfg.projectId', async () => {
  const item = await defaultResolveItem({
    cfg: { repo: 'o/r', projectId: 'PVT_target' },
    issueNumber: 42,
    deps: {
      splitRepo: (r) => {
        assert.equal(r, 'o/r');
        return { owner: 'o', repoName: 'r' };
      },
      gql: async (_q, vars) => {
        assert.equal(vars.issue, 42);
        return {
          repository: {
            issue: {
              projectItems: {
                nodes: [
                  { id: 'OTHER', project: { id: 'PVT_other' } },
                  { id: 'WANT', project: { id: 'PVT_target' } },
                ],
              },
            },
          },
        };
      },
    },
  });
  assert.equal(item.id, 'WANT');
});

test('defaultResolveItem: no matching project → null', async () => {
  const item = await defaultResolveItem({
    cfg: { repo: 'o/r', projectId: 'PVT_target' },
    issueNumber: 42,
    deps: {
      splitRepo: () => ({ owner: 'o', repoName: 'r' }),
      gql: async () => ({
        repository: { issue: { projectItems: { nodes: [{ id: 'X', project: { id: 'no' } }] } } },
      }),
    },
  });
  assert.equal(item, null);
});

test('defaultResolveItem: empty / missing nodes → null', async () => {
  const item = await defaultResolveItem({
    cfg: { repo: 'o/r', projectId: 'PVT_target' },
    issueNumber: 42,
    deps: {
      splitRepo: () => ({ owner: 'o', repoName: 'r' }),
      gql: async () => ({}),
    },
  });
  assert.equal(item, null);
});

console.log('coverage-stamp-start-time.test.mjs: defined');
