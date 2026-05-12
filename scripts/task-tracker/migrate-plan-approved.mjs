#!/usr/bin/env node
// One-shot migration helper for issues that still carry the legacy
// `- [ ] Plan approved by human` / `- [x] Plan approved by human` checkbox
// (the pre-#84 procedural-gate signal).
//
// Behaviour:
//   * Strip any standalone legacy checkbox line from the body.
//   * If the legacy line was *checked* AND no marker is already present,
//     append `<!-- aitm-plan-approved: <ISO-now> -->` to the end of the body.
//   * Idempotent: no-op when nothing matches.
//
// CLI: node scripts/task-tracker/migrate-plan-approved.mjs <issue#>
//
// Reads/writes via `gh issue view` / `gh issue edit`. Pure transform exported
// for unit tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APPROVAL_MARKER_RE, approvalMarker } from './verbs/approve.mjs';

const pexec = promisify(execFile);

const LEGACY_CHECKED_RE = /^- \[x\] Plan approved by human\s*$/m;
const LEGACY_UNCHECKED_RE = /^- \[ \] Plan approved by human\s*$/m;
const LEGACY_ANY_LINE_RE = /^[ \t]*- \[[ x]\] Plan approved by human\s*\r?\n?/gim;

export function migratePlanApprovedBody(body, { now = () => new Date().toISOString() } = {}) {
  const src = String(body || '');
  const wasChecked = LEGACY_CHECKED_RE.test(src);
  const hasLegacy = wasChecked || LEGACY_UNCHECKED_RE.test(src);
  const hasMarker = APPROVAL_MARKER_RE.test(src);

  if (!hasLegacy && hasMarker) return { body: src, changed: false, action: 'noop-marker-present' };
  if (!hasLegacy && !hasMarker) return { body: src, changed: false, action: 'noop-no-trace' };

  let stripped = src.replace(LEGACY_ANY_LINE_RE, '');
  // Collapse any double-blank gaps the strip left behind.
  stripped = stripped.replace(/\n{3,}/g, '\n\n');

  if (!wasChecked) {
    return { body: stripped, changed: stripped !== src, action: 'stripped-unchecked' };
  }

  if (hasMarker) {
    return { body: stripped, changed: stripped !== src, action: 'stripped-marker-already-present' };
  }

  const ts = typeof now === 'function' ? now() : String(now);
  const trimmed = stripped.replace(/\s+$/, '');
  const withMarker = trimmed ? `${trimmed}\n\n${approvalMarker(ts)}\n` : `${approvalMarker(ts)}\n`;
  return { body: withMarker, changed: true, action: 'stripped-and-marker-added' };
}

async function fetchBody(issueNumber, repo) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: 15000 }
  );
  return stdout.replace(/\r\n/g, '\n');
}

async function writeBody(issueNumber, repo, body) {
  const tmp = path.join(tmpdir(), `aitm-migrate-plan-${process.pid}-${Date.now()}.md`);
  writeFileSync(tmp, body, 'utf8');
  try {
    await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp], {
      timeout: 15000,
    });
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

export async function runMigrate({ issueNumber, cfg, deps = {} } = {}) {
  if (!issueNumber) throw new Error('migrate-plan-approved: issueNumber is required');
  if (!cfg) throw new Error('migrate-plan-approved: cfg is required');
  const read =
    deps.fetchIssueBody || (async () => ({ body: await fetchBody(issueNumber, cfg.repo) }));
  const write = deps.writeIssueBody || (async ({ body }) => writeBody(issueNumber, cfg.repo, body));

  const { body } = await read({ issueNumber, repo: cfg.repo });
  const result = migratePlanApprovedBody(body);
  if (result.changed) {
    await write({ issueNumber, repo: cfg.repo, body: result.body });
  }
  return result;
}

const __dir = path.dirname(fileURLToPath(import.meta.url));
const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (_isMain) {
  const issueArg = process.argv[2];
  if (!issueArg || !/^#?\d+$/.test(issueArg)) {
    process.stderr.write('Usage: migrate-plan-approved.mjs <issue#>\n');
    process.exit(1);
  }
  const issueNumber = Number(issueArg.replace(/^#/, ''));
  const { loadConfig } = await import('./config.mjs');
  const cfg = loadConfig();
  try {
    const r = await runMigrate({ issueNumber, cfg });
    process.stdout.write(`#${issueNumber}: ${r.action}${r.changed ? ' (wrote)' : ''}\n`);
  } catch (err) {
    process.stderr.write(`migrate-plan-approved: ${err.message}\n`);
    process.exit(1);
  }
}

void __dir;
