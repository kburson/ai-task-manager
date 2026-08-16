import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

import { fetchAllSubIssueNodes } from '../../gh/lib/wave-admission.mjs';
import { projectValuesForIssue } from '../../gh/lib/github-projects.mjs';
import { getProjectDir } from '../paths.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import {
  classifyDecomposition,
  linkedPlanReference,
  linkedPlanPath,
  parseDecompositionWaiver,
  resolvePlanPath,
  selectDecompositionPlanSection,
} from './decomposition-policy.mjs';
import { reconcileWbsCoverage } from './decomposition-wbs-coverage.mjs';
import { parseIssueKind } from './issue-kind.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

export const DECOMPOSITION_PLAN_EXIT_GUARD_ID = 'plan-exit-decomposition';

const pexec = promisify(execFile);

async function defaultFetchWbsChildren({ issueNumber, cfg }) {
  return fetchAllSubIssueNodes({
    parentEpicNumber: Number(issueNumber),
    repo: cfg.repo,
  });
}

async function defaultReadPlanAtCommit({ projectDir, planCommit, planPath }) {
  const { stdout } = await pexec('git', ['show', `${planCommit}:${planPath}`], {
    cwd: projectDir,
    timeout: GH_API_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

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

async function evaluateIssueDecompositionSnapshot({
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
  const linkedReference = planOverride == null ? linkedPlanReference(body) : null;
  const { planText: effectivePlanText, ...planSelection } = selectDecompositionPlanSection({
    body,
    planText,
    activePlanKey: parseIssueKind(body) === 'epic' ? null : linkedReference?.key || null,
  });
  const classification = classifyDecomposition({
    size: values.size ?? null,
    estimateHours: values.estimate ?? null,
    planText: effectivePlanText,
  });
  const waiver = parseDecompositionWaiver(body);
  const effectiveStatus = !planSelection.ok
    ? 'invalid-plan-section'
    : classification.status === 'must-split' && waiver.ok
      ? 'waived'
      : classification.status;
  return {
    result: { classification, waiver, effectiveStatus, planDiagnostic, planSelection, values },
    planText,
  };
}

export async function evaluateIssueDecomposition(options = {}) {
  const { result } = await evaluateIssueDecompositionSnapshot(options);
  return result;
}

function signalCodes(classification) {
  return classification.signals.map((signal) => signal.code).join(', ') || 'no signals';
}

function planNote(result) {
  return result.planDiagnostic?.diagnostic ? `; ${result.planDiagnostic.diagnostic}` : '';
}

function mustSplitBlockers(result, codes) {
  return [
    `plan-exit-decomposition: must-split (${codes})${planNote(result)}`,
    'Run `npx aitm split-plan <issue> --dry-run` or add a complete visible `## Decomposition Waiver` section.',
  ];
}

export const decompositionPlanExitGuard = {
  id: DECOMPOSITION_PLAN_EXIT_GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    if (!ctx?.cfg || !ctx?.issueNumber) return { ok: true };
    const { result, planText: acceptedPlanText } = await evaluateIssueDecompositionSnapshot({
      issueNumber: Number(ctx.issueNumber),
      cfg: ctx.cfg,
      body: ctx.body || '',
      deps: ctx.deps || {},
    });
    const codes = signalCodes(result.classification);
    if (!result.planSelection.ok) {
      const blockers = [
        'plan-exit-decomposition: invalid Source-plan-section',
        result.planSelection.diagnostic,
      ];
      if (result.planDiagnostic?.diagnostic) blockers.push(result.planDiagnostic.diagnostic);
      return { ok: false, reason: blockers.join('; '), blockers };
    }
    if (result.classification.status === 'must-split') {
      if (result.waiver.ok) {
        return {
          ok: true,
          warn: `plan-exit-decomposition: waiver accepted for must-split (${codes})`,
        };
      }
      if (parseIssueKind(ctx.body || '') !== 'epic') {
        const blockers = mustSplitBlockers(result, codes);
        return { ok: false, reason: blockers.join('; '), blockers };
      }
      try {
        const runtime = ctx.deps?.decomposition || {};
        const projectDir = runtime.projectDir || ctx.projectDir || getProjectDir();
        const acceptedPlanPath = linkedPlanPath(ctx.body || '');
        if (!acceptedPlanPath || !result.planDiagnostic?.path) {
          throw new Error(result.planDiagnostic?.diagnostic || 'accepted plan path unavailable');
        }
        const fetchWbsChildren = runtime.fetchWbsChildren || defaultFetchWbsChildren;
        const readPlanAtCommit = runtime.readPlanAtCommit || defaultReadPlanAtCommit;
        const children = await fetchWbsChildren({
          issueNumber: Number(ctx.issueNumber),
          cfg: ctx.cfg,
        });
        const coverage = await reconcileWbsCoverage({
          tasks: result.classification.tasks,
          acceptedPlanPath,
          acceptedPlanText,
          children,
          readPlanAtCommit: ({ planCommit, planPath }) =>
            readPlanAtCommit({ projectDir, planCommit, planPath }),
        });
        if (coverage.ok) {
          return {
            ok: true,
            warn: `plan-exit-decomposition: WBS instantiated (${coverage.coveredCount}/${coverage.expectedCount})`,
          };
        }
        const blockers = [
          `plan-exit-decomposition: must-split (${codes}); WBS incomplete`,
          ...coverage.blockers,
        ];
        return { ok: false, reason: blockers.join('; '), blockers };
      } catch (error) {
        const blockers = [
          `plan-exit-decomposition: must-split (${codes})`,
          `wbs-evidence-unreadable: ${error.message}`,
        ];
        return { ok: false, reason: blockers.join('; '), blockers };
      }
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
