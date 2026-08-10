// @story #1166
// cspell:ignore reflog
// Pure command classification and refusal rendering for the Bash PreToolUse
// worktree-binding guard. Binding discovery stays in worktree-binding-guard.mjs;
// this module decides whether a command needs that authority and what a
// confirmed mismatch means.

import path from 'node:path';

import { splitCommandSegments } from './gh-edit-guard.mjs';

export const FOREIGN_WORKTREE_OVERRIDE = '--allow-foreign-worktree';

const SIMPLE_WRITE_COMMANDS = new Set([
  'chmod',
  'chown',
  'cp',
  'install',
  'ln',
  'mkdir',
  'mv',
  'patch',
  'rm',
  'rmdir',
  'tee',
  'touch',
  'truncate',
]);

const GIT_MUTATIONS = new Set([
  'add',
  'am',
  'apply',
  'bisect',
  'checkout',
  'cherry-pick',
  'clean',
  'clone',
  'commit',
  'fetch',
  'gc',
  'init',
  'merge',
  'mv',
  'notes',
  'pull',
  'push',
  'rebase',
  'reflog',
  'remote',
  'reset',
  'restore',
  'revert',
  'rm',
  'stash',
  'switch',
  'worktree',
]);

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function tokenize(segment) {
  const out = [];
  const source = String(segment || '');
  let current = '';
  let quote = null;
  let quoted = false;
  const flush = () => {
    if (current) out.push({ value: current, quoted });
    current = '';
    quoted = false;
  };
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === '\\' && quote === '"' && i + 1 < source.length) {
        current += source[++i];
      } else if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      quoted = true;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    current += char;
  }
  flush();
  return out;
}

function commandTokens(segment) {
  const tokens = tokenize(segment);
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index].value)) {
    index += 1;
  }
  if (tokens[index]?.value === 'env' || tokens[index]?.value === 'command') index += 1;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index].value)) {
    index += 1;
  }
  return tokens.slice(index);
}

function gitSubcommand(tokens) {
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index].value;
    if (token === '-C' || token === '-c' || token === '--git-dir' || token === '--work-tree') {
      index += 2;
      continue;
    }
    if (/^--(?:git-dir|work-tree)=/.test(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith('-')) {
      index += 1;
      continue;
    }
    return { name: token, args: tokens.slice(index + 1).map((item) => item.value) };
  }
  return { name: '', args: [] };
}

function gitIsMutation(tokens) {
  const { name, args } = gitSubcommand(tokens);
  if (!name) return false;
  if (name === 'branch' || name === 'tag') {
    return args.some((arg) => !arg.startsWith('-')) || args.some((arg) => /^-[dDmMfF]$/.test(arg));
  }
  if (name === 'config') {
    return !args.some((arg) => /^(?:--get|--get-all|--get-regexp|--list|-l)$/.test(arg));
  }
  if (name === 'remote') return args.length > 0 && args[0] !== 'show' && args[0] !== '-v';
  if (name === 'worktree') return args.length > 0 && args[0] !== 'list';
  return GIT_MUTATIONS.has(name);
}

function hasShellWriteSyntax(segment) {
  const source = String(segment || '');
  return /(^|[^<])>>?\s*[^&]/.test(source);
}

function classifySegment(segment) {
  const tokens = commandTokens(segment);
  if (tokens.length === 0) return { guarded: false, segment };
  const executable = path.basename(tokens[0].value);
  const override = tokens.some(
    (token) => token.value === FOREIGN_WORKTREE_OVERRIDE && token.quoted === false
  );

  const inPlaceEdit =
    (executable === 'sed' || executable === 'perl') &&
    tokens.slice(1).some((token) => /^-.*i/.test(token.value));
  if (hasShellWriteSyntax(segment) || SIMPLE_WRITE_COMMANDS.has(executable) || inPlaceEdit) {
    return { guarded: true, kind: 'shell-write', segment, override };
  }
  if (executable === 'git' && gitIsMutation(tokens)) {
    return { guarded: true, kind: 'git-mutation', segment, override };
  }
  if (['npm', 'npx', 'node', 'aitm', 'task'].includes(executable) || executable === '/task') {
    return { guarded: true, kind: 'verification-or-task', segment, override };
  }
  return { guarded: false, segment, override: false };
}

export function classifyBashWorktreeCommand(command) {
  const guardedSegments = splitCommandSegments(command)
    .map((segment) => classifySegment(segment.trim()))
    .filter((result) => result.guarded);
  return {
    guarded: guardedSegments.length > 0,
    guardedSegments,
    override:
      guardedSegments.length > 0 && guardedSegments.every((segment) => segment.override === true),
  };
}

export function evaluateBashWorktreeBinding({ command, bound, invoking, classification } = {}) {
  const classified = classification ?? classifyBashWorktreeCommand(command);
  if (!classified.guarded) return { block: false, status: 'read-only' };
  if (!bound) return { block: false, status: 'unbound' };
  if (!invoking) throw new Error('bash-worktree-guard: invoking worktree identity is required');
  if (bound.worktreePath === invoking.worktreePath) {
    return { block: false, status: 'matched' };
  }
  if (classified.override) return { block: false, status: 'override' };

  const issue = bound.issueNumber ? `#${bound.issueNumber}` : 'the active issue';
  return {
    block: true,
    status: 'mismatch',
    reason:
      `AITM worktree binding mismatch for ${issue}.\n` +
      `  Bound worktree: ${bound.worktreePath} (${bound.worktreeBranch})\n` +
      `  Invoking worktree: ${invoking.worktreePath} (${invoking.worktreeBranch})\n` +
      `  Run: cd ${shellQuote(bound.worktreePath)}\n` +
      'Refusing this write-or-verify command before Bash execution. ' +
      `Re-run with ${FOREIGN_WORKTREE_OVERRIDE} only for an explicit exception; ` +
      'AITM task verbs audit that override.',
  };
}
