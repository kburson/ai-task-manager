// @story #1266

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';
import { createMemoryRepository } from './co-review-memory-repository.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const CLI = path.join(ROOT, 'scripts/review/co-review.mjs');
const temporaryRoots = new Set();
const memoryRepositories = new Map();
const calls = { git: 0, nodeCli: 0 };

export function processCallCounts() {
  return { ...calls };
}

export function temporaryRoot(prefix = 'aitm-co-review-') {
  const root = mkdtempSync(path.join(projectScratchDir('test'), prefix));
  temporaryRoots.add(root);
  return root;
}

export function runCli(args, { cwd = temporaryRoot() } = {}) {
  calls.nodeCli += 1;
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
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

export function runCliAsync(args, { cwd }) {
  calls.nodeCli += 1;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
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
    registerSupplement: inject('registerSupplement'),
    handoffOwner: inject('handoffOwner'),
    handoffReviewer: inject('handoffReviewer'),
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
  const next = mutate(structuredClone(state));
  const events = readEvents(root, dir);
  events[events.length - 1] = {
    ...events.at(-1),
    lifecycle: next.lifecycle,
    currentRole: next.currentRole,
    round: next.round,
    reviewTurnsUsed: next.reviewTurnsUsed,
    maxReviewTurns: next.maxReviewTurns,
    remainingReviewTurns: next.remainingReviewTurns,
  };
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
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
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
  api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response,
    artifact: options.artifact,
    commit,
    answers,
    message: 'owner handoff',
  });
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'reviewer-agent' });
  return { ...initialized, commit, response };
}

export function cleanupTemporaryRoots() {
  for (const root of temporaryRoots) {
    memoryRepositories.delete(root);
    rmSync(root, { recursive: true, force: true });
  }
  temporaryRoots.clear();
}
