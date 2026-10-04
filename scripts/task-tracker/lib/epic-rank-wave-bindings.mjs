// @story #1872
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { getProvider } from '../../providers/index.mjs';
import { resolveTranscriptPath } from '../../providers/transcript-resolver.mjs';
import { getActiveTask } from '../session-state.mjs';
import { readOccupancy } from './occupancy.mjs';
import { findMainWorktreePath } from '../fleet-registry.mjs';
import { occupancyPath } from '../paths.mjs';
import { isStrictCompletedDone } from './epic-rank-wave-policy.mjs';
import { normalizeStateId } from './lifecycle-policy/index.mjs';
import { canonicalRecordJson } from './github-records/canonical-json.mjs';

// Git environment variables that redirect discovery must not select authority.
export function rankWaveGitEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}
export function discoverRankWaveCommonDir(worktree) {
  return realpathSync(
    String(
      execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
        cwd: realpathSync(worktree),
        env: rankWaveGitEnv(),
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    ).trim()
  );
}
export function discoverRankWavePhysical(worktree) {
  const options = {
    cwd: realpathSync(worktree),
    env: rankWaveGitEnv(),
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  const git = (args) => String(execFileSync('git', args, options)).trim();
  const root = realpathSync(git(['rev-parse', '--show-toplevel']));
  const commonDir = realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const branch = git(['branch', '--show-current']);
  if (!branch || branch === 'HEAD') throw new Error('rank-wave: detached worktree');
  return { worktree: root, branch, commonDir };
}
export function nativeRankWaveTranscript(binding, { home = homedir() } = {}) {
  return resolveTranscriptPath({
    adapter: getProvider(binding.provider),
    sid: binding.sessionId,
    homedir: home,
    projectKey: binding.worktree.replace(/[^a-zA-Z0-9]/g, '-'),
    cwd: binding.worktree,
  });
}
export async function observeRankWaveNative(binding, { home = homedir() } = {}) {
  const file = nativeRankWaveTranscript(binding, { home });
  if (!file) throw new Error('rank-wave: native transcript unavailable');
  const events = (await readFile(file, 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  let cwd;
  if (binding.provider === 'codex') {
    const metadata = events.filter((e) => e.type === 'session_meta');
    if (metadata.length !== 1 || metadata[0].payload?.id !== binding.sessionId)
      throw new Error('rank-wave: native identity mismatch');
    cwd = metadata[0].payload.cwd;
  } else if (binding.provider === 'claude') {
    const records = events.filter(
      (e) => e.sessionId === binding.sessionId && e.cwd && !e.isSidechain
    );
    if (!records.length) throw new Error('rank-wave: native identity unavailable');
    cwd = records[0].cwd;
  } else throw new Error('rank-wave: native identity adapter unavailable');
  if (discoverRankWavePhysical(cwd).commonDir !== binding.commonDir)
    throw new Error('rank-wave: native repository mismatch');
  return { verified: true, sessionId: binding.sessionId };
}
export async function observeRankWaveBinding(binding, { parent, child, ports = {} } = {}) {
  const physical = (ports.physical ?? discoverRankWavePhysical)(binding.worktree);
  const rows = (
    ports.rows ?? ((worktree) => readOccupancy(occupancyPath(findMainWorktreePath(worktree))))
  )(binding.worktree);
  const active = (sid) => (ports.active ?? getActiveTask)(sid, binding.worktree);
  const native = ports.native ?? observeRankWaveNative;
  const observation = {
    physical,
    occupancy: rows[String(binding.issue)] ?? null,
    active: active(binding.sessionId),
    native: await native(binding),
  };
  const old = observation.active;
  if (
    parent &&
    ['test', 'review'].includes(normalizeStateId(child?.boardState)) &&
    (!old || old.issue !== `#${binding.issue}` || old.bindingGenerationId !== binding.generation)
  ) {
    const row = observation.occupancy,
      supervisor = active(parent.sessionId);
    const replacement = {
      ...binding,
      provider: parent.provider,
      sessionId: parent.sessionId,
      generation: row?.bindingGenerationId,
    };
    if (
      row?.bindingGenerationId !== binding.generation &&
      sameClaim(replacement, { occupancy: row, active: supervisor }) &&
      (await native(replacement)).verified === true
    ) {
      observation.handoff = {
        verified: true,
        issue: binding.issue,
        parentSessionId: parent.sessionId,
        oldGeneration: binding.generation,
        workerDischarged: true,
      };
    }
  }
  return observation;
}
export async function observeRankWaveDischarge(
  before,
  after,
  { observe = observeRankWaveBinding } = {}
) {
  const changed = before.filter((b, i) => canonicalRecordJson(b) !== canonicalRecordJson(after[i]));
  if (changed.length !== 1) return { verified: false };
  const old = changed[0],
    next = after.find((b) => b.issue === old.issue);
  const current = await observe(next),
    prior = await observe(old);
  const oldActive = prior.active;
  const overlapping =
    oldActive?.issue === `#${old.issue}` && oldActive.bindingGenerationId === old.generation;
  return {
    verified:
      sameClaim(next, current) &&
      current.native?.verified === true &&
      !overlapping &&
      prior.occupancy?.bindingGenerationId === next.generation,
    issue: old.issue,
    oldGeneration: old.generation,
    oldSessionId: old.sessionId,
    overlapping,
  };
}

function samePhysicalClaimPath(left, right) {
  if (left === right) return true;
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}
function sameClaim(binding, observation) {
  const row = observation?.occupancy,
    active = observation?.active;
  return (
    row?.issue === binding.issue &&
    row.sid === binding.sessionId &&
    row.provider === binding.provider &&
    samePhysicalClaimPath(row.worktreePath, binding.worktree) &&
    row.bindingGenerationId === binding.generation &&
    active?.issue === `#${binding.issue}` &&
    samePhysicalClaimPath(active.worktreePath, binding.worktree) &&
    active.worktreeBranch === binding.branch &&
    active.bindingGenerationId === binding.generation &&
    !active.closedAt
  );
}
function failure(code, issue) {
  return { ok: false, code: `rank-wave-${code}`, issue };
}
export async function verifyRankWaveBindings({
  bindings,
  parent,
  children,
  target,
  observe = observeRankWaveBinding,
} = {}) {
  try {
    if (!Array.isArray(bindings) || !bindings.length || !parent?.sessionId)
      return failure('bindings-unreadable');
    const paths = new Set([parent.worktree]),
      branches = new Set([parent.branch]),
      sessions = new Set([`${parent.provider}:${parent.sessionId}`]);
    const numbers = new Set();
    for (const binding of bindings) {
      const nativeId = `${binding.provider}:${binding.sessionId}`;
      if (
        !binding.generation ||
        !binding.sessionId ||
        numbers.has(binding.issue) ||
        paths.has(binding.worktree) ||
        branches.has(binding.branch) ||
        sessions.has(nativeId) ||
        binding.commonDir !== parent.commonDir
      )
        return failure('binding-collision', binding.issue);
      numbers.add(binding.issue);
      paths.add(binding.worktree);
      branches.add(binding.branch);
      sessions.add(nativeId);
      const child = children.find((c) => c.number === binding.issue);
      const observation = await observe(binding, { parent, child });
      if (
        observation?.native?.verified !== true ||
        observation.native.sessionId !== binding.sessionId ||
        canonicalRecordJson(observation.physical) !==
          canonicalRecordJson({
            worktree: binding.worktree,
            branch: binding.branch,
            commonDir: binding.commonDir,
          }) ||
        !binding.branch ||
        binding.branch === 'HEAD'
      )
        return failure('physical-or-native-mismatch', binding.issue);
      if (!child) return failure('binding-member-missing', binding.issue);
      if (isStrictCompletedDone(child)) continue;
      const phase = normalizeStateId(child.boardState);
      if (phase === 'ready-for-plan' && binding.issue !== target) continue;
      if (
        ['test', 'review'].includes(phase) &&
        binding.issue !== target &&
        !sameClaim(binding, observation)
      ) {
        const h = observation.handoff;
        if (
          h?.verified !== true ||
          h.issue !== binding.issue ||
          h.parentSessionId !== parent.sessionId ||
          h.oldGeneration !== binding.generation ||
          h.workerDischarged !== true
        )
          return failure('handoff-unverified', binding.issue);
        continue;
      }
      if (!sameClaim(binding, observation)) return failure('generation-unverified', binding.issue);
    }
    return { ok: true, code: 'rank-wave-bindings-ready' };
  } catch (error) {
    return { ...failure('bindings-unreadable'), detail: error.message };
  }
}
export function validateRankWaveRefresh({ before, after, discharge } = {}) {
  try {
    if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length)
      return failure('refresh-scope');
    const changed = before.filter(
      (b, i) => canonicalRecordJson(b) !== canonicalRecordJson(after[i])
    );
    if (changed.length !== 1) return failure('refresh-count');
    const old = changed[0],
      next = after.find((b) => b.issue === old.issue);
    if (!next || old.generation === next.generation || !next.sessionId)
      return failure('refresh-generation');
    for (const key of ['issue', 'worktree', 'branch', 'commonDir', 'provider']) {
      if (old[key] !== next[key]) return failure('refresh-scope');
    }
    if (
      discharge?.verified !== true ||
      discharge.issue !== old.issue ||
      discharge.oldGeneration !== old.generation ||
      discharge.oldSessionId !== old.sessionId ||
      discharge.overlapping !== false
    )
      return failure('refresh-discharge');
    return { ok: true, issue: old.issue };
  } catch {
    return failure('refresh-unreadable');
  }
}
