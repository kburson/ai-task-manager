import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  INCOMPATIBLE_PROJECT_WORKFLOW_NAMES,
  inspectProjectWorkflows,
} from '../../../../../task-tracker/lib/config-init/project-workflow-compatibility.mjs';

test('reports enabled incompatible workflows case-insensitively while preserving names', () => {
  const result = inspectProjectWorkflows({
    complete: true,
    workflows: [
      { name: 'Item added to project', number: 6, enabled: true },
      { name: ' Auto-close issue ', number: 3, enabled: true },
      { name: 'PULL REQUEST MERGED', number: 2, enabled: false },
      { name: 'Pull request linked to issue', number: 5, enabled: true },
    ],
  });

  assert.deepEqual(
    result.incompatible.map((workflow) => workflow.number),
    [3, 5]
  );
  assert.equal(result.incompatible[0].name, ' Auto-close issue ');
  assert.deepEqual([...INCOMPATIBLE_PROJECT_WORKFLOW_NAMES], [
    'auto-close issue',
    'pull request linked to issue',
    'pull request merged',
  ]);
});

test('returns a deterministic inventory and collapses exact duplicate workflow pages', () => {
  const result = inspectProjectWorkflows({
    complete: true,
    workflows: [
      { name: 'Item reopened', number: 9, enabled: true },
      { name: 'Auto-close issue', number: 3, enabled: false },
      { name: 'Auto-close issue', number: 3, enabled: false },
      { name: 'Item added', number: 1, enabled: true },
    ],
  });

  assert.deepEqual(result.workflows, [
    { name: 'Item added', number: 1, enabled: true },
    { name: 'Auto-close issue', number: 3, enabled: false },
    { name: 'Item reopened', number: 9, enabled: true },
  ]);
  assert.deepEqual(result.incompatible, []);
});

test('refuses an inventory that is absent or not proven complete', () => {
  assert.throws(() => inspectProjectWorkflows(), /project-workflow-compatibility:.*object/i);
  assert.throws(
    () => inspectProjectWorkflows({ workflows: [], complete: false }),
    /project-workflow-compatibility:.*complete/i
  );
  assert.throws(
    () => inspectProjectWorkflows({ complete: true }),
    /project-workflow-compatibility:.*workflows.*array/i
  );
});

test('refuses malformed workflow entries', () => {
  const invalidEntries = [
    null,
    { name: '', number: 1, enabled: true },
    { name: 'Auto-close issue', number: 0, enabled: true },
    { name: 'Auto-close issue', number: 1.5, enabled: true },
    { name: 'Auto-close issue', number: 1, enabled: 'true' },
  ];

  for (const workflow of invalidEntries) {
    assert.throws(
      () => inspectProjectWorkflows({ complete: true, workflows: [workflow] }),
      /project-workflow-compatibility:/
    );
  }
});

test('refuses conflicting entries for one workflow number', () => {
  assert.throws(
    () =>
      inspectProjectWorkflows({
        complete: true,
        workflows: [
          { name: 'Auto-close issue', number: 3, enabled: false },
          { name: 'Auto-close issue', number: 3, enabled: true },
        ],
      }),
    /project-workflow-compatibility:.*conflicting.*3/i
  );
});
