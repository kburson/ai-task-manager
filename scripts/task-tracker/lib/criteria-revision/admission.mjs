// Local projection only. The trusted observe callback must independently read
// and validate complete remote authority; archived self-consistency is not that
// validation. No production route supplies this callback until later children.
import path from 'node:path';
import { readMemorySourceProjection, readMemorySourceCompletion } from './store.mjs';
import { resolveMutationTarget } from '../mutation-context.mjs';
import { linkedPlanReference } from '../decomposition-policy.mjs';
import { validateGovernedLinkedPlan } from '../governed-plan-policy.mjs';
import { resolveStoryIntentSource, planSourceBindings } from '../story-intent-source.mjs';
import {
  validateRevisionObservation,
  validatePlanApprovalPayload,
  hashRevisionValue,
} from './schema.mjs';
import {
  revisionRuntime,
  resolveRevisionDomain,
  domainStorage,
  atomicRevisionJson,
  revisionFailure,
} from './domain.mjs';
import {
  withRevisionInterlock,
  assertRevisionCapability,
  revisionCapabilityContext,
} from './interlock.mjs';
const receipts = new WeakMap();
const schema = 'aitm.revision-admission/v2';
const keys = [
  'schema',
  'repository',
  'issue',
  'domain',
  'generation',
  'eventHead',
  'revision',
  'revisionId',
  'contractDigest',
  'sourceBindings',
  'planApproval',
  'localPlan',
  'pendingSource',
  'state',
  'dirty',
];
const hash = (x) => typeof x === 'string' && /^sha256:[a-f0-9]{64}$/.test(x);
function file(domain, issue) {
  return path.join(domainStorage(domain), 'admission', `${issue}.json`);
}
function issueOf(context) {
  const issue = context.issue ?? context.issues?.[0];
  if (!Number.isSafeInteger(issue) || issue < 1) revisionFailure('admission-issue');
  return issue;
}
function raw(domain, issue, p) {
  try {
    return JSON.parse(p.fs.readFileSync(file(domain, issue), 'utf8'));
  } catch {
    return null;
  }
}
function generation(domain, issue, p) {
  const n = raw(domain, issue, p)?.generation;
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}
function matches(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function exact(value, names) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...names].sort().join(',')
  );
}
function bindings(value) {
  return (
    Array.isArray(value) &&
    new Set(value.map((b) => b?.identity)).size === value.length &&
    value.every(
      (b) =>
        exact(b, ['identity', 'hash']) &&
        typeof b.identity === 'string' &&
        b.identity.length > 0 &&
        hash(b.hash)
    )
  );
}
function approvalValid(a, revisionId, digest, sources, epoch) {
  try {
    validatePlanApprovalPayload(a);
  } catch {
    return false;
  }
  return (
    a.revisionId === revisionId &&
    a.semanticContractDigest === digest &&
    (epoch === undefined || a.contractEpoch === epoch) &&
    bindings(sources) &&
    a.sourceBindings.every((binding) =>
      sources.some((source) => source.identity === binding.identity && source.hash === binding.hash)
    )
  );
}
export function validPendingSource(value) {
  return (
    value === null ||
    (exact(value, [
      'schema',
      'journalId',
      'revisionEventHead',
      'predecessor',
      'sourcePath',
      'beforeContentSha256',
      'afterContentSha256',
    ]) &&
      value.schema === 'aitm.native-source-pending/v1' &&
      hash(value.journalId) &&
      typeof value.revisionEventHead === 'string' &&
      value.revisionEventHead.length > 0 &&
      hash(value.predecessor) &&
      typeof value.sourcePath === 'string' &&
      value.sourcePath.length > 0 &&
      !path.isAbsolute(value.sourcePath) &&
      !value.sourcePath.split(/[\\/]/).some((part) => !part || part === '.' || part === '..') &&
      /^[a-f0-9]{64}$/.test(value.beforeContentSha256) &&
      /^[a-f0-9]{64}$/.test(value.afterContentSha256))
  );
}
function valid(entry, domain, issue) {
  return (
    exact(entry, keys) &&
    entry.schema === schema &&
    entry.repository === domain.repository &&
    entry.issue === issue &&
    matches(entry.domain, domain) &&
    Number.isSafeInteger(entry.generation) &&
    entry.generation > 0 &&
    entry.dirty === false &&
    ['allow', 'deny'].includes(entry.state) &&
    Number.isSafeInteger(entry.revision) &&
    entry.revision >= 0 &&
    bindings(entry.sourceBindings) &&
    validPendingSource(entry.pendingSource) &&
    (entry.pendingSource === null || entry.state === 'deny') &&
    (entry.localPlan === null ||
      exact(entry.localPlan, ['body', 'key', 'path', 'contentSha256', 'source', 'location'])) &&
    (entry.state === 'deny' ||
      (hash(entry.contractDigest) &&
        (entry.revision === 0
          ? entry.eventHead === 'never-revised' &&
            entry.revisionId === null &&
            entry.planApproval === null
          : typeof entry.eventHead === 'string' &&
            entry.eventHead.length > 0 &&
            entry.eventHead !== 'never-revised' &&
            typeof entry.revisionId === 'string' &&
            entry.revisionId.length > 0 &&
            approvalValid(
              entry.planApproval,
              entry.revisionId,
              entry.contractDigest,
              entry.sourceBindings
            ))))
  );
}
export function readAdmission(context, ports = {}) {
  try {
    const p = revisionRuntime(ports),
      domain = resolveRevisionDomain(context, p);
    if (!domain) return { state: 'deny', reason: 'domain-disabled' };
    const entry = raw(domain, issueOf(context), p);
    return valid(entry, domain, issueOf(context)) &&
      (entry.state !== 'allow' || localPlanCurrent(entry, p.worktree))
      ? entry
      : { state: 'deny', reason: 'admission-unavailable' };
  } catch {
    return { state: 'deny', reason: 'domain-unavailable' };
  }
}
function collectLocalPlan(body, projectDir, sources) {
  if (!linkedPlanReference(body)) return null;
  const governedPlan = validateGovernedLinkedPlan({ body, projectDir });
  const resolved = resolveStoryIntentSource({ body, projectDir, governedPlan });
  if (!governedPlan.ok || !resolved.ok || !governedPlan.observation)
    revisionFailure('admission-local-plan');
  const actual = planSourceBindings(resolved, governedPlan);
  if (
    !actual.every((binding) =>
      sources.some((source) => source.identity === binding.identity && source.hash === binding.hash)
    )
  )
    revisionFailure('admission-local-plan-binding');
  const { key, path: sourcePath, contentSha256 } = governedPlan.observation;
  return {
    body,
    key,
    path: sourcePath,
    contentSha256,
    source: resolved.source,
    location: resolved.location,
  };
}
function localPlanCurrent(entry, projectDir) {
  if (entry.localPlan === null) {
    const linked = entry.sourceBindings.find((source) => source.identity === 'linked-plan');
    const absent = validateGovernedLinkedPlan({ body: '', projectDir });
    return linked ? linked.hash === hashRevisionValue(absent) : entry.revision === 0;
  }
  const actual = collectLocalPlan(entry.localPlan.body, projectDir, entry.sourceBindings);
  return actual !== null && matches(actual, entry.localPlan);
}
function validateAuthority(result, context) {
  const o = result?.observation,
    a = result?.authority;
  validateRevisionObservation(o);
  if (
    o.repository.toLowerCase() !== context.repository ||
    o.issue !== issueOf(context) ||
    !matches(o.writerDomain, {
      hostId: context.domain.hostId,
      commonDirectory: context.domain.commonDirectory,
    }) ||
    !matches(o.executor, context.executor)
  )
    revisionFailure('admission-authority-binding');
  if (
    !a ||
    Object.keys(a).sort().join(',') !==
      'baselineAllowed,chain,complete,contractDigest,head,pending,planApproval' ||
    a.complete !== true ||
    a.pending !== false ||
    !hash(a.contractDigest) ||
    o.issueState !== 'open' ||
    o.delivery.state !== 'none'
  )
    revisionFailure('admission-authority-unavailable');
  if (o.revision === 0) {
    if (
      a.chain !== 'empty' ||
      a.head !== null ||
      o.revisionRecords.records.length !== 0 ||
      a.baselineAllowed !== true ||
      a.planApproval !== null
    )
      revisionFailure('admission-empty-chain-unverified');
  } else {
    const approval = a.planApproval;
    if (
      a.chain !== 'verified' ||
      typeof a.head !== 'string' ||
      o.revisionRecords.records.at(-1)?.eventId !== a.head ||
      !approvalValid(
        approval,
        o.revisionId,
        a.contractDigest,
        o.protectedSourceBindings,
        o.contract?.value.contractEpoch ?? null
      )
    )
      revisionFailure('admission-plan-approval');
  }
  return {
    eventHead: o.revision === 0 ? 'never-revised' : a.head,
    revision: o.revision,
    revisionId: o.revisionId,
    contractDigest: a.contractDigest,
    sourceBindings: o.protectedSourceBindings,
    planApproval: a.planApproval,
  };
}
export async function observeAdmission({ capability, context, observe, completion }, ports = {}) {
  assertRevisionCapability(capability, context, ports);
  const p = revisionRuntime(ports),
    bound = revisionCapabilityContext(capability),
    issue = issueOf(context),
    baseline = generation(bound.domain, issue, p);
  const pending = raw(bound.domain, issue, p)?.pendingSource;
  if (
    pending != null &&
    !matches(readMemorySourceCompletion(completion, capability, ports), pending)
  )
    revisionFailure('admission-source-pending');
  const result = await observe({ ...bound, issue });
  assertRevisionCapability(capability, context, p);
  const fields = validateAuthority(result, { ...bound, issue });
  fields.pendingSource = null;
  fields.localPlan = collectLocalPlan(
    result.observation.body.bytes,
    result.observation.executor.worktree,
    fields.sourceBindings
  );
  if (!localPlanCurrent(fields, result.observation.executor.worktree))
    revisionFailure('admission-local-plan-binding');
  const receipt = Object.freeze({});
  receipts.set(receipt, {
    capability,
    issue,
    generation: baseline,
    fields: structuredClone(fields),
  });
  return receipt;
}
export async function publishAdmission(
  { capability, observation, state, sourceToken, completion },
  ports = {}
) {
  const context = revisionCapabilityContext(capability),
    p = revisionRuntime(ports),
    receipt = receipts.get(observation),
    issue = receipt?.issue ?? observation?.issue;
  if (state === 'allow' && (!receipt || receipt.capability !== capability))
    revisionFailure('admission-observation');
  assertRevisionCapability(capability, { ...context, issues: [issue] }, p);
  if (!['allow', 'deny'].includes(state)) revisionFailure('admission-state');
  const current = generation(context.domain, issue, p);
  if (current === Number.MAX_SAFE_INTEGER) revisionFailure('admission-generation-exhausted');
  if (state === 'allow' && (!receipt || receipt.capability !== capability))
    revisionFailure('admission-observation');
  if (state === 'allow' && receipt.generation !== current) revisionFailure('admission-stale');
  const prior = raw(context.domain, issue, p);
  if (prior?.pendingSource != null && !validPendingSource(prior.pendingSource))
    revisionFailure('admission-source-pending-corrupt');
  if (
    state === 'allow' &&
    prior?.pendingSource != null &&
    !matches(readMemorySourceCompletion(completion, capability, ports), prior.pendingSource)
  )
    revisionFailure('admission-source-pending');
  const retained = valid(prior, context.domain, issue)
    ? Object.fromEntries(
        [
          'eventHead',
          'revision',
          'revisionId',
          'contractDigest',
          'sourceBindings',
          'planApproval',
          'localPlan',
          'pendingSource',
        ].map((key) => [key, prior[key]])
      )
    : null;
  const fields =
    state === 'allow'
      ? receipt.fields
      : (retained ?? {
          eventHead: null,
          revision: 0,
          revisionId: null,
          contractDigest: null,
          sourceBindings: [],
          planApproval: null,
          localPlan: null,
          pendingSource: null,
        });
  if (state === 'deny' && prior?.pendingSource != null)
    fields.pendingSource = structuredClone(prior.pendingSource);
  if (state === 'deny' && completion !== undefined) {
    if (
      prior?.pendingSource == null ||
      !matches(readMemorySourceCompletion(completion, capability, ports), prior.pendingSource)
    )
      revisionFailure('admission-source-completion');
    fields.pendingSource = null;
  }
  if (sourceToken !== undefined) {
    if (state !== 'deny') revisionFailure('admission-source-projection');
    fields.pendingSource = readMemorySourceProjection(sourceToken, capability, ports);
  }
  const entry = {
    schema,
    repository: context.repository,
    issue,
    domain: context.domain,
    generation: current + 1,
    ...fields,
    state,
    dirty: false,
  };
  atomicRevisionJson(file(context.domain, issue), entry, p);
  return entry;
}
export async function refreshAdmission({ context, observe }, ports = {}) {
  return withRevisionInterlock(
    context,
    async (capability) => {
      try {
        const observation = await observeAdmission({ capability, context, observe }, ports);
        return await publishAdmission({ capability, observation, state: 'allow' }, ports);
      } catch {
        return await publishAdmission(
          { capability, observation: { issue: issueOf(context) }, state: 'deny' },
          ports
        );
      }
    },
    ports
  );
}

