// @story #2146
// cspell:words hookspath fsmonitor
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { rmSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { test } from 'node:test';
import * as reconstruction from '../../../../research/2146-native-recovery/reconstruct.mjs';

const root = process.cwd();
const oid = 'a'.repeat(40);
const index = `100644 ${oid} 0\talpha.txt\0`;
const entries = [
  ['filter.lfs.clean', 'git-lfs clean -- %f'],
  ['filter.lfs.smudge', 'git-lfs smudge -- %f'],
  ['filter.lfs.process', 'git-lfs filter-process'],
  ['filter.lfs.required', 'true'],
];
const rows = entries.map(([key, value]) => ({ scope: 'system', key, value }));
const configCommand = 'config --null --list --show-scope --includes';
const indexCommand = 'ls-files --stage -z --full-name';
const workCommand = 'check-attr --all -z --stdin';
const cachedCommand = 'check-attr --cached --all -z --stdin';

// This controlled read boundary catches omitted or misplaced guards and malformed
// input admission. A separate file exercises actual Git and helper sensitivity.
function fixture(overrides = {}) {
  const values = {
    rows,
    index,
    others: '',
    tree: `100644 blob ${oid}\talpha.txt\0`,
    paths: 'alpha.txt\0',
    work: '',
    cached: '',
    source: '',
    root,
    ...overrides,
  };
  const calls = [];
  const read = (args, input) => {
    const key = args.join(' ');
    calls.push(key);
    if (key === configCommand)
      return values.rows.map((row) => `${row.scope}\0${row.key}\n${row.value}\0`).join('');
    if (key === 'rev-parse --show-toplevel') return values.root + '\n';
    if (key === indexCommand) return values.index;
    if (key === 'ls-files --others --exclude-standard -z --full-name') return values.others;
    if (key === `ls-tree -r -z --full-tree ${oid}`) return values.tree;
    const attributes = {
      [workCommand]: values.work,
      [cachedCommand]: values.cached,
      [`check-attr --source=${oid} --all -z --stdin`]: values.source,
    };
    if (Object.hasOwn(attributes, key)) {
      assert.ok(Buffer.isBuffer(input), 'attribute paths must use NUL-delimited bytes');
      assert.equal(input.toString(), values.paths);
      return attributes[key];
    }
    throw new Error('Unexpected read: ' + key);
  };
  return { read, calls };
}
function guard(subject, options) {
  assert.equal(typeof reconstruction.assertSafeGit, 'function', 'missing operation-bound guard');
  return reconstruction.assertSafeGit(subject.read, root, options);
}
function refuses(subject, message, options, last) {
  assert.equal(typeof reconstruction.assertSafeGit, 'function', 'missing operation-bound guard');
  assert.throws(() => guard(subject, options), { message });
  if (last) assert.equal(subject.calls.at(-1), last);
}

test('no filter configuration preserves baseline admission without attribute reads', () => {
  const subject = fixture({ rows: [{ scope: 'global', key: 'core.fsmonitor', value: 'false' }] });
  guard(subject);
  assert.deepEqual(subject.calls, [configCommand]);
});
test('canonical system LFS requires the complete index and both effective attribute views', () => {
  const subject = fixture({ work: 'alpha.txt\0text\0auto\0' });
  guard(subject, { carrier: true });
  assert.deepEqual(subject.calls, [
    configCommand,
    'rev-parse --show-toplevel',
    indexCommand,
    workCommand,
    cachedCommand,
  ]);
});
test('stage proof includes an observed new untracked path through NUL stdin', () => {
  const subject = fixture({ others: 'new\tline\nfile\0', paths: 'alpha.txt\0new\tline\nfile\0' });
  guard(subject, { operation: 'stage' });
  assert.ok(subject.calls.includes('ls-files --others --exclude-standard -z --full-name'));
  assert.equal(subject.calls.at(-1), cachedCommand);
});
test('checkout proof uses actual tree paths and the explicit matching source', () => {
  const subject = fixture();
  guard(subject, { operation: 'checkout', tree: oid });
  assert.deepEqual(subject.calls, [
    configCommand,
    'rev-parse --show-toplevel',
    `ls-tree -r -z --full-tree ${oid}`,
    `check-attr --source=${oid} --all -z --stdin`,
  ]);
});
test('an actually empty path inventory still has framed empty attribute input', () => {
  const subject = fixture({ index: '', paths: '' });
  guard(subject);
  assert.equal(subject.calls.at(-1), cachedCommand);
});
for (const mode of ['work', 'cached', 'source']) {
  test(`any reported filter in ${mode} refuses before a content operation`, () => {
    for (const value of ['lfs', 'set', 'unset', 'unspecified', '']) {
      const subject = fixture({ [mode]: `alpha.txt\0filter\0${value}\0` });
      const options = mode === 'source' ? { operation: 'checkout', tree: oid } : undefined;
      refuses(subject, 'reconstruct:git-attributes:active-filter', options);
    }
  });
}
test('unknown filters and noncanonical emitted values/scopes retain default denial', () => {
  const changes = [
    { key: 'filter.other.clean' },
    { key: 'filter.LFS.clean' },
    { value: 'git-lfs clean --skip -- %f' },
    { value: 'git-lfs clean -- %f ' },
    ...['global', 'local', 'worktree', 'command', 'unknown'].map((scope) => ({ scope })),
  ];
  for (const change of changes) {
    const subject = fixture({ rows: [{ ...rows[0], ...change }, ...rows.slice(1)] });
    assert.equal(typeof reconstruction.assertSafeGit, 'function', 'missing operation-bound guard');
    assert.throws(() => guard(subject), /reconstruct:git-configuration:unsafe-setting:/);
    assert.deepEqual(subject.calls, [configCommand]);
  }
  for (const value of ['TRUE', '1', ' true']) {
    const subject = fixture({ rows: [...rows.slice(0, 3), { ...rows[3], value }] });
    assert.throws(() => guard(subject), /reconstruct:git-configuration:unsafe-setting:/);
  }
});
test('incomplete and duplicate canonical groups cannot authorize attribute inspection', () => {
  for (const incomplete of [rows.slice(1), [...rows, rows[0]]])
    refuses(
      fixture({ rows: incomplete }),
      'reconstruct:git-configuration:lfs-shape',
      {},
      configCommand
    );
});
test('attr.tree refuses in every scope before root or checkout metadata reads', () => {
  for (const scope of ['system', 'global', 'local', 'worktree', 'command']) {
    for (const key of ['attr.tree', 'ATTR.TREE']) {
      const subject = fixture({ rows: [...rows, { scope, key, value: '' }] });
      refuses(
        subject,
        'reconstruct:git-attributes:source-override',
        { operation: 'checkout', tree: oid },
        configCommand
      );
    }
  }
});
test('active hooks still refuse before attributes on a mutating fixture', () => {
  const subject = fixture({
    rows: [...rows, { scope: 'local', key: 'core.hooksPath', value: 'PRIVATE_HOOK' }],
  });
  refuses(
    subject,
    'reconstruct:git-configuration:unsafe-setting:local:core:core.hookspath',
    { operation: 'stage' },
    configCommand
  );
});
test('production Git control environment remains refused', () => {
  for (const name of ['GIT_CONFIG_SYSTEM', 'GIT_EXEC_PATH', 'GIT_ATTR_SOURCE'])
    assert.throws(() => reconstruction.assertGitEnvironment({ [name]: 'owned-test-only' }), {
      message: 'reconstruct:git-environment:' + name,
    });
});
test('wrong repository root cannot prove inactivity for another checkout', () => {
  refuses(
    fixture({ root: root + '/nested' }),
    'reconstruct:git-attributes:root',
    {},
    'rev-parse --show-toplevel'
  );
});
test('unknown operation and mismatched checkout options refuse without Git', () => {
  for (const options of [
    { operation: 'other' },
    { operation: 'stage', carrier: true },
    { tree: oid },
    { operation: 'checkout' },
    { operation: 'checkout', tree: 'HEAD' },
  ]) {
    const subject = fixture();
    refuses(subject, 'reconstruct:git-attributes:operation', options);
    assert.deepEqual(subject.calls, []);
  }
});
test('malformed index and unsupported stages or modes cannot authorize content reads', () => {
  for (const raw of [
    index.slice(0, -1),
    index + index,
    `100644 ${oid} 1\talpha.txt\0`,
    `160000 ${oid} 0\tmodule\0`,
    `040000 ${oid} 0\tdirectory\0`,
    `100644 INVALID 0\talpha.txt\0`,
    ...['', '/absolute', '../parent', 'a/../b', 'a//b', './a', 'a/', '\ufffd'].map(
      (name) => `100644 ${oid} 0\t${name}\0`
    ),
  ])
    refuses(fixture({ index: raw }), 'reconstruct:git-attributes:path-format', {}, indexCommand);
});
test('malformed or nested untracked inventories refuse before attribute lookup', () => {
  for (const others of ['new', 'new\0new\0', 'nested/\0', '../foreign\0'])
    refuses(
      fixture({ others }),
      'reconstruct:git-attributes:path-format',
      { operation: 'stage' },
      'ls-files --others --exclude-standard -z --full-name'
    );
});
test('checkout enumeration refuses gitlinks and malformed tree records', () => {
  for (const tree of [
    `160000 commit ${oid}\tmodule\0`,
    `100644 tree ${oid}\talpha.txt\0`,
    `100644 blob ${oid}\talpha.txt`,
    `100644 blob ${oid}\t../foreign\0`,
  ])
    refuses(fixture({ tree }), 'reconstruct:git-attributes:path-format', {
      operation: 'checkout',
      tree: oid,
    });
});
test('attribute output must be complete unique triples for submitted paths', () => {
  for (const work of [
    'alpha.txt\0text\0auto',
    'alpha.txt\0text\0',
    'foreign\0text\0auto\0',
    'alpha.txt\0\0auto\0',
    'alpha.txt\0-invalid\0auto\0',
    'alpha.txt\0text\0auto\0alpha.txt\0text\0set\0',
  ])
    refuses(fixture({ work }), 'reconstruct:git-attributes:output-format', {}, workCommand);
});

// Controlled configuration/attribute transport for production call ordering.
// Other commands execute real Git; actual system-LFS fixtures live separately.
for (const boundary of ['carrier', 'checkout', 'initial-status', 'callback']) {
  test(`reconstruction refuses active attributes at ${boundary} before its next operation`, async (t) => {
    const allocation = await reconstruction.allocateValidationRoot(root);
    const execute = childProcess.execFileSync;
    const calls = [];
    let callback = false;
    const intercepted = t.mock.method(childProcess, 'execFileSync', (command, args, options) => {
      assert.equal(command, 'git');
      assert.equal(Object.hasOwn(options, 'env'), false);
      calls.push({ args, cwd: options.cwd });
      const actual = execute(command, args, options);
      if (
        args.includes('config') &&
        !reconstruction
          .configRows(String(actual))
          .some((row) => row.key.toLowerCase().startsWith('filter.'))
      )
        return (
          String(actual) + rows.map((row) => `${row.scope}\0${row.key}\n${row.value}\0`).join('')
        );
      if (args.includes('check-attr')) {
        assert.ok(Buffer.isBuffer(options.input));
        const atSource = options.cwd === allocation.sourceRoot;
        const checkout = args.some((arg) => arg.startsWith('--source='));
        const activate =
          boundary === 'carrier'
            ? !atSource
            : boundary === 'checkout'
              ? atSource && checkout
              : boundary === 'initial-status'
                ? atSource && !checkout
                : callback;
        if (activate) return options.input.toString().split('\0')[0] + '\0filter\0lfs\0';
      }
      return actual;
    });
    syncBuiltinESMExports();
    let passed = false;
    try {
      const run = () => {
        const source = reconstruction.reconstructHistoricalSource(root, allocation);
        if (boundary === 'callback') {
          callback = true;
          source.sourceGit(['status', '--porcelain', '--untracked-files=all']);
        }
      };
      assert.throws(run, { message: 'reconstruct:git-attributes:active-filter' });
      if (boundary === 'carrier')
        assert.equal(
          calls.some((call) => call.args.includes('clone')),
          false
        );
      if (boundary === 'checkout')
        assert.equal(
          calls.some((call) => call.args.includes('read-tree') || call.args.includes('update-ref')),
          false
        );
      const statuses = calls.filter(
        (call) => call.cwd === allocation.sourceRoot && call.args.includes('status')
      );
      assert.equal(statuses.length, boundary === 'callback' ? 1 : 0);
      passed = true;
    } finally {
      intercepted.mock.restore();
      syncBuiltinESMExports();
      if (passed) rmSync(allocation.ownedRoot, { recursive: true });
      else t.diagnostic('Preserved failed controlled-boundary fixture: ' + allocation.ownedRoot);
    }
  });
}
