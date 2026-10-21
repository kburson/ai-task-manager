// @story #2039 #2057
// Read-only native binding settlement. Never creates a cache, registry or ownership grant.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveRuntimeRoot } from '../runtime-storage.mjs';
import { configPath } from '../../paths.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { inspectStoryWriterScope } from './writer-registry.mjs';
import { validateManifest } from './manifest.mjs';
import { cacheRetentionDecision } from './retention.mjs';
import { storyCachePath } from './store.mjs';
import {
  PROTOCOL,
  directory,
  readPrivateBytes,
  readMetadata,
  scanTree,
  exactTree,
  readExport,
  acknowledgment,
} from './writer-handoff-io.mjs';
import {
  handoffFail,
  HANDOFF_MANIFEST_MAX_BYTES,
  validateStoryHandoffManifest,
} from './writer-handoff-bytes.mjs';
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function exists(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}
function nativeJson(root, relative) {
  const bytes = readPrivateBytes(fs, root, relative);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const value = JSON.parse(text);
  if (text !== canonicalRecordJson(value)) handoffFail('binding-native-json');
  return { value, bytes };
}
function cleanGeneration(claim, identity) {
  const root = claim.cachePath;
  if (exists(path.join(root, PROTOCOL, 'frozen.json'))) handoffFail('binding-frozen');
  const inventory = scanTree(fs, root);
  if (inventory.directories.some((d) => !['generations', 'manifests', 'payloads'].includes(d)))
    handoffFail('binding-opaque-directory');
  for (const f of inventory.files) {
    if (f.path === 'manifest.json') continue;
    const match = f.path.match(
      /^(?:generations|manifests)\/[1-9][0-9]*-([a-f0-9]{64})\.json$|^payloads\/([a-f0-9]{64})\.txt$/
    );
    if (!match || (match[1] ?? match[2]) !== f.digest) handoffFail('binding-retained-evidence');
  }
  const { value: manifest } = nativeJson(root, 'manifest.json');
  if (manifest.claimId !== claim.claimId) handoffFail('binding-claim');
  const { value: generation, bytes } = nativeJson(root, manifest.payloadPath);
  const payloads = new Map([[manifest.payloadPath, bytes]]);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'payloadPath') && !payloads.has(value.payloadPath))
      payloads.set(value.payloadPath, readPrivateBytes(fs, root, value.payloadPath));
    for (const child of Object.values(value)) visit(child);
  };
  visit(generation);
  const verified = validateManifest(manifest, { identity, payloads });
  if (!cacheRetentionDecision({ operation: 'reassign', generation: verified.generation }).allowed)
    handoffFail('binding-pending');
}
function completedSource(root, sessionId, observed) {
  const folder = path.join(root, PROTOCOL, 'transfers');
  directory(fs, folder);
  let matches = 0;
  for (const name of fs.readdirSync(folder)) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(name)) handoffFail('binding-transfer-name');
    const manifest = readMetadata(fs, root, PROTOCOL + '/transfers/' + name + '/manifest.json', {
      max: HANDOFF_MANIFEST_MAX_BYTES,
    });
    const validated = validateStoryHandoffManifest(manifest);
    if (manifest.sourceClaim.sessionId !== sessionId || manifest.sourceClaim.cachePath !== root)
      continue;
    if (
      manifest.transferId !== name ||
      manifest.registryId !== observed.registryId ||
      !same(manifest.identity, observed.identity) ||
      !same({ ...manifest.sourceClaim, ...manifest.target }, observed.claim)
    )
      handoffFail('binding-transfer-owner');
    readExport(fs, root, name, validated.bundleDigest);
    if (manifest.target.cachePath !== root) exactTree(fs, root, manifest);
    if (!acknowledgment(fs, manifest, validated.bundleDigest, { checkWorking: false }))
      handoffFail('binding-unacknowledged');
    matches++;
  }
  if (matches !== 1) handoffFail('binding-no-settled-transfer');
}
export function assertStoryBindingSettled({ projectRoot, issue, sessionId, repository } = {}) {
  // Legacy callers and synthetic roots without Git metadata have no native cache authority.
  if (!exists(path.join(projectRoot, '.git'))) {
    if (exists(path.join(projectRoot, '.tmp', 'gh'))) handoffFail('binding-git-unavailable');
    return;
  }
  const runtime = resolveRuntimeRoot({ cwd: projectRoot, env: {} });
  if (runtime.projectRoot !== projectRoot) handoffFail('binding-project-root');
  const shared = path.join(runtime.worktreeIdentity.commonDir, 'aitm');
  const hasEvidence =
    exists(path.join(projectRoot, '.tmp', 'gh')) ||
    exists(path.join(shared, 'story-writers.identity.json')) ||
    exists(path.join(shared, 'story-writers'));
  if (!hasEvidence) return;
  const config = configPath(projectRoot);
  if (!exists(config)) {
    // Without a repository scope, any retained writer registry or cache is uncertain.
    const root = resolveRuntimeRoot({ cwd: projectRoot, env: {} });
    if (
      exists(path.join(projectRoot, '.tmp', 'gh')) ||
      exists(path.join(root.worktreeIdentity.commonDir, 'aitm', 'story-writers.identity.json')) ||
      exists(path.join(root.worktreeIdentity.commonDir, 'aitm', 'story-writers'))
    )
      handoffFail('binding-config-unavailable');
    return;
  }
  const repo = JSON.parse(fs.readFileSync(config, 'utf8')).repo;
  if (
    typeof repo !== 'string' ||
    !/^[-\w.]+\/[-\w.]+$/.test(repo) ||
    (repository && repository.toLowerCase() !== repo.toLowerCase())
  )
    handoffFail('binding-repository');
  const host = (process.env.GH_HOST || 'github.com').toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host)) handoffFail('binding-host');
  const issueNumber = Number(String(issue).replace(/^#/, ''));
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) handoffFail('binding-issue');
  const scope = { host, repository: repo.toLowerCase(), issueNumber };
  const observed = inspectStoryWriterScope({ projectRoot, ...scope });
  const local = path.join(
    projectRoot,
    '.tmp',
    'gh',
    host,
    hash(scope.repository),
    String(issueNumber)
  );
  if (!observed) {
    if (exists(local)) handoffFail('binding-unclaimed-cache');
    return;
  }
  if (observed.claim.worktree === projectRoot && observed.claim.sessionId === sessionId) {
    cleanGeneration(observed.claim, observed.identity);
    return;
  }
  // The current recipient's pending work cannot be settled by its inbound receipt.
  // Only the actual former source session may release its retained source binding.
  if (!exists(local)) handoffFail('binding-source-missing');
  if (local !== storyCachePath({ projectRoot, identity: observed.identity }))
    handoffFail('binding-source-path');
  completedSource(local, sessionId, observed);
}
