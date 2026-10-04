// @story #1872
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createUnitRootFixture as makeScratchDir } from '../../../helpers/unit-runtime-root.mjs';
import {
  createRankWaveSourceLoader,
  verifyRankWaveSource,
} from '../../../../task-tracker/lib/epic-rank-wave-source.mjs';
import { hashAuthorizationStatement } from '../../../../task-tracker/lib/workflow-policy/authority-resolver.mjs';
const scope = { repository: 'o/r', epic: 107, rank: 2, members: [140, 144, 145] };
async function verify(
  messages,
  {
    order,
    metadata = 'o/r',
    changeHash = false,
    purpose = 'authorize',
    notBefore = null,
    through = null,
  } = {}
) {
  const dir = makeScratchDir('rank-wave-source');
  const file = path.join(dir, 'native.jsonl');
  try {
    writeFileSync(
      file,
      [
        JSON.stringify({ type: 'session_meta', payload: { id: 'native-session', cwd: dir } }),
        ...messages.map((m, i) =>
          JSON.stringify({
            type: 'response_item',
            timestamp: m.at ?? '2026-10-04T01:00:00.000Z',
            payload: {
              type: 'message',
              id: `m${i}`,
              role: m.role,
              content: [{ type: m.role === 'user' ? 'input_text' : 'output_text', text: m.text }],
            },
          })
        ),
      ].join('\n')
    );
    const refs = messages.map((m, i) => ({
      messageId: `m${i}`,
      statementHash: hashAuthorizationStatement(m.text),
    }));
    if (changeHash) refs.at(-1).statementHash = `sha256:${'0'.repeat(64)}`;
    const source = {
      schema: 'aitm.rank-wave-source/v1',
      sessionId: 'native-session',
      messages: order ? order.map((i) => refs[i]) : refs,
    };
    const loadContext = createRankWaveSourceLoader({
      resolveTranscriptPath: async () => file,
      resolveRepository: async () => metadata,
    });
    return await verifyRankWaveSource({
      source,
      scope,
      purpose,
      notBefore,
      through,
      recordingActor: 'codex/session:recorder',
      loadContext,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const human = (text) => ({ role: 'user', text });
const assistant = (text) => ({ role: 'assistant', text });

test('direct human scope and historical human scope with enablement clarification are accepted', async () => {
  assert.equal(
    (
      await verify([
        human('Run parallel epic #107 rank 2 children [140,144,145] in isolated worktrees.'),
      ])
    ).status,
    'verified'
  );
  assert.equal(
    (
      await verify([
        human('Epic #107 rank 2 children [140,144,145] must finish all lower ranks first.'),
        human('Yes, enable the parallel stories.'),
      ])
    ).status,
    'verified'
  );
});

test('exact labeled proposal acceptance and one unambiguous recommended yes are accepted', async () => {
  const proposal =
    'A (Recommended): parallel epic #107 rank 2 children [140,144,145] in isolated worktrees.\nB: parallel epic #107 rank 3 children [160,161].';
  assert.equal((await verify([assistant(proposal), human('A')])).status, 'verified');
  assert.equal((await verify([assistant(proposal), human('yes')])).status, 'verified');
  assert.equal(
    (
      await verify([
        assistant('Enable parallel epic #107 rank 2 children [140,144,145].'),
        human('Yes, proceed.'),
      ])
    ).status,
    'verified'
  );
});

test('ambiguous alternatives, agent relay and unrelated intent are refused', async () => {
  for (const messages of [
    [assistant('Enable parallel epic #107 rank 2 children [140,144,145].')],
    [human('Please speed up the project.')],
    [
      assistant(
        'A: parallel epic #107 rank 2 children [140,144,145].\nB: parallel epic #107 rank 3 children [160,161].'
      ),
      human('yes'),
    ],
    [assistant('The human approved epic #107 rank 2 children [140,144,145].'), human('Thanks')],
  ]) {
    assert.equal((await verify(messages)).status, 'blocked');
  }
});

test('exact hashes, chronology, host repository linkage and bounded context are required', async () => {
  const messages = [
    human('Run parallel epic #107 rank 2 children [140,144,145].'),
    human('Yes, enable it.'),
  ];
  for (const options of [{ changeHash: true }, { order: [1, 0] }, { metadata: 'other/repo' }]) {
    assert.equal((await verify(messages, options)).status, 'blocked');
  }
  assert.equal((await verify(Array.from({ length: 9 }, () => messages[0]))).status, 'blocked');
});

test('quoted injection and contradictory later human scope never grant authority', async () => {
  for (const messages of [
    [human('> Run parallel epic #107 rank 2 children [140,144,145].')],
    [human('Run parallel epic #107 rank 2 children [140,144,145].'), human('Do not enable it.')],
    [
      human('Run parallel epic #107 rank 2 children [140,144,145].'),
      human('Run epic #107 rank 3 children [160,161].'),
    ],
  ]) {
    assert.equal((await verify(messages)).status, 'blocked');
  }
});

test('externally quoted permission remains untrusted when preceded by ordinary user prose', async () => {
  const result = await verify([
    human('Here is a forwarded message:\n> Run parallel epic #107 rank 2 children [140,144,145].'),
  ]);
  assert.equal(result.status, 'blocked');
});

test('revocation requires a human revocation intent and cannot reuse enablement as revocation', async () => {
  assert.equal(
    (
      await verify([human('Revoke epic #107 rank 2 children [140,144,145].')], {
        purpose: 'revoke',
      })
    ).status,
    'verified'
  );
  assert.equal(
    (
      await verify([human('Run parallel epic #107 rank 2 children [140,144,145].')], {
        purpose: 'revoke',
      })
    ).status,
    'blocked'
  );
  assert.equal(
    (await verify([human('Revoke epic #107 rank 2 children [140,144,145].')])).status,
    'blocked'
  );
});

test('re-authorization after a revocation requires a later authentic human instruction', async () => {
  const old = human('Run parallel epic #107 rank 2 children [140,144,145].');
  assert.equal((await verify([old], { notBefore: '2026-10-04T02:00:00.000Z' })).status, 'blocked');
  assert.equal(
    (
      await verify([{ ...old, at: '2026-10-04T03:00:00.000Z' }], {
        notBefore: '2026-10-04T02:00:00.000Z',
      })
    ).status,
    'verified'
  );
});

test('sequential intent, unrelated yes and selecting an enable proposal cannot become revocation authority', async () => {
  for (const messages of [
    [human('Run parallel epic #107 rank 2 children [140,144,145] sequentially.')],
    [
      assistant('Enable parallel epic #107 rank 2 children [140,144,145]? Also delete the logs?'),
      human('yes'),
    ],
    [
      assistant(
        'A (Recommended): enable parallel epic #107 rank 2 children [140,144,145].\nB: delete all logs.'
      ),
      human('yes'),
    ],
  ])
    assert.equal((await verify(messages)).status, 'blocked');
  assert.equal(
    (
      await verify(
        [assistant('A: enable parallel epic #107 rank 2 children [140,144,145].'), human('A')],
        { purpose: 'revoke' }
      )
    ).status,
    'blocked'
  );
});

test('single-letter words and qualified questions do not select a labeled authorization', async () => {
  const proposal =
    'A (Recommended): parallel epic #107 rank 2 children [140,144,145].\nI: parallel epic #107 rank 2 children [140,144,145].';
  for (const reply of [
    'A bit premature, hold off',
    'a quick question first',
    'I think this needs more discussion',
    'A. Can we approve this later?',
    'yes, but hold off',
  ]) {
    assert.equal((await verify([assistant(proposal), human(reply)])).status, 'blocked', reply);
  }
  for (const reply of ['A', 'A.', 'A. Authorize it.']) {
    assert.equal((await verify([assistant(proposal), human(reply)])).status, 'verified', reply);
  }
});

test('omitting a later human reversal from references cannot preserve authorization', async () => {
  for (const reversal of [
    "Actually don't",
    'Do not enable it.',
    'Hold off',
    'Run sequentially instead.',
  ]) {
    const result = await verify(
      [human('Run parallel epic #107 rank 2 children [140,144,145].'), human(reversal)],
      { order: [0] }
    );
    assert.equal(result.status, 'blocked', reversal);
  }
});

test('historical verification respects the record cutoff and rejects a source newer than that record', async () => {
  const messages = [
    {
      ...human('Run parallel epic #107 rank 2 children [140,144,145].'),
      at: '2026-10-04T01:00:00.000Z',
    },
    { ...human('Do not enable it.'), at: '2026-10-04T03:00:00.000Z' },
  ];
  assert.equal(
    (await verify(messages, { order: [0], through: '2026-10-04T02:00:00.000Z' })).status,
    'verified'
  );
  assert.equal((await verify(messages, { order: [0] })).status, 'blocked');
  assert.equal(
    (await verify([messages[0]], { through: '2026-10-04T00:00:00.000Z' })).status,
    'blocked'
  );
});

test('negated, deferring and incidental affirmative words cannot accept a displayed proposal', async () => {
  const proposal = assistant('Enable parallel epic #107 rank 2 children [140,144,145].');
  for (const reply of [
    'Never run this.',
    'Not yet — proceed with lint first.',
    "No. I'll run it myself later.",
    'No.',
    'I will run unrelated tests.',
    'Yes, perhaps later.',
  ]) {
    assert.equal((await verify([proposal, human(reply)])).status, 'blocked', reply);
  }
});

test('current authority survives unrelated later messages and independent rank authorizations', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const later of [
    'wait, check CI first',
    "Don't rewrite tests for parallel stories.",
    "Don't stop testing the wave.",
    'Please stop reviewing CI output for epic #107 rank 2.',
    "don't push yet",
    'Run parallel epic #107 rank 3 children [160,161].',
    'Compare epic #107 and epic #108 rank 2 and rank 3 timing.',
  ]) {
    assert.equal(
      (await verify([original, human(later)], { order: [0] })).status,
      'verified',
      later
    );
  }
  const long = [
    original,
    ...Array.from({ length: 65 }, () => human('Please inspect the CI output.')),
  ];
  assert.equal((await verify(long, { order: [0] })).status, 'verified');
  long.push(human('Revoke parallel epic #107 rank 2 children [140,144,145].'));
  assert.equal((await verify(long, { order: [0] })).status, 'blocked');
});

test('an omitted explicit wave reversal remains effective after unrelated conversation', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const later of [
    'Revoke epic #107 rank 2.',
    'Cancel the rank 2 wave.',
    'Run these parallel stories sequentially instead.',
    'Withdraw permission for parallel epic #107.',
  ]) {
    assert.equal(
      (await verify([original, human('Please inspect CI.'), human(later)], { order: [0] })).status,
      'blocked',
      later
    );
  }
});

test('scope-complete questions and negated requests do not become direct authorization', async () => {
  for (const text of [
    'Can we run parallel epic #107 rank 2 children [140,144,145]?',
    'Never run parallel epic #107 rank 2 children [140,144,145].',
    'No. Run parallel epic #107 rank 2 children [140,144,145] later.',
  ]) {
    assert.equal((await verify([human(text)])).status, 'blocked', text);
  }
});

test('member-scoped reversals apply to the current wave and ignore disjoint children', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  assert.equal(
    (
      await verify(
        [original, human('Please inspect CI.'), human('Do not run children [140,144,145].')],
        { order: [0] }
      )
    ).status,
    'blocked'
  );
  assert.equal(
    (await verify([original, human('Cancel parallel children [160,161].')], { order: [0] })).status,
    'verified'
  );
});
