// @story #1382
// Non-stub issue creation must author a complete Connextra User Story and use
// the same required fragment contract at the create-issue and preflight seams.

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildShapeFlags } from '../../../../gh/create-issue.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const pexec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PREFLIGHT = path.resolve(HERE, '../../../../task-tracker/preflight-issue.mjs');

function fixture() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-current-authoring-'));
  const files = {
    dir,
    story: path.join(dir, 'story.md'),
    scope: path.join(dir, 'scope.md'),
    ac: path.join(dir, 'ac.md'),
    origin: path.join(dir, 'origin.md'),
  };
  writeFileSync(
    files.story,
    'As a task author\nI want to create a complete issue body\nSo that Refine accepts it without repair\n',
    'utf8'
  );
  writeFileSync(files.scope, 'Render a current-schema issue body.\n', 'utf8');
  writeFileSync(files.ac, '- [ ] The body is complete. <!-- aitm-non-demonstrable -->\n', 'utf8');
  writeFileSync(files.origin, '- kind: code\n- discovered-during: #1380\n', 'utf8');
  return files;
}

function shapeArgs(shape, files, { includeStory = true } = {}) {
  const args = [
    '--shape',
    shape,
    '--scope-file',
    files.scope,
    '--ac-file',
    files.ac,
    '--story-origin-file',
    files.origin,
  ];
  if (includeStory) args.push('--user-story-file', files.story);
  if (shape === 'sub-issue') args.push('--parent', '1380');
  if (shape === 'defect') args.push('--title', 'Correct issue authoring');
  return args;
}

async function preflight(args) {
  try {
    const { stdout, stderr } = await pexec('node', [PREFLIGHT, ...args], {
      maxBuffer: 10 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || ''),
    };
  }
}

describe('current-schema User Story authoring', () => {
  for (const shape of ['epic', 'sub-issue', 'solo', 'defect']) {
    test(`${shape} requires --user-story-file`, async () => {
      const files = fixture();
      try {
        const result = await preflight(shapeArgs(shape, files, { includeStory: false }));
        assert.equal(result.code, 2);
        assert.match(result.stderr, /--user-story-file required with --shape/);
      } finally {
        rmSync(files.dir, { recursive: true, force: true });
      }
    });

    test(`${shape} renders the supplied Connextra story without placeholders`, async () => {
      const files = fixture();
      try {
        const result = await preflight(shapeArgs(shape, files));
        assert.equal(result.code, 0, result.stderr);
        assert.match(
          result.stdout,
          /## User Story\n\nAs a task author\nI want to create a complete issue body\nSo that Refine accepts it without repair/
        );
        assert.doesNotMatch(result.stdout, /\[who wants to accomplish something\]/);
      } finally {
        rmSync(files.dir, { recursive: true, force: true });
      }
    });
  }

  test('stub preserves its intentionally sparse body without a User Story section', async () => {
    const result = await preflight(['--shape', 'stub']);
    assert.equal(result.code, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /^## User Story$/m);
  });

  test('malformed and placeholder story fragments fail before rendering', async () => {
    const files = fixture();
    const invalidStories = [
      'As a task author\nI want to create an issue\n',
      'As a task author\nI want to create an issue\nSo that it is complete\nUnexpected fourth line\n',
      '## User Story\n\nAs a task author\nI want to create an issue\nSo that it is complete\n',
      'As a [who wants to accomplish something]\nI want to [what they want to accomplish]\nSo that [why they want to accomplish that thing]\n',
    ];
    try {
      for (const value of invalidStories) {
        writeFileSync(files.story, value, 'utf8');
        const result = await preflight(shapeArgs('solo', files));
        assert.equal(result.code, 2, `story=${JSON.stringify(value)}\n${result.stderr}`);
        assert.match(result.stderr, /--user-story-file/);
      }
    } finally {
      rmSync(files.dir, { recursive: true, force: true });
    }
  });
});

test('create-issue forwards --user-story-file before the remaining non-stub fragments', () => {
  const flags = buildShapeFlags({
    shape: 'solo',
    title: 'Complete issue',
    'user-story-file': 'story.md',
    'scope-file': 'scope.md',
    'ac-file': 'acs.md',
    'story-origin-file': 'origin.md',
  });
  assert.deepEqual(flags.slice(0, 10), [
    '--shape',
    'solo',
    '--user-story-file',
    'story.md',
    '--scope-file',
    'scope.md',
    '--ac-file',
    'acs.md',
    '--story-origin-file',
    'origin.md',
  ]);
});
