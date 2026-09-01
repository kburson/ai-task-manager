// @story #1089
// cspell:ignore ABCDEFGHJKMNPQRSTVWXYZ CROCKFORD HJKMNP
// Versioned, exact-SHA verification evidence shared by Develop, Test, and Review.

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { docsKindDropsTests } from './dod-kind-filter.mjs';
import { COMPLETE_TEST_LANES } from './verification-commands.mjs';

export const VERIFICATION_RECEIPT_SCHEMA = 'aitm.verification-receipt/v1';
export const VERIFICATION_COMMAND_IDENTITIES = Object.freeze({
  'lint-full': Object.freeze({ command: 'npm', args: Object.freeze(['run', 'lint']) }),
  'format-full': Object.freeze({ command: 'npm', args: Object.freeze(['run', 'format:check']) }),
  'test-unit': Object.freeze({ command: 'npm', args: Object.freeze(['run', 'test:unit']) }),
  'test-integration': Object.freeze({
    command: 'npm',
    args: Object.freeze(['run', 'test:integration']),
  }),
  'test-slow': Object.freeze({ command: 'npm', args: Object.freeze(['run', 'test:slow']) }),
});

const TEST_RECEIPT_REQUIRED = Object.freeze([
  'lint-full',
  'format-full',
  'test-unit',
  'test-integration',
  'test-slow',
]);
// Lint and format always run. Only the complete Test lanes may be removed by
// a valid docs-only lane-skip decision.
const DROPPABLE_LANE_CLASSIFICATIONS = Object.freeze(
  COMPLETE_TEST_LANES.map(({ classification }) => classification)
);

const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const RECEIPT_MARKER_RE =
  /<!--\s*aitm-verification-receipt\s+stage="([^"]+)"\s+data="([A-Za-z0-9_-]+)"\s*-->/g;
const RECEIPT_CLAIM_RE = /<!--\s*aitm-verification-receipt\b[^>]*-->/g;
const RECEIPT_MARKER_EXACT_RE =
  /^<!--\s*aitm-verification-receipt\s+stage="([^"]+)"\s+data="([A-Za-z0-9_-]+)"\s*-->$/;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DEFAULT_CONFIG_PATHS = [
  '.markdownlint-cli2.jsonc',
  '.prettierrc.json',
  'cspell.json',
  'eslint.config.mjs',
  'package.json',
  'scripts/run-tests-lanes.mjs',
  'scripts/run-tests.mjs',
  'scripts/task-tracker/lib/test-lanes.mjs',
  'scripts/task-tracker/test-impact-manifest.json',
];

function hashFile(filePath) {
  return `sha256:${createHash('sha256').update(readFileSync(filePath)).digest('hex')}`;
}

function normalizeRelativePath(projectDir, filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError('verification-receipt: config paths must be non-empty strings');
  }
  const normalized = filePath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
    throw new TypeError(`verification-receipt: config path escapes project: ${filePath}`);
  }
  const absolute = path.resolve(projectDir, normalized);
  const relative = path.relative(projectDir, absolute).replaceAll(path.sep, '/');
  if (relative === '..' || relative.startsWith('../')) {
    throw new TypeError(`verification-receipt: config path escapes project: ${filePath}`);
  }
  return relative;
}

