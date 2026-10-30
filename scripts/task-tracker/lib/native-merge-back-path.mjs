// @story #2039 #2067
// cspell:words fsmonitor
// A single read operand allowance. The registered merge-back still owns every
// verification and mutation; this observation grants no integration receipt.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getActiveTask } from '../session-state.mjs';
import { occupancyPath, configPath } from '../paths.mjs';
import { loadConfig } from '../config.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { pexec } from '../../gh/lib/gh-client.mjs';
import { readOccupancy } from './occupancy.mjs';
import { fetchAssignmentSnapshot, singletonOwner } from './assignment-snapshot.mjs';
import { fetchParentIssueStrict } from './fetch-parent-issue.mjs';
import { resolveCurrentIssueWorktreeLocation } from './issue-worktree-location.mjs';
import { parseReviewApprovedMarker } from './markers.mjs';
import { readPhysicalRuntimeIdentity } from './runtime-storage.mjs';
import { assertBootstrapHost, assertNativeHookSession } from './native-worktree-bootstrap.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fail(reason) {
  throw new Error('native-merge-back-path: ' + reason);
}
export function mergeBackPathCommand(command) {
  if (typeof command !== 'string') return null;
  const match = command.match(
    /^(node_modules\/(?:@kburson\/)?ai-task-manager\/bin\/aitm\.mjs) merge-back ([1-9]\d*) (\/[A-Za-z0-9._/-]+) --preserve-worktree$/
  );
  if (!match || match[0] !== command || !Number.isSafeInteger(Number(match[2]))) return null;
  return { entry: match[1], child: Number(match[2]), childPath: match[3] };
}
function physicalDirectory(root) {
  if (path.resolve(root) !== root || realpathSync(root) !== root) fail('aliased path');
  let current = path.parse(root).root;
  for (const part of root.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('nonphysical path');
  }
  const marker = lstatSync(path.join(root, '.git'));
  if (!marker.isFile() || marker.isSymbolicLink()) fail('linked checkout required');
}
function checkout(root, git) {
  physicalDirectory(root);
  const run = (...args) => git(root, ...args);
  if (realpathSync(run('rev-parse', '--show-toplevel')) !== root) fail('checkout root mismatch');
  const ref = run('symbolic-ref', '--quiet', 'HEAD');
  if (!ref.startsWith('refs/heads/')) fail('named branch required');
  const head = run('rev-parse', '--verify', 'HEAD^{commit}');
  if (!/^[a-f0-9]{40}$/.test(head)) fail('source identity unavailable');
  const common = realpathSync(run('rev-parse', '--path-format=absolute', '--git-common-dir'));
  const registered = run('worktree', 'list', '--porcelain')
    .split('\n\n')
    .filter((block) => block.split('\n').includes('worktree ' + root));
  if (
    registered.length !== 1 ||
    !registered[0].split('\n').includes('branch ' + ref) ||
    !registered[0].split('\n').includes('HEAD ' + head)
  )
    fail('unregistered checkout');
  return { root, branch: ref.slice('refs/heads/'.length), head, common };
}
async function readRemote({ parent, child, cfg }) {
  const issue = async (number) => {
    const [result, assignment] = await Promise.all([
      pexec(
        'gh',
        ['issue', 'view', String(number), '-R', cfg.repo, '--json', 'number,state,body,assignees'],
        { timeout: GH_API_TIMEOUT_MS }
      ),
      fetchAssignmentSnapshot({ issueNumber: number, cfg }),
    ]);
    const value = JSON.parse(result.stdout);
    if (singletonOwner(value.assignees) !== singletonOwner(assignment.assignees))
      fail('owner observation changed');
    return { ...value, boardState: assignment.state, assignees: assignment.assignees };
  };
  const [parentIssue, childIssue, edge, user] = await Promise.all([
    issue(parent),
    issue(child),
    fetchParentIssueStrict({ issueNumber: child, repo: cfg.repo }),
    pexec('gh', ['api', 'user', '--jq', '.login'], { timeout: GH_API_TIMEOUT_MS }),
  ]);
  return {
    parent: parentIssue,
    child: { ...childIssue, parent: edge },
    login: user.stdout.trim().toLowerCase(),
  };
}

