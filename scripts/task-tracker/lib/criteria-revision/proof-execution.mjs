import { setChecklistLine, setChecklistLines } from '../checklist-body.mjs';
// @story #1855
// Closed, deterministic native proof continuation. Serialized records are
// fixture-native authority only; production must authenticate their source.
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { findEvidenceAc, renderAcEvidenceAndReconcile } from '../ac-evidence.mjs';
import {
  parseFunctionalDodDeclarations,
  KEY_CLASSIFICATION,
  parseFunctionalDodKeys,
  renderEvidenceAndReconcile,
} from '../functional-dod-evidence.mjs';
import {
  validateVerificationReceiptShape,
  upsertVerificationReceipt,
  canonicalRecordedVerificationCommandSet,
} from '../verification-receipt.mjs';
import { splitCmd } from '../evidence-runner.mjs';
import { stripBodyVersion } from '../versioned-issue-write.mjs';
import { stampBodyVersion, parseBodyVersion } from '../body-version.mjs';
import {
  exactKeys,
  revisionError,
  hashBytes,
  validateRevisionObservation,
  validateExecutor,
} from './schema.mjs';
import { validateRevisionEvidenceBinding } from './evidence-binding.mjs';
import {
  readRevisionDefinitions,
  readLegacyProofDefinitions,
  hashSemanticContract,
  deriveResourceVector,
  projectCollectedRevisionObservation,
} from './proposal.mjs';
import {
  deriveCriteriaAuthorityHistory,
  selectEffectiveRevisionProposalEvents,
} from './reducer.mjs';
import { sameRevisionObservation } from './canonical.mjs';
import { expectedResourceVector } from './records.mjs';
import { metadataContinuation, sameStableRevisionExecutor } from './consumer-continuation.mjs';
import { deriveRecordedDevelopFinalPlan } from '../verification-provider-registry.mjs';
import { parseVerificationCommands } from '../verification-commands.mjs';
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);

function resolveProofIntent({ body, definitions }, intent) {
  exactKeys(intent, ['kind', 'target'], 'native-proof-intent');
  if (!['ac', 'dod'].includes(intent.kind) || typeof intent.target !== 'string' || !intent.target)
    revisionError('native-proof-intent');
  const target =
    intent.kind === 'ac'
      ? findEvidenceAc(body, intent.target)
      : parseFunctionalDodKeys(body).find((item) => item.key === intent.target);
  if (!target || !target.evidenceCommands.length) revisionError('native-proof-target');
  const definition = definitions.find(
    (d) => d.section === intent.kind && d.originalBytes === body.split('\n')[target.lineIndex]
  );
  if (!definition || !equal(definition.commands, target.evidenceCommands))
    revisionError('native-proof-definition');
  return { identity: definition.identity, commands: target.evidenceCommands };
}
function definitionIdentities(definitions) {
  return definitions.map((d) => ({
    identity: d.identity,
    section: d.section,
    rootId: d.rootId,
    definitionHash: hashSemanticContract([{ ...d, identity: 'unbound' }]),
  }));
}
function readNativeScopeDefinitions(scope) {
  const o = scope.observation;
  if (o.sourceKind !== 'legacy-body') revisionError('native-proof-source-unsupported');
  const definitions = readRevisionDefinitions({
    ...o,
    identities: definitionIdentities(scope.definitions),
  });
  if (hashSemanticContract(definitions) !== hashSemanticContract(scope.definitions))
    revisionError('native-proof-definitions');
  return definitions;
}
export function resolveNativeProofIntent(scope, intent) {
  return resolveProofIntent(
    { body: scope.observation.body.bytes, definitions: readNativeScopeDefinitions(scope) },
    intent
  );
}

