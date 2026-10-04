// @story #1857
// Pure unit model: filesystem fixture contents remain real, Git identity is injected.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  withRuntimeRootAdapters,
  PROJECT_ROOT_ALIASES,
} from '../../task-tracker/lib/runtime-storage.mjs';

export function createUnitRootFixture(prefix) {
  const parent = path.join(process.cwd(), '.ai-task-manager', 'runtime', 'test-fixtures');
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(path.join(parent, prefix));
}

// Explicit disposable unit model of an already completed migration. No Git or
// production bootstrap bypass: tests still use every real reader, validator and lease.
export function createActivatedUnitRuntimeRoot(prefix) {
  const root = createUnitRootFixture(prefix);
  const runtime = path.join(root, '.ai-task-manager', 'runtime');
  const transactionId = 'migration-unit-fixture';
  const planDigest = 'sha256:' + '1'.repeat(64);
  const records = {
    'control.json': {
      schema: 'aitm.runtime-control/v1',
      status: 'active',
      projectRoot: root,
      mainRoot: root,
      transactionId,
      planDigest,
    },
    ['migrations/' + transactionId + '/manifest.json']: {
      schema: 'aitm.runtime-migration/v1',
      status: 'complete',
      transactionId,
      planDigest,
      roots: [root],
    },
    'store/state/task-tracker-state.json': {},
    'store/state/task-tracker-queue.json': [],
    'store/fleet/task-fleet.json': {},
    'store/fleet/occupancy.json': {},
  };
  for (const [relative, value] of Object.entries(records)) {
    const file = path.join(runtime, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  }
  return root;
}

export function withUnitRuntimeRoot(operation, { projectRoot: expectedRoot } = {}) {
  return withRuntimeRootAdapters(
    {
      realpath: (value) => path.resolve(value),
      assertOutsideArtifacts: () => {},
      readIdentity: (directory) => {
        const selected =
          expectedRoot ?? PROJECT_ROOT_ALIASES.map((alias) => process.env[alias]).find(Boolean);
        const projectRoot = path.resolve(
          directory === process.cwd() && selected ? selected : directory
        );
        return {
          projectRoot,
          mainRoot: projectRoot,
          worktreeIdentity: {
            projectRoot,
            gitDir: path.join(projectRoot, '.git'),
            commonDir: path.join(projectRoot, '.git'),
            registeredRoots: [projectRoot],
            unavailableRoots: [],
          },
        };
      },
    },
    operation
  );
}

export function unitTest(...args) {
  const callback = args.pop();
  return test(...args, (...parameters) => withUnitRuntimeRoot(() => callback(...parameters)));
}

export function unitRuntimeEntrypointArgs(target, args = []) {
  return [
    fileURLToPath(new URL('./unit-runtime-entrypoint.mjs', import.meta.url)),
    target,
    ...args,
  ];
}
