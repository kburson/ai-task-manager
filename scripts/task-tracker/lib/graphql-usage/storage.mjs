// @story #1836
// Local metadata only. Callers must await close before normal process exit.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  validateObservation,
  validateDiagnostic,
  validateManifest,
  GRAPHQL_USAGE_SCHEMAS as schemas,
} from './records.mjs';
const exec = promisify(execFile);
const ENV = 'AITM_GRAPHQL_USAGE_CONTEXT';
const hash = (value) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const isHash = (value) =>
  typeof value === 'string' && new RegExp('^sha256:[a-f0-9]{64}$').test(value);
const iso = (now = Date.now()) => new Date(now).toISOString();
const part = (value) => (value === null ? 'unknown' : hash(String(value)).slice(7));

export function usageDiagnostic(code, context = {}, now = Date.now()) {
  return validateDiagnostic({
    schemaVersion: schemas.diagnostic,
    occurredAt: iso(now),
    code,
    count: 1,
    commonRootId: context.commonRootId ?? null,
    worktreeId: context.worktreeId ?? null,
    sessionId: context.sessionId ?? null,
  });
}
function failureCode(error, confirmed = false) {
  if (['EACCES', 'EPERM'].includes(error?.code))
    return confirmed ? 'shared-root-out-of-sandbox-scope' : 'shared-root-access-denied';
  return 'storage-failure';
}
function fallback(stderr = (text) => process.stderr.write(text)) {
  const seen = new Set();
  return (code) => {
    if (!seen.has(code) && seen.size < 8) {
      seen.add(code);
      try {
        stderr(`[aitm graphql-usage] ${code}\n`);
      } catch {
        /* telemetry is best effort */
      }
    }
  };
}
async function privateDirectory(directory, io = fs) {
  await io.mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await io.lstat(directory)).isSymbolicLink() || (await io.realpath(directory)) !== directory)
    throw new Error('redirected usage directory');
  await io.chmod(directory, 0o700);
}

async function consumerGit(args, directory) {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete env[key];
  return (await exec('git', args, { cwd: directory, env })).stdout;
}

export async function resolveUsageRoot(cwd, { runGit = consumerGit } = {}) {
  try {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw new Error('consumer cwd required');
    let result;
    try {
      result = (
        await runGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd)
      ).trim();
    } catch {
      result = (await runGit(['rev-parse', '--git-common-dir'], cwd)).trim();
    }
    // Old git can echo an unsupported option instead of returning a nonzero status.
    if (!result || result.includes('\n') || result.startsWith('--'))
      result = (await runGit(['rev-parse', '--git-common-dir'], cwd)).trim();
    if (!result || result.includes('\n') || result.startsWith('--'))
      throw new Error('invalid git result');
    const commonDir = await fs.realpath(path.resolve(cwd, result));
    if (
      !(await fs.stat(path.join(commonDir, 'objects'))).isDirectory() ||
      !(await fs.stat(path.join(commonDir, 'HEAD'))).isFile()
    )
      throw new Error('invalid common root');
    const worktree = await fs.realpath(
      (await runGit(['rev-parse', '--show-toplevel'], cwd)).trim()
    );
    const root = path.join(commonDir, 'aitm', 'graphql-usage');
    return {
      available: true,
      root,
      commonDir,
      commonRootId: hash(commonDir),
      worktreeId: hash(worktree),
    };
  } catch {
    return {
      available: false,
      diagnostic: usageDiagnostic('git-root-resolution-failed'),
      reason: 'git-common-root-resolution-unavailable',
    };
  }
}

