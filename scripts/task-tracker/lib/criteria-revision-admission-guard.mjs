// @story #1855
import { evaluateRevisionAdmission } from './criteria-revision/policy.mjs';

export const GUARD_ID = 'criteria-revision-admission';
export const criteriaRevisionAdmissionGuard = Object.freeze({
  id: 'criteria-revision-admission',
  async run(ctx) {
    const result = await evaluateRevisionAdmission({ repository: ctx?.cfg?.repo,
      issue: ctx?.issueNumber, backend: ctx?.deps?.revisionBackend, projectDir: ctx?.projectDir });
    if (result.status === 'ready') return { ok: true };
    // Every native emission is closed and visible to the source conformance
    // scanner. Unknown diagnostic values fail closed to unavailable authority.
    switch (result.code) {
      case 'revision-pending':
        return { ok: false, code: 'revision-pending', args: {}, noAutomaticRemediation: { reason: 'authority-investigation-required' } };
      case 'revision-conflict':
        return { ok: false, code: 'revision-conflict', args: {}, noAutomaticRemediation: { reason: 'authority-investigation-required' } };
      case 'revision-approval-stale':
        return { ok: false, code: 'revision-approval-stale', args: {}, noAutomaticRemediation: { reason: 'authority-investigation-required' } };
      case 'revision-topology-unsupported':
        return { ok: false, code: 'revision-topology-unsupported', args: {}, noAutomaticRemediation: { reason: 'authority-investigation-required' } };
      default:
        return { ok: false, code: 'revision-authority-unavailable', args: {}, noAutomaticRemediation: { reason: 'authority-investigation-required' } };
    }
  },
});
