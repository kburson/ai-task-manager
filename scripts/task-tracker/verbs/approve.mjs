// `approve` verb — Analysis -> Development gate.
//
// Solicits explicit human approval of the deep-dive plan before allowing the
// issue to move from `analyze` to `development`. Three modes:
//
//   approve <N>                          -> emit a structured prompt for Claude
//                                           to render via AskUserQuestion. In
//                                           headless mode (CI=1 or no TTY),
//                                           refuse with a clear message.
//   approve <N> --answer yes             -> append the procedural-gate marker
//                                           `<!-- aitm-plan-approved: <ISO> -->`
//                                           to the issue body and run
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
import { readParentStatus as defaultReadParentStatus } from '../../gh/lib/parent-status.mjs';
import { checkParentAdmission } from '../lib/body-gates.mjs';
import { applyReevaluate } from '../lib/apply-reevaluate.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));

const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

export const APPROVAL_MARKER_RE = /<!--\s*aitm-plan-approved:\s*[^>]+-->/i;
export function approvalMarker(ts) {
  return `<!-- aitm-plan-approved: ${ts} -->`;
}

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

async function defaultFetchParentEpicNumber({ issueNumber, repo }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(`
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { parent { number } }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  return data?.repository?.issue?.parent?.number ?? null;
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

// Append the procedural-gate marker for analyze→development approval.
// Strips any legacy `- [ ]` / `- [x] Plan approved by human` line so an
// approve on an unmigrated body cleans up its own AC noise. Idempotent: if
// a marker is already present and no legacy line exists, returns body
// unchanged. Mirrors the existing aitm-review-approved precedent.
const LEGACY_CHECKBOX_LINE_RE = /^[ \t]*- \[[ x]\] Plan approved by human\s*\r?\n?/gmi;

export function writePlanApprovedMarker(body, { now = () => new Date().toISOString() } = {}) {
  const src = String(body || '');
  const hasLegacy = LEGACY_CHECKBOX_LINE_RE.test(src);
  LEGACY_CHECKBOX_LINE_RE.lastIndex = 0;
  const hasMarker = APPROVAL_MARKER_RE.test(src);
  if (hasMarker && !hasLegacy) return src;

  let next = src;
  if (hasLegacy) {
    next = next.replace(LEGACY_CHECKBOX_LINE_RE, '').replace(/\n{3,}/g, '\n\n');
  }
  if (hasMarker) return next;

  const ts = typeof now === 'function' ? now() : String(now);
  const marker = approvalMarker(ts);
  const trimmed = next.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n\n${marker}\n` : `${marker}\n`;
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
  const fetchParentEpicNumber = deps.fetchParentEpicNumber || defaultFetchParentEpicNumber;
  const readParentStatus      = deps.readParentStatus      || defaultReadParentStatus;

  // Parent-admission gate: refuse analyze→development when the parent epic is
  // not yet in Development or beyond. Runs BEFORE any body mutation or
  // move-state so a refused transition leaves no side effects.
  async function runParentAdmissionGate() {
    const parentEpicNumber = await fetchParentEpicNumber({ issueNumber, repo: cfg.repo });
    const refusals = await checkParentAdmission({
      parentEpicNumber,
      repo: cfg.repo,
      projectId: cfg.projectId,
      readParentStatus,
    });
    if (refusals.length === 0) return null;
    return {
      status: 'parent-admission-refused',
      blockers: refusals,
      message: refusals.map(r => r.message).join('\n'),
    };
  }

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
    const refused = await runParentAdmissionGate();
    if (refused) return refused;
    const { body } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
    const updated = writePlanApprovedMarker(body);
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
    const refused = await runParentAdmissionGate();
    if (refused) return refused;
    const { body } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
    const updated = writePlanApprovedMarker(body);
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
    case 'parent-admission-refused': {
      process.stderr.write(`\n⛔ Refusing to move #${issueNumber} to development:\n`);
      for (const b of result.blockers) {
        process.stderr.write(`   BLOCKED: ${b.message}\n`);
      }
      process.stderr.write('\nAdvance the parent epic to Development first, then retry.\n');
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
