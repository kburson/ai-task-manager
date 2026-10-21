import { execFileSync as nodeExecFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { resolveContainedPath } from '../collateral/paths.mjs';
import { AprError } from '../errors.mjs';
import { atomicCreate } from '../protocol/store.mjs';

function fail(code, message, recovery, details = {}, cause) {
  const error = new AprError(code, message, { recovery, details });
  error.cause = cause;
  throw error;
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function indexEntries(bytes) {
  return bytes
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const match = /^(\d{6}) ([0-9a-f]+) (\d+)\t([\s\S]+)$/.exec(entry);
      if (!match) {
        fail(
          'APR_GIT_INDEX_INVALID',
          'Git returned an invalid index entry.',
          'Repair the Git index and retry the peer-review command.'
        );
      }
      return Object.freeze({
        mode: match[1],
        blob: match[2],
        stage: Number(match[3]),
        path: match[4],
      });
    });
}

function validateText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    fail('APR_GIT_TRANSACTION_INVALID', `${label} is invalid.`, 'Use canonical commit metadata.');
  }
}

function commitMessage(message, trailers) {
  validateText(message, 'Commit message');
  const trailerLines = Object.entries(trailers).map(([key, value]) => {
    validateText(key, 'Commit trailer name');
    validateText(value, `Commit trailer ${key}`);
    return `${key}: ${value}`;
  });
  return `${message.trim()}\n\n${trailerLines.join('\n')}`;
}

