// @story #1769
import assert from 'node:assert/strict';
import test from 'node:test';

import { measureAgentVisible } from '../../../../task-tracker/measure-guidance-context.mjs';

test('accounts for every raw event byte with disjoint categories and scoped rounding', () => {
  const report = measureAgentVisible({
    staticFiles: [
      { path: 'adapter.md', text: 'abcde' },
      { path: 'router.md', text: 'fghij' },
    ],
    events: [
      {
        name: 'blocked',
        raw: 'cmdknownreply\nwarning\n',
        parts: [
          { category: 'command-input', text: 'cmd' },
          { category: 'receipt-input', text: 'known' },
          { category: 'operational-stdout', text: 'reply\n' },
          { category: 'operational-stderr', text: 'warning\n' },
        ],
      },
    ],
  });

  assert.equal(report.uncountedAgentVisibleBytes, 0);
  assert.equal(report.staticFiles[0].proxyTokens, 2);
  assert.equal(report.staticFiles[1].proxyTokens, 2);
  assert.equal(report.trafficCharacters, 'cmdknownreply\nwarning\n'.length);
  assert.equal(report.proxyTokens, 4 + Math.ceil(report.trafficCharacters / 4));
  assert.equal(report.bytes, Buffer.byteLength('abcdefghijcmdknownreply\nwarning\n'));
});

test('refuses missing or double counted event traffic', () => {
  const base = {
    staticFiles: [{ path: 'adapter.md', text: 'a' }],
    events: [{ name: 'one', raw: 'abc', parts: [{ category: 'command-input', text: 'ab' }] }],
  };
  assert.throws(() => measureAgentVisible(base), /unreconciled.*one/);
  assert.throws(
    () =>
      measureAgentVisible({
        ...base,
        events: [
          {
            name: 'one',
            raw: 'abc',
            parts: [
              { category: 'command-input', text: 'abc' },
              { category: 'receipt-input', text: 'c' },
            ],
          },
        ],
      }),
    /unreconciled.*one/
  );
});
