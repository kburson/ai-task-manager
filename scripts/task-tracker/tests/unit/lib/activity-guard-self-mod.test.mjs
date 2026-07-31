// @story #659
// AC2 — the Edit/Write/NotebookEdit guard refuses writes whose resolved path is
// inside an INSTALLED guard tree (a `node_modules/` segment leading to the
// ai-task-manager `scripts/` dir), unconditionally and ahead of the chore-mode
// bypass and every kanban-state allow-check. The dev-repo checkout (no
// `node_modules/` ancestor) stays editable.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runActivityGuard } from '../../../activity-guard.mjs';
import { isInstalledGuardPath } from '../../../lib/installed-guard-path.mjs';

test('installed guard paths are refused', () => {
  assert.equal(
    isInstalledGuardPath('node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs'),
    true
  );
  assert.equal(
    isInstalledGuardPath('node_modules/ai-task-manager/scripts/gh/create-issue.mjs'),
    true
  );
  // Absolute form (a consumer project elsewhere on disk).
  assert.equal(
    isInstalledGuardPath(
      '/home/u/proj/node_modules/ai-task-manager/scripts/task-tracker/activity-guard.mjs'
    ),
    true
  );
  // Scoped-package install.
  assert.equal(isInstalledGuardPath('node_modules/@acme/ai-task-manager/scripts/x.mjs'), true);
  // Defensive breadth: any package exposing a scripts/task-tracker/ guard tree.
  assert.equal(
    isInstalledGuardPath('node_modules/renamed-pkg/scripts/task-tracker/source-edit-gate.mjs'),
    true
  );
});

test('dev-repo checkout and ordinary paths stay editable', () => {
  // The package's own checkout: no node_modules/ ancestor → editable.
  assert.equal(isInstalledGuardPath('scripts/task-tracker/bash-guard.mjs'), false);
  assert.equal(
    isInstalledGuardPath('/Users/x/Vibe-Coding/ai-task-manager/scripts/task-tracker/x.mjs'),
    false
  );
  // Unrelated source / scratch.
  assert.equal(isInstalledGuardPath('src/foo.mjs'), false);
  assert.equal(isInstalledGuardPath('.tmp/inspect/x.mjs'), false);
  // An unrelated node_modules package (no ai-task-manager, no scripts/task-tracker).
  assert.equal(isInstalledGuardPath('node_modules/lodash/index.js'), false);
  assert.equal(isInstalledGuardPath(''), false);
  assert.equal(isInstalledGuardPath(null), false);
});

test('the predicate is pure — verdict cannot be re-enabled by any external state', () => {
  // isInstalledGuardPath takes ONLY a path; there is no state/chore-mode input
  // that could flip a true verdict to false. This is the structural guarantee
  // behind "unconditional, ahead of every allow-check".
  const p = 'node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs';
  assert.equal(isInstalledGuardPath(p), isInstalledGuardPath(p));
  assert.equal(isInstalledGuardPath.length, 1);
});

test('multi-target apply_patch interlock precedes scratch, chore, state, and authority', async () => {
  let downstreamCalls = 0;
  const forbidden = () => {
    downstreamCalls += 1;
    throw new Error('installed-guard interlock must fire first');
  };
  const result = await runActivityGuard(
    {
      tool_name: 'apply_patch',
      tool_input: [
        '*** Begin Patch',
        '*** Update File: .tmp/inspect/scratch.mjs',
        '@@',
        '-old',
        '+new',
        '*** Update File: node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs',
        '@@',
        '-old',
        '+new',
        '*** End Patch',
      ].join('\n'),
    },
    {
      projectRoot: '/consumer/project',
      loadPolicy: forbidden,
      readBoundState: forbidden,
      isChoreModeActive: () => {
        downstreamCalls += 1;
        return true;
      },
      withGovernedEffect: forbidden,
    }
  );

  assert.equal(result.decision, 'block');
  assert.equal(result.code, 'activity-installed-guard-refused');
  assert.match(
    result.reason,
    /node_modules\/ai-task-manager\/scripts\/task-tracker\/bash-guard\.mjs/
  );
  assert.equal(downstreamCalls, 0);
});
