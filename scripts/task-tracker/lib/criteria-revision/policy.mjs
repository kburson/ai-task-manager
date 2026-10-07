import { assertNativeRuntimeRootAdaptersAbsent } from '../runtime-storage.mjs';
import { assertOriginalInvariantBodyRequest } from '../issue-body-mutate.mjs';
import { readNativeChecklistOperation, assertCurrentNativeChecklistOperation } from '../../verbs/check.mjs';
import { readNativeLinkedSourceOperation } from '../../source-edit-gate.mjs';
import { validateGovernedLinkedPlan, isGovernedPlanObservation } from '../governed-plan-policy.mjs';
import { setUserStory } from '../user-story-author.mjs';
import { withMemoryTransportQuarantine, withMemoryStageEffectQuarantine, isMemoryStageEffectScope, assertRevisionStageHostEffect } from './transport-quarantine.mjs';
import { readNativeUserStoryOperation } from '../../verbs/user-story.mjs';
import { readNativeSourceOperation, applyIssueBodyOperation } from '../../verbs/issue-body.mjs';
import { deriveNativeSourceJournal, validateNativeSourceJournal, reconstructNativeHistory, changesNativeSource } from './source-correction.mjs';
import { findLostMarkers } from '../body-invariants.mjs';
import { validateBlocker } from '../action-decision/contract.mjs';
import { buildVerificationFingerprint } from '../verification-receipt.mjs';
import { captureEvidenceProvenance } from '../evidence-provenance.mjs';
import { deriveNativeProofJournal, validateNativeProofJournal, deriveNativeChecklistOperation } from './proof-execution.mjs';
import { readNativeVerifierExecution } from '../evidence-runner.mjs';
import { sameRevisionObservation } from './canonical.mjs';
// @story #1855
// Consumer observations are issued only after a complete read by the recognized
// authority backend under the exact held interlock. Public booleans and callbacks
// cannot create an observation or substitute approval authority.
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { observeRevision } from './engine.mjs';
import { readCurrentMemoryPlanApproval } from './plan-approval.mjs';
import { resolveRevisionDomain, revisionRuntime } from './domain.mjs';
import { getActiveTask } from '../../session-state.mjs';
import { currentSessionId } from '../../word-counter.mjs';
import { readExactSessionBinding, bindingMatches } from '../mutation-context.mjs';
import { readWorktreeIdentity } from '../worktree-binding-guard.mjs';
import { readAdmission, quarantineLinkedPlanSources } from './admission.mjs';
import { isMetadataOnlyBodyChange } from './consumer-continuation.mjs';
import {
  assertRevisionMemory,
  assertMemoryCapability,
  withMemoryInterlock,
  publishMemoryDeny,
  persistMemoryNativeProof,
  readMemoryNativeProofRecords,
  readMemoryNativeHistory,
  readMemoryPlanJournal,
  persistMemoryNativeSource,
  publishMemorySourcePending,
} from './store.mjs';

const observations = new WeakMap();
const active = new AsyncLocalStorage();
function runMemoryContext(context, fn) {
  return withMemoryTransportQuarantine(() => context.activity === 'stage-write'
    ? withMemoryStageEffectQuarantine(() => active.run(context, fn)) : active.run(context, fn));
}
const mutationActivities = new Set(['body-write', 'capsule-write', 'contract-write', 'ac-stamp', 'dod-stamp', 'issue-write', 'stage-write']);

export class RevisionPolicyError extends Error {
  constructor(result) {
    super(result.code);
    this.name = 'RevisionPolicyError';
    Object.assign(this, result);
    this.blocker = Object.freeze(validateBlocker({ guardId: 'revision-mutation', code: result.code,
      args: {}, noAutomaticRemediation: result.noAutomaticRemediation }, { status: result.status }));
  }
}
const outcome = (status, code = null) => Object.freeze({
  status,
  code,
  ...(status === 'ready' ? {} : { noAutomaticRemediation: { reason: 'authority-investigation-required' } }),
});

function hasRevisedCriteria(state) {
  return ['applied', 'aborted'].includes(state.status) && state.criteriaAuthority !== null &&
    state.criteriaAuthority !== undefined;
}
function effectiveCriteriaProposal(state) { return state.criteriaAuthority?.proposal ?? state.effectiveProposal; }

export async function observeGovernedRevision({ context, backend, capability }) {
  assertRevisionMemory(backend);
  assertMemoryCapability(backend, capability, context);
  const state = await observeRevision({ context, deps: backend });
  let approval = null;
  if (state.status === 'applied' || (state.status === 'aborted' && state.observation.revision > 0)) {
    try { approval = await readCurrentMemoryPlanApproval({ backend, context }); }
    catch { /* A failed current approval read cannot grant admission. */ }
  }
  assertMemoryCapability(backend, capability, context);
  const receipt = Object.freeze({});
  observations.set(receipt, { backend, context, capability, state, approval, raw: backend.observation });
  return receipt;
}

export function evaluateRevisionPolicy({ activity, observation, capability }) {
  if (activity !== 'status' && !mutationActivities.has(activity))
    return outcome('indeterminate', 'revision-authority-unavailable');
  const held = observations.get(observation);
  if (!held || held.capability !== capability) return outcome('indeterminate', 'revision-authority-unavailable');
  try { assertMemoryCapability(held.backend, capability, held.context); }
  catch { return outcome('indeterminate', 'revision-authority-unavailable'); }
  const { state, approval } = held;
  if (held.backend.snapshot.pendingSource) return outcome('blocked', 'revision-pending');
  if (state.status.startsWith('pending-') || state.chain?.status === 'pending')
    return outcome('blocked', 'revision-pending');
  if (state.status === 'indeterminate') return outcome('indeterminate', 'revision-authority-unavailable');
  if (!['empty', 'applied', 'aborted'].includes(state.status))
    return outcome('blocked', 'revision-conflict');
  if ((state.status === 'applied' || (state.status === 'aborted' && state.observation.revision > 0)) && !approval && activity !== 'status')
    return outcome('blocked', 'revision-approval-stale');
  return outcome('ready');
}

export async function withGovernedRevisionMutation({ context, observe }, fn) {
  const { backend, activity = 'body-write', capability: suppliedCapability, ...scope } = context;
  // Read readiness and the separately governed native Plan approval path are
  // not mutation capabilities. A caller-selected activity cannot bypass them.
  if (!mutationActivities.has(activity))
    throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable'));
  assertRevisionMemory(backend);
  const parent = active.getStore();
  const run = async capability => {
    const observation = await observe({ context: scope, capability });
    const result = evaluateRevisionPolicy({ activity, observation, capability });
    if (result.status !== 'ready') throw new RevisionPolicyError(result);
    await publishMemoryDeny(backend, capability, scope);
    return runMemoryContext({ backend, context: scope, capability, observation, activity }, () => fn(capability));
  };
  if (parent) {
    if (parent.backend !== backend) throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    assertMemoryCapability(backend, parent.capability, scope);
    if (parent.nativeSourceJournal && activity === 'body-write') {
      const record = readMemoryNativeHistory(backend).sources.at(-1);
      validateNativeSourceJournal(record);
      if (canonicalRecordJson(record) !== canonicalRecordJson(parent.nativeSourceJournal) ||
          !sameRevisionObservation(backend.observation, record.before))
        throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
      return fn(parent.capability);
    }
    if (parent.nativeProofJournal && activity === 'body-write') {
      const record = readMemoryNativeProofRecords(backend).at(-1);
      validateNativeProofJournal(record);
      if (canonicalRecordJson(record) !== canonicalRecordJson(parent.nativeProofJournal) ||
          !sameRevisionObservation(backend.observation, record.before))
        throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
      return fn(parent.capability);
    }
    return run(parent.capability);
  }
  if (suppliedCapability) {
    assertMemoryCapability(backend, suppliedCapability, scope);
    return run(suppliedCapability);
  }
  return withMemoryInterlock(backend, scope, run);
}

// This is an ordinary consumer boundary, not a transaction mutation runtime.
// Task 6 supplies the trusted production collector. An enabled domain without
// that collector fails closed; disabled domains retain the ordinary gates.
export async function withRevisionConsumer({ repository, issue, activity, backend, capability, projectDir }, fn) {
  backend ??= active.getStore()?.backend;
  if (backend) {
    assertRevisionMemory(backend);
    const native = backend.observation;
    if (repository !== native.repository || Number(issue) !== native.issue ||
        (projectDir !== undefined && path.resolve(projectDir) !== path.resolve(native.executor.worktree)))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    const context = { repository, issue: Number(issue), executor: native.executor };
    return withGovernedRevisionMutation({
      context: { ...context, backend, activity, capability },
      observe: ({ capability }) => observeGovernedRevision({ context, backend, capability }),
    }, fn);
  }
  let domain;
  try { domain = resolveConsumerDomain({ repository, issue: Number(issue) }, projectDir ? { worktree: projectDir } : {}).domain; }
  catch { throw new RevisionPolicyError(outcome('indeterminate', 'revision-topology-unsupported')); }
  if (domain) throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable'));
  return fn(null);
}

