// @story #1857
// cspell:words commondir backlink
// Root discovery deliberately has no dependency on runtime state or bindings.
import { existsSync, readFileSync, realpathSync, statSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';

export const PROJECT_ROOT_ALIASES = Object.freeze([
  'AI_TASK_MANAGER_PROJECT_DIR',
  'TASK_TRACKER_PROJECT_DIR',
  'CLAUDE_PROJECT_DIR',
  'AITM_CAPTURE_PROJECT_DIR',
]);
const ARTIFACT_ROOTS = new Set(['docs', '.scratch', '.tmp']);

export class RuntimeRootError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RuntimeRootError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new RuntimeRootError(code, message);
}

function physical(value) {
  try {
    return realpathSync(path.resolve(value));
  } catch {
    return fail('ROOT_IDENTITY_MISMATCH', 'Project root does not exist: ' + value);
  }
}

// Inspect every enclosing repository, including the parent of a nested Git root.
function assertOutsideArtifacts(target) {
  let cursor = target;
  while (true) {
    if (existsSync(path.join(cursor, '.git'))) {
      const first = path.relative(cursor, target).split(path.sep)[0];
      if (ARTIFACT_ROOTS.has(first)) {
        fail(
          'ROOT_OVERRIDE_UNSAFE',
          'Artifact directories cannot own runtime authority: ' + target
        );
      }
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}

function observeGitIdentity(projectRoot, gitDir, mainRoot) {
  // Ambient Git location/config overrides must not retarget discovery.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  const git = (args) =>
    execFileSync('git', ['-C', projectRoot, ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    });
  try {
    const observed = git([
      'rev-parse',
      '--path-format=absolute',
      '--show-toplevel',
      '--git-dir',
      '--git-common-dir',
    ])
      .trimEnd()
      .split('\n');
    if (observed.length !== 3) fail('ROOT_IDENTITY_MISMATCH', 'Ambiguous Git root observation');
    const [observedRoot, observedGit, commonDir] = observed.map(physical);
    if (
      observedRoot !== projectRoot ||
      observedGit !== physical(gitDir) ||
      commonDir !== physical(path.join(mainRoot, '.git'))
    )
      fail('ROOT_IDENTITY_MISMATCH', 'Git observation disagrees with physical worktree metadata');
    const registeredRoots = [];
    const unavailableRoots = [];
    for (const field of git(['worktree', 'list', '--porcelain', '-z']).split('\0')) {
      if (!field.startsWith('worktree ')) continue;
      const candidate = field.slice('worktree '.length);
      try {
        registeredRoots.push(realpathSync(candidate));
      } catch {
        unavailableRoots.push(path.resolve(candidate));
      }
    }
    if (!registeredRoots.includes(projectRoot) || !registeredRoots.includes(mainRoot)) {
      fail('ROOT_IDENTITY_MISMATCH', 'Physical root is absent from the fresh Git worktree census');
    }
    return { commonDir, registeredRoots, unavailableRoots };
  } catch (error) {
    if (error instanceof RuntimeRootError) throw error;
    fail('ROOT_IDENTITY_MISMATCH', 'Git could not verify physical runtime root: ' + projectRoot);
  }
}

export function readPhysicalRuntimeIdentity(directory) {
  let cursor = physical(directory);
  while (!existsSync(path.join(cursor, '.git'))) {
    const parent = path.dirname(cursor);
    if (parent === cursor) fail('ROOT_IDENTITY_MISMATCH', 'No Git worktree owns ' + directory);
    cursor = parent;
  }
  const projectRoot = cursor;
  const marker = path.join(cursor, '.git');
  let gitDir = marker;
  let mainRoot = projectRoot;
  if (!statSync(marker).isDirectory()) {
    const declaration = readFileSync(marker, 'utf8')
      .trim()
      .match(/^gitdir:\s*(.+)$/);
    if (!declaration) fail('ROOT_IDENTITY_MISMATCH', 'Malformed worktree marker: ' + marker);
    gitDir = physical(path.resolve(cursor, declaration[1]));
    const commonFile = path.join(gitDir, 'commondir');
    if (!existsSync(commonFile))
      fail('ROOT_IDENTITY_MISMATCH', 'Missing registered common directory');
    const commonDir = physical(path.resolve(gitDir, readFileSync(commonFile, 'utf8').trim()));
    const backlink = path.join(gitDir, 'gitdir');
    if (
      !existsSync(backlink) ||
      physical(readFileSync(backlink, 'utf8').trim()) !== physical(marker) ||
      path.basename(commonDir) !== '.git'
    )
      fail('ROOT_IDENTITY_MISMATCH', 'Worktree registration does not match physical root');
    mainRoot = physical(path.dirname(commonDir));
  }
  if (!existsSync(path.join(gitDir, 'HEAD'))) {
    fail('ROOT_IDENTITY_MISMATCH', 'Missing Git identity for ' + projectRoot);
  }
  const observation = observeGitIdentity(projectRoot, gitDir, mainRoot);
  return {
    projectRoot,
    mainRoot,
    worktreeIdentity: { projectRoot, gitDir: physical(gitDir), ...observation },
  };
}

const runtimeRootAdapters = new AsyncLocalStorage();

// Native stage capture cannot derive physical identity from ambient adapters.
// This assertion intentionally never inspects the supplied adapter object.
export function assertNativeRuntimeRootAdaptersAbsent() {
  if (runtimeRootAdapters.getStore() !== undefined)
    fail('ROOT_ADAPTERS_ACTIVE', 'Native runtime source capture requires absent adapters');
}

// Explicit dependency injection for callers/tests; never selected by CLI or env.
// Async scope restores defaults and keeps parallel calls independent.
export function withRuntimeRootAdapters(adapters, operation) {
  return runtimeRootAdapters.run(adapters, operation);
}

const rootAdmission = new AsyncLocalStorage();

// Only registered CLI entrypoints establish this process-local scope. No
// environment value or incidental shell text can activate it.
export function withRegisteredForeignWorktreeAdmission(
  { allowForeignWorktree = false },
  operation
) {
  const admission = ({ invoking, candidate }) =>
    allowForeignWorktree === true &&
    invoking.mainRoot === candidate.mainRoot &&
    invoking.worktreeIdentity.registeredRoots.includes(candidate.projectRoot) &&
    candidate.worktreeIdentity.registeredRoots.includes(invoking.projectRoot);
  return rootAdmission.run(admission, operation);
}

export function resolveRuntimeRoot({
  cwd = process.cwd(),
  env = process.env,
  selectionPolicy = PROJECT_ROOT_ALIASES,
  foreignWorktreeAdmission = rootAdmission.getStore() ?? null,
  adapters = runtimeRootAdapters.getStore() ?? {},
} = {}) {
  const identify = adapters.readIdentity ?? readPhysicalRuntimeIdentity;
  const resolvePhysical = adapters.realpath ?? physical;
  const checkArtifact = adapters.assertOutsideArtifacts ?? assertOutsideArtifacts;
  const invoking = identify(cwd);
  // One synchronous native observation per identical physical directory. No
  // adapter callback is skipped, and the next invocation always reads afresh.
  const nativeIdentities =
    identify === readPhysicalRuntimeIdentity &&
    resolvePhysical === physical &&
    checkArtifact === assertOutsideArtifacts
      ? new Map()
      : null;
  if (nativeIdentities && path.resolve(cwd) === invoking.projectRoot)
    nativeIdentities.set(invoking.projectRoot, structuredClone(invoking));
  checkArtifact(invoking.projectRoot);
  checkArtifact(invoking.mainRoot);
  const candidates = new Map();
  // Validate all aliases, including ones shadowed by a higher-precedence value.
  for (const alias of PROJECT_ROOT_ALIASES) {
    const value = env?.[alias];
    if (value == null || value === '') continue;
    if (typeof value !== 'string' || !value.trim()) {
      fail('ROOT_IDENTITY_MISMATCH', 'Invalid project root alias: ' + alias);
    }
    const candidatePath = resolvePhysical(path.resolve(cwd, value));
    checkArtifact(candidatePath);
    const cached = nativeIdentities?.get(candidatePath);
    let candidate = cached ? structuredClone(cached) : null;
    if (!candidate) {
      candidate = identify(candidatePath);
      nativeIdentities?.set(candidatePath, structuredClone(candidate));
    }
    checkArtifact(candidate.projectRoot);
    checkArtifact(candidate.mainRoot);
    if (candidate.projectRoot !== invoking.projectRoot) {
      const admitted = foreignWorktreeAdmission?.({
        invoking,
        candidate,
        alias,
      });
      if (admitted !== true) {
        fail(
          'ROOT_IDENTITY_MISMATCH',
          'Foreign project root requires registered admission: ' + alias
        );
      }
    }
    candidates.set(alias, candidate);
  }
  const roots = new Set([...candidates.values()].map((item) => item.projectRoot));
  if (roots.size > 1) fail('ROOT_IDENTITY_MISMATCH', 'Conflicting project root aliases');
  for (const alias of selectionPolicy) {
    if (!PROJECT_ROOT_ALIASES.includes(alias)) {
      fail('ROOT_IDENTITY_MISMATCH', 'Unknown project root selection policy: ' + alias);
    }
    if (candidates.has(alias)) return { ...candidates.get(alias), selectedAlias: alias };
  }
  return invoking;
}

export function resolveRuntimeRootOverride(options = {}) {
  const env = options.env ?? process.env;
  if (!PROJECT_ROOT_ALIASES.some((alias) => env?.[alias] != null && env[alias] !== '')) return null;
  return resolveRuntimeRoot({ ...options, env });
}

export function runtimeStoragePaths({ projectRoot, mainRoot } = {}) {
  const identity = resolveRuntimeRoot({ cwd: projectRoot, env: {} });
  if (physical(mainRoot) !== identity.mainRoot) {
    fail('ROOT_IDENTITY_MISMATCH', 'Runtime main root differs from registered Git identity');
  }
  const localRuntimeRoot = path.join(identity.projectRoot, '.ai-task-manager', 'runtime');
  const sharedRuntimeRoot = path.join(identity.mainRoot, '.ai-task-manager', 'runtime');
  return {
    projectRoot: identity.projectRoot,
    mainRoot: identity.mainRoot,
    localRuntimeRoot,
    sharedRuntimeRoot,
    localRoot: path.join(localRuntimeRoot, 'store'),
    sharedRoot: path.join(sharedRuntimeRoot, 'store'),
    controlPath: path.join(localRuntimeRoot, 'control.json'),
    sharedControlPath: path.join(sharedRuntimeRoot, 'control.json'),
    migrationRoot: path.join(sharedRuntimeRoot, 'migrations'),
    registeredRoots: [...identity.worktreeIdentity.registeredRoots],
  };
}

function assertStoragePath(target, base, code = 'RUNTIME_OVERRIDE_UNSAFE') {
  const resolved = path.resolve(target);
  const relative = path.relative(base, resolved);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    fail(code, 'Runtime path is outside its owning namespace: ' + target);
  }
  // Reject aliases at every existing ancestor, including the runtime directory.
  let cursor = base;
  const ancestors = [];
  while (cursor !== path.dirname(cursor)) {
    ancestors.push(cursor);
    cursor = path.dirname(cursor);
  }
  cursor = base;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    ancestors.push(cursor);
  }
  for (const candidate of ancestors) {
    try {
      if (lstatSync(candidate).isSymbolicLink())
        fail(code, 'Runtime path contains a symbolic link: ' + candidate);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return resolved;
}

function readRequiredJson(file, base, code) {
  assertStoragePath(file, base, code);
  try {
    if (!lstatSync(file).isFile()) fail(code, 'Runtime record is not a regular file: ' + file);
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof RuntimeRootError) throw error;
    fail(code, 'Missing or corrupt runtime record: ' + file);
  }
}

function readControl(file, root, mainRoot, base) {
  const control = readRequiredJson(file, base, 'RUNTIME_CONTROL_INVALID');
  if (control?.schema !== 'aitm.runtime-control/v1')
    fail('RUNTIME_CONTROL_INVALID', 'Unsupported runtime control schema');
  if (['prepared', 'publishing'].includes(control.status))
    fail('RUNTIME_TRANSACTION_INCOMPLETE', 'Runtime publication requires registered recovery');
  if (
    control.status !== 'active' ||
    control.projectRoot !== root ||
    control.mainRoot !== mainRoot ||
    !/^[a-zA-Z0-9-]+$/.test(control.transactionId ?? '') ||
    !/^sha256:[a-f0-9]{64}$/.test(control.planDigest ?? '')
  ) {
    fail('RUNTIME_CONTROL_INVALID', 'Runtime control identity is invalid');
  }
  return control;
}

export function assertRuntimeReadable(roots) {
  const layout = runtimeStoragePaths(roots);
  assertStoragePath(layout.controlPath, layout.localRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  assertStoragePath(layout.sharedControlPath, layout.sharedRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  if (!existsSync(layout.controlPath)) {
    if (existsSync(layout.localRoot) || existsSync(layout.sharedControlPath)) {
      fail('RUNTIME_CONTROL_INVALID', 'Partial runtime loss requires registered recovery');
    }
    fail('RUNTIME_MIGRATION_REQUIRED', 'Explicit runtime migration or initialization required');
  }
  const local = readControl(
    layout.controlPath,
    layout.projectRoot,
    layout.mainRoot,
    layout.localRuntimeRoot
  );
  const shared = readControl(
    layout.sharedControlPath,
    layout.mainRoot,
    layout.mainRoot,
    layout.sharedRuntimeRoot
  );
  if (local.transactionId !== shared.transactionId || local.planDigest !== shared.planDigest) {
    fail('RUNTIME_CONTROL_INVALID', 'Runtime controls disagree');
  }
  const manifestPath = path.join(layout.migrationRoot, local.transactionId, 'manifest.json');
  const manifest = readRequiredJson(manifestPath, layout.migrationRoot, 'RUNTIME_CONTROL_INVALID');
  if (
    manifest.schema !== 'aitm.runtime-migration/v1' ||
    manifest.transactionId !== local.transactionId ||
    manifest.planDigest !== local.planDigest ||
    !Array.isArray(manifest.roots) ||
    !manifest.roots.includes(layout.projectRoot) ||
    !manifest.roots.includes(layout.mainRoot)
  ) {
    fail('RUNTIME_CONTROL_INVALID', 'Runtime activation journal identity is invalid');
  }
  if (manifest.status !== 'complete')
    fail('RUNTIME_TRANSACTION_INCOMPLETE', 'Runtime transaction has not completed');
  assertRuntimeStoreRecords(layout);
  return { ...local, layout };
}

export function assertRuntimeOverrideSafe({ path: target, projectRoot, mainRoot }) {
  const layout = runtimeStoragePaths({ projectRoot, mainRoot });
  if (typeof target !== 'string' || target.split(path.sep).includes('..')) {
    fail('RUNTIME_OVERRIDE_UNSAFE', 'Invalid runtime override');
  }
  return assertStoragePath(path.resolve(projectRoot, target), layout.localRoot);
}

export const assertRuntimeStoragePath = assertStoragePath;

export function assertRuntimeStoreRecords(layout) {
  const required = [
    [path.join(layout.localRoot, 'state', 'task-tracker-state.json'), layout.localRoot, 'state'],
    [path.join(layout.localRoot, 'state', 'task-tracker-queue.json'), layout.localRoot, 'queue'],
    [path.join(layout.sharedRoot, 'fleet', 'task-fleet.json'), layout.sharedRoot, 'object'],
    [path.join(layout.sharedRoot, 'fleet', 'occupancy.json'), layout.sharedRoot, 'object'],
  ];
  for (const [file, base, kind] of required) {
    const value = readRequiredJson(file, base, 'RUNTIME_STATE_CORRUPT');
    const object = value !== null && typeof value === 'object' && !Array.isArray(value);
    if (
      (kind === 'queue' ? !Array.isArray(value) : !object) ||
      (kind === 'state' && value.schema !== undefined && value.schema !== 'aitm.runtime-state/v1')
    ) {
      fail('RUNTIME_STATE_CORRUPT', 'Unsupported runtime record schema: ' + file);
    }
  }
}
