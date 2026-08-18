// @story #1295
// cspell:ignore FWYYERKWZZZ
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  ACTION_CAPTURE_SCHEMA,
  actionCaptureRoot,
  beginCapturedAction,
  captureIssueDir,
  classifyGhCall,
  completeCapturedAction,
  isActionCaptureEnabled,
  prepareActionCaptureEnv,
  setActionCaptureEnabled,
  summarizeActionCorpus,
} from '../../../../task-tracker/lib/action-capture.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { runCaptureActions } from '../../../../task-tracker/capture-actions.mjs';

const classify = (args, input = '') => classifyGhCall(args, Buffer.from(input));

test('action capture exposes one stable schema identifier', () => {
  assert.equal(ACTION_CAPTURE_SCHEMA, 'aitm.github-action-capture/v1');
});

test('classifies governed issue mutation families', () => {
  const cases = [
    { args: ['issue', 'create', '--title', 'Story'], kind: 'issue-create' },
    { args: ['issue', 'edit', '42', '--body-file', '-'], kind: 'issue-body' },
    { args: ['issue', 'edit', '42', '--title', 'New'], kind: 'issue-title' },
    { args: ['issue', 'edit', '42', '--add-label', 'infra'], kind: 'issue-labels' },
    { args: ['issue', 'edit', '42', '--remove-label', 'infra'], kind: 'issue-labels' },
    { args: ['issue', 'edit', '42', '--add-assignee', '@me'], kind: 'issue-ownership' },
    { args: ['issue', 'edit', '42', '--remove-assignee', '@me'], kind: 'issue-ownership' },
    { args: ['issue', 'comment', '42', '--body', 'note'], kind: 'issue-comment' },
    { args: ['issue', 'close', '42'], kind: 'issue-close' },
    { args: ['issue', 'reopen', '42'], kind: 'issue-reopen' },
  ];

  for (const { args, kind } of cases) {
    assert.deepEqual(classify(args), {
      operationClass: 'mutation',
      mutationKind: kind,
    });
  }
});

test('classifies project, GraphQL, and REST mutations', () => {
  assert.deepEqual(classify(['project', 'item-edit', '--id', 'PVTI_x']), {
    operationClass: 'mutation',
    mutationKind: 'project',
  });
  assert.deepEqual(
    classify(
      ['api', 'graphql', '--input', '-'],
      JSON.stringify({
        query:
          'mutation Update($id: ID!) { updateProjectV2ItemFieldValue(input: {}) { clientMutationId } }',
      })
    ),
    { operationClass: 'mutation', mutationKind: 'graphql' }
  );
  assert.deepEqual(classify(['api', '-X', 'PATCH', 'repos/o/r/issues/42']), {
    operationClass: 'mutation',
    mutationKind: 'rest',
  });
  assert.deepEqual(classify(['api', 'repos/o/r/issues/42', '-f', 'state=closed']), {
    operationClass: 'mutation',
    mutationKind: 'rest',
  });
});

test('classifies GitHub reads without inventing a mutation kind', () => {
  for (const args of [
    ['issue', 'view', '42', '--json', 'body'],
    ['issue', 'list', '--state', 'open'],
    ['api', 'repos/o/r/issues/42'],
    ['api', 'graphql', '--input', '-'],
  ]) {
    const input = args.includes('graphql')
      ? JSON.stringify({ query: 'query { viewer { login } }' })
      : '';
    assert.deepEqual(classify(args, input), {
      operationClass: 'read',
      mutationKind: null,
    });
  }
});

function sandbox() {
  return mkdtempProjectIsolated('action-capture-');
}

function fixedDeps(mainDir) {
  let id = 0;
  return {
    findMainWorktreePath: () => mainDir,
    createRecordId: () => `01M08F6FWYYERKWZZZ1AH15W${String(id++).padStart(2, '0')}`,
    now: () => new Date('2026-08-17T18:30:00.000Z'),
    pid: 1295,
  };
}