// Public issue mutation admission is separate from the authenticated lock-only
// primitive. A caller-supplied held lock never stands in for this fresh read.
export async function withRevisionIssueMutation(opts, fn) {
  const parent = active.getStore();
  const backend = opts.revisionBackend ?? parent?.backend;
  if (backend) assertRevisionMemory(backend);
  const repository = opts.repository ?? opts.revisionContext?.repository ?? backend?.observation.repository ?? '';
  const issue = Number(String(opts.issue).replace(/^#/, ''));
  if (backend && path.resolve(opts.projDir) !== path.resolve(backend.observation.executor.worktree))
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  return withRevisionConsumer({ repository, issue, activity: 'issue-write', backend,
    capability: opts.revisionCapability, projectDir: opts.projDir }, capability => {
    if (!capability) return fn(opts);
    const context = { repository, issue, executor: backend.observation.executor };
    if (opts.revisionContext) assertMemoryCapability(backend, capability, opts.revisionContext);
    return fn({ ...opts, revisionContext: context, revisionCapability: capability, revisionPorts: undefined });
  });
}

function registrationRootIsAbsent(runtime) {
  let cursor = runtime.configRoot;
  while (true) {
    try {
      const stat = runtime.fs.lstatSync(cursor);
      return cursor !== runtime.configRoot && stat.isDirectory();
    } catch (error) {
      if (error.code !== 'ENOENT') return false;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
}

// Local activity consumes only the atomic projection; it cannot establish remote
// approval. No cached source/board signal substitutes for this per-call read.
function hostHasNoRevisionRegistrations(runtime) {
  try {
    const root = runtime.fs.lstatSync(runtime.configRoot);
    return root.isDirectory() && !root.isSymbolicLink() && runtime.fs.readdirSync(runtime.configRoot).length === 0;
  }
  catch (error) { return error.code === 'ENOENT' && registrationRootIsAbsent(runtime); }
}

function resolveConsumerDomain(context, ports = {}) {
  const runtime = revisionRuntime(ports);
  let actualRepository = null;
  try { actualRepository = runtime.inspect(runtime.worktree).repository; }
  catch { /* Unknown native identity cannot establish disabled authority. */ }
  if (context.repository === '' || context.repository == null) {
    if (actualRepository) context = { ...context, repository: actualRepository };
    else {
      if (hostHasNoRevisionRegistrations(runtime)) return { context, domain: null };
      throw new Error('revision-topology-unsupported');
    }
  }
  if (actualRepository && actualRepository.toLowerCase() !== String(context.repository).toLowerCase() &&
      resolveRevisionDomain({ ...context, repository: actualRepository }, ports))
    throw new Error('revision-topology-unsupported');
  const domain = resolveRevisionDomain(context, ports);
  if (!domain && !hostHasNoRevisionRegistrations(runtime))
    throw new Error('revision-topology-unsupported');
  return { context, domain };
}

export async function quarantineLocalSourceEdit({ repository, targets, projectDir, sessionId }, ports = {}) {
  if (!Array.isArray(targets) || !targets.length) return outcome('ready');
  try {
    const runtime = revisionRuntime({ ...ports, worktree: projectDir });
    const resolved = resolveConsumerDomain({ repository }, runtime);
    if (!resolved.domain) return outcome('ready');
    const binding = readExactSessionBinding(projectDir, { sessionId });
    const actual = readWorktreeIdentity({ projectDir });
    const record = sessionId ? getActiveTask(sessionId, projectDir) : null;
    const executor = bindingMatches(actual, binding, binding?.issueNumber) &&
      record?.entryStartTs && Number.isFinite(Date.parse(record.entryStartTs))
      ? { adapter: 'codex-session/v1', sessionId, worktree: actual.worktreePath, branch: actual.worktreeBranch } : null;
    const affected = await quarantineLinkedPlanSources({ context: { ...resolved.context,
      domain: resolved.domain, executor }, targets }, runtime);
    return affected ? outcome('indeterminate', 'revision-authority-unavailable') : outcome('ready');
  } catch {
    return outcome('indeterminate', 'revision-authority-unavailable');
  }
}

export function evaluateLocalRevisionActivity(context, ports = {}) {
  let resolved;
  try { resolved = resolveConsumerDomain(context, ports); }
  catch { return outcome('indeterminate', 'revision-topology-unsupported'); }
  if (!resolved.domain) return outcome('ready');
  const entry = readAdmission(resolved.context, ports);
  return entry.state === 'allow' ? outcome('ready') : outcome('blocked', 'revision-approval-stale');
}

// A stage scope also contains the already-sanctioned Develop-final receipt.
// This returnless comparison selects only that private, durably read-back proof
// continuation. It does not permit any real host transport or mint a capability.
export function assertRevisionStageBodyEntry(input) {
  if (!isMemoryStageEffectScope()) return;
  try {
    const current = active.getStore(), held = observations.get(current?.observation);
    if (!held || current.activity !== 'stage-write' || !current.nativeProofJournal)
      throw new TypeError();
    assertMemoryCapability(held.backend, current.capability, held.context);
    const data = (value, keys) => {
      if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError();
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key) ||
          !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) throw new TypeError();
      return Object.assign(Object.create(null), Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])));
    };
    const value = data(input, ['issueNumber', 'repo', 'mutate', 'deps', 'maxRetries', 'expectedVersion',
      'evidenceStamp', 'allowMarkerLoss', 'allowUnverifiedTicks', 'reviewedEvidenceCapability',
      'criteriaRevisionCapability', 'expectedRemovedHeadings', 'allowLargeShrink', 'allowMarkerAdvance',
      'validateFreshBase', 'validateFreshBaseAsync', 'validateMutation']);
    const nativeEmptyArray = value => value === undefined || (Array.isArray(value) &&
      Object.getPrototypeOf(value) === Array.prototype && Reflect.ownKeys(value).length === 1 &&
      Object.getOwnPropertyDescriptor(value, 'length')?.value === 0);
    if (value.repo !== held.context.repository ||
        (value.issueNumber !== held.context.issue && value.issueNumber !== String(held.context.issue)) ||
        typeof value.mutate !== 'function' || value.criteriaRevisionCapability !== undefined ||
        value.reviewedEvidenceCapability !== undefined || value.allowMarkerLoss || value.allowUnverifiedTicks ||
        value.allowLargeShrink || !nativeEmptyArray(value.expectedRemovedHeadings) ||
        !nativeEmptyArray(value.allowMarkerAdvance))
      throw new TypeError();
    if (value.maxRetries !== undefined && (!Number.isSafeInteger(value.maxRetries) || value.maxRetries < 1) ||
        value.expectedVersion !== undefined && (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0) ||
        ['evidenceStamp', 'allowMarkerLoss', 'allowUnverifiedTicks', 'allowLargeShrink'].some(key =>
          value[key] !== undefined && typeof value[key] !== 'boolean') ||
        value.validateFreshBase !== undefined || value.validateFreshBaseAsync !== undefined) throw new TypeError();
    if (value.validateMutation !== undefined) assertOriginalInvariantBodyRequest(input);
    const deps = data(value.deps ?? {}, ['pexec', 'revisionBackend']);
    if ((deps.pexec !== undefined && typeof deps.pexec !== 'function') ||
        (deps.revisionBackend !== undefined && deps.revisionBackend !== held.backend)) throw new TypeError();
    const journal = validateNativeProofJournal(current.nativeProofJournal);
    if (journal.execution.schema !== 'aitm.native-develop-final-execution/v1' ||
        canonicalRecordJson(readMemoryNativeProofRecords(held.backend).at(-1)) !== canonicalRecordJson(journal) ||
        !sameRevisionObservation(held.backend.observation, journal.before) ||
        !sameRevisionObservation(held.raw, journal.before)) throw new TypeError();
  } catch { assertRevisionStageHostEffect(); }
}

