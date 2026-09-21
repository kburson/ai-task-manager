#!/usr/bin/env node
// @story #93 #1219 #1719
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(__dir, '../../../..');
const IMMUTABLE_REVIEW_ARCHIVE =
  'docs/superpowers/reviews/1381/plan/2026-08-23-1381-governed-delivery-convergence-r3-reviewer-claude-review.md';
const IMMUTABLE_REVIEW_SHA256 = 'dd6b5bd49b1f8f01aacb9ce0cc278b758c598b64a2d2bb74afd45d9925a19a86';
const IMMUTABLE_REVIEW_DIRECTORY = 'docs/superpowers/reviews/';
const PEER_REVIEW_DIRECTORY = 'docs/peer-reviews/';
const PEER_REVIEW_GLOB = 'docs/peer-reviews/**';
const REVIEWER_IGNORE_GLOB = 'docs/superpowers/reviews/**/*-reviewer-*-review.md';
const PEER_REVIEW_RESPONSE_IGNORE_GLOBS = [
  'docs/superpowers/reviews/**/*-review-*-author-response-*.md',
  'docs/superpowers/reviews/**/*-review-*-reviewer-response-*.md',
  'docs/superpowers/reviews/**/review-*-author-response-*.md',
  'docs/superpowers/reviews/**/review-*-reviewer-response-*.md',
  'docs/superpowers/reviews/**/*-xpr-author-response-r[0-9]*.md',
  'docs/superpowers/reviews/**/*-xpr-reviewer-response-r[0-9]*.md',
];

const requiredFiles = [
  '.prettierrc.json',
  '.prettierignore',
  'eslint.config.mjs',
  '.markdownlint-cli2.jsonc',
  '.markdownlintignore',
  'cspell.json',
  'cspell-dictionary.txt',
];

for (const rel of requiredFiles) {
  assert.ok(existsSync(path.join(repoRoot, rel)), `${rel} must exist`);
}

const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const requiredScripts = [
  'format',
  'format:check',
  'lint:js',
  'lint:md',
  'lint:spell',
  'lint',
  'quality',
];
for (const s of requiredScripts) {
  assert.ok(pkg.scripts?.[s], `package.json script "${s}" must be defined`);
}

assert.match(pkg.scripts.quality, /format:check/, 'quality must run format:check');
assert.match(pkg.scripts.quality, /lint/, 'quality must run lint');
assert.match(pkg.scripts.quality, /test/, 'quality must run test');
assert.match(pkg.scripts.lint, /lint:js/, 'lint must include lint:js');
assert.match(pkg.scripts.lint, /lint:md/, 'lint must include lint:md');
assert.match(pkg.scripts.lint, /lint:spell/, 'lint must include lint:spell');

const requiredDevDeps = ['eslint', 'prettier', 'markdownlint-cli2', 'cspell', 'globals'];
for (const d of requiredDevDeps) {
  assert.ok(pkg.devDependencies?.[d], `devDependency "${d}" must be declared`);
}

const cspell = JSON.parse(readFileSync(path.join(repoRoot, 'cspell.json'), 'utf8'));
assert.ok(Array.isArray(cspell.dictionaryDefinitions), 'cspell.json must define dictionaries');
assert.ok(
  cspell.dictionaryDefinitions.some((d) => d.path === './cspell-dictionary.txt'),
  'project dictionary must point at ./cspell-dictionary.txt'
);

const sharedIgnores = ['node_modules', 'tmp', '.worktrees', '.claude/worktrees'];
const eslintCfg = readFileSync(path.join(repoRoot, 'eslint.config.mjs'), 'utf8');
const mdCfg = readFileSync(path.join(repoRoot, '.markdownlint-cli2.jsonc'), 'utf8');
for (const ig of sharedIgnores) {
  assert.match(eslintCfg, new RegExp(ig.replace(/\./g, '\\.')), `eslint must ignore ${ig}`);
  assert.match(mdCfg, new RegExp(ig.replace(/\./g, '\\.')), `markdownlint must ignore ${ig}`);
  assert.ok(
    (cspell.ignorePaths || []).some((p) => p.includes(ig)),
    `cspell must ignore ${ig}`
  );
}

