#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SHA256_RE = /^[a-f0-9]{64}$/;
const EXPECTED_SIGNER_KEY_MATERIAL =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHWi13X884S5FApYT7CnAWf7xSbkGGAj97r+pf0/kgFU';
const EXPECTED_SIGNER_FINGERPRINT =
  'SHA256:5coWixpZ2nPevuuMFWsJkk7oc3UN8zybVaMpA12HNPI';
const EXPECTED_SOURCE_REPOSITORY = 'https://github.com/kburson/ai-task-manager';
const EXPECTED_SOURCE_COMMIT = '4b3bcd43cba141a611da4a2b861433b915462806';
const EXPECTED_FILTERED_HISTORY_TIP = 'bfc6f9ffabd8281a815c7bd0e0824f3bacb84d9d';
const EXPECTED_GITLEAKS_CONFIG_DIGEST =
  'ab56fb547630cfb512636b4c70d57f708e3076165a8dc5dfe7d42e7a84df06d6';
const EXPECTED_GITLEAKS_REPORT_DIGEST =
  '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570';
const EXPECTED_RETAINED_PATH_RULES = Object.freeze({
  prefixes: ['scripts/review', 'scripts/providers'],
  globs: [
    'scripts/tests/**/*co-review*',
    'docs/superpowers/specs/*co-review*',
    'docs/superpowers/plans/*co-review*',
  ],
  exact: ['LICENSE', 'NOTICE', 'LICENSE-COMMERCIAL'],
});
const EXPECTED_STANDALONE_PATH_RULES = Object.freeze({
  prefixes: [
    '.agents/skills/task',
    '.ai-task-manager',
    '.claude/skills/task',
    '.grok/skills/task',
    '.github/workflows',
    '.codex',
    'bin',
    'docs/design',
    'docs/plans',
    'docs/peer-reviews',
    'docs/releases',
    'docs/whitepapers',
    'provenance',
    'schemas',
    'skills/peer-review',
    'src',
    'templates',
    'test',
  ],
  exact: [
    '.ai-peer-review.json',
    '.claude/commands/task.md',
    '.claude/settings.json',
    '.github/CODEOWNERS',
    '.github/ISSUE_TEMPLATE/bug.yml',
    '.github/ISSUE_TEMPLATE/task.yml',
    '.gitattributes',
    '.gitignore',
    '.gitleaks.toml',
    '.grok/hooks/aitm.json',
    '.markdownlint-cli2.jsonc',
    '.npmrc',
    '.nvmrc',
    '.prettierignore',
    '.prettierrc.json',
    'AGENTS.md',
    'CONTRIBUTING.md',
    'LICENSE',
    'NOTICE',
    'README.md',
    'cspell.json',
    'docs/dependency-audit-mcp.md',
    'docs/manual-cross-provider-peer-review.md',
    'docs/spdx-policy.md',
    'eslint.config.mjs',
    'package-lock.json',
    'package.json',
    'scripts/run-secret-scan.mjs',
    'scripts/verify-extraction.mjs',
    'scripts/verify-release.mjs',
    'vendors/kburson-ai-task-manager-1.0.0.tgz',
  ],
});
const EXPECTED_LEGACY_PATH_RULES = Object.freeze({
  prefixes: ['scripts/review', 'scripts/providers'],
  globs: [
    'scripts/tests/**/*co-review*',
    'docs/superpowers/specs/*co-review*',
    'docs/superpowers/plans/*co-review*',
  ],
});
const EXPECTED_DESIGN_SOURCE = Object.freeze({
  repository: EXPECTED_SOURCE_REPOSITORY,
  commit: 'e7a586653bbc0adc79dd36e47915c81f3ed82bc0',
  path: 'docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md',
  digest: '9501a2568be49ab886961b7711dee0707bbc322e1ae89482e7a93660d09a4ea5',
});
const AUTHORIZATION_STATEMENT =
  'I, Kendrick Burson, as copyright holder, approve relicensing the extracted ai-peer-review code covered by AITM source commit 4b3bcd43cba141a611da4a2b861433b915462806 under Apache-2.0, accept the proprietary-fork consequence, and authorize use of my existing SSH Ed25519 key to sign the declaration and proceed with public publication.';