function validateExecutionFields(e, { executor, body, definitions }) {
  exactKeys(
    e,
    [
      'schema',
      'binding',
      'commands',
      'results',
      'fingerprint',
      'provenance',
      'cacheNamespace',
      'receipt',
      'intent',
    ],
    'native-proof-execution'
  );
  validateExecutor(executor);
  validateRevisionEvidenceBinding(e.binding);
  exactKeys(e.provenance, ['worktreePath', 'branch', 'boundIssue'], 'native-proof-provenance-keys');
  exactKeys(
    e.receipt?.executionContext,
    ['worktreePath', 'branch', 'boundIssue'],
    'native-proof-receipt-context'
  );
  const resolved = resolveProofIntent({ body, definitions }, e.intent);
  if (
    e.schema !== 'aitm.native-verifier-execution/v1' ||
    e.binding.semanticContractDigest !== hashSemanticContract(definitions) ||
    e.binding.contractEpoch !== null ||
    e.binding.authorityEpoch !== null ||
    !equal(e.commands, resolved.commands) ||
    !Array.isArray(e.results) ||
    e.results.length !== e.commands.length ||
    !e.results.length
  )
    revisionError('native-proof-execution');
  if (
    !validateVerificationReceiptShape({
      receipt: e.receipt,
      expectedIssue: e.binding.issue,
      expectedStage: 'native-verifier',
    }).ok ||
    !equal(e.receipt.revisionBinding, e.binding) ||
    !equal(e.receipt.environment, e.fingerprint.environment) ||
    !equal(e.receipt.verificationCommands, e.fingerprint.verificationCommands) ||
    e.receipt.commitSha !== e.fingerprint.commitSha ||
    !equal(e.receipt.executionContext, e.provenance) ||
    e.receipt.commands.length !== e.results.length
  )
    revisionError('native-proof-receipt');
  if (
    e.provenance.worktreePath !== executor.worktree ||
    e.provenance.branch !== executor.branch ||
    e.provenance.boundIssue !== e.binding.issue ||
    e.fingerprint.environment.sandbox.identity !== executor.worktree ||
    e.cacheNamespace !==
      hashBytes(canonicalRecordJson({ binding: e.binding, fingerprint: e.fingerprint }))
  )
    revisionError('native-proof-provenance');
  for (let i = 0; i < e.results.length; i++) {
    const r = e.results[i],
      c = e.receipt.commands[i];
    exactKeys(r, ['cmd', 'exit', 'cached', 'ts'], 'native-proof-result');
    if (
      r.cmd !== e.commands[i] ||
      r.exit !== 0 ||
      r.cached !== false ||
      c.exitCode !== 0 ||
      c.completedAt !== r.ts ||
      c.classification !== `native-verifier:${i + 1}` ||
      !equal([c.command, ...c.args], splitCmd(r.cmd))
    )
      revisionError('native-proof-result');
  }
  return resolved;
}
function validateNativeFinalFields(e, scope, definitions) {
  exactKeys(
    e,
    [
      'schema',
      'scope',
      'binding',
      'configuration',
      'plan',
      'fingerprint',
      'provenance',
      'commands',
      'receipt',
    ],
    'native-final-execution'
  );
  exactKeys(
    e.configuration,
    ['verificationProvider', 'developVerification'],
    'native-final-configuration'
  );
  exactKeys(e.provenance, ['worktreePath', 'branch', 'boundIssue'], 'native-final-provenance');
  exactKeys(
    e.receipt?.executionContext,
    ['worktreePath', 'branch', 'boundIssue'],
    'native-final-receipt-context'
  );
  const plan = deriveRecordedDevelopFinalPlan({
    projectDir: scope.executor.worktree,
    configuration: e.configuration,
  });
  const declarations = canonicalRecordedVerificationCommandSet({
    commands: parseVerificationCommands(scope.observation.body.bytes),
    projectDir: scope.executor.worktree,
  });
  if (
    !equal(plan, e.plan) ||
    !equal(e.fingerprint.verificationCommands, declarations) ||
    e.binding.semanticContractDigest !== hashSemanticContract(definitions) ||
    e.binding.contractEpoch !== null ||
    e.binding.authorityEpoch !== null ||
    !Array.isArray(e.commands) ||
    e.commands.length !== plan.steps.length ||
    !e.commands.length ||
    e.provenance.worktreePath !== scope.executor.worktree ||
    e.provenance.branch !== scope.executor.branch ||
    e.provenance.boundIssue !== e.binding.issue ||
    e.fingerprint.environment.sandbox.identity !== scope.executor.worktree ||
    e.fingerprint.environment.sandbox.clean !== true
  )
    revisionError('native-final-execution');
  if (
    !validateVerificationReceiptShape({
      receipt: e.receipt,
      expectedIssue: e.binding.issue,
      expectedStage: 'develop-final',
    }).ok ||
    !equal(
      e.receipt.commands,
      e.commands.map(({ label: _label, allowlistSource: _allowlistSource, ...command }) => command)
    ) ||
    !equal(e.receipt.revisionBinding, e.binding) ||
    !equal(e.receipt.environment, e.fingerprint.environment) ||
    !equal(e.receipt.verificationCommands, declarations) ||
    e.receipt.commitSha !== e.fingerprint.commitSha ||
    !equal(e.receipt.executionContext, e.provenance) ||
    !equal(e.receipt.provider, {
      id: plan.providerId,
      requiredClassifications: plan.requiredClassifications,
    })
  )
    revisionError('native-final-receipt');
  for (let i = 0; i < e.commands.length; i++) {
    const command = e.commands[i],
      step = plan.steps[i];
    const { durationMs, startedAt, completedAt, exitCode, ...executed } = command;
    const expected = {
      classification: step.classification,
      providerId: plan.providerId,
      ...(step.kind ? { kind: step.kind } : {}),
      command: step.command,
      args: step.args,
      ...(step.label ? { label: step.label } : {}),
      ...(step.allowlistSource ? { allowlistSource: step.allowlistSource } : {}),
    };
    if (
      !equal(executed, expected) ||
      exitCode !== 0 ||
      !Number.isFinite(durationMs) ||
      durationMs < 0 ||
      !Number.isFinite(Date.parse(startedAt)) ||
      !Number.isFinite(Date.parse(completedAt)) ||
      Date.parse(startedAt) > Date.parse(completedAt)
    )
      revisionError('native-final-result');
  }
  return { identity: null };
}
function checklistTargets(scope, intent) {
  exactKeys(intent, ['labels', 'desired'], 'native-checkbox-intent');
  if (
    !Array.isArray(intent.labels) ||
    !intent.labels.length ||
    intent.labels.some((label) => typeof label !== 'string' || !label.trim()) ||
    new Set(intent.labels).size !== intent.labels.length ||
    !['checked', 'unchecked'].includes(intent.desired)
  )
    revisionError('native-checkbox-intent');
  const definitions = readNativeScopeDefinitions(scope),
    body = scope.observation.body.bytes;
  const declaredDod = parseFunctionalDodDeclarations(body),
    lines = body.split('\n');
  const targets = [];
  for (const label of intent.labels) {
    const result = setChecklistLine(body, label, intent.desired);
    if (result.status !== 'set') revisionError('native-checkbox-target');
    const matches = definitions.filter(
      (d) => setChecklistLine(d.originalBytes, label, intent.desired).status === 'set'
    );
    if (matches.length !== 1 || !['ac', 'dod'].includes(matches[0].section))
      revisionError('native-checkbox-target');
    const d = matches[0];
    if (d.section === 'dod') {
      const declaration = declaredDod.find((item) => lines[item.lineIndex] === d.originalBytes);
      if (!declaration || KEY_CLASSIFICATION[declaration.key] !== 'stampable')
        revisionError('native-checkbox-target');
    }
    if (result.changed) targets.push(d);
  }
  if (!targets.length || new Set(targets.map((d) => d.identity)).size !== targets.length)
    revisionError('native-checkbox-target');
  return targets;
}
function validateChecklistFields(e) {
  exactKeys(e, ['schema', 'scope', 'binding', 'intent', 'proofBases'], 'native-checkbox-operation');
  const targets = checklistTargets(e.scope, e.intent);
  if (
    e.binding.semanticContractDigest !== hashSemanticContract(e.scope.definitions) ||
    e.binding.contractEpoch !== null ||
    e.binding.authorityEpoch !== null ||
    !Array.isArray(e.proofBases)
  )
    revisionError('native-checkbox-binding');
  if (e.intent.desired === 'unchecked') {
    if (e.proofBases.length) revisionError('native-checkbox-bases');
  } else {
    if (e.proofBases.length !== targets.length) revisionError('native-checkbox-bases');
    e.proofBases.forEach((basis, i) => {
      const d = targets[i];
      if (basis.kind === 'native-individual') {
        exactKeys(basis, ['criterionIdentity', 'kind', 'witness'], 'native-checkbox-basis');
        const original = reconstructIndividualProof(basis.witness);
        if (
          basis.witness.criterionIdentity !== d.identity ||
          !equal(original.proof, d.proof) ||
          hashSemanticContract([original]) !== hashSemanticContract([d])
        )
          revisionError('native-checkbox-proof');
      } else if (basis.kind === 'preserved-individual') {
        exactKeys(basis, ['criterionIdentity', 'kind', 'manifest'], 'native-checkbox-basis');
        const m = basis.manifest;
        exactKeys(
          m,
          [
            'kind',
            'identity',
            'criterionIdentity',
            'bytesHash',
            'disposition',
            'dependencyHash',
            'destinationRevision',
          ],
          'native-checkbox-manifest'
        );
        if (
          !d.proof ||
          m?.kind !== `${d.section}-proof` ||
          m.criterionIdentity !== d.identity ||
          m.identity !== d.proof.identity ||
          m.disposition !== 'preserved-individual' ||
          m.destinationRevision !== e.binding.revisionId ||
          m.bytesHash !== hashBytes(d.proof.bytes) ||
          m.dependencyHash !== hashSemanticContract([d])
        )
          revisionError('native-checkbox-proof');
      } else revisionError('native-checkbox-basis');
      if (basis.criterionIdentity !== d.identity) revisionError('native-checkbox-proof');
    });
  }
  return { identity: null };
}
// Data derivation only. Current publication and historical replay supply their
// independently validated earlier records and effective proposal; caller data
// alone cannot issue a native checkbox token.
export function deriveNativeChecklistOperation({
  scope,
  intent,
  proposal,
  chain,
  completedProofRecords,
}) {
  const targets = checklistTargets(scope, intent);
  const observation = projectCollectedRevisionObservation({
    observation: scope.observation,
    chain,
    currentContract: proposal.after,
  });
  const witnesses = projectNativeIndividualProofs({ observation, chain, completedProofRecords });
  const proofBases =
    intent.desired === 'unchecked'
      ? []
      : targets.map((d) => {
          const witness = witnesses.find((w) => w.criterionIdentity === d.identity);
          if (witness) return { criterionIdentity: d.identity, kind: 'native-individual', witness };
          const manifest = proposal.invalidation.find(
            (m) =>
              m.kind === `${d.section}-proof` &&
              m.criterionIdentity === d.identity &&
              m.disposition === 'preserved-individual' &&
              d.proof &&
              m.identity === d.proof.identity &&
              m.bytesHash === hashBytes(d.proof.bytes) &&
              m.destinationRevision === scope.binding.revisionId &&
              m.dependencyHash === hashSemanticContract([d])
          );
          if (!manifest) revisionError('native-checkbox-proof-authority');
          return { criterionIdentity: d.identity, kind: 'preserved-individual', manifest };
        });
  const operation = structuredClone({
    schema: 'aitm.native-checkbox-operation/v1',
    scope,
    binding: scope.binding,
    intent,
    proofBases,
  });
  validateNativeProofExecution(operation);
  return operation;
}

