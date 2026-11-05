// @story #2156
import assert from 'node:assert/strict';
import test from 'node:test';
import { setDeliverablePosted } from '../../../../task-tracker/lib/issue-kind.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { stampBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { spikeProviderFixture } from '../../../fixtures/spike-deliverable-provider.mjs';

const api = await import('../../../../task-tracker/lib/spike-deliverable.mjs').catch((error) => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const transaction = await import('../../../../task-tracker/verbs/spike-deliverable.mjs').catch(
  (error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  }
);
const url = 'https://github.com/owner/repo/issues/2156#issuecomment-50';
const ts = '2026-11-05T11:00:00.000Z';
const marker = `<!-- aitm-deliverable-posted url="${url}" ts="${ts}" -->`;
const section = (content = '') =>
  `## AITM Progress Markers\n\n<!-- aitm-issue-kind kind="spike" -->\n${content}\n`;
const comment = () => ({
  id: 50,
  html_url: url,
  body: '# Tested findings\n\nThe experiment refused the missing native actor.',
  user: { login: 'owner', type: 'User' },
  created_at: '2026-11-04T10:00:00Z',
  updated_at: '2026-11-05T10:00:00Z',
});
function invoke(name, ...args) {
  assert.equal(typeof api[name], 'function', `missing spike writer behavior: ${name}`);
  return api[name](...args);
}

async function run(f) {
  assert.equal(typeof transaction.runSpikeDeliverable, 'function', 'missing guarded spike writer');
  return transaction.runSpikeDeliverable(f.ctx, f.unitDeps);
}

test('governed transaction publishes exact report and repeat preserves bytes and original timestamp', async () => {
  const f = spikeProviderFixture();
  assert.equal((await run(f)).status, 'recorded');
  const after = f.body;
  f.unitDeps.now = () => '2026-11-06T00:00:00.000Z';
  assert.equal((await run(f)).status, 'no-op');
  assert.equal(f.body, after);
  assert.equal(f.writes.length, 1);
});

for (const state of ['backlog', 'refine', 'ready-for-plan', 'plan', 'test', 'review', 'done']) {
  test(`native transaction refuses stage ${state} before writes`, async () => {
    const f = spikeProviderFixture();
    f.state = state;
    await assert.rejects(() => run(f), /spike-deliverable:/);
    assert.equal(f.writes.length, 0);
  });
}

for (const kind of ['code', 'docs-only', 'audit', 'research', 'epic']) {
  test(`native transaction refuses ${kind} without changing its kind`, async () => {
    const f = spikeProviderFixture();
    f.body = f.body.replace('kind="spike"', `kind="${kind}"`);
    const original = f.body;
    await assert.rejects(() => run(f), /spike-deliverable:/);
    assert.equal(f.body, original);
    assert.equal(f.writes.length, 0);
  });
}

for (const [name, change] of [
  [
    'closed issue',
    (f) => {
      f.issueState = 'CLOSED';
    },
  ],
  [
    'body/board drift',
    (f) => {
      f.body = f.body.replace('state="develop"', 'state="test"');
    },
  ],
  [
    'foreign issue',
    (f) => {
      f.ctx.rest[0] = '2157';
    },
  ],
  [
    'unowned issue',
    (f) => {
      f.owners = [];
    },
  ],
  [
    'multiple owners',
    (f) => {
      f.owners = ['owner', 'other'];
    },
  ],
  [
    'foreign owner',
    (f) => {
      f.owners = ['other'];
    },
  ],
  [
    'paused timer',
    (f) => {
      f.timer.pausedAtTs = ts;
    },
  ],
  [
    'absent timer',
    (f) => {
      f.timer.entryStartTs = null;
    },
  ],
  [
    'fallback actor',
    (f) => {
      f.operator.sessionId = 'default-session';
    },
  ],
  [
    'dirty source',
    (f) => {
      f.clean = false;
    },
  ],
  [
    'artifact substitution',
    (f) => {
      f.ctx.artifactSubject = { commitSha: 'b'.repeat(40) };
    },
  ],
  [
    'wrong comment author',
    (f) => {
      f.comment.user.login = 'other';
    },
  ],
  [
    'conflicting marker',
    (f) => {
      f.body = setDeliverablePosted(f.body, { url: 'https://example.com/report', ts });
    },
  ],
  [
    'mixed kind claims',
    (f) => {
      f.body += '\n<!-- aitm-issue-kind kind="code" -->';
    },
  ],
]) {
  test(`pre-write authority refuses ${name}`, async () => {
    const f = spikeProviderFixture();
    change(f);
    await assert.rejects(() => run(f), /spike-deliverable:/);
    assert.equal(f.writes.length, 0);
  });
}

for (const [name, change] of [
  [
    'owner',
    (f) => {
      f.owners = [];
    },
  ],
  [
    'stage',
    (f) => {
      f.state = 'test';
    },
  ],
  [
    'scope',
    (f) => {
      f.body = f.body.replace('One bounded investigation report.', 'Changed governed scope.');
    },
  ],
  [
    'binding generation',
    (f) => {
      f.operator.bindingGenerationId = 'renewed';
    },
  ],
  [
    'source',
    (f) => {
      f.clean = false;
    },
  ],
  [
    'HEAD',
    (f) => {
      f.sourceHead = f.operator.headSha = 'b'.repeat(40);
    },
  ],
  [
    'timer visit',
    (f) => {
      f.timer.entryStartTs = '2026-11-05T10:30:00.000Z';
    },
  ],
]) {
  test(`fresh barrier refuses ${name} drift after report read`, async () => {
    const f = spikeProviderFixture();
    f.hooks.beforeComment = () => change(f);
    await assert.rejects(() => run(f), /spike-deliverable:/);
    assert.equal(f.writes.length, 0);
  });
}

test('edited comment after initial observation refuses before provider write', async () => {
  const f = spikeProviderFixture();
  let observed = false;
  f.hooks.beforeComment = () => {
    if (observed) f.comment.body += '\nChanged finding';
    observed = true;
  };
  await assert.rejects(() => run(f), /spike-deliverable:comment-drift/);
  assert.equal(f.writes.length, 0);
});

test('unrelated additive body update is preserved by fresh mutation', async () => {
  const f = spikeProviderFixture();
  let updated = false;
  f.hooks.beforeComment = () => {
    if (!updated) f.body += '\n\n## Notes\n\nConcurrent unrelated note.\n';
    updated = true;
  };
  assert.equal((await run(f)).status, 'recorded');
  assert.ok(f.body.includes('Concurrent unrelated note.'));
});

test('real governed retry rebases the marker over a concurrent additive edit', async () => {
  const f = spikeProviderFixture();
  const original = f.body;
  f.hooks.push = (candidate) => {
    f.body =
      f.writes.length === 1
        ? stampBodyVersion(original + '\n\n## Notes\n\nConcurrent retry note.\n', 2)
        : candidate;
  };
  assert.equal((await run(f)).status, 'recorded');
  assert.equal(f.writes.length, 2);
  assert.ok(f.body.includes('Concurrent retry note.'));
});

test('ownership loss between governed retries refuses the second write', async () => {
  const f = spikeProviderFixture();
  const original = f.body;
  f.hooks.push = () => {
    f.body = stampBodyVersion(original + '\n\n## Notes\n\nConcurrent note.\n', 2);
    f.owners = [];
  };
  await assert.rejects(() => run(f), /spike-deliverable:/);
  assert.equal(f.writes.length, 1);
});

test('comment edit after a remote write is uncertainty, never successful publication', async () => {
  const f = spikeProviderFixture();
  f.hooks.afterPush = () => {
    f.comment.body += '\nLater edit';
  };
  await assert.rejects(() => run(f), /spike-deliverable:comment-drift/);
  assert.equal(f.writes.length, 1);
  assert.ok(f.body.includes('aitm-deliverable-posted'));
});

test('nominal no-op without a validated candidate cannot report success', async () => {
  const f = spikeProviderFixture();
  f.unitDeps.mutateIssueBody = async () => ({ status: 'no-op', version: 1, body: f.body });
  await assert.rejects(() => run(f), /spike-deliverable:body-readback/);
  assert.equal(f.writes.length, 0);
});

test('mixed returned marker refuses despite actual provider publication', async () => {
  const f = spikeProviderFixture();
  f.unitDeps.mutateIssueBody = async (options) => {
    const result = await mutateIssueBody(options);
    return { ...result, body: result.body.replace(url, url.replace('-50', '-51')) };
  };
  await assert.rejects(() => run(f), /spike-deliverable:body-readback/);
  assert.equal(f.writes.length, 1);
});
function validate(value = comment(), overrides = {}) {
  return invoke('validateSpikeDeliverableComment', {
    repository: 'owner/repo',
    issueNumber: 2156,
    commentId: '50',
    currentUser: 'owner',
    comment: value,
    ...overrides,
  });
}

test('explicit command references retain one target and actual numeric comment', () => {
  assert.deepEqual(invoke('parseSpikeDeliverableArgs', ['2156', '--from-comment', '50']), {
    issueNumber: 2156,
    commentReference: '50',
  });
  assert.deepEqual(invoke('parseSpikeDeliverableArgs', ['#2156', `--from-comment=${url}`]), {
    issueNumber: 2156,
    commentReference: url,
  });
});

for (const args of [
  [],
  ['2156'],
  ['--from-comment', '50'],
  ['0', '--from-comment', '50'],
  ['2156', '--from-comment', '0'],
  ['2156', '2157', '--from-comment', '50'],
  ['2156', '--from-comment', '50', '--from-comment', '50'],
  ['2156', '--from-comment', '50', '--unknown'],
  ['2156', '--from-comment', url + '?query=1'],
  ['2156', '--from-comment', url.replace('/2156#', '/2157#')],
  ['2156', '--from-comment', url.replace('https:', 'http:')],
  ['2156', '--from-comment', url + '/extra'],
]) {
  test(`ambiguous or invalid command refuses: ${JSON.stringify(args)}`, () => {
    assert.throws(() => invoke('parseSpikeDeliverableArgs', args), /spike-deliverable:/);
  });
}

test('current same-issue report preserves actual body and edited provider metadata', () => {
  const actual = comment();
  const observed = validate(actual);
  assert.equal(observed.body, actual.body);
  assert.equal(observed.url, url);
  assert.equal(observed.id, '50');
  assert.notEqual(actual.created_at, actual.updated_at);
  const identity = invoke('spikeDeliverableCommentIdentity', observed);
  assert.equal(identity, invoke('spikeDeliverableCommentIdentity', validate(comment())));
  assert.notEqual(
    identity,
    invoke('spikeDeliverableCommentIdentity', validate({ ...actual, body: actual.body + '\nEdit' }))
  );
});

for (const [name, change] of [
  ['empty body', { body: ' \n ' }],
  ['wrong id', { id: 51 }],
  ['unsafe id', { id: Number.MAX_SAFE_INTEGER + 1 }],
  ['wrong issue', { html_url: url.replace('/2156#', '/2157#') }],
  ['wrong repository', { html_url: url.replace('owner/repo', 'other/repo') }],
  ['wrong fragment', { html_url: url.replace('-50', '-51') }],
  ['noncanonical url', { html_url: url + '?extra=1' }],
  ['wrong author', { user: { login: 'other', type: 'User' } }],
  ['bot author', { user: { login: 'owner', type: 'Bot' } }],
  ['missing author', { user: null }],
  ['missing created metadata', { created_at: null }],
  ['invalid updated metadata', { updated_at: 'yesterday' }],
  ['reversed metadata', { updated_at: '2026-11-03T10:00:00Z' }],
]) {
  test(`report evidence refuses ${name}`, () => {
    assert.throws(() => validate({ ...comment(), ...change }), /spike-deliverable:/);
  });
}

test('valid section with no deliverable is distinguishable from malformed section', () => {
  assert.equal(invoke('readSpikeDeliverableMarker', section()), null);
  assert.deepEqual(invoke('readSpikeDeliverableMarker', section(marker)), { url, ts });
  const original = section(marker);
  assert.equal(setDeliverablePosted(original, { url, ts: '2026-11-06T00:00:00.000Z' }), original);
});

test('outside prose and fenced marker examples do not become deliverable claims', () => {
  const body = `## Scope\n\n${marker}\n\n\u0060\u0060\u0060html\n${marker}\n\u0060\u0060\u0060\n\n${section()}`;
  assert.equal(invoke('readSpikeDeliverableMarker', body), null);
});

for (const [name, body] of [
  ['absent progress section', `## Scope\n${marker}\n`],
  ['duplicate progress sections', section() + section(marker)],
  ['bare marker', section('<!-- aitm-deliverable-posted -->')],
  ['invalid timestamp same url', section(marker.replace(ts, 'yesterday'))],
  ['noncanonical timestamp same url', section(marker.replace('.000Z', 'Z'))],
  ['unknown property', section(marker.replace(' -->', ' extra="yes" -->'))],
  ['unterminated claim', section(marker.slice(0, -3))],
  ['fenced in-section claim', section(`\u0060\u0060\u0060html\n${marker}\n\u0060\u0060\u0060`)],
  ['two valid claims', section(marker + '\n' + marker)],
  ['malformed plus valid claim', section('<!-- aitm-deliverable-posted -->\n' + marker)],
  ['unterminated plus valid claim', section('<!-- aitm-deliverable-posted\n' + marker)],
  [
    'case-variant plus valid claim',
    section(marker.replace('aitm-deliverable-posted', 'AITM-Deliverable-Posted') + '\n' + marker),
  ],
]) {
  test(`strict marker inventory refuses ${name}`, () => {
    assert.throws(() => invoke('readSpikeDeliverableMarker', body), /spike-deliverable:/);
  });
}
