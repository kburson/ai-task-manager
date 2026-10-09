import assert from 'node:assert/strict';

// cspell:words DataCite dois Zenodo zenodo
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyZenodoHealth,
  defaultObservers,
  observeReleaseDelta,
  parseGitChangedPaths,
  validateReleaseManifest,
  validateZenodoAuthority,
  verifyRelease,
} from '../../scripts/verify-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = createHash('sha256').update('release tarball').digest('hex');
const releaseCommit = '7921042427a0be6b53d9c3e41fd75d7099e86a78';
const evidenceCommit = 'f8e94b658118c205ab2589a06444b822402cd69f';
const correctionCommit = 'c'.repeat(40);

function manifest() {
  return {
    schema: 'ai-peer-review.release/v1',
    package: 'ai-peer-review',
    version: '0.2.0',
    source_commit: '4b3bcd43cba141a611da4a2b861433b915462806',
    filtered_history_tip: 'bfc6f9ffabd8281a815c7bd0e0824f3bacb84d9d',
    bootstrap_commit: 'fd2e636356b6b8049930d5dc6bddf383c6d56c8d',
    release_commit: releaseCommit,
    repository: { url: 'https://github.com/kburson/ai-peer-review', visibility: 'PUBLIC' },
    tag: {
      name: 'v0.2.0',
      target_commit: releaseCommit,
      signer_fingerprint: 'SHA256:5coWixpZ2nPevuuMFWsJkk7oc3UN8zybVaMpA12HNPI',
    },
    github_release: {
      url: 'https://github.com/kburson/ai-peer-review/releases/tag/v0.2.0',
      asset_name: 'ai-peer-review-0.2.0.tgz',
      asset_sha256: digest,
      checksums_asset_name: 'SHA256SUMS',
    },
    npm: {
      tarball_url: 'https://registry.npmjs.org/ai-peer-review/-/ai-peer-review-0.2.0.tgz',
      integrity: 'sha512-fixture',
      sha256: digest,
      provenance_url: 'https://registry.npmjs.org/-/npm/v1/attestations/fixture',
    },
    archives: {
      zenodo: {
        doi: '10.5281/zenodo.1234567',
        url: 'https://zenodo.org/records/1234567',
      },
      software_heritage: {
        swhid: 'swh:1:rev:37a30d8ec124f831aee7974957df12ac226bacbf',
        url: 'https://archive.softwareheritage.org/swh:1:rev:37a30d8ec124f831aee7974957df12ac226bacbf',
      },
    },
  };
}

function zenodoRecord(value = manifest()) {
  return {
    data: {
      id: value.archives.zenodo.doi,
      type: 'dois',
      attributes: {
        doi: value.archives.zenodo.doi,
        state: 'findable',
        publisher: 'Zenodo',
        version: `v${value.version}`,
        titles: [{ title: `kburson/ai-peer-review: v${value.version}` }],
        relatedIdentifiers: [
          {
            relationType: 'IsSupplementTo',
            relatedIdentifier: `${value.repository.url}/tree/v${value.version}`,
            resourceTypeGeneral: 'Software',
            relatedIdentifierType: 'URL',
          },
        ],
      },
    },
  };
}

function manifestBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function observers(value = manifest()) {
  return {
    extraction: async () => true,
    head: async () => correctionCommit,
    tag: async () => ({
      target_commit: value.release_commit,
      signer_fingerprint: value.tag.signer_fingerprint,
    }),
    releaseDelta: async (base, head) => {
      assert.equal(base, value.release_commit);
      assert.equal(head, correctionCommit);
      return {
        ancestor: true,
        commits: [
          { sha: evidenceCommit, paths: ['provenance/release-manifest.json'] },
          {
            sha: correctionCommit,
            paths: ['scripts/verify-release.mjs', 'test/unit/verify-release.test.mjs'],
          },
        ],
      };
    },
    releaseManifestBlobs: async () => {
      const bytes = manifestBytes(value);
      return { evidence: bytes, head: bytes, index: bytes };
    },
    repository: async () => value.repository,
    githubRelease: async () => ({
      url: value.github_release.url,
      tagName: value.tag.name,
      assets: [
        { name: value.github_release.asset_name, url: 'fixture:tarball' },
        { name: value.github_release.checksums_asset_name, url: 'fixture:checksums' },
      ],
    }),
    npmPackage: async () => ({
      tarball: value.npm.tarball_url,
      integrity: value.npm.integrity,
      attestations: { provenance: { url: value.npm.provenance_url } },
    }),
    sha256Url: async () => digest,
    textUrl: async () => `${digest}  ${value.github_release.asset_name}\n`,
    zenodoDoi: async () => zenodoRecord(value),
    zenodoHealth: async () => ({ status: 200 }),
    reachable: async () => true,
  };
}

