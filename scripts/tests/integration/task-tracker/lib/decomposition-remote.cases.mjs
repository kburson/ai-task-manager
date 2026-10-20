// @story #1990
import assert from 'node:assert/strict';
import test from 'node:test';
import { hookFixture } from './decomposition-hook.cases.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { formatIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { mapSubIssueNodes } from '../../../../gh/lib/wave-admission.mjs';
import {
  replaceDecompositionRecords,
  readDecompositionRecords,
} from '../../../../task-tracker/lib/decomposition-records.mjs';
import {
  publication as pending,
  unavailable,
} from '../../../unit/task-tracker/lib/decomposition-authority-fixtures.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { hash } from '../../../unit/task-tracker/lib/decomposition-authority-fixtures.mjs';
import { assertScopedDecompositionEffect } from '../../../../task-tracker/lib/decomposition-effect-admission.mjs';
import { runIssueBodyVerb } from '../../../../task-tracker/verbs/issue-body.mjs';
import { verbEpicReconcile } from '../../../../task-tracker/verbs/epic-reconcile.mjs';
import { runCommentVerb } from '../../../../task-tracker/verbs/comment.mjs';

export async function readyEpic(terminal) {
  const f = await hookFixture(25);
  f.cfg.kanbanFieldId = 'STATUS';
  f.cfg.fieldIds.rank = 'RANK';
  const content =
    '### Task 1: Child authority\n\nRun: ' +
    String.fromCharCode(96) +
    'node verify-child.mjs' +
    String.fromCharCode(96) +
    '\n';
  let childBody =
    '## User Story\nAs a fixture operator\nI want one authority step\nSo that evidence is bounded\n\n## Scope\nDeliver one bounded authority step.\n\n## Acceptance Criteria\n- [ ] Deliver the step.\n\n## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
    '1'.repeat(40) +
    '\n- **Source-plan-section**: ### Task 1: Child authority\n\n## AITM Progress Markers\n' +
    formatIssueFieldDb({ priority: 'P1', size: 'M', estimate: 7, rank: 1 }) +
    '\n<!-- aitm-refinement-rationale: {"rationale":"current fixture refinement"} -->\n';
  childBody = stampRefinementSnapshot(childBody, {
    labels: ['feature'],
    ts: '2026-10-11T12:00:00Z',
  });
  const rawChild = {
    id: 'CHILD_2001',
    number: 2001,
    title: 'Child authority',
    body: childBody,
    state: terminal ? 'CLOSED' : 'OPEN',
    stateReason: terminal ? 'COMPLETED' : null,
    labels: { nodes: [{ id: 'LABEL_feature', name: 'feature' }], pageInfo: { hasNextPage: false } },
    blockedBy: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    projectItems: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
  };
  rawChild.projectItems.nodes.push({
    id: 'PVTI_child',
    project: { id: 'PVT_a' },
    fieldValues: {
      nodes: [
        { name: terminal ? 'Done' : 'Ready for Planning', field: { id: 'STATUS', name: 'Status' } },
        { number: 1, field: { id: 'RANK', name: 'Rank' } },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  });
  f.authority.values.project.children = mapSubIssueNodes([rawChild], f.cfg).map((child) => ({
    ...child,
    blockedBy: [],
  }));
  f.authority.values.plan = {
    path: 'docs/plan.md',
    commit: '1'.repeat(40),
    section: null,
    digest: hash(content),
    availability: 'available',
    content,
    references: null,
  };
  f.authority.deps.readPlanAtCommit = async () => content;
  f.authority.body =
    f.authority.body.replace(
      '## Decomposition Assessment',
      '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
        '1'.repeat(40) +
        '\n\n## Decomposition Assessment'
    ) + '\n<!-- aitm-issue-kind kind="epic" -->\n';
  mkdirSync(path.join(f.native.root, 'docs'), { recursive: true });
  writeFileSync(path.join(f.native.root, 'docs/plan.md'), content);
  await f.runtime.refresh(f.subject);
  const item = {
    id: 'PVTI_a',
    project: { id: 'PVT_a' },
    fieldValueByName: { name: 'Develop' },
    fieldValues: {
      nodes: [
        { number: 25, field: { id: 'EST', name: 'Estimate' } },
        { name: 'M', field: { id: 'SIZE', name: 'Size' } },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
  const response = {
    data: {
      viewer: { login: 'operator' },
      repository: {
        issue: {
          id: 'ISSUE_107',
          number: 107,
          body: f.authority.body,
          repository: { nameWithOwner: 'o/r' },
          assignees: { nodes: [{ login: 'operator' }] },
          projectItems: { nodes: [item], pageInfo: { hasNextPage: false, endCursor: null } },
          comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
          subIssues: { nodes: [rawChild], pageInfo: { hasNextPage: false, endCursor: null } },
        },
      },
    },
  };
  return { ...f, content, response };
}

export function registerDecompositionRemoteCases() {
  test('actual governed comment refuses a new oversized deliverable even with a caller checkpoint key', async () => {
    const f = await hookFixture(25);
    try {
      const effects = [];
      const ctx = {
        ...f.native.ctx,
        cfg: f.cfg,
        rest: ['107', '--key', 'checkpoint.operator-data', '--body-file', 'fixture.md'],
      };
      const deps = {
        decomposition: { subject: f.subject, runtime: f.runtime },
        readFile: () => '## Research result\nA new scoped deliverable.',
        listComments: async () => ({ issueId: 'ISSUE_107', comments: [] }),
        createComment: async (payload) => {
          effects.push(payload);
          return { id: 'COMMENT_1' };
        },
      };
      await assert.rejects(
        () => runCommentVerb(ctx, deps),
        (error) => error.code === 'decomposition-required'
      );
      assert.equal(effects.length, 0);
    } finally {
      f.native.close();
    }
  });
  test('actual governed body publication fences an oversized new deliverable before its first write', async () => {
    const f = await hookFixture(25);
    try {
      const before = f.authority.writes.length;
      const operation = {
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expected: 'Collect current authority.',
        replacement: 'Collect current authority.\n\n## Research Deliverable\nA new scoped result.',
      };
      const ctx = {
        ...f.native.ctx,
        cfg: f.cfg,
        rest: ['107', '--operation-file', 'operation.json'],
      };
      const deps = {
        decomposition: { subject: f.subject, runtime: f.runtime },
        readFile: () => JSON.stringify(operation),
        writeDeps: f.authority.deps,
      };
      await assert.rejects(
        () => runIssueBodyVerb(ctx, deps),
        (error) => error.code === 'decomposition-required'
      );
      assert.equal(f.authority.writes.length, before);
    } finally {
      f.native.close();
    }
  });
  test('actual governed scope narrowing is preparation and reassesses an oversized story without lowering its estimate', async () => {
    const f = await hookFixture(25);
    try {
      const operation = {
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expected: 'Collect current authority.',
        replacement: 'Collect one bounded authority input.',
      };
      const ctx = {
        ...f.native.ctx,
        cfg: f.cfg,
        rest: ['107', '--operation-file', 'operation.json'],
      };
      const deps = {
        decomposition: { subject: f.subject, runtime: f.runtime },
        readFile: () => JSON.stringify(operation),
        writeDeps: f.authority.deps,
      };
      const result = await runIssueBodyVerb(ctx, deps);
      assert.equal(result.status, 'ok');
      assert.match(f.authority.body, /Collect one bounded authority input/);
      const current = await f.runtime.collect(f.subject);
      assert.equal(current.projection.status, 'current');
      assert.equal(current.assessment.status, 'must-decompose');
      assert.equal(f.authority.values.project.estimate, 25);
    } finally {
      f.native.close();
    }
  });

  test('actual combined epic snapshot permits completion only after terminal materialized children', async () => {
    const f = await readyEpic(true);
    try {
      let calls = 0;
      const result = await assertScopedDecompositionEffect({
        issue: 107,
        cfg: f.cfg,
        projectDir: f.native.root,
        activity: 'scoped-completion',
        deps: {
          graphql: async () => {
            calls++;
            return f.response;
          },
          readPlanAtCommit: async () => f.content,
        },
      });
      assert.equal(result.decision, 'allow');
      assert.equal(calls, 3);
    } finally {
      f.native.close();
    }
  });

  test('actual epic reconciliation refuses planning-ready nonterminal children before a marker write', async () => {
    const f = await readyEpic(false);
    try {
      let effects = 0;
      await assert.rejects(
        () =>
          verbEpicReconcile({
            cfg: f.cfg,
            projectDir: f.native.root,
            rest: ['107'],
            deps: {
              decomposition: { subject: f.subject, runtime: f.runtime },
              mutateIssueBody: async ({ mutate }) => {
                const next = await mutate(f.authority.body);
                if (next !== f.authority.body) effects++;
              },
              fetchEpicChildren: async () => [],
            },
          }),
        (error) => error.code === 'decomposition-required'
      );
      assert.equal(effects, 0);
    } finally {
      f.native.close();
    }
  });
  test('actual combined epic completion follows a bounded child labels continuation', async () => {
    const f = await readyEpic(true);
    try {
      const first = structuredClone(f.response);
      first.data.repository.issue.subIssues.nodes[0].labels = {
        nodes: [],
        pageInfo: { hasNextPage: true, endCursor: 'LABEL_NEXT' },
      };
      let calls = 0;
      const result = await assertScopedDecompositionEffect({
        issue: 107,
        cfg: f.cfg,
        projectDir: f.native.root,
        activity: 'scoped-completion',
        deps: {
          readPlanAtCommit: async () => f.content,
          graphql: async ({ query }) => {
            calls++;
            if (calls === 1 || calls === 2) return first;
            if (calls === 4) return f.response;
            assert.match(query, /LABEL_NEXT/);
            return {
              data: {
                node: {
                  id: 'CHILD_2001',
                  labels: {
                    nodes: [{ id: 'LABEL_feature', name: 'feature' }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
            };
          },
        },
      });
      assert.equal(result.decision, 'allow');
      assert.equal(calls, 4);
    } finally {
      f.native.close();
    }
  });

  test('actual governed comment preserves identical existing history without a new effect', async () => {
    const f = await hookFixture(25);
    try {
      let effects = 0;
      const body = 'A recorded historical checkpoint.';
      const key = 'checkpoint.operator-data';
      const owned = body + '\n\n<!-- aitm-owned-comment key="' + key + '" -->';
      const result = await runCommentVerb(
        { ...f.native.ctx, cfg: f.cfg, rest: ['107', '--key', key, '--body-file', 'history.md'] },
        {
          decomposition: { subject: f.subject, runtime: f.runtime },
          readFile: () => body,
          listComments: async () => ({
            issueId: 'ISSUE_107',
            comments: [
              {
                id: 'IC_history',
                body: owned,
                url: 'https://github.com/o/r/issues/107#issuecomment-1',
                issue: 107,
                repository: 'o/r',
              },
            ],
          }),
          createComment: async () => {
            effects++;
          },
          updateComment: async () => {
            effects++;
          },
        }
      );
      assert.equal(result.status, 'no-op');
      assert.equal(effects, 0);
    } finally {
      f.native.close();
    }
  });
  test('actual governed scope revision refuses authority from a different fresh source body', async () => {
    const f = await hookFixture(25);
    try {
      const base = f.authority.body;
      f.authority.deps.readIssue = async () => ({
        status: 'observed',
        value: {
          number: 107,
          body: base.replace('Collect current authority.', 'An externally changed scope.'),
        },
        revision: null,
        digest: hash(base),
      });
      let effects = 0;
      const operation = {
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expected: 'Collect current authority.',
        replacement: 'A bounded scope.',
      };
      const deps = {
        decomposition: { subject: f.subject, runtime: f.runtime },
        readFile: () => JSON.stringify(operation),
        writeDeps: {
          ...f.authority.deps,
          readIssue: async () => ({ number: 107, body: base }),
          writeIssue: async () => {
            effects++;
          },
        },
      };
      await assert.rejects(
        () =>
          runIssueBodyVerb(
            { ...f.native.ctx, cfg: f.cfg, rest: ['107', '--operation-file', 'operation.json'] },
            deps
          ),
        (error) => error.code === 'decomposition-authority-unavailable'
      );
      assert.equal(effects, 0);
    } finally {
      f.native.close();
    }
  });

  for (const kind of ['audit', 'research', 'spike'])
    for (const hours of [23, 24, 25])
      test(
        'actual ' + kind + ' comment at ' + hours + 'h uses current remote effect admission',
        async () => {
          const f = await hookFixture(hours);
          try {
            f.authority.body += '\n<!-- aitm-issue-kind kind="' + kind + '" -->\n';
            await f.runtime.refresh(f.subject);
            const comments = [];
            let effects = 0;
            const deps = {
              decomposition: { subject: f.subject, runtime: f.runtime },
              readFile: () => '### Findings\nA new scoped result.',
              listComments: async () => ({ issueId: 'ISSUE_107', comments }),
              createComment: async ({ body }) => {
                effects++;
                comments.push({ id: 'IC_result', body, issue: 107, repository: 'o/r' });
                return { id: 'IC_result' };
              },
              readComment: async () => comments[0],
            };
            const action = () =>
              runCommentVerb(
                {
                  ...f.native.ctx,
                  cfg: f.cfg,
                  rest: ['107', '--key', 'research.results-v1', '--body-file', 'result.md'],
                },
                deps
              );
            if (hours >= 24) {
              await assert.rejects(action, (error) => error.code === 'decomposition-required');
              assert.equal(effects, 0);
            } else {
              const result = await action();
              assert.equal(result.status, 'created');
              assert.equal(effects, 1);
            }
          } finally {
            f.native.close();
          }
        }
      );
  for (const status of ['pending', 'indeterminate', 'epic-planning-false'])
    test('actual own scope preparation remains usable under ' + status, async () => {
      const f = status === 'epic-planning-false' ? await readyEpic(false) : await hookFixture(25);
      try {
        if (status === 'pending') {
          const current = await f.runtime.collect(f.subject);
          f.authority.body = replaceDecompositionRecords(f.authority.body, {
            assessment: current.assessment,
            publication: pending(current.assessment.inputDigest, { subject: f.subject }),
          });
        }
        if (status === 'indeterminate') f.authority.deps.readForecast = async () => unavailable();
        if (status === 'epic-planning-false') {
          f.authority.values.project.children = [];
          await f.runtime.refresh(f.subject);
          setActiveTask(f.native.sid, { ...f.native.active(), kanbanState: 'plan' }, f.native.root);
        }
        const operation = {
          schema: 'aitm.issue-body-operation/v1',
          kind: 'replace-exact',
          expected: 'Collect current authority.',
          replacement: 'Prepare one bounded decomposition scope.',
        };
        const result = await runIssueBodyVerb(
          { ...f.native.ctx, cfg: f.cfg, rest: ['107', '--operation-file', 'scope.json'] },
          {
            decomposition: { subject: f.subject, runtime: f.runtime },
            readFile: () => JSON.stringify(operation),
            writeDeps: f.authority.deps,
          }
        );
        assert.equal(result.status, 'ok');
        assert.match(f.authority.body, /Prepare one bounded decomposition scope/);
        assert.equal(f.authority.values.project.estimate, 25);
        if (status === 'pending')
          assert.equal(
            readDecompositionRecords(f.authority.body).publication.operationId,
            'b41d3bf2-e26e-477e-88d1-b2db32793001'
          );
        const current = await f.runtime.collect(f.subject);
        assert.equal(
          current.assessment.status,
          status === 'epic-planning-false' ? 'epic-readiness-required' : status
        );
        if (status === 'epic-planning-false')
          assert.equal(current.input.epicReadiness.planning, false);
      } finally {
        f.native.close();
      }
    });
  test('actual own scope revision cannot smuggle a new nested research deliverable as preparation', async () => {
    const f = await hookFixture(25);
    try {
      const before = f.authority.writes.length;
      const operation = {
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expected: 'Collect current authority.',
        replacement:
          'Collect current authority.\n\n### Research Deliverable\nA newly delivered scoped result.',
      };
      await assert.rejects(
        () =>
          runIssueBodyVerb(
            { ...f.native.ctx, cfg: f.cfg, rest: ['107', '--operation-file', 'scope.json'] },
            {
              decomposition: { subject: f.subject, runtime: f.runtime },
              readFile: () => JSON.stringify(operation),
              writeDeps: f.authority.deps,
            }
          ),
        (error) => error.code === 'decomposition-required'
      );
      assert.equal(f.authority.writes.length, before);
    } finally {
      f.native.close();
    }
  });
  test('actual identical body history is a canonical no-op without fresh scoped admission', async () => {
    const f = await hookFixture(25);
    try {
      const before = f.authority.writes.length;
      let snapshotCalls = 0;
      const operation = {
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expected: 'Collect current authority.',
        replacement: 'Collect current authority.',
      };
      const result = await runIssueBodyVerb(
        { ...f.native.ctx, cfg: f.cfg, rest: ['107', '--operation-file', 'history.json'] },
        {
          readFile: () => JSON.stringify(operation),
          writeDeps: f.authority.deps,
          graphql: async () => {
            snapshotCalls++;
            throw new Error('429 unavailable');
          },
        }
      );
      assert.equal(result.status, 'no-op');
      assert.equal(f.authority.writes.length, before);
      assert.equal(snapshotCalls, 0);
    } finally {
      f.native.close();
    }
  });
}
