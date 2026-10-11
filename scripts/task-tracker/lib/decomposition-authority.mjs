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
import { loadForecastProjection } from './estimation/runtime-adapter.mjs';
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
    readForecast: async ({ subject }) => {
      const p = await loadForecastProjection({ cfg, issueNumber: subject.issue });
      if (p.activeForecastRecordIds.length > 1) throw new Error('forecast conflict');
      const f = p.forecast;
      if (
        f &&
        (!p.activeForecastRecordIds.includes(f.recordId) || f.payload.issue !== subject.issue)
      )
        throw new Error('forecast identity conflict');
      return observed({
        estimate: f?.payload.plan.humanHours ?? null,
        size: f?.payload.plan.size ?? null,
        recordId: f?.recordId ?? null,
      });
    },
    readPolicy: async () => observed(decompositionPolicyIdentity()),
  };
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, deps[key] ?? defaults[key]]));
}
async function read(port, args) {
  try {
    const r = await port(args);
    if (r?.status === 'unavailable') return unavailable();
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
  const estimates = [
    project?.estimate,
    fields.ok ? fields.values.estimate : null,
    forecast?.estimate,
  ].filter((v) => v !== null && v !== undefined);
  const good = estimates.filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (good.length !== estimates.length) reasons.add('estimate-unavailable');
  const hours = good.length ? Math.max(...good.map(normalizeDecompositionHours)) : null;
  if (new Set(good.map(normalizeDecompositionHours)).size > 1) reasons.add('authority-conflict');
  const sizes = [project?.size, fields.ok ? fields.values.size : null, forecast?.size].filter(
    (v) => v !== null && v !== undefined
  );
  if (sizes.some((v) => !['XS', 'S', 'M', 'L', 'XL'].includes(v))) reasons.add('size-unavailable');
  if (new Set(sizes).size > 1) reasons.add('authority-conflict');
  const size = sizes.find((v) => ['XS', 'S', 'M', 'L', 'XL'].includes(v)) ?? null;
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
    estimate: { basis: hours === null ? 'unset' : 'published', hours, proposalId: null },
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
