// @story #1295

import { createHash } from 'node:crypto';
import {
  existsSync,
  accessSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findMainWorktreePath } from '../fleet-registry.mjs';
import { configPath, statePath } from '../paths.mjs';
import { createRecordId } from './github-records/record-envelope.mjs';
import {
  assertNoCredentialValues,
  assertNoSecretRecordData,
} from './github-records/record-secret-policy.mjs';

export const ACTION_CAPTURE_SCHEMA = 'aitm.github-action-capture/v1';

const mutation = (mutationKind) => ({ operationClass: 'mutation', mutationKind });
const read = () => ({ operationClass: 'read', mutationKind: null });

function hasAny(args, flags) {
  return flags.some((flag) => args.includes(flag));
}

function classifyIssueEdit(args) {
  if (hasAny(args, ['--body', '--body-file'])) return mutation('issue-body');
  if (args.includes('--title')) return mutation('issue-title');
  if (hasAny(args, ['--add-label', '--remove-label'])) return mutation('issue-labels');
  if (hasAny(args, ['--add-assignee', '--remove-assignee'])) return mutation('issue-ownership');
  return mutation('issue-edit');
}

function graphqlDocument(args, stdin) {
  try {
    const parsed = JSON.parse(Buffer.from(stdin || []).toString('utf8'));
    if (typeof parsed?.query === 'string') return parsed.query;
  } catch {
    // Non-JSON stdin is handled by the argument forms below.
  }
  for (let index = 0; index < args.length; index += 1) {
    if (['-f', '-F', '--field', '--raw-field'].includes(args[index])) {
      const value = args[index + 1] || '';
      if (value.startsWith('query=')) return value.slice('query='.length);
    }
    if (args[index].startsWith('query=')) return args[index].slice('query='.length);
  }
  return '';
}

function classifyApi(args, stdin) {
  const isGraphql = args[1] === 'graphql';
  if (isGraphql) {
    const document = graphqlDocument(args, stdin);
    return /^\s*mutation\b/i.test(document) ? mutation('graphql') : read();
  }

  const methodFlag = args.findIndex((arg) => arg === '-X' || arg === '--method');
  const method = methodFlag >= 0 ? String(args[methodFlag + 1] || '').toUpperCase() : 'GET';
  const hasFields = hasAny(args, ['-f', '-F', '--field', '--raw-field']);
  return method !== 'GET' || hasFields ? mutation('rest') : read();
}

export function classifyGhCall(inputArgs = [], stdin = Buffer.alloc(0)) {
  const args = inputArgs.map(String);
  const [command, subcommand] = args;

  if (command === 'issue') {
    if (subcommand === 'create') return mutation('issue-create');
    if (subcommand === 'edit') return classifyIssueEdit(args);
    if (subcommand === 'comment') return mutation('issue-comment');
    if (subcommand === 'close') return mutation('issue-close');
    if (subcommand === 'reopen') return mutation('issue-reopen');
  }
  if (
    command === 'project' &&
    ['item-add', 'item-archive', 'item-delete', 'item-edit'].includes(subcommand)
  ) {
    return mutation('project');
  }
  if (command === 'api') return classifyApi(args, stdin);
  return read();
}

function repositorySlug(repository) {
  const value = String(repository || '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new TypeError(`action-capture: invalid repository "${value}"`);
  }
  return value.replace('/', '__');
}

function issueNumber(issue) {
  const value = Number(issue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`action-capture: invalid issue "${issue}"`);
  }
  return value;
}

function dependency(deps, name, fallback) {
  return typeof deps?.[name] === 'function' ? deps[name] : fallback;
}

export function actionCaptureRoot(projectDir, deps = {}) {
  const findMain = dependency(deps, 'findMainWorktreePath', findMainWorktreePath);
  return path.join(findMain(projectDir), '.tmp', 'aitm', 'action-capture');
}

function enablementPath({ projectDir, repository, issue }, deps = {}) {
  return path.join(
    actionCaptureRoot(projectDir, deps),
    'enabled',
    repositorySlug(repository),
    `issue-${issueNumber(issue)}.json`
  );
}

export function captureIssueDir({ projectDir, repository, issue }, deps = {}) {
  return path.join(
    actionCaptureRoot(projectDir, deps),
    'repositories',
    repositorySlug(repository),
    `issue-${issueNumber(issue)}`
  );
}

