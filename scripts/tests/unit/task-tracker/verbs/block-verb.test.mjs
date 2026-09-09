// @story #1557
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parseArgs as parseBlockArgs,
  parseByList,
  runBlock,
} from '../../../../task-tracker/verbs/block.mjs';
import {
  parseArgs as parseUnblockArgs,
  runUnblock,
} from '../../../../task-tracker/verbs/unblock.mjs';

const CFG = {
  repo: 'kburson/ai-task-manager',
  projectId: 'P',
  fieldDisposition: 'F_DISPOSITION',
};

function nativeHarness(initial = []) {
  let blockedBy = [...initial].sort((left, right) => left - right);
  const convergeCalls = [];
  const comments = [];
  const validated = [];
  let projections = 0;
  const deps = {
    validateIssue: async ({ issueNumber }) => {
      validated.push(issueNumber);
      return { exists: true, state: issueNumber === 4 ? 'CLOSED' : 'OPEN' };
    },
    readNativeDependencies: async () => ({ blockedBy: [...blockedBy], blocking: [] }),
    convergeBlockedBySet: async (input) => {
      convergeCalls.push(input);
      const existing = [...blockedBy];
      const requested = new Set(input.refs || []);
      const desired =
        input.operation === 'union'
          ? [...new Set([...existing, ...requested])].sort((left, right) => left - right)
          : input.operation === 'subtract'
            ? existing.filter((ref) => !requested.has(ref))
            : input.operation === 'clear'
              ? []
              : [...new Set(input.desired)].sort((left, right) => left - right);
      const added = desired.filter((ref) => !existing.includes(ref));
      const removed = existing.filter((ref) => !desired.includes(ref));
      blockedBy = desired;
      return {
        status: added.length || removed.length ? 'updated' : 'idempotent',
        existing,
        desired,
        added,
        removed,
      };
    },
    reconcileDependencyDisposition: async () => {
      projections += 1;
      return { status: blockedBy.length ? 'projected' : 'cleared' };
    },
    postComment: async ({ body }) => comments.push(body),
  };
  return {
    deps,
    convergeCalls,
    comments,
    validated,
    get blockedBy() {
      return [...blockedBy];
    },
    get projections() {
      return projections;
    },
  };
}

test('parseByList and block arguments normalize valid issue refs and reject partial-invalid input', () => {
  assert.deepEqual(parseByList('7, 5, #5'), [5, 7]);
  assert.deepEqual(parseByList(null), []);
  for (const raw of ['7,nope', '7,0', '7,', '#-1', '9007199254740992']) {
    assert.throws(() => parseByList(raw), /invalid issue number/);
  }
  assert.deepEqual(parseBlockArgs(['#100', '--by', '5,7'], null), {
    target: 100,
    refs: [5, 7],
    byProvided: true,
  });
  assert.deepEqual(parseBlockArgs(['--by', '5'], '#200'), {
    target: 200,
    refs: [5],
    byProvided: true,
  });
});

test('unblock arguments distinguish subtract-some from clear-all', () => {
  assert.deepEqual(parseUnblockArgs(['#100', '--by', '5'], null), {
    target: 100,
    refs: [5],
    byProvided: true,
  });
  assert.deepEqual(parseUnblockArgs(['#100'], null), {
    target: 100,
    refs: null,
    byProvided: false,
  });
});

