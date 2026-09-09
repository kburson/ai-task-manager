import {
  clearProjectFieldValue,
  fieldOptionMap,
  projectItemForIssue,
  writeProjectFieldValue,
} from '../../gh/lib/github-projects.mjs';
import { fieldIdFor } from '../project-fields.mjs';
import { fetchAssignmentSnapshot } from './assignment-snapshot.mjs';
import { readNativeDependencies } from './native-dependencies.mjs';
import { isTerminalDisposition, readTerminalDisposition } from './terminal-disposition.mjs';

function fail(category, detail = '') {
  throw new Error(`dependency-disposition:${category}${detail ? `: ${detail}` : ''}`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function canonicalBlockedBy(blockedBy) {
  if (!Array.isArray(blockedBy)) fail('observation');
  const refs = blockedBy.map(Number);
  if (refs.some((ref) => !Number.isSafeInteger(ref) || ref <= 0)) fail('observation');
  if (new Set(refs).size !== refs.length) fail('observation');
  return [...refs].sort((left, right) => left - right);
}

export function deriveDependencyProjection({ blockedBy = [], states = new Map() } = {}) {
  const refs = canonicalBlockedBy(blockedBy);
  if (!(states instanceof Map)) fail('observation');
  const unfinished = [];
  const unknown = [];
  for (const ref of refs) {
    const state = states.get(ref);
    if (state == null) unknown.push({ ref, state: null });
    else if (String(state).toLowerCase() !== 'done') unfinished.push({ ref, state });
  }
  if (unknown.length) return { status: 'unknown', unfinished: [...unfinished, ...unknown] };
  return unfinished.length
    ? { status: 'blocked', unfinished }
    : { status: 'ready', unfinished: [] };
}

async function observeDependencies({ issueNumber, cfg, deps }) {
  const readDependencies = deps.readNativeDependencies || readNativeDependencies;
  let graph;
  try {
    graph = await readDependencies({ issueNumber, repo: cfg.repo, deps: deps.nativeDependencies });
  } catch (error) {
    fail('dependencies', errorMessage(error));
  }
  const blockedBy = canonicalBlockedBy(graph?.blockedBy);
  const states = new Map();
  const fetchSnapshot = deps.fetchAssignmentSnapshot || fetchAssignmentSnapshot;
  for (const ref of blockedBy) {
    try {
      const snapshot = await fetchSnapshot({
        issueNumber: ref,
        cfg,
        deps: deps.assignmentSnapshot,
      });
      states.set(ref, snapshot?.state ?? null);
    } catch {
      states.set(ref, null);
    }
  }
  return { blockedBy, states };
}

async function readDisposition({ cfg, issueNumber, deps, category = 'read' }) {
  const read = deps.readDisposition || readTerminalDisposition;
  try {
    return await read({ cfg, issueNumber, deps: deps.terminalDisposition });
  } catch (error) {
    fail(category, errorMessage(error));
  }
}

async function resolveMutationContext({ cfg, issueNumber, deps, needsOption }) {
  const fieldId = fieldIdFor(cfg, 'disposition');
  if (!fieldId) fail('field');
  const getItem = deps.projectItemForIssue || projectItemForIssue;
  let item;
  try {
    item = await getItem({ repo: cfg.repo, projectId: cfg.projectId, issueNumber });
  } catch (error) {
    fail('item', errorMessage(error));
  }
  if (!item?.itemId) fail('item');
  if (!needsOption) return { fieldId, itemId: item.itemId };

  const getOptions = deps.fieldOptionMap || fieldOptionMap;
  let optionMap;
  try {
    optionMap = await getOptions(cfg.projectId);
  } catch (error) {
    fail('option', errorMessage(error));
  }
  if (!optionMap?.[fieldId]?.BLOCKED) fail('option');
  return { fieldId, itemId: item.itemId, optionMap };
}

export async function reconcileDependencyDisposition({
  issueNumber,
  cfg,
  observation,
  deps = {},
} = {}) {
  if (!Number.isSafeInteger(Number(issueNumber)) || Number(issueNumber) <= 0) fail('issue');
  if (!cfg?.repo || !cfg.projectId) fail('config');

  const current = await readDisposition({ cfg, issueNumber, deps });
  if (isTerminalDisposition(current)) {
    return { status: 'terminal-preserved', disposition: current };
  }
  if (current !== '' && current !== 'BLOCKED') fail('unexpected-current', current);
  if (!fieldIdFor(cfg, 'disposition')) fail('field');

  const observed = observation || (await observeDependencies({ issueNumber, cfg, deps }));
  const projection = deriveDependencyProjection(observed);
  const target = projection.status === 'ready' ? '' : 'BLOCKED';
  if (current === target) {
    return { status: 'idempotent', disposition: current, projection };
  }

  if (target === 'BLOCKED') {
    const { fieldId, itemId, optionMap } = await resolveMutationContext({
      cfg,
      issueNumber,
      deps,
      needsOption: true,
    });
    const write = deps.writeProjectFieldValue || writeProjectFieldValue;
    let written;
    try {
      written = await write({
        projectId: cfg.projectId,
        itemId,
        fieldId,
        value: { singleSelectOptionName: 'BLOCKED' },
        optionMap,
      });
    } catch (error) {
      fail('write', errorMessage(error));
    }
    if (!written) fail('write');
  } else {
    const { fieldId, itemId } = await resolveMutationContext({
      cfg,
      issueNumber,
      deps,
      needsOption: false,
    });
    const clear = deps.clearProjectFieldValue || clearProjectFieldValue;
    let cleared;
    try {
      cleared = await clear({ projectId: cfg.projectId, itemId, fieldId });
    } catch (error) {
      fail('clear', errorMessage(error));
    }
    if (!cleared) fail('clear');
  }

  const readback = await readDisposition({ cfg, issueNumber, deps, category: 'readback' });
  if (readback !== target) {
    fail('readback', `expected ${target || 'empty'}; observed ${readback || 'empty'}`);
  }
  return {
    status: target ? 'projected' : 'cleared',
    disposition: target,
    projection,
  };
}
