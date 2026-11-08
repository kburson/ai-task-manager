// @story #2148
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { getProvider } from '../../providers/index.mjs';
import { loadConfig } from '../config.mjs';
import { readPhysicalRuntimeIdentity } from './runtime-storage.mjs';
import { hasUnsupportedGitEnvironment } from './mutation-context.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { activeTaskPath, occupancyPath } from '../paths.mjs';
import { getActiveTask } from '../session-state.mjs';
import { aiAppName, currentSessionId } from '../word-counter.mjs';
import { fetchAssignmentSnapshot } from './assignment-snapshot.mjs';
import { EXIT_ASSIGNEE_MISMATCH } from './assignee-guard.mjs';
import { parseBodyVersion } from './body-version.mjs';
import { strictIssueWorktreeLocations } from './issue-worktree-location.mjs';
import { assertNativeSession } from './native-worktree-bootstrap.mjs';
import { assertOccupancyAvailable, readOccupancy } from './occupancy.mjs';
import { ORCHESTRATOR_ENV_KEY } from './session-id.mjs';
import { timingActorKey } from './timing-actor.mjs';
import { runPreflight } from './verb-preflight.mjs';
import { stripBodyVersion } from './versioned-issue-write.mjs';
import { inspectVerbWorktreeBinding, readWorktreeIdentity } from './worktree-binding-guard.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');

export class LocationPreflightError extends Error {
  constructor(verdict) {
    super('location authority: ' + verdict.kind);
    this.verdict = verdict;
  }
}

export function readLocationActor({
  env = process.env,
  provider = aiAppName(),
  sid = currentSessionId(),
} = {}) {
  const adapter = getProvider(env.AI_TASK_MANAGER_APP_NAME?.trim().toLowerCase() || provider);
  timingActorKey({ provider, sid });
  if (env.CODEX_THREAD_ID || env.CODEX_SESSION_ID || provider === 'codex') {
    if (provider !== 'codex') throw new Error('location authority: native provider mismatch');
    assertNativeSession(sid, env);
  } else if (
    adapter.name !== provider ||
    (env[ORCHESTRATOR_ENV_KEY] || adapter.sessionIdEnvKeys.map((key) => env[key]).find(Boolean)) !==
      sid
  ) {
    // A legacy transcript lookup can correlate words, but it cannot attribute a writer.
    throw new Error('location authority: an attributable provider session is required');
  }
  return { provider, sid };
}

