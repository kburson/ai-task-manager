#!/usr/bin/env node
import { enforceDirectGuidance } from './lib/direct-guidance-admission.mjs';
enforceDirectGuidance(import.meta.url, 'verify-develop');
// @story #447 #448 #529 #855 #867 #1089
// Stage-aware Develop verification. Iteration is fast and affected-only;
// finalization is clean-tree, exact-SHA, and receipt-producing.

import { execFileSync, spawnSync } from 'node:child_process';
import { realpathSync, readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { loadConfig } from './config.mjs';
import {
  buildVerificationFingerprint,
  createVerificationReceipt,
  canonicalVerificationCommandSet,
} from './lib/verification-receipt.mjs';
import { formatTestImpactReport } from './lib/test-impact-selector.mjs';
import { resolveVerificationProvider } from './lib/verification-provider-registry.mjs';
import { currentRevisionExecutionScope } from './lib/criteria-revision/policy.mjs';
import { canonicalRecordJson } from './lib/github-records/canonical-json.mjs';
import { parseVerificationCommands } from './lib/verification-commands.mjs';
import { captureEvidenceProvenance } from './lib/evidence-provenance.mjs';
import { getActiveTask } from './session-state.mjs';
import { currentSessionId } from './word-counter.mjs';
const nativeFinalExecutions = new WeakMap();
const nativeEqual = (left, right) => canonicalRecordJson(left) === canonicalRecordJson(right);

function nativeConfiguration(projectDir) {
  const projectPath = path.join(projectDir, '.ai-task-manager', 'task-tracker.json');
  const legacyProjectPath = path.join(projectDir, '.claude', 'task-tracker.json');
  const pairs = [[projectPath, legacyProjectPath],
    [path.join(os.homedir(), '.ai-task-manager', 'task-tracker-config.json'), path.join(os.homedir(), '.claude', 'task-tracker-config.json')]];
  for (const pair of pairs) for (const file of pair) {
    try { lstatSync(file); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('native-final-configuration');
    break;
  }
  const cfg = loadConfig({ projectPath, legacyProjectPath });
  return { repository: cfg.repo, configuration: {
    verificationProvider: cfg.verificationProvider ?? null,
    developVerification: cfg.developVerification ?? null,
  } };
}
function nativeFinalContext({ projectDir, issueNumber, verificationCommands, verificationProvider, developVerification, deps }) {
  const scope = currentRevisionExecutionScope();
  if (!scope) return null;
  if (Object.keys(deps).length || scope.observation.sourceKind !== 'legacy-body' ||
      path.resolve(projectDir) !== scope.executor.worktree || Number(issueNumber) !== scope.binding.issue ||
      currentSessionId() !== scope.executor.sessionId) throw new Error('native-final-scope');
  const task = getActiveTask(currentSessionId(), projectDir);
  if (String(task?.issue).replace(/^#/, '') !== String(issueNumber) || !task?.entryStartTs || task.paused ||
      !Number.isFinite(Date.parse(task.entryStartTs)) || task.worktreePath !== scope.executor.worktree ||
      task.worktreeBranch !== scope.executor.branch) throw new Error('native-final-timed-binding');
  const selected = nativeConfiguration(scope.executor.worktree);
  if (selected.repository !== scope.binding.repository ||
      (verificationProvider !== undefined && !nativeEqual(verificationProvider, selected.configuration.verificationProvider)) ||
      (developVerification !== undefined && !nativeEqual(developVerification, selected.configuration.developVerification)))
    throw new Error('native-final-configuration');
  const actualCommands = parseVerificationCommands(scope.observation.body.bytes);
  if (!nativeEqual(canonicalVerificationCommandSet(verificationCommands, { projectDir }),
      canonicalVerificationCommandSet(actualCommands, { projectDir }))) throw new Error('native-final-declarations');
  const plan = resolveVerificationProvider({ projectDir, config: selected.configuration.verificationProvider ?? undefined,
    legacyDevelopVerification: selected.configuration.developVerification ?? undefined }).planDevelopFinal();
  const fingerprint = buildVerificationFingerprint({ projectDir, commitSha: gitHead(projectDir), verificationCommands: actualCommands });
  const provenance = captureEvidenceProvenance({ projectDir, boundIssue: issueNumber });
  if (!gitClean(projectDir) || provenance.worktreePath !== scope.executor.worktree || provenance.branch !== scope.executor.branch)
    throw new Error('native-final-provenance');
  return structuredClone({ scope, configuration: selected.configuration, plan, fingerprint, provenance });
}
// A historical execution is checked against the genuine current held native
// context. This assertion issues no token, capability, or readiness value.
export function assertCurrentNativeDevelopExecution(execution) {
  const current = nativeFinalContext({ projectDir: execution.scope.executor.worktree,
    issueNumber: execution.binding.issue,
    verificationCommands: parseVerificationCommands(execution.scope.observation.body.bytes), deps: {} });
  if (!current || !nativeEqual(current.scope, execution.scope)) throw new Error('native-final-execution-scope');
  for (const key of ['configuration', 'plan', 'fingerprint', 'provenance'])
    if (!nativeEqual(current[key], execution[key])) throw new Error('native-final-execution-drift');
}
// Read-only opaque token reader; serialized results cannot register execution.
export function readNativeDevelopExecution(token) {
  const value = nativeFinalExecutions.get(token);
  if (!value || !nativeEqual(value.scope, currentRevisionExecutionScope())) throw new Error('native-final-token');
  const current = nativeFinalContext({ projectDir: value.scope.executor.worktree, issueNumber: value.binding.issue,
    verificationCommands: parseVerificationCommands(value.scope.observation.body.bytes), deps: {} });
  for (const key of ['configuration', 'plan', 'fingerprint', 'provenance'])
    if (!nativeEqual(current[key], value[key])) throw new Error('native-final-execution-drift');
  return structuredClone(value);
}


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
      allowlistSource: 'core',
    });
  }
  if (formattable.length > 0) {
    steps.push({
      classification: 'format-affected-fix',
      command: 'npx',
      args: ['prettier', '--write', ...formattable],
      label: `prettier --write (${formattable.length} changed file(s))`,
      allowlistSource: 'core',
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
      allowlistSource: 'core',
    },
    {
      classification: 'format-full',
      command: 'npm',
      args: ['run', 'format:check'],
      label: 'npm run format:check',
      allowlistSource: 'core',
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
    ...(step.providerId ? { providerId: step.providerId } : {}),
    ...(step.kind ? { kind: step.kind } : {}),
    command: step.command,
    args: [...step.args],
    ...(step.label ? { label: step.label } : {}),
    ...(step.allowlistSource ? { allowlistSource: step.allowlistSource } : {}),
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
    ...(command.providerId ? { providerId: command.providerId } : {}),
    ...(command.kind ? { kind: command.kind } : {}),
    exitCode: command.exitCode,
    message: `${command.command} ${command.args.join(' ')} exited ${command.exitCode}`,
  };
}

export function runDevelopVerification({
  projectDir = process.cwd(),
  mode = 'iteration',
  issueNumber,
  developVerification,
  verificationProvider,
  verificationCommands = [],
  deps = {},
} = {}) {
  if (!['iteration', 'final'].includes(mode)) {
    return { ok: false, mode, commands: [], reasons: [{ code: 'invalid-mode' }] };
  }
  let native = null;
  if (mode === 'final') {
    try { native = nativeFinalContext({ projectDir, issueNumber, verificationCommands, verificationProvider, developVerification, deps }); }
    catch (error) { return { ok: false, mode, commands: [], reasons: [{ code: 'native-final-authority', message: error.message }] }; }
    if (native) {
      verificationProvider = native.configuration.verificationProvider ?? undefined;
      developVerification = native.configuration.developVerification ?? undefined;
    }
  }
  const runCommand = deps.runCommand || defaultRunCommand;
  const getHeadSha = deps.getHeadSha || gitHead;
  const isClean = deps.isClean || gitClean;
  const commands = [];
  let provider;
  try {
    provider = (deps.resolveProvider || resolveVerificationProvider)({
      config: verificationProvider,
      projectDir,
      legacyDevelopVerification: developVerification,
      deps,
    });
  } catch (error) {
    const message = error?.message || String(error);
    const code = message.startsWith('verification-provider-invalid:')
      ? 'verification-provider-invalid'
      : 'verification-provider-error';
    return { ok: false, mode, commands, reasons: [{ code, message }] };
  }

  if (mode === 'iteration') {
    try {
      const changedPaths = (deps.collectChangedPaths || collectChangedPaths)({ cwd: projectDir });
      if (changedPaths.length === 0) {
        return {
          ok: true,
          mode,
          changedPaths,
          commands,
          reasons: [{ code: 'no-changes' }],
        };
      }

      const plan = provider.planDevelopIteration({ changedPaths });
      const selection = plan.selection;
      const steps = plan.steps;
      if (steps.length === 0) {
        return {
          ok: false,
          mode,
          changedPaths,
          ...(selection ? { selection } : {}),
          commands,
          reasons: [
            {
              code: 'iteration-no-commands',
              message: 'non-empty changeset produced no executable Develop verification steps',
            },
          ],
        };
      }
      for (const step of steps) {
        const command = execute({ ...step, providerId: plan.providerId }, projectDir, runCommand);
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
      return {
        ok: true,
        mode,
        changedPaths,
        ...(selection ? { selection } : {}),
        commands,
        reasons: [],
      };
    } catch (error) {
      const message = error?.message || String(error);
      const configInvalid = message.startsWith('iteration-config-invalid:');
      const providerInvalid = message.startsWith('verification-provider-invalid:');
      return {
        ok: false,
        mode,
        commands,
        reasons: [
          {
            code: providerInvalid
              ? 'verification-provider-invalid'
              : configInvalid
                ? 'iteration-config-invalid'
                : 'iteration-error',
            message,
          },
        ],
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
  let finalPlan;
  try {
    finalPlan = provider.planDevelopFinal();
  } catch (error) {
    const message = error?.message || String(error);
    return {
      ok: false,
      mode,
      commands,
      reasons: [
        {
          code: message.startsWith('verification-provider-invalid:')
            ? 'verification-provider-invalid'
            : 'verification-provider-error',
          message,
        },
      ],
    };
  }
  for (const step of finalPlan.steps) {
    const command = execute({ ...step, providerId: finalPlan.providerId }, projectDir, runCommand);
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
      verificationCommands,
    });
    const receipt = (deps.createReceipt || createVerificationReceipt)({
      issueNumber: Number(issueNumber),
      stage: 'develop-final',
      fingerprint,
      commands,
      ...(native ? { executionContext: native.provenance } : {}),
      provider: {
        id: finalPlan.providerId,
        requiredClassifications: finalPlan.requiredClassifications,
      },
      now: deps.now,
    });
    const result = { ok: true, mode, commands, reasons: [], fingerprint, receipt };
    if (native) {
      const after = nativeFinalContext({ projectDir, issueNumber, verificationCommands, verificationProvider, developVerification, deps });
      if (!nativeEqual(native, after) || !nativeEqual(fingerprint, native.fingerprint) || !nativeEqual(finalPlan, native.plan))
        throw new Error('native-final-execution-drift');
      const token = Object.freeze({});
      nativeFinalExecutions.set(token, structuredClone({ schema: 'aitm.native-develop-final-execution/v1',
        ...native, binding: native.scope.binding, commands, receipt }));
      result.nativeExecutionToken = token;
    }
    return result;
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
  const config = loadConfig();
  const developVerification = options.mode === 'iteration' ? config.developVerification : null;
  const result = runDevelopVerification({
    projectDir: process.cwd(),
    ...options,
    developVerification,
    verificationProvider: config.verificationProvider,
  });
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