async function probe(root, io) {
  await privateDirectory(path.dirname(root), io);
  await privateDirectory(root, io);
  const file = path.join(root, `probe-${randomUUID()}`);
  let handle;
  try {
    handle = await io.open(file, 'wx+', 0o600);
    await handle.writeFile('probe\n');
    await handle.appendFile('ready\n');
    await handle.sync();
    if ((await io.readFile(file, 'utf8')) !== 'probe\nready\n') throw new Error('probe mismatch');
  } finally {
    if (handle) {
      await handle.close();
      await io.unlink(file);
    }
  }
}
function inheritedContext(env) {
  try {
    const text = env?.[ENV];
    if (typeof text !== 'string' || text.length > 4096) return null;
    const c = JSON.parse(text);
    const keys = [
      'schemaVersion',
      'commonRootId',
      'worktreeId',
      'sessionId',
      'sessionSource',
      'enrollmentId',
      'collectorVersion',
      'permissionContextId',
      'probedAt',
      'collectorLaunchRoute',
      'originatingLaunchRoute',
    ];
    if (
      !c ||
      Object.keys(c).length !== keys.length ||
      Object.keys(c).some((key) => !keys.includes(key))
    )
      return null;
    if (
      c.schemaVersion !== 'aitm.graphql-usage.enrollment/v1' ||
      !isHash(c.commonRootId) ||
      !isHash(c.worktreeId) ||
      !isHash(c.permissionContextId) ||
      !(isHash(c.sessionId) || c.sessionId === null)
    )
      return null;
    if (!Number.isSafeInteger(c.probedAt) || c.probedAt < 0) return null;
    if (!new RegExp('^[A-Za-z0-9_.:-]{1,128}$').test(c.collectorVersion)) return null;
    validateManifest(manifestRow(c, 'enrolled', c.probedAt));
    if ((c.sessionId === null) !== (c.sessionSource === 'unknown')) return null;
    return c;
  } catch {
    return null;
  }
}
export function manifestRow(context, outcome, now = Date.now(), reasonCode = null) {
  return validateManifest({
    schemaVersion: schemas.manifest,
    commonRootId: context.commonRootId ?? null,
    worktreeId: context.worktreeId ?? null,
    sessionId: context.sessionId ?? null,
    sessionSource: context.sessionSource ?? 'unknown',
    enrollmentId: context.enrollmentId ?? null,
    collectorLaunchRoute: context.collectorLaunchRoute ?? 'unknown',
    originatingLaunchRoute: context.originatingLaunchRoute ?? null,
    outcome,
    recordedAt: iso(now),
    reasonCode,
  });
}
async function uniqueRecord(root, folder, row, io = fs) {
  const directory = path.join(root, folder);
  await privateDirectory(directory, io);
  const file = path.join(directory, `${randomUUID()}.jsonl`);
  const handle = await io.open(file, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(row) + '\n');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return file;
}
export async function writeParticipant(root, row) {
  await assertRoot(root);
  return uniqueRecord(root, 'participants', validateManifest(row));
}
export async function enrollUsage({
  cwd,
  enabled = true,
  env = {},
  descendant = false,
  trustedRuntime = false,
  runtimeSessionId = null,
  permissionContext,
  collectorVersion = 'v1',
  launchRoute = 'measurement-launcher',
  now = Date.now(),
  io = fs,
  scopeDenialConfirmed = false,
  stderr,
  runGit,
} = {}) {
  const diagnostics = [];
  const result = { available: false, env: {}, diagnostics, context: null, root: null };
  if (!enabled) {
    diagnostics.push(usageDiagnostic('collection-disabled'));
    return result;
  }
  const resolved = await resolveUsageRoot(cwd, { runGit });
  if (!resolved.available) {
    diagnostics.push(resolved.diagnostic);
    return result;
  }
  result.root = resolved.root;
  const inherited = inheritedContext(env);
  if (descendant && !inherited)
    diagnostics.push(usageDiagnostic('invalid-inherited-context', resolved, now));
  const runtime =
    trustedRuntime && typeof runtimeSessionId === 'string' && runtimeSessionId.length > 0;
  const sessionId = runtime
    ? isHash(runtimeSessionId)
      ? runtimeSessionId
      : hash(runtimeSessionId)
    : inherited
      ? inherited.sessionId
      : descendant
        ? null
        : hash(randomUUID());
  const sessionSource = runtime
    ? 'runtime'
    : (inherited?.sessionSource ?? (descendant ? 'unknown' : 'measurement-launcher'));
  // Callers supply the actual launch permission-context identity; absence never permits cache reuse.
  const permissionContextId = hash(
    typeof permissionContext === 'string' && permissionContext ? permissionContext : randomUUID()
  );
  const context = {
    schemaVersion: 'aitm.graphql-usage.enrollment/v1',
    commonRootId: resolved.commonRootId,
    worktreeId: resolved.worktreeId,
    sessionId,
    sessionSource,
    enrollmentId: randomUUID(),
    collectorVersion,
    permissionContextId,
    probedAt: now,
    collectorLaunchRoute: descendant && inherited ? 'inherited-environment' : launchRoute,
    originatingLaunchRoute:
      descendant && inherited
        ? (inherited.originatingLaunchRoute ?? inherited.collectorLaunchRoute)
        : null,
  };
  result.context = context;
  const reusable =
    inherited &&
    ['commonRootId', 'worktreeId', 'sessionId', 'collectorVersion', 'permissionContextId'].every(
      (key) => inherited[key] === context[key]
    ) &&
    now >= inherited.probedAt &&
    now - inherited.probedAt < 3_600_000;
  if (reusable) {
    context.enrollmentId = inherited.enrollmentId;
    context.probedAt = inherited.probedAt;
  }
  try {
    validateManifest(manifestRow(context, 'enrolled', now));
    if (!reusable) {
      await probe(result.root, io);
      await uniqueRecord(result.root, 'participants', manifestRow(context, 'enrolled', now), io);
    }
    result.available = true;
    result.env = { [ENV]: JSON.stringify(context) };
  } catch (error) {
    const code = failureCode(error, scopeDenialConfirmed);
    diagnostics.push(usageDiagnostic(code, context, now));
    result.participant = manifestRow(
      context,
      'denied',
      now,
      code === 'storage-failure' ? 'probe-failed' : code
    );
    fallback(stderr)(code);
  }
  return result;
}

