// @story #1990
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readyEpic } from './decomposition-remote.cases.mjs';
import { hookFixture, snapshotFor } from './decomposition-hook.cases.mjs';
import { evaluateDecompositionActivity } from '../../../../task-tracker/lib/decomposition-activity.mjs';
import {
  readExactSessionBinding,
  bindingMatches,
} from '../../../../task-tracker/lib/mutation-context.mjs';
import { readWorktreeIdentity } from '../../../../task-tracker/lib/worktree-binding-guard.mjs';
import { runHook } from '../../../../task-tracker/source-edit-gate.mjs';

export function registerDecompositionTargetCases() {
  test('actual capability evaluation does not let read or preparation labels exempt a sibling source target', async () => {
    const f = await hookFixture(25);
    try {
      const current = await f.runtime.collect(f.subject);
      for (const activity of ['READ_*', 'decomposition-prepare']) {
        const verdict = evaluateDecompositionActivity({
          activity,
          targets: [{ relative: 'src/product.mjs', activity: 'WRITE_CODE' }],
          assessment: current.assessment,
          publication: current.publication,
        });
        assert.equal(verdict.decision, 'block', activity);
        assert.equal(verdict.code, 'decomposition-required');
      }
    } finally {
      f.native.close();
    }
  });
  test('actual executable hook fences recognized script generators and a commit with a sibling generator', async () => {
    const f = await hookFixture(25);
    try {
      const binary = path.join(f.native.root, '.tmp/provider');
      mkdirSync(binary, { recursive: true });
      writeFileSync(
        path.join(binary, 'gh'),
        '#!/usr/bin/env node\nprocess.stdout.write(' +
          JSON.stringify(JSON.stringify(snapshotFor(f, 25))) +
          ');\n'
      );
      chmodSync(path.join(binary, 'gh'), 0o755);
      for (const command of [
        'node scripts/generate-product.mjs',
        'git commit -m checkpoint && node scripts/generate-product.mjs',
        'git merge topic',
        'node .scratch/generate-product.mjs',
        'node product-generator.js',
      ]) {
        const payload = {
          cwd: f.native.root,
          session_id: f.native.sid,
          tool_name: 'Bash',
          tool_input: { command },
        };
        const result = spawnSync(
          process.execPath,
          [fileURLToPath(new URL('../../../../task-tracker/activity-guard.mjs', import.meta.url))],
          {
            cwd: f.native.root,
            input: JSON.stringify(payload),
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
        assert.equal(verdict.decision, 'block', command);
        assert.equal(verdict.code, 'decomposition-required', result.stdout);
      }
    } finally {
      f.native.close();
    }
  });
  test('actual native edit and patch cover every source, product config and mixed document target', async () => {
    const f = await hookFixture(25);
    try {
      for (const target of [
        'src/product.mjs',
        'scripts/tests/product.test.mjs',
        'package.json',
        'docs/result.md',
      ]) {
        const result = await runHook(f.payload(target, 'Edit'), f.deps);
        assert.equal(result.decision, 'block', target);
        assert.equal(result.code, 'decomposition-required');
      }
      const patch =
        '*** Begin Patch\n*** Add File: .scratch/checkpoint.md\n+history\n*** Add File: src/product.mjs\n+export const value=1;\n*** End Patch';
      const result = await runHook(
        {
          cwd: f.native.root,
          session_id: f.native.sid,
          tool_name: 'apply_patch',
          tool_input: { patch },
        },
        f.deps
      );
      assert.equal(result.decision, 'block');
      assert.equal(result.code, 'decomposition-required');
    } finally {
      f.native.close();
    }
  });
  test('actual fresh hook ignores a cached low estimate after provider authority changes', async () => {
    const f = await hookFixture(7);
    try {
      f.authority.values.project.estimate = 25;
      const result = await runHook(f.payload('src/product.mjs'), f.deps);
      assert.equal(result.decision, 'block');
      assert.equal(result.code, 'decomposition-authority-unavailable');
    } finally {
      f.native.close();
    }
  });
  test('actual hook reads lifecycle status by configured field identity', async () => {
    const f = await hookFixture(7);
    try {
      const cfg = { ...f.cfg, kanbanFieldId: 'STATUS' };
      const snapshot = snapshotFor(f);
      const item = snapshot.data.repository.issue.projectItems.nodes[0];
      item.fieldValueByName = { name: 'Refine' };
      item.fieldValues.nodes.push({
        name: 'Develop',
        field: { id: 'STATUS', name: 'Delivery Stage' },
      });
      const deps = { ...f.deps, cfg, graphql: async () => snapshot };
      delete deps.decomposition;
      const result = await runHook(f.payload('src/product.mjs'), deps);
      assert.equal(result.decision, 'allow', result.reason);
    } finally {
      f.native.close();
    }
  });
  for (const failure of ['429', 'parser', 'continuation-overflow'])
    test('actual hook refuses ' + failure + ' without retry or admitted mutation', async () => {
      const f = await hookFixture(7);
      try {
        let calls = 0;
        const deps = {
          ...f.deps,
          graphql: async () => {
            calls++;
            if (failure === '429') throw new Error('429 provider rate limit');
            if (failure === 'parser') return { data: { repository: { issue: null } } };
            const snapshot = snapshotFor(f);
            snapshot.data.repository.issue.comments.pageInfo = {
              hasNextPage: true,
              endCursor: 'PAGE_' + calls,
            };
            return snapshot;
          },
        };
        delete deps.decomposition;
        const result = await runHook(f.payload('src/product.mjs'), deps);
        assert.equal(result.decision, 'block');
        assert.equal(result.code, 'decomposition-authority-unavailable');
        assert.equal(calls, failure === 'continuation-overflow' ? 3 : 1);
      } finally {
        f.native.close();
      }
    });

  test('actual executable wrapper returns typed unavailable for a recognized edit with malformed local authority', async () => {
    const f = await hookFixture(7);
    try {
      writeFileSync(path.join(f.native.root, '.ai-task-manager/task-tracker.json'), '{invalid');
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../../../../task-tracker/activity-guard.mjs', import.meta.url))],
        {
          cwd: f.native.root,
          input: JSON.stringify(f.payload('src/product.mjs')),
          encoding: 'utf8',
          env: process.env,
        }
      );
      assert.equal(result.status, 0, result.stderr);
      const verdict = JSON.parse(result.stdout);
      assert.equal(verdict.decision, 'block');
      assert.equal(verdict.code, 'decomposition-authority-unavailable');
      assert.equal(verdict.args.issue, 107);
    } finally {
      f.native.close();
    }
  });
  test('actual capability evaluation refuses a newly scoped document beside a preparation label', async () => {
    const f = await hookFixture(25);
    try {
      const current = await f.runtime.collect(f.subject);
      const verdict = evaluateDecompositionActivity({
        activity: 'decomposition-prepare',
        targets: [{ relative: 'docs/result.md', activity: 'WRITE_DOCS' }],
        assessment: current.assessment,
        publication: current.publication,
      });
      assert.equal(verdict.decision, 'block');
      assert.equal(verdict.code, 'decomposition-required');
    } finally {
      f.native.close();
    }
  });

  test('actual checkpoint-only commit preserves recorded work when provider authority is unavailable', async () => {
    const f = await hookFixture(25);
    try {
      mkdirSync(path.join(f.native.root, 'src'), { recursive: true });
      writeFileSync(path.join(f.native.root, 'src/recorded.mjs'), '// recorded fixture work\n');
      const stage = spawnSync('git', ['add', '-f', 'src/recorded.mjs'], {
        cwd: f.native.root,
        encoding: 'utf8',
      });
      assert.equal(stage.status, 0, stage.stderr);
      const binary = path.join(f.native.root, '.tmp/provider');
      mkdirSync(binary, { recursive: true });
      writeFileSync(
        path.join(binary, 'gh'),
        '#!/usr/bin/env node\nprocess.stderr.write("429 provider unavailable");process.exit(1);\n'
      );
      chmodSync(path.join(binary, 'gh'), 0o755);
      const observed = readWorktreeIdentity({ projectDir: f.native.root });
      const binding = readExactSessionBinding(f.native.root, { sessionId: f.native.sid });
      assert.equal(
        bindingMatches(observed, binding, 107),
        true,
        JSON.stringify({ observed, binding })
      );
      const payload = {
        cwd: f.native.root,
        session_id: f.native.sid,
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "[#107] recorded checkpoint"' },
      };
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../../../../task-tracker/activity-guard.mjs', import.meta.url))],
        {
          cwd: f.native.root,
          input: JSON.stringify(payload),
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: binary + path.delimiter + process.env.PATH,
            AITM_GH_TEST_DOUBLE_BIN: binary,
          },
        }
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        result.stdout ? JSON.parse(result.stdout).decision : 'allow',
        'allow',
        result.stdout
      );
    } finally {
      f.native.close();
    }
  });

  test('actual hook refuses explicit skipped network authority despite a warm injected reader', async () => {
    const f = await hookFixture(7);
    const prior = process.env.TT_SKIP_NETWORK;
    try {
      process.env.TT_SKIP_NETWORK = '1';
      const verdict = await runHook(f.payload('src/product.mjs'), f.deps);
      assert.equal(verdict.decision, 'block');
      assert.equal(verdict.code, 'decomposition-authority-unavailable');
    } finally {
      if (prior === undefined) delete process.env.TT_SKIP_NETWORK;
      else process.env.TT_SKIP_NETWORK = prior;
      f.native.close();
    }
  });
  test('actual fresh unavailable lifecycle cannot fall back to a cached Develop state', async () => {
    const f = await hookFixture(7);
    try {
      const snapshot = snapshotFor(f);
      snapshot.data.repository.issue.projectItems.nodes[0].fieldValueByName = { name: null };
      const binary = path.join(f.native.root, '.tmp/provider');
      mkdirSync(binary, { recursive: true });
      writeFileSync(
        path.join(binary, 'gh'),
        '#!/usr/bin/env node\nprocess.stdout.write(' +
          JSON.stringify(JSON.stringify(snapshot)) +
          ');\n'
      );
      chmodSync(path.join(binary, 'gh'), 0o755);
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
      assert.equal(
        result.stdout ? JSON.parse(result.stdout).decision : 'allow',
        'block',
        result.stdout
      );
    } finally {
      f.native.close();
    }
  });
  test('actual drafting checkpoint reuses fresh singleton ownership from one combined snapshot', async () => {
    const f = await hookFixture(7);
    try {
      setActiveTask(f.native.sid, { ...f.native.active(), kanbanState: 'plan' }, f.native.root);
      mkdirSync(path.join(f.native.root, 'docs'), { recursive: true });
      writeFileSync(path.join(f.native.root, 'docs/plan.md'), 'A recorded plan.\n');
      const stage = spawnSync('git', ['add', '-f', 'docs/plan.md'], {
        cwd: f.native.root,
        encoding: 'utf8',
      });
      assert.equal(stage.status, 0, stage.stderr);
      const snapshot = snapshotFor(f);
      snapshot.data.repository.issue.projectItems.nodes[0].fieldValueByName = { name: 'Plan' };
      const binary = path.join(f.native.root, '.tmp/provider');
      mkdirSync(binary, { recursive: true });
      const calls = path.join(binary, 'calls.log');
      writeFileSync(
        path.join(binary, 'gh'),
        '#!/usr/bin/env node\nrequire("node:fs").appendFileSync(' +
          JSON.stringify(calls) +
          ',"call"+String.fromCharCode(10));process.stdout.write(' +
          JSON.stringify(JSON.stringify(snapshot)) +
          ');\n'
      );
      chmodSync(path.join(binary, 'gh'), 0o755);
      const payload = {
        cwd: f.native.root,
        session_id: f.native.sid,
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "[#107] plan checkpoint"' },
      };
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../../../../task-tracker/activity-guard.mjs', import.meta.url))],
        {
          cwd: f.native.root,
          input: JSON.stringify(payload),
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: binary + path.delimiter + process.env.PATH,
            AITM_GH_TEST_DOUBLE_BIN: binary,
          },
        }
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        result.stdout ? JSON.parse(result.stdout).decision : 'allow',
        'allow',
        result.stdout
      );
      const fs = await import('node:fs');
      assert.equal(fs.readFileSync(calls, 'utf8').trim().split('\n').length, 1);
    } finally {
      f.native.close();
    }
  });

  test('current completion-ready epic never permits a targetless parent implementation activity', async () => {
    const f = await readyEpic(true);
    try {
      const current = await f.runtime.collect(f.subject);
      const result = evaluateDecompositionActivity({
        activity: 'WRITE_CODE',
        targets: [],
        assessment: current.assessment,
        publication: current.publication,
      });
      assert.equal(result.decision, 'block');
      assert.equal(result.code, 'decomposition-required');
    } finally {
      f.native.close();
    }
  });
}