// Code namespace only. Actual original frame, capability, current-before and
// persisted intent are revalidated on every comparison; no ready result is saved.
let nativeStageBodyCode = null;
function requireNativeStageBodyFrame(input, before) {
  const refuse = () => { throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable')); };
  const current = active.getStore();
  const held = observations.get(current?.observation);
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !held || current.activity !== 'stage-write' || current.backend !== held.backend ||
      current.nativeProofJournal || current.nativeSourceJournal) refuse();
  assertMemoryCapability(held.backend, current.capability, held.context);
  if (typeof before !== 'string' || before !== held.raw.body.bytes ||
      before !== held.state.observation.body.bytes ||
      !sameRevisionObservation(held.backend.observation, held.raw)) refuse();
  return current;
}
function requireNativeStageBodyScope(input) {
  const current = active.getStore();
  const held = observations.get(current?.observation);
  if (!input || typeof input !== 'object' || Array.isArray(input) || !held ||
      current.activity !== 'stage-write' || current.backend !== held.backend ||
      current.nativeProofJournal || current.nativeSourceJournal)
    throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable'));
  assertMemoryCapability(held.backend, current.capability, held.context);
  return current;
}
// Returnless comparisons; neither registers custody or authorizes a body delta.
export function assertNativeStageEntryFrame(input, before) {
  requireNativeStageBodyFrame(input, before);
}
export function assertNativeStageSentinelFrame(input) {
  const refuse = () => { throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable')); };
  if (!input || Object.getPrototypeOf(input) !== Object.prototype) refuse();
  const keys = ['backend', 'capability', 'repository', 'issue', 'projectDir', 'originalObservation'];
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key =>
      !descriptors[key] || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) refuse();
  const value = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
  const current = requireNativeStageBodyScope(input), held = observations.get(current.observation);
  if (value.backend !== held.backend || value.capability !== current.capability ||
      value.repository !== held.context.repository || value.issue !== held.context.issue ||
      value.projectDir !== held.context.executor.worktree ||
      !sameRevisionObservation(value.originalObservation, held.raw)) refuse();
}
export async function assertNativeStageBodyMutation(input, before, after) {
  const originalFrame = requireNativeStageBodyScope(input);
  const code = nativeStageBodyCode ?? await import('../move-state/move-state-core.mjs');
  if (requireNativeStageBodyScope(input) !== originalFrame)
    throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable'));
  nativeStageBodyCode = code;
  assertRevisionBodyMutation(before, after, input);
}
export function assertRevisionBodyMutation(before, after, nativeInput) {
  if (nativeInput !== undefined) {
    requireNativeStageBodyScope(nativeInput);
    if (!nativeStageBodyCode) throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable'));
    nativeStageBodyCode.assertNativeStageBodyDelta(nativeInput, before, after);
    return;
  }
  const current = active.getStore();
  if (!current) return;
  const held = observations.get(current.observation);
  assertMemoryCapability(held.backend, current.capability, held.context);
  if (!hasRevisedCriteria(held.state) && !current.nativeProofJournal && !current.nativeSourceJournal) return;
  if (before !== held.state.observation.body.bytes)
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  if (current.nativeSourceJournal) {
    const j = validateNativeSourceJournal(current.nativeSourceJournal);
    if (before !== j.before.body.bytes || after !== j.after.body.bytes ||
        !sameRevisionObservation(held.backend.observation, j.before))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    return;
  }
  if (current.nativeProofJournal) {
    const j = validateNativeProofJournal(current.nativeProofJournal);
    if (j.execution.schema === 'aitm.native-checkbox-operation/v1') {
      assertChecklistExecutor(j.execution.scope, j.execution.scope.executor.worktree);
      assertChecklistCurrentProofs(j.execution);
    }
    if (before !== j.before.body.bytes || after !== j.after.body.bytes ||
        !sameRevisionObservation(held.backend.observation, j.before))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    return;
  }
  if (!hasRevisedCriteria(held.state)) return;
  if (!isMetadataOnlyBodyChange(before, after, held.state.observation, (held.state.currentContract ?? effectiveCriteriaProposal(held.state).after).definitions))
    throw new RevisionPolicyError(outcome('blocked', 'criteria-revision-required'));
}

import { validateRevisionEvidenceBinding } from './evidence-binding.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';

export function currentRevisionEvidenceBinding({ issue, body } = {}) {
  const current = active.getStore();
  if (!current) return null;
  const held = observations.get(current.observation);
  assertMemoryCapability(held.backend, current.capability, held.context);
  if (issue !== undefined && Number(issue) !== held.context.issue)
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  const nativeContinuation = current.activity === 'native-proof-continuation' &&
    held.state.status === 'pending-native-proof' && current.nativeProofJournal === held.state.nativeProofJournal;
  if (!hasRevisedCriteria(held.state) && !nativeContinuation) return null;
  if (body !== undefined && body !== held.state.observation.body.bytes)
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  const contract = held.state.observation.contract?.value;
  return Object.freeze(validateRevisionEvidenceBinding({
    schema: 'aitm.revision-evidence-binding/v1', repository: held.context.repository, issue: held.context.issue,
    revisionId: (held.state.currentContract ?? effectiveCriteriaProposal(held.state).after).revisionId,
    semanticContractDigest: (held.state.currentContract ?? effectiveCriteriaProposal(held.state).after).semanticContractDigest,
    contractEpoch: contract?.contractEpoch ?? null, authorityEpoch: contract?.authorityEpoch ?? null,
  }));
}

export function matchesCurrentRevisionEvidence(binding, { issue, structural = false } = {}) {
  try {
    if (binding !== undefined) validateRevisionEvidenceBinding(binding);
    // Historical parsing remains structural outside an observed consumer. Reuse
    // never treats a serialized binding as its own current authority.
    if (structural && !active.getStore()) return true;
    const expected = currentRevisionEvidenceBinding({ issue });
    return expected ? canonicalRecordJson(binding ?? null) === canonicalRecordJson(expected) : binding === undefined;
  } catch { return false; }
}

// Current definitions come from the validated transaction/contract source, never
// an arbitrary body projection or caller-supplied definition list.
export function currentRevisionDefinitions({ body } = {}) {
  if (!currentRevisionEvidenceBinding({ body })) return null;
  const state = observations.get(active.getStore().observation).state;
  return structuredClone((state.currentContract ?? effectiveCriteriaProposal(state).after).definitions);
}

import { parseProofMarker } from '../proof-marker.mjs';
import { hashBytes } from './schema.mjs';
import { hashSemanticContract } from './proposal.mjs';

import { stripBodyVersion } from '../versioned-issue-write.mjs';
export function revisionEvidenceMarkerProperties({ body } = {}) {
  const binding = currentRevisionEvidenceBinding();
  if (!binding) return {};
  const expected = observations.get(active.getStore().observation).state.observation.body.bytes;
  // The native versioned writer supplies its exact version-stripped fresh base
  // to ordinary transforms; this does not authorize any proof delta or effect.
  if (body !== expected && body !== stripBodyVersion(expected))
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  return { 'revision-binding': canonicalRecordJson(binding) };
}

export function acceptsIndividualRevisionProof(text, section) {
  try {
    const props = parseProofMarker(text);
    if (props?.['revision-binding'] !== undefined)
      return matchesCurrentRevisionEvidence(JSON.parse(props['revision-binding']), { structural: true });
    const binding = currentRevisionEvidenceBinding();
    if (!binding) return true;
    const held = observations.get(active.getStore().observation);
    if (held.state.observation.sourceKind !== 'legacy-body' || !['ac', 'vc', 'dod'].includes(section)) return false;
    const proposal = effectiveCriteriaProposal(held.state);
    return (held.state.currentContract ?? proposal.after).definitions.some(d => d.section === section && d.proof &&
      (text === d.originalBytes || text === d.originalBytes.replace(/^- \[[ x]\] /, '')) &&
      proposal.invalidation.some(item => item.kind === `${section}-proof` &&
        item.criterionIdentity === d.identity && item.identity === d.proof.identity &&
        item.disposition === 'preserved-individual' && item.destinationRevision === binding.revisionId &&
        item.bytesHash === hashBytes(d.proof.bytes) && item.dependencyHash === hashSemanticContract([d])));
  } catch { return false; }
}

// Read-only execution scope. This is data, not a proof-write capability; only
// the real runner owns the opaque token that can attest its completed work.
export function currentRevisionExecutionScope() {
  const binding = currentRevisionEvidenceBinding();
  if (!binding) return null;
  const current = active.getStore(), held = observations.get(current.observation);
  return structuredClone({ binding, observation: held.backend.observation,
    definitions: (held.state.currentContract ?? effectiveCriteriaProposal(held.state).after).definitions,
    executor: held.context.executor });
}

// Actual stamp adapters call this after the real runner finishes. The supplied
// token carries no user-settable authority and is verified against this exact
// private held consumer, intended criterion, and original authority state.
export async function prepareRevisionProof(executionToken) {
  const current = active.getStore();
  if (!currentRevisionEvidenceBinding()) return null;
  if (!current || !['ac-stamp', 'dod-stamp'].includes(current.activity))
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  const held = observations.get(current.observation), execution = readNativeVerifierExecution(executionToken);
  if (current.activity !== `${execution.intent.kind}-stamp`)
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  let journal;
  try { journal = deriveNativeProofJournal(execution, held.state.chain.head); }
  catch (error) {
    if (error.message === 'criteria-revision:native-proof-definition-delta')
      throw new RevisionPolicyError(outcome('blocked', 'criteria-revision-required'));
    throw error;
  }
  current.nativeProofJournal = await persistMemoryNativeProof({ backend: held.backend, context: held.context,
    capability: current.capability, executionToken, journal });
  return journal.id;
}

