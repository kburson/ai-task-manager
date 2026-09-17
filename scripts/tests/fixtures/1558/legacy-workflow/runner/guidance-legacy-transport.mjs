// @story #1654
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function readJsonLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function appendJsonLine(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(value)}\n`);
}

function requestKey(attempt) {
  return JSON.stringify({
    lane: attempt.lane,
    file: attempt.file ?? null,
    args: attempt.args ?? [],
    command: attempt.command ?? null,
    url: attempt.url ?? null,
  });
}

export function legacyTransportError(message, response = {}) {
  const error = new Error(message);
  error.code = response.code ?? response.status ?? 1;
  error.status = response.status ?? response.code ?? 1;
  error.stdout = response.stdout ?? '';
  error.stderr = response.stderr ?? message;
  return error;
}

export function openLegacyTransport(configPath) {
  const config = readJson(configPath);
  const requests = config.requests ?? [];

  return {
    dispatch(attempt) {
      const priorRows = readJsonLines(config.ledgerPath);
      const expected = requests.find((request) => {
        if (requestKey(request) !== requestKey(attempt)) return false;
        const used = priorRows.filter((row) => row.requestId === request.id).length;
        return used < (request.times ?? 1);
      });

      if (!expected) {
        const escape = {
          sequence: readJsonLines(config.escapePath).length + 1,
          outcome: 'denied',
          ...attempt,
        };
        appendJsonLine(config.escapePath, escape);
        throw legacyTransportError(`undeclared physical transport: ${requestKey(attempt)}`, {
          code: 86,
        });
      }

      const response = expected.response ?? {};
      appendJsonLine(config.ledgerPath, {
        sequence: priorRows.length + 1,
        requestId: expected.id,
        ...attempt,
        outcome: response.error ? 'error' : response.delegate ? 'delegated-local' : 'fixture',
      });
      return { expected, response };
    },
  };
}

export function reconcileTransportLedger(requests, ledger) {
  if (ledger.length === 0) throw new Error('physical transport ledger is empty');
  const expectedIds = requests.flatMap((request) =>
    Array.from({ length: request.times ?? 1 }, () => request.id)
  );
  const actualIds = ledger.map((row) => row.requestId);
  if (
    new Set(actualIds).size !== actualIds.length &&
    new Set(expectedIds).size === expectedIds.length
  ) {
    throw new Error(
      `physical transport ledger contains duplicate request rows: ${actualIds.join(', ')}`
    );
  }
  const missing = expectedIds.filter((id, index) => actualIds[index] !== id);
  if (missing.length > 0 || actualIds.length !== expectedIds.length) {
    throw new Error(
      `physical transport ledger does not reconcile; expected ${expectedIds.join(', ')}, observed ${actualIds.join(', ')}`
    );
  }
  return { requestCount: expectedIds.length, physicalCount: actualIds.length };
}
