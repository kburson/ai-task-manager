// `approve` verb — Analysis -> Development gate.
//
// Solicits explicit human approval of the deep-dive plan before allowing the
// issue to move from `analyze` to `development`. Three modes:
//
//   approve <N>                          -> emit a structured prompt for Claude
//                                           to render via AskUserQuestion. In
//                                           headless mode (CI=1 or no TTY),
//                                           refuse with a clear message.
//   approve <N> --answer yes             -> tick `- [ ] Plan approved by human`
//                                           in the issue body and run
//                                           `move-state.mjs <N> development`.
//   approve <N> --answer no --reason "x" -> refuse transition and post the
//                                           free-text reason as a comment so
//                                           the orchestrator can revise the
//                                           deep-dive.
//
// Refusal contract: exit 4, one blocker per stderr line. Mirrors the
// `analyze` verb so the gate stack speaks one error language.

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { gh, splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { applyReevaluate } from '../lib/apply-reevaluate.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));

const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

export const APPROVAL_CHECKBOX_LABEL = 'Plan approved by human';
const APPROVAL_LINE_UNCHECKED = `- [ ] ${APPROVAL_CHECKBOX_LABEL}`;
const APPROVAL_LINE_CHECKED = `- [x] ${APPROVAL_CHECKBOX_LABEL}`;

// ---------------------------------------------------------------------------
// Default I/O — extracted so tests can inject stubs.
// ---------------------------------------------------------------------------

async function defaultFetchIssueBody({ issueNumber, repo }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(`
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { title body }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const issue = data?.repository?.issue;
  if (!issue) throw new Error(`approve: issue #${issueNumber} not found in ${repo}`);
  return { title: issue.title || '', body: issue.body || '' };
}

async function defaultWriteIssueBody({ issueNumber, repo, body }) {
  const tmp = path.join(tmpdir(), `aitm-approve-${process.pid}-${Date.now()}.md`);
  writeFileSync(tmp, body, 'utf8');
  try {
    await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp], { timeout: 15000 });
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], { timeout: 15000 });
}

async function defaultMoveState({ issueNumber }) {
  const script = path.resolve(__dir, '../../gh/move-state.mjs');
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script, String(issueNumber), 'development'], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('exit', code => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

function defaultIsHeadless() {
  if (process.env.CI === '1') return true;
  if (process.env.CI && process.env.CI.toLowerCase() === 'true') return true;
  if (!process.stdout.isTTY) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Body manipulation helpers — pure.
// ---------------------------------------------------------------------------

// Extract the `## Deep-Dive Analysis` section verbatim (heading + content up
// to the next `## ` heading or end). Returns null if absent.
export function extractDeepDive(body) {
  const lines = String(body || '').split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Deep[- ]Dive Analysis\b/i.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trimEnd();
}

// Tick the canonical approval checkbox; insert it under "## Acceptance
// Criteria" if missing. Returns the updated body.
export function tickApprovalCheckbox(body) {
  const src = String(body || '');
  // Match only standalone checkbox bullets at the start of a line — not the
  // label appearing inside backticks/prose elsewhere in the body.
  const checkedRe = new RegExp(`^- \\[x\\] ${APPROVAL_CHECKBOX_LABEL}\\s*$`, 'mi');
  const uncheckedRe = new RegExp(`^- \\[ \\] ${APPROVAL_CHECKBOX_LABEL}\\s*$`, 'm');
  if (checkedRe.test(src)) return src; // already ticked
  if (uncheckedRe.test(src)) {
    return src.replace(uncheckedRe, APPROVAL_LINE_CHECKED);
  }
  // Insert under Acceptance Criteria — append at end of that section.
  const lines = src.split('\n');
  let acStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Acceptance Criteria\b/i.test(lines[i])) { acStart = i; break; }
  }
  if (acStart === -1) {
    // No AC section — append a new one near the top (after first blank line).
    return `${src.trimEnd()}\n\n## Acceptance Criteria\n\n${APPROVAL_LINE_CHECKED}\n`;
  }
  let insertAt = lines.length;
  for (let i = acStart + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]) || /^###\s+/.test(lines[i])) { insertAt = i; break; }
  }
  // Walk back over trailing blank lines so the new entry sits inside the section.
  while (insertAt > acStart + 1 && lines[insertAt - 1].trim() === '') insertAt--;
  lines.splice(insertAt, 0, APPROVAL_LINE_CHECKED);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Pure core. Tests drive this directly.
// ---------------------------------------------------------------------------