function assertChecklistExecutor(scope, projectDir) {
  if (projectDir !== scope.executor.worktree) throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  const sid = currentSessionId(), task = getActiveTask(sid, projectDir);
  const provenance = captureEvidenceProvenance({ projectDir, boundIssue: scope.binding.issue });
  if (sid !== scope.executor.sessionId || String(task?.issue).replace(/^#/, '') !== String(scope.binding.issue) ||
      task.paused || !Number.isFinite(Date.parse(task.entryStartTs)) ||
      task.worktreePath !== projectDir || task.worktreeBranch !== scope.executor.branch ||
      provenance.worktreePath !== scope.executor.worktree || provenance.branch !== scope.executor.branch ||
      provenance.boundIssue !== scope.binding.issue)
    throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable'));
}

// Live dependency check only. Historical replay validates the immutable
// execution capture without reading today's worktree or substituting an observer.
function assertChecklistCurrentProofs(operation) {
  const projectDir = operation.scope.executor.worktree;
  const native = operation.proofBases.filter(basis => basis.kind === 'native-individual');
  if (!native.length) return;
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf8' }).trim();
  const provenance = captureEvidenceProvenance({ projectDir, boundIssue: operation.binding.issue });
  for (const basis of native) {
    const original = basis.witness.execution;
    const fingerprint = buildVerificationFingerprint({ projectDir, commitSha, verificationCommands: original.commands });
    if (fingerprint.environment.sandbox.clean !== true || original.fingerprint.environment.sandbox.clean !== true ||
        canonicalRecordJson(fingerprint) !== canonicalRecordJson(original.fingerprint) ||
        canonicalRecordJson(provenance) !== canonicalRecordJson(original.provenance))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  }
}

// Current data only, never a token issuer. The actual check adapter still
// executes its native evidence gate before privately issuing the write token.
export async function currentRevisionChecklistOperation({ intent, projectDir }) {
  const scope = currentRevisionExecutionScope();
  if (!scope) return null;
  const current = active.getStore(), held = observations.get(current.observation);
  if (current.activity !== 'issue-write' || projectDir !== held.context.executor.worktree)
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  await assertChecklistExecutor(scope, projectDir);
  assertMemoryCapability(held.backend, current.capability, held.context);
  const proposal = effectiveCriteriaProposal(held.state);
  try {
    const operation = deriveNativeChecklistOperation({ scope, intent, chain: held.state.chain,
      proposal: { ...proposal, after: held.state.currentContract ?? proposal.after },
      completedProofRecords: readMemoryNativeProofRecords(held.backend) });
    assertChecklistCurrentProofs(operation);
    return operation;
  } catch { throw new RevisionPolicyError(outcome('blocked', 'criteria-revision-required')); }
}

export async function prepareRevisionChecklist(token) {
  const current = active.getStore();
  if (!currentRevisionEvidenceBinding() || current?.activity !== 'issue-write')
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  const held = observations.get(current.observation), execution = readNativeChecklistOperation(token);
  const journal = deriveNativeProofJournal(execution, held.state.chain.head);
  current.nativeProofJournal = await persistMemoryNativeProof({ backend: held.backend, context: held.context,
    capability: current.capability, executionToken: token, journal });
  return journal.id;
}

// Aggregate completion is separately typed; it cannot authorize an individual
// proof or a stage transition and never accepts a caller success/result record.
export async function prepareRevisionDevelopReceipt(executionToken) {
  if (!currentRevisionEvidenceBinding()) return null;
  const current = active.getStore();
  if (current?.activity !== 'stage-write') throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  const held = observations.get(current.observation);
  const { readNativeDevelopExecution } = await import('../../verify-develop.mjs');
  assertMemoryCapability(held.backend, current.capability, held.context);
  const execution = readNativeDevelopExecution(executionToken);
  const journal = deriveNativeProofJournal(execution, held.state.chain.head);
  current.nativeProofJournal = await persistMemoryNativeProof({ backend: held.backend, context: held.context,
    capability: current.capability, executionToken, journal });
  return journal.id;
}

// Resume only the original aggregate receipt under its independently replayed
// pending prefix. Ordinary Test admission follows after this fixed effect.
export async function resumeRevisionDevelopReceipt({ repository, issue, backend, projectDir, writeDeps = {} }) {
  if (!backend) return false;
  assertRevisionMemory(backend);
  const parent = active.getStore();
  if (parent) {
    if (parent.backend !== backend) throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    assertMemoryCapability(backend, parent.capability, { repository, issue: Number(issue), executor: backend.observation.executor });
    // Recovery belongs before the public entry's issue lock. A nested ordinary
    // runner obtains fresh policy admission below and cannot reacquire here.
    return false;
  }
  if (backend.snapshot.pendingSource) throw new RevisionPolicyError(outcome('blocked', 'revision-pending'));
  if (!readMemoryNativeProofRecords(backend).length) return false;
  const context = { repository, issue: Number(issue), executor: backend.observation.executor };
  return withMemoryInterlock(backend, context, async capability => {
    const state = await observeRevision({ context, deps: backend });
    if (state.status !== 'pending-native-proof') return false;
    const journal = validateNativeProofJournal(readMemoryNativeProofRecords(backend).at(-1));
    if (journal.execution.schema !== 'aitm.native-develop-final-execution/v1' ||
        projectDir !== context.executor.worktree ||
        canonicalRecordJson(state.nativeProofJournal) !== canonicalRecordJson(journal) ||
        !sameRevisionObservation(backend.observation, journal.before))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    await publishMemoryDeny(backend, capability, context);
    const observation = Object.freeze({});
    observations.set(observation, { backend, context, capability, state, approval: null });
    await runMemoryContext({ backend, context, capability, observation,
      activity: 'native-proof-continuation', nativeProofJournal: state.nativeProofJournal }, async () => {
      const { assertCurrentNativeDevelopExecution } = await import('../../verify-develop.mjs');
      assertMemoryCapability(backend, capability, context);
      assertCurrentNativeDevelopExecution(journal.execution);
      const { mutateIssueBody } = await import('../issue-body-mutate.mjs');
      await mutateIssueBody({ repo: repository, issueNumber: issue, deps: { pexec: writeDeps.pexec }, evidenceStamp: true,
        mutate: () => stripBodyVersion(journal.after.body.bytes) });
    });
    const verified = await observeRevision({ context, deps: backend });
    if (!hasRevisedCriteria(verified) || !sameRevisionObservation(backend.observation, journal.after))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    return true;
  });
}

// Only the exact recorded checkbox intent may complete its recognized native
// before-body prefix. This does not issue a new operation or rerun verification.
export async function resumeRevisionChecklist({ repository, issue, backend, intent, projectDir, pexec }) {
  if (!backend) return false;
  assertRevisionMemory(backend);
  const native = backend.observation;
  if (repository !== native.repository || Number(issue) !== native.issue || projectDir !== native.executor.worktree)
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  if (backend.snapshot.pendingSource) throw new RevisionPolicyError(outcome('blocked', 'revision-pending'));
  const context = { repository, issue: Number(issue), executor: native.executor };
  return withMemoryInterlock(backend, context, async capability => {
    const state = await observeRevision({ context, deps: backend });
    if (state.status !== 'pending-native-proof') return false;
    const journal = validateNativeProofJournal(readMemoryNativeProofRecords(backend).at(-1));
    if (journal.execution.schema !== 'aitm.native-checkbox-operation/v1' ||
        canonicalRecordJson(journal.execution.intent) !== canonicalRecordJson(intent) ||
        canonicalRecordJson(state.nativeProofJournal) !== canonicalRecordJson(journal) ||
        !sameRevisionObservation(backend.observation, journal.before))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    await assertChecklistExecutor(journal.execution.scope, projectDir);
    await publishMemoryDeny(backend, capability, context);
    const observation = Object.freeze({});
    observations.set(observation, { backend, context, capability, state, approval: null });
    await runMemoryContext({ backend, context, capability, observation, activity: 'native-proof-continuation', nativeProofJournal: state.nativeProofJournal }, async () => {
      assertChecklistCurrentProofs(journal.execution);
      assertCurrentNativeChecklistOperation(journal.execution);
      const { mutateIssueBody } = await import('../issue-body-mutate.mjs');
      await mutateIssueBody({ repo: repository, issueNumber: issue, deps: { pexec },
        mutate: () => stripBodyVersion(journal.after.body.bytes) });
    });
    const verified = await observeRevision({ context, deps: backend });
    if (!hasRevisedCriteria(verified) || !sameRevisionObservation(backend.observation, journal.after))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    return true;
  });
}

// Fixed native continuation, not a pending-state allowance for arbitrary work.
// The durable original record is freshly reconstructed under the strict lock;
// only its exact body transform can run and the verifier is never invoked here.
export async function resumeRevisionProof({ repository, issue, backend, intent, projectDir, pexec }) {
  if (!backend) return false;
  assertRevisionMemory(backend);
  if (backend.snapshot.pendingSource) throw new RevisionPolicyError(outcome('blocked', 'revision-pending'));
  if (!readMemoryNativeProofRecords(backend).length) return false;
  const context = { repository, issue: Number(issue), executor: backend.observation.executor };
  return withMemoryInterlock(backend, context, async capability => {
    const state = await observeRevision({ context, deps: backend });
    if (!hasRevisedCriteria(state) && state.status !== 'pending-native-proof')
      throw new RevisionPolicyError(outcome('blocked', state.status.startsWith('pending-') ? 'revision-pending' : 'revision-conflict'));
    const journal = validateNativeProofJournal(readMemoryNativeProofRecords(backend).at(-1));
    if (journal.execution.schema !== 'aitm.native-verifier-execution/v1') {
      if (hasRevisedCriteria(state)) return false;
      throw new RevisionPolicyError(outcome('blocked', 'revision-pending'));
    }
    if (canonicalRecordJson(journal.execution.intent) !== canonicalRecordJson(intent)) {
      if (hasRevisedCriteria(state)) return false;
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    }
    const provenance = captureEvidenceProvenance({ projectDir, boundIssue: issue });
    const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], { cwd: projectDir });
    const fingerprint = buildVerificationFingerprint({ projectDir, commitSha: String(stdout).trim(), verificationCommands: journal.execution.commands });
    const matching = fingerprint.environment.sandbox.clean && journal.execution.fingerprint.environment.sandbox.clean &&
      canonicalRecordJson(fingerprint) === canonicalRecordJson(journal.execution.fingerprint) &&
      canonicalRecordJson(provenance) === canonicalRecordJson(journal.execution.provenance);
    if (!matching) {
      if (hasRevisedCriteria(state)) return false;
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    }
    await publishMemoryDeny(backend, capability, context);
    if (hasRevisedCriteria(state)) {
      if (!sameRevisionObservation(backend.observation, journal.after)) return false;
      return true;
    }
    if (canonicalRecordJson(state.nativeProofJournal) !== canonicalRecordJson(journal) ||
        !sameRevisionObservation(backend.observation, journal.before))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    const observation = Object.freeze({});
    observations.set(observation, { backend, context, capability, state, approval: null });
    await runMemoryContext({ backend, context, capability, observation, activity: 'native-proof-continuation', nativeProofJournal: state.nativeProofJournal }, async () => {
      const { mutateIssueBody } = await import('../issue-body-mutate.mjs');
      await mutateIssueBody({ repo: repository, issueNumber: issue, deps: { pexec }, evidenceStamp: true,
        mutate: () => stripBodyVersion(journal.after.body.bytes) });
    });
    const verified = await observeRevision({ context, deps: backend });
    if (verified.status !== 'applied' || !sameRevisionObservation(backend.observation, journal.after))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    return true;
  });
}


