import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findTrailComment } from '../commit-trail-handler.mjs';
import { hasCanonicalCommitTrace } from './commit-trail.mjs';
import { auditEvidenceMarkers } from './evidence-markers.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from './process-timeouts.mjs';

const pexec = promisify(execFile);

async function defaultGitStatus({ projectDir }) {
  const { stdout } = await pexec('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: projectDir,
    timeout: GIT_TIMEOUT_MS,
  });
  return stdout;
}

async function defaultGitHeadSha({ projectDir }) {
  const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], {
    cwd: projectDir,
    timeout: GIT_TIMEOUT_MS,
  });
  return stdout.trim();
}

async function defaultGetIssueBody({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return stdout || '';
}

export async function runReviewPreflight({ issueNumber, repo, projectDir, deps = {} } = {}) {
  if (!issueNumber) throw new Error('review-preflight: issueNumber is required');
  if (!repo) throw new Error('review-preflight: repo is required');
  if (!projectDir) throw new Error('review-preflight: projectDir is required');

  const gitStatus = deps.gitStatus || (() => defaultGitStatus({ projectDir }));
  const gitHeadSha = deps.gitHeadSha || (() => defaultGitHeadSha({ projectDir }));
  const find = deps.findTrailComment || findTrailComment;
  const getIssueBody = deps.getIssueBody || (() => defaultGetIssueBody({ issueNumber, repo }));

  const reasons = [];
  const status = String(await gitStatus()).trim();
  if (status) {
    reasons.push('tracked worktree changes are uncommitted');
  }

  const headSha = String(await gitHeadSha()).trim();
  const comment = await find(String(issueNumber), repo);
  if (!comment?.body) {
    reasons.push(`missing canonical \`### 🔗 Commits\` comment containing current HEAD ${headSha}`);
  } else if (!hasCanonicalCommitTrace(comment.body, headSha)) {
    reasons.push(`canonical \`### 🔗 Commits\` comment does not contain current HEAD ${headSha}`);
  }

  const body = String(await getIssueBody());
  if (body.trim()) {
    const audit = auditEvidenceMarkers(body);
    for (const item of audit.missingEvidence) {
      reasons.push(
        `acceptance criterion "${item.label}" is missing \`aitm-verified-by\` automated evidence marker`
      );
    }
    for (const cmd of audit.missingVerificationCommands) {
      reasons.push(`evidence command missing from Verification Commands: ${cmd}`);
    }
  }

  return { ok: reasons.length === 0, reasons, headSha };
}
