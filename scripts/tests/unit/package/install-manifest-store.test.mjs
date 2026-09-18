// @story #1692
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { writeInstallManifest } from '../../../package/install-manifest-store.mjs';

test('manifest store writes temporary content then renames atomically', () => {
  const calls = [];
  writeInstallManifest(
    '/repo',
    { schema: 'aitm.install-manifest/v1' },
    {
      mkdirSync: (...args) => calls.push(['mkdir', ...args]),
      writeFileSync: (...args) => calls.push(['write', ...args]),
      renameSync: (...args) => calls.push(['rename', ...args]),
      rmSync: (...args) => calls.push(['rm', ...args]),
      pid: 42,
    }
  );
  assert.deepEqual(
    calls.map(([name]) => name),
    ['mkdir', 'write', 'rename']
  );
  assert.match(calls[1][1], /install-manifest\.json\.42\.tmp$/);
  assert.match(calls[2][2], /install-manifest\.json$/);
  assert.equal(calls[1][2], `${JSON.stringify({ schema: 'aitm.install-manifest/v1' }, null, 2)}\n`);
});

test('manifest store removes only its temporary path after a failed write', () => {
  const calls = [];
  assert.throws(
    () =>
      writeInstallManifest(
        '/repo',
        {},
        {
          mkdirSync: () => {},
          writeFileSync: (path) => {
            calls.push(['write', path]);
            throw new Error('disk');
          },
          renameSync: () => calls.push(['rename']),
          rmSync: (...args) => calls.push(['rm', ...args]),
          pid: 9,
        }
      ),
    /disk/
  );
  assert.deepEqual(
    calls.map(([name]) => name),
    ['write', 'rm']
  );
  assert.match(calls[1][1], /install-manifest\.json\.9\.tmp$/);
  assert.deepEqual(calls[1][2], { force: true });
});
