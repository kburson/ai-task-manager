// @story #1287
// Read-only orchestration boundary between static decomposition readiness and
// live, materialized WBS delivery readiness.

import { linkedPlanReference, selectDecompositionPlanSection } from './decomposition-policy.mjs';
import { parseWbsChildClaim, reconcileWbsCoverage } from './decomposition-wbs-coverage.mjs';
import { isAcceptedTerminalChild } from './epic-children-gate.mjs';
import { resolveCurrentIssueWorktreeBranch } from './issue-worktree-location.mjs';
import { parseIssueKind } from './issue-kind.mjs';
import { resolveEpicLineage } from './resolve-epic-lineage.mjs';

function unique(values) {
  return [...new Set(values)];
}

function expectedWbs(tasks = []) {
  return tasks.map(({ number, title, heading }) => ({ number, title, heading }));
}

export function describePreSplitReadiness({ classification } = {}) {
  const tasks = Array.isArray(classification?.tasks) ? classification.tasks : [];
  if (classification?.status !== 'must-split' || tasks.length === 0) {
    return {
      status: 'refused',
      deliveryReady: false,
      expectedWbs: expectedWbs(tasks),
      blockers: ['decomposition-classification: must-split task evidence is required'],
    };
  }
  return {
    status: 'decomposition-ready',
    deliveryReady: false,
    expectedWbs: expectedWbs(tasks),
    blockers: [],
  };
}

function relevantChildren(children, tasks, acceptedPlanPath) {
  const headings = new Set(tasks.map((task) => task.heading));
  const titles = new Set(tasks.map((task) => task.title));
  return children.filter((child) => {
    const claim = parseWbsChildClaim(child);
    return (
      claim.sourcePlan === acceptedPlanPath ||
      headings.has(claim.sourcePlanSection) ||
      titles.has(claim.title)
    );
  });
}

function evaluateSections({ children, tasks, acceptedPlanPath, acceptedPlanText }) {
  const blockers = [];
  const expected = new Set(tasks.map((task) => task.heading));
  for (const child of relevantChildren(children, tasks, acceptedPlanPath)) {
    if (parseIssueKind(child.body || '') === 'epic') continue;
    const claim = parseWbsChildClaim(child);
    const selected = selectDecompositionPlanSection({
      body: child.body || '',
      planText: acceptedPlanText,
      activePlanKey: linkedPlanReference(child.body || '')?.key || null,
    });
    if (!selected.ok) {
      blockers.push(`section-selection: #${claim.number} ${selected.diagnostic}`);
    } else if (!selected.applied) {
      blockers.push(`section-selection: #${claim.number} has no bounded Source-plan-section`);
    } else if (!expected.has(selected.heading)) {
      blockers.push(
        `section-selection: #${claim.number} selects unknown section ${JSON.stringify(selected.heading)}`
      );
    }
  }
  return { ok: blockers.length === 0, blockers };
}

function evaluatePlanning({ children, tasks, acceptedPlanPath }) {
  const blockers = [];
  const relevant = relevantChildren(children, tasks, acceptedPlanPath);
  const byNumber = new Map(relevant.map((child) => [Number(child.number), child]));
  for (const child of relevant) {
    const number = Number(child.number);
    const ref = `#${Number.isSafeInteger(number) && number > 0 ? number : 'unknown'}`;
    if (isAcceptedTerminalChild(child)) continue;
    if (child.childEvidenceError) {
      blockers.push(`planning-evidence: ${ref} ${child.childEvidenceError}`);
    }
    if (child.hasCurrentRefinement !== true) {
      blockers.push(`planning-evidence: ${ref} has no current refinement evidence`);
    }
    const rank = Number(child.rank ?? child.sequence);
    if (!Number.isFinite(rank)) blockers.push(`planning-rank: ${ref} has no finite rank`);
    if (!Array.isArray(child.blockedBy)) {
      blockers.push(`planning-dependency: ${ref} dependency evidence is unreadable`);
      continue;
    }
    for (const rawBlocker of child.blockedBy) {
      const blockerNumber = Number(rawBlocker);
      if (blockerNumber === number) {
        blockers.push(`planning-dependency: ${ref} self-references its dependency`);
        continue;
      }
      const blocker = byNumber.get(blockerNumber);
      if (!blocker) {
        blockers.push(`planning-dependency: ${ref} references #${blockerNumber} outside the WBS`);
        continue;
      }
      const blockerRank = Number(blocker.rank ?? blocker.sequence);
      if (Number.isFinite(rank) && Number.isFinite(blockerRank) && blockerRank >= rank) {
        blockers.push(
          `planning-dependency: ${ref} rank ${rank} depends on #${blockerNumber} rank ${blockerRank}, which is not earlier`
        );
      }
    }
  }
  return { ok: blockers.length === 0, blockers };
}

function evaluateBranch({ issueNumber, epicBody, children }) {
  try {
    const authoritativeBranch = resolveCurrentIssueWorktreeBranch(epicBody || '');
    const representative = Number(children[0]?.number);
    if (!Number.isSafeInteger(representative) || representative <= 0) {
      throw new Error('materialized WBS has no child identity for branch resolution');
    }
    const lineage = resolveEpicLineage(representative, {
      deps: {
        graph: () => ({
          parent: Number(issueNumber),
          children: [],
          ...(authoritativeBranch ? { parentAuthoritativeBranch: authoritativeBranch } : {}),
        }),
      },
    });
    if (!lineage.epicBranch) throw new Error('child epic branch is unavailable');
    return { ok: true, epicBranch: lineage.epicBranch, blockers: [] };
  } catch (error) {
    return { ok: false, epicBranch: null, blockers: [`branch-authority: ${error.message}`] };
  }
}

export async function evaluateMaterializedWbsReadiness({
  issueNumber,
  tasks = [],
  acceptedPlanPath,
  acceptedPlanText,
  epicBody = '',
  children = [],
  readPlanAtCommit,
} = {}) {
  let coverage;
  try {
    coverage = await reconcileWbsCoverage({
      tasks,
      acceptedPlanPath,
      acceptedPlanText,
      children,
      readPlanAtCommit,
    });
  } catch (error) {
    coverage = { ok: false, blockers: [`wbs-evidence-unreadable: ${error.message}`] };
  }
  const sections = evaluateSections({ children, tasks, acceptedPlanPath, acceptedPlanText });
  const planning = evaluatePlanning({ children, tasks, acceptedPlanPath });
  const branch = evaluateBranch({ issueNumber, epicBody, children });
  const blockers = unique([
    ...(coverage.blockers || []),
    ...sections.blockers,
    ...planning.blockers,
    ...branch.blockers,
  ]);
  const deliveryReady = blockers.length === 0;
  return {
    status: deliveryReady ? 'delivery-ready' : 'refused',
    deliveryReady,
    expectedWbs: expectedWbs(tasks),
    epicBranch: branch.epicBranch,
    blockers,
    boundaries: { coverage, sections, planning, branch },
  };
}
