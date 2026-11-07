// @story #2148
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeRootFixture } from './runtime-root-fixture.mjs';
import { PROJECT_ROOT_ALIASES } from '../../task-tracker/lib/runtime-storage.mjs';
import { occupancyPath, sessionsDir } from '../../task-tracker/paths.mjs';
const source = fileURLToPath(new URL('../../../', import.meta.url));
const provider = new URL('../fixtures/location-authority-gh.mjs', import.meta.url);
export const number = 2148;
export const nativeSid = process.env.CODEX_THREAD_ID;
export const hasNativeActor = Boolean(nativeSid && nativeSid === process.env.CODEX_SESSION_ID);

export function fixture(t, owners = ['operator']) {
  const root = realpathSync(createRuntimeRootFixture('location-authority-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const configDir = path.join(root, '.ai-task-manager');
  const bin = path.join(root, '.provider');
  mkdirSync(configDir);
  mkdirSync(bin);
  const repo = 'fixture/repository';
  writeFileSync(
    path.join(configDir, 'task-tracker.json'),
    JSON.stringify({ repo, projectId: 'board', kanbanFieldId: 'status' })
  );
  mkdirSync(path.join(root, 'node_modules/@kburson'), { recursive: true });
  symlinkSync(source, path.join(root, 'node_modules/@kburson/ai-task-manager'), 'dir');
  const gh = path.join(bin, 'gh');
  copyFileSync(provider, gh);
  chmodSync(gh, 0o755);
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.tmp/\n.scratch/\n.provider/\n');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('add', '.gitignore', '.ai-task-manager/task-tracker.json');
  git(
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'fixture'
  );
  const file = path.join(bin, 'issue.json');
  const issue = {
    number,
    repo,
    state: 'Backlog',
    owners,
    body: '## Scope\n\nFixture issue.\n',
    comments: [],
  };
  const read = () => JSON.parse(readFileSync(file, 'utf8'));
  const save = (value) => writeFileSync(file, JSON.stringify(value));
  save(issue);
  const env = {
    ...process.env,
    HOME: bin,
    PATH: bin + path.delimiter + process.env.PATH,
    LOCATION_AUTHORITY_PROVIDER: bin,
    AITM_GH_TEST_DOUBLE_BIN: bin,
    TT_SKIP_FIELD_SELF_CHECK: '1',
    GH_CONFIG_DIR: bin,
  };
  for (const key of [
    ...PROJECT_ROOT_ALIASES,
    'TT_SKIP_NETWORK',
    'AI_TASK_MANAGER_SESSION_ID',
    'AI_TASK_MANAGER_TRANSCRIPT_DIR',
    'AI_TASK_MANAGER_APP_NAME',
    'NODE_OPTIONS',
    'GH_TOKEN',
    'GITHUB_TOKEN',
  ])
    delete env[key];
  async function start({
    terminal = false,
    confirm = false,
    inheritedLock = false,
    cwd = root,
    command = ['start', String(number)],
    gitDir,
  } = {}) {
    const childEnv = { ...env };
    if (inheritedLock) childEnv.AITM_ISSUE_LOCK_HELD = String(number);
    if (gitDir) childEnv.GIT_DIR = gitDir;
    if (terminal) {
      for (const key of [
        'CODEX_THREAD_ID',
        'CODEX_SESSION_ID',
        'CODEX_HOME',
        'GROK_AGENT',
        'GROK_SESSION_ID',
        'CLAUDE_CODE_SESSION_ID',
        'CLAUDE_SESSION_ID',
      ])
        delete childEnv[key];
    }
    try {
      const result = await promisify(execFile)(
        process.execPath,
        [
          path.join(source, 'bin/aitm.mjs'),
          ...command,
          '--role',
          'agent',
          ...(confirm ? ['--confirm-relocation'] : []),
        ],
        {
          cwd,
          env: childEnv,
          encoding: 'utf8',
          timeout: 30000,
        }
      );
      return { status: 0, output: result.stdout + result.stderr };
    } catch (error) {
      if (!Number.isInteger(error.code)) throw error;
      return { status: error.code, output: error.stdout + error.stderr };
    }
  }
  const calls = () =>
    existsSync(path.join(bin, 'calls.jsonl'))
      ? readFileSync(path.join(bin, 'calls.jsonl'), 'utf8').split('\n').slice(0, -1).map(JSON.parse)
      : [];
  return { root, issue, read, save, start, calls, git };
}

export async function waitForCall(f, kind) {
  const deadline = Date.now() + 15000;
  while (!f.calls().some((call) => call.kind === kind)) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for ' + kind);
    await delay(10);
  }
}

export function assertRefusal(f, before, result) {
  assert.notEqual(result.status, 0, result.output);
  assert.deepEqual(f.read(), before, result.output);
  assert.deepEqual(
    f.calls().filter((c) => ['body-write', 'comment-write'].includes(c.kind)),
    []
  );
  assert.equal(existsSync(occupancyPath(f.root)), false);
  const sessions = sessionsDir(f.root);
  assert.deepEqual(
    existsSync(sessions)
      ? readdirSync(sessions, { recursive: true }).filter((name) => name.endsWith('.json'))
      : [],
    []
  );
}
