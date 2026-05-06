import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { legacyPathFor } from './paths.mjs';

export function findMainWorktreePath(projectDir) {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'],
      { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
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
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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

export function registerTask(projectDir, issueRef, worktreePath, branch) {
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  const fleet = readFleet(rPath);
  const existing = fleet[issueRef];
  fleet[issueRef] = {
    worktreePath,
    branch,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    status: 'active',
  };
  writeFleet(rPath, fleet);
}

export function deregisterTask(projectDir, issueRef) {
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  const fleet = readFleet(rPath);
  delete fleet[issueRef];
  writeFleet(rPath, fleet);
}

export function setTaskStatus(projectDir, issueRef, status) {
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  const fleet = readFleet(rPath);
  if (!fleet[issueRef]) return;
  fleet[issueRef].status = status;
  writeFleet(rPath, fleet);
}
