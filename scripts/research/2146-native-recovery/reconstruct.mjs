// @story #2146
// cspell:words includeif partialclone uploadpack hookspath fsmonitor sshcommand gitproxy alternaterefscommand
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PINS, requirePhysicalDirectory } from './archive.mjs';

const fail = (reason) => {
  throw new Error('reconstruct:' + reason);
};
const allocated = new WeakSet();
const BENIGN_ENV = { GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
// Identity metadata may affect the new clone's reflog, never command or path selection.
const IDENTITY_ENV = new Set([
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
]);

export function assertGitEnvironment(env = process.env) {
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('GIT_') && value && !IDENTITY_ENV.has(key) && BENIGN_ENV[key] !== value)
      fail('git-environment:' + key);
  }
}

function configRefusalIdentity(scope, key) {
  const scopeName =
    ['system', 'global', 'local', 'worktree', 'command'].find((name) => name === scope) ??
    'unknown';
  const family =
    [
      ['core.', 'core'],
      ['filter.', 'filter'],
      ['url.', 'url'],
      ['includeif.', 'conditional-include'],
      ['extensions.partialclone', 'partial-clone'],
      ['remote.', 'remote'],
      ['uploadpack.', 'upload-pack'],
      ['http.', 'http'],
      ['ssh.', 'ssh'],
    ].find(([prefix]) => key.startsWith(prefix))?.[1] ?? 'other';
  const setting =
    [
      'filter.lfs.clean',
      'filter.lfs.smudge',
      'filter.lfs.process',
      'filter.lfs.required',
      'core.hookspath',
      'core.fsmonitor',
      'core.sshcommand',
      'core.gitproxy',
      'core.alternaterefscommand',
      'core.worktree',
      'extensions.partialclone',
    ].find((name) => name === key) ?? 'redacted';
  return scopeName + ':' + family + ':' + setting;
}

export function assertSafeConfig(rows, { carrier = false } = {}) {
  for (const row of rows) {
    const key = row.key.toLowerCase(),
      value = row.value.trim().toLowerCase();
    if (/^core\.hooksPath$/i.test(key) && carrier && ['local', 'worktree'].includes(row.scope))
      continue;
    if (/^core\.fsMonitor$/i.test(key) && ['false', '0', 'no', 'off', ''].includes(value)) continue;
    if (
      /^(core\.(hooksPath|fsMonitor|sshCommand|gitProxy|alternateRefsCommand|worktree)|filter\.|url\.|includeIf\.|extensions\.partialClone|remote\..*\.(promisor|uploadPack|vcs)|uploadPack\.|http\..*(proxy|curlOptResolve)|ssh\.)/i.test(
        key
      )
    )
      fail('git-configuration:unsafe-setting:' + configRefusalIdentity(row.scope, key));
  }
}

function ensureDirectory(root, relative) {
  let current = requirePhysicalDirectory(root);
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      mkdirSync(current, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    requirePhysicalDirectory(current);
  }
  return current;
}

export async function allocateValidationRoot(carrierRoot, { resolveRoot } = {}) {
  assertGitEnvironment();
  const carrier = requirePhysicalDirectory(carrierRoot);
  const resolveScratchRoot =
    resolveRoot ??
    (await import(pathToFileURL(path.join(carrier, 'scripts/task-tracker/lib/scratch-dir.mjs'))))
      .resolveScratchRoot;
  if (resolveScratchRoot(carrier) !== carrier) fail('scratch-root');
  const parent = ensureDirectory(carrier, '.ai-task-manager/runtime/test-fixtures/2146-archive');
  const ownedRoot = mkdtempSync(path.join(parent, 'validation-'));
  const templateRoot = path.join(ownedRoot, 'empty-template');
  mkdirSync(templateRoot, { mode: 0o700 });
  const result = Object.freeze({
    carrierRoot: carrier,
    ownedRoot,
    templateRoot,
    sourceRoot: path.join(ownedRoot, 'source'),
  });
  allocated.add(result);
  return result;
}

export function configRows(raw) {
  const fields = raw.split('\0');
  if (fields.pop() !== '' || fields.length % 2) fail('config-format');
  const rows = [];
  for (let i = 0; i < fields.length; i += 2) {
    const split = fields[i + 1].indexOf('\n');
    if (split < 1) fail('config-format');
    rows.push({
      scope: fields[i],
      key: fields[i + 1].slice(0, split),
      value: fields[i + 1].slice(split + 1),
    });
  }
  return rows;
}

