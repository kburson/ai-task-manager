// @story #1990 — selected by real effect adapters; caller comment keys grant nothing.
import { decompositionRuntimeFor } from './action-decision/decomposition.mjs';
import { markdownViews } from './plan-markdown-views.mjs';
import { evaluateHookDecomposition } from './decomposition-activity.mjs';

export async function assertScopedDecompositionEffect({
  issue,
  cfg,
  projectDir,
  activity = 'scoped-deliverable',
  expectedBody,
  deps = {},
}) {
  const result = await evaluateHookDecomposition({
    issue,
    cfg,
    projectDir,
    activity,
    expectedBody,
    targets: [],
    deps,
  });
  if (result.decision === 'block') {
    const error = new Error(result.code + ': ' + result.reason);
    error.code = result.code;
    error.args = result.args;
    throw error;
  }
  return result;
}

const bodyContexts = new WeakSet();
export function createBodyEffectContext({ issue, cfg, projectDir, deps }) {
  const context = Object.freeze({ issue, cfg, projectDir, deps });
  bodyContexts.add(context);
  return context;
}
const planningSections = new Set([
  'User Story',
  'Scope',
  'Acceptance Criteria',
  'Plan Metadata',
  'Work Breakdown Structure',
  'WBS',
  'Implementation Tasks',
  'Verification Commands',
]);
function sections(body) {
  const { originalLines, structuralLines } = markdownViews(body);
  const result = new Map();
  let heading = '__preamble';
  let lines = [];
  for (let i = 0; i < originalLines.length; i++) {
    const next = structuralLines[i]?.match(/^## (.+)$/)?.[1];
    if (next) {
      if (result.has(heading)) throw new Error('duplicate section');
      result.set(heading, lines.join('\n'));
      heading = next;
      lines = [];
    }
    lines.push(originalLines[i]);
  }
  if (result.has(heading)) throw new Error('duplicate section');
  result.set(heading, lines.join('\n'));
  return result;
}
export function classifyDecompositionBodyRevision(base, next) {
  if (base === next) return 'checkpoint';
  const headingPattern =
    /^#{3,6}\s+(?:(?:Research|Audit|Spike|Scoped)\s+)?(?:Deliverable|Result|Findings|Completion|Delivery|Evidence)\b/i;
  const oldHeadings = new Set(
    markdownViews(base).structuralLines.filter((line) => headingPattern.test(line))
  );
  if (
    markdownViews(next).structuralLines.some(
      (line) => headingPattern.test(line) && !oldHeadings.has(line)
    )
  )
    return 'scoped-deliverable';
  const before = sections(base),
    after = sections(next);
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
    (key) => before.get(key) !== after.get(key)
  );
  return changed.length && changed.every((key) => planningSections.has(key))
    ? 'decomposition-prepare'
    : 'scoped-deliverable';
}
export async function admitBodyRevision(context, base, next) {
  if (!bodyContexts.has(context)) throw new TypeError('decomposition:body-effect-context');
  const activity = classifyDecompositionBodyRevision(base, next);
  if (activity === 'checkpoint') return activity;
  await assertScopedDecompositionEffect({ ...context, activity, expectedBody: base });
  return activity;
}
export async function refreshBodyRevision(context) {
  if (!bodyContexts.has(context)) throw new TypeError('decomposition:body-effect-context');
  try {
    const { subject, runtime } =
      context.deps.decomposition ?? (await decompositionRuntimeFor(context));
    const result = await runtime.refresh(subject);
    if (result.status !== 'confirmed') return { status: 'unconfirmed' };
    const current = await runtime.collect(subject);
    return {
      status: 'confirmed',
      body: current.sourceObservations?.readIssue?.value?.body,
      current,
    };
  } catch (error) {
    return { status: 'unconfirmed', reason: error.message };
  }
}
