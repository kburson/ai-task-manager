// @story #905 #927 #2145
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncEpic, epicNeedsSync } from '../../../task-tracker/sync-epic.mjs';
const graph = (n) =>
  n === 905 ? { parent: null, children: [910] } : { parent: 905, children: [] };
function fixture({ ancestor = false, conflict = false } = {}) {
  const calls = [];
  let head = 'a'.repeat(40);
  const retained = new Map();
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') return args[2]?.startsWith('origin/trunk') ? 'b'.repeat(40) : head;
    if (args[0] === 'for-each-ref') return retained.get(args[2]) || '';
    if (args[0] === 'update-ref') {
      retained.set(args[1], args[2]);
      return '';
    }
    if (args[0] === 'merge-base' && !ancestor) throw Error('not ancestor');
    if (args[0] === 'merge') {
      if (conflict) throw Error('merge conflict');
      head = 'c'.repeat(40);
    }
    return '';
  };
  return {
    calls,
    deps: {
      graph,
      git,
      runTests: () => true,
      assertIntegrationCheckout: () => {},
      withIntegrationLock: (fn) => fn(),
    },
  };
}
test('sync retains heads, merges and ordinarily pushes the exact verified SHA', () => {
  const f = fixture();
  const result = syncEpic({ epic: 905, deps: f.deps });
  assert.deepEqual(result, {
    branch: 'feature/epic/905',
    mergedOnto: 'origin/trunk',
    pushed: true,
  });
  assert.ok(f.calls.some((args) => args[0] === 'update-ref'));
  assert.ok(f.calls.some((args) => args[0] === 'merge' && args[1] === '--no-ff'));
  assert.deepEqual(f.calls.at(-1), [
    'push',
    'origin',
    `${'c'.repeat(40)}:refs/heads/feature/epic/905`,
  ]);
  assert.ok(!f.calls.some((args) => args[0] === 'rebase' || args.includes('--force-with-lease')));
});
test('no-push retains locally and conflicts never publish', () => {
  const local = fixture();
  assert.equal(
    syncEpic({ epic: 905, deps: { ...local.deps, noPushToOrigin: true } }).pushed,
    false
  );
  assert.ok(!local.calls.some((args) => args[0] === 'push'));
  const conflict = fixture({ conflict: true });
  assert.throws(() => syncEpic({ epic: 905, deps: conflict.deps }), /merge conflict/);
  assert.ok(!conflict.calls.some((args) => args[0] === 'push'));
});
test('verification and physical authority are required before mutation', () => {
  const f = fixture();
  assert.throws(
    () => syncEpic({ epic: 905, deps: { ...f.deps, runTests: undefined } }),
    /verification runner/
  );
  assert.throws(
    () => syncEpic({ epic: 905, deps: { ...f.deps, withIntegrationLock: undefined } }),
    /physical integration/
  );
  assert.deepEqual(f.calls, []);
});
test('ancestor check uses the same resolved root or nested target', () => {
  for (const ancestor of [true, false]) {
    const f = fixture({ ancestor });
    assert.equal(epicNeedsSync({ epic: 905, deps: f.deps }), !ancestor);
    assert.deepEqual(f.calls[0], [
      'merge-base',
      '--is-ancestor',
      'origin/trunk',
      'feature/epic/905',
    ]);
  }
  const f = fixture();
  epicNeedsSync({
    epic: 905,
    deps: {
      ...f.deps,
      graph: () => ({ parent: 900, children: [910], parentAuthoritativeBranch: 'custom-parent' }),
    },
  });
  assert.equal(f.calls[0][2], 'custom-parent');
});
test('non-epics, missing issue and missing git refuse', () => {
  const f = fixture();
  assert.throws(() => syncEpic({ epic: 910, deps: f.deps }), /not an epic/);
  assert.throws(() => syncEpic({ deps: f.deps }), /epic/);
  assert.throws(() => syncEpic({ epic: 905, deps: { graph } }), /git/);
});
