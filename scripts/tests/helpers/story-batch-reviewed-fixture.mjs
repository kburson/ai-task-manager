// @story #2039 #2047
// Load before any native module. Capture only test fixture capabilities; delegate real validation.
import { registerHooks } from 'node:module';
const captureKey = Symbol.for('2047.native-reviewed-input');
const nativeRecord = new URL('../../task-tracker/lib/reviewed-scope/record.mjs', import.meta.url)
  .href;
const nativeMutator = new URL('../../task-tracker/lib/issue-body-mutate.mjs', import.meta.url).href;
// Observe the real minted capability, then delegate to the real mutator unchanged.
const captureHook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === nativeRecord && specifier === '../issue-body-mutate.mjs') {
      const source = `import {mutateIssueBody as actual} from ${JSON.stringify(nativeMutator)};
export async function mutateIssueBody(input) {
  globalThis[Symbol.for('2047.native-reviewed-input')]?.(input);
  return actual(input);
}`;
      return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
export function finishReviewedCaptureBootstrap() {
  captureHook.deregister();
}
export async function reviewedOperation(worktree) {
  const { identity, hash } = await import('./story-timing-candidate-fixture.mjs');
  const { canonicalRecordJson } =
    await import('../../task-tracker/lib/github-records/canonical-json.mjs');
  const { POLICY_MARKER } = await import('../../task-tracker/lib/reviewed-scope/model.mjs');
  const reviewed = await import(nativeRecord);
  const authority = {
    repository: identity.repository,
    issue: identity.issueNumber,
    worktree,
    branch: 'feature/child/2057',
    head: 'b'.repeat(40),
    actor: { id: '123', login: 'owner' },
    state: 'develop',
  };
  const manifest = {
    schema: 'aitm.reviewed-scope-evidence/v1',
    ...Object.fromEntries(
      ['repository', 'issue', 'worktree', 'branch', 'head'].map((key) => [key, authority[key]])
    ),
    label: 'Inspect frozen output',
    rationale: 'Retained offline inspection.',
    provenance: { kind: 'operator-inspection' },
    artifacts: [{ path: 'output.txt', sha256: hash('output') }],
  };
  const bytes = Buffer.from(canonicalRecordJson(manifest) + '\n');
  let body = `## Scope\n${POLICY_MARKER}\n- [ ] Inspect frozen output\n\n## Acceptance Criteria\n- [ ] Other output\n`;
  const base = body;
  const comments = new Map();
  let retained;
  globalThis[captureKey] = (input) => {
    retained = input.reviewedEvidenceCapability;
  };
  const deps = {
    readRecordingAuthority: async () => authority,
    readBoundManifest: async () => bytes,
    validateLocalEvidence: async () => ({ manifestDigest: hash(bytes) }),
    readLiveBody: async () => body,
    readComment: async ({ commentId }) => comments.get(commentId),
    listComments: async () => [...comments.values()],
    createComment: async ({ body: content }) => {
      const comment = {
        id: '1',
        body: content,
        user: { id: '123' },
        issue_url: `https://api.github.com/repos/${identity.repository}/issues/${identity.issueNumber}`,
      };
      comments.set('1', comment);
      return comment;
    },
    fetchBody: async () => body,
    pushBody: async (_repo, _issue, next) => {
      body = next;
    },
    now: () => '2026-10-22T00:00:00.000Z',
    warn: () => {},
  };
  try {
    await reviewed.recordReviewedScope({
      ctx: {
        cfg: { repo: identity.repository },
        projectDir: authority.worktree,
        issueNumber: identity.issueNumber,
        deps: { reviewedScope: deps },
      },
      label: 'Inspect frozen output',
      manifestPath: 'manifest.json',
    });
  } finally {
    delete globalThis[captureKey];
  }
  if (!retained) throw new Error('native coordinator did not mint a capability');
  const nativeLine = body
    .split('\n')
    .find((line) => line.startsWith('- [x] Inspect frozen output'));
  if (!nativeLine) throw new Error('native coordinator did not stamp the reviewed target');
  // Retain the exact grant row; the live mutator's transport version is not a staged edit.
  return {
    base,
    candidate: base.replace('- [ ] Inspect frozen output', nativeLine),
    capability: { reviewedEvidenceCapability: retained },
  };
}
