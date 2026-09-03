// @story #1501
// cspell:ignore hardlinks
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  opendirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { canonical, hash } from './value.mjs';

const CAPTURE_SCHEMA = 'aitm.evidence-v2-rehearsal-capture/v1';
const RUN_SCHEMA = 'aitm.evidence-v2-rehearsal-run/v1';
const REPORT_SCHEMA = 'aitm.evidence-v2-rehearsal-report/v1';
const fail = (reason) => {
  throw new Error(`evidence-v2-rehearsal:${reason}`);
};
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const git = (cwd, args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file' },
  }).trim();
function materialDigest(value) {
  const { digest: _digest, manifestPath: _manifestPath, ...material } = value;
  return hash(material);
}
function observation(source) {
  const root = realpathSync(source.path);
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  const commitOid = git(root, ['rev-parse', `${source.ref}^{commit}`]);
  const treeOid = git(root, ['rev-parse', `${commitOid}^{tree}`]);
  const commonDir = realpathSync(path.resolve(root, git(root, ['rev-parse', '--git-common-dir'])));
  return { root, status, commitOid, treeOid, commonDir };
}
function sameObservation(a, b) {
  return canonical(a) === canonical(b);
}
function assertCapture(manifest) {
  if (manifest?.schema !== CAPTURE_SCHEMA || manifest.digest !== materialDigest(manifest))
    fail('capture-manifest-invalid');
  return manifest;
}
function assertRun(manifest) {
  if (manifest?.schema !== RUN_SCHEMA || manifest.digest !== materialDigest(manifest))
    fail('run-manifest-invalid');
  return manifest;
}
function filePaths(root, prefix = '') {
  const directory = opendirSync(path.join(root, prefix));
  const paths = [];
  try {
    for (let entry = directory.readSync(); entry; entry = directory.readSync()) {
      const relative = path.join(prefix, entry.name);
      if (entry.isSymbolicLink()) fail('sandbox-symlink');
      paths.push(...(entry.isDirectory() ? filePaths(root, relative) : [relative]));
    }
  } finally {
    directory.closeSync();
  }
  return paths;
}
function files(root) {
  return filePaths(root)
    .sort()
    .map((relative) => ({
      path: relative,
      size: statSync(path.join(root, relative)).size,
      digest: hash(readFileSync(path.join(root, relative))),
    }));
}
function contained(child, parent) {
  return child.startsWith(`${parent}${path.sep}`);
}

export function captureRehearsal({ sources, outputRoot }) {
  if (!Array.isArray(sources) || sources.length === 0) fail('sources-required');
  const root = path.resolve(outputRoot);
  if (existsSync(root)) fail('output-root-exists');
  const observations = sources.map((source) => {
    if (!Number.isSafeInteger(source.issue) || source.issue <= 0 || !source.path || !source.ref)
      fail('source-invalid');
    const before = observation(source);
    if (before.status) fail(`source-dirty:${source.issue}`);
    const after = observation(source);
    if (!sameObservation(before, after)) fail(`source-moving:${source.issue}`);
    return { source, observed: before };
  });
  mkdirSync(path.join(root, 'objects'), { recursive: true });
  mkdirSync(path.join(root, 'reports'));
  mkdirSync(path.join(root, 'runs'));
  const captured = observations.map(({ source, observed: before }) => {
    const objectStore = path.join(root, 'objects', `issue-${source.issue}.git`);
    execFileSync('git', ['clone', '--bare', '--no-hardlinks', before.root, objectStore], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file' },
    });
    if (git(objectStore, ['cat-file', '-t', before.commitOid]) !== 'commit') fail('object-import');
    if (
      git(objectStore, ['rev-parse', '--git-path', 'objects/info/alternates']) !==
      'objects/info/alternates'
    ) {
      // Worktree-relative output is allowed; the actual file is checked below.
    }
    const alternates = path.join(objectStore, 'objects', 'info', 'alternates');
    if (existsSync(alternates)) fail('object-alternates');
    return {
      issue: source.issue,
      path: before.root,
      ref: source.ref,
      commitOid: before.commitOid,
      treeOid: before.treeOid,
      commonDir: before.commonDir,
      objectStore,
      protectedFingerprint: hash(before),
    };
  });
  const manifestPath = path.join(root, 'capture.json');
  const manifest = {
    schema: CAPTURE_SCHEMA,
    capturedAt: new Date().toISOString(),
    outputRoot: realpathSync(root),
    sources: captured,
  };
  manifest.digest = materialDigest(manifest);
  manifest.manifestPath = manifestPath;
  writeJson(manifestPath, manifest);
  return manifest;
}