export const EXPECTED_HOLDER_IDENTITIES = Object.freeze([
  'kendrick burson <kpburson@pm.me>',
  'Kendrick Burson <spam.kpb@gmail.com>',
]);

function isPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesClosedGlob(pathname, pattern) {
  if (pattern === 'scripts/tests/**/*co-review*') {
    return pathname.startsWith('scripts/tests/') && pathname.slice('scripts/tests/'.length).includes('co-review');
  }
  for (const kind of ['specs', 'plans']) {
    if (pattern === `docs/superpowers/${kind}/*co-review*`) {
      const prefix = `docs/superpowers/${kind}/`;
      const remainder = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
      return remainder !== '' && !remainder.includes('/') && remainder.includes('co-review');
    }
  }
  throw new TypeError(`unsupported retained glob: ${pattern}`);
}

export function matchesRetainedRule(pathname, rules) {
  return (
    rules.exact.includes(pathname) ||
    rules.prefixes.some((prefix) => isPrefix(pathname, prefix)) ||
    rules.globs.some((glob) => matchesClosedGlob(pathname, glob))
  );
}

function matchesLegacyRule(pathname, rules) {
  return (
    rules.prefixes.some((prefix) => isPrefix(pathname, prefix)) ||
    rules.globs.some((glob) => matchesClosedGlob(pathname, glob))
  );
}

export function assertStandaloneLayout(currentPaths, {
  standaloneRules,
  legacyRules,
  requireLegacyRemoved = false,
}) {
  const paths = String(currentPaths).split('\n').filter(Boolean);
  const legacy = paths.filter((pathname) => matchesLegacyRule(pathname, legacyRules));
  if (requireLegacyRemoved && legacy.length) {
    throw new Error(`legacy retained paths: ${legacy.join(', ')}`);
  }
  const foreign = paths.filter(
    (pathname) =>
      !standaloneRules.exact.includes(pathname) &&
      !standaloneRules.prefixes.some((prefix) => isPrefix(pathname, prefix)) &&
      !(legacy.length && matchesLegacyRule(pathname, legacyRules))
  );
  if (foreign.length) throw new Error(`foreign standalone paths: ${foreign.join(', ')}`);
}

function assertDigest(value, label) {
  if (!SHA256_RE.test(value ?? '')) throw new Error(`${label} must be a SHA-256 digest`);
}

function digestLines(values) {
  return createHash('sha256').update(`${values.join('\n')}\n`).digest('hex');
}

function signerKeyIdentity(publicKey) {
  const [type, encoded] = String(publicKey ?? '').trim().split(/\s+/);
  if (type !== 'ssh-ed25519' || !encoded) {
    throw new Error('signer public key must be an SSH Ed25519 public key');
  }
  const keyBytes = Buffer.from(encoded, 'base64');
  if (keyBytes.length === 0 || keyBytes.toString('base64') !== encoded) {
    throw new Error('signer public key must contain canonical base64 key material');
  }
  return {
    material: `${type} ${encoded}`,
    fingerprint: `SHA256:${createHash('sha256')
      .update(keyBytes)
      .digest('base64')
      .replace(/=+$/, '')}`,
  };
}