function atomicWrite(filePath, bytes) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${createHash('sha256')
    .update(String(Date.now()) + Math.random())
    .digest('hex')
    .slice(0, 12)}.tmp`;
  writeFileSync(temporaryPath, bytes);
  renameSync(temporaryPath, filePath);
}

function atomicJson(filePath, value) {
  atomicWrite(filePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}

export function isActionCaptureEnabled(context, deps = {}) {
  return existsSync(enablementPath(context, deps));
}

export function setActionCaptureEnabled(context, deps = {}) {
  const markerPath = enablementPath(context, deps);
  if (!context.enabled) {
    rmSync(markerPath, { force: true });
    return { enabled: false, markerPath };
  }
  atomicJson(markerPath, {
    schema: ACTION_CAPTURE_SCHEMA,
    repository: context.repository,
    issue: issueNumber(context.issue),
    enabledAt: (deps.now?.() || new Date()).toISOString(),
  });
  return { enabled: true, markerPath };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function resolveExecutable(name, searchPath) {
  for (const directory of String(searchPath || '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Continue through PATH.
    }
  }
  throw new Error(`action-capture: could not resolve ${name} on PATH`);
}

function activeIssue(value) {
  const match = String(value || '').match(/^#?(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function prepareActionCaptureEnv(
  { env = process.env, cwd = process.cwd(), command = '' },
  deps = {}
) {
  try {
    const config = readJson(configPath(cwd));
    const state = readJson(statePath(cwd));
    const issue = activeIssue(state.active);
    if (!config.repo || !issue) return env;
    const context = { projectDir: cwd, repository: config.repo, issue };
    if (!isActionCaptureEnabled(context, deps)) return env;

    const resolveGh = dependency(deps, 'resolveGh', (searchPath) =>
      resolveExecutable('gh', searchPath)
    );
    const realGh = env.AITM_CAPTURE_REAL_GH || resolveGh(env.PATH);
    const shimDir =
      deps.shimDir || fileURLToPath(new URL('../action-capture-bin', import.meta.url));
    const pathEntries = String(env.PATH || '').split(path.delimiter);
    const capturePath =
      pathEntries[0] === shimDir ? env.PATH || '' : [shimDir, env.PATH || ''].join(path.delimiter);
    const newRecordId = dependency(deps, 'createRecordId', createRecordId);
    return {
      ...env,
      PATH: capturePath,
      AITM_CAPTURE_REAL_GH: realGh,
      AITM_CAPTURE_PROJECT_DIR: cwd,
      AITM_CAPTURE_REPOSITORY: config.repo,
      AITM_CAPTURE_ISSUE: String(issue),
      AITM_CAPTURE_INVOCATION_ID: newRecordId(),
      AITM_CAPTURE_COMMAND: String(command),
    };
  } catch (error) {
    deps.warn?.(`aitm: action capture unavailable; continuing without capture: ${error.message}\n`);
    return env;
  }
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canStore(bytes) {
  try {
    assertNoCredentialValues(bytes.toString('utf8'));
    return true;
  } catch {
    return false;
  }
}

function writePayload(actionDir, fileName, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  const stored = bytes.length > 0 && canStore(bytes);
  if (stored) atomicWrite(path.join(actionDir, fileName), bytes);
  return {
    bytes: bytes.length,
    sha256: sha256(bytes),
    stored,
    redacted: bytes.length > 0 && !stored,
    file: stored ? fileName : null,
  };
}

function allocateSequence(issueDir) {
  mkdirSync(issueDir, { recursive: true });
  const sequencePath = path.join(issueDir, '.sequence');
  const lockPath = `${sequencePath}.lock`;
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 30_000) rmSync(lockPath, { recursive: true });
      } catch {
        // Another process may have released the lock between checks.
      }
      if (Date.now() >= deadline) throw new Error(`action-capture: lock timeout on ${lockPath}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    let previous = 0;
    try {
      previous = Number.parseInt(readFileSync(sequencePath, 'utf8'), 10) || 0;
    } catch {
      // The first allocation has no counter file.
    }
    const sequence = previous + 1;
    atomicWrite(sequencePath, Buffer.from(`${sequence}\n`));
    return sequence;
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function safeMetadata(value) {
  const candidate = value && typeof value === 'object' ? value : {};
  try {
    assertNoSecretRecordData(candidate);
    return candidate;
  } catch {
    return { redacted: true };
  }
}

