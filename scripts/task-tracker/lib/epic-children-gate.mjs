// Epic plan→develop gate + JIT child-pull helpers (#135).
//
// At plan→develop, an epic (issue with sub-issues) refuses to advance if any
// child is still in `backlog`. Children must be at least refined before the
// orchestrator starts driving them. Non-epic issues (no children) pass through.
//
// The `/task pull-next` verb consumes `findNextEligibleChild` to pick the
// next-in-sequence refine-state child to promote refine→plan.

import { defaultFetchSiblings } from '../../gh/lib/wave-admission.mjs';

const BACKLOG_STATE = 'backlog';

export async function fetchEpicChildren({ cfg, parentEpicNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('fetchEpicChildren: cfg is required');
  if (!parentEpicNumber) throw new Error('fetchEpicChildren: parentEpicNumber is required');
  const fetchSiblings = deps.fetchSiblings || defaultFetchSiblings;
  const children = await fetchSiblings({
    parentEpicNumber,
    repo: cfg.repo,
    projectId: cfg.projectId,
  });
  return Array.isArray(children) ? children : [];
}

export async function planEpicDevelopChildrenGate({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('planEpicDevelopChildrenGate: cfg is required');
  if (!issueNumber) throw new Error('planEpicDevelopChildrenGate: issueNumber is required');
  let children;
  try {
    children = await fetchEpicChildren({
      cfg,
      parentEpicNumber: issueNumber,
      deps,
    });
  } catch (err) {
    return { ok: false, blockers: [`epic-children-fetch-failed: ${err.message}`] };
  }
  if (!children.length) {
    return { ok: true, children: [] };
  }
  const backlogged = children.filter((c) => String(c.state || '').toLowerCase() === BACKLOG_STATE);
  if (backlogged.length) {
    const lines = backlogged.map((c) => `#${c.number} (state=${c.state || 'unknown'})`);
    return {
      ok: false,
      blockers: [
        `epic-children-backlog: refine these children before promoting the epic to Develop: ${lines.join(', ')}`,
      ],
      backloggedChildren: backlogged,
    };
  }
  return { ok: true, children };
}

export function findNextEligibleChild(children = []) {
  const eligible = (children || [])
    .filter((c) => String(c.state || '').toLowerCase() === 'refine')
    .filter((c) => c.sequence != null && Number.isFinite(Number(c.sequence)))
    .sort((a, b) => Number(a.sequence) - Number(b.sequence));
  return eligible[0] || null;
}
