// @story #1674
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
const sourceUrl = new URL('../../../../../guidance/source.mjs', import.meta.url).href;
const identityUrl = new URL('../../../../../guidance/cache-identity.mjs', import.meta.url).href;

function inspectInProcess(root) {
  const script = `
    import { observeGuidanceSource } from ${JSON.stringify(sourceUrl)};
    import { observeCacheIdentity } from ${JSON.stringify(identityUrl)};
    const selected = observeGuidanceSource({ projectRoot: process.cwd() });
    process.stdout.write(JSON.stringify(observeCacheIdentity({
      selected, projectRoot: process.cwd(), profile: 'active-project'
    })));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root,
      encoding: 'utf8',
    })
  );
}

test('fresh processes reject an old identity after a tracked override enters the index', () => {
  const root = mkdtempProjectIsolated('aitm-1674-process-');
  try {
    execFileSync('git', ['init', '-q', root]);
    mkdirSync(path.join(root, '.ai-task-manager'));
    const override = path.join(root, '.ai-task-manager', 'aitm-guidance.yml');
    writeFileSync(override, 'invalid: true\n');
    const untracked = inspectInProcess(root);
    execFileSync('git', ['add', '-f', '.ai-task-manager/aitm-guidance.yml'], { cwd: root });
    const tracked = inspectInProcess(root);
    assert.notDeepEqual(tracked.identity, untracked.identity);
    assert.equal(untracked.identity.tracked, false);
    assert.equal(tracked.identity.tracked, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
