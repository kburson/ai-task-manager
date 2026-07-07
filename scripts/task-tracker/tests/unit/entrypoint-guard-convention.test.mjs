// @story #723
// Proves lintEntrypointGuard (docs/guides/entrypoint-guard.md) against
// synthetic fixtures: a script that writes unconditionally at module scope,
// one whose `main()` — the actual write site — is invoked unconditionally,
// each accepted guard form, and a read-only script that needs no guard at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lintEntrypointGuard } from '../../lib/entrypoint-guard-lint.mjs';

test('violation: mutateIssueBody called directly at module scope, no guard', () => {
  const src = `
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';
await mutateIssueBody({ issueNumber: 1, repo: 'x/y', mutate: (b) => b });
`;
  const r = lintEntrypointGuard(src);
  assert.equal(r.hasWriteCapability, true);
  assert.equal(r.hasGuard, false);
  assert.equal(r.violation, true);
});

test('violation: main() performs the write, but main() is called unconditionally', () => {
  const src = `
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';
async function main() {
  await mutateIssueBody({ issueNumber: 1, repo: 'x/y', mutate: (b) => b });
}
main().catch((err) => { console.error(err); process.exit(1); });
`;
  const r = lintEntrypointGuard(src);
  assert.equal(r.violation, true);
});

test('compliant: import.meta.url === `file://${process.argv[1]}` guard form', () => {
  const src = `
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';
async function main() {
  await mutateIssueBody({ issueNumber: 1, repo: 'x/y', mutate: (b) => b });
}
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  await main();
}
`;
  const r = lintEntrypointGuard(src);
  assert.equal(r.hasWriteCapability, true);
  assert.equal(r.hasGuard, true);
  assert.equal(r.violation, false);
});

test('compliant: fileURLToPath-normalized guard form (_isMain)', () => {
  const src = `
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';
async function main() {
  await mutateIssueBody({ issueNumber: 1, repo: 'x/y', mutate: (b) => b });
}
const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();
if (_isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(\`x: \${err.stack || err.message}\\n\`);
    process.exit(1);
  });
}
`;
  const r = lintEntrypointGuard(src);
  assert.equal(r.hasGuard, true);
  assert.equal(r.violation, false);
});

test('compliant: read-only script (no write capability) needs no guard', () => {
  const src = `
import { execFileSync } from 'node:child_process';
function main() {
  const raw = execFileSync('gh', ['issue', 'view', '1', '--json', 'body']);
  process.stdout.write(raw);
}
main();
`;
  const r = lintEntrypointGuard(src);
  assert.equal(r.hasWriteCapability, false);
  assert.equal(r.violation, false);
});

test('violation: direct `gh issue edit --body` shell call at module scope', () => {
  const src = `
import { execFileSync } from 'node:child_process';
execFileSync('gh', ['issue', 'edit', '1', '--body', 'x']);
`;
  const r = lintEntrypointGuard(src);
  assert.equal(r.hasWriteCapability, true);
  assert.equal(r.violation, true);
});

console.log('entrypoint-guard-convention.test.mjs: ok');
