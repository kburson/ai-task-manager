// @story #1990 — complete controlled authority, real collection/projection; no mocked admission.
import { fixture, observed, freshUnitDir } from './decomposition-authority-fixtures.mjs';
import { createDecompositionRuntime } from '../../../../task-tracker/lib/decomposition-authority.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { mapSubIssueNodes } from '../../../../gh/lib/wave-admission.mjs';
import { parseIssueKind } from '../../../../task-tracker/lib/issue-kind.mjs';
import { hash } from './decomposition-authority-fixtures.mjs';
import { formatIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
export async function currentUnitAuthority({ body, issue = 1, repository = 'o/r', hours = 7 }) {
  const f = fixture(hours);
  let complete = body;
  if (!/^## User Story$/m.test(complete))
    complete =
      '## User Story\nAs a fixture delivery owner\nI want current authority because missing reads cannot grant completion\nSo that current scoped evidence remains bounded\n\n' +
      complete;
  if (!/^## Scope$/m.test(complete))
    complete = '## Scope\nOne bounded fixture delivery.\n\n' + complete;
  if (!/^## Acceptance Criteria$/m.test(complete))
    complete += '\n\n## Acceptance Criteria\n- [ ] Preserve the declared fixture scope.\n';
  const tick = String.fromCharCode(96);
  if (!/^## Verification Commands$/m.test(complete))
    complete +=
      '\n\n## Verification Commands\n- [ ] ' +
      tick +
      'git status --short' +
      tick +
      ' <!-- id=1 -->\n';
  if (!/aitm-fields:/.test(complete))
    complete = complete.replace(
      '## AITM Progress Markers',
      '## AITM Progress Markers\n' + formatIssueFieldDb({ estimate: hours, size: 'M' })
    );
  f.body = complete;
  const subject = { repository, issue, projectId: 'PVT_a', projectItemId: 'PVTI_a' };
  f.deps.readIssue = async () => observed({ number: issue, body: f.body });
  f.deps.readBackIssue = f.deps.readIssue;
  const cfg = { repo: repository, projectId: subject.projectId };
  const projectDir = freshUnitDir('current-admission-');
  const runtime = createDecompositionRuntime({ cfg, projectDir, deps: f.deps });
  if (parseIssueKind(f.body) === 'epic') {
    const content =
      '### Task 1: One bounded child\n\nRun: ' +
      String.fromCharCode(96) +
      'node verify-child.mjs' +
      String.fromCharCode(96) +
      '\n';
    const commit = '1'.repeat(40);
    f.body = f.body.replace(
      '## AITM Progress Markers',
      '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
        commit +
        '\n\n## AITM Progress Markers'
    );
    let childBody =
      '## User Story\nAs a fixture operator\nI want one bounded child\nSo that delivery is current\n\n## Scope\nOne bounded child.\n\n## Acceptance Criteria\n- [x] Deliver the child.\n\n## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
      commit +
      '\n- **Source-plan-section**: ### Task 1: One bounded child\n\n## AITM Progress Markers\n' +
      formatIssueFieldDb({ priority: 'P1', size: 'M', estimate: 7, rank: 1 }) +
      '\n<!-- aitm-refinement-rationale: {"rationale":"bounded current fixture refinement"} -->\n';
    childBody = stampRefinementSnapshot(childBody, {
      labels: ['feature'],
      ts: '2026-10-11T12:00:00Z',
    });
    cfg.kanbanFieldId = 'STATUS';
    cfg.fieldIds = { rank: 'RANK' };
    const raw = {
      number: issue + 1000,
      title: 'One bounded child',
      body: childBody,
      state: 'CLOSED',
      stateReason: 'COMPLETED',
      labels: { nodes: [{ name: 'feature' }], pageInfo: { hasNextPage: false } },
      projectItems: {
        nodes: [
          {
            id: 'PVTI_child',
            project: { id: 'PVT_a' },
            fieldValues: {
              nodes: [
                { name: 'Done', field: { id: 'STATUS', name: 'Status' } },
                { number: 1, field: { id: 'RANK', name: 'Rank' } },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        ],
        pageInfo: { hasNextPage: false },
      },
    };
    f.values.project.children = mapSubIssueNodes([raw], cfg).map((child) => ({
      ...child,
      blockedBy: [],
    }));
    f.values.plan = {
      path: 'docs/plan.md',
      commit,
      section: null,
      digest: hash(content),
      availability: 'available',
      content,
      references: null,
    };
    f.deps.readPlanAtCommit = async () => content;
    mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
    writeFileSync(path.join(projectDir, 'docs/plan.md'), content);
  }
  const initial = await runtime.collect(subject);
  if (initial.input.availability.status !== 'complete')
    throw new Error(
      'fixture authority incomplete: ' + initial.input.availability.reasons.join(',')
    );
  await runtime.refresh(subject);
  return { body: f.body, cfg, subject, runtime, projectDir, authority: f };
}
