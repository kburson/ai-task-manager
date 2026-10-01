// @story #1859
import * as defaultFs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pexec } from '../../../gh/lib/gh-client.mjs';
import {
  resolveCurrentSessionWorktreeBinding,
  readWorktreeIdentity,
} from '../worktree-binding-guard.mjs';
import { readBoundState } from '../bound-state.mjs';
import { fetchAssignmentSnapshot, singletonOwner } from '../assignment-snapshot.mjs';
import { canonicalLogin } from '../ownership-policy.mjs';
import { hasUnsupportedGitEnvironment } from '../mutation-context.mjs';
import { isAllowed } from '../../activity-policy.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import {
  LIMITS,
  parseManifest,
  validateManifest,
  validateRelativePath,
  sha256,
  refuse,
  ReviewedScopeError,
} from './model.mjs';

export async function readEvidenceContext({
  projectDir,
  invokingDir = process.cwd(),
  issueNumber,
  cfg,
  deps = {},
}) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) refuse('reviewed-scope-issue');
  if (!cfg?.repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cfg.repo))
    refuse('reviewed-scope-repository');
  if (hasUnsupportedGitEnvironment())
    refuse('reviewed-scope-worktree', 'unsupported Git environment');
  const fs = deps.fs ?? defaultFs;
  const binding = await (
    deps.resolveCurrentSessionWorktreeBinding ?? resolveCurrentSessionWorktreeBinding
  )({ invokingDir, deps });
  if (!binding || binding.issueNumber !== issueNumber)
    refuse('reviewed-scope-issue', 'exact session binding required');
  const identity = deps.readWorktreeIdentity ?? readWorktreeIdentity;
  const invoking = await identity({ projectDir: invokingDir });
  const observed = await identity({ projectDir });
  const worktree = await fs.realpath(binding.worktreePath);
  if (
    binding.worktreePath !== worktree ||
    (await fs.realpath(observed.worktreePath)) !== worktree ||
    (await fs.realpath(invoking.worktreePath)) !== worktree
  )
    refuse('reviewed-scope-worktree');
  if (
    !binding.worktreeBranch ||
    binding.worktreeBranch === 'HEAD' ||
    observed.worktreeBranch !== binding.worktreeBranch ||
    invoking.worktreeBranch !== binding.worktreeBranch
  )
    refuse('reviewed-scope-branch');
  const bound = await (deps.readBoundState ?? readBoundState)(worktree, {
    sessionId: deps.sessionId,
  });
  if (bound?.activeIssue !== `#${issueNumber}`) refuse('reviewed-scope-issue');
  const result = await (deps.pexec ?? pexec)('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: projectDir,
    encoding: 'utf8',
  });
  const head = String(result.stdout).trim();
  if (!/^[a-f0-9]{40}$/.test(head)) refuse('reviewed-scope-head');
  return {
    repository: cfg.repo,
    issue: issueNumber,
    worktree,
    branch: observed.worktreeBranch,
    head,
    state: bound.state,
  };
}
export async function readRecordingAuthority(options) {
  const { cfg, deps = {} } = options;
  const context = await readEvidenceContext(options);
  const snapshot = await (deps.fetchAssignmentSnapshot ?? fetchAssignmentSnapshot)({
    issueNumber: context.issue,
    cfg,
    deps,
  });
  if (
    !['develop', 'test'].includes(snapshot?.state) ||
    snapshot.state !== context.state ||
    !isAllowed(snapshot.state, 'WRITE_ISSUE')
  )
    refuse('reviewed-scope-state');
  const response = await (deps.pexec ?? pexec)(
    'gh',
    ['api', 'user', '--jq', '{id:(.id|tostring),login}'],
    { encoding: 'utf8' }
  );
  let user;
  try {
    user = JSON.parse(response.stdout);
  } catch {
    refuse('reviewed-scope-actor');
  }
  const actor = {
    id: typeof user.id === 'number' && Number.isSafeInteger(user.id) ? String(user.id) : user.id,
    login: canonicalLogin(user.login),
  };
  if (
    typeof actor.id !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(actor.id) ||
    !actor.login ||
    singletonOwner(snapshot.assignees) !== actor.login
  )
    refuse('reviewed-scope-actor');
  return { ...context, actor, assignees: snapshot.assignees };
}
function contained(root, value) {
  return value.startsWith(root + path.sep);
}
function sameIdentity(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}
function sameVersion(a, b) {
  return (
    sameIdentity(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs
  );
}
async function checkedPath(fs, root, relative) {
  validateRelativePath(relative);
  if ((await fs.realpath(root)) !== root) refuse('reviewed-scope-artifact-path');
  const lexical = path.resolve(root, relative);
  if (!contained(root, lexical)) refuse('reviewed-scope-artifact-path');
  let cursor = root;
  const parts = relative.split('/');
  const rootStat = await fs.lstat(root, { bigint: true });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) refuse('reviewed-scope-artifact-path');
  for (let index = 0; index < parts.length; index++) {
    cursor = path.join(cursor, parts[index]);
    const stat = await fs.lstat(cursor, { bigint: true });
    if (
      stat.isSymbolicLink() ||
      (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())
    )
      refuse('reviewed-scope-artifact-path');
  }
  const physical = await fs.realpath(lexical);
  if (!contained(root, physical) || physical !== lexical) refuse('reviewed-scope-artifact-path');
  return { lexical, stat: await fs.lstat(lexical, { bigint: true }) };
}
async function readPhysical({ relative, authority, limit, seen, deps = {} }) {
  const fs = deps.fs ?? defaultFs;
  let handle;
  try {
    const before = await checkedPath(fs, authority.worktree, relative);
    const key = `${before.stat.dev}:${before.stat.ino}`;
    if (seen?.has(key)) refuse('reviewed-scope-artifact-path', 'duplicate physical file');
    handle = await fs.open(
      before.lexical,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
    );
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameVersion(before.stat, opened))
      refuse('reviewed-scope-artifact-path');
    const hasher = createHash('sha256');
    const chunks = [];
    let size = 0;
    while (size <= limit) {
      const buffer = Buffer.alloc(Math.min(65536, limit + 1 - size));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      size += bytesRead;
      const chunk = buffer.subarray(0, bytesRead);
      hasher.update(chunk);
      chunks.push(chunk);
    }
    if (size > limit) refuse('reviewed-scope-artifact-size');
    const afterFd = await handle.stat({ bigint: true });
    const afterPath = await checkedPath(fs, authority.worktree, relative);
    if (!sameVersion(opened, afterFd) || !sameVersion(opened, afterPath.stat))
      refuse('reviewed-scope-artifact-changed');
    seen?.add(key);
    return { bytes: Buffer.concat(chunks), sha256: hasher.digest('hex'), size };
  } catch (error) {
    if (error instanceof ReviewedScopeError) throw error;
    refuse('reviewed-scope-artifact-path', error.code ?? 'unreadable file');
  } finally {
    await handle?.close();
  }
}
function compareManifest(manifest, authority) {
  validateManifest(manifest);
  for (const [field, code] of [
    ['repository', 'repository'],
    ['issue', 'issue'],
    ['worktree', 'worktree'],
    ['branch', 'branch'],
    ['head', 'head'],
  ]) {
    if (manifest[field] !== authority[field]) refuse(`reviewed-scope-${code}`);
  }
}
export async function readBoundManifest(manifestPath, authority, { deps = {} } = {}) {
  const result = await readPhysical({
    relative: manifestPath,
    authority,
    limit: LIMITS.manifest,
    deps,
  });
  return result.bytes;
}
export async function validateArtifacts({ manifest, authority, deps = {}, seen = new Set() }) {
  compareManifest(manifest, authority);
  const artifactDigests = [];
  let aggregate = 0;
  for (const artifact of manifest.artifacts) {
    const file = await readPhysical({
      relative: artifact.path,
      authority,
      limit: Math.min(LIMITS.artifactBytes, LIMITS.aggregateBytes - aggregate),
      seen,
      deps,
    });
    aggregate += file.size;
    if (file.sha256 !== artifact.sha256) refuse('reviewed-scope-artifact-digest', artifact.path);
    artifactDigests.push({ path: artifact.path, sha256: file.sha256 });
  }
  return artifactDigests;
}
export async function validateLocalEvidence({
  manifest,
  manifestBytes,
  manifestPath,
  authority,
  deps = {},
}) {
  compareManifest(manifest, authority);
  if (canonicalRecordJson(parseManifest(manifestBytes)) !== canonicalRecordJson(manifest))
    refuse('reviewed-scope-manifest-changed');
  const seen = new Set();
  const actual = await readPhysical({
    relative: manifestPath,
    authority,
    limit: LIMITS.manifest,
    seen,
    deps,
  });
  if (!actual.bytes.equals(manifestBytes)) refuse('reviewed-scope-manifest-changed');
  const artifactDigests = await validateArtifacts({ manifest, authority, deps, seen });
  return { manifestDigest: sha256(manifestBytes), artifactDigests };
}
