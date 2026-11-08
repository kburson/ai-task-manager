// @story #2145
import { spawn } from 'node:child_process';
import { isInjection } from '../../word-counter.mjs';
import { hashAuthorizationStatement, validateAuthorizationSource } from './authority-resolver.mjs';

const METHODS = new Set(['initialize', 'thread/read', 'thread/items/list']);
const failure = (code) => new TypeError(`workflow-exception-host:${code}`);

// Production always owns a fresh stdio reader. Injection is an internal test seam,
// never an authorization-source field or a caller-selected command/socket.
export function createCodexHostTransport({
  spawnProcess = spawn,
  timeoutMs = 30000,
  maxBytes = 8 * 1024 * 1024,
} = {}) {
  const child = spawnProcess('codex', ['app-server', '--stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let sequence = 0;
  let buffer = '';
  let bytes = 0;
  let ended = false;
  let terminalError;
  const close = (error = failure('closed')) => {
    if (ended) return;
    ended = true;
    terminalError = error;
    clearTimeout(timer);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    child.stdin.end();
    child.kill();
  };
  const timer = setTimeout(() => close(failure('timeout')), timeoutMs);
  child.on('error', () => close(failure('process')));
  child.on('exit', () => close(failure('process-exit')));
  child.stdin.on('error', () => close(failure('input')));
  child.stderr.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > maxBytes) close(failure('oversized'));
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    if (ended) return;
    bytes += Buffer.byteLength(chunk);
    if (bytes > maxBytes) {
      close(failure('oversized'));
      return;
    }
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf('\n');
      if (end < 0) break;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        close(failure('malformed'));
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        close(failure('malformed'));
        return;
      }
      if (!Object.hasOwn(message, 'id') && typeof message.method === 'string') continue;
      const request = pending.get(message.id);
      if (!request || Object.hasOwn(message, 'error') === Object.hasOwn(message, 'result')) {
        close(failure('unexpected-reply'));
        return;
      }
      pending.delete(message.id);
      if (Object.hasOwn(message, 'error')) {
        request.reject(failure('host-error'));
        close(failure('host-error'));
        return;
      }
      request.resolve(message.result);
    }
  });
  return Object.freeze({
    async request(method, params) {
      if (!METHODS.has(method)) throw failure('method');
      if (ended) throw terminalError;
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      });
    },
    notify(method) {
      if (method !== 'initialized') throw failure('method');
      if (ended) throw terminalError;
      child.stdin.write(JSON.stringify({ method }) + '\n');
    },
    close,
  });
}

export function createCodexHostSourceLoader({
  expectedSessionId,
  transport = createCodexHostTransport,
} = {}) {
  return async (source) => {
    validateAuthorizationSource(source);
    if (source.adapter !== 'codex-app-server/v1' || source.sessionId !== expectedSessionId)
      throw failure('foreign-session');
    const client = await transport();
    try {
      await client.request('initialize', {
        clientInfo: { name: 'aitm_authority_reader', version: '1.0.0' },
      });
      client.notify('initialized');
      const result = await client.request('thread/read', { threadId: source.threadId });
      if (result?.thread?.id !== source.threadId || result.thread.sessionId !== expectedSessionId)
        throw failure('thread-identity');
      const matches = [];
      const cursors = new Set();
      let cursor;
      for (let page = 0; page < 100; page++) {
        const response = await client.request('thread/items/list', {
          threadId: source.threadId,
          turnId: source.turnId,
          sortDirection: 'asc',
          limit: 25,
          ...(cursor ? { cursor } : {}),
        });
        if (
          !Array.isArray(response?.data) ||
          !(response.nextCursor === null || typeof response.nextCursor === 'string')
        )
          throw failure('page');
        for (const row of response.data) {
          if (row?.turnId !== source.turnId || typeof row.item?.id !== 'string')
            throw failure('item-identity');
          if (row.item.id === source.messageId) matches.push(row.item);
        }
        if (matches.length > 1) throw failure('message-ambiguity');
        if (response.nextCursor === null) {
          if (matches.length !== 1) throw failure('message-ambiguity');
          const item = matches[0];
          if (item.type !== 'userMessage' || !Array.isArray(item.content))
            throw failure('not-human');
          const statements = item.content
            .filter((block) => block?.type === 'text')
            .map((block) => {
              if (typeof block.text !== 'string' || isInjection(block.text))
                throw failure('injection');
              return block.text.trim();
            });
          const statement = statements.join('\n\n');
          const statementHash = hashAuthorizationStatement(statement);
          if (!statement || statementHash !== source.statementHash)
            throw failure('statement-mismatch');
          return { role: 'user', statement, principal: null, statementHash };
        }
        cursor = response.nextCursor;
        if (!cursor || cursor.length > 4096 || cursors.has(cursor)) throw failure('cursor');
        cursors.add(cursor);
      }
      throw failure('page-limit');
    } finally {
      client.close();
    }
  };
}
