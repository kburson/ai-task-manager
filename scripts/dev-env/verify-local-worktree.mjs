#!/usr/bin/env node

import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitSelfDoc, wantsHelp } from '../lib/self-doc.mjs';
import { RUNTIME_REL } from '../task-tracker/paths.mjs';

const REQUIRED_COMMANDS = Object.freeze(['git', 'node', 'npm', 'gh', 'jq']);
const REQUIRED_TRACKED_FILES = Object.freeze([
  '.agents/skills/task/SKILL.md',
  '.codex/hooks.json',
  RUNTIME_REL.config,
]);

function defaultCommandExists(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return !result.error;
}

function nodeMajor(version) {
  const match = String(version)
    .trim()
    .match(/^v?(\d+)(?:\.|$)/);
  return match ? Number(match[1]) : null;
}

export function inspectLocalWorktreeEnvironment({
  projectDir = process.cwd(),
  nodeVersion = process.versions.node,
  commandExists = defaultCommandExists,
} = {}) {
  const errors = [];
  const warnings = [];
  const details = {
    projectDir: path.resolve(projectDir),
    nodeVersion: String(nodeVersion),
    selfLinkTarget: null,
  };

  const major = nodeMajor(nodeVersion);
  if (major === null) {
    errors.push(`Unable to parse Node.js version: ${nodeVersion}`);
  } else if (major < 22) {
    errors.push(`Node.js 22 or newer is required; found ${nodeVersion}`);
  } else if (major < 25) {
    warnings.push(`Node.js 25 is preferred for active development; found ${nodeVersion}`);
  }

  for (const command of REQUIRED_COMMANDS) {
    if (!commandExists(command)) {
      errors.push(`Required command is missing from PATH: ${command}`);
    }
  }

  for (const relativePath of REQUIRED_TRACKED_FILES) {
    if (!existsSync(path.join(projectDir, relativePath))) {
      errors.push(`Required tracked AITM file is missing: ${relativePath}`);
    }
  }

  const linkPath = path.join(projectDir, 'node_modules', 'ai-task-manager');
  let linkEntry = null;
  try {
    linkEntry = lstatSync(linkPath);
  } catch {
    linkEntry = null;
  }

  if (!linkEntry) {
    errors.push('Dogfood self-link is missing: node_modules/ai-task-manager');
  } else if (!linkEntry.isSymbolicLink()) {
    errors.push('Dogfood path must be a symbolic link: node_modules/ai-task-manager');
  } else {
    try {
      details.selfLinkTarget = realpathSync(linkPath);
      const expectedTarget = realpathSync(projectDir);
      if (details.selfLinkTarget !== expectedTarget) {
        errors.push(
          `Dogfood self-link must resolve to the current worktree (${expectedTarget}); ` +
            `found ${details.selfLinkTarget}`
        );
      }
    } catch (error) {
      errors.push(`Dogfood self-link cannot be resolved: ${error.message}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    details,
  };
}

function printResult(result) {
  for (const warning of result.warnings) {
    process.stderr.write(`[local-worktree] WARN: ${warning}\n`);
  }
  for (const error of result.errors) {
    process.stderr.write(`[local-worktree] ERROR: ${error}\n`);
  }

  if (result.ok) {
    process.stdout.write(
      `[local-worktree] ready: ${result.details.projectDir} ` +
        `(Node ${result.details.nodeVersion}, self-link verified)\n`
    );
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  if (wantsHelp(process.argv.slice(2))) {
    emitSelfDoc('verify-local-worktree');
    process.exit(0);
  }
  const result = inspectLocalWorktreeEnvironment();
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}
