// @story #1839
// Explicit opt-in only: real GitHub mutations against a preconfigured disposable clone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolveUsageRoot } from '../../../task-tracker/lib/graphql-usage/storage.mjs';
const configFile = process.env.AITM_DISPOSABLE_BASELINE_CONFIG;
const source = fileURLToPath(new URL('../../../../', import.meta.url));
const hash = (v) => 'sha256:' + createHash('sha256').update(v).digest('hex');
test(
  'live two-worktree disposable creation-to-planning benchmark',
  {
    skip: configFile
      ? false
      : 'Set AITM_DISPOSABLE_BASELINE_CONFIG after disposable clone and board setup',
    timeout: 90 * 60 * 1000,
  },
  async () => {
    const cfg = JSON.parse(await fs.readFile(configFile, 'utf8'));
    const own = JSON.parse(
      await fs.readFile(path.join(source, '.ai-task-manager/task-tracker.json'), 'utf8')
    );
    assert.equal(path.resolve(cfg.source), path.resolve(source));
    assert.match(cfg.repository, /^[\w.-]+\/[\w.-]+$/);
    assert.notEqual(cfg.repository.toLowerCase(), own.repo.toLowerCase());
    assert.notEqual(cfg.projectId, own.projectId);
    assert.equal(cfg.schema, 'aitm.graphql-usage.workload/v1');
    assert.equal(cfg.workers.length, 2);
    assert.equal(new Set(cfg.workers.map((w) => w.id)).size, 2);
    assert.ok(cfg.workers.every((w) => /^[a-z0-9-]+$/.test(w.id)));
    assert.ok(Number.isSafeInteger(cfg.repetitions) && cfg.repetitions > 0);
    assert.ok(Number.isFinite(cfg.spacingSeconds) && cfg.spacingSeconds > 0);
    assert.equal(new Set(cfg.workers.map((w) => w.sessionId)).size, 2);
    assert.ok(
      Date.parse(cfg.startedAt) > Date.now() + 60000,
      'Allow at least a minute for enrollment'
    );
    assert.ok(Date.parse(cfg.endedAt) - Date.parse(cfg.startedAt) >= 3600000);
    const declaration = JSON.parse(await fs.readFile(cfg.declarationFile, 'utf8'));
    assert.equal(declaration.startedAt, cfg.startedAt);
    assert.equal(declaration.endedAt, cfg.endedAt);
    assert.ok(Date.parse(declaration.declaredAt) < Date.now());
    const roots = await Promise.all(cfg.workers.map((w) => resolveUsageRoot(w.worktree)));
    assert.ok(roots.every((r) => r.available && r.commonRootId === declaration.commonRootId));
    assert.equal(new Set(roots.map((r) => r.worktreeId)).size, 2);
    const ownRoot = await resolveUsageRoot(source);
    assert.ok(ownRoot.available);
    assert.notEqual(roots[0].commonRootId, ownRoot.commonRootId);
    for (const [i, w] of cfg.workers.entries()) {
      const local = JSON.parse(
        await fs.readFile(path.join(w.worktree, '.ai-task-manager/task-tracker.json'), 'utf8')
      );
      assert.equal(local.repo, cfg.repository);
      assert.equal(local.projectId, cfg.projectId);
      assert.ok(
        declaration.participants.some(
          (p) => p.worktreeId === roots[i].worktreeId && p.sessionId === hash(w.sessionId)
        )
      );
    }
    await fs.mkdir(cfg.output, { recursive: true });
    await Promise.all(
      cfg.workers.map(
        (w) =>
          new Promise((resolve, reject) => {
            const env = {
              ...process.env,
              AI_TASK_MANAGER_SESSION_ID: w.sessionId,
              AITM_GRAPHQL_USAGE_PERMISSION_CONTEXT: 'disposable-baseline',
            };
            for (const key of [
              'AI_TASK_MANAGER_PROJECT_DIR',
              'TASK_TRACKER_PROJECT_DIR',
              'CLAUDE_PROJECT_DIR',
              'AITM_CAPTURE_PROJECT_DIR',
              'AITM_GRAPHQL_USAGE_CONTEXT',
              'AITM_GRAPHQL_USAGE_DISPATCH_CONTEXT',
            ])
              delete env[key];
            const child = spawn(
              process.execPath,
              [
                path.join(source, 'scripts/task-tracker/graphql-usage-launch.mjs'),
                process.execPath,
                path.join(source, 'scripts/tests/helpers/graphql-usage/disposable-worker.mjs'),
                path.resolve(configFile),
                w.id,
              ],
              { cwd: w.worktree, env, stdio: 'inherit' }
            );
            child.once('error', reject);
            child.once('close', (code) =>
              code === 0 ? resolve() : reject(Error('Disposable worker exited ' + code))
            );
          })
      )
    );
  }
);

const smokeConfigFile = process.env.AITM_DISPOSABLE_SMOKE_CONFIG;
test(
  'live disposable query cost and mutation cleanup smoke',
  {
    skip: smokeConfigFile
      ? false
      : 'Set AITM_DISPOSABLE_SMOKE_CONFIG after disposable clone and issue setup',
    timeout: 60000,
  },
  async () => {
    const cfg = JSON.parse(await fs.readFile(smokeConfigFile, 'utf8'));
    const local = JSON.parse(
      await fs.readFile(path.join(cfg.worktree, '.ai-task-manager/task-tracker.json'), 'utf8')
    );
    const own = JSON.parse(
      await fs.readFile(path.join(source, '.ai-task-manager/task-tracker.json'), 'utf8')
    );
    assert.equal(local.repo, cfg.repository);
    assert.equal(local.projectId, cfg.projectId);
    assert.notEqual(cfg.repository.toLowerCase(), own.repo.toLowerCase());
    assert.notEqual(cfg.projectId, own.projectId);
    assert.ok(Number.isSafeInteger(cfg.issueNumber) && cfg.issueNumber > 0);
    assert.ok(typeof cfg.sessionId === 'string' && cfg.sessionId.length > 0);
    const root = await resolveUsageRoot(cfg.worktree),
      ownRoot = await resolveUsageRoot(source);
    assert.ok(root.available && ownRoot.available);
    assert.notEqual(root.commonRootId, ownRoot.commonRootId);
    const env = {
      ...process.env,
      AI_TASK_MANAGER_SESSION_ID: cfg.sessionId,
      AITM_GRAPHQL_USAGE_PERMISSION_CONTEXT: 'disposable-smoke',
    };
    for (const key of [
      'AI_TASK_MANAGER_PROJECT_DIR',
      'TASK_TRACKER_PROJECT_DIR',
      'CLAUDE_PROJECT_DIR',
      'AITM_CAPTURE_PROJECT_DIR',
      'AITM_GRAPHQL_USAGE_CONTEXT',
      'AITM_GRAPHQL_USAGE_DISPATCH_CONTEXT',
    ])
      delete env[key];
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.join(source, 'scripts/tests/helpers/graphql-usage/disposable-smoke.mjs'),
          cfg.repository,
          String(cfg.issueNumber),
          path.resolve(cfg.output),
        ],
        { cwd: cfg.worktree, env, stdio: 'inherit' }
      );
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0 ? resolve() : reject(Error('Disposable smoke exited ' + code))
      );
    });
  }
);
