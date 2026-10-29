// @story #2088
// @story #2106
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
import { assertNativeSession, assertNativeHookSession } from './native-worktree-bootstrap.mjs';
import { compareObservedHelpers } from './native-runtime-proof.mjs';

const schema = 'aitm.native-binding-proof/v1';
const runtimeSchema = 'aitm.native-runtime-proof/v1';
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
function validateRuntimeObservation(value) {
  exact(value, [
    'schema',
    'helperModule',
    'callerMetadata',
    'processFacts',
    'dependencies',
    'configuration',
    'entrypointPredictions',
  ]);
  if (value.schema !== 'aitm.runtime-observation/v1') fail('unsupported runtime observation');
  exact(value.helperModule, ['url', 'evidence', 'file']);
  if (
    typeof value.helperModule.url !== 'string' ||
    value.helperModule.evidence !== 'actual-helper-module-only'
  )
    fail('invalid helper metadata');
  if (value.callerMetadata !== null) {
    exact(value.callerMetadata, ['url', 'evidence', 'file']);
    if (
      typeof value.callerMetadata.url !== 'string' ||
      value.callerMetadata.evidence !== 'caller-supplied-not-origin-proof'
    )
      fail('invalid caller metadata');
  }
  exact(value.processFacts, [
    'execPath',
    'version',
    'executableBytes',
    'argvEntrypoint',
    'argvEntrypointVerified',
  ]);
  const facts = value.processFacts;
  if (
    typeof facts.execPath !== 'string' ||
    typeof facts.version !== 'string' ||
    facts.executableBytes !== 'unverified-trusted-toolchain' ||
    (facts.argvEntrypoint !== null && typeof facts.argvEntrypoint !== 'string') ||
    facts.argvEntrypointVerified !== false
  )
    fail('invalid process metadata');
  // The public diagnostic currently requests no dependency or entrypoint
  // predictions. Those helper capabilities are not a transported schema yet.
  if (
    !Array.isArray(value.dependencies) ||
    value.dependencies.length ||
    !Array.isArray(value.entrypointPredictions) ||
    value.entrypointPredictions.length ||
    !Array.isArray(value.configuration) ||
    value.configuration.length !== 1
  )
    fail('invalid diagnostic collections');
  for (const file of [
    value.helperModule.file,
    value.callerMetadata?.file,
    ...value.configuration,
  ]) {
    if (file === undefined) continue;
    if (!file || typeof file !== 'object' || Array.isArray(file)) fail('invalid file observation');
    if (file.status === 'present') {
      exact(file, [
        'status',
        'kind',
        'resolvedPath',
        'sha256',
        'links',
        ...(file.kind === 'file' ? ['size'] : []),
      ]);
      if (
        !['file', 'directory', 'other'].includes(file.kind) ||
        typeof file.resolvedPath !== 'string' ||
        (file.kind === 'file'
          ? !Number.isSafeInteger(file.size) ||
            file.size < 0 ||
            typeof file.sha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(file.sha256)
          : file.sha256 !== null)
      )
        fail('invalid present file observation');
    } else {
      exact(file, ['status', 'reason', 'kind', 'resolvedPath', 'sha256', 'links']);
      if (
        !['missing', 'unavailable', 'outside-refused'].includes(file.status) ||
        typeof file.reason !== 'string' ||
        file.kind !== null ||
        file.resolvedPath !== null ||
        file.sha256 !== null
      )
        fail('invalid unavailable file observation');
    }
    if (!Array.isArray(file.links) || file.links.length > 40) fail('invalid link observations');
    for (const link of file.links) {
      exact(link, ['path', 'target']);
      if (typeof link.path !== 'string' || typeof link.target !== 'string')
        fail('invalid link observation');
    }
  }
}
export function observeNativeBinding({
  cwd,
  sessionId,
  env = process.env,
  identitySource = 'cli',
}) {
  if (identitySource === 'hook') assertNativeHookSession(sessionId, env);
  else if (identitySource === 'cli') assertNativeSession(sessionId, env);
  else fail('unknown identity source');
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
function observationFile(root, sid, nonce, create, runtimeMode = false) {
  if (!validateBindingNonce(nonce) || !/^[A-Za-z0-9_-]+$/.test(sid)) fail('invalid request');
  let current = root;
  for (const piece of [
    '.tmp',
    'aitm',
    runtimeMode ? 'native-runtime-proof' : 'native-binding-proof',
    sid,
  ]) {
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
export function recordNativeHookObservation({
  cwd,
  sessionId,
  nonce,
  env = process.env,
  runtimeObservation,
}) {
  const runtimeMode = runtimeObservation !== undefined;
  if (runtimeMode) validateRuntimeObservation(runtimeObservation);
  const hook = observeNativeBinding({ cwd, sessionId, env, identitySource: 'hook' });
  const observation = {
    schema: runtimeMode ? runtimeSchema : schema,
    nonce,
    observedAt: Date.now(),
    hook,
    ...(runtimeMode ? { runtimeObservation } : {}),
  };
  const bytes = JSON.stringify(observation);
  if (runtimeMode && Buffer.byteLength(bytes) > 65536) fail('invalid diagnostic size');
  const file = observationFile(hook.root, sessionId, nonce, true, runtimeMode);
  if (existsSync(file + '.consumed')) fail('nonce already consumed');
  const descriptor = openSync(
    file,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600
  );
  try {
    writeFileSync(descriptor, bytes);
  } finally {
    closeSync(descriptor);
  }
  return { nonce, hook, ...(runtimeMode ? { runtimeObservation } : {}) };
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
export function inspectNativeBindingProof({
  cwd,
  nonce,
  env = process.env,
  runtimeMode = false,
  cliRuntimeObservation,
}) {
  let cli = null;
  let hook = null;
  try {
    const sessionId = resolveSessionId({ env });
    cli = observeNativeBinding({ cwd, sessionId, env });
    const file = observationFile(cli.root, sessionId, nonce, false, runtimeMode);
    const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    let observation, entry;
    try {
      entry = fstatSync(descriptor);
      safeStat(entry, false);
      if (entry.size > (runtimeMode ? 65536 : 8192) || entry.nlink !== 1)
        fail('invalid diagnostic size or links');
      observation = JSON.parse(readFileSync(descriptor, 'utf8'));
      sameFile(file, entry);
    } finally {
      closeSync(descriptor);
    }
    exact(observation, [
      'schema',
      'nonce',
      'observedAt',
      'hook',
      ...(runtimeMode ? ['runtimeObservation'] : []),
    ]);
    if (
      observation.schema !== (runtimeMode ? runtimeSchema : schema) ||
      observation.nonce !== nonce ||
      !Number.isFinite(observation.observedAt) ||
      Date.now() - observation.observedAt > 60000 ||
      observation.observedAt - Date.now() > 5000
    )
      fail('stale or conflicting observation');
    exact(observation.hook, tupleKeys);
    if (runtimeMode) {
      validateRuntimeObservation(observation.runtimeObservation);
      validateRuntimeObservation(cliRuntimeObservation);
    }
    hook = observation.hook;
    const mismatches = compareBindingObservations(hook, cli);
    // Exclusive hard link retains the used nonce; replay cannot overwrite it.
    linkSync(file, file + '.consumed');
    sameFile(file + '.consumed', entry);
    sameFile(file, entry);
    unlinkSync(file);
    const bound = Boolean(cli.issue && cli.bindingGenerationId && cli.entryStartTs);
    if (runtimeMode) {
      const comparison = compareObservedHelpers(
        observation.runtimeObservation,
        cliRuntimeObservation
      );
      return {
        schema: runtimeSchema,
        nonce,
        binding: { matches: mismatches.length === 0, bound, cli, hook, mismatches },
        runtime: {
          hook: observation.runtimeObservation,
          cli: cliRuntimeObservation,
          ...comparison,
        },
        diagnosticPassed: bound && mismatches.length === 0 && comparison.sameObservedHelper,
        provenance:
          'Local diagnostic transport; retain the genuine invocation as origin context. Same-user observations are not cryptographic attestation, whole-runtime qualification or mutation authority.',
      };
    }
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
    if (runtimeMode)
      return {
        schema: runtimeSchema,
        nonce,
        diagnosticPassed: false,
        binding: { matches: false, bound: false, cli, hook },
        runtime: { sameObservedHelper: false, scope: 'observed-helper-only-not-whole-runtime' },
        error: error.message,
      };
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