function verify(value, observed = observers(value), bytes = manifestBytes(value)) {
  return verifyRelease({ root, manifest: value, manifestBytes: bytes, observers: observed });
}

function git(cwd, args, options = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', ...options }).trim();
}

function temporaryRepository() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ai-peer-review-release-'));
  git(directory, ['init']);
  git(directory, ['config', 'user.name', 'Release Test']);
  git(directory, ['config', 'user.email', 'release-test@example.invalid']);
  mkdirSync(path.join(directory, 'provenance'), { recursive: true });
  writeFileSync(path.join(directory, 'provenance/release-manifest.json'), '{"draft":true}\n');
  git(directory, ['add', '.']);
  git(directory, ['commit', '--no-gpg-sign', '-m', 'base']);
  return directory;
}

test('release verifier binds the release commit to the signed tag target', async () => {
  const value = manifest();
  const verified = await verify(value);
  assert.equal(verified.releaseCommit, releaseCommit);
  assert.equal(verified.checksum, digest);

  const substituted = manifest();
  substituted.tag.target_commit = '0'.repeat(40);
  const observed = observers(substituted);
  observed.tag = async () => ({
    target_commit: releaseCommit,
    signer_fingerprint: substituted.tag.signer_fingerprint,
  });
  await assert.rejects(
    verify(substituted, observed),
    /signed tag target and release commit do not match/
  );
});

test('release verifier permits the exact Phase 2 evidence and correction sequence', async () => {
  const value = manifest();
  const verified = await verify(value);
  assert.equal(verified.releaseCommit, releaseCommit);
});

test('release verifier rejects unrelated post-release changes', async () => {
  const validCommits = [
    { sha: evidenceCommit, paths: ['provenance/release-manifest.json'] },
    {
      sha: correctionCommit,
      paths: ['scripts/verify-release.mjs', 'test/unit/verify-release.test.mjs'],
    },
  ];
  const invalidDeltas = [
    { ancestor: false, commits: [] },
    { ancestor: true, commits: [] },
    { ancestor: true, commits: validCommits.slice(0, 1) },
    {
      ancestor: true,
      commits: [{ ...validCommits[0], sha: 'd'.repeat(40) }, ...validCommits.slice(1)],
    },
    {
      ancestor: true,
      commits: [validCommits[0], { ...validCommits[1], sha: 'e'.repeat(40) }],
    },
    {
      ancestor: true,
      commits: [validCommits[0], { ...validCommits[1], paths: ['CHANGELOG.md'] }],
    },
    {
      ancestor: true,
      commits: [
        validCommits[0],
        { ...validCommits[1], paths: ['scripts/verify-release.mjs', 'src/public-api.mjs'] },
      ],
    },
    {
      ancestor: true,
      commits: [...validCommits, { sha: 'f'.repeat(40), paths: ['CHANGELOG.md'] }],
    },
  ];
  for (const delta of invalidDeltas) {
    const observed = observers(manifest());
    observed.releaseDelta = async () => delta;
    await assert.rejects(verify(manifest(), observed), /post-release history/);
  }
});

test('release path parser preserves adversarial whitespace bytes', () => {
  assert.deepEqual(parseGitChangedPaths(Buffer.from('provenance/release-manifest.json \0')), [
    'provenance/release-manifest.json ',
  ]);
});

