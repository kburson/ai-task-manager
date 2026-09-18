// @story #1692
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';
import { collectPackageInventory } from '../../../package/install-inventory.mjs';

const root = mkdtempSync(join(projectScratchDir('test'), 'install-inventory-'));
after(() => rmSync(root, { recursive: true, force: true }));

test('package inventory is sorted and digests exact shipped bytes', () => {
  mkdirSync(join(root, 'templates', 'references'), { recursive: true });
  mkdirSync(join(root, 'config'), { recursive: true });
  writeFileSync(join(root, 'templates', 'pickup-directive.md'), 'pickup\n');
  writeFileSync(join(root, 'templates', 'references', 'z.md'), 'z\n');
  writeFileSync(join(root, 'templates', 'references', 'a.md'), 'a\n');
  writeFileSync(join(root, 'config', 'project-fields.default.json'), '{}\n');

  const inventory = collectPackageInventory(root, { templateFiles: ['pickup-directive.md'] });
  assert.deepEqual(
    inventory.references.map((item) => item.path),
    ['.ai-task-manager/templates/references/a.md', '.ai-task-manager/templates/references/z.md']
  );
  assert.match(inventory.templates[0].digest, /^[a-f0-9]{64}$/);
  assert.equal(inventory.configs[0].ownership, 'reference');
});
