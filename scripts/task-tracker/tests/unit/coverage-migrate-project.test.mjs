// @story #607
// Smoke leaf for `scripts/gh/migrate-project.mjs` (epic #586, Group B).
//
// Per the #586 smoke-only split this one-shot board-migration script is covered
// by a clean offline smoke rather than a >=80% coverage target. Its working path
// lists every repo issue and writes project field values + issue bodies against a
// live GitHub Project, and its no-flag entry launches an interactive init wizard
// (`bash init-project-config.sh`, stdio inherited) — neither is testable offline.
// The config-resolution guard, however, runs fully offline: with `--skip-init`
// (so the wizard is bypassed) and `--dry-run`, `main()` reloads config and throws
// `repo not configured` when no repo is resolved, caught by the top-level handler
// which prints `migrate-project: repo not configured` and exits 1 — before any
// `gh`/GraphQL call. The smoke drives that guard from an isolated cwd+HOME so no
// real project config leaks in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempOutsideRepo } from '../../lib/scratch-dir.mjs';

const SCRIPT = fileURLToPath(new URL('../../../gh/migrate-project.mjs', import.meta.url));

test('migrate-project smoke: --skip-init --dry-run with no resolvable config → exits 1 with repo-not-configured guard, offline', () => {
  const cwd = mkdtempOutsideRepo('migrate-project-');
  // Isolate config resolution: cwd has no .ai-task-manager config, HOME points at
  // the same empty dir so the user-level config path is also empty, and the
  // project-dir env overrides are removed so getProjectDir() falls back to cwd.
  const env = { ...process.env, HOME: cwd };
  delete env.AI_TASK_MANAGER_PROJECT_DIR;
  delete env.CLAUDE_PROJECT_DIR;
  const res = spawnSync(process.execPath, [SCRIPT, '--skip-init', '--dry-run'], {
    cwd,
    env,
    encoding: 'utf8',
  });
  assert.equal(res.status, 1, res.stdout);
  assert.match(res.stderr, /migrate-project: repo not configured/);
});
