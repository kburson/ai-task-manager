// @story #545 — GitHub issue templates mirror the kind prefixes (AC3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import yaml from 'js-yaml';

import { KIND_PREFIXES } from '../../../gh/lib/kind-prefix.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '../../../../.github/ISSUE_TEMPLATE');

function load(name) {
  return yaml.load(readFileSync(resolve(templateDir, name), 'utf8'));
}

const CASES = [
  { file: 'bug.yml', label: 'bug' },
  { file: 'beta-defect.yml', label: 'beta-defect' },
  { file: 'beta-feature.yml', label: 'beta-feature' },
  { file: 'user-request.yml', label: 'idea' },
];

for (const { file, label } of CASES) {
  test(`${file} title default matches the ${label} kind prefix (AC3)`, () => {
    const tpl = load(file);
    assert.equal(tpl.title, KIND_PREFIXES[label]);
  });

  test(`${file} carries the ${label} label so the prefix is durable (AC3)`, () => {
    const tpl = load(file);
    assert.ok(Array.isArray(tpl.labels), `${file} must declare a labels array`);
    assert.ok(
      tpl.labels.map((l) => String(l).toLowerCase()).includes(label),
      `${file} labels must include "${label}"`
    );
  });
}
