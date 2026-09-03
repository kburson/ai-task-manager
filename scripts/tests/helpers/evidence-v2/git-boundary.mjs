// @story #1496
import { realpathSync } from 'node:fs';
import path from 'node:path';
import {
  containedBy,
  rehearsalRefusal,
  resolveExecutionContext,
} from '../../../task-tracker/lib/evidence-v2/execution-context.mjs';

const verbs = new Set([
  'rev-parse',
  'status',
  'log',
  'show',
  'diff',
  'ls-files',
  'ls-tree',
  'cat-file',
  'merge-base',
  'branch',
  'rev-list',
  'remote',
  'config',
  'for-each-ref',
  'symbolic-ref',
  'check-ignore',
  'worktree',
  'add',
  'commit',
  'rebase',
  'merge',
  'reset',
  'checkout',
  'switch',
  'push',
  'fetch',
  'update-ref',
  'tag',
]);

export function guardGitInvocation(context, rawArgs, options = {}) {
  if (options.shell) throw rehearsalRefusal('shell-process');
  const args = [...rawArgs];
  let cwd = realpathSync(options.cwd || context.sourceRoot);
  if (args[0] === '-C') {
    cwd = realpathSync(args[1]);
    args.splice(0, 2);
  }
  const verb = args[0];
  if (!containedBy(context.root, cwd) || !verbs.has(verb)) throw rehearsalRefusal('git-command');
  if (
    verb === 'config' &&
    !args.some((a) => ['--get', '--get-all', '--get-regexp', '--list', '-l'].includes(a))
  )
    throw rehearsalRefusal('git-config-write');
  if (
    args.some((arg) =>
      /^(?:--exec|--interactive|--edit|--edit-description|--gpg-sign|--strategy|--recurse-submodules)(?:=|$)/.test(
        arg
      )
    ) ||
    (verb === 'rebase' && args.some((arg) => ['-x', '-i'].includes(arg))) ||
    (verb === 'commit' && args.some((arg) => arg === '-e' || arg.startsWith('-S'))) ||
    (verb === 'tag' && args.some((arg) => ['-s', '-u'].includes(arg))) ||
    (verb === 'merge' && args.includes('-s'))
  )
    throw rehearsalRefusal('git-execution-option');
  for (const raw of args.slice(1)) {
    const arg = raw.startsWith('--') && raw.includes('=') ? raw.slice(raw.indexOf('=') + 1) : raw;
    if (/^(?:https?:|ssh:|git@|ext::|file:)/i.test(arg))
      throw rehearsalRefusal('production-remote');
    if (path.isAbsolute(arg) && !containedBy(context.root, path.resolve(arg)))
      throw rehearsalRefusal('production-path');
    if (arg.includes('..') && !containedBy(context.root, path.resolve(cwd, arg)))
      throw rehearsalRefusal('production-path');
    if (/^--(?:git-dir|work-tree|config-env|exec-path|upload-pack|receive-pack)(?:=|$)/.test(raw))
      throw rehearsalRefusal('git-override');
  }
  resolveExecutionContext({ ...context, sourceRoot: cwd });
  return { ...options, cwd, shell: false };
}