export function validateNativeProofExecution(e) {
  if (
    !['aitm.native-develop-final-execution/v1', 'aitm.native-checkbox-operation/v1'].includes(
      e.schema
    )
  )
    exactKeys(
      e,
      [
        'schema',
        'scope',
        'binding',
        'commands',
        'results',
        'fingerprint',
        'provenance',
        'cacheNamespace',
        'receipt',
        'intent',
      ],
      'native-proof-execution'
    );
  exactKeys(e.scope, ['binding', 'observation', 'definitions', 'executor'], 'native-proof-scope');
  const o = e.scope.observation;
  validateRevisionObservation(o);
  validateExecutor(e.scope.executor);
  validateRevisionEvidenceBinding(e.binding);
  if (
    !equal(e.scope.binding, e.binding) ||
    !equal(e.scope.executor, o.executor) ||
    e.binding.repository !== o.repository ||
    e.binding.issue !== o.issue
  )
    revisionError('native-proof-execution');
  const definitions = readNativeScopeDefinitions(e.scope);
  if (e.schema === 'aitm.native-checkbox-operation/v1') return validateChecklistFields(e);
  if (e.schema === 'aitm.native-develop-final-execution/v1')
    return validateNativeFinalFields(e, e.scope, definitions);
  const { scope, ...fields } = e;
  return validateExecutionFields(fields, {
    executor: scope.executor,
    body: o.body.bytes,
    definitions,
  });
}
function deriveProofBody(execution, beforeBody, definitions) {
  if (execution.schema === 'aitm.native-checkbox-operation/v1') {
    const transformed = setChecklistLines(
      stripBodyVersion(beforeBody.bytes),
      execution.intent.labels,
      execution.intent.desired
    );
    const body = {
      bytes: stampBodyVersion(transformed.body, beforeBody.version + 1),
      version: beforeBody.version + 1,
    };
    const parsed = readLegacyProofDefinitions({
      body,
      identities: definitionIdentities(definitions),
      protectedSourceBindings: definitions[0].sourceBindings,
    });
    if (hashSemanticContract(parsed) !== hashSemanticContract(definitions))
      revisionError('native-checkbox-definition-delta');
    return { body, definitions: parsed };
  }
  if (execution.schema === 'aitm.native-develop-final-execution/v1') {
    const bytes = stampBodyVersion(
      stripBodyVersion(
        upsertVerificationReceipt(stripBodyVersion(beforeBody.bytes), execution.receipt)
      ),
      beforeBody.version + 1
    );
    return { body: { bytes, version: beforeBody.version + 1 }, definitions };
  }
  const evidence = {
    cmd: execution.commands[0],
    sha: execution.fingerprint.commitSha,
    ts: execution.results[0].ts,
    exit: 0,
    ...execution.provenance,
  };
  const properties = { 'revision-binding': canonicalRecordJson(execution.binding) };
  const base = stripBodyVersion(beforeBody.bytes);
  const transformed =
    execution.intent.kind === 'ac'
      ? renderAcEvidenceAndReconcile(base, execution.intent.target, evidence, properties)
      : renderEvidenceAndReconcile(
          base,
          execution.intent.target,
          evidence,
          execution.commands,
          properties
        );
  const body = {
    bytes: stampBodyVersion(stripBodyVersion(transformed), beforeBody.version + 1),
    version: beforeBody.version + 1,
  };
  if (parseBodyVersion(beforeBody.bytes) !== beforeBody.version || body.bytes === beforeBody.bytes)
    revisionError('native-proof-body-version');
  const parsed = readLegacyProofDefinitions({
    body,
    identities: definitionIdentities(definitions),
    protectedSourceBindings: definitions[0].sourceBindings,
  });
  if (hashSemanticContract(parsed) !== hashSemanticContract(definitions))
    revisionError('native-proof-definition-delta');
  return { body, definitions: parsed };
}

