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

test('explicit matching wave reversals refuse across ordinary human phrasings', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const reversal of [
    'Hold off on epic #107 rank 2.',
    'Do not proceed with epic #107 rank 2 in parallel.',
    'Epic #107 rank 2 is not approved.',
    'Pause epic #107 rank 2.',
    "Let's go sequential for epic #107 rank 2.",
  ]) {
    assert.equal(
      (await verify([original, human('Please inspect CI.'), human(reversal)], { order: [0] }))
        .status,
      'blocked',
      reversal
    );
  }
});

test('direct full scope needs an unqualified permission rather than a conditional or deferred request', async () => {
  for (const request of [
    "Let's not run parallel epic #107 rank 2 children [140,144,145] until CI is green.",
    "We shouldn't run parallel epic #107 rank 2 children [140,144,145].",
    'Run parallel epic #107 rank 2 children [140,144,145] later.',
  ]) {
    assert.equal((await verify([human(request)])).status, 'blocked', request);
  }
});

test('yes to a sequential or negative assistant proposal cannot authorize parallel admission', async () => {
  for (const proposal of [
    'Should I keep epic #107 rank 2 children [140,144,145] sequential instead of parallel?',
    'Do you want me to hold off on parallel epic #107 rank 2 children [140,144,145]?',
    'Should I forbid parallel epic #107 rank 2 children [140,144,145]?',
    'Run parallel epic #107 rank 2 children [140,144,145] later?',
  ]) {
    assert.equal((await verify([assistant(proposal), human('Yes.')])).status, 'blocked', proposal);
  }
});

test('sequential test instructions and answers to unrelated later questions preserve wave authority', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    'Run the unit tests sequentially.',
    'Keep the Test-stage runs one at a time.',
  ]) {
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'verified', text);
  }
  assert.equal(
    (await verify([original, assistant('Should I push?'), human('No.')], { order: [0] })).status,
    'verified'
  );
});

test('a yes cannot be attached to an older proposal by omitting the actual intervening assistant question', async () => {
  const messages = [
    assistant('Enable parallel epic #107 rank 2 children [140,144,145].'),
    assistant('Should I run lint?'),
    human('Yes.'),
  ];
  assert.equal((await verify(messages, { order: [0, 2] })).status, 'blocked');
});

test('positive permission questions remain usable as exact displayed proposals', async () => {
  for (const proposal of [
    'Should I enable parallel epic #107 rank 2 children [140,144,145]?',
    'Do you want me to run parallel epic #107 rank 2 children [140,144,145]?',
  ]) {
    assert.equal((await verify([assistant(proposal), human('Yes.')])).status, 'verified', proposal);
  }
});

test('parallel test commands, comparative wording and alternative choices do not grant admission', async () => {
  for (const text of [
    'Run epic #107 rank 2 children [140,144,145] one by one rather than in parallel.',
    'Run the unit tests for epic #107 rank 2 children [140,144,145] in parallel.',
    'Run parallel unit tests for epic #107 rank 2 children [140,144,145].',
  ])
    assert.equal((await verify([human(text)])).status, 'blocked', text);
  for (const text of [
    'Should I run epic #107 rank 2 children [140,144,145] individually instead of in parallel?',
    'Should I run parallel epic #107 rank 2 children [140,144,145] or stagger them?',
    'A: parallel epic #107 rank 2 children [140,144,145] or staggered execution.',
    'A: parallel unit tests for epic #107 rank 2 children [140,144,145].',
  ])
    assert.equal(
      (await verify([assistant(text), human(text.startsWith('A:') ? 'A' : 'Yes.')])).status,
      'blocked',
      text
    );
});

test('scoped status and negative revocation chatter preserve genuine wave permission', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    "Don't close epic #107 yet.",
    'Epic #107 has no open PRs.',
    "rank 2 tests aren't passing",
    "Don't revoke epic #107 rank 2.",
    "Run the stories' tests sequentially for epic #107 rank 2.",
    'Run unit tests for children [140,144,145] one at a time.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'verified', text);
});

test('agreement with an authentic revocation does not contradict that revocation', async () => {
  assert.equal(
    (
      await verify(
        [
          human('Revoke epic #107 rank 2 children [140,144,145].'),
          human("Don't restart epic #107 rank 2."),
        ],
        { order: [0], purpose: 'revoke' }
      )
    ).status,
    'verified'
  );
});

test('direct trailing parallel execution retains explicit admission intent', async () => {
  assert.equal(
    (await verify([human('Run epic #107 rank 2 children [140,144,145] in parallel.')])).status,
    'verified'
  );
});