export async function runApprove({ issueNumber, answer, reason, cfg, deps = {} } = {}) {
  if (!issueNumber) throw new Error('approve: issueNumber is required');
  if (!cfg) throw new Error('approve: cfg is required');

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const writeIssueBody = deps.writeIssueBody || defaultWriteIssueBody;
  const postComment    = deps.postComment    || defaultPostComment;
  const moveState      = deps.moveState      || defaultMoveState;
  const isHeadless     = deps.isHeadless     || defaultIsHeadless;
  const reeval         = deps.applyReevaluate || applyReevaluate;

  async function runReevalHook(postTickBody) {
    try {
      await reeval({ cfg, issueNumber, body: postTickBody, scratchDir: tmpdir() });
    } catch (err) {
      process.stderr.write(`⚠ re-eval skipped: ${err.message}\n`);
    }
  }

  // Full-auto bypass: gateAnalysisToDevelopment=false skips the prompt entirely
  // and auto-approves. Caller still receives a structured result so the
  // orchestrator can log a gate-bypass audit row. See #58.
  if (cfg.gateAnalysisToDevelopment === false && (answer === undefined || answer === null)) {
    const { body } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
    const updated = tickApprovalCheckbox(body);
    if (updated !== body) {
      await writeIssueBody({ issueNumber, repo: cfg.repo, body: updated });
    }
    await runReevalHook(updated);
    const code = await moveState({ issueNumber });
    if (code !== 0) {
      return {
        status: 'error',
        message: `move-state.mjs exited ${code} during gateAnalysisToDevelopment=false auto-approve`,
      };
    }
    return { status: 'gate-bypassed', moveStateExitCode: code };
  }

  // No answer provided -> prompt mode (headless or interactive).
  if (answer === undefined || answer === null) {
    if (isHeadless()) {
      return {
        status: 'headless-refused',
        message: 'headless mode cannot answer (CI=1 or no TTY) — re-run from an interactive Claude session and pass the human answer via --answer yes|no',
      };
    }
    // Fetch deep-dive section for the prompt.
    const { title, body } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
    const summary = extractDeepDive(body);
    if (!summary) {
      return {
        status: 'error',
        message: `no Deep-Dive Analysis section found in #${issueNumber} — run the deep dive before requesting approval`,
      };
    }
    return {
      status: 'needs-prompt',
      prompt: {
        question: `Approve the deep-dive plan for #${issueNumber} ("${title}") and move analyze -> development?`,
        options: ['yes', 'no'],
        contextLines: summary.split('\n'),
      },
    };
  }

  const norm = String(answer).toLowerCase();

  if (norm === 'yes' || norm === 'y') {
    const { body } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
    const updated = tickApprovalCheckbox(body);
    if (updated !== body) {
      await writeIssueBody({ issueNumber, repo: cfg.repo, body: updated });
    }
    await runReevalHook(updated);
    const code = await moveState({ issueNumber });
    if (code !== 0) {
      return {
        status: 'error',
        message: `move-state.mjs exited ${code} after approval; checkbox was ticked but transition did not complete`,
      };
    }
    return { status: 'approved', moveStateExitCode: code };
  }

  if (norm === 'no' || norm === 'n') {
    const trimmed = String(reason || '').trim();
    if (!trimmed) {
      return {
        status: 'error',
        message: '--answer no requires --reason "<free-text reason>" so the orchestrator can revise the deep-dive',
      };
    }
    const ts = new Date().toISOString().slice(0, 10);
    const commentBody = `### Approval refused (${ts})\n\n${trimmed}`;
    await postComment({ issueNumber, repo: cfg.repo, body: commentBody });
    return { status: 'rejected', commentPosted: true };
  }

  return {
    status: 'error',
    message: `unrecognised --answer value: ${answer} (expected yes|no)`,
  };
}

// ---------------------------------------------------------------------------
// CLI wrapper.
// ---------------------------------------------------------------------------

function parseArgs(rest) {
  const out = { issueNumber: null, answer: undefined, reason: undefined };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const m = String(a).match(/^#?(\d+)$/);
    if (m && out.issueNumber === null) { out.issueNumber = Number(m[1]); continue; }
    if (a === '--answer' && rest[i + 1]) { out.answer = rest[++i]; continue; }
    if (a === '--reason' && rest[i + 1]) { out.reason = rest[++i]; continue; }
  }
  return out;
}

export async function verbApprove(rest, cfg) {
  const { issueNumber, answer, reason } = parseArgs(rest);
  if (!issueNumber) {
    process.stderr.write('Usage: approve #N [--answer yes|no] [--reason "..."]\n');
    process.exit(1);
  }

  if (SKIP_NETWORK) {
    process.stderr.write('approve: TT_SKIP_NETWORK set — refusing to run gate offline\n');
    process.exit(1);
  }

  let result;
  try {
    result = await runApprove({ issueNumber, answer, reason, cfg });
  } catch (err) {
    process.stderr.write(`approve: ${err.message}\n`);
    process.exit(1);
  }

  switch (result.status) {
    case 'needs-prompt': {
      // Emit a structured prompt for the Claude orchestrator. The skill layer
      // reads this JSON, calls AskUserQuestion, then re-invokes the verb with
      // --answer yes|no [--reason "..."].
      process.stdout.write(JSON.stringify({
        kind: 'approve-prompt',
        issueNumber,
        ...result.prompt,
      }, null, 2));
      process.stdout.write('\n');
      return;
    }
    case 'headless-refused': {
      process.stderr.write(`\n⛔ Refusing to prompt for #${issueNumber}:\n`);
      process.stderr.write(`   BLOCKED: ${result.message}\n\n`);
      process.exit(4);
    }
    case 'approved': {
      process.stdout.write(`✓ Approved. Issue #${issueNumber} moved: analyze -> development\n`);
      return;
    }
    case 'gate-bypassed': {
      process.stdout.write(`⚠ gateAnalysisToDevelopment=false — auto-approved #${issueNumber} without human review.\n`);
      process.stdout.write(`✓ Issue #${issueNumber} moved: analyze -> development\n`);
      return;
    }
    case 'rejected': {
      process.stdout.write(`✗ Approval refused — comment posted on #${issueNumber}. Revise the deep-dive and re-run approve.\n`);
      process.exit(4);
    }
    case 'error': {
      process.stderr.write(`approve: ${result.message}\n`);
      process.exit(1);
    }
    default: {
      process.stderr.write(`approve: unknown result status: ${result.status}\n`);
      process.exit(1);
    }
  }
}

const _isMain = (() => {
  try { return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); }
  catch { return false; }
})();

if (_isMain) {
  const { loadConfig } = await import('../config.mjs');
  const cfg = loadConfig();
  await verbApprove(process.argv.slice(2), cfg);
}
