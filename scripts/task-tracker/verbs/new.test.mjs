import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractKind, createNewIssue, findUnknownFlags } from './new.mjs';

// #687 — `extractKind` pulls an optional `--kind <k>` pair out of the raw argv
// while preserving the remaining title tokens; `createNewIssue` threads that kind
// into the spawned `create-issue.mjs` argv only when set.

test('extractKind pulls the --kind value and leaves title tokens intact', () => {
  const { kind, rest } = extractKind(['fix', 'the', '--kind', 'spike', 'thing']);
  assert.equal(kind, 'spike');
  assert.deepEqual(rest, ['fix', 'the', 'thing']);
});

test('extractKind returns null kind and unchanged rest when --kind absent (AC3)', () => {
  const input = ['plain', 'title', 'here'];
  const { kind, rest } = extractKind(input);
  assert.equal(kind, null);
  assert.deepEqual(rest, input);
});

test('extractKind consumes only the first --kind occurrence', () => {
  const { kind, rest } = extractKind(['--kind', 'audit', '--kind', 'spike']);
  assert.equal(kind, 'audit');
  assert.deepEqual(rest, ['--kind', 'spike']);
});

test('extractKind drops a trailing --kind with no value', () => {
  const { kind, rest } = extractKind(['title', '--kind']);
  assert.equal(kind, null);
  assert.deepEqual(rest, ['title']);
});

test('extractKind tolerates a non-array', () => {
  const { kind, rest } = extractKind(undefined);
  assert.equal(kind, null);
  assert.deepEqual(rest, []);
});

// Minimal ctx factory: captures the argv passed to the injected fake pexec.
function makeCtx() {
  const calls = [];
  return {
    calls,
    ctx: {
      cfg: { assignee: '@me', defaultLabels: ['aitm'], hookNetworkTimeoutMs: 1000 },
      SKIP_NETWORK: false,
      pexec: async (bin, argv) => {
        calls.push({ bin, argv });
        return { stdout: 'https://github.com/o/r/issues/42\n' };
      },
    },
  };
}

test('createNewIssue appends --kind to the spawned argv when kind is set', async () => {
  const { calls, ctx } = makeCtx();
  const issue = await createNewIssue('My spike', ctx, 'spike');
  assert.equal(issue, '#42');
  const { argv } = calls[0];
  const ki = argv.indexOf('--kind');
  assert.notEqual(ki, -1, '--kind must be forwarded');
  assert.equal(argv[ki + 1], 'spike');
});

test('createNewIssue omits --kind from argv when kind is null (AC3)', async () => {
  const { calls, ctx } = makeCtx();
  await createNewIssue('Plain idea', ctx, null);
  assert.equal(calls[0].argv.includes('--kind'), false);
});

test('createNewIssue omits --kind from argv when kind is an empty string', async () => {
  const { calls, ctx } = makeCtx();
  await createNewIssue('Plain idea', ctx, '');
  assert.equal(calls[0].argv.includes('--kind'), false);
});

test('createNewIssue no-kind argv is byte-identical to the default-arg call (AC3)', async () => {
  const a = makeCtx();
  await createNewIssue('Same title', a.ctx);
  const b = makeCtx();
  await createNewIssue('Same title', b.ctx, null);
  assert.deepEqual(a.calls[0].argv, b.calls[0].argv);
});

// #748 Defect A — `/task new` mints lightweight idea-capture stubs that must
// carry NO content-unrelated labels. `createNewIssue` must never forward
// `cfg.defaultLabels` into the spawned argv, regardless of how the config is set.
test('createNewIssue never forwards cfg.defaultLabels into the argv (#748 Defect A)', async () => {
  const { calls, ctx } = makeCtx();
  ctx.cfg.defaultLabels = ['epic', 'bug', 'cleanup', 'refactor'];
  await createNewIssue('Some capture', ctx, null);
  assert.equal(calls[0].argv.includes('--label'), false, 'no --label may be forwarded');
});

// #748 Defect B — unknown flags in the title remainder must be rejected, not
// swallowed into the title. `findUnknownFlags` reports every unrecognized
// flag-shaped token so `verbNew` can error before creating an issue.
test('findUnknownFlags reports every unrecognized flag token (#748 Defect B)', () => {
  const unknown = findUnknownFlags(['Real', 'title', '--shape', 'solo', '--from-file', 'x.md']);
  assert.deepEqual(unknown, ['--shape', '--from-file']);
});

test('findUnknownFlags returns [] for a plain title (#748 Defect B)', () => {
  assert.deepEqual(findUnknownFlags(['Fix', 'the', 'thing']), []);
});

test('findUnknownFlags returns [] for kind-stripped title tokens (#748 Defect B)', () => {
  // extractKind has already removed `--kind <v>`; what remains is a clean title.
  const { rest } = extractKind(['Investigate', 'flag', 'handling', '--kind', 'spike']);
  assert.deepEqual(findUnknownFlags(rest), []);
});

test('findUnknownFlags flags a short -x option token (#748 Defect B)', () => {
  assert.deepEqual(findUnknownFlags(['title', '-x']), ['-x']);
});

test('findUnknownFlags tolerates a non-array', () => {
  assert.deepEqual(findUnknownFlags(undefined), []);
});