test(
  'release observer preserves adversarial path bytes',
  {
    skip:
      process.platform === 'win32'
        ? 'Git for Windows rejects trailing-space paths before diff observation'
        : false,
  },
  async (t) => {
    const whitespaceRepo = temporaryRepository();
    t.after(() => rmSync(whitespaceRepo, { recursive: true, force: true }));
    const whitespaceBase = git(whitespaceRepo, ['rev-parse', 'HEAD']);
    const blob = git(whitespaceRepo, ['hash-object', '-w', '--stdin'], { input: 'substitute\n' });
    git(whitespaceRepo, [
      'update-index',
      '--add',
      // cspell:disable-next-line
      '--cacheinfo',
      '100644',
      blob,
      'provenance/release-manifest.json ',
    ]);
    git(whitespaceRepo, ['commit', '--no-gpg-sign', '-m', 'adversarial path']);
    const whitespaceHead = git(whitespaceRepo, ['rev-parse', 'HEAD']);
    const whitespaceDelta = await observeReleaseDelta(
      whitespaceRepo,
      whitespaceBase,
      whitespaceHead
    );
    assert.deepEqual(whitespaceDelta.commits, [
      { sha: whitespaceHead, paths: ['provenance/release-manifest.json '] },
    ]);
  }
);

test('release observer exposes renames as both changed paths', async (t) => {
  const renameRepo = temporaryRepository();
  t.after(() => rmSync(renameRepo, { recursive: true, force: true }));
  mkdirSync(path.join(renameRepo, 'src'));
  writeFileSync(path.join(renameRepo, 'src/old.mjs'), 'export const value = 1;\n');
  git(renameRepo, ['add', '.']);
  git(renameRepo, ['commit', '--no-gpg-sign', '-m', 'add source']);
  const renameBase = git(renameRepo, ['rev-parse', 'HEAD']);
  renameSync(path.join(renameRepo, 'src/old.mjs'), path.join(renameRepo, 'src/new.mjs'));
  writeFileSync(path.join(renameRepo, 'provenance/release-manifest.json'), '{"draft":false}\n');
  git(renameRepo, ['add', '-A']);
  git(renameRepo, ['commit', '--no-gpg-sign', '-m', 'evidence and rename']);
  const renameHead = git(renameRepo, ['rev-parse', 'HEAD']);
  const renameDelta = await observeReleaseDelta(renameRepo, renameBase, renameHead);
  assert.deepEqual(renameDelta.commits, [
    {
      sha: renameHead,
      paths: ['provenance/release-manifest.json', 'src/new.mjs', 'src/old.mjs'],
    },
  ]);
});

test('release observer follows the public first-parent chain through a merge', async (t) => {
  const mergeRepo = temporaryRepository();
  t.after(() => rmSync(mergeRepo, { recursive: true, force: true }));
  const base = git(mergeRepo, ['rev-parse', 'HEAD']);
  const trunkBranch = git(mergeRepo, ['branch', '--show-current']);
  git(mergeRepo, ['checkout', '-b', 'readme-topic']);
  writeFileSync(path.join(mergeRepo, 'README.md'), '# Public documentation\n');
  git(mergeRepo, ['add', 'README.md']);
  git(mergeRepo, ['commit', '--no-gpg-sign', '-m', 'README update']);
  git(mergeRepo, ['checkout', trunkBranch]);
  git(mergeRepo, ['merge', '--no-ff', '--no-gpg-sign', '-m', 'merge README', 'readme-topic']);
  const mergeHead = git(mergeRepo, ['rev-parse', 'HEAD']);
  const delta = await observeReleaseDelta(mergeRepo, base, mergeHead);
  assert.deepEqual(delta.commits, [{ sha: mergeHead, paths: ['README.md'] }]);
});

test('release verifier rejects dirty or staged release-manifest bytes', async () => {
  const value = manifest();
  const dirtyBytes = Buffer.concat([manifestBytes(value), Buffer.from(' ')]);
  await assert.rejects(
    verify(value, observers(value), dirtyBytes),
    /working release manifest does not match the committed evidence blob/
  );

  const staged = observers(value);
  staged.releaseManifestBlobs = async () => ({
    evidence: manifestBytes(value),
    head: manifestBytes(value),
    index: dirtyBytes,
  });
  await assert.rejects(
    verify(value, staged),
    /index release manifest does not match the committed evidence blob/
  );

  const substitutedEvidence = observers(value);
  substitutedEvidence.releaseManifestBlobs = async () => ({
    evidence: dirtyBytes,
    head: manifestBytes(value),
    index: manifestBytes(value),
  });
  await assert.rejects(
    verify(value, substitutedEvidence),
    /HEAD release manifest does not match the immutable evidence blob/
  );
});

