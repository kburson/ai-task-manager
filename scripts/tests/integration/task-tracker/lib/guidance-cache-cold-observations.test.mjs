// @story #2086
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

const cacheUrl = new URL('../../../../../guidance/cache.mjs', import.meta.url).href;
const sourceUrl = new URL('../../../../../guidance/source.mjs', import.meta.url).href;

// Observe real Git processes and change an actual catalog after its validation
// read. No source/identity/validation function is replaced with a test double.
function run({
  selected = 'omitted',
  changes = 0,
  candidate = false,
  warm = false,
  indexChange = false,
} = {}) {
  const root = mkdtempProjectIsolated('aitm-2086-cold-observations-');
  try {
    const override = path.join(root, '.ai-task-manager/aitm-guidance.yml');
    if (changes || indexChange) {
      mkdirSync(path.dirname(override), { recursive: true });
      writeFileSync(override, 'schema: invalid\n');
      execFileSync('git', ['add', '-f', '.ai-task-manager/aitm-guidance.yml'], { cwd: root });
    }
    const candidatePath = path.join(root, 'candidate.yml');
    if (candidate) writeFileSync(candidatePath, 'schema: invalid\n');
    const script = `
      import cp from 'node:child_process';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { loadGuidance } from ${JSON.stringify(cacheUrl)};
      import { observeGuidanceSource } from ${JSON.stringify(sourceUrl)};
      const calls = [];
      const realExec = cp.execFileSync;
      cp.execFileSync = (command, args, ...rest) => {
        if (command === 'git') calls.push(args);
        return realExec(command, args, ...rest);
      };
      const realRead = fs.readFileSync;
      let changes = 0;
      let indexed = false;
      fs.readFileSync = (file, ...args) => {
        const bytes = realRead(file, ...args);
        if (${indexChange} && !indexed && String(file) === ${JSON.stringify(override)}) {
          indexed = true;
          fs.writeFileSync('race-marker.txt', 'new staged authority');
          cp.execFileSync('git', ['add', '-f', '--', 'race-marker.txt']);
        }
        if (String(file) === ${JSON.stringify(override)} && changes < ${changes}) {
          changes += 1;
          fs.writeFileSync(file, 'schema: invalid\\n# revision ' + changes + '\\n');
        }
        return bytes;
      };
      syncBuiltinESMExports();
      const options = { projectRoot: process.cwd(), need: 'diagnostics' };
      if (${JSON.stringify(selected)} === 'caller') {
        options.selected = { ...observeGuidanceSource(options), packageVersion: 'caller-stale' };
      }
      if (${JSON.stringify(selected)} === 'null') options.selected = null;
      if (${JSON.stringify(selected)} === 'undefined') options.selected = undefined;
      if (${candidate}) Object.assign(options, { profile: 'candidate', candidatePath: ${JSON.stringify(candidatePath)} });
      const cold = loadGuidance(options);
      const coldCalls = calls.splice(0);
      const warmed = ${warm} ? loadGuidance(options) : null;
      process.stdout.write(JSON.stringify({ cold, warmed, coldCalls, warmCalls: calls, changes, indexed }));
    `;
    const observed = JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root,
        encoding: 'utf8',
      })
    );
    let manifest = null;
    try {
      manifest = JSON.parse(
        readFileSync(path.join(root, '.tmp/aitm/guidance-cache/manifest.v1.json'), 'utf8')
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const staged = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: root });
    const stagedDigest = `sha256:${createHash('sha256').update(staged).digest('hex')}`;
    return { ...observed, manifest, stagedDigest };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function indexRounds(calls) {
  return calls.filter((args) => args[0] === 'ls-files' && args[1] === '--stage').length;
}

for (const selected of ['omitted', 'null', 'undefined']) {
  test(`internal ${selected} selection uses two real cold index rounds and one warm round`, () => {
    const { cold, warmed, coldCalls, warmCalls, manifest } = run({ selected, warm: true });
    assert.equal(cold.valid, true);
    assert.equal(warmed.valid, true);
    assert.equal(manifest.valid, true);
    assert.equal(indexRounds(coldCalls), 2);
    assert.equal(coldCalls.length, 6);
    assert.equal(indexRounds(warmCalls), 1);
    assert.equal(warmCalls.length, 3);
    assert.match(manifest.identity.runtime.documentationResolverDigest, /^sha256:[a-f0-9]{64}$/);
  });
}

test('caller-selected identity cannot become the authoritative cold baseline', () => {
  const { cold, manifest, coldCalls } = run({ selected: 'caller' });
  assert.equal(cold.valid, true);
  assert.equal(manifest.valid, true);
  assert.notEqual(manifest.identity.runtime.packageVersion, 'caller-stale');
  assert.equal(indexRounds(coldCalls), 3);
  assert.equal(coldCalls.length, 9);
});

test('one validation-time source change retries with a fresh baseline before publishing', () => {
  const { cold, manifest, coldCalls, changes } = run({ changes: 1 });
  assert.equal(changes, 1);
  assert.equal(cold.valid, false);
  assert.equal(cold.code, 'guidance-catalog-invalid');
  assert.ok(cold.errors.length > 0);
  assert.equal(manifest.valid, false);
  assert.equal(manifest.identity.sourceType, 'project');
  assert.equal(indexRounds(coldCalls), 4);
});

test('changes during both validation attempts refuse without publishing a manifest', () => {
  const { cold, manifest, coldCalls, changes } = run({ changes: 2 });
  assert.equal(changes, 2);
  assert.equal(cold.valid, false);
  assert.equal(cold.code, 'guidance-source-changed-during-read');
  assert.equal(manifest, null);
  assert.equal(indexRounds(coldCalls), 4);
});

test('candidate validation retains candidate identity and invalid diagnostics', () => {
  const { cold, manifest, coldCalls } = run({ candidate: true });
  assert.equal(cold.valid, false);
  assert.equal(cold.code, 'guidance-catalog-invalid');
  assert.ok(cold.errors.length > 0);
  assert.equal(manifest.identity.profile, 'candidate');
  assert.match(manifest.identity.selectedPath, /candidate\.yml$/);
  assert.equal(indexRounds(coldCalls), 2);
});

test('an index changed during validation retries against the new staged authority', () => {
  const { cold, manifest, coldCalls, indexed, stagedDigest } = run({ indexChange: true });
  assert.equal(indexed, true);
  assert.equal(cold.valid, false);
  assert.equal(cold.code, 'guidance-catalog-invalid');
  assert.equal(manifest.valid, false);
  assert.equal(manifest.identity.index.stagedEntriesDigest, stagedDigest);
  assert.equal(indexRounds(coldCalls), 4);
});