test('negated pause and approval of tests remain distinct from withdrawal of admission', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    "Don't pause epic #107 rank 2.",
    "Don't hold off on epic #107 rank 2.",
    'Epic #107 rank 2 tests are not approved.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'verified', text);
});

test('a neutral or negated clause cannot hide a genuine reversal in another clause', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    "Don't stop CI, but hold off on epic #107 rank 2.",
    "Don't wait for CI. Pause epic #107 rank 2.",
    'Tests pass. Run epic #107 rank 2 children one at a time.',
    'Rank 2 tests are green, but epic #107 rank 2 is not approved.',
    "Don't revoke rank 3; withdraw epic #107 rank 2.",
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'blocked', text);
});

test('scope tokens cannot turn unrelated parallel operations into story admission', async () => {
  for (const text of [
    'Run epic #107 rank 2 children [140,144,145] CI in parallel.',
    'Run parallel epic #107 rank 2 children [140,144,145] verification.',
    'Run epic #107 rank 2 children [140,144,145] merges in parallel.',
    'Run parallel epic #107 rank 2 children [140,144,145] serially.',
  ])
    assert.equal((await verify([human(text)])).status, 'blocked', text);
  assert.equal(
    (
      await verify([
        assistant(
          'Should I run epic #107 rank 2 children [140,144,145] verify-develop in parallel?'
        ),
        human('Yes.'),
      ])
    ).status,
    'blocked'
  );
});

test('CI, completion, close approval, PR approval and timer chatter keep admission permission', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    'Wait for epic #107 rank 2 CI.',
    'Wait for rank 2 to finish before starting rank 3.',
    'Epic #107 is not approved yet.',
    'Epic #107 rank 2 PR is not approved.',
    'Pause the epic #107 timer.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'verified', text);
});

test('explicit isolation on a second line does not obscure direct admission permission', async () => {
  assert.equal(
    (
      await verify([
        human('Run parallel epic #107 rank 2 children [140,144,145].\nUse isolated worktrees.'),
      ])
    ).status,
    'verified'
  );
});

test('sequential agreement does not reverse an authentic revocation', async () => {
  assert.equal(
    (
      await verify(
        [
          human('Revoke epic #107 rank 2 children [140,144,145].'),
          human('Run sequentially instead.'),
        ],
        { order: [0], purpose: 'revoke' }
      )
    ).status,
    'verified'
  );
});

test('ordinary leading, trailing, possessive and joined reversal wording cannot preserve withdrawn authority', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    'Hold off on epic #107 rank 2 for now.',
    'Stop rank 2 for now.',
    'Hold off on the parallel stories for now.',
    'Hold off on rank 2 and rank 3.',
    'Pause epic #107 ranks 2 and 3.',
    "Don't run rank 2 in parallel anymore.",
    'Do not proceed with epic #107 rank 2 yet.',
    "Don't approve rank 2 yet.",
    'Withdraw my approval for rank 2.',
    'I revoke the rank 2 permission.',
    'OK, hold off on epic #107 rank 2.',
    "Never mind, don't run rank 2.",
    'Rank 2 is not approved anymore.',
    "Don't wait for CI, pause epic #107 rank 2.",
    'Tests pass and pause epic #107 rank 2.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'blocked', text);
});

test('natural admission articles, isolation order and explicit approval remain unambiguous', async () => {
  for (const text of [
    'Run the epic #107 rank 2 children [140,144,145] in parallel.',
    'Run epic #107 rank 2 children [140,144,145] in parallel in isolated worktrees.',
    'Approve parallel admission for epic #107 rank 2 children [140,144,145].',
    'Run all rank 2 children [140,144,145] of epic #107 in parallel.',
  ])
    assert.equal((await verify([human(text)])).status, 'verified', text);
});

test('each reversal verb keeps its own object when joined with an extra polite prefix', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    "Don't stop CI, and please pause epic #107 rank 2.",
    'Run unit tests sequentially and please run epic #107 rank 2 stories sequentially.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'blocked', text);
});

test('a reason or unrelated follow-on operation cannot conceal withdrawal of admission', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    'Pause epic #107 rank 2 because CI is red.',
    'Hold off on epic #107 rank 2, the tests are flaky.',
    'Stop rank 2 so I can review the diff.',
    'Pause the parallel stories pending review.',
    'Hold off on rank 2 till CI is fixed.',
    'Cancel the rank 2 wave since the build is broken.',
    'Hold off on epic #107 rank 2 and close the session.',
    'Pause epic #107 rank 2 because epic #108 rank 3 CI is red.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'blocked', text);
});