function isCleanWorktree(projectDir) {
  const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd: projectDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`verification-receipt: git status failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim() === '';
}

export function buildVerificationFingerprint({ projectDir, commitSha, configPaths } = {}) {
  if (!SHA_RE.test(String(commitSha || ''))) {
    throw new TypeError('verification-receipt: commitSha must be a complete 40-hex SHA');
  }
  const identity = realpathSync(projectDir);
  const lockfilePath = path.join(identity, 'package-lock.json');
  if (!existsSync(lockfilePath)) {
    throw new Error('verification-receipt: package-lock.json is required');
  }

  const paths = [
    ...new Set(
      (configPaths ?? DEFAULT_CONFIG_PATHS).map((item) => normalizeRelativePath(identity, item))
    ),
  ].sort();
  const configHashes = {};
  for (const relative of paths) {
    const absolute = path.join(identity, relative);
    if (existsSync(absolute)) configHashes[relative] = hashFile(absolute);
  }

  return {
    commitSha,
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: hashFile(lockfilePath),
      configHashes,
      sandbox: {
        kind: 'worktree',
        identity,
        clean: isCleanWorktree(identity),
      },
    },
  };
}

function encodeBase32(value, length) {
  let current = BigInt(value);
  let encoded = '';
  for (let index = 0; index < length; index += 1) {
    encoded = CROCKFORD[Number(current & 31n)] + encoded;
    current >>= 5n;
  }
  return encoded;
}

function createUlid(instant) {
  const timestamp = BigInt(Date.parse(instant));
  const randomness = BigInt(`0x${randomBytes(10).toString('hex')}`);
  return `${encodeBase32(timestamp, 10)}${encodeBase32(randomness, 16)}`;
}

function canonicalInstant(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? value : null;
}

function normalizeCommand(result) {
  const command = String(result?.command || '')
    .trim()
    .replace(/\s+/g, ' ');
  const args = Array.isArray(result?.args) ? result.args.map((arg) => String(arg)) : [];
  const normalized = {
    classification: String(result?.classification || '').trim(),
    command,
    args,
    exitCode: Number(result?.exitCode),
    durationMs: Number(result?.durationMs),
  };
  if (result?.providerId !== undefined) normalized.providerId = String(result.providerId);
  if (result?.kind !== undefined) normalized.kind = String(result.kind);
  if (result?.startedAt !== undefined) normalized.startedAt = result.startedAt;
  if (result?.completedAt !== undefined) normalized.completedAt = result.completedAt;
  if (result?.reusedFrom !== undefined) normalized.reusedFrom = result.reusedFrom;
  return normalized;
}

export function createVerificationReceipt({
  issueNumber,
  stage,
  fingerprint,
  commands,
  provider,
  executionContext,
  now = () => new Date().toISOString(),
} = {}) {
  const normalizedCommands = (commands || []).map(normalizeCommand);
  const fallback = typeof now === 'function' ? now() : now;
  const starts = normalizedCommands.map(({ startedAt }) => startedAt).filter(canonicalInstant);
  const completions = normalizedCommands
    .map(({ completedAt }) => completedAt)
    .filter(canonicalInstant);
  const startedAt = starts.length > 0 ? starts.sort()[0] : fallback;
  const completedAt = completions.length > 0 ? completions.sort().at(-1) : fallback;

  const receipt = {
    schema: VERIFICATION_RECEIPT_SCHEMA,
    receiptId: createUlid(completedAt),
    issue: Number(issueNumber),
    stage: String(stage || ''),
    commitSha: fingerprint?.commitSha,
    startedAt,
    completedAt,
    environment: structuredClone(fingerprint?.environment),
    commands: normalizedCommands,
    supersedes: null,
  };
  if (executionContext !== undefined) {
    receipt.executionContext = structuredClone(executionContext);
  }
  if (provider !== undefined) {
    receipt.provider = {
      id: String(provider?.id || ''),
      requiredClassifications: [
        ...new Set((provider?.requiredClassifications || []).map((value) => String(value))),
      ],
    };
  }
  return receipt;
}

function malformedReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return true;
  if (receipt.schema !== VERIFICATION_RECEIPT_SCHEMA || !ULID_RE.test(receipt.receiptId))
    return true;
  if (!Number.isInteger(receipt.issue) || receipt.issue <= 0) return true;
  if (typeof receipt.stage !== 'string' || receipt.stage.length === 0) return true;
  if (!SHA_RE.test(receipt.commitSha)) return true;
  if (!canonicalInstant(receipt.startedAt) || !canonicalInstant(receipt.completedAt)) return true;
  if (Date.parse(receipt.startedAt) > Date.parse(receipt.completedAt)) return true;
  if (receipt.supersedes !== null && !ULID_RE.test(receipt.supersedes)) return true;
  if (receipt.executionContext !== undefined) {
    const context = receipt.executionContext;
    if (
      !context ||
      typeof context !== 'object' ||
      Array.isArray(context) ||
      typeof context.worktreePath !== 'string' ||
      context.worktreePath.length === 0 ||
      typeof context.branch !== 'string' ||
      context.branch.length === 0 ||
      !Number.isInteger(context.boundIssue) ||
      context.boundIssue <= 0
    ) {
      return true;
    }
  }
  if (receipt.provider !== undefined) {
    const provider = receipt.provider;
    if (
      !provider ||
      typeof provider !== 'object' ||
      Array.isArray(provider) ||
      Object.keys(provider).some((key) => !['id', 'requiredClassifications'].includes(key)) ||
      !['node', 'project'].includes(provider.id) ||
      !Array.isArray(provider.requiredClassifications) ||
      provider.requiredClassifications.length === 0 ||
      provider.requiredClassifications.some(
        (classification) => typeof classification !== 'string' || classification.length === 0
      ) ||
      new Set(provider.requiredClassifications).size !== provider.requiredClassifications.length
    ) {
      return true;
    }
  }
  const environment = receipt.environment;
  if (!environment || typeof environment !== 'object') return true;
  if (typeof environment.node !== 'string' || typeof environment.platform !== 'string') return true;
  if (!HASH_RE.test(environment.lockfileHash)) return true;
  if (!environment.configHashes || typeof environment.configHashes !== 'object') return true;
  if (Object.values(environment.configHashes).some((hash) => !HASH_RE.test(hash))) return true;
  if (
    !environment.sandbox ||
    environment.sandbox.kind !== 'worktree' ||
    typeof environment.sandbox.identity !== 'string' ||
    typeof environment.sandbox.clean !== 'boolean'
  ) {
    return true;
  }
  if (!Array.isArray(receipt.commands)) return true;
  return receipt.commands.some((command) => {
    if (!command || typeof command !== 'object') return true;
    if (typeof command.classification !== 'string' || command.classification.length === 0)
      return true;
    if (typeof command.command !== 'string' || command.command.length === 0) return true;
    if (!Array.isArray(command.args) || command.args.some((arg) => typeof arg !== 'string'))
      return true;
    if (!Number.isInteger(command.exitCode)) return true;
    if (!Number.isFinite(command.durationMs) || command.durationMs < 0) return true;
    if (
      command.providerId !== undefined &&
      (!['node', 'project'].includes(command.providerId) ||
        (receipt.provider && command.providerId !== receipt.provider.id))
    )
      return true;
    if (
      command.kind !== undefined &&
      !['format', 'lint', 'build', 'test', 'environment'].includes(command.kind)
    )
      return true;
    if (command.startedAt !== undefined && !canonicalInstant(command.startedAt)) return true;
    if (command.completedAt !== undefined && !canonicalInstant(command.completedAt)) return true;
    if (command.reusedFrom !== undefined && !ULID_RE.test(command.reusedFrom)) return true;
    return false;
  });
}

export function validateVerificationReceiptStructure({
  receipt,
  expectedIssue,
  expectedStage,
} = {}) {
  const reasons = [];
  if (malformedReceipt(receipt)) reasons.push(reason('receipt-malformed'));
  if (reasons.length === 0 && expectedStage !== undefined && receipt.stage !== expectedStage) {
    reasons.push(reason('stage-mismatch', { expectedStage, actualStage: receipt.stage }));
  }
  if (
    reasons.length === 0 &&
    expectedIssue !== undefined &&
    receipt.issue !== Number(expectedIssue)
  ) {
    reasons.push(
      reason('issue-mismatch', { expectedIssue: Number(expectedIssue), actualIssue: receipt.issue })
    );
  }
  if (reasons.length === 0) {
    for (const command of receipt.commands) {
      const identity = VERIFICATION_COMMAND_IDENTITIES[command.classification];
      if (
        identity &&
        (command.command !== identity.command ||
          canonicalRecordJson(command.args) !== canonicalRecordJson(identity.args))
      ) {
        reasons.push(
          reason('command-identity-mismatch', { classification: command.classification })
        );
      }
    }
  }
  return { ok: reasons.length === 0, reasons, receipt };
}

function nodeMajor(version) {
  return String(version || '').match(/^v?(\d+)/)?.[1] ?? null;
}

function reason(code, details = {}) {
  return { code, ...details };
}

/**
 * Derive the command classifications required by a canonical Test receipt.
 * Default-deny: malformed or unearned lane-skip claims relax nothing.
 */
export function requiredTestReceiptClassifications(receipt) {
  if (receipt?.provider?.requiredClassifications) {
    return [...receipt.provider.requiredClassifications];
  }
  const laneSkip = receipt?.laneSkip;
  if (!laneSkip || typeof laneSkip !== 'object' || Array.isArray(laneSkip)) {
    return [...TEST_RECEIPT_REQUIRED];
  }
  if (laneSkip.reason !== 'docs-only-diff') return [...TEST_RECEIPT_REQUIRED];
  if (!docsKindDropsTests(laneSkip.kind, laneSkip.changedPaths)) {
    return [...TEST_RECEIPT_REQUIRED];
  }
  const dropped = new Set(
    (Array.isArray(laneSkip.lanes) ? laneSkip.lanes : []).filter((classification) =>
      DROPPABLE_LANE_CLASSIFICATIONS.includes(classification)
    )
  );
  return TEST_RECEIPT_REQUIRED.filter((classification) => !dropped.has(classification));
}

export function hasEarnedDocsOnlyLaneSkip(receipt) {
  const laneSkip = receipt?.laneSkip;
  if (!laneSkip || typeof laneSkip !== 'object' || Array.isArray(laneSkip)) return false;
  if (laneSkip.reason !== 'docs-only-diff') return false;
  if (!docsKindDropsTests(laneSkip.kind, laneSkip.changedPaths)) return false;
  const dropped = new Set(Array.isArray(laneSkip.lanes) ? laneSkip.lanes : []);
  return DROPPABLE_LANE_CLASSIFICATIONS.every((classification) => dropped.has(classification));
}

export function validateVerificationReceipt({
  receipt,
  expectedIssue,
  expectedStage,
  fingerprint,
  required = [],
} = {}) {
  const reasons = [];
  if (malformedReceipt(receipt)) {
    return { ok: false, reusableCommands: [], reasons: [reason('receipt-malformed')], receipt };
  }
  if (receipt.stage !== expectedStage)
    reasons.push(reason('stage-mismatch', { expectedStage, actualStage: receipt.stage }));
  if (expectedIssue !== undefined && receipt.issue !== Number(expectedIssue)) {
    reasons.push(
      reason('issue-mismatch', { expectedIssue: Number(expectedIssue), actualIssue: receipt.issue })
    );
  }
  if (receipt.commitSha !== fingerprint?.commitSha) reasons.push(reason('sha-mismatch'));
  if (nodeMajor(receipt.environment.node) !== nodeMajor(fingerprint?.environment?.node)) {
    reasons.push(reason('node-major-mismatch'));
  }
  if (receipt.environment.platform !== fingerprint?.environment?.platform) {
    reasons.push(reason('platform-mismatch'));
  }
  if (receipt.environment.lockfileHash !== fingerprint?.environment?.lockfileHash) {
    reasons.push(reason('lockfile-mismatch'));
  }
  if (
    canonicalRecordJson(receipt.environment.configHashes) !==
    canonicalRecordJson(fingerprint?.environment?.configHashes || {})
  ) {
    reasons.push(reason('config-mismatch'));
  }
  if (
    receipt.environment.sandbox.clean !== true ||
    fingerprint?.environment?.sandbox?.clean !== true
  ) {
    reasons.push(reason('sandbox-dirty'));
  }

  const grouped = new Map();
  for (const command of receipt.commands) {
    const matches = grouped.get(command.classification) || [];
    matches.push(command);
    grouped.set(command.classification, matches);
    const identity = VERIFICATION_COMMAND_IDENTITIES[command.classification];
    if (
      identity &&
      (command.command !== identity.command ||
        canonicalRecordJson(command.args) !== canonicalRecordJson(identity.args))
    ) {
      reasons.push(
        reason('command-identity-mismatch', {
          classification: command.classification,
          expected: [identity.command, ...identity.args].join(' '),
          actual: [command.command, ...command.args].join(' '),
        })
      );
    }
  }
  const reusableCommands = [];
  for (const classification of [...new Set(required)]) {
    const matches = grouped.get(classification) || [];
    if (matches.length === 0) reasons.push(reason('command-missing', { classification }));
    if (matches.length > 1) reasons.push(reason('command-duplicate', { classification }));
    if (matches.length === 1 && matches[0].exitCode !== 0) {
      reasons.push(reason('command-red', { classification, exitCode: matches[0].exitCode }));
    }
    if (matches.length === 1 && matches[0].exitCode === 0) reusableCommands.push(matches[0]);
  }
  for (const [classification, matches] of grouped) {
    if (matches.length > 1 && !required.includes(classification)) {
      reasons.push(reason('command-duplicate', { classification }));
    }
    if (matches.some(({ exitCode }) => exitCode !== 0) && !required.includes(classification)) {
      reasons.push(reason('command-red', { classification }));
    }
  }
  return { ok: reasons.length === 0, reusableCommands, reasons, receipt };
}

function serializeReceiptMarker(receipt) {
  const data = Buffer.from(canonicalRecordJson(receipt)).toString('base64url');
  return `<!-- aitm-verification-receipt stage="${receipt.stage}" data="${data}" -->`;
}

export function parseVerificationReceipts(body) {
  const receipts = [];
  for (const match of String(body || '').matchAll(RECEIPT_MARKER_RE)) {
    try {
      const receipt = JSON.parse(Buffer.from(match[2], 'base64url').toString('utf8'));
      if (receipt.stage === match[1]) receipts.push(receipt);
    } catch {
      // Malformed markers are not evidence. Consumers validate the null result.
    }
  }
  return receipts;
}

export function parseValidatedVerificationReceipts(body, { expectedIssue } = {}) {
  const receipts = [];
  for (const claim of String(body || '').match(RECEIPT_CLAIM_RE) ?? []) {
    const match = claim.match(RECEIPT_MARKER_EXACT_RE);
    if (!match) throw new TypeError('verification-receipt: malformed claimed marker');
    let receipt;
    try {
      receipt = JSON.parse(Buffer.from(match[2], 'base64url').toString('utf8'));
    } catch {
      throw new TypeError('verification-receipt: malformed claimed payload');
    }
    const validation = validateVerificationReceiptStructure({
      receipt,
      expectedIssue,
      expectedStage: match[1],
    });
    if (!validation.ok) {
      throw new TypeError(
        `verification-receipt: invalid claimed evidence (${validation.reasons
          .map(({ code }) => code)
          .join(',')})`
      );
    }
    receipts.push(receipt);
  }
  return receipts;
}

export function hasVerificationReceiptMarker(body, stage) {
  for (const match of String(body || '').matchAll(RECEIPT_MARKER_RE)) {
    if (stage === undefined || match[1] === stage) return true;
  }
  return false;
}

export function parseVerificationReceipt(body, stage) {
  const receipts = parseVerificationReceipts(body);
  const matching =
    stage === undefined ? receipts : receipts.filter((receipt) => receipt.stage === stage);
  return matching.at(-1) ?? null;
}

export function upsertVerificationReceipt(body, receipt) {
  if (malformedReceipt(receipt)) {
    throw new TypeError('verification-receipt: cannot persist malformed receipt');
  }
  const src = String(body || '');
  const prior = parseVerificationReceipt(src, receipt.stage);
  if (prior && canonicalRecordJson(prior) === canonicalRecordJson(receipt)) return src;

  const next = structuredClone(receipt);
  if (prior?.receiptId && prior.receiptId !== next.receiptId) next.supersedes = prior.receiptId;
  let withoutStage = src.replace(RECEIPT_MARKER_RE, (marker, stage) =>
    stage === next.stage ? '' : marker
  );
  withoutStage = withoutStage.replace(/\n{3,}/g, '\n\n');
  const marker = serializeReceiptMarker(next);
  const fieldsIndex = withoutStage.indexOf('<!-- aitm-fields:');
  if (fieldsIndex >= 0) {
    const before = withoutStage.slice(0, fieldsIndex).trimEnd();
    const fields = withoutStage.slice(fieldsIndex);
    return `${before}\n${marker}\n\n${fields}`;
  }
  return `${withoutStage.trimEnd()}\n\n${marker}\n`;
}