export function deriveNativeProofJournal(execution, revisionEventHead) {
  const resolved = validateNativeProofExecution(execution),
    before = structuredClone(execution.scope.observation);
  const after = structuredClone(before);
  try {
    after.body = deriveProofBody(execution, before.body, execution.scope.definitions).body;
  } catch {
    revisionError('native-proof-definition-delta');
  }
  const record = {
    schema: 'aitm.native-proof-journal/v1',
    execution,
    criterionIdentity: resolved.identity,
    before,
    after,
    revisionEventHead,
  };
  return { ...record, id: hashBytes(canonicalRecordJson(record)) };
}

export function validateNativeProofJournal(j) {
  exactKeys(
    j,
    ['schema', 'execution', 'criterionIdentity', 'before', 'after', 'revisionEventHead', 'id'],
    'native-proof-journal'
  );
  if (!equal(j, deriveNativeProofJournal(j.execution, j.revisionEventHead)))
    revisionError('native-proof-journal-coherence');
  return j;
}

export function nativeProofContinuation({
  observation,
  expected,
  proposal,
  records,
  revisionEventHead,
  chain,
  earlierProofRecords = [],
}) {
  if (!records.length) return null;
  let cursor = expected;
  for (let i = 0; i < records.length; i++) {
    const j = validateNativeProofJournal(records[i]);
    const binding = j.execution.binding,
      contract = cursor.contract?.value;
    if (
      j.revisionEventHead !== revisionEventHead ||
      binding.revisionId !== proposal.after.revisionId ||
      binding.semanticContractDigest !== proposal.after.semanticContractDigest ||
      binding.contractEpoch !== (contract?.contractEpoch ?? null) ||
      binding.authorityEpoch !== (contract?.authorityEpoch ?? null) ||
      !equal(j.execution.scope.definitions, proposal.after.definitions) ||
      !(
        sameRevisionObservation(j.before, cursor) ||
        metadataContinuation({ observation: j.before, expected: cursor, proposal })
      )
    )
      revisionError('native-proof-current-authority');
    if (j.execution.schema === 'aitm.native-checkbox-operation/v1') {
      const derived = deriveNativeChecklistOperation({
        scope: j.execution.scope,
        intent: j.execution.intent,
        proposal,
        chain,
        completedProofRecords: [...earlierProofRecords, ...records.slice(0, i)],
      });
      if (!equal(derived, j.execution)) revisionError('native-checkbox-proof-authority');
    }
    if (i === records.length - 1 && sameRevisionObservation(observation, j.before))
      return { status: 'pending', journal: j };
    cursor = j.after;
  }
  if (!(
    sameRevisionObservation(observation, cursor) ||
    metadataContinuation({ observation, expected: cursor, proposal })
  ))
    revisionError('native-proof-authority-drift');
  return { status: 'complete', observation: cursor };
}

