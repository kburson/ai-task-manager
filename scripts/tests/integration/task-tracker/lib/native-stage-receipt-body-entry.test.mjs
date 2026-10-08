// @story #1855
import {
  test,
  assert,
  nativeFinalFixture,
  mutateIssueBody,
  createRevisionMemory,
} from './native-continuation-fixtures.mjs';

for (const change of [
  'extra authority',
  'copied journal',
  'foreign subject',
  'foreign backend',
  'body drift',
  'source drift',
  'input getter',
  'dependency getter',
  'inherited input',
  'invariant override',
  'retry coercion',
  'supplied validator',
  'supplied async validator',
  'forged invariant validator',
  'version coercion',
  'evidence coercion',
  'invalid retry number',
  'marker iterator',
  'heading mapper',
]) {
  test(`prepared native final receipt refuses ${change} before body callbacks`, async () => {
    const f = await nativeFinalFixture();
    try {
      let selected = false;
      const calls = [];
      const { error } = await f.invoke({
        receiptMutation: async (original) => {
          selected = true;
          const snapshot = f.backend.snapshot;
          assert.equal(
            snapshot.nativeProofRecords.at(-1).execution.schema,
            'aitm.native-develop-final-execution/v1'
          );
          assert.equal(f.effects.includes('body-push'), false);
          let input = {
            ...original,
            mutate: (body) => {
              calls.push('mutate');
              return original.mutate(body);
            },
            deps: {
              revisionBackend: f.backend,
              pexec: async (...args) => {
                calls.push('transport');
                return original.deps.pexec(...args);
              },
            },
          };
          if (change === 'extra authority') input.ready = true;
          if (change === 'copied journal')
            input.nativeProofJournal = structuredClone(snapshot.nativeProofRecords.at(-1));
          if (change === 'foreign subject') input.issueNumber++;
          if (change === 'foreign backend')
            input.deps.revisionBackend = createRevisionMemory(snapshot);
          if (change === 'body drift') {
            const observation = f.backend.observation;
            observation.body.bytes += '\nUnrelated body drift.\n';
            f.backend.replaceAuthority(observation);
          }
          if (change === 'source drift') {
            const observation = f.backend.observation;
            observation.protectedSourceBindings[0].hash = 'sha256:' + '0'.repeat(64);
            f.backend.replaceAuthority(observation);
          }
          if (change === 'input getter')
            Object.defineProperty(input, 'repo', {
              enumerable: true,
              get() {
                calls.push('getter');
                return original.repo;
              },
            });
          if (change === 'dependency getter')
            Object.defineProperty(input.deps, 'pexec', {
              enumerable: true,
              get() {
                calls.push('getter');
                return original.deps.pexec;
              },
            });
          if (change === 'inherited input') {
            input = Object.assign(Object.create({ ready: true }), input);
          }
          if (change === 'invariant override') input.allowMarkerLoss = true;
          if (change === 'retry coercion')
            input.maxRetries = {
              valueOf() {
                calls.push('coercion');
                return 1;
              },
            };
          if (change === 'supplied validator')
            input.validateFreshBase = () => {
              calls.push('validator');
            };
          if (change === 'supplied async validator')
            input.validateFreshBaseAsync = async () => {
              calls.push('validator');
            };
          if (change === 'forged invariant validator')
            input.validateMutation = () => {
              calls.push('validator');
            };
          if (change === 'version coercion')
            input.expectedVersion = {
              toString() {
                calls.push('coercion');
                return '1';
              },
            };
          if (change === 'evidence coercion') input.evidenceStamp = {};
          if (change === 'invalid retry number') input.maxRetries = Infinity;
          if (change === 'marker iterator') {
            input.allowMarkerAdvance = [];
            // Deliberately empty generator: invoking it must still be refused before iteration.
            // eslint-disable-next-line require-yield
            input.allowMarkerAdvance[Symbol.iterator] = function* () {
              calls.push('iterator');
            };
          }
          if (change === 'heading mapper') {
            input.expectedRemovedHeadings = [];
            input.expectedRemovedHeadings.map = () => {
              calls.push('mapper');
              return [];
            };
          }
          await mutateIssueBody(input);
        },
      });
      assert.equal(
        selected,
        true,
        'actual native execution and private journal preceded the adversarial input'
      );
      assert.equal(error?.code, 'revision-authority-unavailable');
      assert.deepEqual(calls, []);
      assert.equal(f.effects.includes('body-push'), false);
      assert.equal(f.effects.includes('stage-boundary'), false);
    } finally {
      f.dispose();
    }
  });
}
