// @story #1835
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as usage from '../../../../task-tracker/lib/graphql-usage/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');

test('scanner distinguishes explicit, HTTP, opaque, bypass, and REST paths', () => {
  const files = {
    'bin/runner.mjs':
      "execFileSync('gh', ['api', 'graphql']);\nfetch('https://api.github.com/graphql');\nexecFileSync('/usr/bin/gh', ['issue', 'view', '1']);\nexecFileSync('gh', ['issue', 'view', '1']);\nexecFileSync('gh', ['api', 'repos/a/b/issues']);",
    'scripts/setup.sh': "gh api graphql -f query='{}'\n$GH_BIN api graphql --input -",
  };
  const rows = usage.scanGraphqlSurfaces({ files });
  assert.deepEqual(
    new Set(rows.map((r) => r.classification)),
    new Set(['gh-api-graphql', 'direct-http', 'uncovered', 'opaque-gh-cli', 'rest-or-non-graphql'])
  );
  assert.ok(rows.every((r) => r.source && r.line > 0 && r.reason));
});

test('source-level scan matches committed expectations', () => {
  const rows = usage.scanGraphqlSurfaces({ root });
  assert.ok(
    rows.some(
      (r) =>
        r.source === 'scripts/gh/init-project-config.sh' && r.classification === 'gh-api-graphql'
    )
  );
  assert.ok(
    rows.some(
      (r) =>
        r.source === 'scripts/reports/generate-value-report.mjs' &&
        r.classification === 'direct-http'
    )
  );
  assert.ok(
    rows.some(
      (r) =>
        r.source === 'scripts/gh/verify-priority-p3.mjs' && r.classification === 'gh-api-graphql'
    )
  );
  assert.deepEqual(usage.compareInventory(rows, { root }), []);
});

test('multiline executable calls and shell continuations remain visible', () => {
  const rows = usage.scanGraphqlSurfaces({
    files: {
      'bin/wrapped.mjs': "execFileSync(\n  'gh',\n  ['api',\n   'graphql', '-f', 'query={}']\n);",
      'scripts/wrapped.sh': 'gh api \\\n  graphql --input -',
    },
  });
  assert.equal(rows.filter((row) => row.classification === 'gh-api-graphql').length, 2);
});

test('moving a source site cannot hide behind an unchanged per-file count', () => {
  const rows = usage.scanGraphqlSurfaces({ root });
  const moved = rows.map((row, index) => (index === 0 ? { ...row, line: row.line + 1 } : row));
  assert.notDeepEqual(usage.compareInventory(moved, { root }), []);
});