async function assertRoot(root) {
  if (
    typeof root !== 'string' ||
    !path.isAbsolute(root) ||
    path.basename(root) !== 'graphql-usage' ||
    path.basename(path.dirname(root)) !== 'aitm'
  )
    throw new Error('invalid usage root');
  if ((await fs.realpath(root)) !== root) throw new Error('redirected usage root');
  const common = path.dirname(path.dirname(root));
  if (
    !(await fs.stat(path.join(common, 'objects'))).isDirectory() ||
    !(await fs.stat(path.join(common, 'HEAD'))).isFile()
  )
    throw new Error('invalid usage root');
}
export async function createUsageWriter(
  enrollment,
  { io = fs, stderr, softBytes, softFiles, checkEvery = 100 } = {}
) {
  const warn = fallback(stderr);
  let queue = Promise.resolve();
  let closed = false;
  let file = null;
  let writes = 0;
  const checkRetention = async () => {
    try {
      for (const warning of (await usageRetention(enrollment.root, { softBytes, softFiles }))
        .warnings)
        warn(warning);
    } catch {
      warn('storage-failure');
    }
  };
  const context = enrollment.context;
  const fail = () => {
    enrollment.available = false;
    delete enrollment.env[ENV];
    warn('storage-failure');
    return false;
  };
  const appendRow = async (row) => {
    try {
      const handle = await io.open(file, 'a', 0o600);
      try {
        await handle.writeFile(JSON.stringify(row) + '\n');
        await handle.sync();
      } finally {
        await handle.close();
      }
      return true;
    } catch {
      return fail();
    }
  };
  if (enrollment.available) {
    try {
      await assertRoot(enrollment.root);
      const directory = path.join(
        enrollment.root,
        'v1',
        part(context.worktreeId),
        part(context.sessionId)
      );
      await privateDirectory(path.join(enrollment.root, 'v1'), io);
      await privateDirectory(path.dirname(directory), io);
      await privateDirectory(directory, io);
      file = path.join(directory, `${randomUUID()}.jsonl`);
      const handle = await io.open(file, 'wx', 0o600);
      await handle.close();
      await appendRow(usageDiagnostic('writer-start', context));
      await checkRetention();
    } catch {
      fail();
    }
  }
  return {
    file,
    append(record) {
      if (closed || !enrollment.available) return Promise.resolve(false);
      let snapshot;
      try {
        validateObservation(record);
        if (
          ['commonRootId', 'worktreeId', 'sessionId', 'enrollmentId', 'sessionSource'].some(
            (key) => record[key] !== context[key]
          )
        )
          throw new Error('foreign context');
        snapshot = JSON.parse(JSON.stringify(record));
      } catch {
        warn('dropped-observation');
        return Promise.resolve(false);
      }
      queue = queue.then(async () => {
        if (!enrollment.available) return false;
        const written = await appendRow(snapshot);
        if (++writes % Math.max(1, checkEvery) === 0) await checkRetention();
        return written;
      });
      return queue;
    },
    async close() {
      if (closed) return queue;
      closed = true;
      queue = queue.then(() =>
        enrollment.available && file ? appendRow(usageDiagnostic('writer-close', context)) : false
      );
      return queue;
    },
  };
}

