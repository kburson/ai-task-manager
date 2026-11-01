// @story #1882 #2134 #2068
// cspell:words autostash backlink fsmonitor
// Registered CLI admission and real checkout routing; no alternate merge protocol.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { resolveEpicLineage } from './resolve-epic-lineage.mjs';
import { createMergeBackTestRunner } from './merge-back-verification.mjs';
import { fetchParentIssueBody } from './graph-node-authority.mjs';
import { readOccupancy } from './occupancy.mjs';
import { occupancyPath } from '../paths.mjs';
import { withLock } from '../fleet-registry.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { getActiveTask } from '../session-state.mjs';
import { assertNativeBranchCarrier } from './native-branch-renewal.mjs';
import { GIT_TIMEOUT_MS } from './process-timeouts.mjs';

function argumentsFor(argv) {
  const positional = [];
  let preserveWorktree = false;
  let requestFile;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--preserve-worktree' && !preserveWorktree) preserveWorktree = true;
    else if (
      arg === '--recover-parent' &&
      !requestFile &&
      argv[i + 1] &&
      !argv[i + 1].startsWith('--')
    )
      requestFile = argv[++i];
    else if (arg.startsWith('--'))
      throw new TypeError(`merge-back: unknown or duplicate argument ${arg}`);
    else positional.push(arg);
  }
  const child = Number(String(positional[0] || '').replace(/^#/, ''));
  if (positional.length !== 2 || !Number.isSafeInteger(child) || child <= 0 || !positional[1])
    throw new TypeError(
      'usage: merge-back <child#> <worktree-path> [--preserve-worktree | --recover-parent <request.json>]'
    );
  if (requestFile && preserveWorktree)
    throw new TypeError('merge-back: recovery and integration flags cannot be combined');
  return { child, childDir: path.resolve(positional[1]), preserveWorktree, requestFile };
}

function worktrees(git) {
  return git(['worktree', 'list', '--porcelain', '-z'])
    .split('\0\0')
    .filter(Boolean)
    .map((block) => {
      const fields = block.split('\0');
      return {
        path: fields.find((field) => field.startsWith('worktree '))?.slice(9),
        branch: fields.find((field) => field.startsWith('branch '))?.slice(7),
      };
    });
}

// Porcelain cleanliness does not imply an idle Git checkout: an edit stop or
// empty cherry-pick can have no index/worktree changes and still own recovery data.
function assertNoGitOperation(git) {
  for (const marker of [
    'rebase-merge',
    'rebase-apply',
    'sequencer',
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'REBASE_HEAD',
    'BISECT_LOG',
  ]) {
    if (existsSync(git(['rev-parse', '--path-format=absolute', '--git-path', marker])))
      throw new Error(
        'merge-back: active Git operation ' + marker + '; preserve checkout recovery context'
      );
  }
}

export async function runMergeBackCli(argv, deps) {
  const { child, childDir, preserveWorktree, requestFile } = argumentsFor(argv);
  if (requestFile && realpathSync(deps.invokingDir ?? process.cwd()) !== childDir)
    recoveryRefusal('bound child cwd required');
  const sid = currentSessionId();
  let gitExecutable = 'git';
  if (requestFile && !deps.recoverySession)
    gitExecutable = assertNativeBranchCarrier({ root: childDir, sessionId: sid }).git;
  const projectPath = path.join(childDir, '.ai-task-manager', 'task-tracker.json');
  const raw = JSON.parse(readFileSync(projectPath, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new TypeError('merge-back: invalid child project config');
  const loadConfig = deps.loadConfig || (await import('../config.mjs')).loadConfig;
  const cfg = loadConfig({ projectPath });
  const graph = await deps.loadGraph({ child, cfg });
  const lineage = resolveEpicLineage(child, { deps: { graph, trunk: cfg.trunkRef || 'trunk' } });
  if (!lineage.parentIssue) throw new Error('merge-back: child must have an authoritative parent');
  const parent = resolveEpicLineage(lineage.parentIssue, {
    deps: { graph, trunk: cfg.trunkRef || 'trunk' },
  });
  const now = requestFile ? (deps.recoveryNow ?? (() => performance.now())) : Date.now;
  let criticalDeadline = null;
  const realGit = (cwd) => (args) => {
    const remaining =
      criticalDeadline === null ? GIT_TIMEOUT_MS : Math.floor(criticalDeadline - now());
    if (remaining <= 0) {
      if (requestFile) throw recoveryBudgetError('critical section timed out');
      throw new Error('merge-back: integration critical section timed out');
    }
    return execFileSync(
      gitExecutable,
      requestFile ? ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args] : args,
      {
        cwd,
        encoding: 'utf8',
        timeout: Math.min(GIT_TIMEOUT_MS, remaining),
      }
    ).trim();
  };
  const childGit = realGit(childDir);
  if (lineage.worktreePath && path.resolve(lineage.worktreePath) !== childDir)
    throw new Error('merge-back: supplied child worktree path differs from recorded authority');
  const assertChild = () => {
    assertNoGitOperation(childGit);
    if (childGit(['branch', '--show-current']) !== lineage.branch)
      throw new Error('merge-back: child checked-out branch differs from recorded authority');
    if (!requestFile && childGit(['status', '--porcelain']))
      throw new Error('merge-back: child checkout is dirty');
  };
  assertChild();
  const common = (git) =>
    realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const commonDir = common(childGit);
  const main = worktrees(childGit)[0]?.path;
  if (!main) throw new Error('merge-back: shared repository main checkout unavailable');
  const occupancyFile = occupancyPath(main);
  if (requestFile) {
    const request = recoveryRequest(childDir, requestFile);
    if (parent.role !== 'epic' || parent.branch !== lineage.epicBranch || !lineage.worktreePath)
      recoveryRefusal('inconsistent child or parent graph authority');
    const sessionId = deps.recoverySession ? deps.recoverySession() : sid;
    if (typeof cfg.repo !== 'string' || !cfg.repo.includes('/'))
      recoveryRefusal('configured repository required');
    return withLock(occupancyFile, () => {
      criticalDeadline = now() + 2 * GIT_TIMEOUT_MS;
      return recoverParent({
        request,
        child,
        childDir,
        childBranch: lineage.branch,
        parentIssue: lineage.parentIssue,
        parentBranch: parent.branch,
        repo: cfg.repo,
        main,
        commonDir,
        occupancyFile,
        sessionId,
        assertChild,
        gitExecutable,
        deadline: criticalDeadline,
        now,
      });
    });
  }
  let parentDir, parentGit, temporary, targetHead, writerSnapshot;
  const relevantWriters = () =>
    Object.values(readOccupancy(occupancyFile)).filter(
      (row) =>
        [child, lineage.parentIssue].includes(row.issue) ||
        [childDir, parentDir].includes(path.resolve(row.worktreePath))
    );
  const assertWriters = () => {
    const rows = relevantWriters();
    for (const row of rows) {
      const expected =
        row.issue === child ? childDir : row.issue === lineage.parentIssue ? parentDir : null;
      if (
        row.sid !== sid ||
        (!expected && parentDir) ||
        (expected && path.resolve(row.worktreePath) !== expected)
      )
        throw new Error('merge-back: conflicting live integration writer or occupancy');
    }
    // Heartbeats do not change ownership. Generation, identity and location do.
    const snapshot = JSON.stringify(rows.map(({ lastHeartbeatAt: _heartbeat, ...row }) => row));
    if (writerSnapshot !== undefined && snapshot !== writerSnapshot)
      throw new Error('merge-back: integration occupancy changed during verification');
    return snapshot;
  };
  const withIntegrationLock = (fn) =>
    withLock(occupancyFile, () => {
      criticalDeadline = Date.now() + 2 * GIT_TIMEOUT_MS;
      try {
        return fn();
      } finally {
        criticalDeadline = null;
      }
    });
  const assertIntegrationCheckout = () => {
    assertWriters();
    assertChild();
    if (common(parentGit) !== commonDir)
      throw new Error('merge-back: parent checkout belongs to another repository');
    assertNoGitOperation(parentGit);
    if (parentGit(['branch', '--show-current']) !== parent.branch)
      throw new Error('merge-back: parent checkout branch differs from recorded authority');
    const holders = worktrees(childGit).filter(
      (entry) => entry.branch === 'refs/heads/' + parent.branch
    );
    if (holders.length !== 1 || path.resolve(holders[0].path) !== parentDir)
      throw new Error('merge-back: parent integration checkout registration changed');
    if (parentGit(['status', '--porcelain']))
      throw new Error('merge-back: parent checkout is dirty');
    if (targetHead && parentGit(['rev-parse', 'HEAD']) !== targetHead)
      throw new Error('merge-back: parent target changed during verification');
  };
  try {
    withIntegrationLock(() => {
      assertWriters();
      assertChild();
      // The durable custom branch is authoritative; an obsolete directory is audit history.
      childGit(['check-ref-format', 'refs/heads/' + parent.branch]);
      targetHead = childGit(['rev-parse', '--verify', 'refs/heads/' + parent.branch + '^{commit}']);
      const holders = worktrees(childGit).filter(
        (entry) => entry.branch === 'refs/heads/' + parent.branch
      );
      if (holders.length > 1) throw new Error('merge-back: ambiguous registered parent checkout');
      if (holders.length) parentDir = path.resolve(holders[0].path);
      else {
        const directory = path.join(main, '.tmp', 'aitm', 'integration');
        mkdirSync(directory, { recursive: true });
        temporary = mkdtempSync(path.join(directory, String(lineage.parentIssue) + '-'));
        parentDir = path.join(temporary, 'checkout');
        childGit(['worktree', 'add', parentDir, parent.branch]);
      }
      parentGit = realGit(parentDir);
      writerSnapshot = assertWriters();
      assertIntegrationCheckout();
    });
    const issueBody =
      cfg.verificationProvider == null
        ? ''
        : await (
            deps.fetchIssueBody ||
            ((issue, config) => fetchParentIssueBody({ parentIssue: issue, cfg: config }))
          )(child, cfg);
    const runTests = createMergeBackTestRunner({ cfg, projectDir: childDir, issueBody });
    const trunkTools = await import('./trunk-ref.mjs');
    await (deps.fetchTrunk || trunkTools.fetchTrunk)({ cfg, projectDir: childDir });
    const trunk = await (deps.resolveTrunkRef || trunkTools.resolveTrunkRef)({
      cfg,
      projectDir: childDir,
    });
    return deps.mergeBack({
      child,
      path: childDir,
      preserveWorktree,
      deps: {
        graph,
        git: parentGit,
        worktreeGit: childGit,
        currentWorktreeBranch: () => childGit(['branch', '--show-current']),
        trunk,
        runTests,
        currentWorktreeHead: () => childGit(['rev-parse', 'HEAD']),
        assertIntegrationCheckout,
        withIntegrationLock,
        captureIntegrationTarget: () => {
          targetHead = parentGit(['rev-parse', 'HEAD']);
        },
      },
    });
  } finally {
    if (temporary) {
      // Normal Git removal refuses dirty/conflicted checkouts. Preserve recovery
      // context on failure rather than force-cleaning an interrupted integration.
      try {
        withIntegrationLock(() => {
          assertWriters();
          const cleanupGit = realGit(parentDir);
          assertNoGitOperation(cleanupGit);
          if (cleanupGit(['ls-files', '--others', '--ignored', '--exclude-standard', '-z']))
            throw new Error('merge-back: ignored evidence remains in integration checkout');
          realGit(main)(['worktree', 'remove', parentDir]);
          rmdirSync(temporary);
        });
      } catch (error) {
        process.stderr.write(
          `merge-back: retained integration checkout ${parentDir}: ${error.message}\n`
        );
      }
    }
  }
}

// Recovery operates only on a paused parent created by this CLI. The child owns
// the lease throughout. The request supplies decisions, never Git commands or a parent path.
function recoveryRefusal(reason) {
  throw new Error('merge-back: parent recovery: ' + reason);
}
const digest = (value) => createHash('sha256').update(value).digest('hex');
const exactKeys = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const safeRelative = (name) =>
  typeof name === 'string' &&
  !path.isAbsolute(name) &&
  !name.includes('\\') &&
  [...name].every((character) => character.codePointAt(0) >= 32) &&
  name
    .split('/')
    .every((part) => part && part !== '.' && part !== '..' && part.toLowerCase() !== '.git');
function physicalFile(root, name) {
  if (!safeRelative(name)) recoveryRefusal('unsafe relative path');
  const target = path.join(root, name);
  if (realpathSync(path.dirname(target)) !== path.dirname(target))
    recoveryRefusal('aliased directory');
  return target;
}
function recoveryRequest(root, file) {
  if (!safeRelative(file) || !file.startsWith('.scratch/') || !file.endsWith('.json'))
    recoveryRefusal('project-local .scratch JSON request required');
  const target = physicalFile(root, file);
  const initial = lstatSync(target);
  if (!initial.isFile() || initial.nlink !== 1 || initial.size > 4 * 1024 * 1024)
    recoveryRefusal('invalid request file');
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  let request;
  try {
    const stat = fstatSync(fd);
    if (stat.dev !== initial.dev || stat.ino !== initial.ino || stat.size !== initial.size)
      recoveryRefusal('request file changed');
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) recoveryRefusal('request file shortened');
      offset += count;
    }
    if (fstatSync(fd).mtimeMs !== stat.mtimeMs || realpathSync(target) !== target)
      recoveryRefusal('request file changed');
    request = JSON.parse(bytes.toString('utf8'));
  } finally {
    closeSync(fd);
  }
  if (request?.schema !== 'aitm.merge-back-recovery/v1')
    recoveryRefusal('unsupported request schema');
  if (request.action === 'inspect' && exactKeys(request, ['schema', 'action'])) return request;
  if (
    !exactKeys(request, ['schema', 'action', 'expected', 'resolutions', 'reason']) ||
    !['continue', 'skip'].includes(request.action) ||
    !/^[a-f0-9]{64}$/.test(request.expected) ||
    !Array.isArray(request.resolutions) ||
    typeof request.reason !== 'string' ||
    !request.reason.trim()
  )
    recoveryRefusal('invalid recovery decision');
  return request;
}
function recoveryLease(ctx) {
  const { child, childDir, childBranch, sessionId, parentIssue, occupancyFile } = ctx;
  const record = getActiveTask(sessionId, childDir);
  const rows = Object.values(readOccupancy(occupancyFile));
  const claim = rows.find((row) => row.issue === child);
  if (
    !record ||
    record.issue !== '#' + child ||
    record.kanbanState !== 'develop' ||
    record.pausedAtTs ||
    record.closedAt ||
    !Number.isFinite(Date.parse(record.entryStartTs)) ||
    record.worktreePath !== childDir ||
    record.worktreeBranch !== childBranch ||
    !record.bindingGenerationId ||
    claim?.bindingGenerationId !== record.bindingGenerationId ||
    claim?.sid !== sessionId ||
    claim?.provider !== 'codex' ||
    claim.worktreePath !== childDir ||
    rows.some(
      (row) =>
        row !== claim &&
        (row.issue === parentIssue ||
          row.worktreePath === childDir ||
          row.worktreePath === ctx.parentDir)
    )
  )
    recoveryRefusal('active child lease or competing parent writer');
  return { sessionId, generation: claim.bindingGenerationId, boundAt: claim.boundAt };
}
function recoveryBudgetError(reason) {
  return Object.assign(new Error('merge-back: parent recovery: ' + reason), {
    code: 'RECOVERY_BUDGET',
  });
}
function recoveryGit(ctx, cwd, args, input, minimum = 0) {
  const remaining = Math.floor((ctx.stageDeadline ?? ctx.deadline) - ctx.now());
  if (remaining <= 0 || remaining < minimum)
    throw recoveryBudgetError('insufficient remaining Git budget');
  return execFileSync(
    ctx.gitExecutable,
    ['--no-optional-locks', '--no-replace-objects', '--literal-pathspecs', ...args],
    {
      cwd,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: Math.min(GIT_TIMEOUT_MS, remaining),
      maxBuffer: 64 * 1024 * 1024,
    }
  );
}
const recoveryRead = (ctx, root, args) =>
  recoveryGit(ctx, root, ['-c', 'core.fsmonitor=false', ...args]);