const markdownlintConfig = JSON.parse(mdCfg);
const prettierIgnore = readFileSync(path.join(repoRoot, '.prettierignore'), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean);
assert.ok(
  !markdownlintConfig.ignores.includes(IMMUTABLE_REVIEW_ARCHIVE),
  'markdownlint must not require an exact immutable #1381 reviewer exception'
);
assert.ok(
  prettierIgnore.includes(IMMUTABLE_REVIEW_DIRECTORY),
  'Prettier must preserve every immutable governed review archive'
);
assert.ok(
  prettierIgnore.includes(PEER_REVIEW_DIRECTORY),
  'Prettier must preserve integrity-bound peer-review collateral'
);
assert.ok(
  markdownlintConfig.ignores.includes(PEER_REVIEW_GLOB),
  'markdownlint must preserve integrity-bound peer-review collateral'
);
assert.ok(
  cspell.ignorePaths.includes(PEER_REVIEW_GLOB),
  'cspell must preserve integrity-bound peer-review collateral'
);
assert.ok(
  !markdownlintConfig.ignores.includes('docs/superpowers/reviews/**'),
  'markdownlint must not exempt the governed review archive broadly'
);
assert.deepEqual(
  markdownlintConfig.ignores.filter(
    (entry) => entry.includes('/reviews/') && entry.includes('-reviewer-')
  ),
  [
    REVIEWER_IGNORE_GLOB,
    ...PEER_REVIEW_RESPONSE_IGNORE_GLOBS.filter((glob) => glob.includes('-reviewer-')),
  ],
  'markdownlint must use canonical role and sealed-response globs, never exact reviewer files'
);
assert.deepEqual(
  markdownlintConfig.ignores.filter(
    (entry) => entry.includes('/reviews/') && entry.includes('-response-')
  ),
  PEER_REVIEW_RESPONSE_IGNORE_GLOBS,
  'markdownlint must exempt only the canonical sealed-response filename grammar'
);
for (const responseGlob of PEER_REVIEW_RESPONSE_IGNORE_GLOBS) {
  assert.ok(
    cspell.ignorePaths.includes(responseGlob),
    `cspell must preserve sealed response bytes matching ${responseGlob}`
  );
}
assert.ok(
  !prettierIgnore.includes('docs/superpowers/reviews/**'),
  'Prettier must use the canonical review-directory ignore instead of a redundant glob'
);
for (const filename of [
  '1719/spec/xpr/1719-xpr-restart/review-abc-author-response-1.md',
  '1719/spec/xpr/1719-xpr-restart/review-abc-reviewer-response-2.md',
  '1719/spec/1719-xpr-author-response-r1.md',
  '1719/spec/1719-xpr-reviewer-response-r12.md',
]) {
  assert.ok(
    PEER_REVIEW_RESPONSE_IGNORE_GLOBS.some((glob) =>
      path.matchesGlob(`${IMMUTABLE_REVIEW_DIRECTORY}${filename}`, glob)
    ),
    `sealed response must be preserved: ${filename}`
  );
}
for (const filename of [
  '1719/spec/1719-xpr-completion.md',
  '1719/spec/1719-xpr-recovery-status.md',
  '1719/spec/sar-response-r1.md',
  '1719/spec/review-abc-review-manifest.md',
  '1719/spec/1719-xpr-reviewer-response-notes.md',
]) {
  assert.ok(
    !PEER_REVIEW_RESPONSE_IGNORE_GLOBS.some((glob) =>
      path.matchesGlob(`${IMMUTABLE_REVIEW_DIRECTORY}${filename}`, glob)
    ),
    `ordinary review documentation must still be linted: ${filename}`
  );
}
const immutableReviewBytes = readFileSync(path.join(repoRoot, IMMUTABLE_REVIEW_ARCHIVE));
assert.equal(
  createHash('sha256').update(immutableReviewBytes).digest('hex'),
  IMMUTABLE_REVIEW_SHA256,
  'the accepted reviewer archive must remain byte-identical'
);

const dict = readFileSync(path.join(repoRoot, 'cspell-dictionary.txt'), 'utf8')
  .split('\n')
  .filter((l) => l.trim().length > 0);
const seen = new Set();
for (const word of dict) {
  assert.ok(!seen.has(word), `cspell-dictionary.txt has duplicate: ${word}`);
  seen.add(word);
}

console.log(`ok — ${requiredFiles.length} files, ${requiredScripts.length} scripts verified`);