// Read-only native guard observation. Returned readiness is a diagnostic value,
// never a capability; effects still require the mutation boundary's fresh read.
export async function evaluateRevisionAdmission({ repository, issue, backend, projectDir } = {}) {
  backend ??= active.getStore()?.backend;
  try {
    if (!backend) {
      const { domain } = resolveConsumerDomain({ repository, issue: Number(issue) }, projectDir ? { worktree: projectDir } : {});
      return domain ? outcome('indeterminate', 'revision-authority-unavailable') : outcome('ready');
    }
    assertRevisionMemory(backend);
    const context = { repository, issue: Number(issue), executor: backend.observation.executor };
    const read = async capability => {
      const observation = await observeGovernedRevision({ context, backend, capability });
      return evaluateRevisionPolicy({ activity: 'issue-write', observation, capability });
    };
    const parent = active.getStore();
    if (parent) {
      if (parent.backend !== backend) return outcome('blocked', 'revision-conflict');
      assertMemoryCapability(backend, parent.capability, context);
      return await read(parent.capability);
    }
    return await withMemoryInterlock(backend, context, read);
  } catch (error) {
    return outcome('indeterminate', error.message === 'revision-topology-unsupported' ? 'revision-topology-unsupported' : 'revision-authority-unavailable');
  }
}

