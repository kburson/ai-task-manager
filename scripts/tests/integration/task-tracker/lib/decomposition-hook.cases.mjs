// @story #1990
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBindingFixture } from '../../../helpers/binding-generation-fixture.mjs';
import {
  fixture,
  subject as originalSubject,
  observed,
} from '../../../unit/task-tracker/lib/decomposition-authority-fixtures.mjs';
import { createDecompositionRuntime } from '../../../../task-tracker/lib/decomposition-authority.mjs';
import { choreModeOn } from '../../../../task-tracker/verbs/chore-mode.mjs';
import { verbStart } from '../../../../task-tracker/verbs/start.mjs';
import { getActiveTask, setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { runHook } from '../../../../task-tracker/source-edit-gate.mjs';
import { readDeepDiveSignals } from '../../../../task-tracker/lib/deep-dive.mjs';

export async function hookFixture(hours) {
  const native = createBindingFixture(import.meta.url);
  native.sid = native.sid.replaceAll('.', '-');
  process.env.AI_TASK_MANAGER_SESSION_ID = native.sid;
  native.active = () => getActiveTask(native.sid, native.root);
  try {
    const authority = fixture(hours);
    authority.body = authority.body.replace(
      '## AITM Progress Markers',
      '<!-- aitm-deep-dive-posted ts="2026-10-11T12:00:00Z" -->\n<!-- aitm-deep-dive-complete ts="2026-10-11T12:00:00Z" -->\n\n## AITM Progress Markers'
    );
    authority.values.forecast = {
      estimate: null,
      size: null,
      recordId: null,
      payloadHash: null,
      proposals: [],
      observedProjections: [
        { size: 'M', estimate: hours },
        { size: 'M', estimate: hours },
      ],
    };
    const subject = { ...originalSubject, issue: 107 };
    authority.deps.readIssue = async () => observed({ number: 107, body: authority.body });
    authority.deps.readBackIssue = authority.deps.readIssue;
    const cfg = {
      ...native.ctx.cfg,
      repo: 'o/r',
      projectId: 'PVT_a',
      fieldIds: { estimate: 'EST', size: 'SIZE' },
    };
    mkdirSync(path.join(native.root, '.ai-task-manager'), { recursive: true });
    writeFileSync(
      path.join(native.root, '.ai-task-manager', 'task-tracker.json'),
      JSON.stringify(cfg)
    );
    const runtime = createDecompositionRuntime({
      cfg,
      projectDir: native.root,
      deps: authority.deps,
    });
    await verbStart({ ...native.ctx, decomposition: { subject, runtime } });
    setActiveTask(native.sid, { ...native.active(), kanbanState: 'develop' }, native.root);
    const deps = {
      projectDir: native.root,
      cfg,
      isChoreModeActive: () => false,
      resolveIssueSignals: async () => {
        const flags = readDeepDiveSignals(authority.body);
        return {
          state: 'develop',
          body: authority.body,
          hasPostedMarker: flags.hasPosted,
          hasCompleteMarker: flags.hasComplete,
          assignees: ['operator'],
          currentUser: 'operator',
        };
      },
      decomposition: { subject, runtime },
    };
    const payload = (target, tool_name = 'Write') => ({
      cwd: native.root,
      session_id: native.sid,
      tool_name,
      tool_input: { file_path: target },
    });
    return { native, authority, subject, runtime, cfg, deps, payload };
  } catch (error) {
    native.close();
    throw error;
  }
}

export function snapshotFor(f, hours = 7) {
  const item = {
    id: 'PVTI_a',
    project: { id: 'PVT_a' },
    fieldValueByName: { name: 'Develop' },
    fieldValues: {
      nodes: [
        { number: hours, field: { id: 'EST' } },
        { name: 'M', field: { id: 'SIZE' } },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
  return {
    data: {
      viewer: { login: 'operator' },
      repository: {
        issue: {
          id: 'ISSUE_107',
          number: 107,
          body: f.authority.body,
          assignees: { nodes: [{ login: 'operator' }] },
          comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
          projectItems: { nodes: [item], pageInfo: { hasNextPage: false, endCursor: null } },
        },
      },
    },
  };
}
export function registerDecompositionHookCases() {
  test('actual source hook refuses oversized source edits after ordinary binding and markers pass', async () => {
    const f = await hookFixture(25);
    try {
      const result = await runHook(f.payload('src/product.mjs'), f.deps);
      assert.equal(result.decision, 'block');
      assert.equal(result.code, 'decomposition-required');
      assert.equal(f.authority.values.project.estimate, 25);
    } finally {
      f.native.close();
    }
  });
  test('actual source hook fences chore and artifact early-allow paths for oversized scoped effects', async () => {
    const f = await hookFixture(25);
    try {
      for (const target of ['src/product.mjs', 'docs/new-audit-deliverable.md']) {
        const result = await runHook(f.payload(target), {
          ...f.deps,
          isChoreModeActive: () => true,
        });
        assert.equal(result.decision, 'block', target);
        assert.equal(result.code, 'decomposition-required');
      }
    } finally {
      f.native.close();
    }
  });
  test('actual source hook requires one combined fresh snapshot for an ordinary admitted story edit', async () => {
    const f = await hookFixture(7);
    try {
      const calls = [];
      const issue = {
        id: 'ISSUE_107',
        number: 107,
        body: f.authority.body,
        assignees: { nodes: [{ login: 'operator' }] },
        comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        projectItems: {
          nodes: [
            {
              id: 'PVTI_a',
              project: { id: 'PVT_a' },
              fieldValueByName: { name: 'Develop' },
              fieldValues: {
                nodes: [
                  { number: 7, field: { id: 'EST' } },
                  { name: 'M', field: { id: 'SIZE' } },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
      const deps = {
        ...f.deps,
        graphql: async (request) => {
          calls.push(request);
          return { data: { repository: { issue }, viewer: { login: 'operator' } } };
        },
      };
      delete deps.decomposition;
      const result = await runHook(f.payload('src/product.mjs'), deps);
      assert.equal(result.decision, 'allow');
      assert.equal(calls.length, 1);
      assert.match(calls[0].query, /projectItems/);
      assert.match(calls[0].query, /comments/);
    } finally {
      f.native.close();
    }
  });

  test('actual activity hook executable refuses an oversized native source mutation', async () => {
    const f = await hookFixture(25);
    try {
      const binary = path.join(f.native.root, 'fake-bin');
      mkdirSync(binary, { recursive: true });
      const issue = {
        number: 107,
        id: 'ISSUE_107',
        body: f.authority.body,
        assignees: { nodes: [{ login: 'operator' }] },
        comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        projectItems: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      };
      issue.projectItems.nodes.push({
        id: 'PVTI_a',
        project: { id: 'PVT_a' },
        fieldValueByName: { name: 'Develop' },
        fieldValues: {
          nodes: [
            { number: 25, field: { id: 'EST' } },
            { name: 'M', field: { id: 'SIZE' } },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
      const response = JSON.stringify({
        data: { repository: { issue }, viewer: { login: 'operator' } },
      });
      const ghFile = path.join(binary, 'gh');
      writeFileSync(
        ghFile,
        '#!/usr/bin/env node\nprocess.stdout.write(' + JSON.stringify(response) + ');\n'
      );
      chmodSync(ghFile, 0o755);
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../../../../task-tracker/activity-guard.mjs', import.meta.url))],
        {
          cwd: f.native.root,
          input: JSON.stringify(f.payload('src/product.mjs')),
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: binary + path.delimiter + process.env.PATH,
            AITM_GH_TEST_DOUBLE_BIN: binary,
          },
        }
      );
      assert.equal(result.status, 0, result.stderr);
      const verdict = result.stdout ? JSON.parse(result.stdout) : { decision: 'allow' };
      assert.equal(verdict.decision, 'block');
      assert.equal(verdict.code, 'decomposition-required');
    } finally {
      f.native.close();
    }
  });

  test('actual source hook consumes bounded forecast continuation without a second base snapshot', async () => {
    const f = await hookFixture(7);
    try {
      let calls = 0;
      const first = snapshotFor(f);
      first.data.repository.issue.comments.pageInfo = {
        hasNextPage: true,
        endCursor: 'COMMENTS_1',
      };
      const deps = {
        ...f.deps,
        graphql: async () => {
          calls++;
          return calls === 1
            ? first
            : {
                data: {
                  repository: {
                    issue: {
                      number: 107,
                      comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
                    },
                  },
                },
              };
        },
      };
      delete deps.decomposition;
      const result = await runHook(f.payload('src/product.mjs'), deps);
      assert.equal(result.decision, 'allow');
      assert.equal(calls, 2);
    } finally {
      f.native.close();
    }
  });
  test(
    'actual source hook has a hard deadline when provider transport never resolves',
    { timeout: 6500 },
    async () => {
      const f = await hookFixture(7);
      try {
        let calls = 0;
        const deps = {
          ...f.deps,
          graphql: () => {
            calls++;
            return new Promise(() => {});
          },
        };
        delete deps.decomposition;
        const started = Date.now();
        const result = await runHook(f.payload('src/product.mjs'), deps);
        assert.equal(result.decision, 'block');
        assert.equal(result.code, 'decomposition-authority-unavailable');
        assert.equal(calls, 1);
        assert.ok(Date.now() - started < 6000);
      } finally {
        f.native.close();
      }
    }
  );

  test('actual chore-mode detach cannot discard an oversized story restriction', async () => {
    const f = await hookFixture(25);
    try {
      await choreModeOn({ ...f.native.ctx, rest: ['on', 'fixture recovery'] });
      const deps = { ...f.deps };
      delete deps.isChoreModeActive;
      const result = await runHook(f.payload('src/product.mjs'), deps);
      assert.equal(result.decision, 'block');
      assert.equal(result.code, 'decomposition-required');
    } finally {
      f.native.close();
    }
  });

  test('actual source-hook wrapper fails closed on an unexpected local admission exception', async () => {
    const f = await hookFixture(7);
    try {
      const result = await runHook(f.payload('src/product.mjs'), {
        ...f.deps,
        loadBoundIssue: () => '#107',
        readExactSessionBinding: () => {
          throw new Error('fixture local admission failure');
        },
      });
      assert.equal(result.decision, 'block');
      assert.equal(result.code, 'decomposition-authority-unavailable');
      assert.equal(result.args.issue, 107);
    } finally {
      f.native.close();
    }
  });
}
