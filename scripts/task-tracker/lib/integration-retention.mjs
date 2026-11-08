// @story #2145
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

const SHA = /^[0-9a-f]{40}$/;
export function integrationHead(git, ref) {
  const sha = git(['rev-parse', '--verify', `${ref}^{commit}`]);
  if (!SHA.test(sha)) throw new Error('integration: exact commit unavailable for ' + ref);
  return { ref, sha };
}
export function assertIntegrationHeads({ git, heads }) {
  for (const { ref, sha } of heads) {
    if (!SHA.test(sha) || integrationHead(git, ref).sha !== sha)
      throw new Error('integration: source or target changed: ' + ref);
  }
}
export function retainIntegrationHeads({ git, heads }) {
  if (typeof git !== 'function' || !Array.isArray(heads) || heads.length === 0)
    throw new TypeError('integration: heads and git required');
  assertIntegrationHeads({ git, heads });
  const mappings = heads.map(({ ref, sha }) => ({
    ref,
    sha,
    retainedRef: `refs/aitm/retained/integration/${sha}/${createHash('sha256').update(ref).digest('hex')}`,
  }));
  const read = (ref) => git(['for-each-ref', '--format=%(objectname)', ref]).trim();
  for (const mapping of mappings) {
    const existing = read(mapping.retainedRef);
    if (existing && existing !== mapping.sha)
      throw new Error('integration: retention ref conflict: ' + mapping.retainedRef);
  }
  for (const mapping of mappings) {
    if (read(mapping.retainedRef) === mapping.sha) continue;
    try {
      git(['update-ref', mapping.retainedRef, mapping.sha, '0'.repeat(40)]);
    } catch (error) {
      if (read(mapping.retainedRef) !== mapping.sha) throw error;
    }
  }
  assertIntegrationHeads({ git, heads });
  return mappings;
}
export function assertNoIntegrationOperation(git) {
  for (const marker of [
    'rebase-merge',
    'rebase-apply',
    'sequencer',
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'REBASE_HEAD',
    'BISECT_LOG',
  ]) {
    if (existsSync(git(['rev-parse', '--path-format=absolute', '--git-path', marker])))
      throw new Error(
        'integration: active Git operation ' + marker + '; preserve recovery context'
      );
  }
}
export function integrationEvidence(git) {
  return Boolean(
    git(['status', '--porcelain']) ||
    git(['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])
  );
}
export function assertNoIncomingEvidence(git, target) {
  const paths = [
    ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
    ...git(['ls-files', '--others', '--ignored', '--exclude-standard', '-z']).split('\0'),
  ].filter(Boolean);
  if (!paths.length) return;
  const incoming = git(['ls-tree', '-r', '--name-only', '-z', target]).split('\0').filter(Boolean);
  for (const local of paths) {
    if (
      incoming.some(
        (file) => file === local || file.startsWith(local + '/') || local.startsWith(file + '/')
      )
    )
      throw new Error('integration: untracked or ignored incoming collision: ' + local);
  }
}
