// @story #2049
// Physical process/path boundary probes belong to the integration lane.
import assert from 'node:assert/strict';
import { test } from '../../../../helpers/story-timing-candidate-fixture.mjs';
test('missing optional cache does not require a Git remote or registry inspection', async (t) => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  fs.mkdirSync(path.join(t.unitRoot, '.git'));
  const args = {
    projectRoot: t.unitRoot,
    repository: 'owner/repo',
    issue: 2057,
    projectId: 'P_test',
  };
  const moduleUrl = new URL(
    '../../../../../task-tracker/lib/story-cache/views.mjs',
    import.meta.url
  ).href;
  const run = () =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'import {readLocalStoryView} from ' +
          JSON.stringify(moduleUrl) +
          ';console.log(JSON.stringify(readLocalStoryView(' +
          JSON.stringify(args) +
          ')))',
      ],
      { encoding: 'utf8' }
    );
  const missing = run();
  assert.equal(missing.status, 0, missing.stderr);
  assert.equal(missing.stdout.trim(), 'null');
  assert.equal(fs.existsSync(path.join(t.unitRoot, '.tmp', 'gh')), false);
  fs.mkdirSync(path.join(t.unitRoot, '.tmp', 'gh'), { recursive: true });
  assert.notEqual(run().status, 0);
});
for (const kind of [
  'tmp-file',
  'tmp-dangling',
  'tmp-symlink',
  'cache-dangling',
  'cache-file',
  'unreadable',
])
  test('optional cache discovery refuses unavailable path: ' + kind, async (t) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { spawnSync } = await import('node:child_process');
    const tmp = path.join(t.unitRoot, '.tmp');
    const cache = path.join(tmp, 'gh');
    if (kind === 'tmp-file') fs.writeFileSync(tmp, 'not a directory');
    else if (kind === 'tmp-dangling') fs.symlinkSync(path.join(t.unitRoot, 'absent'), tmp);
    else if (kind === 'tmp-symlink') {
      const target = path.join(t.unitRoot, 'other');
      fs.mkdirSync(target);
      fs.symlinkSync(target, tmp);
    } else {
      fs.mkdirSync(tmp);
      if (kind === 'cache-dangling') fs.symlinkSync(path.join(t.unitRoot, 'absent'), cache);
      else if (kind === 'cache-file') fs.writeFileSync(cache, 'not a directory');
    }
    const moduleUrl = new URL(
      '../../../../../task-tracker/lib/story-cache/views.mjs',
      import.meta.url
    ).href;
    const args = {
      projectRoot: t.unitRoot,
      repository: 'owner/repo',
      issue: 2057,
      projectId: 'P_test',
    };
    const fault =
      kind === 'unreadable'
        ? 'import fs from "node:fs";const original=fs.lstatSync;fs.lstatSync=(p,...args)=>{if(p===' +
          JSON.stringify(cache) +
          '){const e=new Error("denied");e.code="EACCES";throw e;}return original(p,...args)};'
        : '';
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        fault +
          'import {readLocalStoryView} from ' +
          JSON.stringify(moduleUrl) +
          ';console.log(JSON.stringify(readLocalStoryView(' +
          JSON.stringify(args) +
          ')))',
      ],
      { encoding: 'utf8' }
    );
    assert.notEqual(result.status, 0, result.stdout);
  });
