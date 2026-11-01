// @story #2069
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { initial } from './plan-transition-candidate-fixture.mjs';
import { stampRefinementSnapshot } from '../../task-tracker/lib/refinement-snapshot.mjs';
import { formatIssueFieldDb } from '../../task-tracker/issue-field-db.mjs';
import { mapSubIssueNodes } from '../../gh/lib/wave-admission.mjs';
import { stageOwnedComment } from '../../task-tracker/lib/story-cache/stage-comment.mjs';
import { context } from './story-timing-candidate-fixture.mjs';

export async function configureNativeEpicFixture({
  root,
  base,
  cfg,
  identity,
  childMode = 'ready',
}) {
  cfg.fieldIds.rank = 'F_rank';
  const planPath = 'docs/epic-plan.md',
    commit = 'a'.repeat(40);
  const intent = initial
    .slice(initial.indexOf('### Story Intent'), initial.indexOf('<!-- aitm-entered'))
    .replace('### Story Intent', '## Story Intent');
  const text =
    '# Native epic plan\n\n' +
    intent +
    '\n## Implementation\n\n### Task 1: One bounded child\n\nRun: `node verify-child.mjs`\n';
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, planPath), text);
  const body = base
    .replace(
      '## Plan Metadata\n',
      `## Plan Metadata\n- **Source-plan**: ${planPath}\n- **Source-plan-commit**: ${commit}\n`
    )
    .replace(
      '## AITM Progress Markers\n',
      '## AITM Progress Markers\n<!-- aitm-issue-kind kind="epic" -->\n'
    );
  let childBody = `## User Story\nAs a fixture operator\nI want one bounded child\nSo that delivery remains scoped\n\n## Scope\nOne bounded child.\n\n## Acceptance Criteria\n- [ ] Deliver the child.\n\n## Plan Metadata\n- **Source-plan**: ${planPath}\n- **Source-plan-commit**: ${commit}\n- **Source-plan-section**: ### Task 1: One bounded child\n\n## AITM Progress Markers\n${formatIssueFieldDb({ priority: 'P1', size: 'M', estimate: 3, rank: 1 })}\n<!-- aitm-refinement-rationale: {"rationale":"Bounded current child refinement"} -->\n`;
  childBody = stampRefinementSnapshot(childBody, {
    labels: ['feature'],
    ts: '2026-10-19T00:00:00Z',
  });
  const rawChildren = [
    {
      id: 'I_child',
      number: identity.issueNumber + 1,
      title: 'One bounded child',
      body: childBody,
      state: 'OPEN',
      stateReason: null,
      labels: {
        nodes: [{ id: 'L_feature', name: 'feature' }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      blockedBy: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      projectItems: {
        nodes: [
          {
            id: 'PI_child',
            project: { id: cfg.projectId },
            fieldValues: {
              nodes: [
                { name: 'Ready for Planning', field: { id: cfg.kanbanFieldId, name: 'Status' } },
                { number: 1, field: { id: cfg.fieldIds.rank, name: 'Rank' } },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  ];
  if (childMode !== 'ready') {
    const child = rawChildren[0];
    child.state = childMode === 'open-unset' ? 'OPEN' : 'CLOSED';
    child.stateReason = childMode.startsWith('not-planned')
      ? 'NOT_PLANNED'
      : childMode === 'open-unset'
        ? null
        : 'COMPLETED';
    if (childMode.endsWith('unset'))
      child.projectItems.nodes[0].fieldValues.nodes =
        child.projectItems.nodes[0].fieldValues.nodes.filter(
          (field) => field.field.id !== cfg.kanbanFieldId
        );
    else
      child.projectItems.nodes[0].fieldValues.nodes.find(
        (field) => field.field.id === cfg.kanbanFieldId
      ).name = 'Done';
  }
  return {
    body,
    rawChildren,
    mappedChildren: () =>
      mapSubIssueNodes(rawChildren, cfg).map((child, index) => ({
        ...child,
        blockedBy: rawChildren[index].blockedBy.nodes.map((row) => row.number),
      })),
    planBytes: Buffer.from(text),
    plan: {
      path: planPath,
      commit,
      section: null,
      digest: createHash('sha256').update(text).digest('hex'),
      availability: 'available',
      content: text,
      references: null,
    },
  };
}
export async function stageEpicAssessmentChange(f) {
  const body =
    '### 🔁 Plan re-estimate\n\n**HUMAN ATTENTION**: not auto-applied\n\n| Field | Before | After |\n|---|---|---|\n| Size | M | M |\n| Estimate (h) | 3 | 5 |\n\n<!-- aitm-estimate-operation: 11111111-1111-4111-8111-111111111009 -->\n\n<!-- aitm-owned-comment key="epic.estimate-proposal" -->';
  return context(f.root, () =>
    stageOwnedComment({ store: f.store, claim: f.claim, key: 'comment:new:epic-proposal', body })
  );
}
