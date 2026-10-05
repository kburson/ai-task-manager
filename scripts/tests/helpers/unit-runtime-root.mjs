// @story #1857
// Pure unit model: filesystem fixture contents remain real, Git identity is injected.
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  withRuntimeRootAdapters,
  PROJECT_ROOT_ALIASES,
} from '../../task-tracker/lib/runtime-storage.mjs';

export function createUnitRootFixture(prefix) {
  const parent = path.join(process.cwd(), '.scratch', 'test');
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(path.join(parent, prefix));
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
        return { projectRoot, mainRoot: projectRoot };
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
