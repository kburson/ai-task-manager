// @story #2073 — raw provider populations, with no authority verdict ports.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatIssueFieldDb } from '../../task-tracker/issue-field-db.mjs';
import { stampRefinementSnapshot } from '../../task-tracker/lib/refinement-snapshot.mjs';
export function configureHookPopulation({ population, cfg, projectDir, fixtureId }) {
  const issue = population.repository.issue;
  if (fixtureId === 'empty-unmarked-leaf')
    issue.body = issue.body.replace('<!-- aitm-issue-kind kind="code" -->', '');
  if (fixtureId === 'unknown-kind')
    issue.body = issue.body.replace('kind="code"', 'kind="unknown"');
  if (fixtureId === 'duplicate-kind') issue.body += '\n<!-- aitm-issue-kind kind="code" -->';
  if (fixtureId === 'misplaced-kind')
    issue.body =
      '<!-- aitm-issue-kind kind="code" -->\n' +
      issue.body.replace('<!-- aitm-issue-kind kind="code" -->', '');
  if (fixtureId === 'non-epic-child') issue.subIssues.nodes = [{ id: 'unexpected' }];
  if (fixtureId.includes('comments') || fixtureId.startsWith('drift-')) {
    issue.comments.nodes = Array.from(
      { length: fixtureId === 'four-page-comments' ? 301 : 101 },
      (_, index) => ({
        __typename: 'IssueComment',
        id: 'C' + index,
        databaseId: index + 1,
        body: 'Ordinary discussion ' + index,
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
        url: 'https://example.invalid/comment/' + index,
        author: { login: 'operator' },
        issue: { number: 2073, repository: { nameWithOwner: 'o/r' } },
      })
    );
  }
  const failureSchedule = [];
  if (fixtureId.startsWith('drift-')) {
    const changed = structuredClone(population.repository);
    if (fixtureId === 'drift-body') changed.issue.body += '\nchanged';
    if (fixtureId === 'drift-owner') changed.issue.assignees.nodes = [{ login: 'other' }];
    if (fixtureId === 'drift-item') changed.issue.projectItems.nodes[0].id = 'replacement';
    if (fixtureId === 'drift-field')
      changed.issue.projectItems.nodes[0].fieldValues.nodes[0].number = 99;
    if (fixtureId === 'drift-children') changed.issue.subIssues.nodes = [{ id: 'new-child' }];
    failureSchedule.push({ afterDispatch: 1, change: { repository: changed } });
  }
  if (fixtureId.endsWith('epic')) {
    cfg.fieldIds.rank = 'RANK';
    const count = fixtureId === '51-child-ready-epic' ? 51 : 2;
    const content = Array.from(
      { length: count },
      (_, i) => '### Task ' + (i + 1) + ': Child ' + (i + 1) + '\n\nRun: `node verify-child.mjs`\n'
    ).join('\n');
    mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
    writeFileSync(path.join(projectDir, 'docs/plan.md'), content);
    const metadata =
      '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
      '1'.repeat(40) +
      '\n';
    issue.body = issue.body
      .replace('kind="code"', 'kind="epic"')
      .replace('## AITM Progress Markers', metadata + '\n## AITM Progress Markers');
    issue.subIssues.nodes =
      fixtureId === 'empty-epic'
        ? []
        : Array.from({ length: count }, (_, i) => {
            const body = stampRefinementSnapshot(
              '## User Story\nAs a fixture operator\nI want a bounded step\nSo that work stays safe\n\n## Scope\nDeliver child ' +
                (i + 1) +
                '.\n\n## Acceptance Criteria\n- [ ] Deliver the step.\n\n' +
                metadata +
                '- **Source-plan-section**: ### Task ' +
                (i + 1) +
                ': Child ' +
                (i + 1) +
                '\n\n## AITM Progress Markers\n' +
                formatIssueFieldDb({ priority: 'P1', size: 'S', estimate: 2, rank: 1 }) +
                '\n<!-- aitm-refinement-rationale: {"rationale":"current fixture refinement"} -->\n',
              { labels: ['feature'], ts: '2026-10-20T00:00:00.000Z' }
            );
            return {
              id: 'CHILD_' + i,
              number: 2100 + i,
              title: 'Child ' + (i + 1),
              body,
              state: 'OPEN',
              stateReason: null,
              repository: { nameWithOwner: 'o/r' },
              labels: { nodes: [{ id: 'LABEL', name: 'feature' }] },
              blockedBy: { nodes: [] },
              projectItems: {
                nodes: [
                  {
                    id: 'CHILD_ITEM_' + i,
                    project: { id: 'P' },
                    fieldValueByName: { name: 'Ready for Planning' },
                    fieldValues: {
                      nodes: [
                        {
                          id: 'CS' + i,
                          name: fixtureId === 'unready-epic' ? 'Backlog' : 'Ready for Planning',
                          field: { id: 'STATUS', name: 'Status' },
                          __typename: 'ProjectV2ItemFieldSingleSelectValue',
                        },
                        {
                          id: 'CR' + i,
                          number: 1,
                          field: { id: 'RANK', name: 'Rank' },
                          __typename: 'ProjectV2ItemFieldNumberValue',
                        },
                      ],
                    },
                  },
                ],
              },
            };
          });
    if (fixtureId === 'blocked-epic')
      issue.subIssues.nodes[0].blockedBy.nodes = [
        { id: issue.subIssues.nodes[1].id, number: issue.subIssues.nodes[1].number },
      ];
  }
  if (fixtureId.startsWith('root-fields-') || fixtureId.startsWith('child-fields-')) {
    const child = fixtureId.startsWith('child-fields-');
    const owner = child ? issue.subIssues.nodes[0] : issue;
    const item = owner.projectItems.nodes[0];
    item.__typename = 'ProjectV2Item';
    item.content = {
      __typename: 'Issue',
      id: owner.id,
      number: owner.number,
      repository: { nameWithOwner: 'o/r' },
    };
    item.fieldValues.nodes.push(
      ...Array.from({ length: 99 }, (_, i) => ({
        __typename: 'ProjectV2ItemFieldNumberValue',
        id: 'EXTRA_' + i,
        number: i,
        field: { id: 'UNRELATED_' + i, name: 'Other ' + i },
      }))
    );
    if (!fixtureId.includes('-valid-')) {
      const changed = structuredClone(population.repository);
      const target = (child ? changed.issue.subIssues.nodes[0] : changed.issue).projectItems
        .nodes[0];
      if (fixtureId.includes('-item-')) target.id = 'FOREIGN_ITEM';
      if (fixtureId.includes('-project-')) target.project.id = 'FOREIGN_PROJECT';
      if (fixtureId.includes('-content-')) target.content.id = 'FOREIGN_ISSUE';
      failureSchedule.push({ afterDispatch: child ? 2 : 1, change: { repository: changed } });
    }
  }
  if (fixtureId.startsWith('inventory-')) {
    const changed = structuredClone(population.repository);
    if (fixtureId.includes('-addition-')) issue.subIssues.nodes = [];
    if (fixtureId.includes('-removal-')) changed.issue.subIssues.nodes = [];
    if (fixtureId.includes('-replacement-')) issue.subIssues.nodes[0].id = 'REPLACED';
    failureSchedule.push({ afterDispatch: 1, change: { repository: changed } });
  }
  return failureSchedule;
}