const sourceWrites = new WeakMap();
export function readNativeSourceWrite(token) {
  const held = sourceWrites.get(token);
  if (!held?.live) throw new Error('criteria-revision:native-source-write-token');
  assertMemoryCapability(held.backend, held.capability, held.context);
  return held;
}
function captureNativeSourceReads(body, operation, projectDir) {
  const changed = operation.schema === 'aitm.native-user-story-operation/v1'
    ? setUserStory(body, operation.story) : applyIssueBodyOperation(body, operation);
  const observed = [body, changed].map(bytes => {
    const read = validateGovernedLinkedPlan({ body: bytes, projectDir });
    if (!read.ok || !isGovernedPlanObservation(read, { body: bytes, projectDir }))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    if (!read.observation) return null;
    const { key, path, text, contentSha256, projectDir: root } = read.observation;
    return { schema: 'aitm.native-plan-source-read/v1', bodyHash: hashBytes(bytes), projectDir: root,
      key, path, text, contentSha256 };
  });
  if (observed.every(value => value === null)) return undefined;
  if (observed.some(value => value === null)) throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  return { before: observed[0], after: observed[1] };
}
export async function withNativeSourceCorrection({ token, backend }, fn) {
  assertRevisionMemory(backend);
  let native;
  try { native = readNativeSourceOperation(token); }
  catch { native = readNativeUserStoryOperation(token); }
  const context = { repository: native.repository, issue: native.issue, executor: backend.observation.executor };
  return withMemoryInterlock(backend, context, async capability => {
    const observation = await observeGovernedRevision({ context, backend, capability });
    const held = observations.get(observation), state = held.state;
    if (backend.snapshot.pendingSource) throw new RevisionPolicyError(outcome('blocked', 'revision-pending'));
    const complete = async journal => {
      const result = await runMemoryContext({ backend, context, capability, observation, activity: 'native-source-correction', nativeSourceJournal: journal }, () => fn(journal));
      const after = await observeRevision({ context, deps: backend });
      if (!hasRevisedCriteria(after) || !sameRevisionObservation(backend.observation, journal.after))
        throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
      return result;
    };
    if ((hasRevisedCriteria(state) || state.status === 'pending-native-source') && backend.snapshot.nativeSourceRecords?.length) {
      const history = readMemoryNativeHistory(backend), ref = history.order.at(-1), journal = history.sources.at(-1);
      if (ref.kind === 'source' && canonicalRecordJson(journal.operation) === canonicalRecordJson(native.operation)) {
        validateNativeSourceJournal(journal);
        if (canonicalRecordJson(journal.session) !== canonicalRecordJson(native.session))
          throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
        await publishMemoryDeny(backend, capability, context);
        if (hasRevisedCriteria(state)) {
          if (!sameRevisionObservation(backend.observation, journal.after))
            throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
          return { status: 'no-op', attempts: 0, body: journal.after.body.bytes, version: journal.after.body.version };
        }
        if (canonicalRecordJson(state.nativeSourceJournal) !== canonicalRecordJson(journal) ||
            !sameRevisionObservation(backend.observation, journal.before))
          throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
        return complete(journal);
      }
    }
    if (!['empty', 'aborted'].includes(state.status) && !hasRevisedCriteria(state))
      throw new RevisionPolicyError(outcome(state.status === 'indeterminate' ? 'indeterminate' : 'blocked',
        state.status.startsWith('pending-') ? 'revision-pending' : state.status === 'indeterminate' ? 'revision-authority-unavailable' : 'revision-conflict'));
    if (readMemoryPlanJournal(backend, context))
      throw new RevisionPolicyError(outcome('blocked', 'revision-pending'));
    if (!state.criteriaAuthority || !changesNativeSource(backend.observation.body.bytes, native.operation, native.session.projectDir))
      return runMemoryContext({ backend, context, capability, observation, activity: 'body-write' }, () => fn(null));
    await publishMemoryDeny(backend, capability, context);
    const history = readMemoryNativeHistory(backend);
    const originalNativeSources = canonicalRecordJson(backend.snapshot);
    const reconstructed = await reconstructNativeHistory({ history, chain: state.chain, backend, observation: backend.observation });
    assertMemoryCapability(backend, capability, context);
    if (canonicalRecordJson(backend.snapshot) !== originalNativeSources)
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    if (reconstructed.status !== 'complete') throw new RevisionPolicyError(outcome('blocked', 'revision-pending'));
    const sourceReads = captureNativeSourceReads(backend.observation.body.bytes, native.operation, native.session.projectDir);
    const journal = deriveNativeSourceJournal({ before: backend.observation, currentContract: reconstructed.currentContract,
      operation: native.operation, revisionEventHead: state.chain.head, predecessor: history.order.at(-1)?.id, session: native.session,
      ...(sourceReads ? { sourceReads } : {}) });
    const writeToken = Object.freeze({}), write = { live: true, backend, context, capability, journal };
    sourceWrites.set(writeToken, write);
    try {
      persistMemoryNativeSource({ backend, context, capability, token: writeToken, journal });
      return await complete(journal);
    } finally { write.live = false; }
  });
}
export async function withNativeLinkedSourceCorrection({ token, backend, capability, writeDeps }) {
  const native = readNativeLinkedSourceOperation(token);
  if (native.backend !== backend || native.capability !== capability)
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  const context = native.context;
  if (!hostHasNoRevisionRegistrations(revisionRuntime({ worktree: context.executor.worktree })))
    throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable'));
  assertMemoryCapability(backend, capability, context);
  const observation = await observeGovernedRevision({ context, backend, capability });
  const held = observations.get(observation), state = held.state;
  const actual = validateGovernedLinkedPlan({ body: backend.observation.body.bytes, projectDir: context.executor.worktree });
  if (!actual.ok || !actual.observation || actual.observation.path !== native.operation.path)
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  const assertCurrentLinkedRead = () => {
    assertMemoryCapability(backend, capability, context);
    const current = validateGovernedLinkedPlan({ body: backend.observation.body.bytes, projectDir: context.executor.worktree });
    if (!current.ok || !isGovernedPlanObservation(current, { body: backend.observation.body.bytes, projectDir: context.executor.worktree }) ||
        canonicalRecordJson(current.observation) !== canonicalRecordJson(actual.observation))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  };
  const history = readMemoryNativeHistory(backend);
  let journal;
  if (state.status === 'pending-native-source') {
    journal = state.nativeSourceJournal;
    if (canonicalRecordJson(journal.operation) !== canonicalRecordJson(native.operation) ||
        canonicalRecordJson(journal.session) !== canonicalRecordJson(native.session) ||
        canonicalRecordJson(journal.sourceRead) !== canonicalRecordJson(native.sourceRead) ||
        !sameRevisionObservation(backend.observation, journal.before))
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  } else {
    if (!hasRevisedCriteria(state) || readMemoryPlanJournal(backend, context))
      throw new RevisionPolicyError(outcome('blocked', state.status.startsWith('pending-') ? 'revision-pending' : 'revision-conflict'));
    const last = history.sources.at(-1);
    if (history.order.at(-1)?.kind === 'source' && last?.operation.schema === 'aitm.native-linked-plan-edit/v1' &&
        canonicalRecordJson(last.operation) === canonicalRecordJson(native.operation))
      return { decision: 'block', code: 'revision-approval-stale', reason: 'Original linked-source intent is complete; fresh native Plan approval is required.' };
    const originalNativeSources = canonicalRecordJson(backend.snapshot);
    const reconstructed = await reconstructNativeHistory({ history, chain: state.chain, backend, observation: backend.observation });
    assertMemoryCapability(backend, capability, context);
    if (canonicalRecordJson(backend.snapshot) !== originalNativeSources)
      throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
    assertCurrentLinkedRead();
    if (reconstructed.status !== 'complete') throw new RevisionPolicyError(outcome('blocked', 'revision-pending'));
    journal = deriveNativeSourceJournal({ before: backend.observation, currentContract: reconstructed.currentContract,
      operation: native.operation, revisionEventHead: state.chain.head, predecessor: history.order.at(-1)?.id,
      session: native.session, sourceRead: native.sourceRead });
  }
  const fileAfter = actual.observation.contentSha256 === journal.operation.afterContentSha256;
  if (!fileAfter && actual.observation.contentSha256 !== journal.operation.beforeContentSha256)
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  await publishMemoryDeny(backend, capability, context);
  assertCurrentLinkedRead();
  const writeToken = Object.freeze({}), write = { live: true, backend, context, capability, journal };
  sourceWrites.set(writeToken, write);
  try {
    if (state.status !== 'pending-native-source') persistMemoryNativeSource({ backend, context, capability, token: writeToken, journal });
    await publishMemorySourcePending({ backend, context, capability, token: writeToken });
    assertCurrentLinkedRead();
    if (fileAfter) {
      await runMemoryContext({ backend, context, capability, observation, activity: 'native-source-correction', nativeSourceJournal: journal }, async () => {
        const { mutateIssueBody } = await import('../issue-body-mutate.mjs');
        const result = await mutateIssueBody({ repo: context.repository, issueNumber: context.issue,
          expectedVersion: journal.before.body.version, deps: { ...writeDeps, revisionBackend: backend },
          mutate: () => stripBodyVersion(journal.after.body.bytes) });
        if (result.body !== journal.after.body.bytes) throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
      });
      const after = await observeRevision({ context, deps: backend });
      if (!hasRevisedCriteria(after) || !sameRevisionObservation(backend.observation, journal.after))
        throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
      return { decision: 'block', code: 'revision-approval-stale', reason: 'Original linked-source intent is complete; fresh native Plan approval is required.' };
    }
    return { decision: 'allow', reason: 'Exact original linked-source edit is pending native completion.' };
  } finally { write.live = false; }
}

export function nativeSourceMarkerLoss(before, after) {
  const current = active.getStore();
  if (!current?.nativeSourceJournal) return [];
  const held = observations.get(current.observation), j = validateNativeSourceJournal(current.nativeSourceJournal);
  assertMemoryCapability(held.backend, current.capability, held.context);
  if (stripBodyVersion(before) !== stripBodyVersion(j.before.body.bytes) ||
      stripBodyVersion(after) !== stripBodyVersion(j.after.body.bytes) || !sameRevisionObservation(held.backend.observation, j.before))
    throw new RevisionPolicyError(outcome('blocked', 'revision-conflict'));
  return findLostMarkers(before, after);
}


