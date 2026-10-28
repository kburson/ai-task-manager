// @story #2087
// cspell:ignore noprofile norc
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
const workflow = load(readFileSync(path.join(repository, '.github/workflows/ci.yml'), 'utf8'));
const classifier = workflow.jobs['fast-tests'].steps.find((step) => step.id === 'scope').run;

// Execute the actual workflow shell. Only Git's filename output is controlled;
// this fixture has no real Git repository, task state or authority mutation.
function classify(files, { gitExit = 0 } = {}) {
  const root = mkdtempSync(path.join(projectScratchDir('test', repository), 'aitm-2087-scope-'));
  try {
    const changed = path.join(root, 'changed.txt');
    const output = path.join(root, 'github-output.txt');
    writeFileSync(changed, files);
    const script = `git() {
      if [ "$#" -ne 3 ] || [ "$1" != diff ] || [ "$2" != --name-only ] || [ "$3" != trunk...HEAD ]; then
        return 97
      fi
      if [ "$AITM_TEST_GIT_EXIT" -ne 0 ]; then return "$AITM_TEST_GIT_EXIT"; fi
      cat "$AITM_TEST_CHANGED_FILES"
    }
    ${classifier}`;
    const child = spawnSync('bash', ['--noprofile', '--norc', '-c', script], {
      cwd: root,
      env: {
        ...process.env,
        AITM_TEST_CHANGED_FILES: changed,
        AITM_TEST_GIT_EXIT: String(gitExit),
        GITHUB_OUTPUT: output,
      },
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    assert.ifError(child.error);
    return {
      status: child.status,
      stderr: child.stderr,
      output: existsSync(output) ? readFileSync(output, 'utf8') : '',
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const [name, files, expected] of [
  ['empty diff', '', 'false'],
  ['markdown files', 'README.md\nnotes/release.md\n', 'true'],
  ['all files below docs', 'docs/example.mjs\ndocs/assets/logo.svg\n', 'true'],
  ['root gitignore', '.gitignore\n', 'true'],
  ['ordinary mixed diff', 'docs/guide.md\nguidance/cache.mjs\n', 'false'],
  ['similar directory name', 'documentation/example.mjs\n', 'false'],
  ['markdown-like extension', 'README.mdx\n', 'false'],
  ['nested gitignore', 'nested/.gitignore\n', 'false'],
]) {
  test(`workflow classifier preserves policy for ${name}`, () => {
    const result = classify(files);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.output, `docs_only=${expected}\n`);
    assert.equal(result.stderr, '');
  });
}

const largeDocs = Array.from(
  { length: 24000 },
  (_, index) => `docs/${String(index).padStart(5, '0')}-${'n'.repeat(80)}.md`
).join('\n');
assert.ok(Buffer.byteLength(largeDocs) > 2 * 1024 * 1024);

for (const [name, files, expected] of [
  ['code first', `guidance/cache.mjs\n${largeDocs}\n`, 'false'],
  ['code last', `${largeDocs}\nguidance/cache.mjs\n`, 'false'],
  ['only documentation', `${largeDocs}\n`, 'true'],
]) {
  test(`workflow classifier handles input above pipe capacity with ${name}`, () => {
    const result = classify(files);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.output, `docs_only=${expected}\n`);
    assert.equal(result.stderr, '');
  });
}

test('a failed Git diff cannot emit a successful docs-only decision', () => {
  const result = classify('docs/guide.md\n', { gitExit: 11 });
  assert.equal(result.status, 11);
  assert.equal(result.output, '');
});