const CANONICAL_LFS = new Map([
  ['filter.lfs.clean', 'git-lfs clean -- %f'],
  ['filter.lfs.smudge', 'git-lfs smudge -- %f'],
  ['filter.lfs.process', 'git-lfs filter-process'],
  ['filter.lfs.required', 'true'],
]);

function nulFields(raw, category) {
  const text = String(raw);
  if (!text) return [];
  const fields = text.split('\0');
  if (fields.pop() !== '' || text.includes('\ufffd')) fail('git-attributes:' + category);
  return fields;
}

function operationPaths(raw, kind) {
  const paths = new Set();
  for (const record of nulFields(raw, 'path-format')) {
    const match =
      kind === 'index'
        ? /^(?:100644|100755|120000) [a-f0-9]{40} 0\t([\s\S]+)$/.exec(record)
        : kind === 'tree'
          ? /^(?:100644|100755|120000) blob [a-f0-9]{40}\t([\s\S]+)$/.exec(record)
          : [record, record];
    const name = match?.[1];
    if (
      !name ||
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
      paths.has(name)
    )
      fail('git-attributes:path-format');
    paths.add(name);
  }
  return paths;
}

function assertInactiveAttributes(raw, paths) {
  const fields = nulFields(raw, 'output-format');
  if (fields.length % 3) fail('git-attributes:output-format');
  const seen = new Set();
  for (let i = 0; i < fields.length; i += 3) {
    const [name, attribute] = fields.slice(i, i + 2);
    const pair = name + '\0' + attribute;
    if (!paths.has(name) || !/^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/.test(attribute) || seen.has(pair))
      fail('git-attributes:output-format');
    seen.add(pair);
    if (attribute === 'filter') fail('git-attributes:active-filter');
  }
}

// This check is bound to the next operation. It assumes stable configuration,
// attributes, index, worktree and executable between inspection and that operation.
export function assertSafeGit(
  readGit,
  root,
  { carrier = false, operation = 'inspect', tree } = {}
) {
  if (
    !['inspect', 'stage', 'checkout'].includes(operation) ||
    typeof carrier !== 'boolean' ||
    (carrier && operation !== 'inspect') ||
    (operation === 'checkout'
      ? typeof tree !== 'string' || !/^[a-f0-9]{40}$/.test(tree)
      : tree !== undefined)
  )
    fail('git-attributes:operation');
  const rows = configRows(
    String(readGit(['config', '--null', '--list', '--show-scope', '--includes']))
  );
  const candidates = rows.filter(
    (row) =>
      row.scope === 'system' &&
      CANONICAL_LFS.get(row.key) === row.value &&
      CANONICAL_LFS.has(row.key)
  );
  const candidateSet = new Set(candidates);
  assertSafeConfig(
    rows.filter((row) => !candidateSet.has(row)),
    { carrier }
  );
  if (!candidates.length) return;
  if (candidates.length !== 4 || new Set(candidates.map((row) => row.key)).size !== 4)
    fail('git-configuration:lfs-shape');
  if (rows.some((row) => row.key.toLowerCase() === 'attr.tree'))
    fail('git-attributes:source-override');
  if (String(readGit(['rev-parse', '--show-toplevel'])).replace(/\n$/, '') !== root)
    fail('git-attributes:root');
  const paths =
    operation === 'checkout'
      ? operationPaths(readGit(['ls-tree', '-r', '-z', '--full-tree', tree]), 'tree')
      : operationPaths(readGit(['ls-files', '--stage', '-z', '--full-name']), 'index');
  if (operation === 'stage') {
    const untracked = operationPaths(
      readGit(['ls-files', '--others', '--exclude-standard', '-z', '--full-name']),
      'untracked'
    );
    for (const name of untracked) {
      if (paths.has(name)) fail('git-attributes:path-format');
      paths.add(name);
    }
  }
  const input = Buffer.from([...paths].map((name) => name + '\0').join(''));
  const modes = operation === 'checkout' ? [['--source=' + tree]] : [[], ['--cached']];
  for (const mode of modes)
    assertInactiveAttributes(
      readGit(['check-attr', ...mode, '--all', '-z', '--stdin'], input),
      paths
    );
}

