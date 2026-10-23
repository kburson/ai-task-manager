// @story #2088
// cspell:words userconfig globalconfig SHELLOPTS BASHOPTS CDPATH DYLD fsmonitor nonordinary scriptshell nodeoptions onloadscript includeworkspaceroot
// A closed bootstrap operation, never a general unbound-shell allowance.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getActiveTask } from '../session-state.mjs';
import { resolveSessionId } from './session-id.mjs';
import { PROJECT_ROOT_ALIASES, readPhysicalRuntimeIdentity } from './runtime-storage.mjs';
import { resolveCurrentSessionWorktreeBinding } from './worktree-binding-guard.mjs';
import { BOOTSTRAP_INPUT_DIGESTS } from './native-bootstrap-inputs.mjs';

export const NATIVE_BOOTSTRAP_COMMAND = 'bash scripts/dev-env/setup-local-worktree.sh';
const entrypoint = 'scripts/dev-env/setup-local-worktree.sh';
function refuse(reason) {
  throw new Error('native-bootstrap: ' + reason);
}
// The native host supplies session_id to hooks. Executor-only CODEX_* variables
// may be absent in the hook process; never substitute a resolver fallback for it.
export function assertNativeHookSession(sessionId, env = process.env) {
  if (
    typeof sessionId !== 'string' ||
    sessionId === 'default-session' ||
    !/^[A-Za-z0-9_-]+$/.test(sessionId)
  )
    refuse('invalid native hook session');
  if (env.AI_TASK_MANAGER_SESSION_ID || PROJECT_ROOT_ALIASES.some((key) => env[key]))
    refuse('identity override');
  const corroborating = [env.CODEX_THREAD_ID, env.CODEX_SESSION_ID].filter(Boolean);
  if (corroborating.some((value) => value !== sessionId))
    refuse(
      `native hook identity disagreement (hook=${sessionId}; thread=${env.CODEX_THREAD_ID ?? '<unset>'}; session=${env.CODEX_SESSION_ID ?? '<unset>'})`
    );
}
export function assertNativeSession(sessionId, env = process.env) {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sessionId))
    refuse('invalid session');
  if (env.AI_TASK_MANAGER_SESSION_ID || PROJECT_ROOT_ALIASES.some((key) => env[key]))
    refuse('identity override');
  const resolved = resolveSessionId({ env });
  if (resolved !== sessionId)
    refuse(
      `hook/CLI session disagreement (hook=${sessionId}; resolved=${resolved}; thread=${env.CODEX_THREAD_ID ?? '<unset>'}; session=${env.CODEX_SESSION_ID ?? '<unset>'})`
    );
  const native = [env.CODEX_THREAD_ID, env.CODEX_SESSION_ID].filter(Boolean);
  if (!native.length) refuse('native Codex identity required');
  if (native.some((value) => value !== sessionId)) refuse('conflicting native session');
}
function ordinary(target, { directory = false } = {}) {
  const entry = lstatSync(target);
  if (entry.isSymbolicLink() || (directory ? !entry.isDirectory() : !entry.isFile()))
    refuse('nonphysical input');
}
function physicalInput(root, relative) {
  let current = root;
  const pieces = relative.split('/');
  for (let index = 0; index < pieces.length; index++) {
    current = path.join(current, pieces[index]);
    ordinary(current, { directory: index < pieces.length - 1 });
  }
  return current;
}
function toolOutsideProject(name, root, env) {
  for (const directory of (env.PATH || '').split(path.delimiter)) {
    const candidate = path.resolve(directory || '.', name);
    try {
      accessSync(candidate, constants.X_OK);
    } catch {
      continue;
    }
    const physical = realpathSync(candidate);
    const trusted = [
      '/usr/bin',
      '/bin',
      '/usr/local/bin',
      '/usr/local/Cellar',
      '/usr/local/opt',
      '/opt/homebrew/bin',
      '/opt/homebrew/Cellar',
      '/opt/homebrew/opt',
      path.dirname(realpathSync(process.execPath)),
    ];
    if (name === 'npm') trusted.push('/usr/share/nodejs/npm');
    if (name === 'npm')
      trusted.push(
        path.resolve(path.dirname(realpathSync(process.execPath)), '../lib/node_modules/npm')
      );
    if (
      physical === root ||
      physical.startsWith(root + path.sep) ||
      !trusted.some((base) => physical === base || physical.startsWith(base + path.sep))
    )
      refuse('untrusted executable');
    if (name === 'node' && physical !== realpathSync(process.execPath))
      refuse('different Node runtime');
    return physical;
  }
  refuse('missing external tool');
}
function checkNpmConfig(file) {
  if (!existsSync(file)) return;
  ordinary(file);
  const forbidden = new Set([
    'scriptshell',
    'nodeoptions',
    'onloadscript',
    'userconfig',
    'globalconfig',
    'prefix',
    'global',
    'location',
    'workspace',
    'workspaces',
    'includeworkspaceroot',
  ]);
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const separator = line.indexOf('=');
    const key = line.slice(0, separator).trim();
    // npm accepts quoted/escaped INI keys. Fail closed outside this plain-key
    // subset rather than interpreting a different key from npm's parser.
    if (separator < 1 || !/^[A-Za-z0-9_./:@%+-]+$/.test(key))
      refuse('npm execution configuration: ambiguous key syntax');
    if (forbidden.has(key.toLowerCase().replace(/[-_]/g, '')))
      refuse('npm execution configuration');
  }
}
export function assertBootstrapHost({ root, env = process.env }) {
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('BASH_FUNC_')) refuse('exported shell function');
    if (
      value &&
      !['GIT_PAGER', 'GIT_TERMINAL_PROMPT'].includes(key) &&
      (new RegExp(
        '^(?:BASH_ENV|ENV|NODE_OPTIONS|SHELLOPTS|BASHOPTS|CDPATH|LD_PRELOAD|DYLD_.*|GIT_.*)$',
        'i'
      ).test(key) ||
        new RegExp('^npm_config_', 'i').test(key))
    )
      refuse('execution environment injection');
  }
  const tools = Object.fromEntries(
    ['bash', 'dirname', 'git', 'node', 'npm', 'gh', 'jq'].map((name) => [
      name,
      toolOutsideProject(name, root, env),
    ])
  );
  return tools;
}
export function admitNativeBootstrap({
  command,
  sessionId,
  root,
  invocationDir,
  env = process.env,
}) {
  if (typeof command !== 'string') return false;
  if (!command.includes(entrypoint)) {
    if (new RegExp('^(?:env +)?npm +(?:ci|install|i|run +link:self)(?: +|$)').test(command))
      refuse('use the canonical setup operation');
    return false;
  }
  if (command !== NATIVE_BOOTSTRAP_COMMAND) refuse('only the exact canonical setup is admitted');
  assertNativeHookSession(sessionId, env);
  const tools = assertBootstrapHost({ root, env });
  if (path.resolve(invocationDir) !== root || realpathSync(root) !== root)
    refuse('foreign invocation');
  for (let cursor = root; cursor !== path.dirname(cursor); cursor = path.dirname(cursor))
    ordinary(cursor, { directory: true });
  if (!lstatSync(path.join(root, '.git')).isFile()) refuse('registered linked worktree required');
  const git = (...args) =>
    execFileSync(tools.git, ['-C', root, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  // Querying config does not execute configured filters; reject them before status.
  const config = git('config', '--list');
  if (
    new RegExp(
      '^(?:filter\\.|include(?:if)?\\.|core\\.(?:fsmonitor|hooksPath|attributesFile|worktree)=)',
      'im'
    ).test(config)
  )
    refuse('Git execution configuration');
  const identity = readPhysicalRuntimeIdentity(root);
  if (identity.projectRoot !== root || identity.mainRoot === root) refuse('foreign registration');
  const binding = resolveCurrentSessionWorktreeBinding({ invokingDir: root, deps: { sessionId } });
  if (binding || getActiveTask(sessionId, identity.mainRoot)?.issue)
    refuse('session already has a binding');
  if (existsSync(path.join(root, 'node_modules')))
    ordinary(path.join(root, 'node_modules'), { directory: true });
  for (const name of ['.npmrc', 'npm-shrinkwrap.json'])
    if (existsSync(path.join(root, name))) refuse('project npm shadow');
  checkNpmConfig(path.join(os.homedir(), '.npmrc'));
  const nominalNpm = path.join(path.dirname(realpathSync(process.execPath)), 'npm');
  if (!existsSync(nominalNpm) || realpathSync(nominalNpm) !== tools.npm)
    refuse('npm is not paired with the Node runtime');
  const npmRoot = path.resolve(path.dirname(tools.npm), '..');
  const npmPackage = JSON.parse(readFileSync(path.join(npmRoot, 'package.json'), 'utf8'));
  if (npmPackage.name !== 'npm' || Number(npmPackage.version.split('.')[0]) < 11)
    refuse('supported npm runtime required');
  checkNpmConfig(path.join(npmRoot, 'npmrc'));
  const globalConfig = execFileSync(tools.npm, ['config', 'get', 'globalconfig'], {
    env,
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!path.isAbsolute(globalConfig) || globalConfig.includes('\n'))
    refuse('ambiguous npm global configuration');
  checkNpmConfig(globalConfig);
  if (git('-c', 'core.fsmonitor=false', 'status', '--porcelain', '--untracked-files=all').trim())
    refuse('worktree or index is dirty');
  for (const [relative, digest] of Object.entries(BOOTSTRAP_INPUT_DIGESTS)) {
    const actual = createHash('sha256')
      .update(readFileSync(physicalInput(root, relative)))
      .digest('hex');
    if (actual !== digest) refuse('unreviewed setup input: ' + relative);
    const staged = git('ls-files', '--stage', '--', relative);
    if (!/^100(?:644|755) [a-f0-9]+ 0\t/.test(staged)) refuse('nonordinary indexed setup input');
  }
  return true;
}
