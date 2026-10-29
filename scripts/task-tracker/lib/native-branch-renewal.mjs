// @story #2093 #2105
// Read-only admission for one native Start; existing bind writers own all effects.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import { pexec } from '../../gh/lib/gh-client.mjs';
import { getActiveTask } from '../session-state.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { occupancyPath } from '../paths.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { loadConfig } from '../config.mjs';
import { readOccupancy } from './occupancy.mjs';
import { ownershipDecision } from './ownership-policy.mjs';
import { fetchAssignmentSnapshot } from './assignment-snapshot.mjs';
import { resolveCurrentIssueWorktreeLocation } from './issue-worktree-location.mjs';
import { readPhysicalRuntimeIdentity } from './runtime-storage.mjs';
import { readWorktreeIdentity } from './worktree-binding-guard.mjs';
import { hasUnsupportedGitEnvironment } from './mutation-context.mjs';
import {
  resolveNativeReadTools,
  assertNativeHookSession,
  assertNativeSession,
} from './native-worktree-bootstrap.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

const states = new Set(['backlog', 'refine', 'ready-for-plan', 'plan', 'develop']);
const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
function refuse(reason) {
  throw new Error('native-branch-renewal: ' + reason);
}

export function branchRenewalArgv(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== 5 ||
    argv[0] !== 'start' ||
    !/^[1-9]\d*$/.test(argv[1]) ||
    argv[2] !== '--role' ||
    !['agent', 'orchestrator'].includes(argv[3]) ||
    argv[4] !== '--confirm-relocation'
  )
    return null;
  const issueNumber = Number(argv[1]);
  return Number.isSafeInteger(issueNumber) ? { issueNumber, role: argv[3] } : null;
}

export function branchRenewalCommand(command) {
  if (typeof command !== 'string') return null;
  const match = command.match(
    /^(?:npx aitm|node_modules\/@kburson\/ai-task-manager\/bin\/aitm\.mjs) start ([1-9]\d*) --role (agent|orchestrator) --confirm-relocation$/
  );
  return match?.[0] === command
    ? branchRenewalArgv(['start', match[1], '--role', match[2], '--confirm-relocation'])
    : null;
}

function physicalParents(root, target) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    refuse('foreign source path');
  let directory = root;
  for (const part of relative.split(path.sep).slice(0, -1)) {
    directory = path.join(directory, part);
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) refuse('nonphysical source ancestry');
  }
}

