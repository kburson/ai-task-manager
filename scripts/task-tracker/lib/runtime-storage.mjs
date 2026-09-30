// @story #1857
// cspell:words commondir backlink
// Root discovery deliberately has no dependency on runtime state or bindings.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
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
    const candidate = identify(candidatePath);
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
