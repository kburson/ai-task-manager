// @story #2039 #2057
// Disposable Git actors only; never a live app move, native issue bind or cloud proof.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRuntimeRootFixture } from './runtime-root-fixture.mjs';
import { identity, handoffGeneration } from './story-handoff-fixture.mjs';
import { openStoryStore, storyCachePath } from '../../task-tracker/lib/story-cache/store.mjs';
import * as writer from '../../task-tracker/lib/story-cache/writer-registry.mjs';
import {
  transferStoryWriter,
  acknowledgeStoryWriterTransfer,
} from '../../task-tracker/lib/story-cache/writer-handoff.mjs';
export async function context(sid, root, fn) {
  const prior = process.env.AI_TASK_MANAGER_SESSION_ID;
  const cwd = process.cwd();
  process.env.AI_TASK_MANAGER_SESSION_ID = sid;
  process.chdir(root);
  try {
    return await fn();
  } finally {
    process.chdir(cwd);
    if (prior === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = prior;
  }
}
export async function fixture(t, { targetIo = fs, sourceIo = fs, clean = false } = {}) {
  const root = fs.realpathSync(createRuntimeRootFixture('story-handoff-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Tester',
      '-c',
      'user.email=tester@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'fixture',
    ],
    { cwd: root, stdio: 'pipe' }
  );
  const recipient = path.join(root, 'recipient');
  execFileSync('git', ['worktree', 'add', '--detach', recipient], { cwd: root, stdio: 'pipe' });
  for (const project of [root, recipient]) {
    fs.mkdirSync(path.join(project, '.ai-task-manager'), { recursive: true });
    fs.writeFileSync(
      path.join(project, '.ai-task-manager', 'task-tracker.json'),
      JSON.stringify({ repo: 'owner/repo' }) + '\n'
    );
  }
  const registry = writer.openStoryWriterRegistry({ projectRoot: root, fs: sourceIo });
  const targetRegistry = writer.openStoryWriterRegistry({ projectRoot: recipient, fs: targetIo });
  const claim = await writer.acquireStoryWriter({
    identity,
    human: 'tester',
    sessionId: 'author-A',
    worktree: root,
    cachePath: storyCachePath({ projectRoot: root, identity }),
    assignment: ['tester'],
    registry,
  });
  const store = await openStoryStore({ projectRoot: root, identity });
  const candidate = await handoffGeneration(claim.claimId);
  if (clean) {
    candidate.generation.working = {};
    candidate.generation.dirtyKeys = [];
    candidate.generation.timing.ingestedCursor = null;
    candidate.generation.timing.publishedCursor = null;
    candidate.payloads.delete('working/body.md');
  }
  const before = await store.commitGeneration(candidate, { expectedGeneration: null });
  if (!clean) {
    fs.mkdirSync(path.join(claim.cachePath, 'publication'), { mode: 0o700 });
    fs.writeFileSync(
      path.join(claim.cachePath, 'publication', 'journal.json'),
      'uncertain publication; retain exact bytes',
      { mode: 0o600 }
    );
  }
  const targetStore = await openStoryStore({ projectRoot: recipient, identity });
  const target = {
    human: 'tester',
    sessionId: 'author-B',
    worktree: recipient,
    cachePath: targetStore.cachePath,
    assignment: ['tester'],
    acknowledge: (request) =>
      context('author-B', recipient, () =>
        acknowledgeStoryWriterTransfer({ ...request, store: targetStore, registry: targetRegistry })
      ),
  };
  return { root, recipient, registry, targetRegistry, claim, store, before, targetStore, target };
}
export const transfer = (f, target = f.target) =>
  context('author-A', f.root, () =>
    transferStoryWriter({ claim: f.claim, target, store: f.store, registry: f.registry })
  );
export const owner = (f) => writer.resolveStoryWriter({ identity, registry: f.registry });