// Git plumbing and raw object bytes avoid executing clean filters or fsmonitor.
function inspectCleanCheckout(root, identity, oldBranch, newBranch, git) {
  for (const branch of [oldBranch, newBranch]) {
    if (typeof branch !== 'string' || branch === 'HEAD') refuse('detached or missing branch');
    git('check-ref-format', 'refs/heads/' + branch);
  }
  const refs = () => [
    git('rev-parse', '--verify', 'HEAD^{commit}').trim(),
    ...[oldBranch, newBranch].map((branch) =>
      git('rev-parse', '--verify', 'refs/heads/' + branch + '^{commit}').trim()
    ),
  ];
  const before = refs();
  if (!before.every((value) => sha.test(value) && value === before[0]))
    refuse('changed source commit');
  const log = path.join(identity.worktreeIdentity.gitDir, 'logs', 'HEAD');
  physicalParents(identity.worktreeIdentity.gitDir, log);
  const logStat = lstatSync(log);
  if (!logStat.isFile() || logStat.isSymbolicLink()) refuse('nonphysical checkout observation');
  const last = readFileSync(log, 'utf8').trimEnd().split('\n').at(-1);
  if (
    !last?.endsWith('\tcheckout: moving from ' + oldBranch + ' to ' + newBranch) ||
    last.split(' ')[0] !== before[0] ||
    last.split(' ')[1] !== before[0]
  )
    refuse('ambiguous branch-only checkout');
  git('diff-index', '--cached', '--quiet', 'HEAD', '--');
  const indexed = git('ls-files', '--stage', '-z');
  if (!indexed) refuse('empty source inventory');
  const algorithm = git('rev-parse', '--show-object-format').trim();
  if (!['sha1', 'sha256'].includes(algorithm)) refuse('unsupported Git object format');
  for (const entry of indexed.split('\0').filter(Boolean)) {
    const match = entry.match(/^(100644|100755|120000) ([a-f0-9]+) 0\t([\s\S]+)$/);
    if (!match) refuse('unsupported or conflicted index');
    const [, mode, expected, name] = match,
      file = path.join(root, name);
    physicalParents(root, file);
    const stat = lstatSync(file);
    let bytes;
    if (mode === '120000') {
      if (!stat.isSymbolicLink()) refuse('changed source type');
      bytes = Buffer.from(readlinkSync(file));
    } else {
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        Boolean(stat.mode & 0o111) !== (mode === '100755')
      )
        refuse('changed source type or mode');
      bytes = readFileSync(file);
    }
    const actual = createHash(algorithm)
      .update('blob ' + bytes.length + '\0')
      .update(bytes)
      .digest('hex');
    if (actual !== expected) refuse('dirty source bytes');
  }
  if (git('ls-files', '--others', '--exclude-standard', '-z')) refuse('untracked source');
  if (
    git('ls-files', '--stage', '-z') !== indexed ||
    JSON.stringify(refs()) !== JSON.stringify(before)
  )
    refuse('source observation changed');
  return before[0];
}

async function readRemote(issueNumber, cfg) {
  const snapshot = await fetchAssignmentSnapshot({ issueNumber, cfg });
  const user = await pexec('gh', ['api', 'user', '--jq', '.login'], { timeout: GH_API_TIMEOUT_MS });
  const issue = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', cfg.repo, '--json', 'state,body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return { snapshot, currentUser: user.stdout.trim(), issue: JSON.parse(issue.stdout) };
}

