// @story #1138
// @parallel-subprocess (gh-timing-comment.mjs reaches its transitive real gh CLI spawn)
// Regression: lifecycle verbs pass numeric issue identifiers to the Timing Log
// writer. The GitHub boundary must normalize every supported reference shape.

import { strict as assert } from 'node:assert';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';

import {
  buildRow,
  findTimingComment,
  postTimingEvent,
} from '../../../../task-tracker/gh-timing-comment.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

function installGhShim() {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-1138-gh-'));
  const logPath = join(dir, 'args.log');
  const ghPath = join(dir, 'gh');
  writeFileSync(
    ghPath,
    `#!/bin/sh
printf '%s|%s|%s\n' "$1" "$2" "$3" >> "$AITM_1138_GH_LOG"
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  printf '{"comments":[]}\n'
else
  printf 'https://example.test/comment\n'
fi
`
  );
  chmodSync(ghPath, 0o755);
  return { dir, logPath };
}

test('Timing Log GitHub helpers accept numeric, string, and hash-prefixed issue identifiers', async () => {
  const { dir, logPath } = installGhShim();
  const priorPath = process.env.PATH;
  const priorLog = process.env.AITM_1138_GH_LOG;
  process.env.PATH = `${dir}${delimiter}${priorPath ?? ''}`;
  process.env.AITM_GH_TEST_DOUBLE_BIN = dir;
  process.env.AITM_1138_GH_LOG = logPath;
  try {
    const row = buildRow({
      ts: new Date().toISOString(),
      event: 'start',
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      wordMarker: 0,
      description: '#1138 numeric issue regression',
    });
    for (const issueNumber of [1138, '1138', '#1138']) {
      assert.equal(await findTimingComment(issueNumber, 'o/r'), null);
      await postTimingEvent({ issueNumber, repo: 'o/r', row, lock: false });
    }
    const calls = readFileSync(logPath, 'utf8').trim().split('\n');
    assert.deepEqual(calls, [
      'issue|view|1138',
      'issue|view|1138',
      'issue|comment|1138',
      'issue|view|1138',
      'issue|view|1138',
      'issue|comment|1138',
      'issue|view|1138',
      'issue|view|1138',
      'issue|comment|1138',
    ]);
  } finally {
    if (priorPath === undefined) delete process.env.PATH;
    else process.env.PATH = priorPath;
    delete process.env.AITM_GH_TEST_DOUBLE_BIN;
    if (priorLog === undefined) delete process.env.AITM_1138_GH_LOG;
    else process.env.AITM_1138_GH_LOG = priorLog;
    rmSync(dir, { recursive: true, force: true });
  }
});
