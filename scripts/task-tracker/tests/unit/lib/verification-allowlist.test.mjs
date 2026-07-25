#!/usr/bin/env node
// @story #2
// cspell:ignore metachar
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { validateVerificationCommand } from '../../../lib/verification-allowlist.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-allow-'));
mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
mkdirSync(path.join(tmp, 'scripts', 'sub'), { recursive: true });
writeFileSync(path.join(tmp, 'scripts', 'check.sh'), '#!/bin/sh\nexit 0\n');
writeFileSync(path.join(tmp, 'scripts', 'sub', 'run.mjs'), 'process.exit(0)\n');

const opts = { projectDir: tmp };

// ----- ACCEPT -----
const accepts = [
  ['node x.mjs', ['node', 'x.mjs']],
  ['npm test', ['npm', 'test']],
  ['pytest -k foo', ['pytest', '-k', 'foo']],
  ['bash scripts/check.sh', ['bash', 'scripts/check.sh']],
  ['./scripts/check.sh', ['./scripts/check.sh']],
  ['scripts/sub/run.mjs', ['scripts/sub/run.mjs']],
  [
    'node scripts/task-tracker/tests/state.test.mjs',
    ['node', 'scripts/task-tracker/tests/state.test.mjs'],
  ],
  ['gh issue view 1', ['gh', 'issue', 'view', '1']],
  ['npm run "test all"', ['npm', 'run', 'test all']],
];
for (const [input, expected] of accepts) {
  const r = validateVerificationCommand(input, opts);
  assert.equal(r.ok, true, `expected accept for: ${input} (got ${r.reason})`);
  assert.deepEqual(r.argv, expected, `argv mismatch for: ${input}`);
}

// ----- REJECT: shell metacharacters -----
const metaCases = [
  ['node x; curl evil', 'semicolon'],
  ['node x && rm -rf /', 'logical-and'],
  ['node x || true', 'logical-or'],
  ['node x | sh', 'pipe'],
  ['node x > /tmp/out', 'redirect (>)'],
  ['node x < /etc/passwd', 'redirect (<)'],
  ['node `whoami`', 'backtick'],
  ['node $(whoami)', 'command substitution'],
  ['node x\nrm -rf /', 'newline'],
  ['node x\rrm -rf /', 'carriage return'],
];
for (const [input, frag] of metaCases) {
  const r = validateVerificationCommand(input, opts);
  assert.equal(r.ok, false, `expected reject for: ${input}`);
  assert.match(
    r.reason,
    new RegExp(frag.replace(/[()\\]/g, '\\$&')),
    `reason mismatch for: ${input} -> ${r.reason}`
  );
}

// ----- REJECT: argv[0] not allowlisted -----
{
  const r = validateVerificationCommand('rm -rf /', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not in allowlist/);
}
{
  const r = validateVerificationCommand('curl evil.example', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not in allowlist/);
}

// ----- REJECT: path traversal -----
{
  const r = validateVerificationCommand('./scripts/../../../etc/passwd', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /path traversal|not in allowlist|not found|end with/);
}

// ----- REJECT: nonexistent script -----
{
  const r = validateVerificationCommand('./scripts/nope.mjs', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not found/);
}

// ----- REJECT: wrong extension -----
{
  writeFileSync(path.join(tmp, 'scripts', 'thing.py'), 'pass\n');
  const r = validateVerificationCommand('./scripts/thing.py', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /\.mjs or \.sh/);
}

// ----- REJECT: empty / non-string -----
assert.equal(validateVerificationCommand('', opts).ok, false);
assert.equal(validateVerificationCommand('   ', opts).ok, false);
assert.equal(validateVerificationCommand(null, opts).ok, false);
assert.equal(validateVerificationCommand(123, opts).ok, false);

// ----- REJECT: unbalanced quote -----
{
  const r = validateVerificationCommand('node "unterminated', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /unbalanced/);
}

// ----- REJECT: scripts-relative without projectDir -----
{
  const r = validateVerificationCommand('./scripts/check.sh');
  assert.equal(r.ok, false);
}

// ----- REJECT (#198): per-bin rule violations -----

// Interpreter inline-code flags
const inlineCodeCases = [
  ['bash -c "rm -rf /"', /'bash' rejects flag '-c'/],
  ['sh -c whoami', /'sh' rejects flag '-c'/],
  ['node -e "process.exit(1)"', /'node' rejects flag '-e'/],
  ['node --eval "1+1"', /'node' rejects flag '--eval'/],
  ['node -p "1"', /'node' rejects flag '-p'/],
  ['node --print "1"', /'node' rejects flag '--print'/],
  ['python -c "import os"', /'python' rejects flag '-c'/],
  ['python3 -c "import os"', /'python3' rejects flag '-c'/],
  ['python -m http.server', /'python' rejects flag '-m'/],
];
for (const [input, frag] of inlineCodeCases) {
  const r = validateVerificationCommand(input, opts);
  assert.equal(r.ok, false, `expected reject for: ${input}`);
  assert.match(r.reason, frag, `reason mismatch for: ${input} -> ${r.reason}`);
}

