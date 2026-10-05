// @story #1857
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { PROJECT_ROOT_ALIASES } from '../../../../task-tracker/lib/runtime-storage.mjs';

test('package repair selects its explicit target as the validated child working directory', (t) => {
  const root = createRuntimeRootFixture('repair-target-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, '.ai-task-manager', 'task-tracker.json');
  mkdirSync(path.dirname(config), { recursive: true });
  writeFileSync(
    config,
    JSON.stringify({
      repo: 'fixture/fixture',
      projectId: 'PVT_fixture',
      kanbanFieldId: 'FIELD_fixture',
      kanbanOptionBacklog: '',
    })
  );
  const env = {
    ...process.env,
    TT_SKIP_NETWORK: '1',
    TT_REPAIR_FAKE_OPTIONS: JSON.stringify([{ id: 'backlog_fixture', name: 'Backlog' }]),
  };
  for (const alias of PROJECT_ROOT_ALIASES) delete env[alias];
  const result = spawnSync(
    process.execPath,
    [path.resolve('bin/cli.mjs'), 'repair', '--target', root],
    { encoding: 'utf8', env }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(config, 'utf8')).kanbanOptionBacklog, 'backlog_fixture');
});
