// @story #1987 — current read-only authority; no effect ports reach collection.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gh } from '../../gh/lib/github-projects.mjs';
import { fetchIssueProjectMembership } from '../../gh/lib/project-membership.mjs';
import { fieldIdFor } from '../project-fields.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { parseProofMarker, serializeProofMarker } from './proof-marker.mjs';
import { scopeProjection } from './workflow-policy/scope-identity.mjs';
import { resolveVcListStrict } from './vc-ref.mjs';
import { markdownViews } from './plan-markdown-views.mjs';
import { parseVerificationCommands } from './verification-commands.mjs';
import {
  loadForecastProjection,
  createGitHubEstimationRecordIo,
} from './estimation/runtime-adapter.mjs';
import { fetchEpicChildren, isAcceptedTerminalChild } from './epic-children-gate.mjs';
import { evaluateMaterializedWbsReadiness } from './decomposition-delivery-readiness.mjs';
import { parseWbsChildClaim } from './decomposition-wbs-coverage.mjs';
import { parseRefinementSnapshot } from './refinement-snapshot.mjs';
import { maskFencedCodeBlocksPreservingOffsets } from './markers.mjs';
import {
  decompositionPolicyIdentity,
  linkedPlanReference,
  linkedDecompositionPlanPath,
  visibleMetadataFieldValues,
  resolvePlanPath,
  selectDecompositionPlanSection,
  extractPlanTasks,
  normalizeDecompositionHours,
} from './decomposition-policy.mjs';
import {
  normalizeDecompositionInputs,
  assessDecomposition,
  decompositionInputDigest,
  canonicalDecompositionJson,
  DECOMPOSITION_KINDS,
} from './decomposition-assessment.mjs';
import { parsePreloadedIssueComments } from './github-records/github-comment-store.mjs';
import {
  confirmedEstimateProjectionRevision,
  forecastPublicationTransition,
  confirmedForecastRetirement,
} from './decomposition-publication-inputs.mjs';
import { AUDIT_HEADER } from './reevaluate-estimate.mjs';
import { readDecompositionRecords, replaceDecompositionRecords } from './decomposition-records.mjs';
const pexec = promisify(execFile);
const sha = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : canonicalDecompositionJson(value))
    .digest('hex');
