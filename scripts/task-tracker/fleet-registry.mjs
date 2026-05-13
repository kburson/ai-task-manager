import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { legacyPathFor } from './paths.mjs';
import { GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';

const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 25;
const LOCK_MAX_WAIT_MS = 5_000;

export function withLock(registryPath, fn) {
  const lockDir = registryPath + '.lock';
  mkdirSync(path.dirname(registryPath), { recursive: true });
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  let held = false;
  while (!held) {
    try {
      mkdirSync(lockDir);
      held = true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const age = Date.now() - statSync(lockDir).mtimeMs;
        if (age > LOCK_STALE_MS) {
          try {
            rmdirSync(lockDir);
          } catch {}
          continue;
        }
      } catch {}
      if (Date.now() > deadline) throw new Error(`fleet-registry: lock timeout on ${lockDir}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS);
    }
  }
  try {
    return fn();
  } finally {
    try {
      rmdirSync(lockDir);
    } catch {}
  }
}

export function findMainWorktreePath(projectDir) {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    });
    const firstBlock = out.split(/\n\n/)[0];
    const match = firstBlock.match(/^worktree (.+)$/m);
    if (match) return match[1].trim();
  } catch {}
  return projectDir;
}

export function fleetRegistryPath(mainWorktreePath) {
  return path.join(mainWorktreePath, '.ai-task-manager', 'task-fleet.json');
}

export function currentBranch(projectDir) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    }).trim();
  } catch {
    return 'unknown';
  }
}

export function readFleet(registryPath) {
  try {
    let readPath = registryPath;
    if (!existsSync(readPath)) {
      const legacy = legacyPathFor(registryPath);
      if (legacy && existsSync(legacy)) readPath = legacy;
    }
    if (!existsSync(readPath)) return {};
    return JSON.parse(readFileSync(readPath, 'utf8'));
  } catch {
    return {};
  }
}

export function writeFleet(registryPath, data) {
  mkdirSync(path.dirname(registryPath), { recursive: true });
  const tmp = registryPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, registryPath);
}

function testRmwDelay() {
  const ms = Number(process.env.FLEET_REGISTRY_TEST_DELAY_MS || 0);
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function registerTask(projectDir, issueRef, worktreePath, branch) {
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  withLock(rPath, () => {
    const fleet = readFleet(rPath);
    testRmwDelay();
    const existing = fleet[issueRef];
    fleet[issueRef] = {
      worktreePath,
      branch,
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      status: 'active',
    };
    writeFleet(rPath, fleet);
  });
}

export function deregisterTask(projectDir, issueRef) {
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  withLock(rPath, () => {
    const fleet = readFleet(rPath);
    testRmwDelay();
    delete fleet[issueRef];
    writeFleet(rPath, fleet);
  });
}

export function setTaskStatus(projectDir, issueRef, status) {
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  withLock(rPath, () => {
    const fleet = readFleet(rPath);
    testRmwDelay();
    if (!fleet[issueRef]) return;
    fleet[issueRef].status = status;
    writeFleet(rPath, fleet);
  });
}
