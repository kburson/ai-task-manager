// @story #1383
// Local Superpowers SDD state is operator runtime. Repository-wide Markdown
// quality checks must ignore it while continuing to govern tracked docs.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MARKDOWNLINT = path.join(
  REPO_ROOT,
  'node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs'
);
const PRETTIER = path.join(REPO_ROOT, 'node_modules/prettier/bin/prettier.cjs');

function run(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    output: `${result.stdout || ''}\n${result.stderr || ''}`,
  };
}

test('Markdown quality tools ignore local Superpowers runtime but still govern docs', () => {
  const fixture = mkdtempProjectIsolated('markdownlint-runtime-ignore-');
  try {
    // The shared isolated-project helper ignores every fixture file so stateful
    // tests stay clean. Prettier also honors .gitignore, which would let this
    // test pass without exercising the repository's own ignore boundary.
    writeFileSync(path.join(fixture, '.gitignore'), '');

    for (const config of ['.markdownlint-cli2.jsonc', '.prettierrc.json', '.prettierignore']) {
      copyFileSync(path.join(REPO_ROOT, config), path.join(fixture, config));
    }

    mkdirSync(path.join(fixture, '.superpowers/sdd'), { recursive: true });
    mkdirSync(path.join(fixture, 'docs'), { recursive: true });
    const invalidMarkdown = '# Heading\n\nparagraph    \n';
    writeFileSync(path.join(fixture, '.superpowers/sdd/runtime.md'), invalidMarkdown);
    writeFileSync(path.join(fixture, 'docs/governed.md'), invalidMarkdown);

    const markdownlint = run(MARKDOWNLINT, ['**/*.md'], fixture);
    assert.equal(markdownlint.status, 1, markdownlint.output);
    assert.match(markdownlint.output, /docs\/governed\.md/);
    assert.doesNotMatch(markdownlint.output, /\.superpowers\/sdd\/runtime\.md/);

    const prettier = run(PRETTIER, ['--check', '.'], fixture);
    assert.equal(prettier.status, 1, prettier.output);
    assert.match(prettier.output, /docs\/governed\.md/);
    assert.doesNotMatch(prettier.output, /\.superpowers\/sdd\/runtime\.md/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
