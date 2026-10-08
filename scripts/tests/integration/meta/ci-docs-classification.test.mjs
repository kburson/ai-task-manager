// @story #1855
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const workflow = load(readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
const classify = workflow.jobs['fast-tests'].steps.find((step) => step.id === 'scope').run;
const docs = Array.from({ length: 40000 }, (_, index) => `docs/long-path-${index}.md`);
for (const [name, changed, expected] of [
  ['empty change list', [], false],
  ['only documentation', ['README.md', 'docs/guide.txt', '.gitignore'], true],
  ['ordinary mixed change', ['README.md', 'scripts/real-code.mjs'], false],
  ['large mixed change with code first', ['scripts/real-code.mjs', ...docs], false],
  ['large mixed change with code last', [...docs, 'scripts/real-code.mjs'], false],
  ['large documentation change', docs, true],
]) {
  test(`CI docs classifier handles ${name}`, () => {
    const dir = mkdtempSync(path.join(projectScratchDir('test', root), 'ci-docs-classifier-'));
    try {
      const changedFile = path.join(dir, 'changed.txt');
      const output = path.join(dir, 'output.txt');
      writeFileSync(changedFile, changed.join('\n'));
      const result = spawnSync(
        'bash',
        [
          '-c',
          `
        git() {
          if [ "$#" -ne 3 ] || [ "$1" != diff ] || [ "$2" != --name-only ] || [ "$3" != trunk...HEAD ]; then
            return 91
          fi
          cat "$CI_TEST_CHANGED"
        }
        ${classify}
      `,
        ],
        {
          cwd: root,
          env: { ...process.env, CI_TEST_CHANGED: changedFile, GITHUB_OUTPUT: output },
          encoding: 'utf8',
          timeout: 30000,
          maxBuffer: 4 * 1024 * 1024,
        }
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(output, 'utf8'), `docs_only=${expected}\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
