// @story #1496
// cspell:ignore NOSYSTEM
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  realpathSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';
import {
  resolveExecutionContext,
  rehearsalRefusal,
} from '../../../task-tracker/lib/evidence-v2/execution-context.mjs';
import { initializeProvider, openProvider } from './provider.mjs';
import { guardGitInvocation } from './git-boundary.mjs';
import { BOOTSTRAP_FILE } from './process-bootstrap.mjs';
import { importSnapshots } from './source-snapshots.mjs';
import { captureProtectedState } from './fixtures.mjs';

const defaultToolRoot = fileURLToPath(new URL('../../../../', import.meta.url));

export function createSandbox({
  runId = `run-${randomUUID()}`,
  toolRoot = defaultToolRoot,
  sourceSnapshots = [],
} = {}) {
  const protectedBefore = captureProtectedState({
    paths: sourceSnapshots.map((s) => s.sourceRoot),
  });
  const root = realpathSync(mkdtempSync(path.join(projectScratchDir('test'), 'evidence-v2-')));
  try {
    const manifest = JSON.stringify({ schema: 'aitm.rehearsal-sandbox/v1', runId, root });
    writeFileSync(path.join(root, 'manifest.json'), manifest);
    const sourceRoot = path.join(root, 'source');
    const remote = path.join(root, 'remote.git');
    const home = path.join(root, 'home');
    const hooks = path.join(root, 'hooks');
    for (const folder of [sourceRoot, home, hooks]) mkdirSync(folder);
    const env = {
      PATH: process.env.PATH,
      HOME: home,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'rehearsal',
      GIT_AUTHOR_EMAIL: 'rehearsal@example.invalid',
      GIT_COMMITTER_NAME: 'rehearsal',
      GIT_COMMITTER_EMAIL: 'rehearsal@example.invalid',
      GIT_TERMINAL_PROMPT: '0',
      GIT_ALLOW_PROTOCOL: 'file',
      AI_TASK_MANAGER_PROJECT_DIR: sourceRoot,
    };
    const git = (args) =>
      execFileSync('git', args, {
        cwd: sourceRoot,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    git(['init', '-q', '-b', 'trunk']);
    git(['init', '-q', '--bare', remote]);
    git(['config', 'core.hooksPath', hooks]);
    git(['remote', 'add', 'origin', remote]);
    writeFileSync(path.join(sourceRoot, '.gitignore'), '.ai-task-manager/\n.tmp/\n.scratch/\n');
    writeFileSync(path.join(sourceRoot, 'source.txt'), 'baseline\n');
    git(['add', '.gitignore', 'source.txt']);
    git(['commit', '-qm', 'Synthetic baseline']);
    git(['push', '-q', 'origin', 'trunk']);
    const importedSnapshots = importSnapshots({ sourceSnapshots, sourceRoot, env });
    const context = resolveExecutionContext({
      schema: 'aitm.rehearsal-context/v1',
      providerMode: 'recorded',
      runId,
      repositoryId: `aitm-rehearsal/${runId}`,
      root,
      toolRoot,
      sourceRoot,
      authorityRoot: sourceRoot,
    });
    writeFileSync(path.join(root, 'context.json'), JSON.stringify(context));
    mkdirSync(path.join(sourceRoot, '.ai-task-manager'));
    const fields = Object.fromEntries(
      [
        'fieldBlockedBy',
        'fieldStartTime',
        'fieldEngagedTime',
        'fieldSessionTime',
        'fieldReviewTime',
        'fieldPlanTime',
        'fieldEstimate',
        'rankFieldId',
        'sizeFieldId',
        'priorityFieldId',
        'kanbanFieldId',
      ].map((key) => [key, `synthetic-${key}`])
    );
    writeFileSync(
      path.join(sourceRoot, '.ai-task-manager', 'task-tracker.json'),
      JSON.stringify({ repo: context.repositoryId, projectId: 'PVT_rehearsal', ...fields })
    );
    initializeProvider(context);
    const launch = (
      entry,
      argv,
      { node = process.execPath, operationId = randomUUID(), fault = null } = {}
    ) => {
      resolveExecutionContext(JSON.parse(readFileSync(path.join(root, 'context.json'), 'utf8')));
      const preload = BOOTSTRAP_FILE;
      // Grant installed package directories individually: granting node_modules itself
      // follows AITM's self-link and exposes the production authority directory.
      const dependencies = readdirSync(path.join(toolRoot, 'node_modules'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => `node_modules/${entry.name}`);
      const readPaths = ['scripts', 'bin', 'config', 'skill', 'package.json', ...dependencies].map(
        (name) => `--allow-fs-read=${path.join(toolRoot, name)}`
      );
      const args = [
        '--permission',
        ...readPaths,
        `--allow-fs-read=${root}`,
        '--allow-fs-read=/dev/null',
        `--allow-fs-write=${root}`,
        '--allow-child-process',
        '--import',
        preload,
        entry,
        ...argv,
      ];
      const result = spawnSync(node, args, {
        cwd: sourceRoot,
        env: {
          ...env,
          AITM_REHEARSAL_CONTEXT: path.join(root, 'context.json'),
          AITM_REHEARSAL_OPERATION_ID: operationId,
          ...(fault ? { AITM_REHEARSAL_FAULT: fault } : {}),
        },
        encoding: 'utf8',
        timeout: 15000,
      });
      return {
        exitCode: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
        effects: openProvider(context).effects(),
      };
    };
    const sandbox = {
      root,
      context,
      env,
      remote,
      importedSnapshots,
      protectedBefore,
      get events() {
        return openProvider(context).events();
      },
      git(args) {
        guardGitInvocation(context, args);
        return git(args);
      },
      get provider() {
        return openProvider(context);
      },
      command(argv, options) {
        return launch(path.join(toolRoot, 'scripts/task-tracker/task-tracker.mjs'), argv, options);
      },
      probe(source, options) {
        const entry = path.join(root, 'probe.mjs');
        writeFileSync(entry, source);
        return launch(entry, [], options);
      },
      restart() {
        return openProvider(context);
      },
      dispose() {
        if (!existsSync(root)) return;
        if (
          realpathSync(root) !== root ||
          readFileSync(path.join(root, 'manifest.json'), 'utf8') !== manifest
        )
          throw rehearsalRefusal('sandbox-ownership');
        rmSync(root, { recursive: true, force: true });
      },
    };
    return sandbox;
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export function runCommand({ sandbox, argv, operationId, fault }) {
  return sandbox.command(argv, { operationId, fault });
}