test('enablement and issue storage are anchored in the main worktree', () => {
  const linkedDir = sandbox();
  const mainDir = sandbox();
  const deps = fixedDeps(mainDir);

  assert.equal(
    actionCaptureRoot(linkedDir, deps),
    path.join(mainDir, '.tmp', 'aitm', 'action-capture')
  );
  assert.equal(
    isActionCaptureEnabled({ projectDir: linkedDir, repository: 'o/r', issue: 42 }, deps),
    false
  );

  setActionCaptureEnabled(
    { projectDir: linkedDir, repository: 'o/r', issue: 42, enabled: true },
    deps
  );
  assert.equal(
    isActionCaptureEnabled({ projectDir: linkedDir, repository: 'o/r', issue: 42 }, deps),
    true
  );
  assert.equal(
    captureIssueDir({ projectDir: linkedDir, repository: 'o/r', issue: 42 }, deps),
    path.join(mainDir, '.tmp', 'aitm', 'action-capture', 'repositories', 'o__r', 'issue-42')
  );

  setActionCaptureEnabled(
    { projectDir: linkedDir, repository: 'o/r', issue: 42, enabled: false },
    deps
  );
  assert.equal(
    isActionCaptureEnabled({ projectDir: linkedDir, repository: 'o/r', issue: 42 }, deps),
    false
  );
});

test('writes an ordered intent before a separate outcome without changing exact safe bytes', () => {
  const projectDir = sandbox();
  const deps = fixedDeps(projectDir);
  const markdown = Buffer.from('First line\n\n- exact Markdown  \n');
  const handle = beginCapturedAction(
    {
      projectDir,
      repository: 'o/r',
      issue: 42,
      invocationId: 'invocation-1',
      command: 'issue-body',
      args: ['issue', 'edit', '42', '--body-file', '-'],
      stdin: markdown,
      preconditions: { expectedIssueVersion: 'version-7' },
    },
    deps
  );

  assert.match(path.basename(handle.actionDir), /^000001-01M08F6FWYYERKWZZZ1AH15W00$/);
  const intent = JSON.parse(readFileSync(path.join(handle.actionDir, 'intent.json'), 'utf8'));
  assert.equal(intent.schema, ACTION_CAPTURE_SCHEMA);
  assert.equal(intent.sequence, 1);
  assert.equal(intent.operationClass, 'mutation');
  assert.equal(intent.mutationKind, 'issue-body');
  assert.equal(intent.attempt, 1);
  assert.deepEqual(intent.preconditions, { expectedIssueVersion: 'version-7' });
  assert.equal(intent.request.stdin.bytes, markdown.length);
  assert.match(intent.request.stdin.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(intent.request.stdin.stored, true);
  assert.deepEqual(readFileSync(path.join(handle.actionDir, 'stdin.bin')), markdown);
  assert.deepEqual(readdirSync(handle.actionDir).sort(), ['argv.json', 'intent.json', 'stdin.bin']);

  completeCapturedAction(
    handle,
    {
      exitCode: 0,
      signal: null,
      stdout: Buffer.from('{"body":"read back"}\n'),
      stderr: Buffer.alloc(0),
      finishedAt: '2026-08-17T18:30:01.000Z',
      readback: { issueVersion: 'version-8' },
    },
    deps
  );
  const outcome = JSON.parse(readFileSync(path.join(handle.actionDir, 'outcome.json'), 'utf8'));
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.durationMs, 1000);
  assert.deepEqual(outcome.readback, { issueVersion: 'version-8' });
  assert.deepEqual(
    readFileSync(path.join(handle.actionDir, 'stdout.bin')),
    Buffer.from('{"body":"read back"}\n')
  );
});

test('stores exact request files alongside argv and stdin metadata', () => {
  const projectDir = sandbox();
  const deps = fixedDeps(projectDir);
  const markdown = Buffer.from('# Exact body\n\nTrailing spaces stay.  \n');
  const handle = beginCapturedAction(
    {
      projectDir,
      repository: 'o/r',
      issue: 42,
      invocationId: 'invocation-file',
      command: 'issue-body',
      args: ['issue', 'edit', '42', '--body-file', './body.md'],
      files: [{ kind: 'body-file', bytes: markdown }],
    },
    deps
  );

  const intent = JSON.parse(readFileSync(path.join(handle.actionDir, 'intent.json'), 'utf8'));
  assert.deepEqual(intent.request.files, [
    {
      kind: 'body-file',
      bytes: markdown.length,
      sha256: intent.request.files[0].sha256,
      stored: true,
      redacted: false,
      file: 'request-01.bin',
    },
  ]);
  assert.deepEqual(readFileSync(path.join(handle.actionDir, 'request-01.bin')), markdown);
});

