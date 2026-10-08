// @story #1855
import {
  assert,
  createRevisionMemory,
  hashBytes,
  nativeCheckboxFixture,
  test,
  withRevisionConsumer,
} from './native-continuation-fixtures.mjs';

test('native checkbox retained journal rejects closed-shape basis and exact-delta tampering', async (t) => {
  const { f, label, check } = await nativeCheckboxFixture('ac');
  try {
    await check('unchecked', { rest: ['Independent DoD'] });
    await check('checked', { rest: ['--label', label, '--label', 'Independent DoD'] });
    const original = JSON.parse(JSON.stringify(f.backend.snapshot));
    const changes = [
      [
        'extra operation field',
        (j) => {
          j.execution.success = true;
        },
      ],
      [
        'duplicate labels',
        (j) => {
          j.execution.intent.labels[1] = j.execution.intent.labels[0];
        },
      ],
      [
        'unchecked with proof bases',
        (j) => {
          j.execution.intent.desired = 'unchecked';
        },
      ],
      [
        'wrong basis identity',
        (j) => {
          j.execution.proofBases[0].criterionIdentity = j.execution.proofBases[1].criterionIdentity;
        },
      ],
      [
        'reordered bases',
        (j) => {
          j.execution.proofBases.reverse();
        },
      ],
      [
        'missing basis',
        (j) => {
          j.execution.proofBases.pop();
        },
      ],
      [
        'extra manifest field',
        (j) => {
          j.execution.proofBases[1].manifest.approved = true;
        },
      ],
      [
        'wrong preserved bytes',
        (j) => {
          j.execution.proofBases[1].manifest.bytesHash = hashBytes('foreign proof');
        },
      ],
      [
        'wrong native result',
        (j) => {
          j.execution.proofBases[0].witness.execution.results[0].exit = 1;
        },
      ],
      [
        'unrelated after bytes',
        (j) => {
          j.after.body.bytes += '\nforged body delta';
        },
      ],
    ];
    for (const [name, alter] of changes)
      await t.test(name, async () => {
        const snapshot = structuredClone(original);
        alter(snapshot.nativeProofRecords.at(-1));
        let effects = 0,
          refusal;
        try {
          const backend = createRevisionMemory(snapshot);
          await withRevisionConsumer(
            {
              repository: f.context.repository,
              issue: f.context.issue,
              backend,
              projectDir: f.projectDir,
              activity: 'issue-write',
            },
            () => {
              effects++;
            }
          );
        } catch (error) {
          refusal = error;
        }
        assert.ok(refusal, 'native constructor or admission must refuse corrupted history');
        assert.equal(effects, 0);
      });
    assert.deepEqual(f.backend.snapshot, original);
  } finally {
    f.dispose();
  }
});