async function filesUnder(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(file);
    }
  }
  await assertRoot(root);
  try {
    await visit(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return files;
}
const controlSchema = 'aitm.graphql-usage.control/v1';
export function validateUsageControl(row) {
  const allowed = [
    'schemaVersion',
    'action',
    'occurredAt',
    'startedAt',
    'endedAt',
    'removedFiles',
    'removedBytes',
    'coverageGap',
  ];
  if (
    !row ||
    Object.getPrototypeOf(row) !== Object.prototype ||
    Object.keys(row).length !== allowed.length ||
    Object.keys(row).some((key) => !allowed.includes(key))
  )
    throw new TypeError('invalid control keys');
  if (
    row.schemaVersion !== controlSchema ||
    !['pause', 'cleanup'].includes(row.action) ||
    row.coverageGap !== true
  )
    throw new TypeError('invalid control');
  for (const key of ['occurredAt', 'startedAt', 'endedAt'])
    if (
      !(row[key] === null && key !== 'occurredAt') &&
      (typeof row[key] !== 'string' ||
        !Number.isFinite(Date.parse(row[key])) ||
        iso(Date.parse(row[key])) !== row[key])
    )
      throw new TypeError('invalid control time');
  if ((row.startedAt === null) !== (row.endedAt === null) || row.startedAt > row.endedAt)
    throw new TypeError('invalid control interval');
  for (const key of ['removedFiles', 'removedBytes'])
    if (!Number.isSafeInteger(row[key]) || row[key] < 0)
      throw new TypeError('invalid control count');
  return row;
}
function parseLines(text) {
  const lines = text.split('\n');
  const partial = lines.pop().length > 0;
  const rows = [];
  let malformed = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      const validators = {
        [schemas.observation]: validateObservation,
        [schemas.diagnostic]: validateDiagnostic,
        [schemas.manifest]: validateManifest,
        [controlSchema]: validateUsageControl,
      };
      const validate = Object.hasOwn(validators, row?.schemaVersion)
        ? validators[row.schemaVersion]
        : null;
      if (!validate) throw new Error('schema');
      rows.push(validate(row));
    } catch {
      malformed++;
    }
  }
  return { rows, partial, malformed };
}
export async function readUsage(root) {
  const started = performance.now();
  const result = {
    observations: [],
    diagnostics: [],
    participants: [],
    controls: [],
    duplicateCount: 0,
    conflictCount: 0,
    partialLineCount: 0,
    fileOpenCount: 0,
    elapsedMs: 0,
  };
  const seen = new Map();
  for (const file of await filesUnder(root)) {
    let parsed;
    try {
      result.fileOpenCount++;
      parsed = parseLines(await fs.readFile(file, 'utf8'));
    } catch {
      result.diagnostics.push(usageDiagnostic('storage-failure'));
      continue;
    }
    if (parsed.partial) {
      result.partialLineCount++;
      result.diagnostics.push(usageDiagnostic('malformed-record'));
    }
    if (parsed.malformed)
      result.diagnostics.push({ ...usageDiagnostic('malformed-record'), count: parsed.malformed });
    for (const row of parsed.rows) {
      if (row.schemaVersion === schemas.observation) {
        const previous = seen.get(row.callId);
        if (previous) {
          if (JSON.stringify(previous) === JSON.stringify(row)) result.duplicateCount++;
          else result.conflictCount++;
          result.diagnostics.push(usageDiagnostic('duplicate-call-id', row));
        } else {
          seen.set(row.callId, row);
          result.observations.push(row);
        }
      } else if (row.schemaVersion === schemas.diagnostic) result.diagnostics.push(row);
      else if (row.schemaVersion === schemas.manifest) result.participants.push(row);
      else result.controls.push(row);
    }
  }
  result.elapsedMs = performance.now() - started;
  return result;
}
export async function usageRetention(root, { softBytes = 100_000_000, softFiles = 100_000 } = {}) {
  const files = await filesUnder(root);
  let bytes = 0;
  for (const file of files) bytes += (await fs.stat(file)).size;
  return {
    bytes,
    files: files.length,
    softBytes,
    softFiles,
    warnings: [
      ...(bytes > softBytes ? ['soft-byte-cap'] : []),
      ...(files.length > softFiles ? ['soft-file-cap'] : []),
    ],
  };
}
export async function pauseUsage(root, { now = Date.now() } = {}) {
  await assertRoot(root);
  return uniqueRecord(
    root,
    'coverage',
    validateUsageControl({
      schemaVersion: controlSchema,
      action: 'pause',
      occurredAt: iso(now),
      startedAt: iso(now),
      endedAt: iso(now),
      removedFiles: 0,
      removedBytes: 0,
      coverageGap: true,
    })
  );
}
export async function cleanupUsage(
  root,
  { afterExport = false, operatorDirected = false, now = Date.now() } = {}
) {
  if (!afterExport || !operatorDirected)
    throw new Error('explicit operator cleanup after export required');
  const removed = [];
  for (const file of await filesUnder(root)) {
    if (!file.startsWith(path.join(root, 'v1') + path.sep)) continue;
    const parsed = parseLines(await fs.readFile(file, 'utf8'));
    // An absent normal-close marker is conservatively active, even after a crash.
    if (
      parsed.partial ||
      parsed.malformed ||
      parsed.rows[0]?.code !== 'writer-start' ||
      parsed.rows.at(-1)?.code !== 'writer-close'
    )
      continue;
    const observations = parsed.rows.filter((r) => r.schemaVersion === schemas.observation);
    const startedAt = observations.length ? observations.map((r) => r.startedAt).sort()[0] : null;
    const endedAt = observations.length
      ? observations
          .map((r) => r.endedAt)
          .sort()
          .at(-1)
      : null;
    const bytes = (await fs.stat(file)).size;
    // Write disclosure before deletion; a failure preserves the original observations.
    await uniqueRecord(
      root,
      'coverage',
      validateUsageControl({
        schemaVersion: controlSchema,
        action: 'cleanup',
        occurredAt: iso(now),
        startedAt,
        endedAt,
        removedFiles: 1,
        removedBytes: bytes,
        coverageGap: true,
      })
    );
    await fs.unlink(file);
    removed.push({ startedAt, endedAt, bytes });
  }
  return { removed };
}
