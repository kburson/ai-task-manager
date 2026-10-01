// @story #1859
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import {
  readRecordingAuthority,
  validateLocalEvidence,
  validateArtifacts,
} from '../../../../task-tracker/lib/reviewed-scope/runtime.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'reviewed-runtime-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'evidence'));
  await fs.writeFile(path.join(root, 'evidence/a.txt'), 'inspected bytes');
  const authority = {
    repository: 'owner/repo',
    issue: 1859,
    worktree: root,
    branch: 'codex/1859',
    head: 'a'.repeat(40),
    actor: { id: '42', login: 'owner' },
    state: 'develop',
    assignees: ['owner'],
  };
  const manifest = {
    schema: 'aitm.reviewed-scope-evidence/v1',
    repository: authority.repository,
    issue: authority.issue,
    worktree: root,
    branch: authority.branch,
    head: authority.head,
    label: 'Inspect output',
    provenance: { kind: 'operator-inspection' },
    rationale: 'The attached bytes were inspected.',
    artifacts: [{ path: 'evidence/a.txt', sha256: hash('inspected bytes') }],
  };
  const manifestBytes = Buffer.from(canonicalRecordJson(manifest) + '\n');
  await fs.writeFile(path.join(root, 'manifest.json'), manifestBytes);
  const deps = {
    fs,
    resolveCurrentSessionWorktreeBinding: () => ({
      issueNumber: 1859,
      worktreePath: root,
      worktreeBranch: authority.branch,
    }),
    readWorktreeIdentity: ({ projectDir }) => ({
      worktreePath: projectDir,
      worktreeBranch: authority.branch,
    }),
    readBoundState: () => ({ activeIssue: '#1859', state: 'develop' }),
    fetchAssignmentSnapshot: async () => ({ state: 'develop', assignees: ['OWNER'] }),
    pexec: async (file, args, opts) => {
      if (file === 'git') {
        assert.deepEqual(args, ['rev-parse', '--verify', 'HEAD']);
        assert.equal(opts.cwd, root);
        return { stdout: authority.head + '\n' };
      }
      assert.equal(file, 'gh');
      assert.equal(args[1], 'user');
      return { stdout: '{"id":"42","login":"Owner"}' };
    },
  };
  return { root, authority, manifest, manifestBytes, manifestPath: 'manifest.json', deps };
}
test('recording authority resolves the bound checkout, live owner and authenticated actor', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(
    await readRecordingAuthority({
      projectDir: f.root,
      invokingDir: f.root,
      issueNumber: 1859,
      cfg: { repo: 'owner/repo' },
      deps: f.deps,
    }),
    { ...f.authority, assignees: ['OWNER'] }
  );
});
for (const [name, change, code] of [
  ['foreign invocation', (f) => ({ invokingDir: path.dirname(f.root) }), 'reviewed-scope-worktree'],
  [
    'wrong bound issue',
    (f) => {
      f.deps.readBoundState = () => ({ activeIssue: '#1', state: 'develop' });
    },
    'reviewed-scope-issue',
  ],
  [
    'detached branch',
    (f) => {
      f.deps.readWorktreeIdentity = () => ({ worktreePath: f.root, worktreeBranch: 'HEAD' });
    },
    'reviewed-scope-branch',
  ],
  [
    'branch drift',
    (f) => {
      f.deps.readWorktreeIdentity = () => ({ worktreePath: f.root, worktreeBranch: 'changed' });
    },
    'reviewed-scope-branch',
  ],
  [
    'missing assignment',
    (f) => {
      f.deps.fetchAssignmentSnapshot = async () => ({ state: 'develop', assignees: [] });
    },
    'reviewed-scope-actor',
  ],
  [
    'ambiguous assignment',
    (f) => {
      f.deps.fetchAssignmentSnapshot = async () => ({
        state: 'develop',
        assignees: ['owner', 'other'],
      });
    },
    'reviewed-scope-actor',
  ],
  [
    'actor mismatch',
    (f) => {
      f.deps.fetchAssignmentSnapshot = async () => ({ state: 'develop', assignees: ['other'] });
    },
    'reviewed-scope-actor',
  ],
  [
    'Review stage',
    (f) => {
      f.deps.fetchAssignmentSnapshot = async () => ({ state: 'review', assignees: ['owner'] });
    },
    'reviewed-scope-state',
  ],
])
  test(`authority refuses ${name}`, async (t) => {
    const f = await fixture(t);
    const overrides = change(f) || {};
    await assert.rejects(
      () =>
        readRecordingAuthority({
          projectDir: f.root,
          invokingDir: f.root,
          issueNumber: 1859,
          cfg: { repo: 'owner/repo' },
          deps: f.deps,
          ...overrides,
        }),
      { code }
    );
  });
