import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  deriveDependencyProjection,
  reconcileDependencyDisposition,
} from '../../../../task-tracker/lib/dependency-disposition.mjs';
import { TERMINAL_DISPOSITIONS } from '../../../../task-tracker/lib/terminal-disposition.mjs';

const cfg = {
  repo: 'o/r',
  projectId: 'P',
  fieldDisposition: 'F_DISPOSITION',
};

function reconciliationHarness({ current = '', option = 'O_BLOCKED' } = {}) {
  let disposition = current;
  const writes = [];
  let clears = 0;
  const deps = {
    readDisposition: async () => disposition,
    projectItemForIssue: async () => ({ itemId: 'ITEM' }),
    fieldOptionMap: async () => ({
      F_DISPOSITION: option ? { BLOCKED: option } : {},
    }),
    writeProjectFieldValue: async (input) => {
      writes.push(input.value.singleSelectOptionName);
      disposition = input.value.singleSelectOptionName;
      return true;
    },
    clearProjectFieldValue: async () => {
      clears += 1;
      disposition = '';
      return true;
    },
  };
  return {
    deps,
    writes,
    get clears() {
      return clears;
    },
  };
}

test('derives blocked, ready, and fail-closed unknown projections', () => {
  assert.deepEqual(
    deriveDependencyProjection({
      blockedBy: [4, 9],
      states: new Map([
        [4, 'done'],
        [9, 'test'],
      ]),
    }),
    { status: 'blocked', unfinished: [{ ref: 9, state: 'test' }] }
  );
  assert.deepEqual(deriveDependencyProjection({ blockedBy: [4], states: new Map([[4, 'done']]) }), {
    status: 'ready',
    unfinished: [],
  });
  assert.deepEqual(deriveDependencyProjection({ blockedBy: [], states: new Map() }), {
    status: 'ready',
    unfinished: [],
  });
  assert.deepEqual(
    deriveDependencyProjection({ blockedBy: [4, 9], states: new Map([[4, 'done']]) }),
    { status: 'unknown', unfinished: [{ ref: 9, state: null }] }
  );
});

test('projects BLOCKED for unfinished or unknown dependencies', async () => {
  for (const observation of [
    { blockedBy: [9], states: new Map([[9, 'develop']]) },
    { blockedBy: [9], states: new Map() },
  ]) {
    const harness = reconciliationHarness();
    const result = await reconcileDependencyDisposition({
      issueNumber: 12,
      cfg,
      observation,
      deps: harness.deps,
    });
    assert.deepEqual(harness.writes, ['BLOCKED']);
    assert.equal(result.status, 'projected');
  }
});

test('clears BLOCKED after every dependency is Done and is idempotent when already clear', async () => {
  const blocked = reconciliationHarness({ current: 'BLOCKED' });
  const cleared = await reconcileDependencyDisposition({
    issueNumber: 12,
    cfg,
    observation: { blockedBy: [9], states: new Map([[9, 'done']]) },
    deps: blocked.deps,
  });
  assert.equal(blocked.clears, 1);
  assert.equal(cleared.status, 'cleared');

  const ready = reconciliationHarness();
  const unchanged = await reconcileDependencyDisposition({
    issueNumber: 12,
    cfg,
    observation: { blockedBy: [], states: new Map() },
    deps: ready.deps,
  });
  assert.equal(ready.clears, 0);
  assert.equal(unchanged.status, 'idempotent');
});

test('preserves every terminal disposition without dependency or field mutation', async () => {
  for (const current of TERMINAL_DISPOSITIONS) {
    const harness = reconciliationHarness({ current });
    harness.deps.readNativeDependencies = async () =>
      assert.fail('terminal value must short-circuit');
    const result = await reconcileDependencyDisposition({
      issueNumber: 12,
      cfg,
      deps: harness.deps,
    });
    assert.equal(result.status, 'terminal-preserved');
    assert.equal(result.disposition, current);
    assert.deepEqual(harness.writes, []);
    assert.equal(harness.clears, 0);
  }
});

test('loads native dependencies and AITM Status when no observation is supplied', async () => {
  const harness = reconciliationHarness();
  const seen = [];
  harness.deps.readNativeDependencies = async () => ({ blockedBy: [4, 9], blocking: [] });
  harness.deps.fetchAssignmentSnapshot = async ({ issueNumber }) => {
    seen.push(issueNumber);
    return { state: issueNumber === 4 ? 'done' : 'test', assignees: [] };
  };
  const result = await reconcileDependencyDisposition({ issueNumber: 12, cfg, deps: harness.deps });
  assert.deepEqual(seen, [4, 9]);
  assert.equal(result.status, 'projected');
  assert.deepEqual(result.projection, {
    status: 'blocked',
    unfinished: [{ ref: 9, state: 'test' }],
  });
});

test('refuses unexpected non-terminal values before mutation', async () => {
  const harness = reconciliationHarness({ current: 'Paused' });
  await assert.rejects(
    reconcileDependencyDisposition({
      issueNumber: 12,
      cfg,
      observation: { blockedBy: [], states: new Map() },
      deps: harness.deps,
    }),
    /dependency-disposition:unexpected-current/
  );
  assert.deepEqual(harness.writes, []);
  assert.equal(harness.clears, 0);
});

test('reports stable categories for missing field, item, option, and mutation failures', async () => {
  const observation = { blockedBy: [9], states: new Map([[9, 'develop']]) };
  await assert.rejects(
    reconcileDependencyDisposition({
      issueNumber: 12,
      cfg: { ...cfg, fieldDisposition: '', fieldIds: {} },
      observation,
      deps: reconciliationHarness().deps,
    }),
    /dependency-disposition:field/
  );

  for (const [category, mutate] of [
    ['item', (deps) => (deps.projectItemForIssue = async () => ({ itemId: '' }))],
    ['option', (deps) => (deps.fieldOptionMap = async () => ({ F_DISPOSITION: {} }))],
    ['write', (deps) => (deps.writeProjectFieldValue = async () => false)],
  ]) {
    const harness = reconciliationHarness();
    mutate(harness.deps);
    await assert.rejects(
      reconcileDependencyDisposition({ issueNumber: 12, cfg, observation, deps: harness.deps }),
      new RegExp(`dependency-disposition:${category}`)
    );
  }

  const clearHarness = reconciliationHarness({ current: 'BLOCKED' });
  clearHarness.deps.clearProjectFieldValue = async () => false;
  await assert.rejects(
    reconcileDependencyDisposition({
      issueNumber: 12,
      cfg,
      observation: { blockedBy: [], states: new Map() },
      deps: clearHarness.deps,
    }),
    /dependency-disposition:clear/
  );
});

test('requires exact readback after write and clear', async () => {
  const writeHarness = reconciliationHarness();
  writeHarness.deps.writeProjectFieldValue = async () => true;
  await assert.rejects(
    reconcileDependencyDisposition({
      issueNumber: 12,
      cfg,
      observation: { blockedBy: [9], states: new Map([[9, 'test']]) },
      deps: writeHarness.deps,
    }),
    /dependency-disposition:readback/
  );

  const clearHarness = reconciliationHarness({ current: 'BLOCKED' });
  clearHarness.deps.clearProjectFieldValue = async () => true;
  await assert.rejects(
    reconcileDependencyDisposition({
      issueNumber: 12,
      cfg,
      observation: { blockedBy: [], states: new Map() },
      deps: clearHarness.deps,
    }),
    /dependency-disposition:readback/
  );
});
