import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  canonicalRelicensingPayload,
  EXPECTED_HOLDER_IDENTITIES,
  verifyRelicensingDeclaration,
  verifyExtraction,
} from '../../scripts/verify-extraction.mjs';
import {
  buildSecretScanRecord,
  redactGitleaksReport,
} from '../../scripts/run-secret-scan.mjs';

const SHA = 'a'.repeat(64);
const AUTHORIZED_PUBLIC_KEY =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHWi13X884S5FApYT7CnAWf7xSbkGGAj97r+pf0/kgFU kpburson@pm.me';
const AUTHORIZED_FINGERPRINT = 'SHA256:5coWixpZ2nPevuuMFWsJkk7oc3UN8zybVaMpA12HNPI';

function linesDigest(lines) {
  return createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex');
}

function validDeclaration(overrides = {}) {
  return {
    schema: 'ai-peer-review.relicensing-declaration/v1',
    copyright_holder: 'Kendrick Burson',
    covered_source_repository: 'https://github.com/kburson/ai-task-manager',
    covered_source_commit: '4b3bcd43cba141a611da4a2b861433b915462806',
    license_grant: 'Apache-2.0',
    proprietary_fork_consequence_accepted: true,
    authorization_statement:
      'I, Kendrick Burson, as copyright holder, approve relicensing the extracted ai-peer-review code covered by AITM source commit 4b3bcd43cba141a611da4a2b861433b915462806 under Apache-2.0, accept the proprietary-fork consequence, and authorize use of my existing SSH Ed25519 key to sign the declaration and proceed with public publication.',
    signature_type: 'ssh-ed25519',
    signature_namespace: 'ai-peer-review-relicensing',
    signer_identity: 'copyright-holder',
    signer_public_key: AUTHORIZED_PUBLIC_KEY,
    signer_fingerprint: AUTHORIZED_FINGERPRINT,
    signed_at: '2026-09-08T12:00:00Z',
    signature: '-----BEGIN SSH SIGNATURE-----\ntest\n-----END SSH SIGNATURE-----\n',
    ...overrides,
  };
}

function validManifest(overrides = {}) {
  const manifest = {
    schema: 'ai-peer-review.extraction/v1',
    source_repository: 'https://github.com/kburson/ai-task-manager',
    source_commit: '4b3bcd43cba141a611da4a2b861433b915462806',
    filtered_history_tip: 'bfc6f9ffabd8281a815c7bd0e0824f3bacb84d9d',
    prefilter_ref_inventory: [
      {
        ref: 'refs/heads/extraction-source',
        object: '4b3bcd43cba141a611da4a2b861433b915462806',
      },
    ],
    retained_path_rules: {
      prefixes: ['scripts/review', 'scripts/providers'],
      globs: [
        'scripts/tests/**/*co-review*',
        'docs/superpowers/specs/*co-review*',
        'docs/superpowers/plans/*co-review*',
      ],
      exact: ['LICENSE', 'NOTICE', 'LICENSE-COMMERCIAL'],
    },
    standalone_path_rules: {
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
    },
    legacy_retained_path_rules: {
      prefixes: ['scripts/review', 'scripts/providers'],
      globs: [
        'scripts/tests/**/*co-review*',
        'docs/superpowers/specs/*co-review*',
        'docs/superpowers/plans/*co-review*',
      ],
    },
    retained_path_inventory: {
      paths: ['LICENSE', 'scripts/review/co-review.mjs'],
      digest: null,
    },
    contributor_audit: {
      command_argv: ['git', 'log'],
      normalizer: 'LC_ALL=C sort -fu',
      normalized_result: [...EXPECTED_HOLDER_IDENTITIES],
      digest: null,
    },
    secret_scan: {
      tool: 'gitleaks',
      tool_version: '8.30.1',
      config_digest: 'ab56fb547630cfb512636b4c70d57f708e3076165a8dc5dfe7d42e7a84df06d6',
      scanned_ref: 'bfc6f9ffabd8281a815c7bd0e0824f3bacb84d9d',
      report_digest: '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
      result: 'pass',
    },
    relicensing_declaration_digest: SHA,
    design_source: {
      repository: 'https://github.com/kburson/ai-task-manager',
      commit: 'e7a586653bbc0adc79dd36e47915c81f3ed82bc0',
      path: 'docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md',
      digest: '9501a2568be49ab886961b7711dee0707bbc322e1ae89482e7a93660d09a4ea5',
    },
  };
  manifest.retained_path_inventory.digest = linesDigest(manifest.retained_path_inventory.paths);
  manifest.contributor_audit.digest = linesDigest(manifest.contributor_audit.normalized_result);
  return { ...manifest, ...overrides };
}

