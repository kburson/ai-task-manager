import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalDecompositionJson } from '../../../../task-tracker/lib/decomposition-assessment.mjs';
import { decompositionPolicyIdentity } from '../../../../task-tracker/lib/decomposition-policy.mjs';
import { formatIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
export const subject = {
  repository: 'o/r',
  issue: 1987,
  projectId: 'PVT_a',
  projectItemId: 'PVTI_a',
};
export const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : canonicalDecompositionJson(value))
    .digest('hex');
export const observed = (value) => ({
  status: 'observed',
  value,
  revision: null,
  digest: hash(value),
});
export const unavailable = () => ({
  status: 'unavailable',
  value: null,
  revision: null,
  digest: null,
});
export function fixture(hours = 7) {
  let body = `## User Story\nAs a workspace operator\nI want current authority because interrupted intent can hide growth\nSo that incomplete inputs cannot restore permission\n\n## Scope\nCollect current authority.\n\n## Acceptance Criteria\n- [ ] Current inputs must agree. <!-- aitm-verified vc-list="vc:1" -->\n\n## Verification Commands\n- [ ] \`node verify.mjs\` <!-- id=1 -->\n\n## AITM Progress Markers\n${formatIssueFieldDb({ estimate: hours, size: 'M' })}\n<!-- aitm-last-known-state state="develop" ts="2026-10-11T12:00:00Z" -->\n`;
  const values = {
    project: {
      projectId: 'PVT_a',
      projectItemId: 'PVTI_a',
      estimate: hours,
      size: 'M',
      children: [],
    },
    plan: {
      path: null,
      commit: null,
      section: null,
      digest: null,
      availability: 'absent',
      content: null,
      references: null,
    },
    forecast: {
      estimate: hours,
      size: 'M',
      recordId: '01J00000000000000000000702',
      payloadHash: 'sha256:' + 'a'.repeat(64),
    },
    policy: decompositionPolicyIdentity(),
  };
  const writes = [];
  const deps = {
    findMainWorktreePath: (projectDir) => projectDir,
    readIssue: async () => observed({ number: 1987, body }),
    readProject: async () => observed(values.project),
    readSelectedPlan: async () => observed(values.plan),
    readForecast: async () => observed(values.forecast),
    readPolicy: async () => observed(values.policy),
    fetchBody: async () => body,
    pushBody: async (_repo, _issue, next) => {
      writes.push(next);
      body = next;
    },
    readBackIssue: async () => observed({ number: 1987, body }),
  };
  return {
    deps,
    values,
    writes,
    get body() {
      return body;
    },
    set body(value) {
      body = value;
    },
  };
}
export function publication(inputDigest, overrides = {}) {
  return {
    schema: 'aitm.decomposition-publication/v1',
    subject,
    operationId: 'b41d3bf2-e26e-477e-88d1-b2db32793001',
    writerId: 'inflate-estimate',
    beforeInputDigest: inputDigest,
    intendedInputDigest: hash('intended'),
    proposal: { estimate: { basis: 'proposed', hours: 25, proposalId: 'proposal-a' }, size: 'M' },
    effects: [
      {
        id: 'estimate',
        resource: 'project-estimate',
        targetIdentity: 'PVTI_a',
        intendedDigest: hash('25'),
        status: 'pending',
        observedDigest: null,
      },
    ],
    status: 'pending',
    supersedes: null,
    createdAt: '2026-10-11T12:00:00Z',
    updatedAt: '2026-10-11T12:00:00Z',
    ...overrides,
  };
}

export function freshUnitDir(prefix) {
  const dir = path.join(projectScratchDir('inspect'), prefix + process.pid + '-' + randomUUID());
  mkdirSync(dir, { recursive: true });
  return dir;
}
