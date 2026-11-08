// @story #2145
import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkflowExceptionRuntime } from '../../../../task-tracker/verbs/workflow-exception.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { hashAuthorizationStatement } from '../../../../task-tracker/lib/workflow-policy/authority-resolver.mjs';
const statement = 'Authorize this bounded Review waiver.\nPreserve the approved source.';

test('native workflow runtime selects canonical host source instead of transcript lookup', async () => {
  const sessionId = currentSessionId();
  let calls = 0;
  let closes = 0;
  const source = {
    schema: 'aitm.authorization-source/v2',
    adapter: 'codex-app-server/v1',
    threadId: 'thread',
    turnId: 'turn',
    sessionId,
    messageId: 'message',
    statementHash: hashAuthorizationStatement(statement),
  };
  const authorityTransport = () => ({
    request: async (method) => {
      calls++;
      if (method === 'initialize') return {};
      if (method === 'thread/read') return { thread: { id: 'thread', sessionId } };
      return {
        data: [
          {
            turnId: 'turn',
            item: {
              type: 'userMessage',
              id: 'message',
              content: [{ type: 'text', text: statement }],
            },
          },
        ],
        nextCursor: null,
      };
    },
    notify: () => {},
    close: () => closes++,
  });
  const runtime = createWorkflowExceptionRuntime(
    { cfg: { repo: 'owner/repo' }, projectDir: process.cwd() },
    { deliver: {}, authorityTransport }
  );
  const result = await runtime.resolveAuthority({ source });
  assert.equal(result.status, 'verified');
  assert.equal(result.authority.origin, 'codex-app-server');
  assert.equal(result.authority.statement, statement);
  assert.equal(calls, 3);
  assert.equal(closes, 1);
});