const same = (a, b) => canonicalDecompositionJson(a) === canonicalDecompositionJson(b);
const NONE = {
  path: null,
  commit: null,
  section: null,
  digest: null,
  availability: 'absent',
  content: null,
};
const RECOVERY = ['inspect', 'checkpoint', 'decomposition-prepare', 'authority-recover'];
function observed(value) {
  return { status: 'observed', value, revision: null, digest: sha(value) };
}
function unavailable() {
  return { status: 'unavailable', value: null, revision: null, digest: null };
}
function metadata(body, key) {
  const values = visibleMetadataFieldValues(body, 'Plan Metadata', key);
  if (values.length > 1) throw new Error('conflicting plan metadata');
  return values[0] ?? null;
}
function sectionBytes(content, heading) {
  const { structuralLines } = markdownViews(content);
  const rawLines = content.match(/[^\r\n]*(?:\r?\n|$)/g).filter(Boolean);
  const level = heading.match(/^#+/)[0].length;
  let offset = 0,
    start = null,
    end = content.length;
  for (let index = 0; index < rawLines.length; index++) {
    const structural = structuralLines[index]?.trimEnd();
    if (start === null && structural === heading) start = offset;
    else if (start !== null && new RegExp(`^#{1,${level}}\\s`).test(structural)) {
      end = offset;
      break;
    }
    offset += rawLines[index].length;
  }
  if (start === null) throw new Error('selected plan section missing');
  return content.slice(start, end);
}
function referencedBytes(content, selectedContent) {
  if (!selectedContent) return null;
  const declared = selectedContent.match(/Read exact root ([^\n]*?)\./)?.[1];
  if (!declared) return null;
  const names = [
    'Shared wire and API contracts',
    'Runtime plan structure and compact projection',
    'Locking and effect sequence',
    'Epic readiness and capabilities',
    'Completed generic field call-site census',
  ];
  const { structuralLines: rawStructuralLines } = markdownViews(content);
  const structuralLines = rawStructuralLines.map((line) => line.trimEnd());
  const references = names.filter((name) => declared.includes(name));
  if (!references.length) throw new Error('unknown declared root reference');
  return references
    .map((name) => {
      const headings = structuralLines.filter(
        (line) => /^#{2,3} /.test(line) && line.replace(/^#+ /, '') === name
      );
      if (headings.length !== 1) throw new Error('missing or duplicate declared root reference');
      return sectionBytes(content, headings[0]);
    })
    .join('\n');
}

async function readPlanAtCommit({ projectDir, planCommit, planPath }) {
  return (
    await pexec('git', ['show', `${planCommit}:${planPath}`], {
      cwd: projectDir,
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    })
  ).stdout;
}
async function selectedPlan({ body, kind, projectDir, deps }) {
  const reference =
    kind === 'epic' && linkedDecompositionPlanPath(body)
      ? { path: linkedDecompositionPlanPath(body), key: null }
      : linkedPlanReference(body);
  if (!reference) return { ...NONE, references: null };
  const resolved = resolvePlanPath({ projectDir, body, overridePath: reference.path });
  if (!resolved.path) throw new Error(resolved.diagnostic);
  const relative = path.relative(projectDir, resolved.path).split(path.sep).join('/');
  const commit = metadata(body, 'Source-plan-commit') ?? metadata(body, 'Plan-commit');
  if (commit !== null && !/^[0-9a-f]{40}$/.test(commit)) throw new Error('invalid plan commit');
  const full = commit
    ? await (deps.readPlanAtCommit ?? readPlanAtCommit)({
        projectDir,
        planCommit: commit,
        planPath: relative,
      })
    : readFileSync(resolved.path, 'utf8');
  const selection = selectDecompositionPlanSection({
    body,
    planText: full,
    activePlanKey: reference.key,
  });
  if (!selection.ok) throw new Error(selection.diagnostic);
  const content = selection.applied ? sectionBytes(full, selection.heading) : full;
  return {
    path: relative,
    commit,
    section: selection.heading,
    digest: sha(content),
    availability: 'available',
    content,
    references: referencedBytes(full, selection.applied ? content : null),
  };
}
function readPorts({ cfg, projectDir, deps }) {
  const defaults = {
    readIssue: async ({ subject }) =>
      observed(
        JSON.parse(
          await gh([
            'issue',
            'view',
            String(subject.issue),
            '--repo',
            subject.repository,
            '--json',
            'number,body',
          ])
        )
      ),
    readProject: async ({ subject, kind }) => {
      if (!cfg.projectId) throw new Error('configured membership missing');
      const { item } = await fetchIssueProjectMembership({
        repo: cfg.repo,
        projectId: cfg.projectId,
        issueNumber: subject.issue,
        itemFields:
          'fieldValues(first:100) { nodes { ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { id } } } ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { id } } } } pageInfo { hasNextPage } }',
      });
      if (
        !item ||
        !Array.isArray(item.fieldValues?.nodes) ||
        item.fieldValues.pageInfo?.hasNextPage !== false
      )
        throw new Error('project authority incomplete');
      const value = (key) => {
        const nodes = item.fieldValues.nodes.filter((v) => v.field?.id === fieldIdFor(cfg, key));
        if (nodes.length > 1) throw new Error('duplicate project field');
        return nodes[0]?.number ?? nodes[0]?.name ?? null;
      };
      return observed({
        projectId: cfg.projectId,
        projectItemId: item.id,
        estimate: value('estimate'),
        size: value('size'),
        children:
          kind === 'epic' ? await fetchEpicChildren({ cfg, parentEpicNumber: subject.issue }) : [],
      });
    },
    readSelectedPlan: async (args) => observed(await selectedPlan({ ...args, projectDir, deps })),
    readForecast: async ({ subject, body }) => {
      const forecastDeps = deps.forecast ?? {};
      const graphql =
        forecastDeps.graphql ??
        forecastDeps.recordIo?.graphql ??
        createGitHubEstimationRecordIo().graphql;
      const comments = [];
      const p = await loadForecastProjection({
        cfg,
        issueNumber: subject.issue,
        deps: {
          graphql: async (request) => {
            const result = await graphql(request);
            const nodes = result?.data?.repository?.issue?.comments?.nodes;
            if (Array.isArray(nodes)) comments.push(...nodes);
            return result;
          },
        },
      });
      const records = parsePreloadedIssueComments({
        nodes: comments,
        repository: cfg.repo,
        issue: subject.issue,
      });
      const active = records.filter(
        (record) =>
          record.envelope.recordType === 'estimation-forecast' &&
          p.activeForecastRecordIds.includes(record.envelope.recordId)
      );
      const ready = [
        ...maskFencedCodeBlocksPreservingOffsets(body).matchAll(
          /<!--\s*aitm-estimation-forecast-ready\b[\s\S]*?(?:-->|$)/g
        ),
      ];
      const readyId =
        ready.length === 1
          ? ready[0][0].match(
              /^<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->$/
            )?.[1]
          : null;
      let complete =
        (ready.length === 0 && active.length === 0) ||
        (ready.length === 1 &&
          active.length === 1 &&
          readyId === active[0].envelope.recordId &&
          p.forecast?.recordId === readyId);
      if (
        await confirmedForecastRetirement({
          publication: readDecompositionRecords(body).publication,
          active,
          ready,
          project: { ...p.board, projectItemId: subject.projectItemId },
          bodyFields: p.bodyFields,
        })
      )
        complete = true;
      if (active.length !== p.activeForecastRecordIds.length) complete = false;
      const known = active
        .map((record) => ({
          estimate: record.envelope.payload.plan.humanHours,
          size: record.envelope.payload.plan.size,
          recordId: record.envelope.recordId,
        }))
        .sort((a, b) => b.estimate - a.estimate);
      const published = known[0] ?? { estimate: null, size: null, recordId: null };
      const proposalResult = collectDecompositionCommentProposals({
        comments,
        subject,
        body,
        published: complete && p.forecast ? published : null,
        board: p.board,
        bodyFields: p.bodyFields,
      });
      const value = {
        ...published,
        proposals: proposalResult.proposals,
        observedProjections: [p.board, p.bodyFields],
      };
      if (!complete) {
        const transition = forecastPublicationTransition({
          ready,
          readyId,
          active,
          projection: p,
          proposalsAvailable: proposalResult.available,
        });
        if (transition) value.publicationTransition = transition;
      }
      return {
        status: complete && proposalResult.available ? 'observed' : 'unavailable',
        value,
        revision: null,
        digest: sha(value),
      };
    },
    readPolicy: async () => observed(decompositionPolicyIdentity()),
  };
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, deps[key] ?? defaults[key]]));
}
export function collectDecompositionCommentProposals({
  comments,
  subject,
  body,
  published,
  board,
  bodyFields,
}) {
  let available = true;
  let publication = null;
  try {
    publication = readDecompositionRecords(body).publication;
  } catch {
    available = false;
  }
  const proposals = [];
  const commentIds = new Set();
  for (const comment of comments) {
    if (commentIds.has(comment.id)) {
      available = false;
      continue;
    }
    commentIds.add(comment.id);
    const raw = String(comment.body ?? '');
    const masked = maskFencedCodeBlocksPreservingOffsets(raw);
    const { structuralLines } = markdownViews(raw);
    const lines = structuralLines.map((line) => line.trimEnd());
    const planned = lines.filter((line) => line === '### Planned Estimate');
    const human = lines.filter((line) => line === AUDIT_HEADER);
    let mode = null;
    if (
      planned.length &&
      new RegExp(`<!--\\s*aitm-refined-estimate:\\s*${subject.issue}\\s*-->`).test(masked)
    )
      mode = 'planned-estimate';
    else if (
      human.length &&
      masked.includes('**HUMAN ATTENTION**') &&
      masked.includes('not auto-applied')
    )
      mode = 'human-attention';
    if (!mode) continue;
    if ((mode === 'planned-estimate' ? planned : human).length !== 1) {
      available = false;
      continue;
    }
    const heading = mode === 'planned-estimate' ? '### Planned Estimate' : AUDIT_HEADER;
    const section = sectionBytes(raw, heading);
    const estimates = [...section.matchAll(/^\|\s*Estimate \(h\)\s*\|\s*([^|]+)\|\s*([^|]+)\|/gm)];
    const sizes = [...section.matchAll(/^\|\s*Size\s*\|\s*([^|]+)\|\s*([^|]+)\|/gm)];
    if (estimates.length !== 1 || sizes.length !== 1) {
      available = false;
      continue;
    }
    const afterHours = estimates[0][2].trim(),
      afterSize = sizes[0][2].trim();
    const hours = afterHours === '—' ? null : Number(afterHours),
      size = afterSize === '—' ? null : afterSize;
    if (
      (hours !== null && (!Number.isFinite(hours) || hours < 0)) ||
      (size !== null && !['XS', 'S', 'M', 'L', 'XL'].includes(size))
    ) {
      available = false;
      continue;
    }
    if (hours === null && size === null) continue;
    const operationKeys = [
      ...masked.matchAll(
        /<!-- aitm-estimate-operation: ([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}) -->/g
      ),
    ];
    if (operationKeys.length > 1) {
      available = false;
      continue;
    }
    const sourceDigest = sha(raw),
      targetIdentity = `comment:${mode === 'human-attention' && operationKeys.length === 1 ? operationKeys[0][1] : comment.id}`;
    if (proposals.some((p) => p.proposalId === `${targetIdentity}:${mode}`)) {
      available = false;
      continue;
    }
    const retired =
      publication &&
      same(publication.subject, subject) &&
      publication.supersedes?.effects.some(
        (effect) =>
          effect.resource === 'comment' &&
          effect.targetIdentity === targetIdentity &&
          ['confirmed', 'failed'].includes(effect.status) &&
          effect.observedDigest === sourceDigest
      );
    const adaptiveConfirmed =
      mode === 'planned-estimate' &&
      published &&
      hours === published.estimate &&
      size === published.size &&
      ((hours === board.estimate &&
        size === board.size &&
        hours === bodyFields.estimate &&
        size === bodyFields.size) ||
        confirmedEstimateProjectionRevision({
          publication,
          project: { ...board, projectItemId: subject.projectItemId },
          bodyFields,
        }));
    if (retired || adaptiveConfirmed) continue;
    proposals.push({
      proposalId: `${targetIdentity}:${mode}`,
      hours: hours === null ? null : normalizeDecompositionHours(hours),
      size,
      sourceDigest,
    });
  }
  if (proposals.length > 32) available = false;
  return { available, proposals };
}
async function read(port, args) {
  try {
    const r = await port(args);
    if (r?.status === 'unavailable')
      return r.value !== null && r.value !== undefined && r.digest === sha(r.value)
        ? { status: 'unavailable', value: r.value, revision: r.revision ?? null, digest: r.digest }
        : unavailable();
    if (r?.status !== 'observed' || r.value === undefined || r.digest !== sha(r.value))
      return unavailable();
    return { status: 'observed', value: r.value, revision: r.revision ?? null, digest: r.digest };
  } catch {
    return unavailable();
  }
}
function genuineKind(body, reasons) {
  const source = maskFencedCodeBlocksPreservingOffsets(body);
  const matches = [...source.matchAll(/<!--\s*aitm-issue-kind\b[\s\S]*?(?:-->|$)/gi)];
  if (!matches.length) return 'code';
  if (matches.length !== 1) {
    reasons.add('kind-duplicate');
    return 'code';
  }
  const m = matches[0];
  const marker = m[0].match(/^<!--\s*aitm-issue-kind\s+kind="([a-z-]+)"\s*-->$/i);
  const progress = source.match(/^##\s+(?:AITM\s+)?Progress Markers\s*$/im);
  const tail = progress ? source.slice(progress.index + progress[0].length) : '';
  if (
    !marker ||
    !DECOMPOSITION_KINDS.includes(marker[1].toLowerCase()) ||
    !progress ||
    m.index < progress.index ||
    /^##\s+/m.test(tail.slice(0, m.index - progress.index - progress[0].length))
  ) {
    reasons.add('kind-invalid');
    return 'code';
  }
  return marker[1].toLowerCase();
}
function semanticProof(marker) {
  const props = parseProofMarker(marker) ?? {};
  const declaration = Object.fromEntries(
    ['cmd', 'vc-list'].filter((key) => key in props).map((key) => [key, props[key]])
  );
  return Object.keys(declaration).length ? serializeProofMarker(declaration) : '';
}
function semanticScope(subject, body, plan) {
  const semanticBody = String(body).replace(/<!--\s*aitm-verified\s+[\s\S]*?-->/g, (marker) =>
    semanticProof(marker)
  );
  const scope = scopeProjection({ ...subject, body: semanticBody });
  const vcItems = parseVerificationCommands(body);
  for (const match of scope.sections['Acceptance Criteria'].matchAll(
    /<!--\s*aitm-verified\s+[^]*?-->/g
  )) {
    const proof = parseProofMarker(match[0]);
    if (proof && 'vc-list' in proof) resolveVcListStrict(proof['vc-list'], vcItems);
  }
  const vcs = vcItems.map(({ id, command }) => ({ id, command }));
  if (!vcs.length) throw new Error('missing verifier declarations');
  return sha({
    scope,
    vcs,
    plan: { ...plan, content: plan.content, references: plan.references ?? null },
  });
}
async function readiness({ kind, project, plan, body, subject, projectDir, deps, reasons }) {
  if (kind !== 'epic')
    return {
      availability: 'not-applicable',
      planning: null,
      completion: null,
      digest: null,
      children: [],
    };
  try {
    if (!Array.isArray(project?.children) || plan.availability !== 'available')
      throw new Error('children/plan unavailable');
    const children = project.children;
    const r = await evaluateMaterializedWbsReadiness({
      issueNumber: subject.issue,
      tasks: extractPlanTasks(plan.content),
      acceptedPlanPath: plan.path,
      acceptedPlanText: plan.content,
      epicBody: body,
      children,
      readPlanAtCommit: (args) =>
        (deps.readPlanAtCommit ?? readPlanAtCommit)({ ...args, projectDir }),
    });
    const normalized = children.map((child) => {
      const claim = parseWbsChildClaim(child);
      const refinement = parseRefinementSnapshot(child.body ?? '');
      return {
        issue: Number(child.number),
        sourcePlanCommit: claim.sourcePlanCommit ?? null,
        sourcePlanSection: claim.sourcePlanSection ?? null,
        refinementDigest: refinement?.digest ?? null,
        rank: child.rank ?? child.sequence ?? null,
        blockedBy: child.blockedBy ?? [],
        state: child.state,
        disposition: child.closeReason ?? null,
      };
    });
    return {
      availability: 'observed',
      planning: r.deliveryReady,
      completion: r.deliveryReady && children.length > 0 && children.every(isAcceptedTerminalChild),
      digest: sha({
        children: normalized,
        planning: r.deliveryReady,
        terminal: children.map(isAcceptedTerminalChild),
      }),
      children: normalized,
    };
  } catch {
    reasons.add('children-unavailable');
    return {
      availability: 'unavailable',
      planning: null,
      completion: null,
      digest: null,
      children: [],
    };
  }
}
export async function collectDecompositionAuthority({ subject, cfg, projectDir, deps = {} } = {}) {
  if (
    !subject ||
    !Number.isSafeInteger(subject.issue) ||
    subject.issue <= 0 ||
    !cfg ||
    subject.repository.trim().toLowerCase() !== cfg.repo.toLowerCase()
  )
    throw new TypeError('decomposition:subject');
  const reasons = new Set();
  const ports = readPorts({ cfg, projectDir, deps });
  const issue = await read(ports.readIssue, { subject, cfg, projectDir });
  let body = '';
  if (
    issue.status === 'observed' &&
    issue.value.number === subject.issue &&
    typeof issue.value.body === 'string'
  )
    body = issue.value.body;
  else reasons.add('authority-conflict');
  const kind = genuineKind(body, reasons);
  const names = ['readProject', 'readSelectedPlan', 'readForecast', 'readPolicy'];
  const reads = await Promise.all(
    names.map((name) => read(ports[name], { subject, cfg, projectDir, body, kind }))
  );
  const [projectRead, planRead, forecastRead, policyRead] = reads;
  const project = projectRead.value;
  const forecast = forecastRead.value;
  names.forEach((name, index) => {
    if (reads[index].status !== 'observed')
      reasons.add(
        {
          readProject: 'project-unavailable',
          readSelectedPlan: 'plan-unavailable',
          readForecast: 'forecast-unavailable',
          readPolicy: 'policy-unavailable',
        }[name]
      );
  });
  const currentSubject = { ...subject, repository: subject.repository.trim().toLowerCase() };
  if (
    !project ||
    project.projectId !== cfg.projectId ||
    project.projectId !== subject.projectId ||
    !project.projectItemId ||
    project.projectItemId !== subject.projectItemId
  )
    reasons.add('project-unavailable');
  const fields = parseIssueFieldDb(body);
  if (!fields.ok) reasons.add('authority-conflict');
  if (
    projectRead.status === 'observed' &&
    fields.ok &&
    ['estimate', 'size'].some((key) => (project?.[key] ?? null) !== (fields.values[key] ?? null))
  )
    reasons.add('authority-conflict');
  let historicalForecast = false;
  try {
    historicalForecast = confirmedEstimateProjectionRevision({
      publication: readDecompositionRecords(body).publication,
      project,
      bodyFields: fields.ok ? fields.values : null,
    });
  } catch {
    /* Malformed projection remains refused below. */
  }
  const publishedSnapshots = Array.isArray(forecast?.observedProjections)
    ? forecast.observedProjections
    : [];
  for (const observation of publishedSnapshots) {
    if (
      ['estimate', 'size'].some(
        (key) =>
          (observation?.[key] ?? null) !== (project?.[key] ?? null) ||
          (observation?.[key] ?? null) !== (fields.values?.[key] ?? null)
      )
    )
      reasons.add('authority-conflict');
  }
  const estimates = [
    project?.estimate,
    fields.ok ? fields.values.estimate : null,
    historicalForecast ? null : forecast?.estimate,
    ...publishedSnapshots.map((value) => value?.estimate),
  ].filter((v) => v !== null && v !== undefined);
  const good = estimates.filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (good.length !== estimates.length) reasons.add('estimate-unavailable');
  let hours = good.length ? Math.max(...good.map(normalizeDecompositionHours)) : null;
  if (new Set(good.map(normalizeDecompositionHours)).size > 1) reasons.add('authority-conflict');
  const sizes = [
    project?.size,
    fields.ok ? fields.values.size : null,
    historicalForecast ? null : forecast?.size,
    ...publishedSnapshots.map((value) => value?.size),
  ].filter((v) => v !== null && v !== undefined);
  if (sizes.some((v) => !['XS', 'S', 'M', 'L', 'XL'].includes(v))) reasons.add('size-unavailable');
  if (new Set(sizes).size > 1) reasons.add('authority-conflict');
  const tiers = ['XS', 'S', 'M', 'L', 'XL'];
  let size =
    sizes.filter((v) => tiers.includes(v)).sort((a, b) => tiers.indexOf(b) - tiers.indexOf(a))[0] ??
    null;
  let proposalId = null;
  const proposals = Array.isArray(forecast?.proposals) ? forecast.proposals : [];
  if (proposals.length > 32) reasons.add('authority-truncated');
  for (const proposal of proposals) {
    if (
      proposal.hours !== null &&
      typeof proposal.hours === 'number' &&
      Number.isFinite(proposal.hours) &&
      proposal.hours >= 0 &&
      (hours === null || proposal.hours >= hours)
    ) {
      hours = normalizeDecompositionHours(proposal.hours);
      proposalId = proposal.proposalId;
    }
    const tiers = ['XS', 'S', 'M', 'L', 'XL'];
    if (tiers.includes(proposal.size) && tiers.indexOf(proposal.size) > tiers.indexOf(size))
      size = proposal.size;
  }
  let plan =
    planRead.status === 'observed'
      ? planRead.value
      : { ...NONE, availability: 'unavailable', references: null };
  if (
    !plan ||
    !['absent', 'available', 'unavailable'].includes(plan.availability) ||
    (plan.availability === 'available' &&
      (typeof plan.content !== 'string' || sha(plan.content) !== plan.digest))
  ) {
    reasons.add('plan-unavailable');
    plan = { ...NONE, availability: 'unavailable', references: null };
  }
  let scopeDigest;
  try {
    scopeDigest = semanticScope(currentSubject, body, plan);
  } catch {
    reasons.add('scope-unavailable');
    scopeDigest = sha('unavailable-scope');
  }
  const observations = [
    {
      resource: 'issue',
      identity: `${currentSubject.repository}#${subject.issue}`,
      revision: null,
      digest: scopeDigest,
    },
    {
      resource: 'project',
      identity: subject.projectItemId ?? 'unavailable',
      revision: null,
      digest: project
        ? sha({
            projectId: project.projectId,
            projectItemId: project.projectItemId,
            estimate: project.estimate,
            size: project.size,
          })
        : null,
    },
    {
      resource: 'forecast',
      identity: forecast?.recordId ?? 'absent',
      revision: null,
      digest: forecast ? sha(forecast) : null,
    },
  ];
  const epicReadiness = await readiness({
    kind,
    project,
    plan,
    body,
    subject: currentSubject,
    projectDir,
    deps,
    reasons,
  });
  let records = { assessment: null, publication: null },
    recordError = null;
  try {
    records = readDecompositionRecords(body);
    if (
      [records.assessment, records.publication].some(
        (record) => record && !same(record.subject, currentSubject)
      )
    )
      throw new Error('decomposition:mixed-subjects');
  } catch (error) {
    recordError = error.message;
    reasons.add('authority-conflict');
  }
  const { references: _references, ...wirePlan } = plan;
  const currentPolicy = decompositionPolicyIdentity();
  if (policyRead.status !== 'observed' || !same(policyRead.value, currentPolicy))
    reasons.add('policy-unavailable');
  let input = normalizeDecompositionInputs({
    schema: 'aitm.decomposition-input/v1',
    subject: currentSubject,
    kind,
    estimate: {
      basis: hours === null ? 'unset' : proposalId ? 'proposed' : 'published',
      hours,
      proposalId,
    },
    size,
    plan: wirePlan,
    policy: currentPolicy,
    scopeDigest,
    observations,
    availability: { status: reasons.size ? 'incomplete' : 'complete', reasons: [...reasons] },
    epicReadiness,
  });
  const inputDigest = decompositionInputDigest(input);
  const assessment = assessDecomposition(input, {
    publication: recordError ? null : records.publication,
  });
  let visibleCurrent = true;
  if (!recordError && records.assessment) {
    const canonical = replaceDecompositionRecords(body, records);
    visibleCurrent =
      sectionBytes(body, '## Decomposition Assessment') ===
      sectionBytes(canonical, '## Decomposition Assessment');
  }
  const status = recordError
    ? 'malformed'
    : !records.assessment
      ? 'absent'
      : visibleCurrent &&
          records.assessment.inputDigest === inputDigest &&
          same(records.assessment.subject, currentSubject) &&
          records.assessment.status === assessment.status
        ? 'current'
        : 'stale';
  return {
    input,
    inputDigest,
    assessment,
    publication: recordError ? null : records.publication,
    projection: { status, diagnostic: recordError },
    capabilities:
      status === 'current'
        ? assessment.capabilities
        : assessment.status === 'pending'
          ? assessment.capabilities
          : RECOVERY,
    sourceObservations: Object.fromEntries([
      ['readIssue', issue],
      ...names.map((name, index) => [name, reads[index]]),
    ]),
  };
}
export function createDecompositionRuntime({ cfg, projectDir, deps = {} } = {}) {
  return Object.freeze({
    withPublication: async ({ subject, publication }, operation) =>
      (await import('./decomposition-projection.mjs')).withDecompositionPublicationOwner(
        { subject, publication, cfg, projectDir, deps },
        operation
      ),
    collect: (subject) => collectDecompositionAuthority({ subject, cfg, projectDir, deps }),
    refresh: async (subject, context) =>
      (await import('./decomposition-projection.mjs')).refreshDecompositionProjection({
        subject,
        cfg,
        projectDir,
        deps,
        context,
      }),
  });
}