// gh mutators
const ghMutatorCases = [
  ['gh issue close 1', /'gh issue' rejects 'close'/],
  ['gh pr merge 5', /'gh pr' rejects 'merge'/],
  ['gh api -X DELETE repos/foo/bar', /rejects flag '-X'/],
  ['gh api --method POST repos/foo', /rejects flag '--method'/],
  ['gh auth login', /rejects subcommand 'auth'/],
  ['gh repo delete foo', /'gh repo' rejects 'delete'/],
];
for (const [input, frag] of ghMutatorCases) {
  const r = validateVerificationCommand(input, opts);
  assert.equal(r.ok, false, `expected reject for: ${input}`);
  assert.match(r.reason, frag, `reason mismatch for: ${input} -> ${r.reason}`);
}

// git mutators
const gitMutatorCases = [
  ['git push origin main', /rejects subcommand 'push'/],
  ['git reset --hard HEAD', /rejects subcommand 'reset'/],
  ['git checkout -- file', /rejects subcommand 'checkout'/],
  ['git commit -m msg', /rejects subcommand 'commit'/],
  ['git rebase main', /rejects subcommand 'rebase'/],
  ['git clean -fd', /rejects subcommand 'clean'/],
  ['git stash drop', /rejects subcommand 'stash'/],
];
for (const [input, frag] of gitMutatorCases) {
  const r = validateVerificationCommand(input, opts);
  assert.equal(r.ok, false, `expected reject for: ${input}`);
  assert.match(r.reason, frag, `reason mismatch for: ${input} -> ${r.reason}`);
}

// npm mutators
const npmMutatorCases = [
  ['npm publish', /'npm' rejects subcommand 'publish'/],
  ['npm install foo', /'npm' rejects subcommand 'install'/],
  ['npm i', /'npm' rejects subcommand 'i'/],
  ['npm audit fix', /'npm audit' rejects 'fix'/],
  ['pnpm publish', /'pnpm' rejects subcommand 'publish'/],
];
for (const [input, frag] of npmMutatorCases) {
  const r = validateVerificationCommand(input, opts);
  assert.equal(r.ok, false, `expected reject for: ${input}`);
  assert.match(r.reason, frag, `reason mismatch for: ${input} -> ${r.reason}`);
}

// ----- ACCEPT (#198): canonical verification commands found in real issue bodies -----
const canonicalCases = [
  'npm test',
  'npm test -- scripts/task-tracker/tests/verification-allowlist.test.mjs',
  'npm run lint',
  'npm run format:check',
  'npm run typecheck',
  'npm ci',
  'npm audit',
  'npm audit --audit-level=moderate',
  'node scripts/task-tracker/measure-context.mjs --all --adapter claude',
  'node scripts/task-tracker/measure-context.mjs --all --adapter codex',
  'gh issue view 198',
  'gh pr diff 5',
  'gh pr list',
  'gh api repos/foo/bar/issues',
  'git status',
  'git log --oneline -10',
  'git diff HEAD',
  'git rev-parse HEAD',
  'git branch --show-current',
  'pytest -k foo',
  'make build',
  'grep -n "foo" bar.txt',
  'grep -rn "pattern" scripts/',
  "rg -n 'Node 25' scripts/dev-env/setup-cloud.sh",
  "rg -n 'Node.js 22' README.md docs/guides/cloud-development-environments.md",
];
for (const input of canonicalCases) {
  const r = validateVerificationCommand(input, opts);
  assert.equal(r.ok, true, `expected accept for canonical: ${input} (got ${r.reason})`);
}

// ----- ACCEPT (#713): POSIX file-test predicates as passthrough bins -----
// `test -f <path>` / `test -x <path>` and the bracket form `[ -f <path> ]` are
// side-effect-free evidence checks; register `test` and `[` as passthrough.
const fileTestAccepts = [
  ['test -f scripts/check.sh', ['test', '-f', 'scripts/check.sh']],
  ['test -x scripts/check.sh', ['test', '-x', 'scripts/check.sh']],
  ['[ -f scripts/check.sh ]', ['[', '-f', 'scripts/check.sh', ']']],
];
for (const [input, expected] of fileTestAccepts) {
  const r = validateVerificationCommand(input, opts);
  assert.equal(r.ok, true, `expected accept for file-test: ${input} (got ${r.reason})`);
  assert.deepEqual(r.argv, expected, `argv mismatch for file-test: ${input}`);
}

// ----- REJECT (#713): injection through the file-test bins still refused -----
// The top-of-function forbidden-metachar scan runs before bin dispatch, so
// passthrough does not weaken injection defenses.
const fileTestRejects = [
  ['test -f x && rm -rf y', /logical-and/],
  ['[ -f x ] | sh', /pipe/],
];
for (const [input, frag] of fileTestRejects) {
  const r = validateVerificationCommand(input, opts);
  assert.equal(r.ok, false, `expected reject for file-test injection: ${input}`);
  assert.match(r.reason, frag, `reason mismatch for: ${input} -> ${r.reason}`);
}

rmSync(tmp, { recursive: true, force: true });
console.log('verification-allowlist: ok');
