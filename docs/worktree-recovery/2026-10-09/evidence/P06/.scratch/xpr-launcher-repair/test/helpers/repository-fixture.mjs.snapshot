import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// cspell:ignore filemode

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  }).trim();
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function createRepositoryFixture(t) {
  const parent = mkdtempSync(path.join(tmpdir(), 'ai-peer-review-repository-'));
  const root = path.join(parent, 'repository');
  const linked = path.join(parent, 'linked');
  const outside = path.join(parent, 'outside');
  mkdirSync(root);
  mkdirSync(outside);
  git(root, 'init', '-b', 'trunk');
  git(root, 'config', 'user.name', 'AI Peer Review Tests');
  git(root, 'config', 'user.email', 'tests@example.invalid');

  mkdirSync(path.join(root, 'docs'));
  const artifactBytes = Buffer.from('# Artifact\n\nStable bytes.\n', 'utf8');
  writeFileSync(path.join(root, 'docs', 'artifact.md'), artifactBytes);
  symlinkSync('artifact.md', path.join(root, 'docs', 'tracked-link.md'));
  writeFileSync(path.join(root, 'tracked-staged.txt'), 'initial staged\n');
  writeFileSync(path.join(root, 'tracked-unstaged.txt'), 'initial unstaged\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture base');

  const head = git(root, 'rev-parse', 'HEAD');
  const artifactBlob = git(root, 'rev-parse', 'HEAD:docs/artifact.md');
  const commonDir = realpathSync(path.resolve(root, git(root, 'rev-parse', '--git-common-dir')));
  writeFileSync(path.join(commonDir, 'info', 'exclude'), '.scratch/peer-review/\n');

  writeFileSync(path.join(root, 'tracked-staged.txt'), 'staged change\n');
  git(root, 'add', 'tracked-staged.txt');
  writeFileSync(path.join(root, 'tracked-unstaged.txt'), 'unstaged change\n');
  mkdirSync(path.join(root, '.scratch', 'peer-review'), { recursive: true });
  writeFileSync(path.join(root, '.scratch', 'peer-review', 'probe'), 'ignored\n');
  writeFileSync(path.join(root, '.scratch', 'not-peer-review'), 'not ignored\n');
  writeFileSync(path.join(outside, 'file.md'), 'outside\n');
  symlinkSync(outside, path.join(root, 'docs', 'outside-link'));
  git(root, 'worktree', 'add', '-b', 'linked-fixture', linked, 'HEAD');

  // Git for Windows may expand an 8.3 tmpdir component (for example,
  // RUNNER~1) while Node preserves the spelling it was given. Derive the
  // expected roots through Git so the fixture compares canonical repository
  // identities rather than two valid spellings of the same directory.
  const canonicalRoot = realpathSync(git(root, 'rev-parse', '--show-toplevel'));
  const canonicalLinked = realpathSync(git(linked, 'rev-parse', '--show-toplevel'));
  const canonicalCommonDir = realpathSync(
    path.resolve(canonicalRoot, git(canonicalRoot, 'rev-parse', '--git-common-dir'))
  );

  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return {
    parent,
    root: canonicalRoot,
    linked: canonicalLinked,
    outside: realpathSync(outside),
    commonDir: canonicalCommonDir,
    fileMode: git(canonicalRoot, 'config', '--bool', 'core.filemode') === 'true',
    head,
    artifactBlob,
    artifactBytes,
    artifactDigest: sha256(artifactBytes),
    readArtifact: () => readFileSync(path.join(root, 'docs', 'artifact.md')),
  };
}