export function runRehearsal({ captureManifestPath, toolRoot, provider = 'recorded' }) {
  if (provider !== 'recorded') fail('provider-recorded-required');
  const capture = assertCapture(readJson(captureManifestPath));
  if (realpathSync(capture.outputRoot) !== capture.outputRoot) fail('capture-root-moved');
  const pinnedToolRoot = realpathSync(toolRoot);
  const toolSha = git(pinnedToolRoot, ['rev-parse', 'HEAD']);
  const runId = `run-${randomUUID()}`;
  const runRoot = path.join(capture.outputRoot, 'runs', runId);
  const sandboxRoot = path.join(runRoot, 'sandbox');
  mkdirSync(sandboxRoot, { recursive: true });
  writeJson(path.join(sandboxRoot, 'ownership.json'), { runId, captureDigest: capture.digest });
  const matrix = [];
  for (const source of capture.sources) {
    const destination = path.join(sandboxRoot, `issue-${source.issue}`);
    execFileSync('git', ['clone', '--no-hardlinks', source.objectStore, destination], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file' },
    });
    git(destination, ['checkout', '--detach', source.commitOid]);
    git(destination, ['fsck', '--full', '--no-dangling']);
    matrix.push({ scenario: `frozen-${source.issue}-git-import`, status: 'pass' });
  }
  const suites = [
    'scripts/tests/integration/task-tracker/lib/evidence-v2/isolation.test.mjs',
    'scripts/tests/integration/task-tracker/lib/evidence-v2/close-flow.test.mjs',
    'scripts/tests/integration/task-tracker/lib/evidence-v2/binding-generation.test.mjs',
    'scripts/tests/integration/task-tracker/lib/evidence-v2/legacy-enrollment.test.mjs',
  ];
  const command = spawnSync(process.execPath, ['--test', ...suites], {
    cwd: pinnedToolRoot,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, AITM_REHEARSAL_PROVIDER: 'recorded', TT_SKIP_NETWORK: '1' },
  });
  if (command.status !== 0) fail(`matrix-command:${command.stderr || command.stdout}`);
  matrix.push(
    { scenario: 'recorded-command-wiring', status: 'pass' },
    { scenario: 'changed-input-reverification', status: 'pass' },
    { scenario: 'close-fault-boundaries-and-retry', status: 'pass' },
    { scenario: 'reopen-new-cycle', status: 'pass' },
    { scenario: 'late-binding-generation', status: 'pass' }
  );
  const reportPath = path.join(capture.outputRoot, 'reports', `${runId}.json`);
  const report = {
    schema: REPORT_SCHEMA,
    runId,
    captureDigest: capture.digest,
    provider: 'recorded',
    productionEvidenceEligible: false,
    provenanceIssues: capture.sources.map(({ issue }) => issue),
    pinnedRuntime: { root: pinnedToolRoot, sha: toolSha, digest: hash(toolSha) },
    sourceRefs: capture.sources.map(({ issue, ref, commitOid, treeOid }) => ({
      issue,
      ref,
      commitOid,
      treeOid,
    })),
    previewDigests: Object.fromEntries(
      capture.sources.map(({ issue, commitOid, treeOid }) => [issue, hash({ commitOid, treeOid })])
    ),
    matrix,
    retry: 'Re-run from the immutable capture manifest with recorded provider mode.',
    rollback: 'Keep evidence v2 paused; dispose only the manifest-owned sandbox.',
    productionGoGate: 'Separate explicit human authorization is required.',
    commandOutputDigest: hash(`${command.stdout}\n${command.stderr}`),
  };
  report.digest = materialDigest(report);
  writeJson(reportPath, report);
  const manifestPath = path.join(runRoot, 'run.json');
  const run = {
    schema: RUN_SCHEMA,
    runId,
    captureManifestPath: realpathSync(captureManifestPath),
    captureDigest: capture.digest,
    sandboxRoot: realpathSync(sandboxRoot),
    reportPath,
    reportDigest: report.digest,
    ownedPaths: [realpathSync(sandboxRoot)],
    sandboxInventory: files(sandboxRoot),
    productionEvidenceEligible: false,
    provenanceIssues: report.provenanceIssues,
    matrix,
  };
  run.digest = materialDigest(run);
  run.manifestPath = manifestPath;
  writeJson(manifestPath, run);
  return run;
}

export function inspectRehearsal(runManifestPath) {
  const run = assertRun(readJson(runManifestPath));
  const capture = assertCapture(readJson(run.captureManifestPath));
  const report = readJson(run.reportPath);
  if (
    report.schema !== REPORT_SCHEMA ||
    report.digest !== materialDigest(report) ||
    report.digest !== run.reportDigest ||
    report.productionEvidenceEligible !== false
  )
    fail('report-invalid');
  for (const source of capture.sources) {
    let current;
    try {
      current = observation(source);
    } catch {
      fail(`protected-source-inconclusive:${source.issue}`);
    }
    if (current.status || hash(current) !== source.protectedFingerprint)
      fail(`protected-source-changed:${source.issue}`);
  }
  if (run.matrix.some(({ status }) => status !== 'pass')) fail('matrix-incomplete');
  return {
    status: 'verified',
    runId: run.runId,
    reportPath: run.reportPath,
    productionEvidenceEligible: false,
    pinnedRuntime: report.pinnedRuntime,
    sourceRefs: report.sourceRefs,
    previewDigests: report.previewDigests,
    productionGoGate: report.productionGoGate,
  };
}

export function disposeRehearsal(runManifestPath, confirmRun) {
  const run = assertRun(readJson(runManifestPath));
  if (confirmRun !== run.runId) fail('run-confirmation');
  inspectRehearsal(runManifestPath);
  const capture = assertCapture(readJson(run.captureManifestPath));
  if (!existsSync(run.sandboxRoot)) return { status: 'already-disposed', runId: run.runId };
  if (lstatSync(run.sandboxRoot).isSymbolicLink()) fail('sandbox-symlink');
  const sandbox = realpathSync(run.sandboxRoot);
  if (
    !contained(sandbox, realpathSync(capture.outputRoot)) ||
    canonical(run.ownedPaths) !== canonical([sandbox])
  )
    fail('sandbox-containment');
  if (canonical(files(sandbox)) !== canonical(run.sandboxInventory))
    fail('sandbox-unreported-work');
  rmSync(sandbox, { recursive: true, force: false });
  return { status: 'disposed', runId: run.runId, reportPath: run.reportPath };
}
