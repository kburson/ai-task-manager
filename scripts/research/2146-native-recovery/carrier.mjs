// @story #2146
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { requirePhysicalDirectory, sha } from './archive.mjs';
import { assertGitEnvironment, assertSafeConfig, configRows } from './reconstruct.mjs';

const TOOL_PATH = 'scripts/research/2146-native-recovery/';
const HELPER_MODULES = [
  'scripts/task-tracker/lib/scratch-dir.mjs',
  'scripts/task-tracker/lib/project-dir.mjs',
  'scripts/task-tracker/lib/runtime-storage.mjs',
  'scripts/task-tracker/paths.mjs',
  'scripts/task-tracker/session-state.mjs',
  'scripts/task-tracker/word-counter.mjs',
  'scripts/task-tracker/fleet-registry.mjs',
  'scripts/gh/lib/dirty-workspace.mjs',
  'scripts/task-tracker/lib/process-timeouts.mjs',
  'scripts/task-tracker/lib/session-id.mjs',
  'scripts/task-tracker/lib/timing-actor.mjs',
  'scripts/task-tracker/lib/jsonl-line-scanner.mjs',
  'scripts/providers/index.mjs',
  'scripts/providers/claude.mjs',
  'scripts/providers/codex.mjs',
  'scripts/providers/grok.mjs',
  'scripts/providers/transcript-resolver.mjs',
  'scripts/providers/transcript-normalizer.mjs',
  'scripts/task-tracker/lib/lifecycle-policy/index.mjs',
  'scripts/task-tracker/lib/lifecycle-policy/states.mjs',
  'scripts/task-tracker/lib/lifecycle-policy/executable-transitions.mjs',
  'scripts/task-tracker/lib/lifecycle-policy/history.mjs',
  'scripts/task-tracker/lib/lifecycle-policy/actions.mjs',
  'scripts/task-tracker/lib/story-cache/writer-registry.mjs',
  'scripts/task-tracker/lib/story-cache/writer-claim-shape.mjs',
  'scripts/task-tracker/lib/story-cache/writer-handoff-io.mjs',
  'scripts/task-tracker/lib/story-cache/writer-handoff-bytes.mjs',
  'scripts/task-tracker/lib/story-cache/store.mjs',
  'scripts/task-tracker/lib/story-cache/manifest.mjs',
  'scripts/task-tracker/lib/story-cache/native-observation.mjs',
  'scripts/task-tracker/lib/ownership-policy.mjs',
  'scripts/task-tracker/issue-mutator-lock.mjs',
  'scripts/task-tracker/lib/github-records/canonical-json.mjs',
];
const INPUTS = [
  'archive.mjs',
  'pack.mjs',
  'reconstruct.mjs',
  'historical-context.mjs',
  'verify-historical.mjs',
  'carrier.mjs',
  'verify.mjs',
]
  .map((name) => TOOL_PATH + name)
  .concat([
    'docs/archive/2146-native-recovery/index.json',
    'docs/archive/2146-native-recovery/objects.json.gz',
    ...HELPER_MODULES,
  ]);
const fail = (reason) => {
  throw new Error('carrier:' + reason);
};

export function assertNodeRuntime(env = process.env, args = process.execArgv) {
  if (env.NODE_OPTIONS || env.NODE_PATH || args.length) fail('node-runtime');
}

function physicalBytes(file) {
  if (realpathSync(file) !== file || !lstatSync(file).isFile()) fail('input-kind');
  return readFileSync(file);
}

export function inspectCarrier(carrierRoot, { readGit, readWorkingFile = physicalBytes } = {}) {
  assertGitEnvironment();
  const carrier = requirePhysicalDirectory(carrierRoot);
  const git =
    readGit ??
    ((args) => {
      assertGitEnvironment();
      try {
        return execFileSync('git', ['--no-pager', '--no-optional-locks', ...args], {
          cwd: carrier,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 10000,
          maxBuffer: 8 * 1024 * 1024,
        });
      } catch {
        return fail('git-read');
      }
    });
  assertSafeConfig(
    configRows(String(git(['config', '--null', '--list', '--show-scope', '--includes']))),
    { carrier: true }
  );
  if (String(git(['rev-parse', '--show-toplevel'])).trim() !== carrier) fail('root');
  const head = String(git(['rev-parse', 'HEAD'])).trim();
  if (!/^[a-f0-9]{40}$/.test(head)) fail('head');
  if (String(git(['status', '--porcelain', '--untracked-files=all'])).trim() !== '') fail('dirty');
  const digests = {};
  for (const relative of INPUTS) {
    const actual = readWorkingFile(path.join(carrier, relative));
    if (!Buffer.from(git(['show', head + ':' + relative])).equals(actual))
      fail('tracked-byte-drift');
    digests[relative] = sha(actual);
  }
  return { archiveCarrierCommit: head, archiveCarrierClean: true, digests };
}
