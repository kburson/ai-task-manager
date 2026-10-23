// @story #2088
// Diagnostic transport only: local observations never grant mutation authority.
import { execFileSync } from 'node:child_process';
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { getActiveTask } from '../session-state.mjs';
import { resolveSessionId } from './session-id.mjs';
import { readPhysicalRuntimeIdentity } from './runtime-storage.mjs';
import { readWorktreeIdentity } from './worktree-binding-guard.mjs';
import { assertNativeSession } from './native-worktree-bootstrap.mjs';

const schema = 'aitm.native-binding-proof/v1';
const noncePattern = /^[a-f0-9]{32,64}$/;
const tupleKeys = [
  'sessionId',
  'root',
  'branch',
  'sourceHead',
  'issue',
  'bindingGenerationId',
  'state',
  'entryStartTs',
];
function fail(reason) {
  throw new Error('native-binding-proof: ' + reason);
}
export function validateBindingNonce(nonce) {
  return typeof nonce === 'string' && noncePattern.test(nonce);
}
export function bindingProofNonce(command) {
  if (typeof command !== 'string') return null;
  const match = command.match(
    /^(?:env AITM_GRAPHQL_USAGE=1 TT_FULL_AUTO=1 )?npx aitm doctor --json --binding-proof ([a-f0-9]{32,64})$/
  );
  return match?.[1] ?? null;
}
function exact(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('|') !== [...keys].sort().join('|')
  )
    fail('invalid observation schema');
}
export function observeNativeBinding({ cwd, sessionId, env = process.env }) {
  assertNativeSession(sessionId, env);
  const identity = readPhysicalRuntimeIdentity(cwd);
  const root = identity.projectRoot;
  if (root !== cwd) fail('invocation is not the physical worktree root');
  const { worktreeBranch: branch } = readWorktreeIdentity({ projectDir: root });
  const record = getActiveTask(sessionId, root);
  if (record?.issue && (record.worktreePath !== root || record.worktreeBranch !== branch))
    fail('recorded binding differs from actual worktree');
  return {
    sessionId,
    root,
    branch,
    sourceHead: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 10000,
    }).trim(),
    issue: record?.issue ?? null,
    bindingGenerationId: record?.bindingGenerationId ?? null,
    state: record?.kanbanState ?? null,
    entryStartTs: record?.entryStartTs ?? null,
  };
}
function safeStat(entry, directory) {
  if (
    entry.isSymbolicLink() ||
    (directory ? !entry.isDirectory() : !entry.isFile()) ||
    entry.mode & 0o022 ||
    (process.getuid && entry.uid !== process.getuid())
  )
    fail('unsafe diagnostic transport');
}
function observationFile(root, sid, nonce, create) {
  if (!validateBindingNonce(nonce) || !/^[A-Za-z0-9_-]+$/.test(sid)) fail('invalid request');
  let current = root;
  for (const piece of ['.tmp', 'aitm', 'native-binding-proof', sid]) {
    current = path.join(current, piece);
    if (create) {
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    safeStat(lstatSync(current), true);
  }
  return path.join(current, nonce + '.json');
}
export function recordNativeHookObservation({ cwd, sessionId, nonce, env = process.env }) {
  const hook = observeNativeBinding({ cwd, sessionId, env });
  const file = observationFile(hook.root, sessionId, nonce, true);
  if (existsSync(file + '.consumed')) fail('nonce already consumed');
  const descriptor = openSync(
    file,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600
  );
  try {
    writeFileSync(descriptor, JSON.stringify({ schema, nonce, observedAt: Date.now(), hook }));
  } finally {
    closeSync(descriptor);
  }
  return { nonce, hook };
}
function sameFile(file, entry) {
  const current = lstatSync(file);
  safeStat(current, false);
  if (
    entry.dev !== current.dev ||
    entry.ino !== current.ino ||
    entry.size !== current.size ||
    entry.mtimeMs !== current.mtimeMs
  )
    fail('diagnostic changed during inspection');
}
export function compareBindingObservations(hook, cli) {
  exact(hook, tupleKeys);
  exact(cli, tupleKeys);
  return tupleKeys.filter((key) => hook[key] !== cli[key]);
}
export function inspectNativeBindingProof({ cwd, nonce, env = process.env }) {
  let cli = null;
  let hook = null;
  try {
    const sessionId = resolveSessionId({ env });
    cli = observeNativeBinding({ cwd, sessionId, env });
    const file = observationFile(cli.root, sessionId, nonce, false);
    const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    let observation, entry;
    try {
      entry = fstatSync(descriptor);
      safeStat(entry, false);
      if (entry.size > 8192 || entry.nlink !== 1) fail('invalid diagnostic size or links');
      observation = JSON.parse(readFileSync(descriptor, 'utf8'));
      sameFile(file, entry);
    } finally {
      closeSync(descriptor);
    }
    exact(observation, ['schema', 'nonce', 'observedAt', 'hook']);
    if (
      observation.schema !== schema ||
      observation.nonce !== nonce ||
      !Number.isFinite(observation.observedAt) ||
      Date.now() - observation.observedAt > 60000 ||
      observation.observedAt - Date.now() > 5000
    )
      fail('stale or conflicting observation');
    exact(observation.hook, tupleKeys);
    hook = observation.hook;
    const mismatches = compareBindingObservations(hook, cli);
    // Exclusive hard link retains the used nonce; replay cannot overwrite it.
    linkSync(file, file + '.consumed');
    sameFile(file + '.consumed', entry);
    sameFile(file, entry);
    unlinkSync(file);
    const bound = Boolean(cli.issue && cli.bindingGenerationId && cli.entryStartTs);
    return {
      schema,
      matches: mismatches.length === 0,
      bound,
      healthy: bound && mismatches.length === 0,
      nonce,
      cli,
      hook,
      mismatches,
      provenance:
        'Local hook diagnostic transport; retain the genuine native tool invocation as origin evidence. This is not a mutation authority or cryptographic attestation.',
    };
  } catch (error) {
    return {
      schema,
      matches: false,
      bound: false,
      healthy: false,
      nonce,
      cli,
      hook,
      error: error.message,
    };
  }
}
