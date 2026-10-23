// @story #2039 #2060
// Physical fixture only: actual linked Git roots, persistent claim, store and native locks.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PROJECT_ROOT_ALIASES,
  resolveRuntimeRoot,
} from '../../../../../task-tracker/lib/runtime-storage.mjs';
import {
  withIssueLock,
  currentIssueLockOwner,
} from '../../../../../task-tracker/issue-mutator-lock.mjs';
import {
  acquireStoryWriter,
  openStoryWriterRegistry,
} from '../../../../../task-tracker/lib/story-cache/writer-claim.mjs';
import {
  openStoryStore,
  storyCachePath,
} from '../../../../../task-tracker/lib/story-cache/store.mjs';
import { ingestTimingEvents } from '../../../../../task-tracker/lib/story-cache/timing-stage.mjs';
import { handoffGeneration, identity } from '../../../../helpers/story-handoff-fixture.mjs';

test('linked native worktree ingests under its canonical main lock and retains restart identity', async (t) => {
  const parent = path.resolve('.ai-task-manager/runtime/test-fixtures');
  fs.mkdirSync(parent, { recursive: true });
  const main = fs.realpathSync(fs.mkdtempSync(path.join(parent, 'timing-stage-native-2060-')));
  t.after(() => fs.rmSync(main, { recursive: true, force: true }));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !PROJECT_ROOT_ALIASES.includes(key) && !key.startsWith('GIT_')
    )
  );
  const git = (args) => execFileSync('git', args, { cwd: main, env, stdio: 'pipe' });
  git(['init', '-q']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.com',
    'commit',
    '--allow-empty',
    '-m',
    'explicit offline fixture',
  ]);
  const linked = path.join(main, 'linked');
  git(['worktree', 'add', '--detach', linked]);
  const previousCwd = process.cwd();
  const saved = Object.fromEntries(
    [...PROJECT_ROOT_ALIASES, 'AI_TASK_MANAGER_SESSION_ID'].map((key) => [key, process.env[key]])
  );
  for (const key of PROJECT_ROOT_ALIASES) delete process.env[key];
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-author-2060';
  process.chdir(linked);
  try {
    const root = resolveRuntimeRoot({ cwd: linked, env: {} });
    assert.equal(root.projectRoot, linked);
    assert.equal(root.mainRoot, main);
    const registry = openStoryWriterRegistry({ projectRoot: linked });
    const claim = await acquireStoryWriter({
      identity,
      human: 'tester',
      sessionId: 'fixture-native-author-2060',
      worktree: linked,
      cachePath: storyCachePath({ projectRoot: linked, identity }),
      assignment: ['tester'],
      registry,
    });
    const store = await openStoryStore({ projectRoot: linked, identity });
    const initial = await handoffGeneration(claim.claimId);
    initial.generation.timing.ingestedCursor = null;
    await store.commitGeneration(initial, { expectedGeneration: null });
    const event = {
      eventId: 'native-retained-2060',
      actorId: 'fixture-native-author-2060',
      transitionId: null,
      timestamp: '2026-10-19T12:00:00.000Z',
      event: 'paused',
      activeSeconds: null,
      idleSeconds: null,
      sourceCursor: 'native-cursor-2060',
    };
    await withIssueLock(
      { issue: identity.issueNumber, projDir: main, sessionId: claim.sessionId, retries: 0 },
      async () => {
        assert.equal(currentIssueLockOwner(identity.issueNumber).projDir, main);
        const result = await ingestTimingEvents({ store, claim, events: [event] });
        assert.equal(result.status, 'ingested');
        assert.equal(result.ingestedCursor, 'native-cursor-2060');
        assert.equal(currentIssueLockOwner(identity.issueNumber).projDir, main);
      }
    );
    const reopened = await openStoryStore({ projectRoot: linked, identity });
    const beforeReplay = await reopened.readGeneration();
    assert.deepEqual(beforeReplay.generation.timing.events, [event]);
    assert.equal(
      (await ingestTimingEvents({ store: reopened, claim, events: [event] })).status,
      'no-op'
    );
    assert.deepEqual(await reopened.readGeneration(), beforeReplay);
    process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-other-2060';
    await assert.rejects(ingestTimingEvents({ store: reopened, claim, events: [event] }), {
      code: 'STORY_WRITER_OWNED',
    });
    assert.deepEqual(await reopened.readGeneration(), beforeReplay);
  } finally {
    process.chdir(previousCwd);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
