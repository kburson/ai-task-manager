// @story #1557
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { VERB_REFERENCE } from '../../../../task-tracker/verbs/help-data.mjs';

const requiredDocs = [
  'docs/DESIGN.md',
  'docs/guides/workflow.md',
  'docs/guides/guard-architecture.md',
  'docs/guides/parallel-agents.md',
  '.ai-task-manager/templates/references/pickup-directive-rationale.md',
  'skill/shared/rules/block.md',
];

test('operator documents identify native dependency authority without reviving legacy carriers', () => {
  assert.match(VERB_REFERENCE.block.summary, /GitHub native dependencies/i);
  assert.match(VERB_REFERENCE['migrate-dependencies'].usage, /--dry-run\|--apply/);
  const sources = Object.fromEntries(
    requiredDocs.map((file) => [file, readFileSync(file, 'utf8')])
  );
  for (const [file, source] of Object.entries(sources)) {
    assert.match(source, /GitHub native (?:issue )?dependencies/i, file);
  }
  assert.doesNotMatch(
    sources['docs/guides/workflow.md'],
    /body marker is (?:the )?(?:canonical|authoritative)/i
  );
  assert.doesNotMatch(
    sources['docs/guides/parallel-agents.md'],
    /BLOCKED label.*Blocked By.*aitm-blocked-by/is
  );
  assert.match(sources['docs/guides/workflow.md'], /migrate-dependencies --dry-run/);
  assert.match(sources['docs/guides/workflow.md'], /migrate-dependencies --apply/);
  assert.match(sources['docs/guides/workflow.md'], /feature branch/i);
  assert.match(sources['docs/guides/workflow.md'], /no webhook|without a webhook/i);
});
