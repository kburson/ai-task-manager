// @story #2143 — an explicit planning effect; caller comment keys grant no authority.
import { readFileSync } from 'node:fs';
import { loadState } from '../state.mjs';
import { assertGovernedMutationSession } from './issue-body.mjs';
import { captureArtifactOperator } from '../lib/artifact-execution.mjs';
import { collectHookDecompositionSnapshot } from '../lib/decomposition-hook-authority.mjs';
import { validateDecompositionAssessment } from '../lib/decomposition-assessment.mjs';
import { resolveCurrentIssueWorktreeLocation } from '../lib/issue-worktree-location.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { upsertOwnedComment, readIssueComment, ownedCommentMarker } from '../lib/owned-comment.mjs';
import {
  mirrorDeepDiveFromComment,
  readDeepDiveSignals,
  stripLeadingDeepDiveHeading,
} from '../lib/deep-dive.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { planDeepDiveGate } from '../lib/deep-dive-gate.mjs';
import { stripBodyVersion } from '../lib/versioned-issue-write.mjs';

function fail(reason) {
  throw new Error('plan-analysis:' + reason);
}
export function parsePlanAnalysisArgs(argv = []) {
  let issueNumber = null,
    bodyFile = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i]);
    if (/^#?\d+$/.test(arg) && issueNumber === null) issueNumber = Number(arg.replace(/^#/, ''));
    else if (
      arg === '--body-file' &&
      bodyFile === null &&
      argv[i + 1] &&
      !String(argv[i + 1]).startsWith('--')
    )
      bodyFile = String(argv[++i]);
    else fail('argument');
  }
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0 || !bodyFile) fail('argument');
  return { issueNumber, bodyFile };
}
const headings = new Map([
  ['Story Intent', 'intent'],
  ['Authority and intended outcome', 'authority'],
  ['Diagnosis and bounded design', 'diagnosis'],
  ['Diagnosis and current baseline', 'diagnosis'],
  ['Files and steps', 'implementation'],
  ['Implementation and proof boundaries', 'implementation'],
  ['Dependency Map', 'dependencies'],
  ['Dependency map and execution ownership', 'dependencies'],
  ['Risks and limits', 'risks'],
  ['Estimation, integration and risks', 'risks'],
  ['Owner release decisions', 'release'],
]);
export function validatePlanAnalysis(value) {
  if (typeof value !== 'string' || value.length > 60000) fail('narrative');
  let text = value
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (
    /<!--|<\/?[a-z!]|```|~~~|^\s*>|^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]|^\s*(?:=+|-+)\s*$/im.test(text)
  )
    fail('structural-marker');
  for (const line of text.split('\n')) {
    let nested = line,
      contained = false;
    const prefix = /^\s*(?:>\s*|(?:[-*+]|\d+[.)])\s+)/;
    while (prefix.test(nested)) {
      contained = true;
      nested = nested.replace(prefix, '');
    }
    if (contained && /^(?:#{1,6}(?:\s|$)|\[[xX]\]|[=-]+\s*$)/.test(nested.trimStart()))
      fail('nested-structure');
  }
  text = text.replace(/^## Plan Deep-Dive Analysis\r?\n+/, '');
  const sections = [...text.matchAll(/^### ([^\r\n]+)\r?\n/gm)];
  if (!sections.length || text.slice(0, sections[0].index).trim()) fail('sections');
  const categories = new Set();
  const seen = new Set();
  for (let i = 0; i < sections.length; i++) {
    const heading = sections[i][1],
      category = headings.get(heading);
    if (!category || seen.has(heading)) fail('section-heading');
    seen.add(heading);
    categories.add(category);
    const prose = text
      .slice(sections[i].index + sections[i][0].length, sections[i + 1]?.index ?? text.length)
      .trim();
    if (/^\s*#/m.test(prose) || prose.length < 40) fail('section-prose');
    if (category === 'intent') {
      for (const label of ['Beneficiary', 'Capability', 'Need', 'Value or failure prevented']) {
        const line = prose.split('\n').find((line) => line.startsWith('- **' + label + ':**'));
        if (!line || line.slice(line.indexOf(':**') + 3).trim().length < 8) fail('intent');
      }
    }
  }
  if (
    !['intent', 'diagnosis', 'implementation', 'dependencies', 'risks'].every((c) =>
      categories.has(c)
    )
  )
    fail('sections');
  return '## Plan Deep-Dive Analysis\n\n' + text + '\n';
}
function validateSnapshot(snapshot, operator, issue, cfg) {
  const { current, signals, subject } = snapshot;
  validateDecompositionAssessment(current?.assessment);
  if (
    subject?.issue !== issue ||
    subject?.repository !== cfg.repo.toLowerCase() ||
    subject?.projectId !== cfg.projectId
  )
    fail('subject');
  if (signals?.state !== 'plan' || readLastKnownState(signals.body).state !== 'plan')
    fail('plan-state');
  if (
    !signals.currentUser ||
    !Array.isArray(signals.assignees) ||
    signals.assignees.length !== 1 ||
    signals.assignees[0].toLowerCase() !== signals.currentUser.toLowerCase()
  )
    fail('owner');
  const pickups = [...signals.body.matchAll(/^## Pickup Directive\b.*$/gm)];
  const progress = signals.body.search(/^## AITM Progress Markers$/m);
  if (pickups.length !== 1 || progress < pickups[0].index) fail('mirror-boundary');
  const location = resolveCurrentIssueWorktreeLocation(signals.body);
  if (
    !location ||
    location.worktreePath !== operator.worktreePath ||
    location.worktreeBranch !== operator.branch
  )
    fail('worktree');
  if (
    current.input.availability.status !== 'complete' ||
    current.projection.status !== 'current' ||
    current.publication?.status === 'pending' ||
    ['pending', 'indeterminate', 'must-decompose'].includes(current.assessment.status)
  )
    fail('authority');
  if (current.input.kind === 'epic') {
    if (
      current.input.epicReadiness?.availability !== 'observed' ||
      current.input.epicReadiness?.planning !== true
    )
      fail('planning-readiness');
  } else if (current.assessment.status !== 'story-ok') fail('authority');
}
function canonicalSection(body) {
  const headings = [...body.matchAll(/^## Deep-Dive Analysis \(\d{4}-\d{2}-\d{2}\)$/gm)];
  if (headings.length !== 1) return null;
  const heading = headings[0];
  const pickup = body.search(/^## Pickup Directive\b/m),
    progress = body.search(/^## AITM Progress Markers$/m);
  if (pickup < 0 || heading.index < pickup || heading.index > progress) return null;
  const rest = body.slice(heading.index + heading[0].length);
  const end = rest.search(/^##\s|^<\/details>\s*$|^<!--\s*aitm-(?:deep-dive-complete\b|fields:)/m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}
export async function runPlanAnalysisVerb(ctx, deps = {}) {
  const { issueNumber: issue, bodyFile } = parsePlanAnalysisArgs(ctx.rest);
  const projectDir = ctx.projectDir ?? process.cwd();
  const body = validatePlanAnalysis(
    (deps.readFile ?? ((file) => readFileSync(file, 'utf8')))(bodyFile)
  );
  const key = 'deep-dive.analysis-v1';
  const rendered = body.trimEnd() + '\n\n' + ownedCommentMarker(key);
  const appendixText = stripLeadingDeepDiveHeading(rendered).trim();
  const host = process.env.GH_HOST || 'github.com';
  const load = deps.loadState ?? loadState;
  const capture = deps.captureOperator ?? ((input) => captureArtifactOperator(input));
  assertGovernedMutationSession(load(ctx.statePath, ctx.state), issue);
  const operator = capture({ projectDir, issueNumber: issue });
  const collect = deps.collectSnapshot ?? collectHookDecompositionSnapshot;
  let baseline;
  const checkpoint = async (expectedBody) => {
    assertGovernedMutationSession(load(ctx.statePath, ctx.state), issue);
    if (JSON.stringify(capture({ projectDir, issueNumber: issue })) !== JSON.stringify(operator))
      fail('operator-drift');
    const snapshot = await collect({ issue, cfg: ctx.cfg, projectDir, deps });
    validateSnapshot(snapshot, operator, issue, ctx.cfg);
    if (readDeepDiveSignals(snapshot.signals.body).hasHeading) {
      const section = canonicalSection(snapshot.signals.body);
      const commentId = /^> Mirrored from comment #issuecomment-([1-9]\d{0,15}) /.exec(
        section ?? ''
      )?.[1];
      const url =
        'https://' + host + '/' + ctx.cfg.repo + '/issues/' + issue + '#issuecomment-' + commentId;
      const backpointer =
        '> Mirrored from comment #issuecomment-' +
        commentId +
        ' (' +
        url +
        '). Comment is the diff-history canonical; this body copy is the gate-canonical source.\n\n';
      if (
        !commentId ||
        !Number.isSafeInteger(Number(commentId)) ||
        section !== backpointer + appendixText
      )
        fail('existing-analysis-conflict');
    }
    if (baseline && snapshot.current.inputDigest !== baseline) fail('source-drift');
    if (
      expectedBody !== undefined &&
      stripBodyVersion(snapshot.signals.body) !== stripBodyVersion(expectedBody)
    )
      fail('source-drift');
    baseline ??= snapshot.current.inputDigest;
    return snapshot;
  };
  const initial = await checkpoint();
  let prospective;
  await mirrorDeepDiveFromComment({
    issueNumber: issue,
    repo: ctx.cfg.repo,
    fromComment: '1',
    deps: {
      fetchCommentBody: async () => ({
        body: rendered,
        url: 'https://' + host + '/' + ctx.cfg.repo + '/issues/' + issue + '#issuecomment-1',
      }),
      mutateIssueBody: async ({ mutate }) => {
        prospective = mutate(initial.signals.body);
        return { status: 'ok' };
      },
    },
  });
  const plannedGate = planDeepDiveGate({ body: prospective });
  if (!plannedGate.ok) fail('deep-dive-gate:' + plannedGate.blockers.join('; '));
  const comment = await upsertOwnedComment({
    repository: ctx.cfg.repo,
    issue,
    key,
    body,
    deps: { ...deps, beforeWrite: () => checkpoint() },
  });
  const read = deps.readComment ?? readIssueComment;
  const readSource = async () => {
    const source = await read({ id: comment.id, repository: ctx.cfg.repo, issue });
    if (
      source.id !== comment.id ||
      source.repository !== ctx.cfg.repo ||
      source.issue !== issue ||
      source.body !== comment.body
    )
      fail('comment-readback');
    let url;
    try {
      url = new URL(source.url);
    } catch {
      fail('comment-url');
    }
    if (
      url.protocol !== 'https:' ||
      url.host !== host ||
      url.username ||
      url.password ||
      url.search ||
      url.pathname !== '/' + ctx.cfg.repo + '/issues/' + issue
    )
      fail('comment-url');
    const match = /^#issuecomment-([1-9]\d{0,15})$/.exec(url.hash);
    if (!match || !Number.isSafeInteger(Number(match[1]))) fail('comment-url');
    return { ...source, databaseId: Number(match[1]) };
  };
  const source = await readSource();
  await checkpoint();
  const mutate = deps.mutateIssueBody ?? mutateIssueBody;
  await mirrorDeepDiveFromComment({
    issueNumber: issue,
    repo: ctx.cfg.repo,
    fromComment: String(source.databaseId),
    deps: {
      fetchCommentBody: async () => {
        const current = await readSource();
        return { body: current.body, url: current.url };
      },
      mutateIssueBody: (options) =>
        mutate({
          ...options,
          validateFreshBaseAsync: async (base, next) => {
            if (!planDeepDiveGate({ body: next }).ok) fail('deep-dive-gate');
            await checkpoint(base);
            await readSource();
          },
        }),
    },
  });
  const after = await checkpoint();
  const flags = readDeepDiveSignals(after.signals.body);
  if (
    !flags.hasPosted ||
    !flags.hasComplete ||
    !planDeepDiveGate({ body: after.signals.body }).ok ||
    canonicalSection(after.signals.body) !==
      '> Mirrored from comment #issuecomment-' +
        source.databaseId +
        ' (' +
        source.url +
        '). ' +
        'Comment is the diff-history canonical; this body copy is the gate-canonical source.\n\n' +
        appendixText
  )
    fail('mirror-readback');
  return {
    status: 'complete',
    inputDigest: baseline,
    commentId: source.id,
    databaseId: source.databaseId,
    url: source.url,
  };
}
export async function verbPlanAnalysis(ctx) {
  const result = await runPlanAnalysisVerb(ctx);
  console.log(
    'plan-analysis: complete id=' +
      result.commentId +
      ' url=' +
      result.url +
      ' input-digest=' +
      result.inputDigest
  );
}
