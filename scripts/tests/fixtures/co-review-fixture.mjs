// @story #1266

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const CLI = path.join(ROOT, 'scripts/review/co-review.mjs');
const temporaryRoots = new Set();

export function temporaryRoot(prefix = 'aitm-co-review-') {
  const root = mkdtempSync(path.join(projectScratchDir('test'), prefix));
  temporaryRoots.add(root);
  return root;
}

export function runCli(args, { cwd = temporaryRoot() } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    shell: false,
  });
}

export function runCliAsync(args, { cwd }) {
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

export async function protocol() {
  return import('../../review/lib/protocol.mjs');
}

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

export function commitArtifact(root, content, message = 'revise artifact') {
  writeFileSync(path.join(root, 'docs/artifact.md'), content);
  git(root, 'add', 'docs/artifact.md');
  git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

export async function initializedProtocol({ imported = false, maxReviewTurns = 6 } = {}) {
  const api = await protocol();
  const fixture = repositoryFixture();
  const options = {
    cwd: fixture.root,
    dir: '.tmp/review',
    artifact: fixture.artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns,
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
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
  temporaryRoots.clear();
}