// Denial only. Local projections never authorize an editor source mutation.
export async function quarantineLinkedPlanSources({ context, targets }, ports = {}) {
  const p = revisionRuntime(ports),
    domain = resolveRevisionDomain(context, p);
  if (!domain) revisionFailure('source-domain-unavailable');
  const physical = new Set(
    targets.map((target) => resolveMutationTarget(target, p.worktree, p.worktree).physical)
  );
  const directory = path.join(domainStorage(domain), 'admission');
  const discover = () => {
    const names = p.fs.readdirSync(directory).sort();
    if (!names.length || names.some((name) => !/^[1-9][0-9]*\.json$/.test(name)))
      revisionFailure('source-admission-topology');
    const entries = names.map((name) => {
      const issue = Number(name.slice(0, -5));
      const entry = raw(domain, issue, p);
      if (!Number.isSafeInteger(issue) || !valid(entry, domain, issue))
        revisionFailure('source-admission-unavailable');
      if (
        entry.state === 'deny' &&
        entry.localPlan === null &&
        !entry.sourceBindings.some(
          (binding) =>
            binding.identity === 'linked-plan' &&
            binding.hash ===
              hashRevisionValue(validateGovernedLinkedPlan({ body: '', projectDir: p.worktree }))
        )
      )
        revisionFailure('source-admission-association-unavailable');
      if (entry.localPlan !== null) {
        const reference = linkedPlanReference(entry.localPlan.body);
        if (
          !reference ||
          reference.key !== entry.localPlan.key ||
          reference.path !== entry.localPlan.path
        )
          revisionFailure('source-admission-reference');
      }
      return { issue, entry };
    });
    const issues = entries
      .filter(
        ({ entry }) =>
          entry.localPlan !== null &&
          physical.has(resolveMutationTarget(entry.localPlan.path, p.worktree, p.worktree).physical)
      )
      .map(({ issue }) => issue)
      .sort((a, b) => a - b);
    return { entries, issues };
  };
  const before = discover();
  if (!before.issues.length) return false;
  await withRevisionInterlock(
    { ...context, domain, issues: before.issues },
    async (capability) => {
      if (!matches(before, discover())) revisionFailure('source-admission-scope-drift');
      for (const issue of before.issues) {
        const entry = await publishAdmission(
          { capability, observation: { issue }, state: 'deny' },
          p
        );
        if (entry.state !== 'deny' || !matches(raw(domain, issue, p), entry))
          revisionFailure('source-admission-deny-readback');
      }
    },
    p
  );
  return true;
}
