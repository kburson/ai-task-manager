#!/usr/bin/env node

// cspell:words DataCite dois Zenodo zenodo

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SWHID = /^swh:1:(rev|dir|cnt):[0-9a-f]{40}$/;
const RELEASE_MANIFEST_PATH = 'provenance/release-manifest.json';
const EVIDENCE_COMMIT = 'f8e94b658118c205ab2589a06444b822402cd69f';
const CORRECTION_PATHS = ['scripts/verify-release.mjs', 'test/unit/verify-release.test.mjs'];
const ZENODO_DOI = /^10\.5281\/zenodo\.(\d+)$/i;
const FETCH_TIMEOUT_MS = 15_000;
const RELEASE_VERIFIER_USER_AGENT =
  'ai-peer-review-release-verifier/0.2.0 (+https://github.com/kburson/ai-peer-review)';

function fail(message) {
  throw new Error(`release verification failed: ${message}`);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} is not an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys`);
}

function text(value, label) {
  if (typeof value !== 'string' || !value) fail(`${label} is missing`);
  return value;
}

export function validateReleaseManifest(manifest) {
  exactKeys(
    manifest,
    [
      'schema',
      'package',
      'version',
      'source_commit',
      'filtered_history_tip',
      'bootstrap_commit',
      'release_commit',
      'repository',
      'tag',
      'github_release',
      'npm',
      'archives',
    ],
    'manifest'
  );
  if (manifest.schema !== 'ai-peer-review.release/v1') fail('schema mismatch');
  if (manifest.package !== 'ai-peer-review' || manifest.version !== '0.2.0')
    fail('package identity mismatch');
  for (const field of [
    'source_commit',
    'filtered_history_tip',
    'bootstrap_commit',
    'release_commit',
  ]) {
    if (!SHA.test(text(manifest[field], field))) fail(`${field} is not a commit SHA`);
  }
  exactKeys(manifest.repository, ['url', 'visibility'], 'repository');
  if (
    text(manifest.repository.url, 'repository.url') !== 'https://github.com/kburson/ai-peer-review'
  )
    fail('repository URL mismatch');
  if (manifest.repository.visibility !== 'PUBLIC') fail('repository is not public');
  exactKeys(manifest.tag, ['name', 'target_commit', 'signer_fingerprint'], 'tag');
  if (manifest.tag.name !== `v${manifest.version}`) fail('tag name mismatch');
  if (!SHA.test(text(manifest.tag.target_commit, 'tag.target_commit')))
    fail('tag target is not a commit SHA');
  text(manifest.tag.signer_fingerprint, 'tag.signer_fingerprint');
  exactKeys(
    manifest.github_release,
    ['url', 'asset_name', 'asset_sha256', 'checksums_asset_name'],
    'github_release'
  );
  text(manifest.github_release.url, 'github_release.url');
  text(manifest.github_release.asset_name, 'github_release.asset_name');
  text(manifest.github_release.checksums_asset_name, 'github_release.checksums_asset_name');
  if (!SHA256.test(text(manifest.github_release.asset_sha256, 'github_release.asset_sha256')))
    fail('GitHub asset SHA-256 is invalid');
  exactKeys(manifest.npm, ['tarball_url', 'integrity', 'sha256', 'provenance_url'], 'npm');
  text(manifest.npm.tarball_url, 'npm.tarball_url');
  if (!text(manifest.npm.integrity, 'npm.integrity').startsWith('sha512-'))
    fail('npm integrity is invalid');
  if (!SHA256.test(text(manifest.npm.sha256, 'npm.sha256'))) fail('npm SHA-256 is invalid');
  text(manifest.npm.provenance_url, 'npm.provenance_url');
  exactKeys(manifest.archives, ['zenodo', 'software_heritage'], 'archives');
  exactKeys(manifest.archives.zenodo, ['doi', 'url'], 'archives.zenodo');
  text(manifest.archives.zenodo.doi, 'archives.zenodo.doi');
  text(manifest.archives.zenodo.url, 'archives.zenodo.url');
  exactKeys(manifest.archives.software_heritage, ['swhid', 'url'], 'archives.software_heritage');
  if (
    !SWHID.test(text(manifest.archives.software_heritage.swhid, 'archives.software_heritage.swhid'))
  )
    fail('Software Heritage identifier is invalid');
  text(manifest.archives.software_heritage.url, 'archives.software_heritage.url');
  return manifest;
}

export function validateZenodoAuthority({ manifest, record }) {
  const expectedDoi = manifest.archives.zenodo.doi;
  const doiMatch = ZENODO_DOI.exec(expectedDoi);
  if (!doiMatch) fail('Zenodo DOI authority: manifest DOI is invalid');
  const data = record?.data;
  const attributes = data?.attributes;
  if (data?.type !== 'dois') fail('Zenodo DOI authority: resource type mismatch');
  if (typeof data.id !== 'string' || data.id.toLowerCase() !== expectedDoi.toLowerCase())
    fail('Zenodo DOI authority: resource identifier mismatch');
  if (
    typeof attributes?.doi !== 'string' ||
    attributes.doi.toLowerCase() !== expectedDoi.toLowerCase()
  )
    fail('Zenodo DOI authority: DOI attribute mismatch');
  if (attributes.state !== 'findable') fail('Zenodo DOI authority: DOI is not findable');
  if (attributes.publisher !== 'Zenodo') fail('Zenodo DOI authority: publisher mismatch');
  if (attributes.version !== `v${manifest.version}`) fail('Zenodo DOI authority: version mismatch');
  const expectedTitle = `kburson/ai-peer-review: v${manifest.version}`;
  if (
    !Array.isArray(attributes.titles) ||
    !attributes.titles.some((entry) => entry?.title === expectedTitle)
  )
    fail('Zenodo DOI authority: title mismatch');
  const expectedRepositoryTag = `${manifest.repository.url}/tree/v${manifest.version}`;
  if (
    !Array.isArray(attributes.relatedIdentifiers) ||
    !attributes.relatedIdentifiers.some(
      (entry) =>
        entry?.relationType === 'IsSupplementTo' &&
        entry.relatedIdentifier === expectedRepositoryTag &&
        entry.resourceTypeGeneral === 'Software' &&
        entry.relatedIdentifierType === 'URL'
    )
  )
    fail('Zenodo DOI authority: repository tag relation mismatch');

  let archiveUrl;
  try {
    archiveUrl = new URL(manifest.archives.zenodo.url);
  } catch {
    fail('Zenodo DOI authority: archive URL is invalid');
  }
  if (
    archiveUrl.protocol !== 'https:' ||
    archiveUrl.hostname !== 'zenodo.org' ||
    archiveUrl.pathname !== `/records/${doiMatch[1]}` ||
    archiveUrl.search !== '' ||
    archiveUrl.hash !== ''
  )
    fail('Zenodo DOI authority: archive URL does not match DOI record');
  return true;
}

export function classifyZenodoHealth(observation) {
  if (Number.isInteger(observation?.status)) {
    if (observation.status >= 200 && observation.status < 300) return null;
    if (observation.status >= 500 && observation.status < 600) {
      return Object.freeze({
        provider: 'zenodo',
        category: 'temporary-unavailability',
        status: observation.status,
      });
    }
    fail(`Zenodo health observation is not retryable: HTTP ${observation.status}`);
  }
  if (observation?.error === 'timeout' || observation?.error === 'network') {
    return Object.freeze({
      provider: 'zenodo',
      category: 'temporary-unavailability',
      error: observation.error,
    });
  }
  fail('Zenodo health observation is malformed');
}

async function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

async function sha256Url(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`download failed (${response.status}): ${url}`);
  return createHash('sha256')
    .update(Buffer.from(await response.arrayBuffer()))
    .digest('hex');
}

async function textUrl(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`download failed (${response.status}): ${url}`);
  return response.text();
}

export function parseGitChangedPaths(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (bytes.length === 0) return [];
  if (bytes.at(-1) !== 0) fail('Git changed-path observation is not NUL terminated');
  const paths = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue;
    const rawPath = bytes.subarray(start, index);
    if (rawPath.length === 0) fail('Git changed-path observation contains an empty path');
    const decoded = rawPath.toString('utf8');
    if (!Buffer.from(decoded).equals(rawPath))
      fail('Git changed-path observation contains a non-UTF-8 path');
    paths.push(decoded);
    start = index + 1;
  }
  return paths;
}

export async function observeReleaseDelta(root, releaseCommit, head) {
  try {
    await run('git', ['merge-base', '--is-ancestor', releaseCommit, head], { cwd: root });
  } catch (error) {
    if (error?.code === 1) {
      return { ancestor: false, commits: [] };
    }
    throw error;
  }
  const { stdout } = await run(
    'git',
    ['rev-list', '--reverse', '--first-parent', `${releaseCommit}..${head}`],
    { cwd: root }
  );
  const shas = stdout.trim() ? stdout.trim().split('\n') : [];
  const commits = [];
  for (const sha of shas) {
    if (!SHA.test(sha)) fail('Git release-history observation contains an invalid commit SHA');
    const { stdout: changedPaths } = await run(
      'git',
      [
        'diff-tree',
        '-m',
        '--first-parent',
        '--no-commit-id',
        '--name-only',
        '-z',
        '--no-renames',
        // cspell:disable-next-line
        '--diff-filter=ACDMRTUXB',
        '-r',
        sha,
        '--',
      ],
      { cwd: root, encoding: null }
    );
    commits.push({ sha, paths: parseGitChangedPaths(changedPaths) });
  }
  return {
    ancestor: true,
    commits,
  };
}

async function observeReleaseManifestBlobs(root, head) {
  const readBlob = async (revision) => {
    // cspell:disable-next-line
    const { stdout } = await run('git', ['show', '--no-textconv', revision], {
      cwd: root,
      encoding: null,
    });
    return Buffer.from(stdout);
  };
  const [evidenceBlob, headBlob, indexBlob] = await Promise.all([
    readBlob(`${EVIDENCE_COMMIT}:${RELEASE_MANIFEST_PATH}`),
    readBlob(`${head}:${RELEASE_MANIFEST_PATH}`),
    readBlob(`:${RELEASE_MANIFEST_PATH}`),
  ]);
  return { evidence: evidenceBlob, head: headBlob, index: indexBlob };
}

export function defaultObservers(root) {
  return {
    async extraction() {
      await run(
        process.execPath,
        [path.join(root, 'scripts/verify-extraction.mjs'), '--require-legacy-removed'],
        {
          cwd: root,
        }
      );
      return true;
    },
    async tag(name) {
      const verified = await run(
        'git',
        [
          '-c',
          `gpg.ssh.allowedSignersFile=${path.join(root, 'provenance/allowed-signers')}`,
          'verify-tag',
          name,
        ],
        { cwd: root }
      );
      const { stdout } = await run('git', ['rev-parse', `${name}^{}`], { cwd: root });
      const fingerprint = `${verified.stdout}\n${verified.stderr}`.match(
        /key (SHA256:[A-Za-z0-9+/]+={0,2})/
      )?.[1];
      if (!fingerprint) fail('signed tag verifier did not report a signer fingerprint');
      return { target_commit: stdout.trim(), signer_fingerprint: fingerprint };
    },
    async head() {
      const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: root });
      return stdout.trim();
    },
    releaseDelta(releaseCommit, head) {
      return observeReleaseDelta(root, releaseCommit, head);
    },
    releaseManifestBlobs(head) {
      return observeReleaseManifestBlobs(root, head);
    },
    async repository() {
      const { stdout } = await run(
        'gh',
        ['repo', 'view', 'kburson/ai-peer-review', '--json', 'url,visibility'],
        { cwd: root }
      );
      return JSON.parse(stdout);
    },
    async githubRelease(name) {
      const { stdout } = await run(
        'gh',
        [
          'release',
          'view',
          name,
          '--repo',
          'kburson/ai-peer-review',
          '--json',
          'url,tagName,assets',
        ],
        { cwd: root }
      );
      return JSON.parse(stdout);
    },
    async npmPackage(spec) {
      const { stdout } = await run('npm', ['view', spec, 'dist', '--json'], { cwd: root });
      return JSON.parse(stdout);
    },
    sha256Url,
    textUrl,
    async zenodoDoi(doi) {
      let response;
      try {
        response = await fetch(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`, {
          headers: { 'user-agent': RELEASE_VERIFIER_USER_AGENT },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch {
        fail('Zenodo DOI authority: DataCite observation failed');
      }
      if (!response.ok) fail(`Zenodo DOI authority: DataCite returned HTTP ${response.status}`);
      try {
        return await response.json();
      } catch {
        fail('Zenodo DOI authority: DataCite response is not valid JSON');
      }
    },
    async zenodoHealth(url) {
      try {
        const response = await fetch(url, {
          headers: { 'user-agent': RELEASE_VERIFIER_USER_AGENT },
          redirect: 'follow',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        return { status: response.status };
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
          return { error: 'timeout' };
        if (error instanceof TypeError) return { error: 'network' };
        throw error;
      }
    },
    async reachable(url) {
      const response = await fetch(url, { redirect: 'follow' });
      return response.ok;
    },
  };
}

