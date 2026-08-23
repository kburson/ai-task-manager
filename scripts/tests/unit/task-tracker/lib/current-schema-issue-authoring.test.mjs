// @story #1382
// Non-stub issue creation must author a complete Connextra User Story and use
// the same required fragment contract at the create-issue and preflight seams.

import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const CREATE_ISSUE = path.resolve(HERE, '../../../../gh/create-issue.mjs');
const REPO_ROOT = path.resolve(HERE, '../../../../..');

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
      'developer\nfeature\nbenefit\n',
      'As a task author\nI want feature\nSo that it is complete\n',
      'As a\nI want to create an issue\nSo that it is complete\n',
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

describe('current-schema Acceptance Criterion verifier authoring', () => {
  test('creation rejects legacy, empty, missing, and dangling verifier declarations', async () => {
    const files = fixture();
    const vc = path.join(files.dir, 'verification-commands.md');
    writeFileSync(vc, 'node --test x.test.mjs\n', 'utf8');
    const cases = [
      ['<!-- aitm-verified cmd="`node --test x.test.mjs`" -->', 'backtick-embedded-cmd'],
      ['<!-- aitm-verified cmd="vc:1" -->', 'ordinal-cmd-citation'],
      ['<!-- aitm-verified vc-list="" -->', 'empty-vc-list'],
      ['<!-- aitm-verified vc-list="vc:99" -->', 'dangling-vc-list'],
      ['<!-- aitm-verified -->', 'missing-vc-list'],
    ];
    try {
      for (const [marker, reason] of cases) {
        writeFileSync(files.ac, `- [ ] The body is complete. ${marker}\n`, 'utf8');
        const result = await preflight([
          ...shapeArgs('solo', files),
          '--verification-commands-file',
          vc,
        ]);
        assert.equal(result.code, 2, `${reason}\n${result.stderr}`);
        assert.match(result.stderr, /preflight-issue: ac-verifier-contract/);
        assert.match(result.stderr, new RegExp(reason));
      }
    } finally {
      rmSync(files.dir, { recursive: true, force: true });
    }
  });

  test('creation accepts resolvable vc-list citations and non-demonstrable ACs', async () => {
    const files = fixture();
    const vc = path.join(files.dir, 'verification-commands.md');
    writeFileSync(vc, 'node --test x.test.mjs\n', 'utf8');
    try {
      for (const marker of [
        '<!-- aitm-verified vc-list="vc:1" -->',
        '<!-- aitm-non-demonstrable -->',
      ]) {
        writeFileSync(files.ac, `- [ ] The body is complete. ${marker}\n`, 'utf8');
        const result = await preflight([
          ...shapeArgs('solo', files),
          '--verification-commands-file',
          vc,
        ]);
        assert.equal(result.code, 0, result.stderr);
      }
    } finally {
      rmSync(files.dir, { recursive: true, force: true });
    }
  });
});

describe('current-schema public authoring contract', () => {
  test('create-issue --body-file --dry-run rejects missing stories and legacy AC verifiers', async () => {
    const files = fixture();
    const bodyFile = path.join(files.dir, 'body.md');
    try {
      const rendered = await preflight(shapeArgs('solo', files));
      assert.equal(rendered.code, 0, rendered.stderr);
      const invalidBodies = [
        rendered.stdout.replace(/## User Story[\s\S]*?(?=## Scope)/, ''),
        rendered.stdout.replace(
          '<!-- aitm-non-demonstrable -->',
          '<!-- aitm-verified cmd="`node --test x.test.mjs`" -->'
        ),
      ];
      for (const body of invalidBodies) {
        writeFileSync(bodyFile, body, 'utf8');
        await assert.rejects(
          pexec(process.execPath, [
            CREATE_ISSUE,
            '--title',
            'Invalid legacy body',
            '--body-file',
            bodyFile,
            '--dry-run',
          ]),
          (error) => error.code === 4 && /canonical issue-body verifier/.test(error.stderr)
        );
      }
    } finally {
      rmSync(files.dir, { recursive: true, force: true });
    }
  });

  test('create-issue and preflight help advertise --user-story-file', async () => {
    for (const script of [CREATE_ISSUE, PREFLIGHT]) {
      const { stdout } = await pexec(process.execPath, [script, '--help']);
      assert.match(stdout, /--user-story-file <path>/, script);
    }
  });

  test('shared and provider guidance require story fragments and vc-list AC citations', () => {
    const shared = readFileSync(path.join(REPO_ROOT, 'skill/shared/rules/create-issue.md'), 'utf8');
    assert.match(shared, /user-story\.md/);
    assert.match(shared, /aitm-verified vc-list="vc:N"/);
    assert.doesNotMatch(shared, /Acceptance Criterion[\s\S]{0,160}aitm-verified cmd=/);

    for (const provider of ['codex', 'claude', 'grok']) {
      const adapter = readFileSync(
        path.join(REPO_ROOT, `skill/adapters/${provider}/SKILL.md`),
        'utf8'
      );
      assert.match(adapter, /user-story\.md/, provider);
      assert.match(adapter, /aitm-verified vc-list="vc:N"/, provider);
      assert.doesNotMatch(adapter, /Acceptance Criterion[\s\S]{0,160}aitm-verified cmd=/);
    }
  });

  test('pickup, review, and workflow guidance expose only the current AC citation contract', () => {
    const currentContractSurfaces = [
      'templates/pickup-directive.md',
      'templates/references/deep-dive-procedure.md',
      'templates/references/pickup-directive-rationale.md',
      'templates/references/status-reporting.md',
      'skill/shared/rules/bind.md',
      'skill/shared/rules/review.md',
      'docs/guides/workflow.md',
    ];

    for (const relativePath of currentContractSurfaces) {
      const contents = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
      assert.match(contents, /aitm-verified vc-list="vc:(?:N|\d+)"/, relativePath);
      assert.doesNotMatch(contents, /aitm-verified-by/, relativePath);
      assert.doesNotMatch(
        contents,
        /Acceptance Criterion[\s\S]{0,200}aitm-verified cmd=/,
        relativePath
      );
    }

    for (const relativePath of [
      'skill/shared/rules/plan-mode-backlog.md',
      'skill/shared/rules/block.md',
      'docs/guides/cloud-development-environments.md',
      'docs/guides/ai-value-framework.md',
      'docs/guides/workflow.md',
    ]) {
      const contents = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
      assert.match(contents, /--user-story-file/, relativePath);
    }

    const planMode = readFileSync(
      path.join(REPO_ROOT, 'skill/shared/rules/plan-mode-backlog.md'),
      'utf8'
    );
    assert.match(planMode, /\.tmp\/plan\/user-story\.md/);
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
