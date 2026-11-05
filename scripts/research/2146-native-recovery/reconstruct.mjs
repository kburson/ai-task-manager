// @story #2146
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PINS, requirePhysicalDirectory } from './archive.mjs';

const fail = (reason) => {
  throw new Error('reconstruct:' + reason);
};
const allocated = new WeakSet();
const BENIGN_ENV = { GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };

export function assertGitEnvironment(env = process.env) {
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('GIT_') && value && BENIGN_ENV[key] !== value)
      fail('git-environment:' + key);
  }
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
      fail('git-configuration:unsafe-setting');
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
  const git = (cwd, args) => {
    assertGitEnvironment();
    requirePhysicalDirectory(cwd);
    const argv = ['--no-pager', ...args];
    try {
      const output = execFileSync('git', argv, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
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
    const inspectConfig = (cwd, options) =>
      assertSafeConfig(
        configRows(git(cwd, ['config', '--null', '--list', '--show-scope', '--includes'])),
        options
      );
    inspectConfig(carrier, { carrier: true });
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
    inspectConfig(sourceRoot);
    if (lstatSync(path.join(sourceRoot, '.git')).isSymbolicLink()) fail('git-directory');
    git(sourceRoot, ['update-ref', '--no-deref', 'HEAD', PINS.sourceCommit]);
    git(sourceRoot, ['read-tree', '--reset', '-u', PINS.sourceCommit]);
    const sourceCommit = git(sourceRoot, ['rev-parse', 'HEAD']);
    const sourceTree = git(sourceRoot, ['rev-parse', 'HEAD^{tree}']);
    if (sourceCommit !== PINS.sourceCommit || sourceTree !== PINS.sourceTree)
      fail('source-identity');
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
      inspectConfig(sourceRoot);
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
