// @story #1851
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { makeLegacyRevisionFixture } from '../../../../fixtures/criteria-revision.mjs';
import { resolveRevisionAuthorization } from '../../../../../task-tracker/lib/criteria-revision/authorization.mjs';
import {
  loadRawCodexUserMessage,
  createCodexSessionSourceLoader,
} from '../../../../../task-tracker/lib/workflow-policy/authority-resolver.mjs';
const resolve = (
  f,
  raw = f.rawUserMessage,
  source = f.authorizationSource,
  proposal = f.proposal
) =>
  resolveRevisionAuthorization({
    proposal,
    authorizationSource: source,
    loadUserMessage: async () => raw,
  });
test('one original raw human block grants exact attributable authority without invented principal', async () => {
  const f = makeLegacyRevisionFixture(),
    r = await resolve(f);
  assert.equal(r.status, 'verified');
  assert.equal(r.authority.principal, null);
  assert.equal(r.authority.statement, f.rawUserMessage.content[0].text);
  assert.equal(r.authority.executingSession, f.proposal.executor.sessionId);
  assert.equal(
    r.authority.reference,
    'codex://sessions/synthetic-session/messages/synthetic-message'
  );
});
for (const [name, mutate] of [
  ['leading spaces', (m) => (m.content[0].text = ' ' + m.content[0].text)],
  ['trailing spaces', (m) => (m.content[0].text += ' ')],
  ['newline', (m) => (m.content[0].text += '\n')],
  ['extra prose', (m) => (m.content[0].text = 'yes ' + m.content[0].text)],
  ['quotes', (m) => (m.content[0].text = '"' + m.content[0].text + '"')],
  ['multiple blocks', (m) => m.content.push({ type: 'input_text', text: '' })],
  ['assistant', (m) => (m.role = 'assistant')],
  ['tool', (m) => (m.role = 'tool')],
  [
    'forwarded injection',
    (m) => {
      m.injection = [true];
      m.content[0].text = '<system-reminder>' + m.content[0].text;
    },
  ],
  ['foreign session', (m) => (m.sessionId = 'foreign')],
  ['foreign message ID', (m) => (m.id = 'foreign-message')],
  ['unsupported block', (m) => (m.content[0].type = 'output_text')],
  [
    'normalized-only source',
    (m) => {
      m.statement = m.content[0].text;
      delete m.content;
    },
  ],
  ['missing injection classification', (m) => delete m.injection],
  ['wrong mode', (m) => (m.content[0].text = m.content[0].text.replace(' revision ', ' resume '))],
])
  test(`refuses ${name}`, async () => {
    const f = makeLegacyRevisionFixture(),
      m = structuredClone(f.rawUserMessage);
    mutate(m);
    assert.equal((await resolve(f, m)).status, 'blocked');
  });
test('unsupported host, bad source bounds/hash, absent source and changed recovery-vector digest refuse', async () => {
  const f = makeLegacyRevisionFixture();
  for (const source of [
    { ...f.authorizationSource, adapter: 'claude-session/v1' },
    { ...f.authorizationSource, messageId: 'x'.repeat(257) },
    { ...f.authorizationSource, statementHash: 'sha256:' + '0'.repeat(64) },
  ])
    assert.equal((await resolve(f, f.rawUserMessage, source)).status, 'blocked');
  assert.equal((await resolve(f, null)).status, 'blocked');
  assert.equal(
    (
      await resolveRevisionAuthorization({
        proposal: f.proposal,
        authorizationSource: f.authorizationSource,
      })
    ).status,
    'blocked'
  );
  assert.equal(
    (
      await resolve(
        f,
        f.resumeRawUserMessage,
        f.resumeRequest.authorizationSource,
        f.resumeProposal
      )
    ).status,
    'verified'
  );
  const p = structuredClone(f.resumeProposal);
  p.observedResourceVector = 'sha256:' + '0'.repeat(64);
  assert.equal(
    (await resolve(f, f.resumeRawUserMessage, f.resumeRequest.authorizationSource, p)).status,
    'blocked'
  );
});
test('raw loader keeps original blocks and IDs while existing normalized consumers still trim', async () => {
  const f = makeLegacyRevisionFixture(),
    dir = mkdtempSync(path.join(process.cwd(), '.scratch-1851-transcript-')),
    file = path.join(dir, 'session.jsonl'),
    content = [
      { type: 'input_text', text: '  original text  ' },
      { type: 'input_text', text: '<system-reminder>injected</system-reminder>' },
    ];
  const events = [
    { type: 'session_meta', payload: { id: f.authorizationSource.sessionId } },
    {
      type: 'response_item',
      payload: { type: 'message', id: f.authorizationSource.messageId, role: 'user', content },
    },
  ];
  writeFileSync(file, events.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const ports = { getHost: () => 'codex', resolveTranscript: async () => file };
  try {
    const input = {
        sessionId: f.authorizationSource.sessionId,
        messageId: f.authorizationSource.messageId,
      },
      raw = await loadRawCodexUserMessage(input, ports);
    assert.equal(raw.id, input.messageId);
    assert.deepEqual(raw.content, content);
    assert.deepEqual(raw.injection, [false, true]);
    assert.equal(
      (
        await createCodexSessionSourceLoader({
          transcriptPath: file,
          expectedSessionId: input.sessionId,
        })(f.authorizationSource)
      ).statement,
      'original text'
    );
    writeFileSync(
      file,
      events
        .concat(events[1])
        .map((x) => JSON.stringify(x))
        .join('\n')
    );
    await assert.rejects(() => loadRawCodexUserMessage(input, ports), /ambiguity/);
    await assert.rejects(
      () => loadRawCodexUserMessage({ ...input, transcriptPath: file }, ports),
      /keys/
    );
    await assert.rejects(
      () => loadRawCodexUserMessage(input, { ...ports, getHost: () => 'claude' }),
      /host/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