function readLocalAuthority({
  issueNumber,
  verb,
  rest,
  cfg,
  invokingDir,
  allowForeignWorktree,
  renewal,
  deps,
}) {
  const actor = (deps.readActor ?? readLocationActor)();
  const currentConfig = loadConfig();
  if (
    cfg.repo !== currentConfig.repo ||
    cfg.projectId !== currentConfig.projectId ||
    cfg.preferences?.gateAssigneeMatch !== currentConfig.preferences?.gateAssigneeMatch
  ) {
    throw new Error('location authority: configured target changed');
  }
  const live = (deps.resolveIdentity ?? readWorktreeIdentity)({ projectDir: invokingDir });
  const binding = inspectVerbWorktreeBinding({ verb, rest, invokingDir, allowForeignWorktree });
  const active = getActiveTask(actor.sid, live.worktreePath);
  // Resume accepts older records that store the issue as decimal text.
  const activeIssue =
    typeof active?.issue === 'string' ? active.issue.replace(/^([1-9]\d*)$/, '#$1') : null;
  if (
    existsSync(activeTaskPath(actor.sid, live.worktreePath)) &&
    !/^(?:#[1-9]\d*|discover|plan)$/.test(activeIssue)
  ) {
    throw new Error('location authority: unreadable active binding');
  }
  if (
    actor.provider === 'codex' &&
    active?.worktreeBranch &&
    active.worktreeBranch !== live.worktreeBranch &&
    (!renewal ||
      renewal.issueNumber !== issueNumber ||
      renewal.root !== live.worktreePath ||
      renewal.oldBranch !== active.worktreeBranch ||
      renewal.newBranch !== live.worktreeBranch ||
      renewal.bindingGenerationId !== active.bindingGenerationId)
  ) {
    throw new Error('location authority: exact native branch renewal required');
  }
  if (hasUnsupportedGitEnvironment())
    throw new Error('location authority: unsupported Git environment');
  const { mainRoot } = readPhysicalRuntimeIdentity(live.worktreePath);
  const rows = readOccupancy(occupancyPath(mainRoot));
  const holder = assertOccupancyAvailable(rows, {
    issue: issueNumber,
    sid: actor.sid,
    provider: actor.provider,
    worktreePath: live.worktreePath,
  });
  return {
    actor,
    mainRoot,
    live,
    binding,
    activeIssue,
    generation: active?.bindingGenerationId ?? null,
    boundBranch: active?.worktreeBranch ?? null,
    occupancy: holder
      ? [holder.provider, holder.sid, holder.worktreePath, holder.bindingGenerationId]
      : null,
  };
}

export async function readLocationMutationAuthority({
  issueNumber,
  verb,
  rest,
  cfg,
  invokingDir,
  body,
  renewal,
  observeRenewal,
  bind,
  allowForeignWorktree,
  deps = {},
}) {
  const context = {
    issueNumber,
    verb,
    rest,
    cfg,
    invokingDir,
    allowForeignWorktree,
    renewal,
    deps,
  };
  const local = readLocalAuthority(context);
  const marker = readLastKnownState(body);
  const markers = body.match(/^\s*<!--\s*aitm-last-known-state(?=[\s:>])/gim) ?? [];
  if (markers.length > 1 || (markers.length && !marker.state)) {
    throw new Error('location authority: ambiguous or malformed recorded state');
  }
  let snapshot;
  try {
    snapshot = await (deps.fetchSnapshot ?? fetchAssignmentSnapshot)({
      issueNumber,
      cfg,
      includeLocation: true,
    });
  } catch (error) {
    throw new LocationPreflightError({
      kind: 'assignee-mismatch',
      code: EXIT_ASSIGNEE_MISMATCH,
      assigneeKind: 'ownership-unverifiable',
      issueNumber,
      error: error.message,
    });
  }
  if (snapshot.body !== body)
    throw new Error('location authority: body changed during provider read');
  const verdict = await runPreflight({
    target: '#' + issueNumber,
    stateBefore: { active: bind ? '#' + issueNumber : local.activeIssue },
    cfg,
    deps: {
      fetchSnapshot: async () => snapshot,
      fetchLive: async () => snapshot.state,
      fetchLastKnownState: async () => marker.state,
      fetchLastStatusActor: async () => null,
      fetchCurrentUser: async () => snapshot.currentUser,
    },
  });
  if (!verdict.ok) throw new LocationPreflightError(verdict);
  if (renewal && observeRenewal && !isDeepStrictEqual(renewal, await observeRenewal(snapshot))) {
    throw new Error('location authority: native renewal changed before write');
  }
  // Check every local authority after the last asynchronous observation.
  if (!isDeepStrictEqual(local, readLocalAuthority(context))) {
    throw new Error('location authority changed during provider read');
  }
  return {
    issueNumber,
    repository: cfg.repo,
    ...local,
    ownerDigest: digest(JSON.stringify([snapshot.assignees.toSorted(), snapshot.currentUser])),
    state: snapshot.state,
    issueState: snapshot.issueState,
    marker,
    history: strictIssueWorktreeLocations(body),
    bodyVersion: parseBodyVersion(body),
    bodyDigest: digest(stripBodyVersion(body)),
  };
}

export function assertLocationMutationAuthority(expected, fresh) {
  const { bodyVersion, bodyDigest, ...authority } = expected;
  const { bodyVersion: liveVersion, bodyDigest: liveDigest, ...liveAuthority } = fresh;
  // Fresh observations of ownership and location are mandatory even on a byte-identical base.
  if (liveVersion < bodyVersion || !isDeepStrictEqual(authority, liveAuthority)) {
    throw new Error('location authority changed before write: ' + bodyDigest + ' -> ' + liveDigest);
  }
}
