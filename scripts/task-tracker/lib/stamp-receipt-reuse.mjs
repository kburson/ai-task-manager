// #1356 — decide whether dod-stamp / ac-stamp may spawn a verifier.
//
// A valid exact-SHA Test receipt already owns standard lanes. Re-executing
// them in Test (after the sandbox) or Review is wasted wall-clock.

import { parseVerificationReceipt } from './verification-receipt.mjs';
import { defaultGetLiveState } from './verifier-state-gate.mjs';

const SUITE_COMMAND_RE = /^(?:npm\s+test|npm\s+run\s+test(?::(?:all|slow|unit|integration))?)$/;
const RESTRICTED_BEFORE_TEST_RE = /\bnpm\s+run\s+test:(all|slow)\b/;

function normalizeCommand(cmd) {
  return String(cmd || '')
    .trim()
    .replace(/^`+|`+$/g, '')
    .replace(/\s+/g, ' ');
}

function greenByClassification(receipt, classification) {
  const matches = (receipt?.commands || []).filter(
    (entry) => entry.classification === classification && Number(entry.exitCode) === 0
  );
  return matches.length === 1;
}

function exactCommandGreen(receipt, command) {
  const tokens = normalizeCommand(command).split(' ');
  if (tokens.length === 0 || tokens[0] === '') return false;
  const [bin, ...args] = tokens;
  return (receipt?.commands || []).some(
    (entry) =>
      Number(entry.exitCode) === 0 &&
      entry.command === bin &&
      Array.isArray(entry.args) &&
      entry.args.length === args.length &&
      entry.args.every((arg, i) => arg === args[i])
  );
}

export function isStandardSuiteCommand(cmd) {
  return SUITE_COMMAND_RE.test(normalizeCommand(cmd));
}

export function commandCoveredByReceipt(cmd, receipt) {
  if (!receipt || !Array.isArray(receipt.commands)) return false;
  const command = normalizeCommand(cmd);
  if (command === 'npm test') {
    return (
      greenByClassification(receipt, 'test-unit') &&
      greenByClassification(receipt, 'test-integration')
    );
  }
  if (command === 'npm run test:all') {
    return (
      greenByClassification(receipt, 'test-unit') &&
      greenByClassification(receipt, 'test-integration') &&
      greenByClassification(receipt, 'test-slow')
    );
  }
  const classified = {
    'npm run lint': 'lint-full',
    'npm run format:check': 'format-full',
    'npm run test:unit': 'test-unit',
    'npm run test:integration': 'test-integration',
    'npm run test:slow': 'test-slow',
  }[command];
  if (classified) return greenByClassification(receipt, classified);
  return exactCommandGreen(receipt, command);
}

function receiptMatchesHead(receipt, headSha) {
  return Boolean(
    receipt &&
    typeof receipt.commitSha === 'string' &&
    receipt.commitSha === headSha &&
    receipt.stage === 'test'
  );
}

function allCovered(commands, receipt) {
  return commands.length > 0 && commands.every((cmd) => commandCoveredByReceipt(cmd, receipt));
}

export function resolveStampExecution({
  commands = [],
  liveState,
  receipt = null,
  headSha = '',
} = {}) {
  const list = (Array.isArray(commands) ? commands : []).map(normalizeCommand).filter(Boolean);
  const hasSuite = list.some(isStandardSuiteCommand);
  const matched = receiptMatchesHead(receipt, headSha);

  if (matched && allCovered(list, receipt)) {
    return { action: 'reuse' };
  }

  if (liveState === 'review' || liveState === 'done') {
    if (hasSuite) {
      return {
        action: 'refuse',
        message:
          `standard suite command(s) [${list.filter(isStandardSuiteCommand).join(', ')}] ` +
          `cannot run in \`${liveState}\`. Demote and run \`/task test\` to produce a ` +
          `valid exact-SHA Test receipt, then retry.`,
      };
    }
  }

  if (liveState !== 'test' && liveState !== 'review' && liveState !== 'done') {
    const restricted = list.filter((cmd) => RESTRICTED_BEFORE_TEST_RE.test(cmd));
    if (restricted.length) {
      return {
        action: 'refuse',
        message:
          `restricted verifier command(s) [${restricted.join(', ')}] require the issue ` +
          `to be in \`test\` (current: \`${liveState ?? 'unknown'}\`). Run \`/task promote\` ` +
          `to reach \`test\`, where a sandboxed suite run is the sanctioned path.`,
      };
    }
  }

  return { action: 'run' };
}

export async function decideStampExecutionFromEnv({
  commands,
  body,
  issueNumber,
  cfg,
  pexec,
  projectDir,
  deps = {},
} = {}) {
  const receipt = parseVerificationReceipt(body, 'test');
  let headSha = '';
  try {
    const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], { cwd: projectDir });
    headSha = String(stdout || '').trim();
  } catch {
    headSha = '';
  }
  const reuse = resolveStampExecution({
    commands,
    liveState: 'test',
    receipt,
    headSha,
  });
  if (reuse.action === 'reuse') {
    return { live: 'test', receipt, headSha, action: 'reuse' };
  }

  let live = null;
  try {
    const getLiveState = deps.getLiveState || defaultGetLiveState;
    live = await getLiveState({ issueNumber, cfg });
  } catch {
    return { live: null, receipt, headSha, action: 'run' };
  }
  return {
    live,
    receipt,
    headSha,
    ...resolveStampExecution({
      commands,
      liveState: live,
      receipt,
      headSha,
    }),
  };
}
