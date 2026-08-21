// #1356 — decide whether dod-stamp / ac-stamp may spawn a verifier.
//
// A valid exact-SHA Test receipt already owns standard lanes. Re-executing
// them in Test (after the sandbox) or Review is wasted wall-clock.

import {
  buildVerificationFingerprint,
  parseVerificationReceipt,
  requiredTestReceiptClassifications,
  validateVerificationReceipt,
} from './verification-receipt.mjs';
import { splitCmd } from './evidence-runner.mjs';
import { defaultGetLiveState } from './verifier-state-gate.mjs';

const SUITE_COMMAND_RE = /^(?:npm\s+test|npm\s+run\s+test(?::(?:all|slow|unit|integration))?)$/;
const RESTRICTED_BEFORE_TEST_RE = /\bnpm\s+run\s+test:(all|slow)\b/;
const KNOWN_STATES = new Set([
  'backlog',
  'assigned',
  'refine',
  'ready-for-plan',
  'plan',
  'develop',
  'test',
  'review',
  'done',
]);

function stripCommand(cmd) {
  return String(cmd || '')
    .trim()
    .replace(/^`+|`+$/g, '');
}

function normalizeCommand(cmd) {
  return stripCommand(cmd).replace(/\s+/g, ' ');
}

function greenByClassification(receipt, classification) {
  const matches = (receipt?.commands || []).filter(
    (entry) => entry.classification === classification && Number(entry.exitCode) === 0
  );
  return matches.length === 1;
}

function exactCommandGreen(receipt, command) {
  const tokens = splitCmd(stripCommand(command));
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
  const literalCommand = stripCommand(cmd);
  const command = normalizeCommand(literalCommand);
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
  return exactCommandGreen(receipt, literalCommand);
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
  issueNumber,
  fingerprint,
} = {}) {
  const list = (Array.isArray(commands) ? commands : []).map(stripCommand).filter(Boolean);
  const validation = validateVerificationReceipt({
    receipt,
    expectedIssue: Number(issueNumber),
    expectedStage: 'test',
    fingerprint,
    required: requiredTestReceiptClassifications(receipt),
  });
  const matched =
    fingerprint?.commitSha === headSha && receiptMatchesHead(receipt, headSha) && validation.ok;

  if (!KNOWN_STATES.has(liveState)) {
    return {
      action: 'refuse',
      message: `live issue state is unavailable or unknown; verifier execution is refused until state authority is restored.`,
    };
  }

  if (['test', 'review', 'done'].includes(liveState) && matched && allCovered(list, receipt)) {
    return { action: 'reuse' };
  }

  if (liveState === 'done') {
    return {
      action: 'refuse',
      message:
        `verifier command(s) [${list.join(', ')}] cannot run in \`done\`. ` +
        `Done evidence is immutable; verifier execution is refused.`,
    };
  }

  if (liveState === 'review') {
    return {
      action: 'refuse',
      message:
        `verifier command(s) [${list.join(', ')}] cannot run in \`${liveState}\`. ` +
        `Demote and run \`/task test\` to produce a valid exact-SHA Test receipt, then retry.`,
    };
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
  let fingerprint = null;
  try {
    const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], { cwd: projectDir });
    headSha = String(stdout || '').trim();
    const buildFingerprint = deps.buildFingerprint || buildVerificationFingerprint;
    fingerprint = await buildFingerprint({ projectDir, commitSha: headSha });
  } catch {
    headSha = '';
    fingerprint = null;
  }
  let live = null;
  try {
    const getLiveState = deps.getLiveState || defaultGetLiveState;
    live = await getLiveState({ issueNumber, cfg });
  } catch {
    return {
      live: null,
      receipt,
      headSha,
      action: 'refuse',
      message: 'live issue state could not be resolved; verifier execution is refused.',
    };
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
      issueNumber,
      fingerprint,
    }),
  };
}
