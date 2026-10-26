// @story #2096
// Immutable verification source. This never changes the observed operator context.
import { execFileSync } from 'node:child_process';

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const VERBS = new Set([
  'ac-stamp',
  'dod-stamp',
  'test',
  'review',
  'approve',
  'deliver',
  'close',
  'promote',
  'next',
  'explain',
  'commit-trace',
  'check',
  'ensureChecked',
]);

export function parseArtifactSelection(argv = []) {
  const indexes = argv.flatMap((value, index) => (value === '--artifact-commit' ? [index] : []));
  if (!indexes.length) return { argv: [...argv], commitSha: null };
  if (indexes.length !== 1) throw new Error('artifact: ambiguous selection');
  const index = indexes[0];
  const commitSha = argv[index + 1];
  if (!SHA.test(commitSha ?? '')) throw new Error('artifact: full canonical commit SHA required');
  if (!VERBS.has(argv[0])) throw new Error(`artifact: unsupported verb ${argv[0]}`);
  return { argv: argv.filter((_, i) => i !== index && i !== index + 1), commitSha };
}

export function resolveArtifactSubject({ projectDir, commitSha } = {}) {
  if (!SHA.test(commitSha ?? '')) throw new Error('artifact: full canonical commit SHA required');
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    if (git('cat-file', '-t', commitSha) !== 'commit') throw new Error('not a commit');
    const canonical = git('rev-parse', '--verify', `${commitSha}^{commit}`);
    if (canonical !== commitSha) throw new Error('noncanonical commit');
    const treeSha = git('rev-parse', '--verify', `${commitSha}^{tree}`);
    if (!SHA.test(treeSha)) throw new Error('invalid tree');
    return Object.freeze({ commitSha, treeSha });
  } catch (error) {
    throw new Error(`artifact: unresolvable commit ${commitSha}: ${error.message}`, {
      cause: error,
    });
  }
}

export function validateArtifactSubject({ projectDir, artifactSubject } = {}) {
  if (!artifactSubject || Object.keys(artifactSubject).sort().join(',') !== 'commitSha,treeSha') {
    throw new Error('artifact: complete commit/tree descriptor required');
  }
  const resolved = resolveArtifactSubject({ projectDir, commitSha: artifactSubject.commitSha });
  if (resolved.treeSha !== artifactSubject.treeSha) throw new Error('artifact: tree mismatch');
  return resolved;
}

export function sourceCommit({ artifactSubject, operatorHead } = {}) {
  return artifactSubject?.commitSha ?? operatorHead;
}