test('keeps hashes and sizes but omits credential-bearing request and response bytes', () => {
  const projectDir = sandbox();
  const deps = fixedDeps(projectDir);
  const handle = beginCapturedAction(
    {
      projectDir,
      repository: 'o/r',
      issue: 42,
      invocationId: 'invocation-2',
      command: 'api',
      args: ['api', '-H', 'authorization: bearer ghp_abcdefghijklmnop'],
      stdin: Buffer.from('github_pat_abcdefghijklmnopqrstuvwxyz'),
    },
    deps
  );
  const intent = JSON.parse(readFileSync(path.join(handle.actionDir, 'intent.json'), 'utf8'));
  assert.equal(intent.request.argv.stored, false);
  assert.equal(intent.request.stdin.stored, false);
  assert.equal(intent.request.argv.redacted, true);
  assert.equal(intent.request.stdin.redacted, true);

  completeCapturedAction(
    handle,
    {
      exitCode: 1,
      stderr: Buffer.from('authorization: bearer ghp_abcdefghijklmnop'),
    },
    deps
  );
  const files = readdirSync(handle.actionDir);
  assert.equal(files.includes('argv.json'), false);
  assert.equal(files.includes('stdin.bin'), false);
  assert.equal(files.includes('stderr.bin'), false);
  const outcome = JSON.parse(readFileSync(path.join(handle.actionDir, 'outcome.json'), 'utf8'));
  assert.equal(outcome.stderr.stored, false);
  assert.equal(outcome.stderr.redacted, true);
});

test('isolates issues and repositories while allocating stable unique sequences', () => {
  const projectDir = sandbox();
  const deps = fixedDeps(projectDir);
  const contexts = [
    { repository: 'o/r', issue: 42 },
    { repository: 'o/r', issue: 42 },
    { repository: 'o/r', issue: 43 },
    { repository: 'other/r', issue: 42 },
  ];
  const handles = contexts.map((context, index) =>
    beginCapturedAction(
      {
        projectDir,
        ...context,
        invocationId: `invocation-${index}`,
        command: 'status',
        args: ['issue', 'view', String(context.issue)],
      },
      deps
    )
  );

  assert.deepEqual(
    handles.map((handle) => handle.sequence),
    [1, 2, 1, 1]
  );
  assert.equal(new Set(handles.map((handle) => handle.actionDir)).size, 4);
});

test('prepares a shim environment only for an enabled active issue', () => {
  const projectDir = sandbox();
  const deps = {
    ...fixedDeps(projectDir),
    resolveGh: () => '/usr/local/bin/gh-real',
    shimDir: '/package/action-capture-bin',
  };
  mkdirSync(path.join(projectDir, '.ai-task-manager'), { recursive: true });
  mkdirSync(path.join(projectDir, '.tmp', 'aitm', 'state'), { recursive: true });
  writeFileSync(
    path.join(projectDir, '.ai-task-manager', 'task-tracker.json'),
    `${JSON.stringify({ repo: 'o/r' })}\n`
  );
  writeFileSync(
    path.join(projectDir, '.tmp', 'aitm', 'state', 'task-tracker-state.json'),
    `${JSON.stringify({ active: '#42' })}\n`
  );
  const original = { PATH: '/usr/local/bin:/usr/bin', KEEP: 'yes' };

  assert.deepEqual(
    prepareActionCaptureEnv({ env: original, cwd: projectDir, command: 'status' }, deps),
    original
  );
  setActionCaptureEnabled({ projectDir, repository: 'o/r', issue: 42, enabled: true }, deps);
  const prepared = prepareActionCaptureEnv(
    { env: original, cwd: projectDir, command: 'issue-body' },
    deps
  );
  assert.equal(prepared.KEEP, 'yes');
  assert.equal(prepared.PATH, `/package/action-capture-bin${path.delimiter}${original.PATH}`);
  assert.equal(prepared.AITM_CAPTURE_REAL_GH, '/usr/local/bin/gh-real');
  assert.equal(prepared.AITM_CAPTURE_PROJECT_DIR, projectDir);
  assert.equal(prepared.AITM_CAPTURE_REPOSITORY, 'o/r');
  assert.equal(prepared.AITM_CAPTURE_ISSUE, '42');
  assert.equal(prepared.AITM_CAPTURE_COMMAND, 'issue-body');
  assert.match(prepared.AITM_CAPTURE_INVOCATION_ID, /^[0-9A-HJKMNP-TV-Z]{26}$/);
});