test('local evidence hashes original manifest bytes including final LF', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await validateLocalEvidence(f), {
    manifestDigest: hash(f.manifestBytes),
    artifactDigests: f.manifest.artifacts,
  });
  assert.deepEqual(await validateArtifacts(f), f.manifest.artifacts);
});
for (const [name, mutate, code] of [
  [
    'escape',
    async (f) => {
      f.manifest.artifacts[0].path = '../outside';
    },
    'reviewed-scope-artifact-path',
  ],
  [
    'final symlink',
    async (f) => {
      await fs.unlink(path.join(f.root, 'evidence/a.txt'));
      await fs.symlink('manifest.json', path.join(f.root, 'evidence/a.txt'));
    },
    'reviewed-scope-artifact-path',
  ],
  [
    'intermediate symlink',
    async (f) => {
      await fs.rename(path.join(f.root, 'evidence'), path.join(f.root, 'real'));
      await fs.symlink('real', path.join(f.root, 'evidence'));
    },
    'reviewed-scope-artifact-path',
  ],
  [
    'directory',
    async (f) => {
      await fs.unlink(path.join(f.root, 'evidence/a.txt'));
      await fs.mkdir(path.join(f.root, 'evidence/a.txt'));
    },
    'reviewed-scope-artifact-path',
  ],
  [
    'changed bytes',
    async (f) => {
      await fs.writeFile(path.join(f.root, 'evidence/a.txt'), 'changed');
    },
    'reviewed-scope-artifact-digest',
  ],
  [
    'hardlink aliases',
    async (f) => {
      await fs.link(path.join(f.root, 'evidence/a.txt'), path.join(f.root, 'evidence/b.txt'));
      f.manifest.artifacts.push({ ...f.manifest.artifacts[0], path: 'evidence/b.txt' });
    },
    'reviewed-scope-artifact-path',
  ],
  [
    'HEAD drift',
    async (f) => {
      f.authority.head = 'b'.repeat(40);
    },
    'reviewed-scope-head',
  ],
])
  test(`artifacts refuse ${name}`, async (t) => {
    const f = await fixture(t);
    await mutate(f);
    await assert.rejects(() => validateArtifacts(f), { code });
  });
test('manifest bytes must agree with both disk and parsed manifest', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'manifest.json'), f.manifestBytes.subarray(0, -1));
  await assert.rejects(() => validateLocalEvidence(f), { code: 'reviewed-scope-manifest-changed' });
});
test('read-only evidence context and bound manifest remain available outside recording stages', async (t) => {
  const { readEvidenceContext, readBoundManifest } =
    await import('../../../../task-tracker/lib/reviewed-scope/runtime.mjs');
  const f = await fixture(t);
  f.deps.readBoundState = () => ({ activeIssue: '#1859', state: 'review' });
  f.deps.fetchAssignmentSnapshot = () => assert.fail('read-only context does not read assignment');
  const context = await readEvidenceContext({
    projectDir: f.root,
    invokingDir: f.root,
    issueNumber: 1859,
    cfg: { repo: 'owner/repo' },
    deps: f.deps,
  });
  assert.equal(context.state, 'review');
  assert.equal(context.head, 'a'.repeat(40));
  assert.deepEqual(await readBoundManifest('manifest.json', context), f.manifestBytes);
  await assert.rejects(() => readBoundManifest(path.join(f.root, 'manifest.json'), context), {
    code: 'reviewed-scope-artifact-path',
  });
});
test('device-like FIFO is refused before opening', async (t) => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const f = await fixture(t);
  await fs.unlink(path.join(f.root, 'evidence/a.txt'));
  await promisify(execFile)('mkfifo', [path.join(f.root, 'evidence/a.txt')]);
  await assert.rejects(() => validateArtifacts(f), { code: 'reviewed-scope-artifact-path' });
});
test('oversized artifacts stop at the bounded read and refuse', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'evidence/a.txt'), Buffer.alloc(4194305));
  await assert.rejects(() => validateArtifacts(f), { code: 'reviewed-scope-artifact-size' });
});
test('path replacement during descriptor read refuses', async (t) => {
  const f = await fixture(t);
  let opened = false;
  const raceFs = {
    ...fs,
    open: async (...args) => {
      const handle = await fs.open(...args);
      const read = handle.read.bind(handle);
      handle.read = async (...params) => {
        const result = await read(...params);
        if (!opened) {
          opened = true;
          await fs.rename(path.join(f.root, 'evidence/a.txt'), path.join(f.root, 'old.txt'));
          await fs.writeFile(path.join(f.root, 'evidence/a.txt'), 'inspected bytes');
        }
        return result;
      };
      return handle;
    },
  };
  await assert.rejects(() => validateArtifacts({ ...f, deps: { fs: raceFs } }), {
    code: 'reviewed-scope-artifact-changed',
  });
});