export async function inspectNativeMergeBackPath({
  request,
  root,
  invocationDir,
  sessionId,
  env = process.env,
  cfg,
  deps = {},
}) {
  try {
    if (invocationDir !== root) fail('invocation must be the physical parent root');
    if (
      !request ||
      !same(
        request,
        mergeBackPathCommand(
          `${request.entry} merge-back ${request.child} ${request.childPath} --preserve-worktree`
        )
      )
    )
      fail('unsupported request');
    assertNativeHookSession(sessionId, env);
    if (env.TT_SKIP_NETWORK === '1' || env.AITM_EVIDENCE_CONTEXT) fail('unsupported environment');
    const tools = assertBootstrapHost({ root, env });
    const entry = path.join(root, request.entry);
    const selected = fileURLToPath(new URL('../../../bin/aitm.mjs', import.meta.url));
    const entryIdentity = () => {
      const actual = realpathSync(entry);
      if (
        actual !== realpathSync(selected) ||
        readFileSync(actual, 'utf8').split('\n')[0] !== '#!/usr/bin/env node'
      )
        fail('public entry mismatch');
      return actual;
    };
    const initialEntry = entryIdentity();
    const identity = readPhysicalRuntimeIdentity(root);
    if (identity.projectRoot !== root || request.childPath === root) fail('foreign root');
    const active = getActiveTask(sessionId, root);
    const parent = Number(String(active?.issue).replace(/^#/, ''));
    if (
      !Number.isSafeInteger(parent) ||
      parent <= 0 ||
      parent === request.child ||
      active.worktreePath !== root ||
      active.kanbanState !== 'develop' ||
      !Number.isFinite(Date.parse(active.entryStartTs)) ||
      active.pausedAtTs ||
      active.closedAt ||
      !active.bindingGenerationId
    )
      fail('active parent binding');
    const occupancy = () => readOccupancy(occupancyPath(identity.mainRoot))[String(parent)];
    const claim = occupancy();
    if (
      !claim ||
      claim.sid !== sessionId ||
      claim.provider !== 'codex' ||
      claim.worktreePath !== root ||
      claim.bindingGenerationId !== active.bindingGenerationId
    )
      fail('parent occupancy');
    const git = (cwd, ...args) =>
      execFileSync(
        tools.git,
        [
          '--no-pager',
          '--no-replace-objects',
          '--no-optional-locks',
          '-c',
          'core.fsmonitor=false',
          '-C',
          cwd,
          ...args,
        ],
        { encoding: 'utf8', stdio: 'pipe', timeout: 10000, env }
      ).trim();
    const before = [checkout(root, git), checkout(request.childPath, git)];
    if (before[0].branch !== active.worktreeBranch || before[0].common !== before[1].common)
      fail('checkout lineage');
    const configuration = cfg ?? loadConfig({ projectPath: configPath(root) });
    if (!configuration.repo || !configuration.projectId) fail('project authority');
    const remote = await (deps.readRemote ?? readRemote)({
      parent,
      child: request.child,
      cfg: configuration,
    });
    const location = (body, observed) => {
      const value = resolveCurrentIssueWorktreeLocation(body);
      return value?.worktreePath === observed.root && value.worktreeBranch === observed.branch;
    };
    if (
      !remote.login ||
      remote.parent?.number !== parent ||
      remote.child?.number !== request.child ||
      remote.child.parent !== parent ||
      remote.parent.state !== 'OPEN' ||
      remote.child.state !== 'OPEN' ||
      remote.parent.boardState !== 'develop' ||
      remote.child.boardState !== 'review' ||
      singletonOwner(remote.parent.assignees) !== remote.login ||
      singletonOwner(remote.child.assignees) !== remote.login ||
      readLastKnownState(remote.parent.body).state !== 'develop' ||
      readLastKnownState(remote.child.body).state !== 'review' ||
      !location(remote.parent.body, before[0]) ||
      !location(remote.child.body, before[1]) ||
      parseReviewApprovedMarker(remote.child.body)?.approvedSha !== before[1].head
    )
      fail('live delivery authority');
    if (
      !same(active, getActiveTask(sessionId, root)) ||
      !same(claim, occupancy()) ||
      initialEntry !== entryIdentity() ||
      !same(before, [checkout(root, git), checkout(request.childPath, git)])
    )
      fail('observations changed');
    return request.childPath;
  } catch (error) {
    if (error.message?.startsWith('native-merge-back-path:')) throw error;
    fail(error.message || 'authority unavailable');
  }
}
