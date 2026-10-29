// @story #2014
// cspell:ignore objectname
// Physical recovery consumes retained authority; it neither grants a wave nor changes refs.
import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { exactRankWaveKeys, selectRankWaveRecord } from './epic-rank-wave-authority.mjs';
import { isStrictCompletedDone } from './epic-rank-wave-policy.mjs';
import { history, verifyHistorySources } from './epic-rank-wave-store.mjs';
import { resolveCurrentIssueWorktreeLocation } from './issue-worktree-location.mjs';
import { discoverRankWavePhysical, rankWaveGitEnv } from './epic-rank-wave-bindings.mjs';
import { canonicalRecordJson } from './github-records/canonical-json.mjs';

const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
function refuse(code) {
  const error = new Error(`rank-wave-restore-${code}`);
  error.code = error.message;
  throw error;
}
export function verifyWorktreeRecoveryParent({
  epic,
  role,
  sid,
  provider,
  repository,
  observedRepository,
  active,
  claim,
  user,
  issue,
  binding,
  native,
  parentContract,
  location,
}) {
  if (
    role !== 'orchestrator' ||
    observedRepository !== repository ||
    active?.issue !== `#${epic}` ||
    !Number.isFinite(Date.parse(active.entryStartTs)) ||
    active.pausedAtTs ||
    active.closedAt ||
    claim?.issue !== epic ||
    claim.sid !== sid ||
    claim.provider !== provider ||
    !claim.bindingGenerationId ||
    claim.bindingGenerationId !== active.bindingGenerationId ||
    binding?.generation !== claim.bindingGenerationId ||
    binding.issue !== epic ||
    binding.provider !== provider ||
    binding.sessionId !== sid ||
    binding.branch !== active.worktreeBranch ||
    issue?.number !== epic ||
    issue.state !== 'OPEN' ||
    !parentContract ||
    !user?.login ||
    issue.assignees?.length !== 1 ||
    issue.assignees[0].login?.toLowerCase() !== user.login.toLowerCase() ||
    native?.verified !== true ||
    native.sessionId !== sid ||
    location?.worktreePath !== binding.worktree ||
    location.worktreeBranch !== binding.branch
  )
    refuse('parent-authority');
  return binding;
}
export function validateWorktreeRestoreSelector(input) {
  exactRankWaveKeys(input, ['schema', 'rank', 'child', 'retainedDigest', 'expectedHead']);
  if (
    input.schema !== 'aitm.epic-wave-restore-worktree/v1' ||
    typeof input.rank !== 'number' ||
    !Number.isFinite(input.rank) ||
    input.rank < 0 ||
    !Number.isSafeInteger(input.child) ||
    input.child <= 0 ||
    !/^[a-f0-9]{64}$/.test(input.retainedDigest) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.expectedHead)
  )
    refuse('selector');
  return input;
}
function git(projectDir, args) {
  return String(
    execFileSync('git', args, {
      cwd: projectDir,
      env: rankWaveGitEnv(),
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  );
}
function inspectPath(destination) {
  if (
    !path.isAbsolute(destination) ||
    path.normalize(destination) !== destination ||
    /[\r\n\0]/.test(destination)
  )
    refuse('path');
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid)) refuse('ownership-unavailable');
  let prefix = path.parse(destination).root,
    exists = true;
  const identities = [];
  for (const segment of destination.slice(prefix.length).split(path.sep)) {
    prefix = path.join(prefix, segment);
    let stat;
    try {
      stat = lstatSync(prefix);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      exists = false;
      break;
    }
    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      (stat.uid !== uid && stat.uid !== 0) ||
      stat.mode & 0o022
    )
      refuse('path-ownership');
    identities.push({
      path: prefix,
      dev: String(stat.dev),
      ino: String(stat.ino),
      uid: stat.uid,
      mode: stat.mode,
    });
  }
  if (!identities.length || identities.at(-1).uid !== uid) refuse('path-owner');
  if (exists && realpathSync(destination) !== destination) refuse('path-alias');
  return { exists, identities };
}
function canonicalMissingPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) refuse('claim-path-unreadable');
  const missing = [];
  let current = value;
  for (;;) {
    try {
      return path.join(realpathSync(current), ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}
function registrations(projectDir) {
  const rows = [];
  for (const block of git(projectDir, ['worktree', 'list', '--porcelain', '-z'])
    .split('\0\0')
    .filter(Boolean)) {
    const row = {};
    for (const field of block.split('\0').filter(Boolean)) {
      const space = field.indexOf(' '),
        key = space < 0 ? field : field.slice(0, space);
      if (Object.hasOwn(row, key)) refuse('registration-unreadable');
      row[key] = space < 0 ? true : field.slice(space + 1);
    }
    if (!row.worktree || !row.HEAD) refuse('registration-unreadable');
    rows.push(row);
  }
  return rows;
}
function physical({ projectDir, parent, binding, expectedHead }) {
  if (
    !same(discoverRankWavePhysical(projectDir), {
      worktree: parent.worktree,
      branch: parent.branch,
      commonDir: parent.commonDir,
    }) ||
    binding.commonDir !== parent.commonDir ||
    binding.worktree === parent.worktree ||
    binding.branch === parent.branch
  )
    refuse('repository-or-parent-drift');
  git(projectDir, ['check-ref-format', `refs/heads/${binding.branch}`]);
  const branchHead = git(projectDir, [
    'rev-parse',
    '--verify',
    `refs/heads/${binding.branch}^{commit}`,
  ]).trim();
  if (branchHead !== expectedHead) refuse('branch-head');
  const parentHead = git(projectDir, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  try {
    git(projectDir, ['merge-base', '--is-ancestor', expectedHead, parentHead]);
  } catch {
    refuse('source-ancestry');
  }
  const observedPath = inspectPath(binding.worktree);
  const rows = registrations(projectDir);
  const matches = rows.filter(
    (r) =>
      canonicalMissingPath(r.worktree) === binding.worktree ||
      r.branch === `refs/heads/${binding.branch}`
  );
  if (!observedPath.exists) {
    if (matches.length) refuse('stale-or-conflicting-registration');
  } else {
    if (
      matches.length !== 1 ||
      matches[0].worktree !== binding.worktree ||
      matches[0].branch !== `refs/heads/${binding.branch}` ||
      matches[0].HEAD !== expectedHead ||
      matches[0].locked ||
      matches[0].prunable ||
      matches[0].bare ||
      matches[0].detached
    )
      refuse('registration-conflict');
    const metadata = lstatSync(path.join(binding.worktree, '.git'));
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.uid !== process.getuid() ||
      metadata.mode & 0o022
    )
      refuse('checkout-ownership');
    if (
      !same(discoverRankWavePhysical(binding.worktree), {
        worktree: binding.worktree,
        branch: binding.branch,
        commonDir: binding.commonDir,
      }) ||
      git(binding.worktree, ['rev-parse', 'HEAD']).trim() !== expectedHead ||
      git(binding.worktree, ['status', '--porcelain=v1', '--untracked-files=all']).trim()
    )
      refuse('checkout-mismatch-or-dirty');
    // Keep an empty unregistered collision a refusal; never populate it opportunistically.
    if (!readdirSync(binding.worktree).includes('.git')) refuse('path-collision');
  }
  return {
    path: observedPath,
    rows,
    branchHead,
    parentHead,
    refs: git(projectDir, ['for-each-ref', '--format=%(refname) %(objectname)']),
  };
}
async function authority({ repository, epic, input, now, runtime }) {
  const parent = await runtime.assertRecoveryParent(epic);
  if (parent?.issue !== epic) refuse('parent');
  const comments = await history(runtime, epic);
  const selected = selectRankWaveRecord(
    comments.map((c) => c.wave),
    { repository, epic, rank: input.rank, now }
  );
  if (selected.status === 'malformed') refuse('history');
  const retained = comments.filter((c) => c.wave.digest === input.retainedDigest);
  if (retained.length !== 1) refuse('retained-digest');
  const record = retained[0].wave.record;
  if (
    record.repository !== repository ||
    record.epic !== epic ||
    record.rank !== input.rank ||
    record.action === 'revoke'
  )
    refuse('retained-scope');
  const prefix = comments.filter(
    (c) => c.wave.record.rank === record.rank && c.wave.record.revision <= record.revision
  );
  const sourceRefusal = await verifyHistorySources(prefix, {
    repository,
    epic,
    rank: record.rank,
    now: record.createdAt,
    runtime,
  });
  if (sourceRefusal) refuse('historical-source');
  const binding = record.bindings.find((b) => b.issue === input.child);
  if (
    !binding ||
    !record.members.includes(input.child) ||
    binding.commonDir !== parent.commonDir ||
    record.parent.commonDir !== parent.commonDir ||
    binding.issue === parent.issue
  )
    refuse('retained-child');
  const snapshot = await runtime.readSnapshot(epic, input.rank, { includeBindings: false });
  const children = snapshot.children.filter((c) => c.number === input.child);
  if (
    children.length !== 1 ||
    children[0].rank !== input.rank ||
    !isStrictCompletedDone(children[0])
  )
    refuse('child-not-completed-direct-member');
  const location = resolveCurrentIssueWorktreeLocation(children[0].body);
  if (
    !location ||
    location.worktreePath !== binding.worktree ||
    location.worktreeBranch !== binding.branch
  )
    refuse('location-drift');
  const native = await runtime.verifyRetainedNative(binding);
  if (native?.verified !== true || native.sessionId !== binding.sessionId)
    refuse('retained-native');
  const claims = await runtime.readRecoveryClaims(binding);
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) refuse('claims-unreadable');
  if (
    Object.values(claims).some(
      (row) =>
        row.issue === binding.issue || canonicalMissingPath(row.worktreePath) === binding.worktree
    )
  )
    refuse('claim-conflict');
  // Snapshot enrichment includes Maps and optional diagnostics; retain only the
  // authoritative completion, membership and issue-body facts for race checks.
  const child = Object.fromEntries(
    ['number', 'rank', 'boardState', 'issueState', 'closeReason', 'recoveryPhase', 'body'].map(
      (key) => [key, children[0][key]]
    )
  );
  return { parent, binding, record, child };
}
export async function restoreRankWaveWorktree(args) {
  let attempted = false,
    tuple = null;
  try {
    const { input, runtime } = args;
    validateWorktreeRestoreSelector(input);
    if (!runtime?.projectDir || typeof runtime.withLock !== 'function')
      refuse('registered-lock-required');
    return await runtime.withLock(async () => {
      const first = await authority(args);
      tuple = {
        child: input.child,
        retainedDigest: input.retainedDigest,
        ...first.binding,
        expectedHead: input.expectedHead,
      };
      const before = physical({
        projectDir: runtime.projectDir,
        ...first,
        expectedHead: input.expectedHead,
      });
      const current = await authority(args);
      if (!same(first, current)) refuse('authority-changed');
      const final = physical({
        projectDir: runtime.projectDir,
        ...current,
        expectedHead: input.expectedHead,
      });
      if (!same(before, final)) refuse('physical-changed');
      if (final.path.exists)
        return { status: 'already-restored', ...tuple, parentHead: final.parentHead };
      attempted = true;
      await runtime.addRestoredWorktree(current.binding);
      const after = await authority(args);
      if (!same(current, after)) refuse('authority-changed-after-effect');
      const readback = physical({
        projectDir: runtime.projectDir,
        ...after,
        expectedHead: input.expectedHead,
      });
      if (
        !readback.path.exists ||
        !same(
          before.path.identities,
          readback.path.identities.slice(0, before.path.identities.length)
        ) ||
        readback.refs !== before.refs ||
        readback.parentHead !== before.parentHead ||
        !same(
          readback.rows.filter((r) => r.worktree !== after.binding.worktree),
          before.rows
        )
      )
        refuse('readback');
      return { status: 'restored', ...tuple, parentHead: readback.parentHead };
    });
  } catch (error) {
    return {
      status: attempted ? 'indeterminate' : 'blocked',
      code: error.code?.startsWith?.('rank-wave-restore-')
        ? error.code
        : 'rank-wave-restore-unavailable',
      detail: error.message,
      ...(tuple ? { tuple } : {}),
    };
  }
}