test('ordinary smart punctuation and negation modifiers cannot conceal a withdrawal', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    'Don’t run rank 2 in parallel anymore.',
    'Never mind, don’t run rank 2.',
    'Do not actually run rank 2.',
    'dont run rank 2.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'blocked', text);
});

test('scope before a withdrawal verb remains authoritative context', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    'The parallel stories should stop for now.',
    'Rank 2 needs to pause until CI is green.',
    "I'd like the rank 2 wave to hold off for now.",
    'Rank 2: hold off on that.',
    'Because epic #108 is red, the parallel stories should pause for now.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'blocked', text);
});

test('spelled-out modal negation withdraws admission as contracted negation does', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    'Rank 2 should not run in parallel.',
    'We must not run rank 2 in parallel.',
    "Let's not run rank 2 in parallel.",
    'Rank 2 cannot run in parallel.',
    "I don't want rank 2 running in parallel anymore.",
    "Don't let rank 2 run in parallel.",
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'blocked', text);
});

test('running and quantified testing instructions are neutral activities', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  for (const text of [
    'Stop running tests for rank 2.',
    'Pause running CI on rank 2.',
    'Stop all rank 2 tests.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'verified', text);
});

test('scope field punctuation stays distinct from a withdrawal reason separator', async () => {
  const original = human('Run parallel epic #107 rank 2 children [140,144,145].');
  assert.equal(
    (await verify([original, human('Pause rank: 2.')], { order: [0] })).status,
    'blocked'
  );
  assert.equal(
    (await verify([original, human('Cancel parallel children: [160,161].')], { order: [0] }))
      .status,
    'verified'
  );
  assert.equal(
    (await verify([original, human('Stop as many rank 2 stories as possible.')], { order: [0] }))
      .status,
    'blocked'
  );
});

test('sentence-final withdrawal and negated verbs revoke native permission', async () => {
  const original = human('Run all rank 2 children [140,144,145] of epic #107 in parallel.');
  for (const text of [
    'The parallel stories should stop.',
    'Rank 2 needs to pause.',
    'Epic #107 rank 2 should hold off.',
    'Rank 2 should not run.',
    'Rank 2 cannot proceed.',
    'Rank 2 should pause, CI is red.',
    'Rank 2, hold off, CI is red.',
    'Rank 2 should not run, CI is red.',
    'Epic #107 rank 2 needs to stop, tests are failing.',
    'Rank 2 should pause: CI is red.',
    'Rank 2 should stop—CI is red.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'blocked', text);
});

test('withdrawal pronouns and empty objects retain the nearest scoped subject', async () => {
  const original = human('Run all rank 2 children [140,144,145] of epic #107 in parallel.');
  for (const text of [
    'Epic #107 rank 2 is broken so stop it.',
    'CI on rank 2 keeps failing, so hold off on it.',
    'Rank 2, since CI is red, should pause.',
    'Rank 2, please hold off on it.',
    'Rank 2, hold off.',
    'Because epic #108 is red, the parallel stories should pause.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'blocked', text);
  for (const text of [
    'Epic #108 rank 2 is broken so stop it.',
    'Epic #108 rank 2, hold off.',
    'Rank 2 is green, epic #108 rank 2 is broken so stop it.',
    'Rank 2 is green, cancel parallel children [160,161].',
    'Children [160,161], hold off.',
    'Rank 2 tests passed. Please hold off on deployment.',
    'Rank 2 should not pause.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'verified', text);
});

test('a verb-shaped noun cannot cut the scope off its preceding withdrawal', async () => {
  const original = human('Run all rank 2 children [140,144,145] of epic #107 in parallel.');
  for (const text of [
    'Withdraw the "go" for rank 2.',
    'Cancel the `run` for rank 2.',
    'Pause the run/build for rank 2.',
    'Cancel the start of rank 2.',
    'Withdraw the go ahead for rank 2.',
    'Rank 2 needs the pause.',
    'The run should be sequential for rank 2.',
    'Cancel rank 2 and the "run" for epic #108 rank 3.',
    'Stop rank 2 and the "run" for children [160,161].',
    'Withdraw my "go" for rank 2.',
    'Withdraw "go" for rank 2.',
    'Cancel `run` for rank 2.',
    'Pause run/build for rank 2.',
    'Cancel rank 3 and the "run" for rank 2.',
    'Cancel rank 3 and "run" for rank 2.',
    'Cancel rank 3 and `run` for rank 2.',
    'Cancel rank 3 and the run/build for rank 2.',
  ])
    assert.equal((await verify([original, human(text)], { order: [0] })).status, 'blocked', text);
  assert.equal(
    (await verify([original, human('Cancel the start of epic #108 rank 2.')], { order: [0] }))
      .status,
    'verified'
  );
});