function fakeGit({
  history = 'scripts/review/co-review.mjs\nLICENSE\n',
  current,
  inventory = 'LICENSE\nscripts/review/co-review.mjs\n',
  integrityError = null,
  bootstrapParent = 'bfc6f9ffabd8281a815c7bd0e0824f3bacb84d9d',
} = {}) {
  const currentPaths =
    current ??
    [
      '.gitleaks.toml',
      'LICENSE',
      'NOTICE',
      'README.md',
      'scripts/verify-extraction.mjs',
      'scripts/review/co-review.mjs',
      'test/unit/verify-extraction.test.mjs',
    ].join('\n');
  return async (_root, args) => {
    if (args[0] === 'fsck') {
      if (integrityError) throw new Error(integrityError);
      return '';
    }
    if (args[0] === 'rev-list' && args.includes('--reverse')) return `${'c'.repeat(40)}\n`;
    if (args[0] === 'rev-list' && args.includes('--parents')) {
      return `${'c'.repeat(40)} ${bootstrapParent}\n`;
    }
    if (args[0] === 'log') return history;
    if (args[0] === 'ls-tree' && args.at(-1) !== 'HEAD') return inventory;
    if (args[0] === 'ls-tree') return `${currentPaths}\n`;
    throw new Error(`unexpected git argv: ${args.join(' ')}`);
  };
}

test('accepts the exact filtered boundary before legacy parity removal', async () => {
  const result = await verifyExtraction({
    root: '/repo',
    manifest: validManifest(),
    runGit: fakeGit(),
  });
  assert.deepEqual(result, {
    sourceCommit: '4b3bcd43cba141a611da4a2b861433b915462806',
    filteredTip: 'bfc6f9ffabd8281a815c7bd0e0824f3bacb84d9d',
  });
});

test('canonical relicensing payload excludes only the detached signature', () => {
  const declaration = validDeclaration();
  const payload = canonicalRelicensingPayload(declaration);
  assert.equal(payload.includes('"signature"'), false);
  assert.equal(payload.includes(declaration.authorization_statement), true);
  assert.equal(payload.endsWith('\n'), true);
});

test('verifies the signed relicensing declaration through an injected SSH verifier', async () => {
  const declaration = validDeclaration();
  const declarationBytes = Buffer.from(`${JSON.stringify(declaration, null, 2)}\n`);
  let invocation;
  const digest = await verifyRelicensingDeclaration({
    root: '/repo',
    declarationBytes,
    runSshVerify: async (details) => {
      invocation = details;
    },
  });
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(invocation.identity, 'copyright-holder');
  assert.equal(invocation.namespace, 'ai-peer-review-relicensing');
  assert.equal(invocation.scratchRoot, '/repo');
  assert.equal(invocation.signature, declaration.signature);
  assert.equal(invocation.payload, canonicalRelicensingPayload(declaration));
});

test('rejects a substitute signing key before invoking the SSH verifier', async () => {
  const declaration = validDeclaration({
    signer_public_key:
      'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHWi13X884S5FApYT7CnAWf7xSbkGGAj97r+pf0/kgFV attacker@example.com',
    signer_fingerprint: 'SHA256:attacker',
  });
  let invoked = false;
  await assert.rejects(
    verifyRelicensingDeclaration({
      declarationBytes: Buffer.from(`${JSON.stringify(declaration, null, 2)}\n`),
      runSshVerify: async () => {
        invoked = true;
      },
    }),
    /authorized signer/
  );
  assert.equal(invoked, false);
});

test('rejects a relicensing declaration without the exact grant boundary', async () => {
  const declaration = validDeclaration({ license_grant: 'MIT' });
  await assert.rejects(
    verifyRelicensingDeclaration({
      declarationBytes: Buffer.from(`${JSON.stringify(declaration, null, 2)}\n`),
      runSshVerify: async () => {},
    }),
    /license grant/
  );
});

