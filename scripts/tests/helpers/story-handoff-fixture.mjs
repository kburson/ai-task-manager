// @story #2039 #2057
// Synthetic offline archive; no actor, cloud grant or lifecycle evidence.
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../../task-tracker/lib/github-records/canonical-json.mjs';
import { storyIdentityKey } from '../../task-tracker/lib/story-cache/manifest.mjs';
import { storyCachePath } from '../../task-tracker/lib/story-cache/store.mjs';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const identity = {
  host: 'github.com',
  repository: 'owner/repo',
  issueNumber: 2057,
  issueNodeId: 'I_test',
  projectId: 'P_test',
  projectItemId: 'PI_test',
};
export function handoffBundle() {
  const sourceClaim = {
    schema: 'aitm.story-writer-claim/v1',
    claimId: 'claim-A',
    identityKey: storyIdentityKey(identity),
    human: 'tester',
    sessionId: 'author-A',
    worktree: '/project',
    cachePath: storyCachePath({ projectRoot: '/project', identity }),
    status: 'owned',
    transfer: null,
    registryKey: hash(canonicalRecordJson(['github.com', 'owner/repo', 2057])),
  };
  const target = {
    human: 'tester',
    sessionId: 'author-B',
    worktree: '/recipient',
    cachePath: storyCachePath({ projectRoot: '/recipient', identity }),
  };
  const raw = Buffer.from('pending work');
  return {
    manifest: {
      schema: 'aitm.story-writer-handoff/v1',
      transferId: 'transfer-A',
      identity: { ...identity },
      registryId: 'registry-A',
      sourceClaim,
      target,
      directories: ['generations', 'manifests', 'payloads'],
      files: [{ path: 'payloads/pending.txt', digest: hash(raw), size: 12 }],
    },
    payloads: new Map([['payloads/pending.txt', raw]]),
  };
}

// Valid native generation; actors/content are explicit synthetic test inputs.
export async function handoffGeneration(claimId) {
  const { observeContent } =
    await import('../../task-tracker/lib/story-cache/native-observation.mjs');
  const { body: ignored, ...observation } = observeContent({
    identity,
    node: {
      id: identity.issueNodeId,
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body: 'base story',
  });
  void ignored;
  return {
    claimId,
    generation: {
      schema: 'aitm.story-cache-generation/v1',
      identity: { ...identity },
      generation: 1,
      publicationGeneration: 0,
      baseSnapshot: {
        identity: { ...identity },
        title: 'Title',
        titleDigest: hash('Title'),
        resources: { 'issue:I_test': { ...observation, payloadPath: 'base/body.md' } },
        inventory: [],
        assignees: ['tester'],
        fields: [],
        fieldsDigest: hash(
          canonicalRecordJson({ canonicalizationVersion: 'aitm.canonical-json/v1', fields: [] })
        ),
        complete: true,
        coverage: { dispatches: 1, bytes: 1, measurement: 'returned-utf8-json', atomic: false },
      },
      working: {
        'issue:I_test': {
          payloadPath: 'working/body.md',
          digest: hash('private unpublished body'),
          kind: 'issue',
          capabilityRef: null,
        },
      },
      dirtyKeys: ['issue:I_test'],
      timing: {
        events: [],
        ingestedCursor: 'retained-ingested-cursor',
        publishedCursor: null,
        canonicalCommentKey: 'retained-comment-key',
      },
      batch: null,
      conflicts: [],
    },
    payloads: new Map([
      ['base/body.md', 'base story'],
      ['working/body.md', 'private unpublished body'],
    ]),
  };
}
