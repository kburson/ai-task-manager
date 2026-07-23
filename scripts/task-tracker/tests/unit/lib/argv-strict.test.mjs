// @story #878
// #878 — the strict-argv helper in isolation.
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseStrict, StrictArgvError, reportStrictArgvError } from '../../../lib/argv-strict.mjs';

const USAGE = 'Usage: fake.mjs [--apply] [--scope N,N] [--help]\n';

test('declared boolean flags parse', () => {
  const r = parseStrict(['--apply'], { flags: ['--apply', '--dry-run'], usage: USAGE });
  assert.equal(r.values['--apply'], true);
  assert.equal(r.values['--dry-run'], undefined);
  assert.equal(r.help, false);
});

test('declared value options consume the following token', () => {
  const r = parseStrict(['--scope', '877,878'], { options: ['--scope'], usage: USAGE });
  assert.equal(r.values['--scope'], '877,878');
  assert.deepEqual(r.positionals, []);
});

test('--opt=value parses identically to --opt value', () => {
  const a = parseStrict(['--scope=877,878'], { options: ['--scope'] });
  const b = parseStrict(['--scope', '877,878'], { options: ['--scope'] });
  assert.deepEqual(a.values, b.values);
});

test('--flag=value on a boolean flag is refused', () => {
  assert.throws(() => parseStrict(['--apply=yes'], { flags: ['--apply'] }), StrictArgvError);
});

test('unknown --opt=value is refused', () => {
  assert.throws(() => parseStrict(['--bogus=1'], { options: ['--scope'] }), StrictArgvError);
});

test('unknown flag throws StrictArgvError naming the token', () => {
  assert.throws(
    () => parseStrict(['--apply', '--scope', '877'], { flags: ['--apply'], usage: USAGE }),
    (err) => {
      assert.ok(err instanceof StrictArgvError);
      assert.match(err.message, /unrecognized argument: --scope/);
      assert.equal(err.token, '--scope');
      assert.equal(err.usage, USAGE);
      return true;
    }
  );
});

test('value option missing its value throws', () => {
  assert.throws(
    () => parseStrict(['--scope'], { options: ['--scope'], usage: USAGE }),
    (err) => {
      assert.ok(err instanceof StrictArgvError);
      assert.match(err.message, /--scope requires a value/);
      return true;
    }
  );
});

test('a following flag does not count as an option value', () => {
  assert.throws(
    () => parseStrict(['--scope', '--apply'], { flags: ['--apply'], options: ['--scope'] }),
    StrictArgvError
  );
});

test('positional budget is enforced at both ends', () => {
  const ok = parseStrict(['877'], { positionals: { min: 1, max: 1 } });
  assert.deepEqual(ok.positionals, ['877']);

  assert.throws(() => parseStrict([], { positionals: { min: 1, max: 1 } }), StrictArgvError);
  assert.throws(
    () => parseStrict(['877', '878'], { positionals: { min: 1, max: 1 } }),
    StrictArgvError
  );
});

test('positionals are rejected by default (max 0)', () => {
  assert.throws(() => parseStrict(['877'], { flags: ['--apply'] }), StrictArgvError);
});

test('--help short-circuits even when an unknown flag is also present', () => {
  for (const argv of [
    ['--help', '--bogus'],
    ['--bogus', '--help'],
    ['-h', '--bogus'],
  ]) {
    const r = parseStrict(argv, { flags: ['--apply'], usage: USAGE });
    assert.equal(r.help, true, `argv order ${argv.join(' ')}`);
  }
});

test('allowHelp:false makes --help an unrecognized token', () => {
  assert.throws(
    () => parseStrict(['--help'], { flags: ['--apply'], allowHelp: false }),
    StrictArgvError
  );
});

test('reportStrictArgvError prints message + usage, and passes non-strict errors through', () => {
  const lines = [];
  const handled = reportStrictArgvError(new StrictArgvError('boom', { usage: USAGE }), {
    err: (s) => lines.push(s),
  });
  assert.equal(handled, true);
  assert.deepEqual(lines, ['boom\n', USAGE]);

  assert.equal(reportStrictArgvError(new Error('unrelated'), { err: () => {} }), false);
});
