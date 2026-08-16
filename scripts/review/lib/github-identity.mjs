// @story #1268

import { execFileSync } from 'node:child_process';

export class GitHubIdentityError extends Error {
  constructor(detail, { cause, recoveryCommand } = {}) {
    const recovery = String(recoveryCommand || 'the same co-review command').trim();
    super(
      `co-review:github-identity:${detail}; no state changed; authenticate the configured gh CLI, then rerun: ${recovery}`,
      cause ? { cause } : undefined
    );
    this.name = 'GitHubIdentityError';
    this.code = 'github-identity';
    this.exitCode = 1;
  }
}

export function resolveGitHubLogin({
  cwd = process.cwd(),
  execFileSyncImpl = execFileSync,
  recoveryCommand,
} = {}) {
  let output;
  try {
    output = execFileSyncImpl('gh', ['api', 'user', '--jq', '.login'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
  } catch (cause) {
    throw new GitHubIdentityError(cause?.message || 'authenticated login unavailable', {
      cause,
      recoveryCommand,
    });
  }
  const login = String(output ?? '').trim();
  if (!login) {
    throw new GitHubIdentityError('gh api user returned a blank login', { recoveryCommand });
  }
  return login;
}
