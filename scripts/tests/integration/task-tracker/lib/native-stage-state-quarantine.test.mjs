// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { withMemoryStageEffectQuarantine } from '../../../../task-tracker/lib/criteria-revision/transport-quarantine.mjs';
import {
  setActiveTask,
  clearActiveTask,
  compareAndClearActiveTask,
  setSessionKanbanState,
  setNativeStageActorTask,
} from '../../../../task-tracker/session-state.mjs';
import {
  writeActorTimingState,
  writeNativeStageActorTiming,
} from '../../../../task-tracker/lib/actor-timing-state.mjs';
import {
  saveNativeStageActorCheckpoint,
  saveNativeStageActorFinal,
  loadState,
} from '../../../../task-tracker/state.mjs';
import { flushBoundActorInterval } from '../../../../task-tracker/runtime.mjs';
import { currentSessionId, aiAppName } from '../../../../task-tracker/word-counter.mjs';
import { statePath as nativeStatePath } from '../../../../task-tracker/paths.mjs';
import { before, after } from 'node:test';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-stage-state-quarantine';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), 'fixture-native-stage-state-quarantine');
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

for (const existing of [false, true])
  for (const operation of ['set', 'clear', 'compare-clear', 'kanban', 'actor'])
    test(`stage-only ${operation} refuses before ${existing ? 'existing' : 'absent'} local state effect`, () => {
      const s = createSandbox();
      try {
        const root = s.context.sourceRoot,
          sid = 'native-stage-state-fixture';
        const identity = { provider: 'codex', sid };
        if (existing) {
          setActiveTask(
            sid,
            {
              issue: '#1855',
              entryStartTs: null,
              wordsAtStart: 0,
              kanbanState: 'develop',
              sticky: 'keep',
            },
            root
          );
          writeActorTimingState(identity, root, { active: '#1855', lastWordMarker: 4 });
        }
        const capture = () =>
          fs
            .readdirSync(root, { recursive: true })
            .sort()
            .map((name) => {
              const file = path.join(root, name);
              return [
                name,
                fs.statSync(file).isFile()
                  ? createHash('sha256').update(fs.readFileSync(file)).digest('hex')
                  : 'directory',
              ];
            });
        const before = capture();
        let predicates = 0,
          caught;
        try {
          withMemoryStageEffectQuarantine(() => {
            if (operation === 'set') setActiveTask(sid, { issue: '#1855', wordsAtStart: 7 }, root);
            else if (operation === 'clear') clearActiveTask(sid, root);
            else if (operation === 'compare-clear')
              compareAndClearActiveTask(sid, root, () => {
                predicates++;
                return true;
              });
            else if (operation === 'kanban') setSessionKanbanState(sid, 'test', root);
            else writeActorTimingState(identity, root, { active: '#1855', lastWordMarker: 7 });
          });
        } catch (error) {
          caught = error;
        }
        assert.deepEqual(capture(), before, 'no native directory, lock, tmp or state file effect');
        assert.equal(predicates, 0);
        assert.equal(caught?.code, 'revision-authority-unavailable');
      } finally {
        s.dispose();
      }
    });

for (const kind of ['checkpoint', 'final', 'session', 'actor'])
  for (const scope of ['ordinary', 'stage-denial'])
    test(`unowned fixed ${kind} checkpoint refuses in ${scope} before any host effect`, async () => {
      const s = createSandbox();
      try {
        const root = s.context.sourceRoot,
          identity = { provider: 'codex', sid: 'checkpoint-unowned' };
        const capture = () =>
          fs
            .readdirSync(root, { recursive: true })
            .sort()
            .map((name) => {
              const file = path.join(root, name);
              return [
                name,
                fs.statSync(file).isFile()
                  ? createHash('sha256').update(fs.readFileSync(file)).digest('hex')
                  : 'directory',
              ];
            });
        const before = capture();
        const invocation = Object.freeze({ identity, statePath: path.join(root, 'state.json') });
        const run = () =>
          kind === 'checkpoint'
            ? saveNativeStageActorCheckpoint(invocation)
            : kind === 'final'
              ? saveNativeStageActorFinal(invocation)
              : kind === 'session'
                ? setNativeStageActorTask(invocation, {
                    kind: 'set-binding',
                    sid: identity.sid,
                    projDir: root,
                    record: { issue: '#1855' },
                  })
                : writeNativeStageActorTiming(invocation, {
                    kind: 'write-actor',
                    identity,
                    projDir: root,
                    state: { active: '#1855' },
                  });
        await assert.rejects(
          scope === 'stage-denial' ? withMemoryStageEffectQuarantine(run) : run(),
          (error) => error?.code === 'revision-authority-unavailable'
        );
        assert.deepEqual(
          capture(),
          before,
          'complete host file hashes and directory entries unchanged'
        );
      } finally {
        s.dispose();
      }
    });

for (const accessor of [false, true])
  test(`native outer actor final rejects ${accessor ? 'accessor' : 'injected'} flush before invocation`, async () => {
    const s = createSandbox();
    try {
      const root = s.context.sourceRoot,
        sid = currentSessionId(),
        identity = { provider: aiAppName(), sid };
      const ts = new Date(Date.now() - 1000).toISOString();
      setActiveTask(sid, { issue: '#124', entryStartTs: ts, wordsAtStart: 0 }, root);
      writeActorTimingState(identity, root, {
        active: '#124',
        entryStartTs: ts,
        wordsAtEntryStart: 0,
        lastWordMarker: 0,
      });
      const statePath = nativeStatePath(root);
      assert.equal(loadState(statePath).active, '#124', 'actual native fixture binding is active');
      let calls = 0,
        getters = 0;
      const flush = async () => {
        calls++;
        return { ts, wordMarker: 0, lastFullWordMarker: 0 };
      };
      const ctx = { statePath };
      if (accessor)
        Object.defineProperty(ctx, 'flushActiveToGH', {
          get() {
            getters++;
            return flush;
          },
        });
      else ctx.flushActiveToGH = flush;
      await assert.rejects(
        withMemoryStageEffectQuarantine(() => flushBoundActorInterval(ctx, { issue: 124 })),
        (error) => error?.code === 'revision-authority-unavailable'
      );
      assert.equal(calls, 0, 'no caller-selected actor flush invocation');
      assert.equal(getters, 0, 'no accessor evaluation for native qualification');
    } finally {
      s.dispose();
    }
  });