const gitText = (ctx, root, ...args) => recoveryRead(ctx, root, args).toString('utf8').trimEnd();
function sortedMetadata(directory) {
  if (realpathSync(directory) !== directory) recoveryRefusal('aliased rebase metadata');
  const facts = {};
  for (const name of readdirSync(directory).sort()) {
    const file = physicalFile(directory, name);
    if (!lstatSync(file).isFile()) recoveryRefusal('non-file rebase metadata');
    facts[name] = digest(readFileSync(file));
  }
  return facts;
}
function verifiedParentGitDir(ctx, root) {
  const paths = gitText(
    ctx,
    root,
    'rev-parse',
    '--path-format=absolute',
    '--show-toplevel',
    '--git-dir',
    '--git-common-dir'
  ).split('\n');
  const [top, admin, common] = paths;
  if (
    paths.length !== 3 ||
    realpathSync(root) !== root ||
    top !== root ||
    common !== ctx.commonDir ||
    realpathSync(admin) !== admin ||
    path.dirname(admin) !== path.join(common, 'worktrees')
  )
    recoveryRefusal('foreign or unregistered parent repository');
  const marker = path.join(root, '.git');
  const backlink = path.join(admin, 'gitdir');
  if (
    !lstatSync(marker).isFile() ||
    !lstatSync(backlink).isFile() ||
    realpathSync(readFileSync(backlink, 'utf8').trim()) !== marker
  )
    recoveryRefusal('foreign parent registration backlink');
  return admin;
}
function parentRecoveryTarget(ctx) {
  const entries = worktrees((args) => recoveryRead(ctx, ctx.childDir, args).toString('utf8'));
  const directory = path.join(ctx.main, '.tmp', 'aitm', 'integration');
  const found = [];
  for (const entry of entries) {
    const [attempt, leaf, ...rest] = path.relative(directory, entry.path).split(path.sep);
    if (
      !new RegExp('^' + ctx.parentIssue + '-[A-Za-z0-9]+$').test(attempt) ||
      leaf !== 'checkout' ||
      rest.length
    )
      continue;
    if (!lstatSync(entry.path, { throwIfNoEntry: false })?.isDirectory())
      recoveryRefusal('registered retained parent checkout unavailable: ' + entry.path);
    const dir = path.join(verifiedParentGitDir(ctx, entry.path), 'rebase-merge');
    if (!existsSync(dir)) continue;
    if (
      realpathSync(dir) !== dir ||
      !dir.startsWith(ctx.commonDir + path.sep + 'worktrees' + path.sep)
    )
      recoveryRefusal('foreign rebase metadata');
    if (!lstatSync(path.join(dir, 'head-name')).isFile())
      recoveryRefusal('unexpected rebase head-name');
    if (
      readFileSync(path.join(dir, 'head-name'), 'utf8').trim() !==
      'refs/heads/' + ctx.parentBranch
    )
      recoveryRefusal('unexpected rebase parent ref');
    if (entry.branch || gitText(ctx, entry.path, 'branch', '--show-current'))
      recoveryRefusal('paused rebase requires detached parent');
    found.push({ parentDir: entry.path, rebaseDir: dir });
  }
  if (found.length !== 1) recoveryRefusal('expected exactly one retained parent rebase');
  return found[0];
}
function stageEntries(output, tree = false) {
  const entries = new Map();
  if (!Buffer.from(output.toString('utf8')).equals(output))
    recoveryRefusal('unsupported Git pathname encoding');
  for (const field of output.toString('utf8').split('\0').filter(Boolean)) {
    const match = field.match(
      tree ? /^(\d+) (?:blob|commit) ([a-f0-9]+)\t([^]*)$/ : /^(\d+) ([a-f0-9]+) ([0-3])\t([^]*)$/
    );
    if (!match) recoveryRefusal('invalid Git index or tree entry');
    const [, mode, oid] = match,
      file = match[tree ? 3 : 4];
    if (!safeRelative(file)) recoveryRefusal('unsafe indexed path');
    if (!entries.has(file)) entries.set(file, {});
    entries.get(file)[tree ? '0' : match[3]] = { mode, oid };
  }
  return entries;
}
// Inspect raw tracked bytes without asking Git to refresh or normalize them.
// Status and diff-files can execute configured monitors and clean filters.
function trackedSnapshot(ctx, root, entries, conflicts) {
  const hash = createHash('sha256');
  const algorithm = gitText(ctx, root, 'rev-parse', '--show-object-format');
  if (!['sha1', 'sha256'].includes(algorithm)) recoveryRefusal('unsupported object format');
  const unstaged = [];
  for (const [file, stages] of entries) {
    if (ctx.now() >= ctx.deadline) throw recoveryBudgetError('tracked snapshot timed out');
    const target = path.join(root, file);
    let fact = null,
      mode,
      oid;
    try {
      physicalFile(root, file);
      const stat = lstatSync(target);
      let bytes;
      if (stat.isFile()) {
        bytes = readFileSync(target);
        mode = stat.mode & 0o111 ? '100755' : '100644';
        fact = [stat.mode, digest(bytes)];
      } else if (stat.isSymbolicLink()) {
        bytes = readlinkSync(target, { encoding: 'buffer' });
        mode = '120000';
        fact = ['link', digest(bytes)];
      } else recoveryRefusal('unsupported tracked file type');
      oid = createHash(algorithm)
        .update('blob ' + bytes.length + '\0')
        .update(bytes)
        .digest('hex');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (stages[0] && (stages[0].mode !== mode || stages[0].oid !== oid)) unstaged.push(file);
    hash.update(JSON.stringify([file, fact]) + '\n');
    if (conflicts.has(file)) conflicts.get(file).worktree = fact;
  }
  return { trackedDigest: hash.digest('hex'), unstaged };
}
function assertRecoveryChild(ctx) {
  ctx.assertChild();
  const root = ctx.childDir;
  const head = gitText(ctx, root, 'rev-parse', 'HEAD');
  const index = recoveryRead(ctx, root, ['ls-files', '--stage', '-z']);
  const entries = stageEntries(index);
  const committed = stageEntries(recoveryRead(ctx, root, ['ls-tree', '-r', '-z', head]), true);
  if (
    entries.size !== committed.size ||
    [...entries].some(
      ([file, stages]) =>
        !stages[0] ||
        stages[0].mode !== committed.get(file)?.[0]?.mode ||
        stages[0].oid !== committed.get(file)?.[0]?.oid
    ) ||
    trackedSnapshot(ctx, root, entries, new Map()).unstaged.length ||
    recoveryRead(ctx, root, ['ls-files', '--others', '--exclude-standard', '-z']).length
  )
    recoveryRefusal('child checkout is dirty');
  if (
    gitText(ctx, root, 'rev-parse', 'HEAD') !== head ||
    !index.equals(recoveryRead(ctx, root, ['ls-files', '--stage', '-z']))
  )
    recoveryRefusal('child observations changed');
  return head;
}
function pausedSnapshot(ctx) {
  const childHead = assertRecoveryChild(ctx);
  Object.assign(ctx, parentRecoveryTarget(ctx));
  const { parentDir, rebaseDir } = ctx;
  const lease = recoveryLease(ctx);
  const git = (...args) => gitText(ctx, parentDir, ...args);
  for (const marker of [
    'rebase-apply',
    'sequencer',
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'BISECT_LOG',
    'index.lock',
  ])
    if (existsSync(git('rev-parse', '--path-format=absolute', '--git-path', marker)))
      recoveryRefusal('unexpected Git operation ' + marker);
  const metadata = sortedMetadata(rebaseDir);
  const read = (name) => readFileSync(path.join(rebaseDir, name), 'utf8').trim();
  for (const file of ['done', 'git-rebase-todo']) {
    for (const line of read(file).split('\n')) {
      if (line && !line.startsWith('#') && !/^pick [a-f0-9]{7,64}(?:\s|$)/.test(line))
        recoveryRefusal('unsupported rebase instruction');
    }
  }
  if (
    metadata['update-refs'] ||
    metadata['autostash'] ||
    metadata['amend'] ||
    metadata['message-squash']
  )
    recoveryRefusal('unsupported rebase options');
  const original = read('orig-head'),
    stopped = read('stopped-sha'),
    onto = read('onto');
  if (![original, stopped, onto].every((oid) => /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(oid)))
    recoveryRefusal('invalid rebase object identity');
  const lastPick = read('done')
    .split('\n')
    .filter((line) => line.startsWith('pick '))
    .at(-1)
    ?.split(' ')[1];
  if (!lastPick || git('rev-parse', '--verify', lastPick + '^{commit}') !== stopped)
    recoveryRefusal('stopped commit differs from last picked instruction');
  if (
    original !== git('rev-parse', '--verify', 'refs/heads/' + ctx.parentBranch + '^{commit}') ||
    stopped !== git('rev-parse', '--verify', 'REBASE_HEAD^{commit}') ||
    onto !== git('rev-parse', '--verify', onto + '^{commit}')
  )
    recoveryRefusal('parent ref or stopped rebase identity changed');
  const index = recoveryRead(ctx, parentDir, ['ls-files', '--stage', '-z']);
  const entries = stageEntries(index);
  const conflictsByPath = new Map(
    [...entries]
      .filter(([, stages]) => !stages[0])
      .map(([file, stages]) => [file, { path: file, stages }])
  );
  const { trackedDigest, unstaged } = trackedSnapshot(ctx, parentDir, entries, conflictsByPath);
  const conflicts = [...conflictsByPath.values()];
  const extra = (ignored) =>
    recoveryRead(ctx, parentDir, [
      'ls-files',
      '--others',
      ...(ignored ? ['--ignored'] : []),
      '--exclude-standard',
      '-z',
    ])
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
  const facts = {
    repo: ctx.repo,
    commonDir: ctx.commonDir,
    child: ctx.child,
    childDir: ctx.childDir,
    childBranch: ctx.childBranch,
    childHead,
    lease,
    parentIssue: ctx.parentIssue,
    parentRef: ctx.parentBranch,
    parentDir,
    parentHead: git('rev-parse', 'HEAD'),
    original,
    stopped,
    onto,
    rebaseDir,
    metadata,
    indexDigest: digest(
      readFileSync(git('rev-parse', '--path-format=absolute', '--git-path', 'index'))
    ),
    stageDigest: digest(index),
    trackedDigest,
    unstaged,
    conflicts,
    untracked: extra(false),
    ignored: extra(true),
  };
  return {
    result: { status: 'paused', snapshot: digest(JSON.stringify(facts)), ...facts },
    entries,
  };
}
function prepareResolutions(ctx, request, state) {
  const { result, entries } = state;
  if (result.untracked.length || result.ignored.length)
    recoveryRefusal('untracked or ignored parent evidence must be preserved');
  const choices = new Map();
  for (const choice of request.resolutions) {
    const stages = entries.get(choice?.path);
    if (!stages || stages[0] || choices.has(choice.path))
      recoveryRefusal('decision must name each unmerged path exactly once');
    const target = physicalFile(ctx.parentDir, choice.path);
    const info = lstatSync(target, { throwIfNoEntry: false });
    if (info && !info.isFile()) recoveryRefusal('unsupported conflict file type');
    if (Object.values(stages).some(({ mode }) => !['100644', '100755'].includes(mode)))
      recoveryRefusal('unsupported conflict mode');
    let entry, bytes;
    if (exactKeys(choice, ['path', 'stage']) && [2, 3].includes(choice.stage)) {
      entry = stages[choice.stage] ?? null;
    } else if (
      exactKeys(choice, ['path', 'base64', 'sha256']) &&
      typeof choice.base64 === 'string'
    ) {
      bytes = Buffer.from(choice.base64, 'base64');
      if (bytes.toString('base64') !== choice.base64 || digest(bytes) !== choice.sha256)
        recoveryRefusal('custom bytes or digest invalid');
      if (stages[2] && stages[3] && stages[2].mode !== stages[3].mode)
        recoveryRefusal('custom conflict mode is ambiguous');
      const mode = (stages[2] ?? stages[3]).mode;
      entry = {
        mode,
        oid: recoveryGit(ctx, ctx.parentDir, ['hash-object', '--stdin'], bytes).toString().trim(),
      };
    } else recoveryRefusal('unsupported conflict resolution');
    choices.set(choice.path, { entry, bytes, stage: choice.stage });
  }
  if (choices.size !== result.conflicts.length)
    recoveryRefusal('every conflict requires an explicit decision');
  if (result.unstaged.length) recoveryRefusal('unrelated unstaged parent edits must be preserved');
  if (request.action === 'skip') {
    const tree = stageEntries(
      recoveryRead(ctx, ctx.parentDir, ['ls-tree', '-r', '-z', 'HEAD']),
      true
    );
    for (const file of new Set([...entries.keys(), ...tree.keys()])) {
      const actual = choices.has(file) ? choices.get(file).entry : entries.get(file)?.[0];
      const atHead = tree.get(file)?.[0];
      if (actual?.mode !== atHead?.mode || actual?.oid !== atHead?.oid)
        recoveryRefusal('skip requires an empty whole resolved index against HEAD');
    }
  }
  return choices;
}
function stageResolutions(ctx, choices) {
  if (!choices.size) return;
  const changes = [];
  const oidLength = gitText(ctx, ctx.parentDir, 'rev-parse', 'HEAD').length;
  for (const [file, { entry, bytes, stage }] of choices) {
    if (ctx.now() >= ctx.stageDeadline) throw recoveryBudgetError('staging budget exhausted');
    const target = physicalFile(ctx.parentDir, file);
    changes.push('0 ' + '0'.repeat(oidLength) + '\t' + file);
    if (!entry) {
      if (lstatSync(target, { throwIfNoEntry: false })) unlinkSync(target);
      continue;
    }
    if (bytes) {
      if (
        recoveryGit(ctx, ctx.parentDir, ['hash-object', '-w', '--stdin'], bytes)
          .toString()
          .trim() !== entry.oid
      )
        recoveryRefusal('custom blob changed');
      // Replace this pathname without ever writing its previous inode: it may
      // also be linked to operator evidence outside the checkout.
      const sibling = path.join(path.dirname(target), '.aitm-resolution-' + randomUUID());
      const fd = openSync(
        sibling,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600
      );
      const created = fstatSync(fd);
      const ownsSibling = () => {
        const current = lstatSync(sibling, { throwIfNoEntry: false });
        return current?.dev === created.dev && current?.ino === created.ino;
      };
      try {
        try {
          writeFileSync(fd, bytes);
          fchmodSync(fd, entry.mode === '100755' ? 0o755 : 0o644);
        } finally {
          closeSync(fd);
        }
        if (!ownsSibling()) recoveryRefusal('custom temporary file changed');
        if (ctx.now() >= ctx.stageDeadline) throw recoveryBudgetError('staging budget exhausted');
        renameSync(sibling, physicalFile(ctx.parentDir, file));
      } catch (error) {
        if (ownsSibling()) unlinkSync(sibling);
        throw error;
      }
    } else {
      recoveryGit(ctx, ctx.parentDir, [
        'checkout-index',
        '--force',
        '--stage=' + stage,
        '--',
        file,
      ]);
    }
    changes.push(entry.mode + ' ' + entry.oid + '\t' + file);
  }
  // Publish the resolved index last. An interruption writing working files
  // leaves every conflict stage available to inspect and choose again.
  recoveryGit(
    ctx,
    ctx.parentDir,
    ['update-index', '-z', '--index-info'],
    changes.join('\0') + '\0'
  );
}
function recoverParent(ctx) {
  const state = pausedSnapshot(ctx);
  const { request } = ctx;
  if (request.action === 'inspect') return state.result;
  if (request.expected !== state.result.snapshot)
    recoveryRefusal('stale recovery snapshot; inspect again');
  const choices = prepareResolutions(ctx, request, state);
  if (pausedSnapshot(ctx).result.snapshot !== request.expected)
    recoveryRefusal('recovery observations changed before mutation');
  const decision = {
    action: request.action,
    reason: request.reason,
    stopped: state.result.stopped,
    snapshot: request.expected,
  };
  // The admission scans and mutation share one lock deadline. Reserve a full
  // Git invocation before any conflict file/index write, and keep that reserve
  // inaccessible to staging even if a filter or filesystem operation is slow.
  const stageDeadline = ctx.deadline - GIT_TIMEOUT_MS;
  if (stageDeadline - ctx.now() < (request.action === 'continue' && choices.size ? 1000 : 1))
    recoveryRefusal('insufficient recovery budget before mutation; inspect and retry');
  if (request.action === 'continue') {
    try {
      stageResolutions({ ...ctx, stageDeadline }, choices);
    } catch (error) {
      if (interruptedGit(error)) return interruptedResult(ctx, state, decision, 'staging', error);
      throw error;
    }
  }
  let failure;
  try {
    recoveryGit(
      ctx,
      ctx.parentDir,
      ['-c', 'core.editor=:', 'rebase', '--' + request.action],
      undefined,
      GIT_TIMEOUT_MS
    );
  } catch (error) {
    if (interruptedGit(error))
      return interruptedResult(
        ctx,
        state,
        decision,
        error.code === 'RECOVERY_BUDGET' ? 'rebase-admission' : 'rebase',
        error
      );
    failure = error;
  }
  if (ctx.now() >= ctx.deadline)
    return interruptedResult(
      ctx,
      state,
      decision,
      'readback',
      failure ?? recoveryBudgetError('post-step observations unavailable')
    );
  try {
    return readRecoveryOutcome(ctx, state, decision, failure);
  } catch (error) {
    if (interruptedGit(error))
      return interruptedResult(ctx, state, decision, 'readback', failure ?? error);
    if (failure && error !== failure)
      throw new Error(failure.message + '\nParent recovery readback: ' + error.message, {
        cause: failure,
      });
    throw error;
  }
}
function interruptedGit(error) {
  return Boolean(error.signal || error.code === 'ETIMEDOUT' || error.code === 'RECOVERY_BUDGET');
}
function interruptedResult(ctx, state, decision, phase, error) {
  // These are pre-step identities and an existence check only. A killed or
  // unverified command is never reported as a completed or actionable pause.
  return {
    status: 'interrupted',
    phase,
    decision,
    signal: error.signal ?? null,
    code: error.code ?? null,
    cause: error.message,
    parentDir: ctx.parentDir,
    parentRef: ctx.parentBranch,
    rebaseMetadataPresent: existsSync(ctx.rebaseDir),
    childHeadBeforeStep: state.result.childHead,
    leaseBeforeStep: state.result.lease,
  };
}
function readRecoveryOutcome(ctx, state, decision, failure) {
  const afterLease = recoveryLease(ctx);
  const childHead = assertRecoveryChild(ctx);
  if (
    JSON.stringify(afterLease) !== JSON.stringify(state.result.lease) ||
    childHead !== state.result.childHead
  )
    recoveryRefusal('child authority changed during parent recovery');
  if (existsSync(ctx.rebaseDir)) {
    const next = pausedSnapshot(ctx).result;
    if (
      failure &&
      (failure.signal || next.stopped === state.result.stopped || !next.conflicts.length)
    )
      throw failure;
    return { ...next, decision };
  }
  if (failure) throw failure;
  const head = gitText(ctx, ctx.parentDir, 'rev-parse', 'HEAD');
  verifiedParentGitDir(ctx, ctx.parentDir);
  const holders = worktrees((args) =>
    recoveryRead(ctx, ctx.childDir, args).toString('utf8')
  ).filter((entry) => entry.branch === 'refs/heads/' + ctx.parentBranch);
  if (
    holders.length !== 1 ||
    holders[0].path !== ctx.parentDir ||
    gitText(ctx, ctx.parentDir, 'branch', '--show-current') !== ctx.parentBranch ||
    gitText(ctx, ctx.childDir, 'rev-parse', 'refs/heads/' + ctx.parentBranch) !== head
  )
    recoveryRefusal('unexpected completed parent branch');
  return {
    status: 'completed',
    parentRef: ctx.parentBranch,
    parentDir: ctx.parentDir,
    parentHead: head,
    childHead: state.result.childHead,
    lease: afterLease,
    decision,
  };
}