export function canonicalRelicensingPayload(declaration) {
  assert.equal(
    declaration.schema,
    'ai-peer-review.relicensing-declaration/v1',
    'relicensing declaration schema'
  );
  assert.equal(declaration.copyright_holder, 'Kendrick Burson', 'copyright holder');
  assert.equal(
    declaration.covered_source_repository,
    'https://github.com/kburson/ai-task-manager',
    'covered source repository'
  );
  assert.equal(
    declaration.covered_source_commit,
    '4b3bcd43cba141a611da4a2b861433b915462806',
    'covered source commit'
  );
  assert.equal(declaration.license_grant, 'Apache-2.0', 'license grant');
  assert.equal(
    declaration.proprietary_fork_consequence_accepted,
    true,
    'proprietary fork consequence acceptance'
  );
  assert.equal(declaration.authorization_statement, AUTHORIZATION_STATEMENT, 'authorization statement');
  assert.equal(declaration.signature_type, 'ssh-ed25519', 'signature type');
  assert.equal(
    declaration.signature_namespace,
    'ai-peer-review-relicensing',
    'signature namespace'
  );
  assert.equal(declaration.signer_identity, 'copyright-holder', 'signer identity');
  const signer = signerKeyIdentity(declaration.signer_public_key);
  if (!/^SHA256:[A-Za-z0-9+/]+$/.test(declaration.signer_fingerprint ?? '')) {
    throw new Error('signer fingerprint must be an SSH SHA-256 fingerprint');
  }
  if (
    signer.material !== EXPECTED_SIGNER_KEY_MATERIAL ||
    signer.fingerprint !== EXPECTED_SIGNER_FINGERPRINT ||
    declaration.signer_fingerprint !== EXPECTED_SIGNER_FINGERPRINT
  ) {
    throw new Error('relicensing declaration does not match the authorized signer');
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(declaration.signed_at ?? '') ||
    Number.isNaN(Date.parse(declaration.signed_at))
  ) {
    throw new Error('signed at must be an ISO-8601 timestamp');
  }

  const payload = {
    schema: declaration.schema,
    copyright_holder: declaration.copyright_holder,
    covered_source_repository: declaration.covered_source_repository,
    covered_source_commit: declaration.covered_source_commit,
    license_grant: declaration.license_grant,
    proprietary_fork_consequence_accepted: declaration.proprietary_fork_consequence_accepted,
    authorization_statement: declaration.authorization_statement,
    signature_type: declaration.signature_type,
    signature_namespace: declaration.signature_namespace,
    signer_identity: declaration.signer_identity,
    signer_public_key: declaration.signer_public_key,
    signer_fingerprint: declaration.signer_fingerprint,
    signed_at: declaration.signed_at,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function runSshVerify({
  identity,
  namespace,
  publicKey,
  signature,
  payload,
  scratchRoot,
}) {
  const scratchParent = path.join(scratchRoot, '.scratch', 'peer-review');
  await mkdir(scratchParent, { recursive: true });
  const tempRoot = await mkdtemp(path.join(scratchParent, 'signature-'));
  const allowedSignersPath = path.join(tempRoot, 'allowed_signers');
  const signaturePath = path.join(tempRoot, 'declaration.sig');
  try {
    await writeFile(allowedSignersPath, `${identity} ${publicKey}\n`, { mode: 0o600 });
    await writeFile(signaturePath, signature, { mode: 0o600 });
    await new Promise((resolve, reject) => {
      const child = spawn(
        'ssh-keygen',
        [
          '-Y',
          'verify',
          '-f',
          allowedSignersPath,
          '-I',
          identity,
          '-n',
          namespace,
          '-s',
          signaturePath,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.once('error', reject);
      child.once('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`SSH signature verification failed: ${stderr || stdout}`.trim()));
      });
      child.stdin.end(payload);
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function verifyRelicensingDeclaration({
  root = process.cwd(),
  declarationBytes,
  runSshVerify: verifySignature = runSshVerify,
}) {
  const declaration = JSON.parse(Buffer.from(declarationBytes).toString('utf8'));
  const payload = canonicalRelicensingPayload(declaration);
  if (
    typeof declaration.signature !== 'string' ||
    !declaration.signature.startsWith('-----BEGIN SSH SIGNATURE-----\n') ||
    !declaration.signature.endsWith('-----END SSH SIGNATURE-----\n')
  ) {
    throw new Error('signature must be an armored SSH signature');
  }
  await verifySignature({
    identity: declaration.signer_identity,
    namespace: declaration.signature_namespace,
    publicKey: declaration.signer_public_key,
    signature: declaration.signature,
    payload,
    scratchRoot: root,
  });
  return createHash('sha256').update(declarationBytes).digest('hex');
}

function validateManifest(manifest) {
  assert.equal(manifest.schema, 'ai-peer-review.extraction/v1', 'extraction manifest schema');
  assert.equal(manifest.source_repository, EXPECTED_SOURCE_REPOSITORY, 'source repository');
  assert.equal(manifest.source_commit, EXPECTED_SOURCE_COMMIT, 'source commit');
  assert.equal(
    manifest.filtered_history_tip,
    EXPECTED_FILTERED_HISTORY_TIP,
    'filtered history tip'
  );
  assert.deepEqual(
    manifest.retained_path_rules,
    EXPECTED_RETAINED_PATH_RULES,
    'retained path rules'
  );
  assert.deepEqual(
    manifest.standalone_path_rules,
    EXPECTED_STANDALONE_PATH_RULES,
    'standalone path rules'
  );
  assert.deepEqual(
    manifest.legacy_retained_path_rules,
    EXPECTED_LEGACY_PATH_RULES,
    'legacy retained path rules'
  );
  if (
    !Array.isArray(manifest.prefilter_ref_inventory) ||
    manifest.prefilter_ref_inventory.length !== 1 ||
    manifest.prefilter_ref_inventory[0]?.ref !== 'refs/heads/extraction-source' ||
    manifest.prefilter_ref_inventory[0]?.object !== manifest.source_commit
  ) {
    throw new Error('prefilter ref inventory must contain only the ratified source ref');
  }
  if (
    !Array.isArray(manifest.retained_path_inventory?.paths) ||
    manifest.retained_path_inventory.paths.length === 0
  ) {
    throw new Error('retained path inventory must be non-empty');
  }
  assertDigest(manifest.retained_path_inventory.digest, 'retained path inventory digest');
  assert.equal(
    manifest.retained_path_inventory.digest,
    digestLines(manifest.retained_path_inventory.paths),
    'retained path inventory digest'
  );
  if (
    !Array.isArray(manifest.contributor_audit?.normalized_result) ||
    JSON.stringify(manifest.contributor_audit.normalized_result) !==
      JSON.stringify(EXPECTED_HOLDER_IDENTITIES)
  ) {
    throw new Error('contributor audit does not match expected holder identities');
  }
  assertDigest(manifest.contributor_audit.digest, 'contributor audit digest');
  assert.equal(
    manifest.contributor_audit.digest,
    digestLines(manifest.contributor_audit.normalized_result),
    'contributor audit digest'
  );
  if (manifest.secret_scan?.tool !== 'gitleaks') throw new Error('secret scan tool must be gitleaks');
  if (!/^\d+\.\d+\.\d+/.test(manifest.secret_scan?.tool_version ?? '')) {
    throw new Error('secret scan version is missing or malformed');
  }
  if (manifest.secret_scan?.result !== 'pass') throw new Error('secret scan result must be pass');
  assertDigest(manifest.secret_scan.config_digest, 'secret scan config digest');
  assertDigest(manifest.secret_scan.report_digest, 'secret scan report digest');
  assert.equal(
    manifest.secret_scan.config_digest,
    EXPECTED_GITLEAKS_CONFIG_DIGEST,
    'secret scan config digest'
  );
  assert.equal(
    manifest.secret_scan.report_digest,
    EXPECTED_GITLEAKS_REPORT_DIGEST,
    'secret scan report digest'
  );
  assert.equal(manifest.secret_scan.scanned_ref, manifest.filtered_history_tip, 'secret scan ref');
  assert.deepEqual(manifest.design_source, EXPECTED_DESIGN_SOURCE, 'design source');
  assertDigest(manifest.relicensing_declaration_digest, 'relicensing declaration digest');
}

export async function verifyExtraction({
  root,
  manifest,
  runGit,
  requireLegacyRemoved = false,
}) {
  validateManifest(manifest);
  await runGit(root, ['fsck', '--full', '--no-reflogs', '--unreachable']);
  const descendants = await runGit(root, [
    'rev-list',
    '--reverse',
    '--ancestry-path',
    `${manifest.filtered_history_tip}..HEAD`,
  ]);
  const bootstrapCommit = descendants.split('\n').find(Boolean);
  if (!bootstrapCommit) throw new Error('standalone bootstrap commit is missing');
  const bootstrapLine = await runGit(root, [
    'rev-list',
    '--parents',
    '-n',
    '1',
    bootstrapCommit,
  ]);
  const [, bootstrapParent] = bootstrapLine.trim().split(/\s+/);
  if (bootstrapParent !== manifest.filtered_history_tip) {
    throw new Error('standalone bootstrap parent does not match filtered history tip');
  }
  const paths = await runGit(root, [
    'log',
    manifest.filtered_history_tip,
    '--name-only',
    '--format=',
  ]);
  const retainedPaths = [...new Set(paths.split('\n').filter(Boolean))].sort();
  const foreign = retainedPaths.filter(
    (file) => !matchesRetainedRule(file, manifest.retained_path_rules)
  );
  if (foreign.length) throw new Error(`foreign retained paths: ${foreign.join(', ')}`);
  const filteredTipPaths = await runGit(root, [
    'ls-tree',
    '-r',
    '--name-only',
    manifest.filtered_history_tip,
  ]);
  const observedInventory = filteredTipPaths
    .split('\n')
    .filter(Boolean)
    .filter((file) => matchesRetainedRule(file, manifest.retained_path_rules))
    .sort();
  assert.deepEqual(
    observedInventory,
    manifest.retained_path_inventory.paths,
    'retained path inventory'
  );
  const currentPaths = await runGit(root, ['ls-tree', '-r', '--name-only', 'HEAD']);
  assertStandaloneLayout(currentPaths, {
    standaloneRules: manifest.standalone_path_rules,
    legacyRules: manifest.legacy_retained_path_rules,
    requireLegacyRemoved,
  });
  return Object.freeze({
    sourceCommit: manifest.source_commit,
    filteredTip: manifest.filtered_history_tip,
  });
}

async function runGit(root, args) {
  const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--require-legacy-removed') || args.length > 1) {
    throw new Error('usage: node scripts/verify-extraction.mjs [--require-legacy-removed]');
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(
    await readFile(path.join(root, 'provenance/extraction-manifest.json'), 'utf8')
  );
  const declarationBytes = await readFile(
    path.join(root, 'provenance/relicensing-declaration.json')
  );
  const declarationDigest = await verifyRelicensingDeclaration({ root, declarationBytes });
  if (declarationDigest !== manifest.relicensing_declaration_digest) {
    throw new Error('relicensing declaration digest does not match manifest');
  }
  const configDigest = createHash('sha256')
    .update(await readFile(path.join(root, '.gitleaks.toml')))
    .digest('hex');
  if (configDigest !== manifest.secret_scan.config_digest) {
    throw new Error('Gitleaks configuration digest does not match manifest');
  }
  const designDigest = createHash('sha256')
    .update(
      await readFile(
        path.join(root, 'docs/design/2026-09-07-ai-peer-review-extraction-design.md')
      )
    )
    .digest('hex');
  if (designDigest !== manifest.design_source.digest) {
    throw new Error('design artifact digest does not match manifest');
  }
  const result = await verifyExtraction({
    root,
    manifest,
    runGit,
    requireLegacyRemoved: args[0] === '--require-legacy-removed',
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