export function reconstructHistoricalSource(carrierRoot, allocation) {
  assertGitEnvironment();
  const carrier = requirePhysicalDirectory(carrierRoot);
  if (!allocated.has(allocation) || allocation.carrierRoot !== carrier) fail('allocation');
  const { ownedRoot, templateRoot, sourceRoot } = allocation;
  requirePhysicalDirectory(ownedRoot);
  requirePhysicalDirectory(templateRoot);
  if (
    readdirSync(templateRoot).length ||
    readdirSync(ownedRoot).some((name) => name !== 'empty-template')
  )
    fail('allocation-not-empty');
  const commands = [];
  const git = (cwd, args, input) => {
    assertGitEnvironment();
    requirePhysicalDirectory(cwd);
    const argv = ['--no-pager', ...args];
    try {
      const output = execFileSync('git', argv, {
        cwd,
        encoding: 'utf8',
        stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        ...(input === undefined ? {} : { input }),
        timeout: 10000,
        maxBuffer: 8 * 1024 * 1024,
      });
      commands.push({ cwd, args: argv, status: 0 });
      return output.trimEnd();
    } catch (error) {
      commands.push({ cwd, args: argv, status: error.status ?? null });
      // Raw stderr/config output may contain private configuration; retain only category.
      fail('git-failed:' + args[0]);
    }
  };
  const diagnostics = (outcome) => ({
    schema: 'aitm.archival-reconstruction-diagnostics/v1',
    ownedRoot,
    outcome,
    commands: structuredClone(commands),
  });
  const retain = (record) => {
    requirePhysicalDirectory(ownedRoot);
    writeFileSync(
      path.join(ownedRoot, 'reconstruction-diagnostics.json'),
      JSON.stringify(record, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 }
    );
  };
  try {
    const inspectGit = (cwd, options) =>
      assertSafeGit((args, input) => git(cwd, args, input), cwd, options);
    inspectGit(carrier, { carrier: true });
    if (realpathSync(git(carrier, ['rev-parse', '--show-toplevel'])) !== carrier)
      fail('carrier-root');
    git(carrier, ['cat-file', '-e', PINS.sourceCommit + '^{commit}']);
    if (git(carrier, ['rev-parse', PINS.sourceCommit + '^{tree}']) !== PINS.sourceTree)
      fail('source-tree');
    git(ownedRoot, [
      'clone',
      '--shared',
      '--no-checkout',
      '--template=' + templateRoot,
      '--',
      carrier,
      sourceRoot,
    ]);
    requirePhysicalDirectory(sourceRoot);
    requirePhysicalDirectory(path.join(sourceRoot, '.git'));
    if (readdirSync(sourceRoot).some((name) => name !== '.git')) fail('source-not-empty');
    inspectGit(sourceRoot, { operation: 'checkout', tree: PINS.sourceCommit });
    git(sourceRoot, ['update-ref', '--no-deref', 'HEAD', PINS.sourceCommit]);
    git(sourceRoot, ['read-tree', '--reset', '-u', PINS.sourceCommit]);
    const sourceCommit = git(sourceRoot, ['rev-parse', 'HEAD']);
    const sourceTree = git(sourceRoot, ['rev-parse', 'HEAD^{tree}']);
    if (sourceCommit !== PINS.sourceCommit || sourceTree !== PINS.sourceTree)
      fail('source-identity');
    inspectGit(sourceRoot);
    if (git(sourceRoot, ['status', '--porcelain', '--untracked-files=all']) !== '')
      fail('source-dirty');
    const sourceGit = (args) => {
      if (
        ![
          ['rev-parse', 'HEAD'],
          ['status', '--porcelain', '--untracked-files=all'],
        ].some((allowed) => JSON.stringify(allowed) === JSON.stringify(args))
      )
        fail('read-command');
      inspectGit(sourceRoot);
      return git(sourceRoot, args);
    };
    retain(diagnostics('success'));
    return { sourceRoot, sourceCommit, sourceTree, sourceGit, commands };
  } catch (error) {
    const category = error.message?.startsWith('reconstruct:')
      ? error.message
      : 'reconstruct:filesystem';
    const record = diagnostics(category);
    const failure = Object.assign(new Error(category), { diagnostics: record });
    try {
      retain(record);
    } catch {
      failure.diagnosticWriteFailed = true;
    }
    throw failure;
  }
}