function reconstructIndividualProof(witness) {
  exactKeys(
    witness,
    ['schema', 'revisionEventHead', 'criterionIdentity', 'before', 'execution', 'after'],
    'native-individual-proof'
  );
  if (witness.schema !== 'aitm.native-individual-proof/v1')
    revisionError('native-individual-proof');
  exactKeys(
    witness.before,
    ['body', 'identities', 'protectedSourceBindings', 'executor'],
    'native-individual-before'
  );
  exactKeys(witness.after, ['bodyHash', 'proof'], 'native-individual-after');
  const { executor, ...projection } = witness.before;
  const definitions = readLegacyProofDefinitions(projection);
  const resolved = validateExecutionFields(witness.execution, {
    executor,
    body: projection.body.bytes,
    definitions,
  });
  if (resolved.identity !== witness.criterionIdentity) revisionError('native-individual-identity');
  const after = deriveProofBody(witness.execution, projection.body, definitions);
  const definition = after.definitions.find((d) => d.identity === resolved.identity);
  if (
    !definition?.proof ||
    witness.after.bodyHash !== hashBytes(after.body.bytes) ||
    !equal(witness.after.proof, definition.proof)
  )
    revisionError('native-individual-effect');
  return definition;
}
// Pending criteria can change the revision marker while an unchanged individual
// proof remains byte-exact. Only a complete recognized transaction prefix may
// compare that witness to its independently replayed pre-root origin.
function witnessBindingOrigin(witness, observation, chain) {
  if (chain.status !== 'pending') return observation;
  const p = chain.effective?.proposal;
  const rootIndex = chain.events.findIndex((event) => event.eventId === chain.root?.eventId);
  const originIndex = chain.events.findIndex(
    (event) => event.eventId === witness.revisionEventHead
  );
  if (
    p?.authority.kind !== 'legacy-body' ||
    rootIndex < 0 ||
    originIndex < 0 ||
    originIndex >= rootIndex
  )
    return null;
  const vector = deriveResourceVector(observation);
  if (
    !equal(vector, { ...p.archive.resourceVector, revisionEventHead: chain.head }) &&
    !equal(vector, expectedResourceVector(p, chain.head))
  )
    return null;
  const origin = chain.root.proposal.archive.observation;
  if (!equal(origin.protectedSourceBindings, observation.protectedSourceBindings)) return null;
  return origin;
}
function witnessMatches(witness, definition, observation, chain, terminals) {
  const binding = witness.execution.binding;
  const terminal = terminals.find((t) => t.head === witness.revisionEventHead);
  const origin = chain.events.find((e) => e.eventId === terminal?.authorityEventId);
  if (
    !origin ||
    binding.revisionId !== origin.outcome.revisionId ||
    binding.repository !== observation.repository ||
    binding.issue !== observation.issue ||
    !sameStableRevisionExecutor(witness.before.executor, observation.executor)
  )
    return false;
  const bindingOrigin = witnessBindingOrigin(witness, observation, chain);
  if (!bindingOrigin) return false;
  const current = readRevisionDefinitions(observation).find(
    (d) => d.identity === witness.criterionIdentity
  );
  if (
    !current?.proof ||
    !equal(current.proof, witness.after.proof) ||
    hashSemanticContract([current]) !== hashSemanticContract([definition]) ||
    binding.revisionId !== bindingOrigin.revisionId ||
    binding.semanticContractDigest !== hashSemanticContract(readRevisionDefinitions(bindingOrigin))
  )
    return false;
  return !selectEffectiveRevisionProposalEvents(chain.events).some((e) =>
    e.proposal.invalidation.some(
      (item) => item.disposition === 'retired' && item.bytesHash === hashBytes(current.proof.bytes)
    )
  );
}
// Closed pure archived-data validation. Current publication additionally requires
// an exact independently re-derived witness array from complete native replay.
export function validateNativeIndividualProofs(input) {
  exactKeys(input, ['witnesses', 'observation', 'chain'], 'native-individual-input');
  const { witnesses, observation, chain } = input;
  if (!Array.isArray(witnesses)) revisionError('native-individual-array');
  const history = deriveCriteriaAuthorityHistory(chain.events);
  if (!equal(history.chain, chain)) revisionError('native-individual-chain');
  if (witnesses.length && observation.sourceKind !== 'legacy-body')
    revisionError('native-individual-source');
  const ids = [];
  for (const witness of witnesses) {
    const definition = reconstructIndividualProof(witness);
    if (!witnessMatches(witness, definition, observation, chain, history.terminals))
      revisionError('native-individual-dependency');
    ids.push(witness.criterionIdentity);
  }
  if (new Set(ids).size !== ids.length || !equal(ids, [...ids].sort()))
    revisionError('native-individual-order');
  return witnesses;
}
export function projectNativeIndividualProofs(input) {
  exactKeys(
    input,
    ['observation', 'chain', 'completedProofRecords'],
    'native-individual-projection'
  );
  const { observation, chain, completedProofRecords } = input;
  const history = deriveCriteriaAuthorityHistory(chain.events);
  if (!equal(history.chain, chain) || !Array.isArray(completedProofRecords))
    revisionError('native-individual-chain');
  if (observation.sourceKind !== 'legacy-body' || observation.revision === 0) return [];
  const candidates = new Map();
  for (const journal of completedProofRecords) {
    const j = validateNativeProofJournal(journal);
    if (
      ['aitm.native-develop-final-execution/v1', 'aitm.native-checkbox-operation/v1'].includes(
        j.execution.schema
      )
    )
      continue;
    const { scope, ...execution } = j.execution;
    const before = {
      body: j.before.body,
      identities: definitionIdentities(scope.definitions),
      protectedSourceBindings: j.before.protectedSourceBindings,
      executor: j.before.executor,
    };
    const after = deriveProofBody(execution, before.body, scope.definitions);
    const definition = after.definitions.find((d) => d.identity === j.criterionIdentity);
    const witness = {
      schema: 'aitm.native-individual-proof/v1',
      revisionEventHead: j.revisionEventHead,
      criterionIdentity: j.criterionIdentity,
      before,
      execution,
      after: { bodyHash: hashBytes(after.body.bytes), proof: definition.proof },
    };
    if (witnessMatches(witness, definition, observation, chain, history.terminals)) {
      if (candidates.has(j.criterionIdentity)) revisionError('native-individual-duplicate');
      candidates.set(j.criterionIdentity, witness);
    }
  }
  const witnesses = [...candidates.values()].sort((a, b) =>
    a.criterionIdentity.localeCompare(b.criterionIdentity)
  );
  validateNativeIndividualProofs({ witnesses, observation, chain });
  return witnesses;
}