// Fixed raw current-user read selected by the native assignee reader. It exposes
// data only, never a caller-selected request, port, ownership decision or token.
export function readNativeStageIdentityData() {
  const current = active.getStore();
  if (!current) return null;
  const held = observations.get(current.observation);
  const refuse = () => { throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable')); };
  if (!held || current.activity !== 'stage-write') refuse();
  assertMemoryCapability(held.backend, current.capability, held.context);
  if (!sameRevisionObservation(held.backend.observation, held.raw)) refuse();
  const identity = held.backend.snapshot.lifecycleSources?.remote?.identity;
  if (!identity || identity.response.exitCode !== 0 || identity.response.stderr !== '' ||
      !/^[A-Za-z0-9][A-Za-z0-9-]*(?:\[bot\])?\n?$/.test(identity.response.stdout)) refuse();
  return Object.freeze({ request: Object.freeze({ file: identity.request.file,
    args: Object.freeze([...identity.request.args]) }), response: Object.freeze({ ...identity.response }) });
}

function nativeStageScope(repository, issue, projectDir) {
  const current = active.getStore();
  if (!current) return null;
  const held = observations.get(current.observation);
  const refuse = () => { throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable')); };
  if (!held || current.activity !== 'stage-write' || repository !== held.context.repository ||
      Number(issue) !== held.context.issue || projectDir !== held.context.executor.worktree) refuse();
  try { assertMemoryCapability(held.backend, current.capability, held.context); } catch { refuse(); }
  return { current, held };
}

// Returnless scope comparison only. The private saga still independently checks
// its original token and complete current before/after prefix at every use.
export function assertNativeRevisionStageScope(input) {
  const refuse = () => { throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable')); };
  try {
    if (!input || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) refuse();
    const keys = ['backend', 'capability', 'repository', 'issue', 'projectDir'];
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key =>
      !descriptors[key] || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) refuse();
    const value = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
    if (typeof value.repository !== 'string' || typeof value.projectDir !== 'string' ||
        !['string', 'number'].includes(typeof value.issue)) refuse();
    const scope = nativeStageScope(value.repository, value.issue, value.projectDir);
    if (!scope || scope.held.backend !== value.backend || scope.current.capability !== value.capability) refuse();
  } catch { refuse(); }
}

// Fixed current body DATA for the actual default stage completion probe. No
// caller transport or decision is accepted, and no context is issued here.
export function readNativeRevisionStageBody({ repository, issue, projectDir }) {
  const scope = nativeStageScope(repository, issue, projectDir);
  if (!scope) return null;
  const { held } = scope;
  if (!sameRevisionObservation(held.backend.observation, held.raw))
    throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable'));
  return held.backend.observation.body.bytes;
}

// Fixed project-item source DATA. The actual native configuration selects the
// project; callers cannot supply configuration or a GraphQL/read implementation.
export async function readNativeStageItemRead(input) {
  const current = active.getStore();
  if (!current) return null;
  const held = observations.get(current.observation);
  const refuse = () => { throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable')); };
  if (!input || Object.keys(input).sort().join(',') !== 'issueNumber,projectId,repo' || !held ||
      current.activity !== 'stage-write' || input.repo !== held.context.repository || input.issueNumber !== held.context.issue) refuse();
  const check = () => {
    assertMemoryCapability(held.backend, current.capability, held.context);
    if (!sameRevisionObservation(held.backend.observation, held.raw)) refuse();
  };
  check();
  const { loadConfig, readConfigSourceData } = await import('../../config.mjs');
  check();
  const cfg = loadConfig({ projectPath: path.join(held.context.executor.worktree, '.ai-task-manager/task-tracker.json'),
    legacyProjectPath: path.join(held.context.executor.worktree, '.claude/task-tracker.json') });
  const configuration = readConfigSourceData(cfg);
  if (!configuration || configuration.some(source => source.error !== null) || cfg.repo !== input.repo ||
      !cfg.projectId || cfg.projectId !== input.projectId || !cfg.kanbanFieldId) refuse();
  const source = held.backend.snapshot.lifecycleSources?.remote?.stageItem;
  if (!source) refuse();
  return structuredClone({ source, configuration, config: cfg });
}

// Fixed raw census plus existing immutable record DATA for the one native
// transition-comment reader. No caller transport/observer or effects are exposed.
export function readNativeStageCommentRead(input) {
  const current = active.getStore();
  if (!current) return null;
  const held = observations.get(current.observation);
  const refuse = () => { throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable')); };
  if (!input || Object.keys(input).sort().join(',') !== 'issue,projectDir,repository' || !held ||
      current.activity !== 'stage-write' || input.repository !== held.context.repository ||
      input.issue !== held.context.issue || input.projectDir !== held.context.executor.worktree) refuse();
  assertMemoryCapability(held.backend, current.capability, held.context);
  if (!sameRevisionObservation(held.backend.observation, held.raw)) refuse();
  const read = held.backend.snapshot.lifecycleSources?.remote?.stageComments;
  if (!read) refuse();
  return structuredClone({ read, retained: held.backend.comments });
}

// Fixed raw timing read DATA for the existing native readers. Each call freshly
// checks the actual held observation; absent memory context means ordinary IO.
function heldNativeStageTiming({ repo, issueNumber }) {
  const current = active.getStore();
  if (!current) return null;
  const held = observations.get(current.observation);
  const refuse = () => { throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable')); };
  if (!held || current.activity !== 'stage-write' || repo !== held.context.repository ||
      Number(issueNumber) !== held.context.issue) refuse();
  assertMemoryCapability(held.backend, current.capability, held.context);
  if (!sameRevisionObservation(held.backend.observation, held.raw)) refuse();
  const timing = held.backend.snapshot.lifecycleSources?.remote?.timing;
  if (!timing) refuse();
  return timing;
}
export function readNativeStageTimingComments(input) {
  const timing = heldNativeStageTiming(input);
  return timing ? structuredClone(timing.legacy) : null;
}
export function readNativeStageTimingPages(input) {
  const timing = heldNativeStageTiming(input);
  return timing ? structuredClone(timing.pages) : null;
}

// Read-only native evaluation DATA. This cannot mint stage execution authority,
// expose ports, or replace the private held observation with caller context.
export async function evaluateNativeRevisionStageGuards(ctx, suppliedContext = null, suppliedPolicy = null) {
  const current = active.getStore();
  if (!current) return null;
  try {
  const held = observations.get(current.observation);
  const refuse = (code = 'revision-authority-unavailable') => { throw new RevisionPolicyError(outcome(code === 'revision-conflict' ? 'blocked' : 'indeterminate', code)); };
  if (!held || current.activity !== 'stage-write') refuse();
  assertMemoryCapability(held.backend, current.capability, held.context);
  assertNativeRuntimeRootAdaptersAbsent();
  const before = held.backend.observation;
  const { repository, issue, executor } = held.context;
  if (ctx.resolvedFromState !== 'develop' || ctx.stateArg !== 'test' || ctx.SKIP_NETWORK ||
      ctx.forceFlag || ctx.supersedeFlag || ctx.plan?.runGuardPipeline !== true ||
      ctx.projectDir !== executor.worktree || Number(ctx.issueArg) !== issue ||
      ctx.cfg?.repo !== repository || (suppliedContext && suppliedContext.body !== held.state.observation.body.bytes.trim()) ||
      (ctx.boundarySnapshot?.body?.value !== undefined && ctx.boundarySnapshot.body.value.trim() !== held.state.observation.body.bytes.trim())) refuse();
  for (const key of ['actor', 'evaluatedAt', '_runGuards', '_loadWorkflowBoundary', '_workflowPolicyRuntime', '_loadSession',
    '_currentSessionId', '_observeGuardPhasePolicy', 'sessionPolicy', 'lifecycleEvidence', 'runGuardExecution', '_runGuardExecution']) if (ctx[key] !== undefined) refuse();
  if (ctx.deps && Object.keys(ctx.deps).length) refuse();
  const { deriveGuardPhasePolicy } = await import('../move-state/guard-execution.mjs');
  const phasePolicy = deriveGuardPhasePolicy({ fromState: 'develop', toState: 'test' });
  const { readNativeGuardCatalog } = await import('../state-bootstrap.mjs');
  const nativeCatalog = readNativeGuardCatalog({ fromState: 'develop', toState: 'test' });
  if (!nativeCatalog?.length) refuse();
  if (suppliedPolicy && canonicalRecordJson(suppliedPolicy) !== canonicalRecordJson(phasePolicy)) refuse();
  const { currentSessionId } = await import('../../word-counter.mjs');
  const sid = currentSessionId();
  const task = getActiveTask(sid, executor.worktree);
  if (sid !== executor.sessionId || String(task?.issue).replace(/^#/, '') !== String(issue) ||
      task.paused || !Number.isFinite(Date.parse(task.entryStartTs)) ||
      task.worktreePath !== executor.worktree || task.worktreeBranch !== executor.branch) refuse();
  const { readFileSync, lstatSync } = await import('node:fs');
  const { homedir } = await import('node:os');
  const { loadConfig, readConfigSourceData } = await import('../../config.mjs');
  const projectPath = path.join(executor.worktree, '.ai-task-manager', 'task-tracker.json');
  const legacyProjectPath = path.join(executor.worktree, '.claude', 'task-tracker.json');
  for (const pair of [[projectPath, legacyProjectPath],
    [path.join(homedir(), '.ai-task-manager', 'task-tracker-config.json'), path.join(homedir(), '.claude', 'task-tracker-config.json')]]) {
    for (const file of pair) {
      try { lstatSync(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const value = JSON.parse(readFileSync(file, 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
      break;
    }
  }
  const cfg = loadConfig({ projectPath, legacyProjectPath });
  if (cfg.repo !== repository || !cfg.projectId || Object.entries(ctx.cfg).some(([key, value]) =>
      canonicalRecordJson(value) !== canonicalRecordJson(cfg[key] ?? null))) refuse();
  const data = held.backend.snapshot.lifecycleSources;
  if (!data || data.repository !== repository || data.issue !== issue ||
      data.bodyHash !== hashBytes(held.backend.observation.body.bytes)) refuse();
  const remote = data.remote;
  const [owner, repo] = repository.split('/');
  const subject = { owner, repo, issue };
  const used = new Set();
  const read = (entries, request) => {
    const matches = entries.filter(entry => canonicalRecordJson(entry.request) === canonicalRecordJson(request));
    if (matches.length !== 1) refuse();
    used.add(matches[0]);
    return structuredClone(matches[0].response);
  };
  const { readNativeDependencies } = await import('../native-dependencies.mjs');
  const dependencyRead = async ({ issueNumber, repo: requestedRepo, includeBlocking = true }) =>
    readNativeDependencies({ issueNumber, repo: requestedRepo, includeBlocking, deps: { pexec: async (bin, args) => {
      if (bin !== 'gh' || canonicalRecordJson(args) !== canonicalRecordJson(['issue', 'view', String(issue), '-R', repository, '--json', 'blockedBy'])) refuse();
      return { stdout: JSON.stringify(read(remote.dependencies, { repo: repository, issueNumber: issue, includeBlocking: false })) };
    } } });
  const graph = await dependencyRead({ issueNumber: issue, repo: repository, includeBlocking: false });
  if (graph.blockedBy.length) refuse('revision-topology-unsupported');
  const { fetchParentIssueStrict } = await import('../fetch-parent-issue.mjs');
  const parentRead = input => fetchParentIssueStrict({ ...input, deps: { gql: async (_query, variables) => read(remote.parent, variables) } });
  if (await parentRead({ issueNumber: issue, repo: repository }) !== null) refuse('revision-topology-unsupported');
  const { fetchAllSubIssueNodes, mapSubIssueNodes } = await import('../../../gh/lib/wave-admission.mjs');
  const childrenRead = async ({ parentEpicNumber, repo: requestedRepo, projectId }) => {
    if (parentEpicNumber !== issue || requestedRepo !== repository || projectId !== cfg.projectId) refuse();
    const nodes = await fetchAllSubIssueNodes({ parentEpicNumber, repo: requestedRepo, projectId,
      gqlFn: async (query, variables) => {
        if (!query.includes('subIssues(first: 100')) refuse('revision-topology-unsupported');
        return read(query.includes('stateReason') ? remote.children.pages : remote.children.identities, variables);
      } });
    if (nodes.length) refuse('revision-topology-unsupported');
    return mapSubIssueNodes(nodes, cfg);
  };
  await childrenRead({ parentEpicNumber: issue, repo: repository, projectId: cfg.projectId });
  if (remote.children.membership.length || remote.children.fields.length) refuse('revision-topology-unsupported');
  let assignmentReads = null;
  if (remote.assignments.pages.length || remote.assignments.final.length) {
    const { deriveRecordedStageAssignment } = await import('../assignment-snapshot.mjs');
    assignmentReads = await deriveRecordedStageAssignment({ observation: before, lifecycleSources: data,
      projectId: cfg.projectId });
    assertMemoryCapability(held.backend, current.capability, held.context);
    if (!sameRevisionObservation(held.backend.observation, before)) refuse('revision-conflict');
  }
  let ownershipReads = null;
  if (remote.identity !== undefined) {
    if (!assignmentReads) refuse();
    const { defaultFetchCurrentUser } = await import('../assignee-guard.mjs');
    const { ownershipDecision } = await import('../ownership-policy.mjs');
    const currentUser = await defaultFetchCurrentUser();
    assertMemoryCapability(held.backend, current.capability, held.context);
    if (!sameRevisionObservation(held.backend.observation, before)) refuse('revision-conflict');
    const decision = ownershipDecision({ state: assignmentReads.snapshot.state,
      assignees: assignmentReads.snapshot.assignees, currentUser, mode: 'interactive' });
    if (!decision.ok || decision.kind !== 'owned-by-session') refuse();
    ownershipReads = { identity: remote.identity, currentUser, decision };
  }
  const { fieldIdFor } = await import('../../project-fields.mjs');
  const fieldId = fieldIdFor(cfg, 'disposition');
  const dispositionRaw = read(remote.disposition, subject);
  const items = dispositionRaw?.repository?.issue?.projectItems?.nodes;
  const configured = Array.isArray(items) ? items.filter(item => item?.project?.id === cfg.projectId) : [];
  if (!fieldId || !Array.isArray(items) || items.length >= 20 || configured.length !== 1 ||
      !Array.isArray(configured[0].fieldValues?.nodes) || configured[0].fieldValues.nodes.length >= 100) refuse();
  const fields = configured[0].fieldValues.nodes;
  if (fields.some(field => typeof field?.field?.id !== 'string') ||
      fields.filter(field => field.field.id === fieldId).length > 1) refuse();
  // The read-only increment covers only the genuine empty field. A nonempty
  // value needs its ordinary governed projection, never a fabricated no-op.
  if (fields.some(field => field.field.id === fieldId && [field.name, field.text, field.date, field.number].some(value => value !== undefined && value !== null && value !== ''))) refuse('revision-topology-unsupported');
  const { readTerminalDisposition } = await import('../terminal-disposition.mjs');
  const { projectValuesFromGraphql } = await import('../../../gh/lib/github-projects.mjs');
  const dispositionRead = input => readTerminalDisposition({ ...input, deps: {
    projectValuesForIssue: async ({ cfg: requestedCfg, issueNumber, fieldDefs }) => {
      if (requestedCfg.repo !== repository || requestedCfg.projectId !== cfg.projectId || issueNumber !== issue ||
          canonicalRecordJson(fieldDefs) !== canonicalRecordJson([{ key: 'disposition', type: 'single_select' }])) refuse();
      return projectValuesFromGraphql({ data: dispositionRaw, cfg, fieldDefs });
    },
  } });
  const comments = read(remote.comments.commit, { repo: repository, issueNumber: issue });
  if (!Array.isArray(comments) || comments.some(comment => !comment || typeof comment.body !== 'string')) refuse();
  const commentsRead = async ({ cfg: requestedCfg, issueNumber }) => {
    if (requestedCfg.repo !== repository || issueNumber !== issue) refuse();
    return structuredClone(comments);
  };
  const { loadSession, readSessionPolicySourceData } = await import('../session-store.mjs');
  const { resolveStoryIntentSource } = await import('../story-intent-source.mjs');
  const { evaluateCompleteGuards } = await import('../action-decision/evaluate.mjs');
  const { runGuards, readGuardInvocationData, readNativeGuardReadData } = await import('../guard-registry.mjs');
  const guardInvocations = [];
  const guardReads = [];
  const runNativeGuards = async (fromState, toState, guardContext, phases) => {
    if (fromState !== 'develop' || toState !== 'test' || canonicalRecordJson(phases) !== canonicalRecordJson(phasePolicy) ||
        canonicalRecordJson(readNativeGuardCatalog({ fromState, toState })) !== canonicalRecordJson(nativeCatalog)) refuse();
    const evaluated = await runGuards(fromState, toState, guardContext, phases);
    const trace = readGuardInvocationData(evaluated);
    if (canonicalRecordJson(trace) !== canonicalRecordJson(nativeCatalog) ||
        canonicalRecordJson(readNativeGuardCatalog({ fromState, toState })) !== canonicalRecordJson(nativeCatalog)) refuse();
    guardInvocations.push(trace);
    guardReads.push(await readNativeGuardReadData(evaluated));
    return evaluated;
  };
  const { createGithubWorkflowBoundaryRuntime, loadWorkflowBoundary } = await import('../workflow-policy/enforcement.mjs');
  const sessionPolicy = loadSession(sid);
  const localReads = { configuration: { sources: readConfigSourceData(cfg), value: cfg },
    session: { source: readSessionPolicySourceData(sessionPolicy), value: sessionPolicy } };
  const context = { issueNumber: issue, repo: repository, fromState: 'develop', toState: 'test',
    body: held.state.observation.body.bytes.trim(), cfg, projectDir: executor.worktree,
    invokingDir: executor.worktree, sessionPolicy, deps: {
      revisionBackend: held.backend, resolveStoryIntent: resolveStoryIntentSource,
      dependencyReadiness: { readNativeDependencies: dependencyRead },
      dependencyDisposition: { readDisposition: dispositionRead },
      codeComplete: { listComments: commentsRead }, commitTrailHead: { listComments: commentsRead },
      fetchParentIssue: parentRead, epicChildren: { fetchSiblings: childrenRead },
    } };
  const evaluatedAt = new Date().toISOString();
  const result = await evaluateCompleteGuards({ fromState: 'develop', toState: 'test', context,
    runGuards: runNativeGuards, guardPhasePolicy: phasePolicy, loadPolicy: ({ requirementIds }) => loadWorkflowBoundary({
      repository, issue, body: context.body, requirementIds, activity: 'workflow-transition:test', state: 'develop',
      now: evaluatedAt, runtime: createGithubWorkflowBoundaryRuntime({ repository,
        graphql: async ({ query, variables }) => {
          if (!query.includes('query AitmIssueComments')) refuse();
          return read(remote.comments.workflow, variables);
        } }),
    }) });
  if (!guardInvocations.length || canonicalRecordJson(readNativeGuardCatalog({ fromState: 'develop', toState: 'test' })) !== canonicalRecordJson(nativeCatalog)) refuse();
  for (const group of [remote.dependencies, remote.parent, remote.children.pages, remote.children.identities,
    remote.comments.commit, remote.comments.workflow, remote.disposition])
    if (group.some(entry => !used.has(entry))) refuse();
  assertMemoryCapability(held.backend, current.capability, held.context);
  if (!sameRevisionObservation(held.backend.observation, before)) refuse('revision-conflict');
  // Only detached JSON data crosses this read boundary. Never return the
  // evaluator's guardContext, which owns private scoped reader functions.
  const plain = value => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(plain));
    if (value && Object.getPrototypeOf(value) === Object.prototype)
      return Object.freeze(Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, plain(item)])));
    refuse();
  };
  const { ok, status, refusals, warns, normalizations, humanDecision } = result.guardResult;
  return plain({ guardResult: { ok, status, refusals, warns, normalizations, humanDecision },
    requirementIds: result.requirementIds, evaluatedAt, guardInvocations, guardReads, localReads, assignmentReads, ownershipReads });
  } catch (error) {
    if (error instanceof RevisionPolicyError) throw error;
    throw new RevisionPolicyError(outcome('indeterminate', 'revision-authority-unavailable'));
  }
}
