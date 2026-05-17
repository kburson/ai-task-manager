// `/task test` — sandboxed verification runner (#137).
//
// Replaces the in-place command runner that previously lived in review.mjs.
// On invocation:
//   1. Resolves the target issue (from rest args or active binding).
//   2. Parses `## Verification Commands` from the issue body.
//   3. Stages a fresh git worktree at `tmp/.task-test-<N>-<sha8>/` from HEAD.
//   4. Runs `npm ci --no-audit --no-fund` inside the worktree.
//   5. Executes each VC via execFile (allowlist-validated), capturing exit
//      code and last-50-line tail of stdout+stderr.
//   6. On all-green: stamps `<!-- aitm-dod-verified: <sha>:<iso> -->` in the
//      body, posts a summary comment, moves the board test → review, runs
//      `runLogIssueTime`, removes the worktree.
//   7. On any failure: posts a failure-table comment, rolls the board back
//      to develop, removes the worktree, exits non-zero.
//
// All side-effecting I/O is injectable via deps for unit tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';

import { loadState, saveState } from '../state.mjs';
import { projectTmpDir } from '../paths.mjs';
import { validateVerificationCommand } from '../lib/verification-allowlist.mjs';
import { parseVerificationCommands } from '../lib/verification-commands.mjs';
import { insertDodVerifiedMarker } from '../lib/markers.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

const pexec = promisify(execFile);

const SANDBOX_TIMEOUT_MS = 300_000; // 5 min per command — same budget as review.mjs
const NPM_CI_TIMEOUT_MS = 600_000; // 10 min worst-case fresh install
const TAIL_LINES = 50;

function tail(text, n = TAIL_LINES) {
  const lines = String(text || '').split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

function shortSha(sha) {
  return String(sha || '').slice(0, 8) || 'no-head';
}

async function defaultGetHeadSha({ projectDir }) {
  const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], {
    cwd: projectDir,
    timeout: 10_000,
  });
  return stdout.trim();
}

async function defaultCreateWorktree({ projectDir, path: wtPath }) {
  await pexec('git', ['worktree', 'add', '--detach', wtPath, 'HEAD'], {
    cwd: projectDir,
    timeout: 60_000,
  });
}

async function defaultRemoveWorktree({ projectDir, path: wtPath }) {
  try {
    await pexec('git', ['worktree', 'remove', '--force', wtPath], {
      cwd: projectDir,
      timeout: 30_000,
    });
  } catch {
    // best-effort
  }
}