test('block unions requested refs into the native set without duplicates', async () => {
  const harness = nativeHarness([4, 9]);
  const result = await runBlock({ target: 20, refs: [9, 12, 12], cfg: CFG, deps: harness.deps });
  assert.equal(harness.convergeCalls[0].operation, 'union');
  assert.deepEqual(harness.convergeCalls[0].refs, [9, 12]);
  assert.deepEqual(result.added, [12]);
  assert.deepEqual(result.remaining, [4, 9, 12]);
  assert.equal(harness.comments.length, 1);
  assert.match(harness.comments[0], /#12/);
  assert.deepEqual(harness.validated, [9, 12]);
  assert.equal(harness.projections, 1);
});

test('block accepts existing closed issues because AITM Status decides readiness', async () => {
  const harness = nativeHarness([]);
  const result = await runBlock({ target: 20, refs: [4], cfg: CFG, deps: harness.deps });
  assert.deepEqual(result.added, [4]);
  assert.deepEqual(harness.validated, [4]);
});

test('block is idempotent when every requested ref already exists but still projects', async () => {
  const harness = nativeHarness([4, 9]);
  const result = await runBlock({ target: 20, refs: [9, 4], cfg: CFG, deps: harness.deps });
  assert.equal(result.status, 'idempotent');
  assert.deepEqual(result.added, []);
  assert.deepEqual(harness.comments, []);
  assert.equal(harness.projections, 1);
});

test('block refuses self, invalid, and missing refs before graph mutation', async () => {
  const self = nativeHarness([]);
  await assert.rejects(
    runBlock({ target: 20, refs: [20], cfg: CFG, deps: self.deps }),
    /cannot block #20 on itself/
  );
  assert.equal(self.convergeCalls.length, 0);

  await assert.rejects(runBlock({ target: 0, refs: [4], cfg: CFG }), /no target issue/);
  await assert.rejects(runBlock({ target: 20, refs: [], cfg: CFG }), /--by is required/);

  const missing = nativeHarness([]);
  missing.deps.validateIssue = async () => ({ exists: false, state: null });
  await assert.rejects(
    runBlock({ target: 20, refs: [99], cfg: CFG, deps: missing.deps }),
    /blocker #99 does not exist/
  );
  assert.equal(missing.convergeCalls.length, 0);
});

test('block retry converges after projection failed without duplicating graph edges or comments', async () => {
  const harness = nativeHarness([4]);
  let attempts = 0;
  harness.deps.reconcileDependencyDisposition = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('projection unavailable');
    return { status: 'projected' };
  };
  await assert.rejects(
    runBlock({ target: 20, refs: [9], cfg: CFG, deps: harness.deps }),
    /projection unavailable/
  );
  assert.deepEqual(harness.blockedBy, [4, 9]);
  assert.deepEqual(harness.comments, []);

  const result = await runBlock({ target: 20, refs: [9], cfg: CFG, deps: harness.deps });
  assert.equal(result.status, 'idempotent');
  assert.deepEqual(result.added, []);
  assert.deepEqual(harness.comments, []);
});

test('unblock subtracts only present requested refs and ignores absent refs', async () => {
  const harness = nativeHarness([4, 9, 12]);
  const result = await runUnblock({ target: 20, refs: [9, 99], cfg: CFG, deps: harness.deps });
  assert.equal(harness.convergeCalls[0].operation, 'subtract');
  assert.deepEqual(harness.convergeCalls[0].refs, [9, 99]);
  assert.deepEqual(result.removed, [9]);
  assert.deepEqual(result.remaining, [4, 12]);
  assert.equal(result.cleared, false);
  assert.equal(harness.comments.length, 1);
  assert.match(harness.comments[0], /#9/);
  assert.equal(harness.projections, 1);
});

test('unblock without --by clears the native set', async () => {
  const harness = nativeHarness([4, 9]);
  const result = await runUnblock({ target: 20, refs: null, cfg: CFG, deps: harness.deps });
  assert.equal(harness.convergeCalls[0].operation, 'clear');
  assert.deepEqual(result.removed, [4, 9]);
  assert.deepEqual(result.remaining, []);
  assert.equal(result.cleared, true);
  assert.equal(harness.comments.length, 2);
  assert.equal(harness.projections, 1);
});

test('unblock repeat is idempotent and still projects', async () => {
  for (const refs of [[99], null]) {
    const harness = nativeHarness([4]);
    if (refs === null) {
      await runUnblock({ target: 20, refs, cfg: CFG, deps: harness.deps });
      harness.deps.postComment = async () => assert.fail('retry must not comment');
    }
    const result = await runUnblock({ target: 20, refs, cfg: CFG, deps: harness.deps });
    assert.equal(result.status, 'idempotent');
    assert.deepEqual(result.removed, []);
    assert.equal(harness.projections, refs === null ? 2 : 1);
  }
});