export async function verifyRelease({ root, manifest, manifestBytes, observers } = {}) {
  validateReleaseManifest(manifest);
  const observed = observers ?? defaultObservers(root);
  await observed.extraction();

  const extraction = JSON.parse(
    await readFile(path.join(root, 'provenance/extraction-manifest.json'), 'utf8')
  );
  if (
    manifest.source_commit !== extraction.source_commit ||
    manifest.filtered_history_tip !== extraction.filtered_history_tip
  )
    fail('extraction boundary mismatch');
  const { stdout: bootstrapParent } = await run(
    'git',
    ['rev-parse', `${manifest.bootstrap_commit}^`],
    { cwd: root }
  );
  if (bootstrapParent.trim() !== manifest.filtered_history_tip) fail('bootstrap parent mismatch');

  const tag = await observed.tag(manifest.tag.name);
  const head = await observed.head();
  if (
    tag.target_commit !== manifest.tag.target_commit ||
    manifest.tag.target_commit !== manifest.release_commit
  )
    fail('signed tag target and release commit do not match');
  if (tag.signer_fingerprint !== manifest.tag.signer_fingerprint)
    fail('signed tag fingerprint mismatch');
  const delta = await observed.releaseDelta(manifest.release_commit, head);
  if (delta?.ancestor !== true)
    fail('post-release history: release commit is not an ancestor of checkout HEAD');
  const commits = delta?.commits;
  const exactPaths = (actual, expected) =>
    Array.isArray(actual) &&
    actual.length === expected.length &&
    [...actual].sort().every((entry, index) => entry === [...expected].sort()[index]);
  if (
    !Array.isArray(commits) ||
    commits.length !== 2 ||
    commits[0]?.sha !== EVIDENCE_COMMIT ||
    !exactPaths(commits[0]?.paths, [RELEASE_MANIFEST_PATH]) ||
    commits[1]?.sha !== head ||
    !exactPaths(commits[1]?.paths, CORRECTION_PATHS)
  )
    fail('post-release history does not match the pinned evidence and correction sequence');
  if (!Buffer.isBuffer(manifestBytes)) fail('working release manifest bytes are missing');
  const committedManifest = await observed.releaseManifestBlobs(head);
  if (
    !Buffer.isBuffer(committedManifest?.evidence) ||
    !Buffer.isBuffer(committedManifest?.head) ||
    !Buffer.isBuffer(committedManifest?.index)
  )
    fail('committed release manifest observation is malformed');
  if (!committedManifest.evidence.equals(committedManifest.head))
    fail('HEAD release manifest does not match the immutable evidence blob');
  if (!committedManifest.head.equals(committedManifest.index))
    fail('index release manifest does not match the committed evidence blob');
  if (!committedManifest.head.equals(manifestBytes))
    fail('working release manifest does not match the committed evidence blob');

  const repository = await observed.repository();
  if (repository.url !== manifest.repository.url || repository.visibility !== 'PUBLIC')
    fail('public repository observation mismatch');

  const release = await observed.githubRelease(manifest.tag.name);
  if (release.url !== manifest.github_release.url || release.tagName !== manifest.tag.name)
    fail('GitHub release observation mismatch');
  const releaseAsset = release.assets.find(
    (asset) => asset.name === manifest.github_release.asset_name
  );
  if (!releaseAsset) fail('GitHub release tarball asset is missing');
  const releaseAssetDigest = await observed.sha256Url(releaseAsset.url);
  if (releaseAssetDigest !== manifest.github_release.asset_sha256)
    fail('GitHub release tarball checksum mismatch');
  const checksumsAsset = release.assets.find(
    (asset) => asset.name === manifest.github_release.checksums_asset_name
  );
  if (!checksumsAsset) fail('GitHub release checksum asset is missing');
  const checksumLines = (await observed.textUrl(checksumsAsset.url)).trim().split(/\r?\n/);
  const expectedChecksum = `${manifest.github_release.asset_sha256}  ${manifest.github_release.asset_name}`;
  if (checksumLines.length !== 1 || checksumLines[0] !== expectedChecksum)
    fail('GitHub release checksum asset does not bind the tarball');

  const npm = await observed.npmPackage(`${manifest.package}@${manifest.version}`);
  const provenanceUrl = npm.attestations?.provenance?.url ?? npm.attestations?.url;
  if (
    npm.tarball !== manifest.npm.tarball_url ||
    npm.integrity !== manifest.npm.integrity ||
    provenanceUrl !== manifest.npm.provenance_url
  )
    fail('npm registry observation mismatch');
  const npmDigest = await observed.sha256Url(npm.tarball);
  if (npmDigest !== manifest.npm.sha256 || npmDigest !== manifest.github_release.asset_sha256)
    fail('npm and GitHub tarballs do not share the recorded checksum');

  let zenodoRecord;
  try {
    zenodoRecord = await observed.zenodoDoi(manifest.archives.zenodo.doi);
  } catch (error) {
    if (error?.message?.startsWith('release verification failed: Zenodo DOI authority:'))
      throw error;
    fail('Zenodo DOI authority: DataCite observation failed');
  }
  validateZenodoAuthority({ manifest, record: zenodoRecord });
  const warnings = [];
  const zenodoWarning = classifyZenodoHealth(
    await observed.zenodoHealth(manifest.archives.zenodo.url)
  );
  if (zenodoWarning) warnings.push(zenodoWarning);
  if (!(await observed.reachable(manifest.archives.software_heritage.url)))
    fail(`archive is not reachable: ${manifest.archives.software_heritage.url}`);

  return Object.freeze({
    releaseCommit: manifest.release_commit,
    tag: manifest.tag.name,
    package: `${manifest.package}@${manifest.version}`,
    checksum: manifest.npm.sha256,
    warnings: Object.freeze(warnings),
  });
}

async function main() {
  if (process.argv.length !== 2) fail('usage: node scripts/verify-release.mjs');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifestBytes = await readFile(path.join(root, RELEASE_MANIFEST_PATH));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  process.stdout.write(
    `${JSON.stringify(await verifyRelease({ root, manifest, manifestBytes }))}\n`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
