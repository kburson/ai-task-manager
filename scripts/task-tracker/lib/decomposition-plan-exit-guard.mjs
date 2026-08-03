import { readFileSync } from 'node:fs';

import { projectValuesForIssue } from '../../gh/lib/github-projects.mjs';
import { getProjectDir } from '../paths.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import {
  classifyDecomposition,
  linkedPlanPath,
  parseDecompositionWaiver,
  resolvePlanPath,
} from './decomposition-policy.mjs';

export const DECOMPOSITION_PLAN_EXIT_GUARD_ID = 'plan-exit-decomposition';

function planTextFromResolved(resolved, readFile) {
  if (!resolved.path) return { planText: '', planDiagnostic: resolved };
  try {
    return { planText: readFile(resolved.path, 'utf8'), planDiagnostic: resolved };
  } catch (error) {
    return {
      planText: '',
      planDiagnostic: {
        ...resolved,
        path: null,
        diagnostic: `plan path could not be read: ${error.message}`,
      },
    };
  }
}

export async function evaluateIssueDecomposition({
  issueNumber,
  cfg,
  body = '',
  planOverride = null,
  deps = {},
} = {}) {
  if (!Number.isInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
    throw new Error('evaluateIssueDecomposition: issueNumber must be a positive integer');
  }
  if (!cfg) throw new Error('evaluateIssueDecomposition: cfg is required');
  const runtime = deps.decomposition || deps;
  const loadFields = runtime.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchValues = runtime.projectValuesForIssue || projectValuesForIssue;
  const projectDir = runtime.projectDir || getProjectDir();
  const readFile = runtime.readFile || readFileSync;
  const values = await fetchValues({
    cfg,
    fieldDefs: loadFields(),
    issueNumber: Number(issueNumber),
  });
  const resolved = resolvePlanPath({ projectDir, body, overridePath: planOverride });
  const { planText, planDiagnostic } = planTextFromResolved(resolved, readFile);
  const classification = classifyDecomposition({
    size: values.size ?? null,
    estimateHours: values.estimate ?? null,
    planText,
  });
  const waiver = parseDecompositionWaiver(body);
  const effectiveStatus =
    classification.status === 'must-split' && waiver.ok ? 'waived' : classification.status;
  return { classification, waiver, effectiveStatus, planDiagnostic, values };
}

function signalCodes(classification) {
  return classification.signals.map((signal) => signal.code).join(', ') || 'no signals';
}

function planNote(result) {
  return result.planDiagnostic?.diagnostic ? `; ${result.planDiagnostic.diagnostic}` : '';
}

export const decompositionPlanExitGuard = {
  id: DECOMPOSITION_PLAN_EXIT_GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    if (!ctx?.cfg || !ctx?.issueNumber) return { ok: true };
    // The existing Plan Metadata guard owns an absent link. Deferring here
    // avoids inventing decomposition results from board fields when there is
    // no plan text to classify, while a present-but-unreadable link still uses
    // known Size/Estimate signals and can refuse.
    if (!linkedPlanPath(ctx.body || '')) return { ok: true };
    const result = await evaluateIssueDecomposition({
      issueNumber: Number(ctx.issueNumber),
      cfg: ctx.cfg,
      body: ctx.body || '',
      deps: ctx.deps || {},
    });
    const codes = signalCodes(result.classification);
    if (result.classification.status === 'must-split') {
      if (result.waiver.ok) {
        return {
          ok: true,
          warn: `plan-exit-decomposition: waiver accepted for must-split (${codes})`,
        };
      }
      const blockers = [
        `plan-exit-decomposition: must-split (${codes})${planNote(result)}`,
        'Run `npx aitm split-plan <issue> --dry-run` or add a complete visible `## Decomposition Waiver` section.',
      ];
      return { ok: false, reason: blockers.join('; '), blockers };
    }
    if (result.classification.status === 'needs-decomposition-review') {
      return {
        ok: true,
        warn: `plan-exit-decomposition: needs-decomposition-review (${codes})${planNote(result)}`,
      };
    }
    if (result.planDiagnostic?.diagnostic) {
      return {
        ok: true,
        warn: `plan-exit-decomposition: story-ok; ${result.planDiagnostic.diagnostic}`,
      };
    }
    return { ok: true };
  },
};
