// @story #1266

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProvider, listProviders } from '../../providers/index.mjs';
import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';
import { createMemoryRepository } from './co-review-memory-repository.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const CLI = path.join(ROOT, 'scripts/review/co-review.mjs');
const temporaryRoots = new Set();
const memoryRepositories = new Map();
const calls = { git: 0, nodeCli: 0 };
export const PROFILED_SESSIONS = Object.freeze({
  owner: Object.freeze({ provider: 'codex', sid: 'fixture-owner-sid' }),
  reviewer: Object.freeze({ provider: 'claude', sid: 'fixture-reviewer-sid' }),
});

export function profiledSession(role) {
  const session = PROFILED_SESSIONS[role];
  if (!session) throw new TypeError(`unknown profiled co-review role: ${String(role)}`);
  return { ...session };
}

export function profiledEnv(role, baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const name of listProviders()) {
    for (const key of getProvider(name).sessionIdEnvKeys) delete env[key];
  }
  if (role === 'owner') env.CODEX_THREAD_ID = PROFILED_SESSIONS.owner.sid;
  else if (role === 'reviewer') env.CLAUDE_CODE_SESSION_ID = PROFILED_SESSIONS.reviewer.sid;
  else throw new TypeError(`unknown profiled co-review role: ${String(role)}`);
  return env;
}

export function processCallCounts() {
  return { ...calls };
}

export function temporaryRoot(prefix = 'aitm-co-review-') {
  const root = mkdtempSync(path.join(projectScratchDir('test'), prefix));
  temporaryRoots.add(root);
  return root;
}

function profiledRoleForArgs(args) {
  if (!['claim', 'handoff'].includes(args?.[0])) return null;
  const actorIndex = args.indexOf('--actor');
  const actor = actorIndex >= 0 ? String(args[actorIndex + 1] ?? '') : '';
  return /reviewer/i.test(actor) ? 'reviewer' : 'owner';
}

function spawnedCliEnv(env, args) {
  if (env) return env;
  const role = profiledRoleForArgs(args);
  return role ? profiledEnv(role) : { ...process.env };
}

export function runCli(args, { cwd = temporaryRoot(), env } = {}) {
  calls.nodeCli += 1;
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: spawnedCliEnv(env, args),
    shell: false,
  });
}

export async function runCliDirect(args, options = {}) {
  const { runCli: execute } = await import('../../review/co-review.mjs');
  const repository = options.repository ?? memoryRepositories.get(options.cwd);
  let stdout = '';
  let stderr = '';
  const status = await execute(args, {
    ...options,
    env: options.env ?? spawnedCliEnv(undefined, args),
    ...(repository ? { repository } : {}),
    stdout(value) {
      stdout += value;
    },
    stderr(value) {
      stderr += value;
    },
  });
  return { status, stdout, stderr };
}

export function runCliAsync(args, { cwd, env } = {}) {
  calls.nodeCli += 1;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: spawnedCliEnv(env, args),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

export function git(root, ...args) {
  calls.git += 1;
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

export function repositoryFixture() {
  const root = temporaryRoot();
  git(root, 'init', '-b', 'trunk');
  git(root, 'config', 'user.name', 'Co Review Test');
  git(root, 'config', 'user.email', 'co-review@example.test');
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), '.tmp/\n');
  writeFileSync(path.join(root, 'docs/artifact.md'), '# Artifact\n\nRevision one.\n');
  git(root, 'add', '.gitignore', 'docs/artifact.md');
  git(root, 'commit', '-m', 'initial artifact');
  return {
    root,
    artifact: 'docs/artifact.md',
    initialCommit: git(root, 'rev-parse', 'HEAD'),
  };
}

export const realRepositoryFixture = repositoryFixture;

export function memoryRepositoryFixture({
  artifact = 'docs/artifact.md',
  bytes = Buffer.from('# Artifact\n\nRevision one.\n'),
} = {}) {
  const root = temporaryRoot();
  mkdirSync(path.dirname(path.join(root, artifact)), { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), '.tmp/\n');
  writeFileSync(path.join(root, artifact), bytes);
  const repository = createMemoryRepository({ root, artifact, bytes });
  memoryRepositories.set(root, repository);
  return {
    root,
    artifact,
    initialCommit: repository.initialCommit,
    repository,
    processCalls: processCallCounts(),
  };
}

export async function protocol() {
  return import('../../review/lib/protocol.mjs');
}

function bindProtocol(api, repository) {
  const inject =
    (name) =>
    (options = {}) =>
      api[name]({ ...options, repository });
  return {
    ...api,
    initializeProtocol: inject('initializeProtocol'),
    readProtocol: inject('readProtocol'),
    statusProtocol: inject('statusProtocol'),
    validatedArchiveSnapshot: inject('validatedArchiveSnapshot'),
    claimTurn: inject('claimTurn'),
    profiledClaimTurn(options = {}) {
      const state = api.readProtocol({ ...options, repository });
      const role = Object.entries(state.roles).find(
        ([, identity]) => identity === options.actor
      )?.[0];
      return api.claimTurn({
        ...options,
        ...profiledSession(role ?? 'owner'),
        repository,
      });
    },
    registerSupplement: inject('registerSupplement'),
    handoffOwner: inject('handoffOwner'),
    handoffReviewer: inject('handoffReviewer'),
    profiledHandoffOwner(options = {}) {
      return api.handoffOwner({ ...options, ...profiledSession('owner'), repository });
    },
    profiledHandoffReviewer(options = {}) {
      return api.handoffReviewer({ ...options, ...profiledSession('reviewer'), repository });
    },
    acceptGoodEnough: inject('acceptGoodEnough'),
    setMaxReviewTurns: inject('setMaxReviewTurns'),
    continueProtocol: inject('continueProtocol'),
    waitForTurn: inject('waitForTurn'),
  };
}