export async function inspectNativeBranchRenewal({
  request,
  root,
  sessionId,
  identitySource = 'hook',
  env = process.env,
  cfg,
  deps = {},
}) {
  if (
    !request ||
    !Number.isSafeInteger(request.issueNumber) ||
    !['agent', 'orchestrator'].includes(request.role)
  )
    refuse('unsupported Start request');
  if (identitySource === 'hook') assertNativeHookSession(sessionId, env);
  else if (identitySource === 'cli') assertNativeSession(sessionId, env);
  else refuse('unknown identity source');
  if (env.AI_TASK_MANAGER_APP_NAME && env.AI_TASK_MANAGER_APP_NAME !== 'codex')
    refuse('provider identity override');
  if (hasUnsupportedGitEnvironment(env) || env.TT_SKIP_NETWORK === '1' || env.AITM_EVIDENCE_CONTEXT)
    refuse('unsupported execution environment');
  for (const [key, value] of Object.entries(env)) {
    if (
      key.startsWith('BASH_FUNC_') ||
      (value &&
        /^(?:BASH_ENV|ENV|NODE_OPTIONS|SHELLOPTS|BASHOPTS|CDPATH|LD_PRELOAD|DYLD_.*|GIT_(?!(?:AUTHOR_(?:NAME|EMAIL|DATE)|COMMITTER_(?:NAME|EMAIL|DATE)|PAGER|TERMINAL_PROMPT)$).+|npm_config_(?:node_options|script_shell|onload_script|onloadscript))$/i.test(
          key
        ))
    )
      refuse('execution environment injection');
  }
  const tools = resolveNativeReadTools({ root, env });
  const identity = (deps.readIdentity ?? readPhysicalRuntimeIdentity)(root);
  if (identity.projectRoot !== root || path.resolve(root) !== root)
    refuse('foreign or aliased root');
  const record = (deps.getActiveTask ?? getActiveTask)(sessionId, root);
  const invoking = (deps.readWorktreeIdentity ?? readWorktreeIdentity)({ projectDir: root });
  if (
    record?.issue !== '#' + request.issueNumber ||
    record.worktreePath !== root ||
    !record.worktreeBranch ||
    record.worktreeBranch === invoking.worktreeBranch ||
    invoking.worktreePath !== root ||
    !states.has(record.kanbanState) ||
    !Number.isFinite(Date.parse(record.entryStartTs)) ||
    !record.bindingGenerationId ||
    record.closedAt
  )
    refuse('active binding mismatch');
  const occupancy = (deps.readOccupancy ?? readOccupancy)(occupancyPath(identity.mainRoot))[
    String(request.issueNumber)
  ];
  if (
    !occupancy ||
    occupancy.sid !== sessionId ||
    occupancy.provider !== 'codex' ||
    occupancy.worktreePath !== root ||
    occupancy.bindingGenerationId !== record.bindingGenerationId
  )
    refuse('occupancy or generation mismatch');
  const git = (...args) =>
    (deps.execFileSync ?? execFileSync)(
      tools.git,
      ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, ...args],
      { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }
    );
  const head = inspectCleanCheckout(
    root,
    identity,
    record.worktreeBranch,
    invoking.worktreeBranch,
    git
  );
  const configuration =
    cfg ?? loadConfig({ projectPath: path.join(root, '.ai-task-manager/task-tracker.json') });
  const remote = await (deps.readRemote ?? readRemote)(request.issueNumber, configuration);
  const state = remote.snapshot?.state;
  const owners = ownershipDecision({
    state,
    assignees: remote.snapshot?.assignees,
    currentUser: remote.currentUser,
  });
  if (
    !owners.ok ||
    owners.kind !== 'owned-by-session' ||
    owners.owners.length !== 1 ||
    remote.issue?.state !== 'OPEN' ||
    state !== record.kanbanState ||
    readLastKnownState(remote.issue.body).state !== state
  )
    refuse('live owner or state mismatch');
  const location = resolveCurrentIssueWorktreeLocation(remote.issue.body);
  if (
    !location ||
    location.sessionId !== sessionId ||
    location.worktreePath !== root ||
    location.worktreeBranch !== record.worktreeBranch
  )
    refuse('durable location mismatch');
  // Remote observation grants no lease: recheck local source and generation before returning.
  if (
    JSON.stringify((deps.getActiveTask ?? getActiveTask)(sessionId, root)) !==
      JSON.stringify(record) ||
    JSON.stringify(
      (deps.readOccupancy ?? readOccupancy)(occupancyPath(identity.mainRoot))[
        String(request.issueNumber)
      ]
    ) !== JSON.stringify(occupancy) ||
    inspectCleanCheckout(root, identity, record.worktreeBranch, invoking.worktreeBranch, git) !==
      head
  )
    refuse('renewal observations changed');
  return {
    issueNumber: request.issueNumber,
    root,
    oldBranch: record.worktreeBranch,
    newBranch: invoking.worktreeBranch,
    head,
    bindingGenerationId: record.bindingGenerationId,
  };
}

export async function enforceNativeBranchRenewalEntry({ argv, root, cfg, env = process.env }) {
  if (!env.CODEX_THREAD_ID && !env.CODEX_SESSION_ID) return null;
  if (argv?.[0] !== 'start') return null;
  const sid = currentSessionId();
  assertNativeSession(sid, env);
  const record = getActiveTask(sid, root);
  if (
    !record?.issue ||
    record.worktreeBranch === readWorktreeIdentity({ projectDir: root }).worktreeBranch
  )
    return null;
  const request = branchRenewalArgv(argv);
  if (!request) refuse('unsupported Start renewal');
  return inspectNativeBranchRenewal({
    request,
    root,
    sessionId: sid,
    identitySource: 'cli',
    env,
    cfg,
  });
}