async function defaultNpmCi({ path: wtPath }) {
  await pexec('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: wtPath,
    timeout: NPM_CI_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function defaultExecInSandbox({ argv, path: wtPath }) {
  try {
    const { stdout, stderr } = await pexec(argv[0], argv.slice(1), {
      cwd: wtPath,
      timeout: SANDBOX_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { exit: 0, stdout: String(stdout || ''), stderr: String(stderr || '') };
  } catch (err) {
    return {
      exit: err.code ?? err.exitCode ?? 1,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || err.message || ''),
    };
  }
}

async function defaultFetchBody({ cfg, issueNum }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '');
}

async function defaultWriteBody({ cfg, issueNum, body, projectDir }) {
  const tmp = path.join(projectTmpDir(projectDir), `task-test-body-${issueNum}.md`);
  try {
    writeFileSync(tmp, body, 'utf8');
    await pexec('gh', ['issue', 'edit', issueNum, '-R', cfg.repo, '--body-file', tmp], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

async function defaultPostComment({ cfg, issueNum, body }) {
  await pexec('gh', ['issue', 'comment', issueNum, '-R', cfg.repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

function buildResultTable(results, { sha, status }) {
  const rows = results.map((r) => {
    const mark = r.passed ? '✓' : r.rejected ? '⚠' : '✗';
    return `| ${mark} | \`${r.command}\` | exit ${r.exit ?? 'n/a'} |`;
  });
  const header = `## ${status === 'green' ? '✓ Sandboxed verification passed' : '✗ Sandboxed verification failed'}\n\nHEAD: \`${shortSha(sha)}\``;
  const table = ['| | Command | Result |', '|---|---|---|', ...rows].join('\n');
  const tails = results
    .filter((r) => !r.passed)
    .map(
      (r) =>
        `### \`${r.command}\` — tail\n\n` +
        (r.rejected
          ? `_rejected: ${r.rejected}_\n`
          : '```\n' + tail([r.stdout, r.stderr].filter(Boolean).join('\n')) + '\n```\n')
    )
    .join('\n');
  return `${header}\n\n${table}\n${tails ? '\n' + tails : ''}`;
}

export async function runVerbTest({
  cfg,
  issueNumber,
  projectDir,
  deps = {},
  now = () => new Date().toISOString(),
} = {}) {
  if (!cfg) throw new Error('verbTest: cfg is required');
  if (!issueNumber) throw new Error('verbTest: issueNumber is required');
  if (!projectDir) throw new Error('verbTest: projectDir is required');

  const issueNum = String(issueNumber).replace(/^#/, '');
  const fetchBody = deps.fetchBody || defaultFetchBody;
  const writeBody = deps.writeBody || defaultWriteBody;
  const postComment = deps.postComment || defaultPostComment;
  const getHeadSha = deps.getHeadSha || defaultGetHeadSha;
  const createWorktree = deps.createWorktree || defaultCreateWorktree;
  const removeWorktree = deps.removeWorktree || defaultRemoveWorktree;
  const npmCi = deps.npmCi || defaultNpmCi;
  const execInSandbox = deps.execInSandbox || defaultExecInSandbox;
  const moveState = deps.moveState;
  const logIssueTime = deps.logIssueTime;

  const body = await fetchBody({ cfg, issueNum });
  const vcs = parseVerificationCommands(body);
  if (vcs.length === 0) {
    return {
      status: 'no-vc',
      message: `#${issueNum}: no \`## Verification Commands\` entries — nothing to verify.`,
    };
  }

  const sha = await getHeadSha({ projectDir });
  const wtPath = path.join(projectTmpDir(projectDir), `.task-test-${issueNum}-${shortSha(sha)}`);
  if (existsSync(wtPath)) {
    await removeWorktree({ projectDir, path: wtPath });
  }

  const results = [];
  let cleanupNeeded = false;
  try {
    await createWorktree({ projectDir, path: wtPath });
    cleanupNeeded = true;
    await npmCi({ path: wtPath });

    for (const vc of vcs) {
      const validation = validateVerificationCommand(vc.command, { projectDir: wtPath });
      if (!validation.ok) {
        results.push({
          command: vc.command,
          rejected: validation.reason,
          passed: false,
          exit: null,
          stdout: '',
          stderr: '',
        });
        continue;
      }
      const r = await execInSandbox({ argv: validation.argv, path: wtPath });
      results.push({
        command: vc.command,
        passed: r.exit === 0,
        exit: r.exit,
        stdout: r.stdout,
        stderr: r.stderr,
      });
    }
  } finally {
    if (cleanupNeeded) {
      await removeWorktree({ projectDir, path: wtPath });
    }
  }

  const allGreen = results.length > 0 && results.every((r) => r.passed);

  if (allGreen) {
    const ts = now();
    const stamped = insertDodVerifiedMarker(body, sha, ts);
    if (stamped !== body) {
      await writeBody({ cfg, issueNum, body: stamped, projectDir });
    }
    await postComment({
      cfg,
      issueNum,
      body: buildResultTable(results, { sha, status: 'green' }),
    });
    if (moveState) await moveState({ issueNumber: issueNum, target: 'test' });
    if (moveState) await moveState({ issueNumber: issueNum, target: 'review' });
    if (logIssueTime) await logIssueTime(issueNum);
    return { status: 'passed', sha, ts, results, wtPath };
  }

  await postComment({
    cfg,
    issueNum,
    body: buildResultTable(results, { sha, status: 'red' }),
  });
  if (moveState) await moveState({ issueNumber: issueNum, target: 'develop' });
  return { status: 'failed', sha, results, wtPath };
}

export async function verbTest(ctx) {
  const { cfg, projectDir, rest, SKIP_NETWORK, statePath, runMoveState, runLogIssueTime } = ctx;
  if (SKIP_NETWORK) {
    console.error('/task test: SKIP_NETWORK is set — refusing to run sandbox verification.');
    process.exit(1);
  }
  const s = loadState(statePath);
  const target =
    rest.find((a) => /^#\d+$/.test(a)) || (s.active && s.active !== 'discover' ? s.active : null);
  if (!target) {
    console.error('Usage: /task test #N');
    process.exit(1);
  }
  const issueNumber = String(target).replace(/^#/, '');

  const moveState = async ({ issueNumber: n, target: t }) => {
    await runMoveState(`#${n}`, t, { silent: true });
  };
  const logIssueTime = async (n) => {
    await runLogIssueTime(`#${n}`);
  };

  let result;
  try {
    result = await runVerbTest({
      cfg,
      issueNumber,
      projectDir,
      deps: { moveState, logIssueTime },
    });
  } catch (err) {
    console.error(`/task test: ${err.message}`);
    process.exit(1);
  }

  switch (result.status) {
    case 'no-vc':
      console.error(result.message);
      process.exit(4);
      break;
    case 'passed':
      console.log(`✓ #${issueNumber} verified in sandbox — moved to Review.`);
      saveState(
        {
          ...s,
          active: null,
          entryStartTs: null,
          wordsAtEntryStart: 0,
          lastActive: `#${issueNumber}`,
        },
        statePath
      );
      return;
    case 'failed': {
      const fails = result.results.filter((r) => !r.passed).length;
      console.error(`✗ #${issueNumber} verification failed in sandbox (${fails} command(s)).`);
      process.exit(3);
    }
    default:
      console.error(`/task test: unknown result status: ${result.status}`);
      process.exit(1);
  }
}
