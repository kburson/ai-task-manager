// @story #1857
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT_ALIASES } from '../../../../task-tracker/lib/runtime-storage.mjs';

const forwarding = new Map([
  ['bin/cli.mjs', 'targetDir'],
  ['scripts/task-tracker/lib/action-capture.mjs', 'cwd'],
  ['scripts/task-tracker/verbs/test.mjs', 'wtPath'],
  ['scripts/maintenance/capture-guidance-explain.mjs', 'fixtureDir'],
  ['scripts/maintenance/capture-guidance-lifecycle.mjs', 'fixtureDir'],
]);
function rootReads(source, forwardedValue) {
  const code = source.replace(new RegExp('/\\*[\\s\\S]*?\\*/|//[^\\n]*', 'g'), '');
  const pattern = new RegExp(PROJECT_ROOT_ALIASES.join('|'), 'g');
  return [...code.matchAll(pattern)].filter((match) => {
    if (!forwardedValue) return true;
    const suffix = code.slice(match.index + match[0].length);
    return !suffix.startsWith(': ' + forwardedValue);
  });
}
test('characterization detects direct, injected, destructured and computed alias reads', () => {
  for (const alias of PROJECT_ROOT_ALIASES) {
    for (const code of [
      'process.env.' + alias,
      'env.' + alias,
      'const { ' + alias + ' } = env;',
      "env['" + alias + "']",
    ])
      assert.equal(rootReads(code).length, 1, code);
  }
});
test('all production project-root aliases are consumed by the central validator', () => {
  const violations = [];
  function visit(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) {
        if (file !== path.join('scripts', 'tests')) visit(file);
      } else if (
        (file.endsWith('.mjs') || file.endsWith(path.join('action-capture-bin', 'gh'))) &&
        file !== path.join('scripts', 'task-tracker', 'lib', 'runtime-storage.mjs')
      ) {
        const source = readFileSync(file, 'utf8');
        if (rootReads(source, forwarding.get(file)).length) violations.push(file);
        // Test adapters are callable only from explicit test harnesses; no CLI
        // option, environment selector or production entrypoint may install one.
        if (source.includes('withRuntimeRootAdapters')) violations.push(file + ':test-adapter');
      }
    }
  }
  visit('scripts');
  visit('bin');
  assert.deepEqual(violations, []);
});