test('valid DOI authority tolerates transient Zenodo health failures', async () => {
  for (const health of [{ status: 504 }, { error: 'timeout' }, { error: 'network' }]) {
    const value = manifest();
    const observed = observers(value);
    observed.zenodoHealth = async () => health;
    const result = await verify(value, observed);
    assert.deepEqual(result.warnings, [
      {
        provider: 'zenodo',
        category: 'temporary-unavailability',
        ...health,
      },
    ]);
  }
});

test('healthy Zenodo produces no warning', async () => {
  const result = await verify(manifest());
  assert.deepEqual(result.warnings, []);
});

test('Zenodo 4xx and malformed health observations fail closed', async () => {
  for (const health of [{ status: 404 }, { status: 302 }, {}, { error: 'unexpected' }]) {
    const value = manifest();
    const observed = observers(value);
    observed.zenodoHealth = async () => health;
    await assert.rejects(verify(value, observed), /Zenodo health observation/);
  }
});

test('Zenodo DOI authority validates every release identity field', async () => {
  const substitutions = [
    (record) => (record.data.type = 'substitute'),
    (record) => (record.data.id = '10.5281/zenodo.7654321'),
    (record) => (record.data.attributes.doi = '10.5281/zenodo.7654321'),
    (record) => (record.data.attributes.state = 'draft'),
    (record) => (record.data.attributes.publisher = 'Substitute'),
    (record) => (record.data.attributes.version = 'v9.9.9'),
    (record) => (record.data.attributes.titles = [{ title: 'Substitute' }]),
    (record) => (record.data.attributes.relatedIdentifiers = []),
  ];
  for (const substitute of substitutions) {
    const value = manifest();
    const observed = observers(value);
    const record = structuredClone(zenodoRecord(value));
    substitute(record);
    observed.zenodoDoi = async () => record;
    await assert.rejects(verify(value, observed), /Zenodo DOI authority/);
  }

  const wrongUrl = manifest();
  wrongUrl.archives.zenodo.url = 'https://zenodo.org/records/7654321';
  await assert.rejects(verify(wrongUrl), /Zenodo DOI authority/);

  const unavailable = observers(manifest());
  unavailable.zenodoDoi = async () => {
    throw new Error('provider unavailable');
  };
  await assert.rejects(verify(manifest(), unavailable), /Zenodo DOI authority/);

  const softwareHeritageDown = observers(manifest());
  softwareHeritageDown.reachable = async () => false;
  await assert.rejects(verify(manifest(), softwareHeritageDown), /archive is not reachable/);
});

test('Zenodo authority and health seams are pure and closed', () => {
  const value = manifest();
  assert.equal(validateZenodoAuthority({ manifest: value, record: zenodoRecord(value) }), true);
  assert.equal(classifyZenodoHealth({ status: 204 }), null);
  assert.deepEqual(classifyZenodoHealth({ error: 'timeout' }), {
    provider: 'zenodo',
    category: 'temporary-unavailability',
    error: 'timeout',
  });
});

test('default Zenodo health observer identifies the verifier without live I/O', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://zenodo.org/records/1234567');
    assert.equal(
      options.headers['user-agent'],
      'ai-peer-review-release-verifier/0.2.0 (+https://github.com/kburson/ai-peer-review)'
    );
    return { status: 200 };
  };
  assert.deepEqual(
    await defaultObservers(root).zenodoHealth('https://zenodo.org/records/1234567'),
    { status: 200 }
  );
});

test('release manifest fails closed on draft or substituted public evidence', async () => {
  const draft = manifest();
  draft.release_commit = null;
  assert.throws(() => validateReleaseManifest(draft), /release_commit/);
  const changed = manifest();
  changed.github_release.asset_sha256 = '0'.repeat(64);
  const changedObservers = observers(changed);
  changedObservers.sha256Url = async () => digest;
  await assert.rejects(verify(changed, changedObservers), /checksum mismatch/);

  const wrongSigner = observers(manifest());
  wrongSigner.tag = async () => ({
    target_commit: releaseCommit,
    signer_fingerprint: 'SHA256:substitute',
  });
  await assert.rejects(verify(manifest(), wrongSigner), /fingerprint mismatch/);

  const wrongChecksums = observers(manifest());
  wrongChecksums.textUrl = async () => `${'f'.repeat(64)}  ai-peer-review-0.2.0.tgz\n`;
  await assert.rejects(verify(manifest(), wrongChecksums), /checksum asset does not bind/);
});
