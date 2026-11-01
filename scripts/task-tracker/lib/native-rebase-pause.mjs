// @story #2068
// cspell:words autostash
// Admission only. Ordinary Pause remains the sole owner of timing effects.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNativeBranchCarrier } from './native-branch-renewal.mjs';
import { readPhysicalRuntimeIdentity } from './runtime-storage.mjs';
import { readWorktreeIdentity } from './worktree-binding-guard.mjs';
import { getActiveTask } from '../session-state.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { readOccupancy } from './occupancy.mjs';
import { occupancyPath } from '../paths.mjs';
import { withLock } from '../fleet-registry.mjs';

function refuse(reason) {
  throw new Error('native-rebase-pause: ' + reason);
}
export function rebasePauseCommand(command) {
  if (typeof command !== 'string') return null;
  const match =
    /^(node_modules\/@kburson\/ai-task-manager\/bin\/aitm\.mjs|bin\/aitm\.mjs) pause blocked$/.exec(
      command
    );
  return match?.[0] === command ? { carrier: match[1] } : null;
}
export function inspectNativeRebasePause({
  root,
  sessionId,
  identitySource = 'hook',
  env = process.env,
  carrier,
}) {
  const tools = assertNativeBranchCarrier({ root, sessionId, identitySource, env });
  if (identitySource === 'hook' && !carrier) refuse('parsed public carrier required');
  if (carrier) {
    const selected = fileURLToPath(new URL('../../../bin/aitm.mjs', import.meta.url));
    if (
      !['bin/aitm.mjs', 'node_modules/@kburson/ai-task-manager/bin/aitm.mjs'].includes(carrier) ||
      realpathSync(path.join(root, carrier)) !== realpathSync(selected)
    )
      refuse('invoked carrier differs from selected runtime');
  }
  const identity = readPhysicalRuntimeIdentity(root);
  if (identity.projectRoot !== root || realpathSync(root) !== root) refuse('foreign root');
  const deadline = performance.now() + 10000;
  const git = (...args) => {
    const timeout = Math.floor(deadline - performance.now());
    if (timeout <= 0) refuse('inspection budget exhausted');
    return execFileSync(tools.git, ['--no-optional-locks', '--no-replace-objects', ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout,
      stdio: 'pipe',
    }).trim();
  };
  const observe = () => {
    const record = getActiveTask(sessionId, root);
    const rows = Object.values(readOccupancy(occupancyPath(identity.mainRoot)));
    const issue = Number(record?.issue?.replace(/^#/, ''));
    const claim = rows.find((row) => row.issue === issue);
    if (
      !Number.isSafeInteger(issue) ||
      issue <= 0 ||
      record.worktreePath !== root ||
      !record.worktreeBranch ||
      record.worktreeBranch === 'HEAD' ||
      record.closedAt ||
      !record.bindingGenerationId ||
      claim?.bindingGenerationId !== record.bindingGenerationId ||
      claim?.sid !== sessionId ||
      claim?.provider !== 'codex' ||
      claim?.worktreePath !== root ||
      rows.some((row) => row !== claim && row.worktreePath === root)
    )
      refuse('own binding or occupancy changed');
    if (readWorktreeIdentity({ projectDir: root }).worktreeBranch !== 'HEAD')
      refuse('checkout is not detached');
    const directory = path.join(identity.worktreeIdentity.gitDir, 'rebase-merge');
    if (!lstatSync(directory).isDirectory() || realpathSync(directory) !== directory)
      refuse('nonphysical rebase');
    for (const marker of [
      'rebase-apply',
      'sequencer',
      'MERGE_HEAD',
      'CHERRY_PICK_HEAD',
      'REVERT_HEAD',
      'BISECT_LOG',
      'index.lock',
    ])
      if (existsSync(path.join(identity.worktreeIdentity.gitDir, marker)))
        refuse('unexpected Git operation');
    const read = (name) => {
      const file = path.join(directory, name);
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024 * 1024)
        refuse('unsafe rebase metadata');
      return readFileSync(file, 'utf8').trim();
    };
    const headName = read('head-name'),
      original = read('orig-head'),
      stopped = read('stopped-sha'),
      onto = read('onto');
    if (
      headName !== 'refs/heads/' + record.worktreeBranch ||
      ![original, stopped, onto].every((value) => /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value))
    )
      refuse('rebase identity differs from own branch');
    const done = read('done'),
      todo = read('git-rebase-todo');
    for (const line of (done + '\n' + todo).split('\n'))
      if (line && !line.startsWith('#') && !/^pick [a-f0-9]{7,64}(?:\s|$)/.test(line))
        refuse('unsupported rebase instruction');
    for (const name of ['update-refs', 'autostash', 'amend', 'message-squash'])
      if (existsSync(path.join(directory, name))) refuse('unsupported rebase option');
    const last = done
      .split('\n')
      .filter((line) => line.startsWith('pick '))
      .at(-1)
      ?.split(' ')[1];
    if (
      !last ||
      git('rev-parse', '--verify', last + '^{commit}') !== stopped ||
      git('rev-parse', '--verify', headName + '^{commit}') !== original ||
      git('rev-parse', '--verify', 'REBASE_HEAD^{commit}') !== stopped ||
      git('rev-parse', '--verify', onto + '^{commit}') !== onto
    )
      refuse('changed rebase objects');
    return {
      issue,
      sessionId,
      generation: record.bindingGenerationId,
      record,
      claim,
      headName,
      original,
      stopped,
      onto,
      done,
      todo,
      root,
      occupancyFile: occupancyPath(identity.mainRoot),
    };
  };
  const before = observe();
  if (JSON.stringify(observe()) !== JSON.stringify(before)) refuse('observations changed');
  return before;
}

// Keep the admitted claim across async queue/remote flush boundaries. The final
// local state clear runs under the ordinary occupancy exclusion, with no await.
export function withNativeRebasePauseAuthority(token, operation) {
  if (!token) return operation();
  return withLock(token.occupancyFile, () => {
    const record = getActiveTask(token.sessionId, token.root);
    const claim = readOccupancy(token.occupancyFile)[String(token.issue)];
    const recordKeys = ['issue', 'worktreePath', 'worktreeBranch', 'bindingGenerationId'];
    const claimKeys = [
      'issue',
      'sid',
      'provider',
      'worktreePath',
      'bindingGenerationId',
      'boundAt',
    ];
    if (
      !record ||
      record.closedAt ||
      !claim ||
      recordKeys.some((key) => record[key] !== token.record[key]) ||
      claimKeys.some((key) => claim[key] !== token.claim[key])
    )
      refuse('admitted generation or claim changed');
    return operation();
  });
}

export function enforceNativeRebasePauseEntry({ argv, root, env = process.env }) {
  if (argv?.[0] !== 'pause' || (!env.CODEX_THREAD_ID && !env.CODEX_SESSION_ID)) return null;
  const sessionId = currentSessionId();
  const record = getActiveTask(sessionId, root);
  if (
    !record?.issue ||
    record.worktreeBranch === readWorktreeIdentity({ projectDir: root }).worktreeBranch
  )
    return null;
  if (argv.length !== 2 || argv[1] !== 'blocked') refuse('only exact blocked Pause is admitted');
  return inspectNativeRebasePause({ root, sessionId, identitySource: 'cli', env });
}
