#!/usr/bin/env node
// @story #447 #448 #529 #855 #867 #1089
// Stage-aware Develop verification. Iteration is fast and affected-only;
// finalization is clean-tree, exact-SHA, and receipt-producing.

import { execFileSync, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import {
  buildVerificationFingerprint,
  createVerificationReceipt,
} from './lib/verification-receipt.mjs';
import { formatTestImpactReport, selectAffectedTests } from './lib/test-impact-selector.mjs';

const FORMATTABLE_RE = /\.(?:c?js|mjs|json|jsonc|md|ya?ml)$/i;
const JAVASCRIPT_RE = /\.(?:c?js|mjs)$/i;

export function collectChangedPaths({ cwd = process.cwd() } = {}) {
  const tracked = execFileSync('git', ['diff', '--name-status', '--find-renames', '-z', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd,
    encoding: 'utf8',
  });
  return [
    ...new Set(
      `${parseChangedNameStatus(tracked).join('\n')}\n${untracked}`
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ].sort();
}

export function parseChangedNameStatus(raw) {
  const tokens = String(raw || '')
    .split('\0')
    .filter(Boolean);
  const paths = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    const firstPath = tokens[index++];
    if (!status || !firstPath) break;
    paths.push(firstPath);
    if (/^[RC]/.test(status)) {
      const secondPath = tokens[index++];
      if (secondPath) paths.push(secondPath);
    }
  }
  return paths;
}

/** Compatibility export retained for existing callers and regression tests. */
export function collectTestFiles({ cwd = process.cwd() } = {}) {
  return collectChangedPaths({ cwd }).filter((file) => file.endsWith('.test.mjs'));
}

export function buildIterationSteps(changedPaths = []) {
  const javascript = changedPaths.filter((file) => JAVASCRIPT_RE.test(file)).sort();
  const formattable = changedPaths.filter((file) => FORMATTABLE_RE.test(file)).sort();
  const steps = [];
  if (javascript.length > 0) {
    steps.push({
      classification: 'lint-affected-fix',
      command: 'npx',
      args: ['eslint', '--fix', ...javascript],
      label: `eslint --fix (${javascript.length} changed file(s))`,
    });
  }
  if (formattable.length > 0) {
    steps.push({
      classification: 'format-affected-fix',
      command: 'npx',
      args: ['prettier', '--write', ...formattable],
      label: `prettier --write (${formattable.length} changed file(s))`,
    });
  }
  return steps;
}

export function buildFinalSteps() {
  return [
    {
      classification: 'lint-full',
      command: 'npm',
      args: ['run', 'lint'],
      label: 'npm run lint',
    },
    {
      classification: 'format-full',
      command: 'npm',
      args: ['run', 'format:check'],
      label: 'npm run format:check',
    },
  ];
}

function defaultRunCommand(step, projectDir) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const result = spawnSync(step.command, step.args, {
    cwd: projectDir,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  return {
    exitCode: result.status ?? 1,
    durationMs: Date.now() - startedMs,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

function gitHead(projectDir) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf8' }).trim();
}

function gitClean(projectDir) {
  return (
    execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      cwd: projectDir,
      encoding: 'utf8',
    }).trim() === ''
  );
}

function execute(step, projectDir, runCommand) {
  const result = runCommand(step, projectDir) || {};
  return {
    classification: step.classification,
    command: step.command,
    args: [...step.args],
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : 1,
    durationMs: Number.isFinite(result.durationMs) ? result.durationMs : 0,
    ...(result.startedAt ? { startedAt: result.startedAt } : {}),
    ...(result.completedAt ? { completedAt: result.completedAt } : {}),
  };
}

function commandFailure(command) {
  return {
    code: 'command-red',
    classification: command.classification,
    exitCode: command.exitCode,
    message: `${command.command} ${command.args.join(' ')} exited ${command.exitCode}`,
  };
}

export function runDevelopVerification({
  projectDir = process.cwd(),
  mode = 'iteration',
  issueNumber,
  deps = {},
} = {}) {
  if (!['iteration', 'final'].includes(mode)) {
    return { ok: false, mode, commands: [], reasons: [{ code: 'invalid-mode' }] };
  }
  const runCommand = deps.runCommand || defaultRunCommand;
  const getHeadSha = deps.getHeadSha || gitHead;
  const isClean = deps.isClean || gitClean;
  const commands = [];

  if (mode === 'iteration') {
    try {
      const changedPaths = (deps.collectChangedPaths || collectChangedPaths)({ cwd: projectDir });
      const selection = (deps.selectAffectedTests || selectAffectedTests)({
        projectDir,
        changedPaths,
      });
      const steps = [
        ...buildIterationSteps(changedPaths),
        ...selection.tests.map((file) => ({
          classification: 'test-affected',
          command: 'node',
          args: ['--test', file],
          label: `node --test ${file}`,
        })),
      ];
      for (const step of steps) {
        const command = execute(step, projectDir, runCommand);
        commands.push(command);
        if (command.exitCode !== 0) {
          return {
            ok: false,
            mode,
            changedPaths,
            selection,
            commands,
            reasons: [commandFailure(command)],
          };
        }
      }
      return { ok: true, mode, changedPaths, selection, commands, reasons: [] };
    } catch (error) {
      return {
        ok: false,
        mode,
        commands,
        reasons: [{ code: 'iteration-error', message: error.message }],
      };
    }
  }

  if (!Number.isInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
    return { ok: false, mode, commands, reasons: [{ code: 'issue-required' }] };
  }
  if (!isClean(projectDir)) {
    return {
      ok: false,
      mode,
      commands,
      reasons: [
        {
          code: 'final-tree-dirty',
          message: 'finalization requires a clean committed tree; inspect, commit, and retry',
        },
      ],
    };
  }

  const commitSha = getHeadSha(projectDir);
  for (const step of buildFinalSteps()) {
    const command = execute(step, projectDir, runCommand);
    commands.push(command);
    if (command.exitCode !== 0) {
      return { ok: false, mode, commands, reasons: [commandFailure(command)] };
    }
    if (!isClean(projectDir)) {
      return {
        ok: false,
        mode,
        commands,
        reasons: [
          {
            code: 'final-tree-mutated',
            message:
              'finalization changed tracked files; inspect, commit, and retry against the new SHA',
          },
        ],
      };
    }
    if (getHeadSha(projectDir) !== commitSha) {
      return {
        ok: false,
        mode,
        commands,
        reasons: [{ code: 'final-sha-changed', message: 'HEAD changed during finalization' }],
      };
    }
  }

  try {
    const fingerprint = (deps.buildFingerprint || buildVerificationFingerprint)({
      projectDir,
      commitSha,
    });
    const receipt = (deps.createReceipt || createVerificationReceipt)({
      issueNumber: Number(issueNumber),
      stage: 'develop-final',
      fingerprint,
      commands,
      now: deps.now,
    });
    return { ok: true, mode, commands, reasons: [], fingerprint, receipt };
  } catch (error) {
    return {
      ok: false,
      mode,
      commands,
      reasons: [{ code: 'receipt-error', message: error.message }],
    };
  }
}

export function isMainModule() {
  try {
    return (
      Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
    );
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  let mode = 'iteration';
  let issueNumber;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--mode') mode = argv[++index];
    else if (argv[index] === '--issue') issueNumber = Number(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return { mode, issueNumber };
}

export function main(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) {
    emitSelfDoc('verify-develop');
    return 0;
  }
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`verify-develop: ${error.message}`);
    return 2;
  }
  const result = runDevelopVerification({ projectDir: process.cwd(), ...options });
  if (result.mode === 'iteration' && result.selection) {
    const report = formatTestImpactReport(result.selection);
    if (report) console.log(report);
  }
  for (const command of result.commands) {
    console.log(
      `verify-develop: ${command.classification} exit=${command.exitCode} duration=${command.durationMs}ms`
    );
  }
  if (!result.ok) {
    for (const reason of result.reasons)
      console.error(`verify-develop: ${reason.code}: ${reason.message || ''}`);
    return 1;
  }
  if (result.receipt) console.log(JSON.stringify(result.receipt));
  console.log(`verify-develop: ${result.mode} checks passed`);
  return 0;
}

if (isMainModule()) process.exitCode = main();