export async function memoryProtocol(repository) {
  return bindProtocol(await protocol(), repository);
}

export const realProtocol = protocol;

export function readEvents(root, dir) {
  return readFileSync(path.join(root, dir, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function snapshotProtocol(root, dir) {
  return {
    state: readFileSync(path.join(root, dir, 'state.json'), 'utf8'),
    events: readFileSync(path.join(root, dir, 'events.jsonl'), 'utf8'),
  };
}

export function rewriteProtocolState(root, dir, mutate) {
  const statePath = path.join(root, dir, 'state.json');
  const eventsPath = path.join(root, dir, 'events.jsonl');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  let next = mutate(structuredClone(state));
  if (
    next.initialization?.claimProvenance === 'provider-session/v1' &&
    next.lastHandoff &&
    !next.lastHandoff.imported &&
    !next.lastHandoff.claim
  ) {
    const role = next.lastHandoff.from;
    next = {
      ...next,
      lastHandoff: {
        ...next.lastHandoff,
        claim: {
          revision: Math.max(1, next.revision - 1),
          role,
          actor: next.roles[role],
          ...profiledSession(role),
          at: next.lastHandoff.at,
        },
      },
    };
  }
  const events = readEvents(root, dir);
  events[events.length - 1] = {
    ...events.at(-1),
    lifecycle: next.lifecycle,
    currentRole: next.currentRole,
    turnState: next.turnState,
    round: next.round,
    reviewTurnsUsed: next.reviewTurnsUsed,
    maxReviewTurns: next.maxReviewTurns,
    remainingReviewTurns: next.remainingReviewTurns,
    ...(next.lastHandoff ? { handoff: next.lastHandoff } : {}),
  };
  if (
    next.initialization?.claimProvenance === 'provider-session/v1' &&
    next.claim === null &&
    events.at(-1).type === 'claim'
  ) {
    events[events.length - 1].type = 'continue';
    delete events[events.length - 1].claim;
  }
  writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`);
  writeFileSync(eventsPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
  return next;
}

export function commitArtifact(root, content, message = 'revise artifact') {
  const repository = memoryRepositories.get(root);
  if (repository) {
    return repository.commit('docs/artifact.md', Buffer.from(content), message);
  }
  writeFileSync(path.join(root, 'docs/artifact.md'), content);
  git(root, 'add', 'docs/artifact.md');
  git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

export async function initializedProtocol({
  imported = false,
  maxReviewTurns = 6,
  artifact = 'docs/artifact.md',
  contents = '# Artifact\n\nRevision one.\n',
  archiveDir,
  dir = '.tmp/review',
} = {}) {
  const fixture = memoryRepositoryFixture({ artifact, bytes: Buffer.from(contents) });
  const api = await memoryProtocol(fixture.repository);
  return initializeFixture({ api, fixture, imported, maxReviewTurns, archiveDir, dir });
}

export async function realInitializedProtocol({ imported = false, maxReviewTurns = 6 } = {}) {
  const fixture = repositoryFixture();
  const api = await protocol();
  return initializeFixture({ api, fixture, imported, maxReviewTurns });
}

function initializeFixture({
  api,
  fixture,
  imported,
  maxReviewTurns,
  archiveDir,
  dir = '.tmp/review',
}) {
  const options = {
    cwd: fixture.root,
    dir,
    artifact: fixture.artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns,
    ...(archiveDir ? { archiveDir } : {}),
  };
  if (imported) {
    mkdirSync(path.join(fixture.root, options.dir), { recursive: true });
    writeFileSync(
      path.join(fixture.root, options.dir, 'r1-review.md'),
      '# Review\n\n[finding:F-001] Clarify terminal acceptance.\n'
    );
    options.importReview = `${options.dir}/r1-review.md`;
    options.reviewOf = fixture.initialCommit;
  }
  const state = api.initializeProtocol(options);
  return { api, ...fixture, options, state };
}

export async function reviewerTurn({ imported = false, maxReviewTurns = 6 } = {}) {
  const initialized = await initializedProtocol({ imported, maxReviewTurns });
  const { api, root, options, initialCommit } = initialized;
  api.profiledClaimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  let commit = initialCommit;
  let answers;
  const response = `${options.dir}/owner-response.md`;
  if (imported) {
    commit = commitArtifact(root, '# Artifact\n\nOwner revision.\n');
    answers = options.importReview;
    writeFileSync(
      path.join(root, response),
      '[finding:F-001] [disposition:accepted]\nRevised terminal acceptance.\n'
    );
  } else {
    writeFileSync(path.join(root, response), '# Owner response\n\nReady for review.\n');
  }
  api.profiledHandoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response,
    artifact: options.artifact,
    commit,
    answers,
    message: 'owner handoff',
  });
  api.profiledClaimTurn({ cwd: root, dir: options.dir, actor: 'reviewer-agent' });
  return { ...initialized, commit, response };
}

export function cleanupTemporaryRoots() {
  for (const root of temporaryRoots) {
    memoryRepositories.delete(root);
    rmSync(root, { recursive: true, force: true });
  }
  temporaryRoots.clear();
}
