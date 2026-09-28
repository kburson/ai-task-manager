// Shared invocation, target and staged-document contracts for mutation guards.
// cspell:ignore AMDRC
import { execFileSync } from 'node:child_process';
import { realpathSync, statSync, lstatSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import { readWorktreeIdentity } from './worktree-binding-guard.mjs';
import { isInstalledGuardPath } from './installed-guard-path.mjs';
import { getActiveTask } from '../session-state.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { splitCommandSegments } from './gh-edit-guard.mjs';

export class MutationContextError extends Error {
  constructor(message) {
    super(`mutation-context: ${message}`);
    this.name = 'MutationContextError';
  }
}

function supplied(value, label, base) {
  if (typeof value !== 'string' || !value.trim())
    throw new MutationContextError(`invalid ${label}`);
  return path.resolve(base, value);
}

export function resolveInvocationDirectory(payload, processCwd = process.cwd()) {
  const input = payload?.tool_input;
  const base =
    payload && Object.hasOwn(payload, 'cwd')
      ? supplied(payload.cwd, 'payload cwd', processCwd)
      : path.resolve(processCwd);
  let selected = base;
  if (input && typeof input === 'object' && Object.hasOwn(input, 'workdir')) {
    selected = supplied(input.workdir, 'tool workdir', base);
  } else if (input && typeof input === 'object' && Object.hasOwn(input, 'cwd')) {
    selected = supplied(input.cwd, 'tool cwd', base);
  }
  if (!statSync(selected).isDirectory()) throw new MutationContextError('not a directory');
  return realpathSync(selected);
}

export function resolveObservedIdentity(payload, processCwd = process.cwd()) {
  const invocationDir = resolveInvocationDirectory(payload, processCwd);
  return { invocationDir, identity: readWorktreeIdentity({ projectDir: invocationDir }) };
}

export function resolveMutationTarget(target, invocationDir, expectedRoot) {
  if (typeof target !== 'string' || !target || target.includes('\0') || target.includes('\\')) {
    throw new MutationContextError('invalid mutation target');
  }
  const pieces = target.split(path.sep);
  if (pieces.includes('..') || pieces.includes('.'))
    throw new MutationContextError('unsafe target');
  const lexical = path.resolve(invocationDir, target);
  const root = realpathSync(expectedRoot);
  if (lexical !== root && !lexical.startsWith(root + path.sep)) {
    throw new MutationContextError('target outside bound worktree');
  }
  if (isInstalledGuardPath(lexical)) throw new MutationContextError('installed guard target');
  const segments = lexical.slice(path.parse(lexical).root.length).split(path.sep);
  let prefix = path.parse(lexical).root;
  for (let index = 0; index < segments.length; index++) {
    prefix = path.join(prefix, segments[index]);
    let entry;
    try {
      entry = lstatSync(prefix);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw new MutationContextError('target ancestry unavailable');
    }
    if (entry.isSymbolicLink()) {
      try {
        realpathSync(prefix);
      } catch {
        throw new MutationContextError('broken target symlink');
      }
      const expanded = path.resolve(
        path.dirname(prefix),
        readlinkSync(prefix),
        ...segments.slice(index + 1)
      );
      if (isInstalledGuardPath(expanded)) throw new MutationContextError('installed guard target');
    }
  }
  const missing = [];
  let cursor = lexical;
  for (;;) {
    try {
      cursor = realpathSync(cursor);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new MutationContextError('target ancestry unavailable');
      const parent = path.dirname(cursor);
      if (parent === cursor) throw new MutationContextError('target ancestry unavailable');
      missing.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
  if (missing.length && !statSync(cursor).isDirectory())
    throw new MutationContextError('parent is not a directory');
  const physical = path.join(cursor, ...missing);
  if (physical !== root && !physical.startsWith(root + path.sep)) {
    throw new MutationContextError('target outside bound worktree');
  }
  if (isInstalledGuardPath(physical)) throw new MutationContextError('installed guard target');
  return { lexical, physical, relative: path.relative(root, physical).split(path.sep).join('/') };
}

function shellTokens(source) {
  const out = [];
  let word = '';
  let quote = '';
  let escape = false;
  let active = false;
  for (const char of String(source)) {
    if (escape) {
      word += char;
      escape = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      escape = true;
      active = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      else word += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      active = true;
      continue;
    }
    if (char.match(/\s/)) {
      if (active) out.push(word);
      word = '';
      active = false;
      continue;
    }
    word += char;
    active = true;
  }
  if (quote || escape) throw new MutationContextError('unterminated shell token');
  if (active) out.push(word);
  return out;
}

const SAFE_CONFIG = new Set(['user.name', 'user.email', 'color.ui']);
const META = new RegExp('(?:&&|\\|\\||[;&|<>`\\n]|\\$\\(|\\$\\{|\\$[A-Za-z_])');
const SELECTOR_ENV = new RegExp('^(?:GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_CONFIG_[A-Z0-9_]+)=');
const UNSUPPORTED_GIT_ENV = /^(?:GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_CONFIG_[A-Z0-9_]+)$/;
export function hasUnsupportedGitEnvironment(environment = process.env) {
  return Object.keys(environment).some((name) => UNSUPPORTED_GIT_ENV.test(name));
}

export function parseDirectGit(command, invocationDir) {
  const source = String(command || '').trim();
  let words;
  try {
    words = shellTokens(source);
  } catch {
    return { kind: 'unsupported', docEligible: false };
  }
  let i = 0;
  let unsafe = META.test(source);
  while (i < words.length && words[i].match(/^[A-Za-z_][A-Za-z0-9_]*=/)) {
    if (SELECTOR_ENV.test(words[i])) unsafe = true;
    i++;
  }
  if (words[i] === 'command') i++;
  if (words[i] === 'env') {
    i++;
    while (words[i]?.startsWith('-')) {
      if (words[i] !== '-i') unsafe = true;
      i++;
    }
    while (i < words.length && words[i].match(/^[A-Za-z_][A-Za-z0-9_]*=/)) {
      if (SELECTOR_ENV.test(words[i])) unsafe = true;
      i++;
    }
  }
  if (path.basename(words[i] || '') !== 'git') return { kind: 'other', docEligible: false };
  i++;
  let cwd = path.resolve(invocationDir);
  const configs = [];
  while (i < words.length && words[i].startsWith('-')) {
    const arg = words[i++];
    if (arg === '-C') {
      if (!words[i]) return { kind: 'unsupported', docEligible: false };
      cwd = path.resolve(cwd, words[i++]);
    } else if (arg.startsWith('-C') && arg.length > 2) cwd = path.resolve(cwd, arg.slice(2));
    else if (arg === '-c' || arg.startsWith('-c')) {
      const value = arg === '-c' ? words[i++] : arg.slice(2);
      const key = value?.split('=', 1)[0];
      if (!key || !value.includes('=') || !SAFE_CONFIG.has(key)) unsafe = true;
      configs.push(value);
    } else if (arg === '--no-pager') continue;
    else {
      unsafe = true;
      if (['--git-dir', '--work-tree', '--namespace', '--config-env'].includes(arg)) i++;
    }
  }
  const kind = words[i++] || 'unsupported';
  const args = words.slice(i);
  if (kind !== 'commit')
    return { kind, args, cwd, configs, contextSafe: !unsafe, docEligible: false };
  let hasMessage = false;
  for (let j = 0; j < args.length; j++) {
    const arg = args[j];
    if (['-m', '--message', '-F', '--file'].includes(arg)) hasMessage = !!args[++j];
    else if (arg.match(/^(?:-m.+|-F.+|--message=.+|--file=.+)$/)) hasMessage = true;
    else if (arg !== '-q' && arg !== '--quiet') unsafe = true;
  }
  return { kind, args, cwd, configs, docEligible: hasMessage && !unsafe };
}

const DOCUMENT_PATH = new RegExp('^(?:docs|\\.claude/plans)/(?:[^/]+/)*[^/]+\\.md$');
export function isEligibleDocumentPath(file) {
  return typeof file === 'string' && DOCUMENT_PATH.test(file) && !file.includes('..');
}
export function classifyStagedRecords(records) {
  if (!Array.isArray(records) || records.length === 0)
    throw new MutationContextError('empty staged inventory');
  let docsOnly = true;
  for (const record of records) {
    if (
      !String(record?.status || '').match(/^[AMDRC]$/) ||
      !Array.isArray(record.paths) ||
      !record.paths.length
    ) {
      throw new MutationContextError('unresolved staged inventory');
    }
    for (const file of record.paths) {
      if (!isEligibleDocumentPath(file)) docsOnly = false;
    }
    for (const mode of [record.oldMode, record.newMode]) {
      if (mode !== '000000' && mode !== '100644') docsOnly = false;
    }
  }
  return docsOnly ? 'COMMIT_DOCS' : 'COMMIT_CODE';
}

export function readStagedRecords(cwd) {
  const options = { cwd, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 };
  const unresolved = execFileSync('git', ['ls-files', '-u', '-z'], options);
  if (unresolved.length) throw new MutationContextError('unmerged index');
  const first = execFileSync(
    'git',
    ['diff', '--cached', '--raw', '-z', '--no-renames', '--no-abbrev'],
    options
  );
  const second = execFileSync(
    'git',
    ['diff', '--cached', '--raw', '-z', '--no-renames', '--no-abbrev'],
    options
  );
  if (!first.equals(second)) throw new MutationContextError('index changed during inspection');
  const fields = first.toString('utf8').split('\0');
  const records = [];
  for (let i = 0; i < fields.length - 1; i += 2) {
    const header = fields[i].match(
      /^:([0-7]{6}) ([0-7]{6}) [0-9a-f]{40,64} [0-9a-f]{40,64} ([A-Z])(?:\d+)?$/
    );
    if (!header || !fields[i + 1]) throw new MutationContextError('malformed staged inventory');
    records.push({
      oldMode: header[1],
      newMode: header[2],
      status: header[3],
      paths: [fields[i + 1]],
    });
  }
  return records;
}

export function readExactSessionBinding(root, deps = {}) {
  const sid = deps.sessionId ?? currentSessionId();
  if (!sid) return null;
  const record = (deps.getActiveTask ?? getActiveTask)(sid, root);
  if (
    !record ||
    !String(record.issue || '').match(/^#\d+$/) ||
    !record.worktreePath ||
    !record.worktreeBranch
  )
    return null;
  let worktreePath;
  try {
    worktreePath = realpathSync(record.worktreePath);
  } catch {
    return null;
  }
  return {
    issueNumber: Number(record.issue.slice(1)),
    worktreePath,
    worktreeBranch: record.worktreeBranch,
    kanbanState: record.kanbanState,
  };
}

export function bindingMatches(observed, binding, issueNumber) {
  return (
    !!binding &&
    binding.issueNumber === Number(issueNumber) &&
    observed?.worktreePath === binding.worktreePath &&
    observed?.worktreeBranch === binding.worktreeBranch &&
    binding.worktreeBranch !== 'HEAD'
  );
}

const GIT_READS = new Set([
  'status',
  'log',
  'diff',
  'show',
  'rev-parse',
  'ls-files',
  'branch',
  'help',
  'version',
]);
export function discoverBashActivity(command, invocationDir, depth = 0) {
  if (depth > 4) return 'COMMIT_CODE';
  let result = null;
  for (const segment of splitCommandSegments(String(command || ''))) {
    const direct = parseDirectGit(segment, invocationDir);
    let current = null;
    if (direct.kind === 'commit') current = 'COMMIT_CODE';
    else if (direct.kind === 'add') {
      current =
        direct.contextSafe && direct.args.length && direct.args.every(isEligibleDocumentPath)
          ? 'WRITE_DOCS'
          : 'WRITE_CODE';
    } else if (
      direct.kind !== 'other' &&
      direct.kind !== 'unsupported' &&
      !GIT_READS.has(direct.kind)
    ) {
      current = 'COMMIT_CODE';
    } else if (direct.kind === 'unsupported') {
      current = 'COMMIT_CODE';
    } else {
      let words;
      try {
        words = shellTokens(segment);
      } catch {
        return 'COMMIT_CODE';
      }
      const first = path.basename(words[0] || '');
      if (['sh', 'bash', 'zsh'].includes(first)) {
        const flag = words.findIndex((word) => word === '-c' || word === '-lc' || word === '-ic');
        if (flag >= 0 && words[flag + 1])
          current = discoverBashActivity(words[flag + 1], invocationDir, depth + 1);
      }
    }
    if (current === 'COMMIT_CODE') return current;
    if (current === 'WRITE_CODE') result = current;
    else if (current === 'WRITE_DOCS' && result == null) result = current;
  }
  return result;
}