test('executable verifier resolves the repository from its own installed path', () => {
  const script = fileURLToPath(new URL('../../scripts/verify-extraction.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    cwd: '/',
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects a leaked path from filtered history', async () => {
  await assert.rejects(
    verifyExtraction({
      root: '/repo',
      manifest: validManifest(),
      runGit: fakeGit({ history: 'scripts/review/co-review.mjs\npackage.json\n' }),
    }),
    /foreign retained paths: package\.json/
  );
});

test('does not widen co-review globs to their containing directories', async () => {
  await assert.rejects(
    verifyExtraction({
      root: '/repo',
      manifest: validManifest(),
      runGit: fakeGit({ history: 'scripts/tests/unit/unrelated.test.mjs\n' }),
    }),
    /foreign retained paths/
  );
});

test('rejects a foreign path in standalone HEAD', async () => {
  await assert.rejects(
    verifyExtraction({
      root: '/repo',
      manifest: validManifest(),
      runGit: fakeGit({ current: 'LICENSE\nprivate.txt' }),
    }),
    /foreign standalone paths: private\.txt/
  );
});

test('accepts the bounded standalone white-paper documentation path', async () => {
  await verifyExtraction({
    root: '/repo',
    manifest: validManifest(),
    runGit: fakeGit({
      current: [
        'LICENSE',
        'docs/whitepapers/2026-09-11-provider-neutral-runtime-orchestration-white-paper.md',
      ].join('\n'),
    }),
  });
});

test('accepts bounded governed implementation plans', async () => {
  await verifyExtraction({
    root: '/repo',
    manifest: validManifest(),
    runGit: fakeGit({
      current: ['LICENSE', 'docs/plans/2026-09-13-18-claude-identity-fallback.md'].join('\n'),
    }),
  });
});

test('accepts bounded standalone release notes', async () => {
  await verifyExtraction({
    root: '/repo',
    manifest: validManifest(),
    runGit: fakeGit({ current: ['LICENSE', 'docs/releases/0.3.0.md'].join('\n') }),
  });
});

test('does not widen release notes to unrelated documentation', async () => {
  await assert.rejects(
    verifyExtraction({
      root: '/repo',
      manifest: validManifest(),
      runGit: fakeGit({ current: ['LICENSE', 'docs/release-drafts/draft.md'].join('\n') }),
    }),
    /foreign standalone paths/
  );
});

test('accepts project configuration and tracked peer-review records', async () => {
  await verifyExtraction({
    root: '/repo',
    manifest: validManifest(),
    runGit: fakeGit({
      current: [
        '.ai-peer-review.json',
        '.codex/config.json',
        '.codex/skills/peer-review/SKILL.md',
        'LICENSE',
        'docs/peer-reviews/spec/example/00-review-history.md',
        'docs/peer-reviews/spec/example/reviewer-response-1.md',
      ].join('\n'),
    }),
  });
});

test('accepts bounded project-local AITM governance paths', async () => {
  await verifyExtraction({
    root: '/repo',
    manifest: validManifest(),
    runGit: fakeGit({
      current: [
        '.agents/skills/task/SKILL.md',
        '.ai-task-manager/task-tracker.json',
        '.claude/commands/task.md',
        '.claude/settings.json',
        '.claude/skills/task/SKILL.md',
        '.github/ISSUE_TEMPLATE/task.yml',
        '.grok/hooks/aitm.json',
        '.grok/skills/task/SKILL.md',
        'AGENTS.md',
        'LICENSE',
        'vendors/kburson-ai-task-manager-1.0.0.tgz',
      ].join('\n'),
    }),
  });
});

for (const foreignPath of [
  '.github/ISSUE_TEMPLATE/unrelated-product.yml',
  '.grok/hooks/unrelated-extension.json',
  '.grok/hooks/nested/anything.bin',
]) {
  test(`rejects non-AITM governance path ${foreignPath}`, async () => {
    await assert.rejects(
      verifyExtraction({
        root: '/repo',
        manifest: validManifest(),
        runGit: fakeGit({ current: `${foreignPath}\nLICENSE` }),
      }),
      /foreign standalone paths/
    );
  });
}

test('accepts the preferred Node runtime configuration as one exact standalone path', async () => {
  await verifyExtraction({
    root: '/repo',
    manifest: validManifest(),
    runGit: fakeGit({ current: '.nvmrc\nLICENSE' }),
  });
});

test('rejects dangling or otherwise invalid Git refs', async () => {
  await assert.rejects(
    verifyExtraction({
      root: '/repo',
      manifest: validManifest(),
      runGit: fakeGit({ integrityError: 'invalid sha1 pointer' }),
    }),
    /invalid sha1 pointer/
  );
});

test('rejects a standalone bootstrap whose first parent is not the filtered tip', async () => {
  await assert.rejects(
    verifyExtraction({
      root: '/repo',
      manifest: validManifest(),
      runGit: fakeGit({ bootstrapParent: 'd'.repeat(40) }),
    }),
    /bootstrap parent/
  );
});

test('release gate rejects retained legacy paths', async () => {
  await assert.rejects(
    verifyExtraction({
      root: '/repo',
      manifest: validManifest(),
      runGit: fakeGit(),
      requireLegacyRemoved: true,
    }),
    /legacy retained paths/
  );
});

for (const [name, mutate, pattern] of [
  [
    'changed source repository',
    (m) => (m.source_repository = 'https://github.com/attacker/fork'),
    /source repository/,
  ],
  [
    'changed source commit',
    (m) => (m.source_commit = '1'.repeat(40)),
    /source commit/,
  ],
  [
    'changed filtered history tip',
    (m) => (m.filtered_history_tip = '2'.repeat(40)),
    /filtered history tip/,
  ],
  [
    'widened retained path rules',
    (m) => m.retained_path_rules.prefixes.push('private'),
    /retained path rules/,
  ],
  [
    'widened standalone path rules',
    (manifest) => manifest.standalone_path_rules.prefixes.push('private'),
    /standalone path rules/,
  ],
  [
    'changed retained path inventory digest',
    (m) => (m.retained_path_inventory.digest = SHA),
    /retained path inventory digest/,
  ],
  [
    'changed contributor audit digest',
    (m) => (m.contributor_audit.digest = SHA),
    /contributor audit digest/,
  ],
  [
    'secret scan of a different ref',
    (m) => (m.secret_scan.scanned_ref = '3'.repeat(40)),
    /secret scan ref/,
  ],
  [
    'changed Gitleaks configuration digest',
    (m) => (m.secret_scan.config_digest = SHA),
    /secret scan config digest/,
  ],
  [
    'changed design source',
    (m) => (m.design_source.commit = '4'.repeat(40)),
    /design source/,
  ],
  ['failed scan', (m) => (m.secret_scan.result = 'fail'), /secret scan result/],
  ['missing scan version', (m) => (m.secret_scan.tool_version = null), /secret scan version/],
  ['empty contributor audit', (m) => (m.contributor_audit.normalized_result = []), /contributor audit/],
  [
    'changed contributor audit',
    (m) => (m.contributor_audit.normalized_result = ['Somebody Else <else@example.com>']),
    /contributor audit/,
  ],
  [
    'null declaration digest',
    (m) => (m.relicensing_declaration_digest = null),
    /relicensing declaration digest/,
  ],
  [
    'malformed source boundary',
    (m) => (m.prefilter_ref_inventory[0].object = 'deadbeef'),
    /prefilter ref inventory/,
  ],
]) {
  test(`rejects ${name}`, async () => {
    const manifest = validManifest();
    mutate(manifest);
    await assert.rejects(
      verifyExtraction({ root: '/repo', manifest, runGit: fakeGit() }),
      pattern
    );
  });
}

test('redacts secret material before hashing a Gitleaks report', () => {
  const report = redactGitleaksReport(
    JSON.stringify([
      {
        RuleID: 'generic-api-key',
        Description: 'Generic API Key',
        File: 'docs/example.md',
        StartLine: 7,
        EndLine: 7,
        Commit: 'f'.repeat(40),
        Secret: 'super-secret-value',
        Match: 'token=super-secret-value',
        Fingerprint: 'stable-fingerprint',
      },
    ])
  );
  assert.equal(report.includes('super-secret-value'), false);
  const parsed = JSON.parse(report);
  assert.deepEqual(parsed[0], {
    commit: 'f'.repeat(40),
    description: 'Generic API Key',
    end_line: 7,
    file: 'docs/example.md',
    fingerprint: 'stable-fingerprint',
    rule_id: 'generic-api-key',
    start_line: 7,
  });
});

test('builds a closed passing secret-scan provenance record', () => {
  const record = buildSecretScanRecord({
    toolVersion: '8.30.1',
    configBytes: Buffer.from('[extend]\nuseDefault = true\n'),
    scannedRef: 'bfc6f9ffabd8281a815c7bd0e0824f3bacb84d9d',
    redactedReportBytes: Buffer.from('[]\n'),
    exitCode: 0,
  });
  assert.equal(record.tool, 'gitleaks');
  assert.equal(record.tool_version, '8.30.1');
  assert.equal(record.scanned_ref, 'bfc6f9ffabd8281a815c7bd0e0824f3bacb84d9d');
  assert.match(record.config_digest, /^[a-f0-9]{64}$/);
  assert.match(record.report_digest, /^[a-f0-9]{64}$/);
  assert.equal(record.result, 'pass');
});

test('refuses to record a failed Gitleaks scan as passing', () => {
  assert.throws(
    () =>
      buildSecretScanRecord({
        toolVersion: '8.30.1',
        configBytes: Buffer.from('[extend]\nuseDefault = true\n'),
        scannedRef: 'bfc6f9ffabd8281a815c7bd0e0824f3bacb84d9d',
        redactedReportBytes: Buffer.from('[]\n'),
        exitCode: 1,
      }),
    /Gitleaks scan failed/
  );
});
