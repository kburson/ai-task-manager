// Local projection only. The trusted observe callback must independently read
// and validate complete remote authority; archived self-consistency is not that
// validation. No production route supplies this callback until later children.
import path from 'node:path';
import { validateRevisionObservation } from './schema.mjs';
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
const schema = 'aitm.revision-admission/v1';
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
  return (
    exact(a, [
      'schema',
      'revisionId',
      'semanticContractDigest',
      'contractEpoch',
      'sourceBindings',
      'provenance',
    ]) &&
    a.schema === 'aitm.plan-approval-binding/v1' &&
    a.revisionId === revisionId &&
    a.semanticContractDigest === digest &&
    (a.contractEpoch === null || (Number.isSafeInteger(a.contractEpoch) && a.contractEpoch >= 0)) &&
    (epoch === undefined || a.contractEpoch === epoch) &&
    bindings(a.sourceBindings) &&
    matches(a.sourceBindings, sources) &&
    exact(a.provenance, ['mode', 'authorityReference', 'auditReference']) &&
    ['full-auto', 'human'].includes(a.provenance.mode) &&
    typeof a.provenance.authorityReference === 'string' &&
    a.provenance.authorityReference.length > 0 &&
    typeof a.provenance.auditReference === 'string' &&
    a.provenance.auditReference.length > 0
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
    return valid(entry, domain, issueOf(context))
      ? entry
      : { state: 'deny', reason: 'admission-unavailable' };
  } catch {
    return { state: 'deny', reason: 'domain-unavailable' };
  }
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
export async function observeAdmission({ capability, context, observe }, ports = {}) {
  assertRevisionCapability(capability, context, ports);
  const p = revisionRuntime(ports),
    bound = revisionCapabilityContext(capability),
    issue = issueOf(context),
    baseline = generation(bound.domain, issue, p);
  const result = await observe({ ...bound, issue });
  assertRevisionCapability(capability, context, p);
  const fields = validateAuthority(result, { ...bound, issue });
  const receipt = Object.freeze({});
  receipts.set(receipt, {
    capability,
    issue,
    generation: baseline,
    fields: structuredClone(fields),
  });
  return receipt;
}
export async function publishAdmission({ capability, observation, state }, ports = {}) {
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
  const fields =
    state === 'allow'
      ? receipt.fields
      : {
          eventHead: null,
          revision: 0,
          revisionId: null,
          contractDigest: null,
          sourceBindings: [],
          planApproval: null,
        };
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
