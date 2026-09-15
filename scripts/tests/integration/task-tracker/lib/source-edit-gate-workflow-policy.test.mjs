// @story #1628
import assert from 'node:assert/strict';
import test from 'node:test';

import { decideSourceEdit, runHook } from '../../../../task-tracker/source-edit-gate.mjs';

const projectDir = '/fake/project';
const ownership = { assignees: ['kburson'], currentUser: 'kburson' };
const deepDiveWaiver = { isWaived: (id) => id === 'planning.deep-dive' };

test('Develop source edit accepts only an explicit deep-dive waiver', () => {
  const base = {
    toolName: 'Edit',
    filePath: 'src/example.mjs',
    projectDir,
    boundIssue: '#1628',
    choreModeActive: false,
    issueState: 'develop',
    hasPostedMarker: false,
    hasCompleteMarker: false,
    ...ownership,
  };
  const waived = decideSourceEdit({ ...base, workflowPolicy: deepDiveWaiver });
  const wrongRequirement = decideSourceEdit({
    ...base,
    workflowPolicy: { isWaived: (id) => id === 'approval.plan' },
  });

  assert.deepEqual(waived, { decision: 'allow', reason: 'state-and-deep-dive-waiver' });
  assert.equal(wrongRequirement.decision, 'block');
  assert.equal(wrongRequirement.code, 'source-edit-marker-gate');
});

test('runHook revalidates policy for every edit so revocation blocks the next boundary', async () => {
  let policyReads = 0;
  const deps = {
    projectDir,
    isChoreModeActive: () => false,
    loadBoundIssue: () => '#1628',
    cfg: { repo: 'kburson/ai-task-manager' },
    gh: async () =>
      JSON.stringify({ body: '## User Story\nA\n## Scope\nS\n## Acceptance Criteria\n- [ ] A' }),
    resolveIssueSignals: async () => ({
      state: 'develop',
      body: '## User Story\nAs a maintainer\n## Scope\nS\n## Acceptance Criteria\n- [ ] A',
      hasPostedMarker: false,
      hasCompleteMarker: false,
      ...ownership,
    }),
    loadWorkflowBoundary: async () => {
      policyReads += 1;
      return policyReads === 1
        ? deepDiveWaiver
        : { isWaived: () => false, exceptionStatus: 'revoked' };
    },
  };
  const payload = { tool_name: 'Edit', tool_input: { file_path: 'src/example.mjs' } };

  const beforeRevocation = await runHook(payload, deps);
  const afterRevocation = await runHook(payload, deps);

  assert.equal(beforeRevocation.decision, 'allow');
  assert.equal(afterRevocation.decision, 'block');
  assert.equal(afterRevocation.code, 'source-edit-marker-gate');
  assert.equal(policyReads, 2);
});