export function createGitTransactionRepository(cwd, { execFileSync = nodeExecFileSync } = {}) {
  function run(args, { buffer = false, allowStatuses = [] } = {}) {
    try {
      return execFileSync('git', args, {
        cwd: root,
        encoding: buffer ? null : 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
    } catch (cause) {
      if (allowStatuses.includes(cause?.status)) return null;
      fail(
        'APR_GIT_TRANSACTION_FAILED',
        `Git transaction command failed: git ${args.join(' ')}`,
        'Preserve the repository state, inspect the failure, and retry the exact submission.',
        { argv: Object.freeze([...args]) },
        cause
      );
    }
  }

  let root;
  try {
    root = realpathSync(
      String(
        execFileSync('git', ['rev-parse', '--show-toplevel'], {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
        })
      ).trim()
    );
  } catch (cause) {
    fail(
      'APR_REPOSITORY_NOT_FOUND',
      'Git transaction requires a physical worktree.',
      'Run the command inside the event-authorized Git worktree.',
      { cwd: path.resolve(cwd) },
      cause
    );
  }

  function contained(relative) {
    return resolveContainedPath(root, relative, 'transaction path');
  }

  function head() {
    return String(run(['rev-parse', 'HEAD'])).trim();
  }

  function hashWorking(relative) {
    const resolved = contained(relative);
    return String(run(['hash-object', '--', resolved.relative])).trim();
  }

  function workingMode(relative) {
    const resolved = contained(relative);
    const stat = lstatSync(resolved.absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(
        'APR_GIT_SEAL_MISMATCH',
        'A sealed transaction path is not a regular file.',
        `Restore the exact regular file for ${relative} and retry.`
      );
    }
    return stat.mode & 0o111 ? '100755' : '100644';
  }

  function modeAt(revision, relative) {
    const resolved = contained(relative);
    const value = String(run(['ls-tree', revision, '--', resolved.relative])).trim();
    const match = /^(\d{6}) blob [0-9a-f]+\t/.exec(value);
    if (!match) {
      fail(
        'APR_GIT_SEAL_MISMATCH',
        'A sealed transaction path has no regular-file mode at authority.',
        `Restore ${relative} at ${revision} and retry.`
      );
    }
    return match[1];
  }

  function snapshotIndexOutside(ownedPaths) {
    const owned = new Set(ownedPaths);
    return Object.freeze(
      indexEntries(run(['ls-files', '--stage', '-z'], { buffer: true })).filter(
        (entry) => !owned.has(entry.path)
      )
    );
  }

  function assertNoOwnedOverlap(ownedPaths) {
    for (const relative of ownedPaths) {
      contained(relative);
      const clean = run(['diff', '--cached', '--quiet', 'HEAD', '--', relative], {
        allowStatuses: [1],
      });
      if (clean === null) {
        fail(
          'APR_GIT_OWNED_PATH_OVERLAP',
          'A protocol-owned path already has staged changes.',
          `Restore the index entry for ${relative} without discarding working bytes, then retry.`,
          { path: relative }
        );
      }
    }
  }

  function addPaths(ownedPaths) {
    run(['add', '-A', '--', ...ownedPaths]);
  }

  function trackedPaths(ownedPaths) {
    const owned = new Set(ownedPaths);
    const tracked = run(['ls-files', '-z', '--', ...ownedPaths], { buffer: true })
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .sort();
    if (tracked.some((relative) => !owned.has(relative))) {
      fail(
        'APR_GIT_INDEX_CHANGED',
        'Git reported a tracked path outside the relocation transaction.',
        'Preserve the repository and inspect the owned path set before retrying.'
      );
    }
    return Object.freeze(tracked);
  }

  function stagedOwnedPaths(ownedPaths) {
    const owned = new Set(ownedPaths);
    const staged = run(['diff', '--cached', '--name-only', '-z', 'HEAD', '--', ...ownedPaths], {
      buffer: true,
    })
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .sort();
    if (staged.some((relative) => !owned.has(relative))) {
      fail(
        'APR_GIT_INDEX_CHANGED',
        'Git staged a path outside the relocation transaction.',
        'Preserve the repository and restore the unrelated index entries before retrying.'
      );
    }
    return Object.freeze(staged);
  }

  function changedOwnedPaths(ownedPaths) {
    const owned = new Set(ownedPaths);
    const changed = run(['diff', '--name-only', '-z', 'HEAD', '--', ...ownedPaths], {
      buffer: true,
    })
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .sort();
    if (changed.some((relative) => !owned.has(relative))) {
      fail(
        'APR_GIT_INDEX_CHANGED',
        'Git reported a changed path outside the relocation transaction.',
        'Preserve the repository and inspect the owned path set before retrying.'
      );
    }
    return Object.freeze(changed);
  }

  function assertIndexAndWorktreeBytes(sealedPaths) {
    for (const sealed of sealedPaths) {
      const resolved = contained(sealed.path);
      let stat;
      let working;
      try {
        stat = lstatSync(resolved.absolute);
        working = readFileSync(resolved.absolute);
      } catch (cause) {
        fail(
          'APR_GIT_SEAL_MISMATCH',
          'A sealed transaction path cannot be read.',
          `Restore the exact sealed bytes for ${sealed.path} and retry.`,
          { path: sealed.path },
          cause
        );
      }
      if (!stat.isFile() || stat.isSymbolicLink() || !working.equals(sealed.bytes)) {
        fail(
          'APR_GIT_SEAL_MISMATCH',
          'Working bytes differ from the sealed transaction.',
          `Restore the exact sealed bytes for ${sealed.path} and retry.`,
          { path: sealed.path }
        );
      }
      const workingFileMode = stat.mode & 0o111 ? '100755' : '100644';
      const stagedEntry = indexEntries(
        run(['ls-files', '--stage', '-z', '--', sealed.path], { buffer: true })
      ).find((entry) => entry.path === sealed.path && entry.stage === 0);
      if (workingFileMode !== sealed.mode || stagedEntry?.mode !== sealed.mode) {
        fail(
          'APR_GIT_SEAL_MISMATCH',
          'Working or index mode differs from the sealed transaction.',
          `Restore mode ${sealed.mode} for ${sealed.path} and retry.`,
          {
            path: sealed.path,
            expected: sealed.mode,
            working: workingFileMode,
            index: stagedEntry?.mode,
          }
        );
      }
      const staged = run(['show', `:${sealed.path}`], { buffer: true });
      if (!staged.equals(sealed.bytes) || digest(staged) !== sealed.digest) {
        fail(
          'APR_GIT_SEAL_MISMATCH',
          'Index bytes differ from the sealed transaction.',
          `Stage only the exact sealed bytes for ${sealed.path} and retry.`,
          { path: sealed.path }
        );
      }
    }
  }

  function assertOutsideIndex(before, ownedPaths) {
    const after = snapshotIndexOutside(ownedPaths);
    if (!same(after, before)) {
      fail(
        'APR_GIT_INDEX_CHANGED',
        'Unrelated staged object IDs changed during the transaction.',
        'Preserve the repository and restore the unrelated index entries before retrying.'
      );
    }
  }

  function commitOnly(ownedPaths, message, trailers) {
    const body = commitMessage(message, trailers);
    run(['commit', '--only', '-m', body, '--', ...ownedPaths]);
    return head();
  }

  function assertCommitPaths(commit, ownedPaths) {
    const actual = String(
      run(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', commit], { buffer: true })
    )
      .split('\0')
      .filter(Boolean)
      .sort();
    const expected = [...ownedPaths].sort();
    if (!same(actual, expected)) {
      fail(
        'APR_GIT_COMMIT_INVALID',
        'The created commit path set differs from the sealed transaction.',
        'Preserve the commit and inspect its exact tree before any recovery.',
        { commit, actual, expected }
      );
    }
  }

  function transactionFile(trailers) {
    const reviewId = trailers['Peer-Review-ID'];
    const turn = trailers['Peer-Review-Turn'];
    if (
      typeof reviewId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(reviewId) ||
      typeof turn !== 'string' ||
      !/^[1-9][0-9]*$/.test(turn)
    ) {
      fail(
        'APR_GIT_TRANSACTION_INVALID',
        'Review identity trailers cannot name a transaction journal.',
        'Use the event-authorized Peer-Review-ID and Peer-Review-Turn trailers.'
      );
    }
    const value = String(
      run(['rev-parse', '--git-path', `ai-peer-review/transactions/${reviewId}-${turn}.json`])
    ).trim();
    return path.isAbsolute(value) ? value : path.resolve(root, value);
  }

  function readTransaction(trailers) {
    const file = transactionFile(trailers);
    try {
      return Object.freeze({ file, record: JSON.parse(readFileSync(file, 'utf8')) });
    } catch (cause) {
      if (cause?.code === 'ENOENT') return Object.freeze({ file, record: null });
      fail(
        'APR_GIT_RECOVERY_INVALID',
        'The transaction journal cannot be read.',
        `Preserve ${file}, inspect it, and retry only after restoring exact JSON.`,
        { file },
        cause
      );
    }
  }

  function writeTransaction(file, record) {
    atomicCreate(file, Buffer.from(`${JSON.stringify(record, null, 2)}\n`));
  }

  function assertCommit(commit, sealedPaths, message, trailers) {
    let parent;
    try {
      parent = String(run(['rev-parse', `${commit}^`])).trim();
    } catch {
      fail(
        'APR_GIT_RECOVERY_INVALID',
        'The recovery commit has no verifiable parent.',
        'Inspect the commit and retry only from the exact pre-transaction HEAD.',
        { commit }
      );
    }
    const body = String(run(['show', '-s', '--format=%B', commit])).trimEnd();
    if (body !== commitMessage(message, trailers)) {
      fail(
        'APR_GIT_COMMIT_INVALID',
        'The recovery commit message or trailers differ from authority.',
        'Preserve the commit and restore the exact event-authorized transaction.',
        { commit }
      );
    }
    for (const sealed of sealedPaths) {
      const bytes = run(['show', `${commit}:${sealed.path}`], { buffer: true });
      const mode = modeAt(commit, sealed.path);
      if (!bytes.equals(sealed.bytes) || digest(bytes) !== sealed.digest || mode !== sealed.mode) {
        fail(
          'APR_GIT_COMMIT_INVALID',
          'The recovery commit bytes differ from the sealed transaction.',
          'Preserve the commit and inspect the mismatched owned path.',
          { commit, path: sealed.path }
        );
      }
    }
    return parent;
  }

  return Object.freeze({
    root,
    head,
    hashWorking,
    workingMode,
    modeAt,
    snapshotIndexOutside,
    assertNoOwnedOverlap,
    addPaths,
    trackedPaths,
    stagedOwnedPaths,
    changedOwnedPaths,
    assertIndexAndWorktreeBytes,
    assertOutsideIndex,
    commitOnly,
    assertCommitPaths,
    readTransaction,
    writeTransaction,
    assertCommit,
  });
}

function validateSealed(sealed) {
  if (!sealed || !Array.isArray(sealed.paths) || !sealed.paths.length) {
    fail(
      'APR_GIT_TRANSACTION_INVALID',
      'Sealed transaction paths are required.',
      'Pass the exact event-authorized sealed paths.'
    );
  }
  const names = sealed.paths.map((entry) => entry?.path);
  if (names.some((name) => typeof name !== 'string') || new Set(names).size !== names.length) {
    fail(
      'APR_GIT_TRANSACTION_INVALID',
      'Sealed transaction paths must be unique.',
      'Pass each event-authorized path exactly once.'
    );
  }
  for (const entry of sealed.paths) {
    if (
      !Buffer.isBuffer(entry.bytes) ||
      digest(entry.bytes) !== entry.digest ||
      !['100644', '100755'].includes(entry.mode)
    ) {
      fail(
        'APR_GIT_SEAL_MISMATCH',
        'Sealed bytes do not match their digest.',
        `Re-seal ${entry.path} from event-authorized bytes.`
      );
    }
  }
}

export function commitExactPaths(repository, sealed, message, trailers) {
  validateSealed(sealed);
  if (!repository || typeof repository.head !== 'function') {
    fail(
      'APR_GIT_TRANSACTION_INVALID',
      'Git transaction repository is invalid.',
      'Create the repository adapter from the event-authorized physical worktree.'
    );
  }
  const ownedPaths = sealed.paths.map((entry) => entry.path);
  const commitPaths = sealed.commit_paths ?? ownedPaths;
  if (
    !Array.isArray(commitPaths) ||
    !commitPaths.length ||
    commitPaths.some((relative) => !ownedPaths.includes(relative)) ||
    new Set(commitPaths).size !== commitPaths.length
  ) {
    fail(
      'APR_GIT_TRANSACTION_INVALID',
      'Commit path set must be a non-empty subset of sealed paths.',
      'Use the exact paths whose bytes differ from the event-authorized HEAD.'
    );
  }
  const request = Object.freeze({
    schema: 'ai-peer-review.git-transaction/v1',
    expected_head: sealed.expected_head,
    paths: sealed.paths.map(({ path: relative, digest: value, mode }) => ({
      path: relative,
      digest: value,
      mode,
    })),
    commit_paths: [...commitPaths],
    message: message.trim(),
    trailers: { ...trailers },
  });
  const journal = repository.readTransaction(trailers);
  let before;
  if (journal.record === null) {
    const current = repository.head();
    if (current !== sealed.expected_head) {
      fail(
        'APR_GIT_HEAD_CHANGED',
        'Repository HEAD changed before the transaction.',
        'Inspect HEAD and retry only through exact transaction recovery.',
        { expected: sealed.expected_head, actual: current }
      );
    }
    before = repository.snapshotIndexOutside(ownedPaths);
    repository.checkpoint?.('index-snapshotted');
    repository.assertNoOwnedOverlap(ownedPaths);
    repository.checkpoint?.('owned-overlap-checked');
    repository.writeTransaction(journal.file, { ...request, outside_index: before });
  } else {
    const { outside_index: outsideIndex, ...priorRequest } = journal.record;
    if (!Array.isArray(outsideIndex) || !same(priorRequest, request)) {
      fail(
        'APR_GIT_RECOVERY_INVALID',
        'The transaction retry differs from its durable journal.',
        `Preserve ${journal.file} and retry the exact original transaction.`,
        { file: journal.file }
      );
    }
    before = outsideIndex;
  }
  const current = repository.head();
  if (current !== sealed.expected_head) {
    repository.assertCommitPaths(current, commitPaths);
    const parent = repository.assertCommit(current, sealed.paths, message, trailers);
    if (parent !== sealed.expected_head) {
      fail(
        'APR_GIT_HEAD_CHANGED',
        'The recovery commit is not based on the event-authorized HEAD.',
        'Inspect HEAD and restore the exact transaction ancestry before retrying.',
        { expected: sealed.expected_head, parent, actual: current }
      );
    }
    repository.assertOutsideIndex(before, ownedPaths);
    return Object.freeze({
      commit: current,
      paths: Object.freeze([...ownedPaths]),
      trailers: Object.freeze({ ...trailers }),
      recovered: true,
    });
  }
  repository.addPaths(ownedPaths);
  repository.checkpoint?.('owned-paths-staged');
  repository.assertIndexAndWorktreeBytes(sealed.paths);
  repository.checkpoint?.('sealed-bytes-checked');
  repository.assertOutsideIndex(before, ownedPaths);
  repository.checkpoint?.('outside-index-checked');
  const commit = repository.commitOnly(commitPaths, message, trailers);
  repository.checkpoint?.('commit-created');
  repository.assertCommitPaths(commit, commitPaths);
  repository.checkpoint?.('commit-paths-checked');
  repository.assertOutsideIndex(before, ownedPaths);
  repository.checkpoint?.('outside-index-rechecked');
  return Object.freeze({
    commit,
    paths: Object.freeze([...ownedPaths]),
    trailers: Object.freeze({ ...trailers }),
    recovered: false,
  });
}