test('operator control enables, reports, summarizes, and disables the active issue corpus', () => {
  const projectDir = sandbox();
  mkdirSync(path.join(projectDir, '.ai-task-manager'), { recursive: true });
  mkdirSync(path.join(projectDir, '.tmp', 'aitm', 'state'), { recursive: true });
  writeFileSync(
    path.join(projectDir, '.ai-task-manager', 'task-tracker.json'),
    `${JSON.stringify({ repo: 'o/r' })}\n`
  );
  writeFileSync(
    path.join(projectDir, '.tmp', 'aitm', 'state', 'task-tracker-state.json'),
    `${JSON.stringify({ active: '#42' })}\n`
  );
  const output = [];
  const deps = { cwd: projectDir, log: (line) => output.push(line) };

  assert.equal(runCaptureActions(['on'], deps), 0);
  assert.match(output.pop(), /enabled.*o\/r#42/i);
  assert.equal(runCaptureActions(['status'], deps), 0);
  assert.match(output.pop(), /enabled.*o\/r#42/i);
  assert.equal(runCaptureActions(['summary', '--json'], deps), 0);
  assert.deepEqual(JSON.parse(output.pop()), {
    schema: ACTION_CAPTURE_SCHEMA,
    repository: 'o/r',
    issue: 42,
    actions: 0,
    complete: 0,
    incomplete: 0,
    byKind: {},
    serializedBytes: 0,
    payloadBytes: 0,
    largestAction: null,
  });
  assert.equal(runCaptureActions(['off', '--issue', '42'], deps), 0);
  assert.match(output.pop(), /disabled.*preserved/i);
  assert.equal(isActionCaptureEnabled({ projectDir, repository: 'o/r', issue: 42 }), false);
});

test('summarizes complete and incomplete actions, serialized bytes, payload bytes, and largest action', () => {
  const projectDir = sandbox();
  const deps = fixedDeps(projectDir);
  const largeMarkdown = 'a much larger Markdown payload\n'.repeat(200);
  const first = beginCapturedAction(
    {
      projectDir,
      repository: 'o/r',
      issue: 42,
      invocationId: 'invocation-summary-1',
      command: 'comment',
      args: ['issue', 'comment', '42', '--body-file', '-'],
      stdin: Buffer.from('small'),
    },
    deps
  );
  completeCapturedAction(first, { exitCode: 0, stdout: Buffer.from('ok') }, deps);
  beginCapturedAction(
    {
      projectDir,
      repository: 'o/r',
      issue: 42,
      invocationId: 'invocation-summary-2',
      command: 'issue-body',
      args: ['issue', 'edit', '42', '--body-file', '-'],
      stdin: Buffer.from(largeMarkdown),
    },
    deps
  );

  const summary = summarizeActionCorpus({ projectDir, repository: 'o/r', issue: 42 }, deps);
  assert.equal(summary.schema, ACTION_CAPTURE_SCHEMA);
  assert.equal(summary.actions, 2);
  assert.equal(summary.complete, 1);
  assert.equal(summary.incomplete, 1);
  assert.deepEqual(summary.byKind, { 'issue-body': 1, 'issue-comment': 1 });
  assert.ok(summary.serializedBytes > summary.payloadBytes);
  assert.ok(summary.payloadBytes >= 'small'.length + 'ok'.length + largeMarkdown.length);
  assert.equal(summary.largestAction.sequence, 2);
  assert.ok(summary.largestAction.serializedBytes > 0);
});
