// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { enqueue, drain, drainMatching, drainAndDiscard } from '../../../../task-tracker/queue.mjs';
import { postTimingSafely } from '../../../../task-tracker/lib/timing-post-outcome.mjs';
import { withMemoryStageEffectQuarantine } from '../../../../task-tracker/lib/criteria-revision/transport-quarantine.mjs';

for (const seeded of [false, true])
  for (const route of [
    'enqueue',
    'drain',
    'drainMatching',
    'drainAndDiscard',
    'caught-publication',
  ])
    test(`memory stage ${route} refuses before queue lock or host file creation (seeded=${seeded})`, async () => {
      const sandbox = createSandbox();
      const directory = path.join(sandbox.context.sourceRoot, 'queue-effect');
      const queuePath = path.join(directory, 'queue.json');
      const effects = [];
      try {
        if (seeded)
          enqueue({ kind: 'timing', issue: '#124', row: 'original queued bytes' }, queuePath);
        const capture = () =>
          readdirSync(sandbox.context.sourceRoot, { recursive: true })
            .sort()
            .map((name) => {
              const file = path.join(sandbox.context.sourceRoot, name);
              return [
                name,
                statSync(file).isDirectory() ? 'directory' : readFileSync(file).toString('hex'),
              ];
            });
        const before = capture();
        const call = () =>
          withMemoryStageEffectQuarantine(async () => {
            if (route === 'enqueue')
              return enqueue(
                { kind: 'timing', issue: '#124', row: 'refused original row' },
                queuePath
              );
            if (route === 'drain')
              return drain(async () => {
                effects.push('handler');
              }, queuePath);
            if (route === 'drainMatching')
              return drainMatching(
                async () => {
                  effects.push('handler');
                },
                queuePath,
                () => {
                  effects.push('predicate');
                  return true;
                }
              );
            if (route === 'drainAndDiscard')
              return drainAndDiscard(
                async () => {
                  effects.push('handler');
                  throw new Error('failed');
                },
                queuePath,
                () => {
                  effects.push('predicate');
                  return true;
                },
                () => {
                  effects.push('retain');
                  return true;
                }
              );
            return postTimingSafely(
              { issue: '#124', repo: 'example/criteria', row: 'refused original row', queuePath },
              {
                postTimingEvent: async () => {
                  throw new Error('original publication refused');
                },
                enqueue,
                warn: () => {
                  effects.push('warning');
                },
              }
            );
          });
        await assert.rejects(call, (error) => error.code === 'revision-authority-unavailable');
        assert.equal(existsSync(directory), seeded);
        assert.deepEqual(
          capture(),
          before,
          'complete recursive source tree, queue bytes and directories remain exact'
        );
        assert.deepEqual(effects, []);
      } finally {
        sandbox.dispose();
      }
    });
