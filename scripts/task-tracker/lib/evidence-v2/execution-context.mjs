// @story #1496
// cspell:ignore NOSYSTEM repositoryformatversion filemode logallrefupdates precomposeunicode hookspath pushurl
// Recorded execution is a disposable fixture capability, never production enrollment.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

const inspectGit = execFileSync;
let recordedTransportRoot = null;

// Installed by the offline adapter after its process/network guards. An env
// context alone must never route a recorded run through production transport.
export function registerRecordedTransport(context) {
  if (
    !process.permission?.has('fs.write', context.root) ||
    process.permission.has('fs.write', context.toolRoot)
  )
    throw rehearsalRefusal('recorded-permissions-required');
  recordedTransportRoot = context.root;
}

export function assertRecordedTransport(context) {
  if (context && recordedTransportRoot !== context.root)
    throw rehearsalRefusal('recorded-transport-required');
}

export function rehearsalRefusal(reason) {
  return new Error(`rehearsal:${reason}`);
}

export function containedBy(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function directory(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value))
    throw rehearsalRefusal('absolute-path-required');
  if (lstatSync(value).isSymbolicLink() || !lstatSync(value).isDirectory())
    throw rehearsalRefusal('directory-required');
  return realpathSync(value);
}

function inspectObjects(root) {
  if (lstatSync(root).isSymbolicLink()) throw rehearsalRefusal('shared-object-storage');
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1))
      throw rehearsalRefusal('shared-object-storage');
    if (stat.isDirectory()) inspectObjects(file);
  }
}

function git(root, args) {
  return inspectGit('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH,
      HOME: root,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
    },
  }).trim();
}

function inspectStorage(commonDir, root, seen = new Set()) {
  if (seen.has(commonDir)) return;
  seen.add(commonDir);
  if (!containedBy(root, realpathSync(commonDir)))
    throw rehearsalRefusal('shared-git-common-directory');
  if (existsSync(path.join(commonDir, 'objects', 'info', 'alternates')))
    throw rehearsalRefusal('object-alternates');
  inspectObjects(commonDir);
  const allowed =
    /^(?:core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks|hookspath)|remote\.[^.]+\.(?:url|pushurl|fetch)|branch\.[^.]+\.(?:remote|merge)|user\.(?:name|email))$/i;
  const config = git(commonDir, ['config', '--local', '--list']);
  for (const line of config.split('\n').filter(Boolean)) {
    const equal = line.indexOf('=');
    const key = line.slice(0, equal);
    const value = line.slice(equal + 1);
    if (!allowed.test(key)) throw rehearsalRefusal('executable-git-config');
    if (/^core\.hookspath$/i.test(key)) {
      const hooks = directory(value);
      if (!containedBy(root, hooks) || readdirSync(hooks).length)
        throw rehearsalRefusal('git-hooks');
    }
    if (/^remote\..*\.(?:url|pushurl)$/i.test(key)) {
      if (!path.isAbsolute(value) || !containedBy(root, realpathSync(value)))
        throw rehearsalRefusal('production-remote');
      if (git(value, ['rev-parse', '--is-bare-repository']) !== 'true')
        throw rehearsalRefusal('bare-remote-required');
      inspectStorage(realpathSync(value), root, seen);
    }
  }
  const hooks = path.join(commonDir, 'hooks');
  if (existsSync(hooks) && readdirSync(hooks).some((name) => !name.endsWith('.sample')))
    throw rehearsalRefusal('git-hooks');
}

export function resolveExecutionContext(input) {
  if (!input || input.providerMode !== 'recorded' || input.schema !== 'aitm.rehearsal-context/v1')
    throw rehearsalRefusal('invalid-context');
  if (
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.runId || '') ||
    input.repositoryId !== `aitm-rehearsal/${input.runId}`
  )
    throw rehearsalRefusal('production-target');
  const root = directory(input.root);
  if (typeof input.toolRoot !== 'string' || !path.isAbsolute(input.toolRoot))
    throw rehearsalRefusal('absolute-path-required');
  const toolRoot = path.dirname(directory(path.join(input.toolRoot, 'scripts')));
  const sourceRoot = directory(input.sourceRoot);
  const authorityRoot = directory(input.authorityRoot);
  if (
    containedBy(root, toolRoot) ||
    sourceRoot === toolRoot ||
    !containedBy(root, sourceRoot) ||
    !containedBy(root, authorityRoot) ||
    root === sourceRoot
  )
    throw rehearsalRefusal('production-path');
  const gitCommonDir = realpathSync(
    git(sourceRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  );
  if (!containedBy(root, gitCommonDir)) throw rehearsalRefusal('shared-git-common-directory');
  inspectStorage(gitCommonDir, root);
  return Object.freeze({
    schema: input.schema,
    providerMode: 'recorded',
    runId: input.runId,
    repositoryId: input.repositoryId,
    root,
    toolRoot,
    sourceRoot,
    authorityRoot,
    gitCommonDir,
    productionEvidenceEligible: false,
  });
}

export function readRecordedExecutionContext(env = process.env) {
  if (!env.AITM_REHEARSAL_CONTEXT) return null;
  return resolveExecutionContext(JSON.parse(readFileSync(env.AITM_REHEARSAL_CONTEXT, 'utf8')));
}