export function beginCapturedAction(context, deps = {}) {
  const repository = String(context.repository);
  const issue = issueNumber(context.issue);
  const issueDir = captureIssueDir(context, deps);
  const sequence = allocateSequence(issueDir);
  const newRecordId = dependency(deps, 'createRecordId', createRecordId);
  const actionId = newRecordId();
  const actionDir = path.join(issueDir, `${String(sequence).padStart(6, '0')}-${actionId}`);
  const pendingDir = `${actionDir}.pending-${process.pid}`;
  mkdirSync(pendingDir, { recursive: false });

  const args = Array.isArray(context.args) ? context.args.map(String) : [];
  const stdin = Buffer.isBuffer(context.stdin) ? context.stdin : Buffer.from(context.stdin || []);
  const classification = classifyGhCall(args, stdin);
  const startedAt = context.startedAt || (deps.now?.() || new Date()).toISOString();
  const request = {
    argv: writePayload(pendingDir, 'argv.json', Buffer.from(JSON.stringify(args))),
    stdin: writePayload(pendingDir, 'stdin.bin', stdin),
    files: (Array.isArray(context.files) ? context.files : []).map((entry, index) => ({
      kind: String(entry.kind || 'request-file'),
      ...writePayload(pendingDir, `request-${String(index + 1).padStart(2, '0')}.bin`, entry.bytes),
    })),
  };
  const intent = {
    schema: ACTION_CAPTURE_SCHEMA,
    actionId,
    sequence,
    repository,
    issue,
    invocation: {
      id: String(context.invocationId || ''),
      command: String(context.command || ''),
    },
    startedAt,
    process: { pid: Number(deps.pid || process.pid) },
    operationClass: classification.operationClass,
    mutationKind: classification.mutationKind,
    attempt: Number.isInteger(context.attempt) && context.attempt > 0 ? context.attempt : 1,
    preconditions: safeMetadata(context.preconditions),
    request,
  };
  atomicJson(path.join(pendingDir, 'intent.json'), intent);
  renameSync(pendingDir, actionDir);
  return { actionDir, actionId, sequence, startedAt };
}

export function completeCapturedAction(handle, result = {}, deps = {}) {
  const finishedAt = result.finishedAt || (deps.now?.() || new Date()).toISOString();
  const stdout = writePayload(handle.actionDir, 'stdout.bin', result.stdout);
  const stderr = writePayload(handle.actionDir, 'stderr.bin', result.stderr);
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(handle.startedAt));
  const outcome = {
    schema: ACTION_CAPTURE_SCHEMA,
    actionId: handle.actionId,
    sequence: handle.sequence,
    finishedAt,
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : null,
    signal: result.signal || null,
    stdout,
    stderr,
    readback: safeMetadata(result.readback),
  };
  atomicJson(path.join(handle.actionDir, 'outcome.json'), outcome);
  return outcome;
}

function actionDirectories(issueDir) {
  if (!existsSync(issueDir)) return [];
  return readdirSync(issueDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{6}-[0-9A-HJKMNP-TV-Z]{26}$/.test(entry.name))
    .map((entry) => path.join(issueDir, entry.name))
    .sort();
}

function regularFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name));
}

export function summarizeActionCorpus(context, deps = {}) {
  const directories = actionDirectories(captureIssueDir(context, deps));
  const summary = {
    schema: ACTION_CAPTURE_SCHEMA,
    repository: context.repository,
    issue: issueNumber(context.issue),
    actions: directories.length,
    complete: 0,
    incomplete: 0,
    byKind: {},
    serializedBytes: 0,
    payloadBytes: 0,
    largestAction: null,
  };
  for (const directory of directories) {
    const intent = JSON.parse(readFileSync(path.join(directory, 'intent.json'), 'utf8'));
    const outcomePath = path.join(directory, 'outcome.json');
    const outcome = existsSync(outcomePath) ? JSON.parse(readFileSync(outcomePath, 'utf8')) : null;
    if (outcome) summary.complete += 1;
    else summary.incomplete += 1;
    const kind = intent.mutationKind || intent.operationClass;
    summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;
    const serializedBytes = regularFiles(directory).reduce(
      (total, filePath) => total + statSync(filePath).size,
      0
    );
    const payloadBytes =
      intent.request.argv.bytes +
      intent.request.stdin.bytes +
      (intent.request.files || []).reduce((total, entry) => total + entry.bytes, 0) +
      (outcome?.stdout?.bytes || 0) +
      (outcome?.stderr?.bytes || 0);
    summary.serializedBytes += serializedBytes;
    summary.payloadBytes += payloadBytes;
    if (!summary.largestAction || serializedBytes > summary.largestAction.serializedBytes) {
      summary.largestAction = { sequence: intent.sequence, serializedBytes, payloadBytes };
    }
  }
  summary.byKind = Object.fromEntries(
    Object.entries(summary.byKind).sort(([a], [b]) => a.localeCompare(b))
  );
  return summary;
}
