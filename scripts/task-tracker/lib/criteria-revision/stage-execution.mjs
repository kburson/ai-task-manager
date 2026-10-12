// @story #1855
// Original native stage leaf reconstruction DATA only. No storage, token,
// current-read branding, transport, or completion authority is exposed here.
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { exactKeys, hashBytes, revisionError } from './schema.mjs';
import { deriveRecordedStageBody } from './native-stage-data.mjs';
import { matchesBodyReadback, parseBodyVersion } from '../body-version.mjs';
import { ghFetchArgs } from '../versioned-issue-write.mjs';

const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);

// The full history reader must derive all cursor/ordinal/predecessor inputs from
// its own earlier validated chronology. Supplying coherent data to this pure
// helper does not certify that chronology or any current execution.
export function reconstructNativeStageBodyStep(input) {
  try {
    canonicalRecordJson(input);
    exactKeys(input, [
      'repository',
      'issue',
      'transitionId',
      'body',
      'ordinal',
      'previous',
      'step',
    ]);
    const { repository, issue, transitionId, body, ordinal, previous, step } = input;
    if (
      typeof repository !== 'string' ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      !Number.isSafeInteger(issue) ||
      issue < 1 ||
      !Number.isSafeInteger(ordinal) ||
      ordinal < 1 ||
      typeof previous !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(previous)
    )
      throw new TypeError();
    exactKeys(step, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
    if (
      step.ordinal !== ordinal ||
      step.previous !== previous ||
      !['entry-body', 'rollback-state', 'sentinel-body'].includes(step.kind) ||
      !step.intent ||
      Object.hasOwn(step.intent, 'kind')
    )
      throw new TypeError();
    const afterBody = deriveRecordedStageBody({
      body,
      transitionId,
      intent: { kind: step.kind, ...step.intent },
    });
    let readbackBody = null;
    if (step.readback !== null) {
      exactKeys(step.readback, ['request', 'response', 'resource']);
      exactKeys(step.readback.request, ['file', 'args']);
      exactKeys(step.readback.response, ['stdout', 'stderr', 'exitCode']);
      if (
        !same(step.readback.request, { file: 'gh', args: ghFetchArgs(repository, issue) }) ||
        step.readback.response.exitCode !== 0 ||
        step.readback.response.stderr !== '' ||
        typeof step.readback.response.stdout !== 'string' ||
        !matchesBodyReadback(afterBody, step.readback.response.stdout)
      )
        throw new TypeError();
      // Keep original CLI framing bytes above. Only a separate exact JSON body
      // resource can establish the authoritative body bytes for the full vector.
      const resource = step.readback.resource;
      exactKeys(resource, ['request', 'response']);
      exactKeys(resource.request, ['file', 'args']);
      exactKeys(resource.response, ['stdout', 'stderr', 'exitCode']);
      if (
        !same(resource.request, {
          file: 'gh',
          args: ghFetchArgs(repository, issue).slice(0, -2),
        }) ||
        resource.response.exitCode !== 0 ||
        resource.response.stderr !== '' ||
        typeof resource.response.stdout !== 'string'
      )
        throw new TypeError();
      const parsed = JSON.parse(resource.response.stdout);
      exactKeys(parsed, ['body']);
      if (parsed.body !== afterBody) throw new TypeError();
      readbackBody = parsed.body;
    }
    return Object.freeze({
      afterBody,
      readbackBody,
      stepHash: hashBytes(canonicalRecordJson(step)),
    });
  } catch {
    revisionError('native-stage-body-step');
  }
}

import {
  deriveTransitionCommitRecord,
  renderTransitionCommitComment,
} from '../move-state/transition-commit.mjs';

// Markers and actor here must come from the full replay's independently derived
// cursor/header. This pure leaf validates bytes, never grants that provenance.
export function reconstructNativeStageTransitionStep(input) {
  try {
    canonicalRecordJson(input);
    exactKeys(input, [
      'repository',
      'issue',
      'transitionId',
      'actor',
      'visitMarker',
      'sentinelMarker',
      'ordinal',
      'previous',
      'step',
    ]);
    const {
      repository,
      issue,
      transitionId,
      actor,
      visitMarker,
      sentinelMarker,
      ordinal,
      previous,
      step,
    } = input;
    if (
      typeof repository !== 'string' ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      !Number.isSafeInteger(issue) ||
      issue < 1 ||
      !Number.isSafeInteger(ordinal) ||
      ordinal < 1 ||
      typeof previous !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(previous) ||
      typeof sentinelMarker !== 'string' ||
      !sentinelMarker
    )
      throw new TypeError();
    exactKeys(step, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
    exactKeys(step.intent, ['record']);
    exactKeys(step.intent.record, [
      'schema',
      'transitionId',
      'repository',
      'issue',
      'source',
      'target',
      'visitMarker',
      'actor',
      'sentinelFingerprint',
    ]);
    if (
      step.ordinal !== ordinal ||
      step.previous !== previous ||
      step.kind !== 'transition-comment'
    )
      throw new TypeError();
    const record = deriveTransitionCommitRecord({
      transitionId,
      repository,
      issue,
      source: 'develop',
      target: 'test',
      visitMarker,
      actor,
      sentinelMarker,
    });
    if (!same(step.intent.record, record)) throw new TypeError();
    const body = renderTransitionCommitComment(record);
    let commentId = null;
    if (step.readback !== null) {
      exactKeys(step.readback, ['create', 'read']);
      const parse = (pair) => {
        exactKeys(pair, ['request', 'response']);
        exactKeys(pair.request, ['file', 'args']);
        exactKeys(pair.response, ['stdout', 'stderr', 'exitCode']);
        if (
          pair.response.exitCode !== 0 ||
          pair.response.stderr !== '' ||
          typeof pair.response.stdout !== 'string'
        )
          throw new TypeError();
        const value = JSON.parse(pair.response.stdout);
        if (
          !value ||
          Array.isArray(value) ||
          !Number.isSafeInteger(value.id) ||
          value.id < 1 ||
          value.body !== body ||
          value.issue_url !== `https://api.github.com/repos/${repository}/issues/${issue}`
        )
          throw new TypeError();
        return value;
      };
      const created = parse(step.readback.create);
      if (
        !same(step.readback.create.request, {
          file: 'gh',
          args: [
            'api',
            `repos/${repository}/issues/${issue}/comments`,
            '--method',
            'POST',
            '-f',
            `body=${body}`,
          ],
        })
      )
        throw new TypeError();
      const found = parse(step.readback.read);
      if (
        found.id !== created.id ||
        !same(step.readback.read.request, {
          file: 'gh',
          args: ['api', `repos/${repository}/issues/comments/${created.id}`],
        })
      )
        throw new TypeError();
      commentId = String(created.id);
    }
    return Object.freeze({ body, commentId, stepHash: hashBytes(canonicalRecordJson(step)) });
  } catch {
    revisionError('native-stage-transition-step');
  }
}

import {
  validateActorFlushJournal,
  deriveActorFlushJournalRecord,
} from '../actor-flush-journal.mjs';

// Native actor digests intentionally hash insertion-ordered JSON.stringify.
// Preserve original candidate/journal strings inside canonical stage storage;
// never canonicalize the payload and then reinterpret it as original bytes.
// The caller's coherent data is not proof of original runtime membership.
export function reconstructNativeStageActorPrepareStep(input) {
  try {
    canonicalRecordJson(input);
    exactKeys(input, ['identity', 'candidateBytes', 'ordinal', 'previous', 'step']);
    const { identity, candidateBytes, ordinal, previous, step } = input;
    exactKeys(identity, ['provider', 'sid']);
    if (
      typeof candidateBytes !== 'string' ||
      ordinal !== 1 ||
      typeof previous !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(previous)
    )
      throw new TypeError();
    const candidate = JSON.parse(candidateBytes);
    if (JSON.stringify(candidate) !== candidateBytes) throw new TypeError();
    const record = deriveActorFlushJournalRecord({ identity, candidate });
    const journalBytes = JSON.stringify(record, null, 2) + '\n';
    exactKeys(step, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
    exactKeys(step.intent, ['journalBytes']);
    if (
      step.ordinal !== ordinal ||
      step.previous !== previous ||
      step.kind !== 'actor-journal-prepare' ||
      step.intent.journalBytes !== journalBytes
    )
      throw new TypeError();
    let readbackBytes = null;
    if (step.readback !== null) {
      exactKeys(step.readback, ['bytes']);
      if (step.readback.bytes !== journalBytes) throw new TypeError();
      readbackBytes = step.readback.bytes;
    }
    return Object.freeze({
      journalBytes,
      readbackBytes,
      stepHash: hashBytes(canonicalRecordJson(step)),
    });
  } catch {
    revisionError('native-stage-actor-prepare-step');
  }
}

import { validateNativeProofJournal } from './proof-execution.mjs';
import { validateRevisionObservation, validateDefinitions } from './schema.mjs';
import { hashSemanticContract } from './proposal.mjs';
import { parseVerificationCommands } from '../verification-commands.mjs';
import {
  parseVerificationReceipt,
  hasMalformedVerificationReceiptClaim,
  qualifyRecordedDevelopReceipt,
  canonicalRecordedVerificationCommandSet,
} from '../verification-receipt.mjs';

// Earlier records must come from the sole independently replayed chronology.
// This predicate joins original execution bytes to the exact current historical
// cursor; a supplied coherent array cannot authenticate that chronology.
export function reconstructNativeStageReceiptEvidence(input) {
  try {
    canonicalRecordJson(input);
    exactKeys(input, ['observation', 'definitions', 'headSha', 'proofs']);
    const { observation: o, definitions, headSha, proofs } = input;
    validateRevisionObservation(o);
    validateDefinitions(definitions);
    if (
      o.sourceKind !== 'legacy-body' ||
      o.stage !== 'develop' ||
      !Array.isArray(proofs) ||
      new Set(proofs.map((j) => j.id)).size !== proofs.length ||
      hasMalformedVerificationReceiptClaim(o.body.bytes)
    )
      throw new TypeError();
    const receipt = parseVerificationReceipt(o.body.bytes, 'develop-final');
    if (!qualifyRecordedDevelopReceipt({ receipt, issueNumber: o.issue, headSha }))
      throw new TypeError();
    const matches = proofs.filter(
      (j) =>
        j.execution?.schema === 'aitm.native-develop-final-execution/v1' &&
        same(j.execution.receipt, receipt)
    );
    if (matches.length !== 1) throw new TypeError();
    const journal = validateNativeProofJournal(matches[0]),
      execution = journal.execution;
    const commands = canonicalRecordedVerificationCommandSet({
      commands: parseVerificationCommands(o.body.bytes),
      projectDir: execution.scope.executor.worktree,
    });
    if (
      journal.criterionIdentity !== null ||
      execution.binding.repository !== o.repository ||
      execution.binding.issue !== o.issue ||
      execution.binding.revisionId !== o.revisionId ||
      execution.binding.semanticContractDigest !== hashSemanticContract(definitions) ||
      execution.binding.contractEpoch !== null ||
      execution.binding.authorityEpoch !== null ||
      !same(receipt.verificationCommands, commands) ||
      execution.fingerprint.commitSha !== headSha ||
      !same(parseVerificationReceipt(journal.after.body.bytes, 'develop-final'), receipt)
    )
      throw new TypeError();
    return Object.freeze({ journalId: journal.id, receiptId: receipt.receiptId, headSha });
  } catch {
    revisionError('native-stage-receipt-evidence');
  }
}

// Reconstruct original guard semantics from captured DATA after the sole native
// history fold has established the predecessor and earlier proof membership.
// Fixed imports/readers only: no supplied evaluator, observer or current ALS.
export async function reconstructNativeStageGuardEvidence(input) {
  try {
    canonicalRecordJson(input);
    exactKeys(input, [
      'observation',
      'definitions',
      'proofs',
      'lifecycleSources',
      'sources',
      'invocations',
      'gitReads',
    ]);
    const {
      observation: o,
      definitions,
      proofs,
      lifecycleSources,
      sources,
      invocations,
      gitReads,
    } = input;
    validateRevisionObservation(o);
    validateDefinitions(definitions);
    if (o.sourceKind !== 'legacy-body' || o.stage !== 'develop') throw new TypeError();
    const { assertNativeLifecycleSourceData } = await import('./store.mjs');
    assertNativeLifecycleSourceData({ source: lifecycleSources, observation: o });
    const { deriveRecordedStageSources } = await import('./native-stage-data.mjs');
    const { config: cfg } = deriveRecordedStageSources(sources);
    if (
      sources.repository !== o.repository ||
      sources.projectDir !== o.executor.worktree ||
      sources.sessionId !== o.executor.sessionId ||
      !cfg.projectId
    )
      throw new TypeError();
    const { deriveRecordedStageAssignment } = await import('../assignment-snapshot.mjs');
    const assignments = await deriveRecordedStageAssignment({
      observation: o,
      lifecycleSources,
      projectId: cfg.projectId,
    });
    const identity = lifecycleSources.remote.identity;
    if (!identity || identity.response.exitCode !== 0 || identity.response.stderr !== '')
      throw new TypeError();
    const { ownershipDecision } = await import('../ownership-policy.mjs');
    const ownership = ownershipDecision({
      state: assignments.snapshot.state,
      assignees: assignments.snapshot.assignees,
      currentUser: identity.response.stdout,
      mode: 'interactive',
    });
    if (!ownership.ok || ownership.kind !== 'owned-by-session') throw new TypeError();
    // This fixed import happens only at the actual native history boundary.
    // Bare registry imports remain empty; historical bytes cannot register it.
    const { readNativeGuardCatalog } = await import('../state-bootstrap.mjs');
    const catalog = readNativeGuardCatalog({ fromState: 'develop', toState: 'test' });
    if (
      !catalog?.length ||
      !same(invocations, [catalog]) ||
      !Array.isArray(gitReads) ||
      gitReads.length !== 1
    )
      throw new TypeError();
    const expectedIds = [
      'blocked-by-not-done',
      'develop-exit-code-complete',
      'develop-exit-receipt',
      'develop-exit-commit-trail-head',
      'develop-exit-epic-children-done',
      'child-cannot-lead-epic-exit',
      'criteria-revision-admission',
      'contiguity-entry',
      'body-gates-entry-test',
    ];
    if (
      !same(
        catalog.map((entry) => entry.guardId),
        expectedIds
      )
    )
      throw new TypeError();
    const expectedReads = catalog.filter((entry) =>
      [
        'develop-exit-code-complete',
        'develop-exit-receipt',
        'develop-exit-commit-trail-head',
      ].includes(entry.guardId)
    );
    if (gitReads[0].length !== expectedReads.length) throw new TypeError();
    for (let i = 0; i < expectedReads.length; i++) {
      exactKeys(gitReads[0][i], ['invocation', 'data']);
      if (!same(gitReads[0][i].invocation, expectedReads[i])) throw new TypeError();
    }
    const body = o.body.bytes.trim(),
      projectDir = o.executor.worktree;
    const bodyHash = hashBytes(body).slice(7);
    const [code, receiptRead, headRead] = gitReads[0].map((entry) => entry.data);
    exactKeys(code, ['repository', 'issue', 'bodyHash', 'reads', 'ancestry']);
    if (code.repository !== o.repository || code.issue !== o.issue || code.bodyHash !== bodyHash)
      throw new TypeError();
    exactKeys(receiptRead, ['projectDir', 'head']);
    const validHead = (read) => {
      exactKeys(read, ['cwd', 'stdout', 'stderr', 'exitCode']);
      if (
        read.cwd !== projectDir ||
        read.exitCode !== 0 ||
        read.stderr !== '' ||
        typeof read.stdout !== 'string' ||
        !/^[a-f0-9]{40}$/.test(read.stdout.trim())
      )
        throw new TypeError();
      return read.stdout.trim();
    };
    if (receiptRead.projectDir !== projectDir) throw new TypeError();
    const headSha = validHead(receiptRead.head);
    const receipt = reconstructNativeStageReceiptEvidence({
      observation: o,
      definitions,
      proofs,
      headSha,
    });
    exactKeys(headRead, ['repository', 'issue', 'projectDir', 'reads', 'attribution']);
    if (
      headRead.repository !== o.repository ||
      headRead.issue !== o.issue ||
      headRead.projectDir !== projectDir ||
      headRead.attribution !== null ||
      headRead.reads.length !== 1
    )
      throw new TypeError();
    const { kind, ...head } = headRead.reads[0];
    if (kind !== 'head' || validHead(head) !== headSha) throw new TypeError();
    const remote = lifecycleSources.remote,
      used = new Set();
    const read = (entries, request) => {
      const found = entries.filter((entry) => same(entry.request, request));
      if (found.length !== 1) throw new TypeError();
      used.add(found[0]);
      return structuredClone(found[0].response);
    };
    const [owner, repo] = o.repository.split('/');
    const {
      deriveCodeCompleteAcBlockers,
      deriveCodeCompleteTouchBlockers,
      deriveRecordedCodeCompleteGit,
      findCommitTrailComment,
      parseCommitShas,
      commitTrailIncludesSha,
      parseAcceptanceCriteria,
    } = await import('../code-complete-gate.mjs');
    const comments = read(remote.comments.commit, { repo: o.repository, issueNumber: o.issue });
    const trail = findCommitTrailComment(comments);
    if (!trail) throw new TypeError();
    const shas = parseCommitShas(trail.body);
    if (!shas.length || !commitTrailIncludesSha({ sha: headSha, trailShas: shas }))
      throw new TypeError();
    const files = deriveRecordedCodeCompleteGit({ projectDir, shas, reads: code.reads });
    const acs = parseAcceptanceCriteria(body);
    if (
      !acs ||
      deriveCodeCompleteAcBlockers({
        body,
        acceptanceCriteria: acs.map((ac) => ({ declaration: ac.label, checked: ac.checked })),
      }).length ||
      deriveCodeCompleteTouchBlockers(files).length
    )
      throw new TypeError();
    const { collectEvidenceWithProvenance, qualifyEvidenceBranchItem } =
      await import('../evidence-branch-reachability.mjs');
    const ancestry = code.ancestry;
    exactKeys(ancestry, ['issue', 'projectDir', 'bodyHash', 'identity', 'identityError', 'reads']);
    exactKeys(ancestry.identity, ['worktreePath', 'worktreeBranch']);
    if (
      ancestry.issue !== o.issue ||
      ancestry.projectDir !== projectDir ||
      ancestry.bodyHash !== bodyHash ||
      ancestry.identityError !== null ||
      ancestry.identity.worktreePath !== projectDir ||
      ancestry.identity.worktreeBranch !== o.executor.branch
    )
      throw new TypeError();
    const seenShas = new Map();
    let nextRead = 0;
    for (const { complete, ...item } of collectEvidenceWithProvenance(body)) {
      if (!complete) throw new TypeError();
      if (!seenShas.has(item.sha)) {
        const original = ancestry.reads[nextRead++];
        exactKeys(original, ['ancestor', 'descendant', 'cwd', 'stdout', 'stderr', 'exitCode']);
        if (
          original.ancestor !== item.sha ||
          original.descendant !== o.executor.branch ||
          original.cwd !== projectDir ||
          original.exitCode !== 0 ||
          original.stderr !== '' ||
          original.stdout !== ''
        )
          throw new TypeError();
        seenShas.set(item.sha, original.exitCode);
      }
      if (
        qualifyEvidenceBranchItem({
          item,
          issueNumber: o.issue,
          boundBranch: o.executor.branch,
          ancestryExitCode: seenShas.get(item.sha),
        }).length
      )
        throw new TypeError();
    }
    if (nextRead !== ancestry.reads.length) throw new TypeError();
    const { readNativeDependencies } = await import('../native-dependencies.mjs');
    const dependencies = (input) =>
      readNativeDependencies({
        ...input,
        deps: {
          pexec: async (file, args) => {
            if (
              file !== 'gh' ||
              !same(args, [
                'issue',
                'view',
                String(o.issue),
                '-R',
                o.repository,
                '--json',
                'blockedBy',
              ])
            )
              throw new TypeError();
            return {
              stdout: JSON.stringify(
                read(remote.dependencies, {
                  repo: o.repository,
                  issueNumber: o.issue,
                  includeBlocking: false,
                })
              ),
            };
          },
        },
      });
    const dependency = await dependencies({
      repo: o.repository,
      issueNumber: o.issue,
      includeBlocking: false,
    });
    if (dependency.blockedBy.length) throw new TypeError();
    const { observeDependencyReadiness, reconcileDependencyDisposition } =
      await import('../dependency-disposition.mjs');
    const { readTerminalDisposition } = await import('../terminal-disposition.mjs');
    const { projectValuesFromGraphql } = await import('../../../gh/lib/github-projects.mjs');
    const { fieldIdFor } = await import('../../project-fields.mjs');
    const disposition = read(remote.disposition, { owner, repo, issue: o.issue });
    const items = disposition?.repository?.issue?.projectItems?.nodes;
    const configured = Array.isArray(items)
      ? items.filter((item) => item?.project?.id === cfg.projectId)
      : [];
    if (
      !Array.isArray(items) ||
      items.length >= 20 ||
      configured.length !== 1 ||
      !Array.isArray(configured[0].fieldValues?.nodes) ||
      configured[0].fieldValues.nodes.length >= 100
    )
      throw new TypeError();
    const fields = configured[0].fieldValues.nodes,
      fieldId = fieldIdFor(cfg, 'disposition');
    if (
      !fieldId ||
      fields.some((field) => typeof field?.field?.id !== 'string') ||
      fields.filter((field) => field.field.id === fieldId).length > 1 ||
      fields.some(
        (field) =>
          field.field.id === fieldId &&
          [field.name, field.text, field.date, field.number].some(
            (value) => value !== undefined && value !== null && value !== ''
          )
      )
    )
      throw new TypeError();
    const readDisposition = (input) =>
      readTerminalDisposition({
        ...input,
        deps: {
          projectValuesForIssue: async ({ cfg: selected, issueNumber, fieldDefs }) => {
            if (
              selected.repo !== o.repository ||
              selected.projectId !== cfg.projectId ||
              issueNumber !== o.issue ||
              !same(fieldDefs, [{ key: 'disposition', type: 'single_select' }])
            )
              throw new TypeError();
            return projectValuesFromGraphql({ data: disposition, cfg, fieldDefs });
          },
        },
      });
    const dependencyObservation = await observeDependencyReadiness({
      cfg,
      issueNumber: o.issue,
      deps: { readNativeDependencies: dependencies },
    });
    const noEffect = () => {
      throw new TypeError('historical-effect-unavailable');
    };
    const reconciled = await reconcileDependencyDisposition({
      cfg,
      issueNumber: o.issue,
      observation: dependencyObservation,
      deps: {
        readDisposition,
        projectItemForIssue: noEffect,
        fieldOptionMap: noEffect,
        writeProjectFieldValue: noEffect,
        clearProjectFieldValue: noEffect,
      },
    });
    if (dependencyObservation.status !== 'ready' || reconciled.status !== 'idempotent')
      throw new TypeError();
    const { fetchParentIssueStrict } = await import('../fetch-parent-issue.mjs');
    const parent = await fetchParentIssueStrict({
      repo: o.repository,
      issueNumber: o.issue,
      deps: { gql: async (_query, variables) => read(remote.parent, variables) },
    });
    if (parent !== null) throw new TypeError();
    const { fetchAllSubIssueNodes } = await import('../../../gh/lib/wave-admission.mjs');
    const children = await fetchAllSubIssueNodes({
      repo: o.repository,
      parentEpicNumber: o.issue,
      projectId: cfg.projectId,
      gqlFn: async (query, variables) => {
        if (!query.includes('subIssues(first: 100')) throw new TypeError();
        return read(
          query.includes('stateReason') ? remote.children.pages : remote.children.identities,
          variables
        );
      },
    });
    if (
      children.length ||
      remote.children.membership.length ||
      remote.children.fields.length ||
      remote.comments.workflow.length
    )
      throw new TypeError();
    const { evaluateContiguity } = await import('../stage-entry-markers.mjs');
    if (
      evaluateContiguity({ fromState: 'develop', toState: 'test', body, force: false }).action ===
      'refuse'
    )
      throw new TypeError();
    const { bodyGatesEntryGuardTest } = await import('../body-gates-entry-guard.mjs');
    if (!bodyGatesEntryGuardTest.run({ toState: 'test', body, cfg }).ok) throw new TypeError();
    for (const entries of [
      remote.dependencies,
      remote.parent,
      remote.children.pages,
      remote.children.identities,
      remote.comments.commit,
      remote.disposition,
    ])
      if (entries.some((entry) => !used.has(entry))) throw new TypeError();
    // Criteria admission itself is supplied only by the caller's already
    // reconstructed predecessor/Plan/source fold, never historical fake ALS.
    const frozenInvocations = Object.freeze(
      invocations.map((group) => Object.freeze(group.map((entry) => Object.freeze({ ...entry }))))
    );
    return Object.freeze({
      headSha,
      receipt,
      invocations: frozenInvocations,
      assignment: assignments,
      owner: ownership.currentUser,
    });
  } catch {
    revisionError('native-stage-guard-evidence');
  }
}

// Closed original Status source DATA only. Configuration/cursor provenance and
// consumed terminal membership belong to the independent chronological caller.
export async function deriveRecordedStageStatusSource(input) {
  try {
    canonicalRecordJson(input);
    exactKeys(input, ['observation', 'lifecycleSources', 'projectId']);
    const { observation, lifecycleSources, projectId } = structuredClone(input);
    if (typeof projectId !== 'string' || !projectId) throw new TypeError();
    const { assertNativeLifecycleSourceData } = await import('./store.mjs');
    assertNativeLifecycleSourceData({ source: lifecycleSources, observation });
    if (!Object.hasOwn(lifecycleSources.remote, 'stageStatus')) return null;
    const { STATUS_OPTION_QUERY, deriveRecordedStageStatusResponse } =
      await import('../move-state/github-mutation.mjs');
    const [owner, repo] = observation.repository.split('/');
    const request = {
      query: STATUS_OPTION_QUERY,
      variables: { owner, repo, issue: observation.issue },
    };
    const reads = [];
    for (const pair of lifecycleSources.remote.stageStatus.reads) {
      if (!same(pair.request, request)) throw new TypeError();
      const derivation = await deriveRecordedStageStatusResponse({
        response: pair.response,
        projectId,
      });
      reads.push({
        attempt: pair.attempt,
        request: pair.request,
        transport: pair.response,
        derivation,
      });
    }
    const result = { reads };
    canonicalRecordJson(result);
    return freezeStageData(result);
  } catch {
    revisionError('native-stage-status-source-unavailable');
  }
}

// Derive the remote portion of the original vector from complete native raw
// readers. Retained members must come from independently earlier chronology;
// constructor/coherent data cannot authenticate that history or grant effects.
export async function deriveRecordedStageRemoteResources(input) {
  return (await reconstructOriginalRemoteSources(input)).resources;
}
async function reconstructOriginalRemoteSources(input) {
  try {
    canonicalRecordJson(input);
    exactKeys(input, ['observation', 'lifecycleSources', 'retained', 'projectId', 'kanbanFieldId']);
    const { observation, lifecycleSources, retained, projectId, kanbanFieldId } = input;
    const { deriveRecordedStageCommentCensus } =
      await import('../move-state/transition-commit.mjs');
    const comments = await deriveRecordedStageCommentCensus({
      observation,
      lifecycleSources,
      retained,
    });
    const { deriveRecordedStageProjectItem } = await import('../../../gh/lib/wave-admission.mjs');
    const item = await deriveRecordedStageProjectItem({
      observation,
      lifecycleSources,
      projectId,
      kanbanFieldId,
    });
    const { readCanonicalTimingSource, readTimingCommentBody, deriveRecordedTimingCommentData } =
      await import('../../gh-timing-comment.mjs');
    const timing = lifecycleSources.remote.timing;
    if (!timing || timing.legacy.response.exitCode !== 0 || timing.legacy.response.stderr !== '')
      throw new TypeError();
    let index = 0;
    const census = await readCanonicalTimingSource({
      repo: observation.repository,
      issueNumber: observation.issue,
      deps: {
        graphql: async (request) => {
          const pair = timing.pages[index++];
          if (!pair || !same(pair.request, request)) throw new TypeError();
          return structuredClone(pair.response);
        },
      },
    });
    if (!['absent', 'found'].includes(census.status) || index !== timing.pages.length)
      throw new TypeError();
    const nodes = timing.pages.flatMap(
      (pair) => pair.response.data.repository.issue.comments.nodes
    );
    const legacy = deriveRecordedTimingCommentData({ stdout: timing.legacy.response.stdout });
    if (
      !same(
        comments.map((comment) => ({ id: comment.node_id, body: comment.body })),
        nodes
      ) ||
      !same(
        legacy.comments.map(({ id, body }) => ({ id, body })),
        nodes
      ) ||
      (census.status === 'absent'
        ? legacy.value !== null
        : legacy.value?.id !== census.source.commentNodeId ||
          legacy.value.body !== census.source.body)
    )
      throw new TypeError();
    // Canonical item serialization is deterministic through outer canonical
    // persistence. Preserve every qualified field/content member. REST raw
    // stdout is already an exact string; its native parsed member order stays.
    const resources = {
      comments: comments.map((comment) =>
        Object.freeze({
          id: String(comment.id),
          nodeId: comment.node_id,
          bytes: JSON.stringify(comment),
        })
      ),
      membership: Object.freeze({ projectId, itemId: item.id, bytes: canonicalRecordJson(item) }),
    };
    Object.freeze(resources.comments);
    const legacyResult = await readTimingCommentBody({
      repo: observation.repository,
      issueNumber: observation.issue,
      deps: { findTimingComment: async () => legacy.value },
    });
    return Object.freeze({
      resources: Object.freeze(resources),
      canonical: census,
      legacy: legacyResult,
    });
  } catch {
    revisionError('native-stage-remote-resources');
  }
}

// Original arithmetic DATA only. The stage header separately requires complete
// non-offline original sources and private native invocation membership. Neither
// coherent capture JSON nor this no-return assertion issues or publishes a row.
export async function assertRecordedStageActorCandidate(input) {
  try {
    canonicalRecordJson(input);
    exactKeys(input, ['capture', 'state', 'marker', 'identity', 'offsetMin']);
    const { capture: c, state, marker, identity, offsetMin } = input;
    exactKeys(identity, ['provider', 'sid']);
    exactKeys(marker, ['line', 'words', 'wordsFull']);
    exactKeys(c, [
      'projectDir',
      'statePath',
      'journalFile',
      'identity',
      'ts',
      'skipNetwork',
      'resolutions',
      'word',
      'activity',
      'timing',
      'candidate',
    ]);
    exactKeys(c.resolutions, ['word', 'activity']);
    if (
      !same(c.identity, identity) ||
      typeof c.skipNetwork !== 'boolean' ||
      !state.entryStartTs ||
      !Number.isFinite(Date.parse(state.entryStartTs)) ||
      Object.values(marker).some((n) => !Number.isSafeInteger(n) || n < 0)
    )
      throw new TypeError();
    const { timingActorKey } = await import('../timing-actor.mjs');
    const key = timingActorKey(identity);
    const { advanceWordMarker, stateFullWordMarker } = await import('../../state.mjs');
    const { assertRecordedStageActorRow, deriveRecordedTimingCommentData } =
      await import('../../gh-timing-comment.mjs');
    const { parseTimingRow } = await import('../timing-row-reader.mjs');
    let lastRow = null;
    if (c.timing !== null) {
      exactKeys(c.timing, ['issue', 'actorKey', 'source', 'row']);
      const source = c.timing.source;
      exactKeys(source, ['kind', 'reads', 'result']);
      if (
        source.kind !== 'legacy' ||
        source.reads.length !== 1 ||
        c.timing.actorKey !== key ||
        c.timing.issue !== state.active
      )
        throw new TypeError();
      const pair = source.reads[0];
      exactKeys(pair, ['request', 'response']);
      exactKeys(pair.response, ['stdout', 'stderr', 'exitCode']);
      if (pair.response.exitCode !== 0 || pair.response.stderr !== '') throw new TypeError();
      const selected = deriveRecordedTimingCommentData({ stdout: pair.response.stdout });
      lastRow =
        (selected.value?.body ?? '')
          .split('\n')
          .map(parseTimingRow)
          .filter((row) => row?.actorKey === key)
          .at(-1) ?? null;
      if (!same(c.timing.row, lastRow)) throw new TypeError();
    } else if (!c.skipNetwork) throw new TypeError();
    const w = c.word,
      a = c.activity;
    exactKeys(w, [
      'path',
      'provider',
      'sid',
      'fromLine',
      'byteLength',
      'sha256',
      'totalLines',
      'status',
      'count',
      'fullExpansion',
    ]);
    exactKeys(a, [
      'path',
      'provider',
      'sid',
      'startMs',
      'endMs',
      'idleThresholdMs',
      'byteLength',
      'sha256',
      'status',
      'reason',
      'events',
      'activeEstimateSec',
      'idleEstimateSec',
      'knownEngagementMs',
    ]);
    for (const source of [w, a])
      if (
        source.provider !== identity.provider ||
        source.sid !== identity.sid ||
        typeof source.path !== 'string' ||
        !Number.isSafeInteger(source.byteLength) ||
        source.byteLength < 0 ||
        !/^[a-f0-9]{64}$/.test(source.sha256)
      )
        throw new TypeError();
    if (
      w.path !== c.resolutions.word ||
      a.path !== c.resolutions.activity ||
      w.fromLine !== marker.line ||
      w.status !== 'ok' ||
      [w.totalLines, w.count, w.fullExpansion].some((n) => !Number.isSafeInteger(n) || n < 0) ||
      w.totalLines < marker.line ||
      w.fullExpansion < w.count
    )
      throw new TypeError();
    const endMs = Date.parse(c.ts),
      entry = Date.parse(state.entryStartTs);
    const startMs = Number.isSafeInteger(lastRow?.engagement?.endMs)
      ? Math.max(entry, lastRow.engagement.endMs)
      : entry;
    if (
      !Number.isSafeInteger(endMs) ||
      startMs > endMs ||
      a.startMs !== startMs ||
      a.endMs !== endMs ||
      !Number.isFinite(a.idleThresholdMs) ||
      a.idleThresholdMs < 0 ||
      !Array.isArray(a.events) ||
      a.events.some(
        (n, i) => !Number.isFinite(n) || n < startMs || n > endMs || (i && n <= a.events[i - 1])
      )
    )
      throw new TypeError();
    let activeSec = null,
      idleSec = null;
    if (a.status === 'observed') {
      const { computeActiveAndIdleSeconds } = await import('../../active-time.mjs');
      const estimate = computeActiveAndIdleSeconds(a);
      if (
        a.reason !== null ||
        a.knownEngagementMs !== endMs - startMs ||
        a.activeEstimateSec !== estimate.activeSec ||
        a.idleEstimateSec !== estimate.idleSec
      )
        throw new TypeError();
      activeSec = Math.min(Math.floor((endMs - startMs) / 1000), estimate.activeSec);
      idleSec = estimate.idleSec;
    } else if (
      a.status !== 'unavailable' ||
      ![
        'window-unconfirmed',
        'transcript-malformed',
        'transcript-unsupported',
        'window-identity-unconfirmed',
      ].includes(a.reason) ||
      a.activeEstimateSec !== null ||
      a.idleEstimateSec !== null ||
      a.knownEngagementMs !== null
    )
      throw new TypeError();
    const priorWords = state.lastWordMarker ?? 0,
      priorFull = stateFullWordMarker(state, marker);
    const wordMarker = advanceWordMarker(state.lastWordMarker, state.lastWordMarker + w.count);
    const fullWordMarker = advanceWordMarker(priorFull, priorFull + w.fullExpansion);
    const engagement = {
      startMs,
      endMs,
      activeEstimateSec: activeSec,
      wordStart: priorWords,
      wordEnd: wordMarker,
      fullWordStart: priorFull,
      fullWordEnd: fullWordMarker,
    };
    assertRecordedStageActorRow({
      row: c.candidate.row,
      identity,
      ts: c.ts,
      offsetMin,
      engagement,
      activeSec,
      idleSec,
      deltaWords: w.count,
      wordMarker,
      fullWordMarker,
    });
    const expected = {
      issue: state.active,
      row: c.candidate.row,
      previous: {
        entryStartTs: state.entryStartTs ?? null,
        lastWordMarker: state.lastWordMarker ?? 0,
        lastFullWordMarker: state.lastFullWordMarker ?? 0,
      },
      cursor: {
        before: marker,
        after: { line: w.totalLines, words: wordMarker, wordsFull: fullWordMarker },
      },
      checkpoint: {
        active: state.active,
        entryStartTs: c.ts,
        wordsAtEntryStart: wordMarker,
        fullWordsAtEntryStart: fullWordMarker,
        lastWordMarker: wordMarker,
        lastFullWordMarker: fullWordMarker,
      },
    };
    if (!same(c.candidate, expected)) throw new TypeError();
    deriveActorFlushJournalRecord({ identity, candidate: c.candidate });
  } catch {
    revisionError('native-stage-actor-candidate');
  }
}

// Shared original native item/assignment binding; validation DATA only.
export function assertNativeStageSourceItem(input) {
  try {
    exactKeys(input, ['config', 'item', 'assignmentReads']);
    const { config: cfg, item, assignmentReads } = input;
    const assignments = assignmentReads.reads
      .filter((pair) => pair.kind === 'page')
      .flatMap((pair) => pair.response.repository.issue.projectItems.nodes)
      .filter((value) => value.project.id === cfg.projectId);
    const status = item.fieldValues.nodes.filter((value) => value.field.id === cfg.kanbanFieldId);
    if (
      assignments.length !== 1 ||
      assignments[0].id !== item.id ||
      status.length !== 1 ||
      status[0].name !== 'Develop' ||
      status[0].optionId !== cfg.kanbanOptionDevelop ||
      assignments[0].fieldValueByName?.name !== status[0].name
    )
      throw new TypeError();
  } catch {
    revisionError('native-stage-source-item');
  }
}

// Full original header DATA is checked against the independently replayed
// predecessor supplied by the native chronology. This function issues nothing.
export async function reconstructNativeStageHeader(input) {
  try {
    canonicalRecordJson(input);
    exactKeys(input, [
      'header',
      'cursor',
      'currentContract',
      'planning',
      'proofs',
      'chain',
      'predecessor',
      'retained',
    ]);
    const {
      header: h,
      cursor,
      currentContract,
      planning,
      proofs,
      chain,
      predecessor,
      retained,
    } = input;
    exactKeys(h, [
      'id',
      'revisionEventHead',
      'predecessor',
      'scope',
      'intent',
      'guardCapture',
      'original',
    ]);
    const { id, ...unsigned } = h;
    if (
      id !== hashBytes(canonicalRecordJson(unsigned)) ||
      h.revisionEventHead !== chain.head ||
      h.predecessor !== predecessor ||
      !planning ||
      !currentContract
    )
      throw new TypeError();
    const { projectCollectedRevisionObservation } = await import('./proposal.mjs');
    const expected = projectCollectedRevisionObservation({
      observation: cursor,
      chain,
      currentContract,
    });
    const o = h.original.observation;
    if (!same(o, expected) || o.stage !== 'develop' || o.issueState !== 'open')
      throw new TypeError();
    exactKeys(h.scope, ['repository', 'issue', 'domain', 'executor']);
    if (
      !same(h.scope, {
        repository: o.repository,
        issue: o.issue,
        domain: o.writerDomain,
        executor: o.executor,
      })
    )
      throw new TypeError();
    const original = h.original,
      g = h.guardCapture;
    exactKeys(original, [
      'observation',
      'timing',
      'transitionComments',
      'membership',
      'local',
      'fieldSources',
      'resources',
      'actor',
    ]);
    exactKeys(g, [
      'sources',
      'assignmentReads',
      'gitReads',
      'lifecycleSources',
      'phasePolicy',
      'invocations',
      'evaluatedAt',
    ]);
    const { deriveRecordedStageSources } = await import('./native-stage-data.mjs');
    const { config: cfg } = deriveRecordedStageSources(g.sources);
    if (Object.hasOwn(g.lifecycleSources.remote, 'stageStatus'))
      await deriveRecordedStageStatusSource({
        observation: o,
        lifecycleSources: g.lifecycleSources,
        projectId: cfg.projectId,
      });
    if (
      g.sources.projectDir !== o.executor.worktree ||
      g.sources.sessionId !== o.executor.sessionId ||
      g.sources.repository !== o.repository ||
      typeof g.evaluatedAt !== 'string' ||
      !Number.isFinite(Date.parse(g.evaluatedAt))
    )
      throw new TypeError();
    const { deriveGuardPhasePolicy } = await import('../move-state/guard-execution.mjs');
    if (!same(g.phasePolicy, deriveGuardPhasePolicy({ fromState: 'develop', toState: 'test' })))
      throw new TypeError();
    const guard = await reconstructNativeStageGuardEvidence({
      observation: o,
      definitions: currentContract.definitions,
      proofs,
      lifecycleSources: g.lifecycleSources,
      sources: g.sources,
      invocations: g.invocations,
      gitReads: g.gitReads,
    });
    if (!same(guard.assignment, g.assignmentReads)) throw new TypeError();
    const remoteSource = await reconstructOriginalRemoteSources({
      observation: o,
      lifecycleSources: g.lifecycleSources,
      retained,
      projectId: cfg.projectId,
      kanbanFieldId: cfg.kanbanFieldId,
    });
    const remote = remoteSource.resources;
    exactKeys(original.resources, ['schema', 'comments', 'membership', 'local']);
    if (
      !same(original.resources, {
        schema: 'aitm.native-stage-resources/v1',
        ...remote,
        local: original.local,
      })
    )
      throw new TypeError();
    const { deriveRecordedStageProjectItem } = await import('../../../gh/lib/wave-admission.mjs');
    const item = await deriveRecordedStageProjectItem({
      observation: o,
      lifecycleSources: g.lifecycleSources,
      projectId: cfg.projectId,
      kanbanFieldId: cfg.kanbanFieldId,
    });
    assertNativeStageSourceItem({ config: cfg, item, assignmentReads: guard.assignment });
    exactKeys(original.membership, ['reads', 'item']);
    if (
      !same(original.membership.item, item) ||
      !same(original.membership.reads, g.lifecycleSources.remote.stageItem)
    )
      throw new TypeError();
    exactKeys(original.transitionComments, ['read', 'comments']);
    if (
      !same(original.transitionComments.read, g.lifecycleSources.remote.stageComments) ||
      !same(
        original.transitionComments.comments,
        remote.comments.map((comment) => JSON.parse(comment.bytes))
      )
    )
      throw new TypeError();
    exactKeys(original.timing, ['canonical', 'legacy']);
    for (const [name, pairs] of [
      ['canonical', g.lifecycleSources.remote.timing.pages],
      ['legacy', [g.lifecycleSources.remote.timing.legacy]],
    ]) {
      exactKeys(original.timing[name], ['kind', 'reads', 'result']);
      if (
        original.timing[name].kind !== name ||
        !same(original.timing[name].reads, pairs) ||
        !same(original.timing[name].result, remoteSource[name])
      )
        throw new TypeError();
    }
    const actor = original.actor;
    exactKeys(actor, ['identity', 'candidateBytes', 'capture', 'offsetMin', 'environment']);
    exactKeys(actor.identity, ['provider', 'sid']);
    if (
      actor.identity.sid !== o.executor.sessionId ||
      actor.capture.skipNetwork !== false ||
      actor.capture.activity.idleThresholdMs !== cfg.idleThresholdMinutes * 60_000 ||
      !same(actor.capture.identity, actor.identity) ||
      !same(actor.capture.candidate, JSON.parse(actor.candidateBytes)) ||
      !same(actor.capture.timing.source, original.timing.legacy) ||
      Date.parse(g.evaluatedAt) > Date.parse(actor.capture.ts)
    )
      throw new TypeError();
    const { deriveRecordedTransitionActor } = await import('../move-state/transition-commit.mjs');
    const transitionActor = deriveRecordedTransitionActor(actor.environment);
    exactKeys(h.intent, [
      'source',
      'target',
      'transitionId',
      'actor',
      'provider',
      'sessionId',
      'projectId',
      'itemId',
      'statusFieldId',
      'sourceOptionId',
      'targetOptionId',
      'tailProfile',
    ]);
    if (
      !/^move:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        h.intent.transitionId
      ) ||
      !same(h.intent, {
        source: 'develop',
        target: 'test',
        transitionId: h.intent.transitionId,
        actor: transitionActor,
        provider: actor.identity.provider,
        sessionId: actor.identity.sid,
        projectId: cfg.projectId,
        itemId: item.id,
        statusFieldId: cfg.kanbanFieldId,
        sourceOptionId: cfg.kanbanOptionDevelop,
        targetOptionId: cfg.kanbanOptionTest,
        tailProfile: 'task-owner',
      }) ||
      [cfg.projectId, cfg.kanbanFieldId, cfg.kanbanOptionDevelop, cfg.kanbanOptionTest].some(
        (v) => typeof v !== 'string' || !v
      )
    )
      throw new TypeError();
    const local = original.local;
    exactKeys(local, [
      'activeTask',
      'actorTiming',
      'actorFlush',
      'wordCursor',
      'trackerState',
      'queue',
    ]);
    for (const resource of Object.values(local))
      if (resource !== null) {
        exactKeys(resource, ['bytes']);
        if (typeof resource.bytes !== 'string') throw new TypeError();
      }
    if (local.actorFlush !== null || local.activeTask === null) throw new TypeError();
    const { validateWordCursor } = await import('../../word-counter.mjs');
    const marker =
      local.wordCursor === null
        ? { line: 0, words: 0, wordsFull: 0 }
        : validateWordCursor(JSON.parse(local.wordCursor.bytes), actor.identity);
    const { deriveRecordedState } = await import('../../state.mjs');
    const state = deriveRecordedState({
      sharedBytes: local.trackerState?.bytes ?? null,
      identity: actor.identity,
      actorBytes: local.actorTiming?.bytes ?? null,
      activeBytes: local.activeTask.bytes,
      cursor:
        local.actorTiming === null ? { words: marker.words, wordsFull: marker.wordsFull } : null,
    });
    const active = JSON.parse(local.activeTask.bytes);
    if (
      state.active !== `#${o.issue}` ||
      state.paused ||
      !state.entryStartTs ||
      active.worktreePath !== o.executor.worktree ||
      active.worktreeBranch !== o.executor.branch
    )
      throw new TypeError();
    const { validateTimingQueue } = await import('../../queue.mjs');
    if (local.queue !== null) validateTimingQueue(JSON.parse(local.queue.bytes));
    const { default: path } = await import('node:path');
    const { actorTimingStatePath } = await import('../actor-timing-state.mjs');
    if (
      actor.capture.projectDir !== o.executor.worktree ||
      actor.capture.statePath !== path.join(o.executor.worktree, cfg.statePath) ||
      actor.capture.journalFile !==
        actorTimingStatePath(actor.identity, o.executor.worktree) + '.flush.json'
    )
      throw new TypeError();
    await assertRecordedStageActorCandidate({
      capture: actor.capture,
      identity: actor.identity,
      state,
      marker: { line: marker.line, words: marker.words, wordsFull: marker.wordsFull },
      offsetMin: actor.offsetMin,
    });
    exactKeys(original.fieldSources, ['definitions', 'bindings']);
    const { fileURLToPath } = await import('node:url');
    for (const [key, kind, filename] of [
      ['definitions', 'definitions', 'project-fields'],
      ['bindings', 'events', 'project-field-events'],
    ]) {
      const source = original.fieldSources[key];
      exactKeys(source, ['kind', 'directory', 'reads']);
      if (
        source.kind !== kind ||
        source.directory !== o.executor.worktree ||
        !Array.isArray(source.reads) ||
        source.reads.length < 1 ||
        source.reads.length > 2
      )
        throw new TypeError();
      const paths = [
        path.join(o.executor.worktree, '.ai-task-manager', filename + '.json'),
        fileURLToPath(new URL('../../../../config/' + filename + '.default.json', import.meta.url)),
      ];
      for (let i = 0; i < source.reads.length; i++) {
        const read = source.reads[i];
        exactKeys(read, ['path', 'exists', 'bytes', 'error']);
        if (
          read.path !== paths[i] ||
          read.error !== null ||
          read.exists !== (i === 0 ? source.reads.length === 1 : null) ||
          (i < source.reads.length - 1 ? read.bytes !== null : typeof read.bytes !== 'string')
        )
          throw new TypeError();
      }
      const value = JSON.parse(source.reads.at(-1).bytes);
      if (
        key === 'definitions'
          ? !Array.isArray(value)
          : !value || typeof value !== 'object' || Array.isArray(value)
      )
        throw new TypeError();
    }
    return freezeStageData({
      observation: structuredClone(o),
      resources: structuredClone(original.resources),
      guard,
      actorJournalBytes:
        JSON.stringify(
          deriveActorFlushJournalRecord({
            identity: actor.identity,
            candidate: JSON.parse(actor.candidateBytes),
          }),
          null,
          2
        ) + '\n',
    });
  } catch {
    revisionError('native-stage-header');
  }
}

function freezeStageData(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeStageData);
    Object.freeze(value);
  }
  return value;
}

// Initial fixed pending stage shape. Full origin/header authority is validated
// only by the independently ordered history fold, never this codec.
export function validateNativeStageJournal(journal) {
  try {
    canonicalRecordJson(journal);
    exactKeys(journal, [
      'schema',
      'header',
      'steps',
      ...(Object.hasOwn(journal, 'compensation') ? ['compensation'] : []),
    ]);
    if (journal.schema !== 'aitm.native-stage/v1') throw new TypeError();
    const { id, ...unsigned } = journal.header;
    if (
      id !== hashBytes(canonicalRecordJson(unsigned)) ||
      !Array.isArray(journal.steps) ||
      ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].includes(
        journal.steps.length
      )
    )
      throw new TypeError();
    if (Object.hasOwn(journal, 'compensation')) {
      if (journal.steps.length !== 14 || journal.steps[13]?.outcome?.kind !== 'unconfirmed')
        throw new TypeError();
      validateNativeCompensationData(journal.compensation, journal.header, journal.steps);
    }
    const first = journal.steps[0];
    exactKeys(first, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
    exactKeys(first.intent, ['journalBytes']);
    const actor = journal.header.original.actor;
    const bytes =
      JSON.stringify(
        deriveActorFlushJournalRecord({
          identity: actor.identity,
          candidate: JSON.parse(actor.candidateBytes),
        }),
        null,
        2
      ) + '\n';
    if (
      first.ordinal !== 1 ||
      first.kind !== 'actor-journal-prepare' ||
      first.previous !== id ||
      first.intent.journalBytes !== bytes
    )
      throw new TypeError();
    if (first.readback !== null) {
      exactKeys(first.readback, ['file', 'bytes']);
      if (first.readback.file !== actor.capture.journalFile || first.readback.bytes !== bytes)
        throw new TypeError();
    }
    if (journal.steps.length >= 2) {
      if (first.readback === null) throw new TypeError();
      const second = journal.steps[1];
      exactKeys(second, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
      exactKeys(second.intent, ['row', 'commentId', 'nodeId', 'beforeBody', 'afterBody']);
      const allocation = nativeStageTimingAllocation(journal.header);
      if (
        second.ordinal !== 2 ||
        second.kind !== 'actor-timing' ||
        second.previous !== hashBytes(canonicalRecordJson(first)) ||
        second.intent.row !== JSON.parse(actor.candidateBytes).row ||
        second.intent.commentId !== allocation.commentId ||
        second.intent.nodeId !== allocation.nodeId ||
        second.intent.beforeBody !== allocation.beforeBody ||
        typeof second.intent.afterBody !== 'string'
      )
        throw new TypeError();
      if (second.readback !== null) exactKeys(second.readback, ['source', 'pages']);
    }
    if (journal.steps.length >= 3) {
      const second = journal.steps[1],
        third = journal.steps[2];
      exactKeys(third, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
      exactKeys(third.intent, ['file', 'line', 'words', 'wordsFull', 'task', 'ts', 'bytes']);
      const candidate = JSON.parse(actor.candidateBytes),
        intent = third.intent;
      if (
        second.readback === null ||
        third.ordinal !== 3 ||
        third.kind !== 'actor-cursor' ||
        third.previous !== hashBytes(canonicalRecordJson(second)) ||
        !candidate.cursor ||
        !same(
          { line: intent.line, words: intent.words, wordsFull: intent.wordsFull },
          candidate.cursor.after
        ) ||
        intent.task !== candidate.issue ||
        typeof intent.file !== 'string' ||
        !intent.file ||
        typeof intent.bytes !== 'string' ||
        typeof intent.ts !== 'string' ||
        !Number.isFinite(Date.parse(intent.ts)) ||
        Date.parse(intent.ts) < Date.parse(actor.capture.ts)
      )
        throw new TypeError();
      if (third.readback !== null) {
        exactKeys(third.readback, ['file', 'bytes']);
        if (third.readback.file !== intent.file || third.readback.bytes !== intent.bytes)
          throw new TypeError();
      }
    }
    for (const index of [3, 4, 5, 7, 8, 9].filter((index) => index < journal.steps.length)) {
      const step = journal.steps[index],
        previous = journal.steps[index - 1];
      exactKeys(step, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
      const kind = ['local-session', 'local-actor', 'local-tracker'][
        index < 6 ? index - 3 : index - 7
      ];
      exactKeys(
        step.intent,
        kind === 'local-session'
          ? ['invocation', 'file', 'stateBytes', 'recordBytes', 'boundAt', 'bytes']
          : ['invocation', 'file', 'stateBytes', 'bytes']
      );
      if (
        previous.readback === null ||
        step.ordinal !== index + 1 ||
        step.kind !== kind ||
        step.previous !== hashBytes(canonicalRecordJson(previous)) ||
        step.intent.invocation !== (index < 6 ? 'actor-checkpoint' : 'actor-final') ||
        ['file', 'stateBytes', 'bytes'].some((key) => typeof step.intent[key] !== 'string') ||
        (kind === 'local-session' &&
          (typeof step.intent.recordBytes !== 'string' ||
            typeof step.intent.boundAt !== 'string' ||
            !Number.isFinite(Date.parse(step.intent.boundAt))))
      )
        throw new TypeError();
      if (step.readback !== null) {
        exactKeys(step.readback, ['file', 'bytes']);
        if (step.readback.file !== step.intent.file || step.readback.bytes !== step.intent.bytes)
          throw new TypeError();
      }
    }
    if (journal.steps.length >= 7) {
      const step = journal.steps[6],
        previous = journal.steps[5];
      exactKeys(step, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
      exactKeys(step.intent, ['file', 'journalDigest', 'journalBytes']);
      const nativeRecord = JSON.parse(first.intent.journalBytes);
      if (
        step.ordinal !== 7 ||
        step.kind !== 'actor-journal-remove' ||
        previous.readback === null ||
        step.previous !== hashBytes(canonicalRecordJson(previous)) ||
        step.intent.file !== actor.capture.journalFile ||
        step.intent.journalDigest !== nativeRecord.digest ||
        step.intent.journalBytes !== first.intent.journalBytes
      )
        throw new TypeError();
      if (step.readback !== null) {
        exactKeys(step.readback, ['file', 'bytes']);
        if (step.readback.file !== step.intent.file || step.readback.bytes !== null)
          throw new TypeError();
      }
    }
    for (const index of [10, 11].filter((index) => index < journal.steps.length)) {
      const step = journal.steps[index],
        previous = journal.steps[index - 1];
      exactKeys(step, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
      exactKeys(step.intent, [
        'phase',
        'ts',
        'offsetMin',
        'row',
        'commentId',
        'nodeId',
        'beforeBody',
        'afterBody',
      ]);
      const intent = step.intent,
        actorTiming = journal.steps[1].intent;
      if (
        previous.readback === null ||
        step.ordinal !== index + 1 ||
        step.kind !== 'phase-timing' ||
        step.previous !== hashBytes(canonicalRecordJson(previous)) ||
        intent.phase !== (index === 10 ? 'develop:complete' : 'test:enter') ||
        typeof intent.ts !== 'string' ||
        !Number.isFinite(Date.parse(intent.ts)) ||
        Date.parse(intent.ts) < Date.parse(actor.capture.ts) ||
        !Number.isInteger(intent.offsetMin) ||
        intent.commentId !== actorTiming.commentId ||
        intent.nodeId !== actorTiming.nodeId ||
        ['row', 'beforeBody', 'afterBody'].some((key) => typeof intent[key] !== 'string') ||
        (index === 11 &&
          (intent.ts !== previous.intent.ts || intent.offsetMin !== previous.intent.offsetMin))
      )
        throw new TypeError();
      if (step.readback !== null) exactKeys(step.readback, ['source', 'pages']);
    }
    if (journal.steps.length >= 13) {
      const step = journal.steps[12],
        previous = journal.steps[11];
      if (
        previous.readback === null ||
        step.kind !== 'entry-body' ||
        step.intent.visit !== 1 ||
        Date.parse(step.intent.entryTs) < Date.parse(previous.intent.ts) ||
        Date.parse(step.intent.stateTs) < Date.parse(step.intent.entryTs)
      )
        throw new TypeError();
      reconstructNativeStageBodyStep({
        repository: journal.header.scope.repository,
        issue: journal.header.scope.issue,
        transitionId: journal.header.intent.transitionId,
        body: journal.header.original.observation.body.bytes,
        ordinal: 13,
        previous: hashBytes(canonicalRecordJson(previous)),
        step,
      });
    }
    if (journal.steps.length >= 14) {
      const step = journal.steps[13],
        previous = journal.steps[12];
      exactKeys(step, ['ordinal', 'kind', 'previous', 'intent', 'attempts', 'outcome', 'readback']);
      exactKeys(step.intent, ['projectId', 'itemId', 'fieldId', 'optionId']);
      const h = journal.header.intent;
      if (
        previous.readback === null ||
        step.ordinal !== 14 ||
        step.kind !== 'board-status' ||
        step.previous !== hashBytes(canonicalRecordJson(previous)) ||
        !same(step.intent, {
          projectId: h.projectId,
          itemId: h.itemId,
          fieldId: h.statusFieldId,
          optionId: h.targetOptionId,
        }) ||
        !Array.isArray(step.attempts) ||
        step.attempts.length > 3
      )
        throw new TypeError();
      for (const [index, attempt] of step.attempts.entries()) {
        exactKeys(attempt, ['number', 'request', 'before', 'write', 'read', 'after']);
        if (attempt.number !== index + 1) throw new TypeError();
        exactKeys(attempt.request, ['file', 'args']);
        exactKeys(attempt.before, ['stage', 'membership']);
        exactKeys(attempt.before.membership, ['projectId', 'itemId', 'bytes']);
        if (attempt.write !== null)
          exactKeys(
            attempt.write,
            attempt.write.kind === 'returned'
              ? ['kind', 'stdout']
              : ['kind', 'name', 'message', 'code']
          );
        if (attempt.read !== null) {
          const rawStatus = Object.hasOwn(
            journal.header.guardCapture.lifecycleSources.remote,
            'stageStatus'
          );
          exactKeys(
            attempt.read,
            rawStatus
              ? attempt.read.kind === 'returned'
                ? ['kind', 'request', 'result', 'status', 'transport']
                : ['kind', 'request', 'error', 'transport']
              : attempt.read.kind === 'returned'
                ? ['kind', 'request', 'response']
                : ['kind', 'request', 'name', 'message', 'code']
          );
        }
        if (attempt.after !== null) {
          exactKeys(attempt.after, ['stage', 'membership']);
          exactKeys(attempt.after.membership, ['projectId', 'itemId', 'bytes']);
        }
      }
      if (step.outcome !== null) exactKeys(step.outcome, ['kind', 'attempt', 'exit']);
      if (step.readback !== null) exactKeys(step.readback, ['attempt', 'stage', 'membership']);
      // Full native parser/attempt/current vector semantics remain in the ONE
      // awaited history fold, not this synchronous constructor shape check.
    }
    if (journal.steps.length >= 15) {
      const step = journal.steps[14],
        previous = journal.steps[13],
        entry = journal.steps[12];
      if (
        previous.readback === null ||
        previous.outcome?.kind !== 'confirmed' ||
        step.kind !== 'sentinel-body' ||
        Date.parse(step.intent?.ts) < Date.parse(entry.intent.stateTs)
      )
        throw new TypeError();
      const body = reconstructNativeStageBodyStep({
        repository: journal.header.scope.repository,
        issue: journal.header.scope.issue,
        transitionId: journal.header.intent.transitionId,
        body: journal.header.original.observation.body.bytes,
        ordinal: 13,
        previous: hashBytes(canonicalRecordJson(journal.steps[11])),
        step: entry,
      }).afterBody;
      reconstructNativeStageBodyStep({
        repository: journal.header.scope.repository,
        issue: journal.header.scope.issue,
        transitionId: journal.header.intent.transitionId,
        body,
        ordinal: 15,
        previous: hashBytes(canonicalRecordJson(previous)),
        step,
      });
    }
    if (journal.steps.length >= 16) {
      const step = journal.steps[15],
        previous = journal.steps[14];
      exactKeys(step, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
      exactKeys(step.intent, ['record', 'commentId', 'nodeId', 'commentBytes']);
      if (
        previous.readback === null ||
        step.ordinal !== 16 ||
        step.kind !== 'transition-comment' ||
        step.previous !== hashBytes(canonicalRecordJson(previous)) ||
        typeof step.intent.commentId !== 'string' ||
        typeof step.intent.nodeId !== 'string' ||
        typeof step.intent.commentBytes !== 'string'
      )
        throw new TypeError();
      if (step.readback !== null) exactKeys(step.readback, ['create', 'read', 'census']);
      // Full allocation, original markers, actor and census are derived by the
      // asynchronous complete-predecessor codec, never constructor authority.
    }
    if (journal.steps.length >= 17) {
      const step = journal.steps[16],
        previous = journal.steps[15];
      exactKeys(step, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
      if (
        previous.readback === null ||
        step.ordinal !== 17 ||
        step.kind !== 'tail-dispatch' ||
        step.previous !== hashBytes(canonicalRecordJson(previous)) ||
        !same(step.intent, { target: 'test', actions: [] })
      )
        throw new TypeError();
      if (step.readback !== null)
        exactKeys(step.readback, ['actions', 'resources', 'body', 'stage']);
    }
    if (journal.steps.length === 18) {
      const step = journal.steps[17],
        previous = journal.steps[16];
      exactKeys(step, ['ordinal', 'kind', 'previous', 'intent', 'readback']);
      exactKeys(step.intent, ['file', 'sid', 'beforeBytes', 'bytes', 'operations']);
      if (
        previous.readback === null ||
        step.ordinal !== 18 ||
        step.kind !== 'tail-cache' ||
        step.previous !== hashBytes(canonicalRecordJson(previous)) ||
        typeof step.intent.file !== 'string' ||
        typeof step.intent.sid !== 'string' ||
        !(step.intent.beforeBytes === null || typeof step.intent.beforeBytes === 'string') ||
        !(step.intent.bytes === null || typeof step.intent.bytes === 'string') ||
        !Array.isArray(step.intent.operations)
      )
        throw new TypeError();
      if (step.readback !== null)
        exactKeys(step.readback, ['file', 'bytes', 'resources', 'body', 'stage']);
    }
    return journal;
  } catch {
    revisionError('native-stage-journal');
  }
}

// Backend fixture allocation DATA from the sealed BEFORE census only. This
// neither allocates a production ID nor grants a publication capability.
export function nativeStageTimingAllocation(header) {
  const entries = header.original.resources.comments;
  const original = header.original.timing.canonical.result;
  if (original.status === 'found') {
    const matches = entries.filter((entry) => entry.nodeId === original.source.commentNodeId);
    if (matches.length !== 1 || JSON.parse(matches[0].bytes).body !== original.source.body)
      revisionError('native-stage-timing-source');
    return {
      commentId: matches[0].id,
      nodeId: matches[0].nodeId,
      beforeBody: original.source.body,
    };
  }
  if (original.status !== 'absent' || original.source !== null)
    revisionError('native-stage-timing-source');
  const ids = entries.map((entry) => Number(entry.id));
  const next = Math.max(0, ...ids) + 1;
  const nodeId = `IC_memory_stage_${header.id.slice(7)}_2`;
  if (!Number.isSafeInteger(next) || next < 1 || entries.some((entry) => entry.nodeId === nodeId))
    revisionError('native-stage-timing-allocation');
  return { commentId: String(next), nodeId, beforeBody: null };
}

// Fixed memory server representation for the genuine canonical reader. Every
// resource member is retained; this is DATA, not a caller-selectable query port.
export function nativeStageTimingPages(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['repository', 'issue', 'comments'], 'native-stage-timing-pages');
  const { repository, issue, comments } = input;
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isSafeInteger(issue) ||
    issue < 1 ||
    !Array.isArray(comments)
  )
    revisionError('native-stage-timing-pages');
  const ids = new Set(),
    nodeIds = new Set();
  const nodes = comments.map((entry) => {
    exactKeys(entry, ['id', 'nodeId', 'bytes'], 'native-stage-timing-pages');
    if (
      typeof entry.id !== 'string' ||
      !/^[1-9][0-9]*$/.test(entry.id) ||
      typeof entry.nodeId !== 'string' ||
      !entry.nodeId ||
      typeof entry.bytes !== 'string' ||
      ids.has(entry.id) ||
      nodeIds.has(entry.nodeId)
    )
      revisionError('native-stage-timing-pages');
    const parsed = JSON.parse(entry.bytes);
    canonicalRecordJson(parsed);
    if (
      !Number.isSafeInteger(parsed?.id) ||
      String(parsed.id) !== entry.id ||
      parsed.node_id !== entry.nodeId ||
      typeof parsed.body !== 'string' ||
      parsed.issue_url !== `https://api.github.com/repos/${repository}/issues/${issue}`
    )
      revisionError('native-stage-timing-pages');
    ids.add(entry.id);
    nodeIds.add(entry.nodeId);
    return { id: entry.nodeId, body: parsed.body };
  });
  const [owner, name] = repository.split('/');
  const pages = [];
  for (let start = 0; start < Math.max(1, nodes.length); start += 100) {
    const end = Math.min(start + 100, nodes.length),
      more = end < nodes.length;
    pages.push({
      request: { owner, name, issue, after: start === 0 ? null : `memory:${start}` },
      response: {
        data: {
          repository: {
            nameWithOwner: repository,
            issue: {
              number: issue,
              comments: {
                totalCount: nodes.length,
                nodes: nodes.slice(start, end),
                pageInfo: { hasNextPage: more, endCursor: more ? `memory:${end}` : null },
              },
            },
          },
        },
      },
    });
  }
  return pages;
}

export async function reconstructNativeStageActorTiming(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['header', 'first', 'step'], 'native-stage-actor-timing');
  const { header, first, step } = input;
  validateNativeStageJournal({ schema: 'aitm.native-stage/v1', header, steps: [first, step] });
  const { assertRecordedStageActorTiming } = await import('../../gh-timing-comment.mjs');
  const { row, beforeBody, afterBody, commentId, nodeId } = step.intent;
  assertRecordedStageActorTiming({ row, beforeBody, afterBody });
  const beforeResources = structuredClone(header.original.resources);
  beforeResources.local.actorFlush = { bytes: first.intent.journalBytes };
  const afterResources = structuredClone(beforeResources);
  const index = afterResources.comments.findIndex((entry) => entry.nodeId === nodeId);
  if (beforeBody === null) {
    if (index !== -1 || afterResources.comments.some((entry) => entry.id === commentId))
      revisionError('native-stage-timing-allocation');
    const login = header.guardCapture.lifecycleSources.remote.identity.response.stdout.trim();
    const bytes = JSON.stringify({
      id: Number(commentId),
      node_id: nodeId,
      issue_url: `https://api.github.com/repos/${header.scope.repository}/issues/${header.scope.issue}`,
      body: afterBody,
      user: { login },
    });
    afterResources.comments.push({ id: commentId, nodeId, bytes });
  } else {
    if (index < 0) revisionError('native-stage-timing-source');
    const value = JSON.parse(afterResources.comments[index].bytes);
    if (value.body !== beforeBody) revisionError('native-stage-timing-source');
    value.body = afterBody;
    afterResources.comments[index].bytes = JSON.stringify(value);
  }
  const source = {
    repository: header.scope.repository,
    issue: header.scope.issue,
    commentNodeId: nodeId,
    body: afterBody,
  };
  const pages = nativeStageTimingPages({
    repository: source.repository,
    issue: source.issue,
    comments: afterResources.comments,
  });
  if (step.readback !== null && !same(step.readback, { source, pages }))
    revisionError('native-stage-timing-readback');
  return { beforeResources, afterResources, source, pages };
}

// Exact original cursor delta DATA; the history caller supplies its independently
// validated header and completed preceding timing leaf. No current writer exists here.
export async function reconstructNativeStageActorCursor(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['header', 'first', 'second', 'step'], 'native-stage-actor-cursor');
  const { header, first, second, step } = input;
  validateNativeStageJournal({
    schema: 'aitm.native-stage/v1',
    header,
    steps: [first, second, step],
  });
  const timing = await reconstructNativeStageActorTiming({ header, first, step: second });
  const { assertRecordedStageActorCursor, markerPathForActor } =
    await import('../../word-counter.mjs');
  const { file, bytes, ...values } = step.intent;
  if (file !== markerPathForActor(header.original.actor.identity, header.scope.executor.worktree))
    revisionError('native-stage-actor-cursor-path');
  assertRecordedStageActorCursor({
    beforeBytes: timing.afterResources.local.wordCursor?.bytes ?? null,
    afterBytes: bytes,
    identity: header.original.actor.identity,
    ...values,
  });
  const afterResources = structuredClone(timing.afterResources);
  afterResources.local.wordCursor = { bytes };
  return { beforeResources: timing.afterResources, afterResources };
}

// Original commit reads loadState BEFORE its cursor write. Preserve that exact
// data dependency even when the independently current cursor has advanced.
export async function deriveNativeStageCheckpointState(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['header', 'first', 'second'], 'native-stage-checkpoint-state');
  const { header, first, second } = input;
  if (second.readback === null) revisionError('native-stage-checkpoint-state');
  const timing = await reconstructNativeStageActorTiming({ header, first, step: second });
  const local = timing.afterResources.local,
    identity = header.original.actor.identity;
  const { validateWordCursor } = await import('../../word-counter.mjs');
  const marker =
    local.wordCursor === null
      ? { words: 0, wordsFull: 0 }
      : validateWordCursor(JSON.parse(local.wordCursor.bytes), identity);
  const { deriveRecordedState } = await import('../../state.mjs');
  const current = deriveRecordedState({
    sharedBytes: local.trackerState?.bytes ?? null,
    identity,
    actorBytes: local.actorTiming?.bytes ?? null,
    activeBytes: local.activeTask?.bytes ?? null,
    cursor:
      local.actorTiming === null ? { words: marker.words, wordsFull: marker.wordsFull } : null,
  });
  const candidate = JSON.parse(header.original.actor.candidateBytes);
  if (
    current.active !== candidate.issue ||
    !Object.keys(candidate.previous).every(
      (key) => (current[key] ?? (key === 'entryStartTs' ? null : 0)) === candidate.previous[key]
    )
  )
    revisionError('native-stage-checkpoint-state');
  return JSON.stringify({ ...current, ...candidate.checkpoint });
}
// The original outer state was loaded before the same actor flush. Its only
// mutations are the validated checkpoint plus the actual native result fields.
export async function deriveNativeStageActorFinalState(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['header', 'steps'], 'native-stage-final-state');
  const { header, steps } = input;
  if (steps.length < 7 || steps[6].readback === null) revisionError('native-stage-final-prefix');
  await reconstructNativeStageActorRemoval({ header, steps: steps.slice(0, 7) });
  const state = JSON.parse(
    await deriveNativeStageCheckpointState({ header, first: steps[0], second: steps[1] })
  );
  const candidate = JSON.parse(header.original.actor.candidateBytes);
  return JSON.stringify({
    ...state,
    entryStartTs: header.original.actor.capture.ts,
    wordsAtEntryStart: candidate.checkpoint.wordsAtEntryStart,
    fullWordsAtEntryStart: candidate.checkpoint.fullWordsAtEntryStart,
  });
}
export async function reconstructNativeStageCheckpointSteps(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['header', 'steps'], 'native-stage-checkpoint-steps');
  const { header, steps } = input;
  if (steps.length < 4 || steps.length === 7) revisionError('native-stage-checkpoint-steps');
  validateNativeStageJournal({ schema: 'aitm.native-stage/v1', header, steps });
  const final = steps.length >= 8;
  const cursor = final
    ? await reconstructNativeStageActorRemoval({ header, steps: steps.slice(0, 7) })
    : await reconstructNativeStageActorCursor({
        header,
        first: steps[0],
        second: steps[1],
        step: steps[2],
      });
  if (steps[final ? 6 : 2].readback === null) revisionError('native-stage-checkpoint-prefix');
  const stateBytes = final
    ? await deriveNativeStageActorFinalState({ header, steps: steps.slice(0, 7) })
    : await deriveNativeStageCheckpointState({ header, first: steps[0], second: steps[1] });
  const { deriveRecordedStateSave } = await import('../../state.mjs');
  const { deriveRecordedActiveTask } = await import('../../session-state.mjs');
  const { activeTaskPath } = await import('../../paths.mjs');
  const { actorTimingStatePath } = await import('../actor-timing-state.mjs');
  let resources = cursor.afterResources,
    beforeResources;
  for (const step of steps.slice(final ? 7 : 3)) {
    beforeResources = structuredClone(resources);
    const identity = header.original.actor.identity,
      root = header.scope.executor.worktree,
      intent = step.intent;
    if (intent.stateBytes !== stateBytes) revisionError('native-stage-checkpoint-input');
    const derived = deriveRecordedStateSave({
      stateBytes,
      identity,
      priorBindingBytes: resources.local.activeTask?.bytes ?? null,
      previousBytes: resources.local.trackerState?.bytes ?? null,
    });
    let key, file, bytes;
    if (step.kind === 'local-session') {
      key = 'activeTask';
      file = activeTaskPath(identity.sid, root);
      if (
        !derived.bindingRecord ||
        intent.recordBytes !== JSON.stringify(derived.bindingRecord) ||
        (derived.bindingRecord.boundAt != null &&
          intent.boundAt !== derived.bindingRecord.boundAt) ||
        (derived.bindingRecord.boundAt == null &&
          Date.parse(intent.boundAt) < Date.parse(header.original.actor.capture.ts))
      )
        revisionError('native-stage-session-input');
      bytes = deriveRecordedActiveTask({
        recordBytes: intent.recordBytes,
        existingBytes: resources.local.activeTask?.bytes ?? null,
        boundAt: intent.boundAt,
      }).bytes;
    } else if (step.kind === 'local-actor') {
      key = 'actorTiming';
      file = actorTimingStatePath(identity, root);
      bytes = JSON.stringify(derived.actorRecord, null, 2) + '\n';
    } else {
      key = 'trackerState';
      file = header.original.actor.capture.statePath;
      bytes = derived.sharedBytes;
    }
    if (intent.file !== file || intent.bytes !== bytes)
      revisionError('native-stage-checkpoint-bytes');
    resources = structuredClone(resources);
    resources.local[key] = { bytes };
  }
  return { beforeResources, afterResources: resources };
}

export async function reconstructNativeStageActorRemoval(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['header', 'steps'], 'native-stage-actor-removal');
  const { header, steps } = input;
  if (steps.length !== 7) revisionError('native-stage-actor-removal');
  validateNativeStageJournal({ schema: 'aitm.native-stage/v1', header, steps });
  const checkpoint = await reconstructNativeStageCheckpointSteps({
    header,
    steps: steps.slice(0, 6),
  });
  const beforeResources = checkpoint.afterResources;
  if (beforeResources.local.actorFlush?.bytes !== steps[6].intent.journalBytes)
    revisionError('native-stage-actor-removal-prefix');
  validateActorFlushJournal(
    JSON.parse(beforeResources.local.actorFlush.bytes),
    header.original.actor.identity
  );
  const afterResources = structuredClone(beforeResources);
  afterResources.local.actorFlush = null;
  return { beforeResources, afterResources };
}

// Each shared phase is derived from the fully reconstructed actor-final cursor.
// Recorded data never grants current publication or a clock override.
export async function reconstructNativeStagePhaseTiming(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['header', 'steps'], 'native-stage-phase-timing');
  const { header, steps } = input;
  if (![11, 12].includes(steps.length)) revisionError('native-stage-phase-prefix');
  validateNativeStageJournal({ schema: 'aitm.native-stage/v1', header, steps });
  let resources = (
    await reconstructNativeStageCheckpointSteps({ header, steps: steps.slice(0, 10) })
  ).afterResources;
  const { assertRecordedStagePhaseTiming } = await import('../../gh-timing-comment.mjs');
  let beforeResources, source, pages;
  for (const step of steps.slice(10)) {
    beforeResources = structuredClone(resources);
    const { phase, ts, offsetMin, row, commentId, nodeId, beforeBody, afterBody } = step.intent;
    assertRecordedStagePhaseTiming({
      phase,
      ts,
      offsetMin,
      row,
      beforeBody,
      afterBody,
      transitionId: header.intent.transitionId,
    });
    resources = structuredClone(resources);
    const entry = resources.comments.find((value) => value.nodeId === nodeId);
    if (!entry || entry.id !== commentId) revisionError('native-stage-phase-source');
    const raw = JSON.parse(entry.bytes);
    if (raw.body !== beforeBody) revisionError('native-stage-phase-source');
    raw.body = afterBody;
    entry.bytes = JSON.stringify(raw);
    source = {
      repository: header.scope.repository,
      issue: header.scope.issue,
      commentNodeId: nodeId,
      body: afterBody,
    };
    pages = nativeStageTimingPages({
      repository: source.repository,
      issue: source.issue,
      comments: resources.comments,
    });
    if (step.readback !== null && !same(step.readback, { source, pages }))
      revisionError('native-stage-phase-readback');
  }
  return { beforeResources, afterResources: resources, source, pages };
}

// The current observation is derived independently from the original header
// cursor. This is data only; live storage independently owns that cursor.
export async function reconstructNativeStageEntryBody(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['header', 'steps'], 'native-stage-entry-body');
  const { header, steps } = input;
  if (steps.length !== 13) revisionError('native-stage-entry-prefix');
  validateNativeStageJournal({ schema: 'aitm.native-stage/v1', header, steps });
  const phases = await reconstructNativeStagePhaseTiming({ header, steps: steps.slice(0, 12) });
  const derived = reconstructNativeStageBodyStep({
    repository: header.scope.repository,
    issue: header.scope.issue,
    transitionId: header.intent.transitionId,
    body: header.original.observation.body.bytes,
    ordinal: 13,
    previous: hashBytes(canonicalRecordJson(steps[11])),
    step: steps[12],
  });
  const beforeBody = structuredClone(header.original.observation.body);
  const afterBody = { bytes: derived.afterBody, version: parseBodyVersion(derived.afterBody) };
  return {
    beforeBody,
    afterBody,
    resources: phases.afterResources,
    readbackBody: derived.readbackBody,
  };
}

// Closed ordered board-attempt DATA. The live store must independently derive
// every input from its original cursor/token and current resource reads.
export async function reconstructNativeStageBoardStep(input) {
  try {
    canonicalRecordJson(input);
    exactKeys(input, [
      'repository',
      'issue',
      'sourceOptionId',
      'intent',
      'before',
      'previous',
      'step',
      ...(Object.hasOwn(input, 'statusSource') ? ['statusSource'] : []),
    ]);
    const detached = structuredClone(input);
    const { repository, issue, sourceOptionId, intent, before, previous, step } = detached;
    if (
      typeof repository !== 'string' ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      !Number.isSafeInteger(issue) ||
      issue < 1 ||
      typeof sourceOptionId !== 'string' ||
      !sourceOptionId ||
      typeof previous !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(previous)
    )
      throw new TypeError();
    exactKeys(intent, ['projectId', 'itemId', 'fieldId', 'optionId']);
    if (Object.values(intent).some((value) => typeof value !== 'string' || !value))
      throw new TypeError();
    exactKeys(before, ['stage', 'membership']);
    exactKeys(before.membership, ['projectId', 'itemId', 'bytes']);
    const original = JSON.parse(before.membership.bytes);
    if (
      before.stage !== 'develop' ||
      before.membership.bytes !== canonicalRecordJson(original) ||
      before.membership.projectId !== intent.projectId ||
      before.membership.itemId !== intent.itemId ||
      original.id !== intent.itemId ||
      original.project?.id !== intent.projectId ||
      original.content?.__typename !== 'Issue' ||
      typeof original.content.id !== 'string' ||
      !original.content.id ||
      original.content.number !== issue ||
      original.content.repository?.nameWithOwner !== repository ||
      !Array.isArray(original.fieldValues?.nodes) ||
      original.fieldValues.totalCount !== original.fieldValues.nodes.length ||
      original.fieldValues.pageInfo?.hasNextPage !== false
    )
      throw new TypeError();
    const fields = original.fieldValues.nodes.filter((value) => value.field?.id === intent.fieldId);
    if (
      fields.length !== 1 ||
      fields[0].__typename !== 'ProjectV2ItemFieldSingleSelectValue' ||
      fields[0].field.name !== 'Status' ||
      fields[0].name !== 'Develop' ||
      fields[0].optionId !== sourceOptionId
    )
      throw new TypeError();
    const changed = structuredClone(original);
    const target = changed.fieldValues.nodes.find((value) => value.field.id === intent.fieldId);
    target.name = 'Test';
    target.optionId = intent.optionId;
    const after = {
      stage: 'test',
      membership: { ...before.membership, bytes: canonicalRecordJson(changed) },
    };
    const {
      statusWriteArgs,
      statusOptionFromData,
      STATUS_OPTION_QUERY,
      STATUS_WRITE_MAX_ATTEMPTS,
      STATUS_WRITE_READBACK_EXIT,
    } = await import('../move-state/github-mutation.mjs');
    const [owner, repo] = repository.split('/');
    const readRequest = { query: STATUS_OPTION_QUERY, variables: { owner, repo, issue } };
    const writeRequest = { file: 'gh', args: statusWriteArgs(intent) };
    exactKeys(step, ['ordinal', 'kind', 'previous', 'intent', 'attempts', 'outcome', 'readback']);
    if (
      step.ordinal !== 14 ||
      step.kind !== 'board-status' ||
      step.previous !== previous ||
      !same(step.intent, intent) ||
      !Array.isArray(step.attempts) ||
      step.attempts.length > STATUS_WRITE_MAX_ATTEMPTS
    )
      throw new TypeError();
    let recordedStatus = null;
    if (Object.hasOwn(detached, 'statusSource')) {
      const source = detached.statusSource;
      if (
        source.observation?.repository !== repository ||
        source.observation?.issue !== issue ||
        source.projectId !== intent.projectId
      )
        throw new TypeError();
      recordedStatus = await deriveRecordedStageStatusSource(source);
      if (recordedStatus === null) throw new TypeError();
    }
    let consumedReads = 0;
    const errorData = (value) => {
      if (
        typeof value.name !== 'string' ||
        typeof value.message !== 'string' ||
        !(value.code === null || typeof value.code === 'string' || Number.isSafeInteger(value.code))
      )
        throw new TypeError();
    };
    let current = before,
      lastRead = null,
      thrown = false,
      pending = true;
    for (let index = 0; index < step.attempts.length; index++) {
      const attempt = step.attempts[index],
        last = index === step.attempts.length - 1;
      exactKeys(attempt, ['number', 'request', 'before', 'write', 'read', 'after']);
      if (
        attempt.number !== index + 1 ||
        !same(attempt.request, writeRequest) ||
        !same(attempt.before, current)
      )
        throw new TypeError();
      if (attempt.write === null) {
        if (!last || attempt.read !== null || attempt.after !== null) throw new TypeError();
        pending = true;
        break;
      }
      if (attempt.write.kind === 'threw') {
        exactKeys(attempt.write, ['kind', 'name', 'message', 'code']);
        errorData(attempt.write);
        if (!last || attempt.read !== null || attempt.after !== null) throw new TypeError();
        thrown = true;
        pending = false;
        break;
      }
      exactKeys(attempt.write, ['kind', 'stdout']);
      if (attempt.write.kind !== 'returned' || typeof attempt.write.stdout !== 'string')
        throw new TypeError();
      if (attempt.read === null) {
        if (!last || attempt.after !== null) throw new TypeError();
        pending = true;
        break;
      }
      if (!same(attempt.read.request, readRequest)) throw new TypeError();
      if (recordedStatus !== null) {
        const pair = recordedStatus.reads[index];
        if (
          !pair ||
          pair.attempt !== attempt.number ||
          !same(attempt.read, {
            request: pair.request,
            transport: pair.transport,
            ...pair.derivation,
          })
        )
          throw new TypeError();
        consumedReads++;
        lastRead =
          pair.derivation.kind === 'returned' && pair.derivation.status.kind === 'returned'
            ? pair.derivation.status.value
            : '';
      } else if (attempt.read.kind === 'threw') {
        exactKeys(attempt.read, ['kind', 'request', 'name', 'message', 'code']);
        errorData(attempt.read);
        lastRead = '';
      } else {
        exactKeys(attempt.read, ['kind', 'request', 'response']);
        if (attempt.read.kind !== 'returned') throw new TypeError();
        const data = attempt.read.response;
        exactKeys(data, ['repository']);
        exactKeys(data.repository, ['issue']);
        exactKeys(data.repository.issue, ['projectItems']);
        exactKeys(data.repository.issue.projectItems, ['nodes']);
        const nodes = data.repository.issue.projectItems.nodes;
        // First fixed board frontier has one configured project. Other native
        // memberships require their complete retained source, never invention.
        if (!Array.isArray(nodes) || nodes.length > 1) throw new TypeError();
        for (const node of nodes) {
          exactKeys(node, ['project', 'fieldValueByName']);
          exactKeys(node.project, ['id']);
          if (node.project.id !== intent.projectId) throw new TypeError();
          if (node.fieldValueByName !== null) {
            exactKeys(node.fieldValueByName, ['optionId']);
            if (!(
              node.fieldValueByName.optionId === null ||
              typeof node.fieldValueByName.optionId === 'string'
            ))
              throw new TypeError();
          }
        }
        lastRead = statusOptionFromData(data, intent.projectId);
      }
      if (attempt.after === null) {
        if (!last) throw new TypeError();
        pending = true;
        break;
      }
      if (!same(attempt.after, attempt.before) && !same(attempt.after, after))
        throw new TypeError();
      current = attempt.after;
      pending = false;
      if (lastRead === intent.optionId && (!last || !same(current, after))) throw new TypeError();
    }
    const count = step.attempts.length;
    if (step.outcome !== null) {
      exactKeys(step.outcome, ['kind', 'attempt', 'exit']);
      if (pending || count === 0 || step.outcome.attempt !== count) throw new TypeError();
      if (step.outcome.kind === 'confirmed') {
        if (
          thrown ||
          lastRead !== intent.optionId ||
          step.outcome.exit !== null ||
          !same(current, after)
        )
          throw new TypeError();
      } else if (step.outcome.kind === 'unconfirmed') {
        if (
          thrown ||
          count !== STATUS_WRITE_MAX_ATTEMPTS ||
          lastRead === intent.optionId ||
          step.outcome.exit !== STATUS_WRITE_READBACK_EXIT
        )
          throw new TypeError();
      } else if (step.outcome.kind === 'exception') {
        if (!thrown || step.outcome.exit !== null) throw new TypeError();
      } else throw new TypeError();
    }
    if (
      recordedStatus !== null &&
      ['confirmed', 'unconfirmed'].includes(step.outcome?.kind) &&
      consumedReads !== recordedStatus.reads.length
    )
      throw new TypeError();
    if (step.readback !== null) {
      if (step.outcome?.kind !== 'confirmed' || !same(step.readback, { attempt: count, ...after }))
        throw new TypeError();
    }
    const lastAttempt = step.attempts.at(-1);
    const prefixes = !lastAttempt
      ? [before]
      : lastAttempt.after === null
        ? [lastAttempt.before, after]
        : [current];
    return Object.freeze({
      before: structuredClone(before),
      after,
      current: structuredClone(current),
      prefixes: structuredClone(prefixes),
      confirmed: step.readback !== null,
      stepHash: hashBytes(canonicalRecordJson(step)),
    });
  } catch {
    revisionError('native-stage-board-step');
  }
}

export async function reconstructNativeStageBoard(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['header', 'steps'], 'native-stage-board');
  const { header, steps } = input;
  if (steps.length !== 14) revisionError('native-stage-board-prefix');
  validateNativeStageJournal({ schema: 'aitm.native-stage/v1', header, steps });
  const entry = await reconstructNativeStageEntryBody({ header, steps: steps.slice(0, 13) });
  const h = header.intent;
  let sourceInput = {};
  if (Object.hasOwn(header.guardCapture.lifecycleSources.remote, 'stageStatus')) {
    const { deriveRecordedStageSources } = await import('./native-stage-data.mjs');
    const { config } = deriveRecordedStageSources(header.guardCapture.sources);
    if (config.projectId !== h.projectId) revisionError('native-stage-board');
    sourceInput = {
      statusSource: {
        observation: header.original.observation,
        lifecycleSources: header.guardCapture.lifecycleSources,
        projectId: config.projectId,
      },
    };
  }
  const derived = await reconstructNativeStageBoardStep({
    repository: header.scope.repository,
    issue: header.scope.issue,
    sourceOptionId: h.sourceOptionId,
    intent: {
      projectId: h.projectId,
      itemId: h.itemId,
      fieldId: h.statusFieldId,
      optionId: h.targetOptionId,
    },
    before: { stage: header.original.observation.stage, membership: entry.resources.membership },
    previous: hashBytes(canonicalRecordJson(steps[12])),
    step: steps[13],
    ...sourceInput,
  });
  const afterResources = structuredClone(entry.resources);
  afterResources.membership = structuredClone(derived.after.membership);
  return {
    body: entry.afterBody,
    beforeResources: entry.resources,
    afterResources,
    beforeStage: derived.before.stage,
    afterStage: derived.after.stage,
    confirmed: derived.confirmed,
    beforeRecognized: derived.prefixes.some((value) => same(value, derived.before)),
    afterRecognized: derived.prefixes.some((value) => same(value, derived.after)),
  };
}

// Closed sentinel DATA from the same complete board predecessor. No current
// input membership, persistence, policy admission or effect is established here.
export async function reconstructNativeStageSentinel(input) {
  const detached = JSON.parse(canonicalRecordJson(input));
  exactKeys(detached, ['header', 'steps'], 'native-stage-sentinel');
  const { header, steps } = detached;
  if (steps.length !== 15) revisionError('native-stage-sentinel-prefix');
  validateNativeStageJournal({ schema: 'aitm.native-stage/v1', header, steps });
  const board = await reconstructNativeStageBoard({ header, steps: steps.slice(0, 14) });
  if (!board.confirmed) revisionError('native-stage-sentinel-board');
  const derived = reconstructNativeStageBodyStep({
    repository: header.scope.repository,
    issue: header.scope.issue,
    transitionId: header.intent.transitionId,
    body: board.body.bytes,
    ordinal: 15,
    previous: hashBytes(canonicalRecordJson(steps[13])),
    step: steps[14],
  });
  return freezeStageData({
    beforeBody: structuredClone(board.body),
    afterBody: { bytes: derived.afterBody, version: parseBodyVersion(derived.afterBody) },
    resources: structuredClone(board.afterResources),
    stage: board.afterStage,
    readbackBody: derived.readbackBody,
  });
}

// Complete transition-comment DATA. Detach actual canonical input before any
// import/replay await. No supplied allocation, current result or token is trusted.
export async function deriveRecordedNativeTransitionComment(input) {
  const detached = JSON.parse(canonicalRecordJson(input));
  exactKeys(detached, ['header', 'steps'], 'native-stage-transition-source');
  const { header, steps } = detached;
  if (steps.length !== 15 || steps[14].readback === null)
    revisionError('native-stage-transition-predecessor');
  const sentinel = await reconstructNativeStageSentinel({ header, steps });
  const { serializeEntryMarker } = await import('../stage-entry-grammar.mjs');
  const { readMoveCompleteMarker } = await import('../move-state/sentinel.mjs');
  const { deriveRecordedTransitionActor } = await import('../move-state/transition-commit.mjs');
  const { canonicalLogin } = await import('../ownership-policy.mjs');
  const { assertNativeLifecycleSourceData } = await import('./store.mjs');
  assertNativeLifecycleSourceData({
    source: header.guardCapture.lifecycleSources,
    observation: header.original.observation,
  });
  const actor = deriveRecordedTransitionActor(header.original.actor.environment);
  const marker = readMoveCompleteMarker(sentinel.afterBody.bytes);
  const entry = steps[12].intent;
  if (
    actor !== header.intent.actor ||
    marker?.state !== header.intent.target ||
    marker.move !== header.intent.transitionId ||
    marker.ts !== steps[14].intent.ts
  )
    revisionError('native-stage-transition-source');
  const visitMarker = serializeEntryMarker({
    state: header.intent.target,
    visit: entry.visit,
    ts: entry.entryTs,
    move: header.intent.transitionId,
  });
  const record = deriveTransitionCommitRecord({
    transitionId: header.intent.transitionId,
    repository: header.scope.repository,
    issue: header.scope.issue,
    source: 'develop',
    target: 'test',
    visitMarker,
    actor,
    sentinelMarker: marker.match,
  });
  const body = renderTransitionCommitComment(record);
  const identity = header.guardCapture.lifecycleSources.remote.identity;
  if (identity.response.exitCode !== 0 || identity.response.stderr !== '')
    revisionError('native-stage-transition-identity');
  const login = identity.response.stdout.trim();
  if (!canonicalLogin(login)) revisionError('native-stage-transition-identity');
  const beforeResources = structuredClone(sentinel.resources);
  nativeStageTimingPages({
    repository: header.scope.repository,
    issue: header.scope.issue,
    comments: beforeResources.comments,
  });
  const next = Math.max(0, ...beforeResources.comments.map((value) => Number(value.id))) + 1;
  const nodeId = `IC_memory_stage_${header.id.slice(7)}_16`;
  if (
    !Number.isSafeInteger(next) ||
    next < 1 ||
    beforeResources.comments.some((value) => value.nodeId === nodeId)
  )
    revisionError('native-stage-transition-allocation');
  const commentBytes = JSON.stringify({
    id: next,
    node_id: nodeId,
    issue_url: `https://api.github.com/repos/${header.scope.repository}/issues/${header.scope.issue}`,
    body,
    user: { login },
  });
  const intent = { record, commentId: String(next), nodeId, commentBytes };
  const afterResources = structuredClone(beforeResources);
  afterResources.comments.push({ id: String(next), nodeId, bytes: commentBytes });
  nativeStageTimingPages({
    repository: header.scope.repository,
    issue: header.scope.issue,
    comments: afterResources.comments,
  });
  return freezeStageData({
    intent,
    beforeResources,
    afterResources,
    body: sentinel.afterBody,
    stage: sentinel.stage,
    commentBody: body,
  });
}

export async function reconstructNativeStageTransitionComment(input) {
  const detached = JSON.parse(canonicalRecordJson(input));
  exactKeys(detached, ['header', 'steps'], 'native-stage-transition-comment');
  const { header, steps } = detached;
  if (steps.length !== 16) revisionError('native-stage-transition-prefix');
  validateNativeStageJournal({ schema: 'aitm.native-stage/v1', header, steps });
  const derived = await deriveRecordedNativeTransitionComment({
    header,
    steps: steps.slice(0, 15),
  });
  const step = steps[15];
  if (!same(step.intent, derived.intent)) revisionError('native-stage-transition-intent');
  const body = reconstructNativeStageTransitionStep({
    repository: header.scope.repository,
    issue: header.scope.issue,
    transitionId: header.intent.transitionId,
    actor: header.intent.actor,
    visitMarker: derived.intent.record.visitMarker,
    sentinelMarker: (await import('../move-state/sentinel.mjs')).readMoveCompleteMarker(
      derived.body.bytes
    ).match,
    ordinal: 16,
    previous: hashBytes(canonicalRecordJson(steps[14])),
    step: {
      ordinal: 16,
      kind: 'transition-comment',
      previous: step.previous,
      intent: { record: step.intent.record },
      readback:
        step.readback === null
          ? null
          : {
              create: step.readback.create,
              read: step.readback.read,
            },
    },
  });
  if (body.body !== derived.commentBody) revisionError('native-stage-transition-body');
  if (
    step.readback !== null &&
    (step.readback.create.response.stdout !== derived.intent.commentBytes ||
      step.readback.read.response.stdout !== derived.intent.commentBytes ||
      body.commentId !== derived.intent.commentId ||
      !same(step.readback.census, derived.afterResources.comments))
  )
    revisionError('native-stage-transition-readback');
  return freezeStageData({
    ...derived,
    complete: step.readback !== null,
    stepHash: hashBytes(canonicalRecordJson(step)),
  });
}

// @story #1855 — original Test legacy onEnter program has no actions. This
// historical DATA comparison does not authorize a current invocation.
export async function reconstructNativeStageTailDispatch(input) {
  const detached = JSON.parse(canonicalRecordJson(input));
  exactKeys(detached, ['header', 'steps'], 'native-stage-tail-dispatch');
  const { header, steps } = detached;
  if (steps.length !== 17) revisionError('native-stage-tail-dispatch-prefix');
  validateNativeStageJournal({ schema: 'aitm.native-stage/v1', header, steps });
  const predecessor = await reconstructNativeStageTransitionComment({
    header,
    steps: steps.slice(0, 16),
  });
  if (!predecessor.complete) revisionError('native-stage-tail-dispatch-predecessor');
  const readback = {
    actions: [],
    resources: predecessor.afterResources,
    body: predecessor.body,
    stage: predecessor.stage,
  };
  if (steps[16].readback !== null && !same(steps[16].readback, readback))
    revisionError('native-stage-tail-dispatch-readback');
  return freezeStageData({ ...readback, complete: steps[16].readback !== null });
}

// Closed compensation DATA; neither this parser nor a copied journal grants
// invocation, lock or intent-read membership. The ordered fold proves origin.
function validateNativeCompensationData(value, header, steps) {
  canonicalRecordJson(value);
  exactKeys(value, ['schema', 'previous', 'intent', 'attempts', 'readback', 'audit', 'result']);
  if (
    value.schema !== 'aitm.native-compensation/v1' ||
    steps.length !== 14 ||
    steps[13].outcome?.kind !== 'unconfirmed' ||
    steps[13].readback !== null ||
    value.previous !== hashBytes(canonicalRecordJson(steps[13]))
  )
    revisionError('native-stage-compensation-data');
  exactKeys(value.intent, ['priorState', 'stateTs']);
  if (
    value.intent.priorState !== header.intent.source ||
    value.intent.priorState !== 'develop' ||
    typeof value.intent.stateTs !== 'string' ||
    !Number.isFinite(Date.parse(value.intent.stateTs)) ||
    new Date(value.intent.stateTs).toISOString() !== value.intent.stateTs ||
    Date.parse(value.intent.stateTs) < Date.parse(steps[12].intent.stateTs) ||
    !Array.isArray(value.attempts) ||
    value.attempts.length > 2
  )
    revisionError('native-stage-compensation-data');
  const body = (v) => {
    exactKeys(v, ['bytes', 'version']);
    if (typeof v.bytes !== 'string' || v.version !== parseBodyVersion(v.bytes))
      revisionError('native-stage-compensation-data');
  };
  const returned = (v) => {
    if (v.kind === 'returned') exactKeys(v, ['kind']);
    else {
      exactKeys(v, ['kind', 'name', 'message', 'code']);
      if (
        v.kind !== 'threw' ||
        typeof v.name !== 'string' ||
        typeof v.message !== 'string' ||
        !(v.code === null || typeof v.code === 'string' || Number.isSafeInteger(v.code))
      )
        revisionError('native-stage-compensation-data');
    }
  };
  for (const [index, attempt] of value.attempts.entries()) {
    exactKeys(attempt, ['number', 'request', 'before', 'write', 'after']);
    if (attempt.number !== index + 1) revisionError('native-stage-compensation-data');
    exactKeys(attempt.request, ['kind', 'input']);
    exactKeys(attempt.request.input, ['issueNumber', 'repo', 'body']);
    body(attempt.before);
    if (attempt.write !== null) returned(attempt.write);
    if (attempt.after !== null) body(attempt.after);
    if (attempt.write === null && attempt.after !== null)
      revisionError('native-stage-compensation-data');
  }
  if (value.audit !== null) {
    exactKeys(value.audit, ['request', 'intent', 'write', 'readback']);
    exactKeys(value.audit.request, ['kind', 'input']);
    exactKeys(value.audit.request.input, ['issueNumber', 'repo', 'body']);
    exactKeys(value.audit.intent, ['id', 'nodeId', 'bytes']);
    if (value.audit.write !== null) returned(value.audit.write);
    if (value.audit.readback !== null) exactKeys(value.audit.readback, ['resource']);
  }
  if (value.result !== null) {
    const result = value.result;
    exactKeys(
      result,
      result.status === 'failed'
        ? ['status', 'attempts', 'error', 'auditPosted']
        : ['status', 'attempts']
    );
    if (
      !['ok', 'failed'].includes(result.status) ||
      result.attempts !== value.attempts.length ||
      result.attempts < 1 ||
      result.attempts > 2 ||
      (result.status === 'failed' &&
        (typeof result.error !== 'string' || typeof result.auditPosted !== 'boolean'))
    )
      revisionError('native-stage-compensation-data');
  }
}

export async function reconstructNativeStageCompensation(input) {
  try {
    const detached = JSON.parse(canonicalRecordJson(input));
    exactKeys(detached, ['header', 'steps', 'compensation']);
    const { header, steps, compensation: c } = detached;
    validateNativeStageJournal({ schema: 'aitm.native-stage/v1', header, steps, compensation: c });
    const board = await reconstructNativeStageBoard({ header, steps });
    if (!board.beforeRecognized && !board.afterRecognized) throw new TypeError();
    const beforeBody = board.body;
    const afterBytes = deriveRecordedStageBody({
      body: beforeBody.bytes,
      transitionId: header.intent.transitionId,
      intent: { kind: 'rollback-state', ...c.intent },
    });
    const afterBody = { bytes: afterBytes, version: parseBodyVersion(afterBytes) };
    const writeRequest = {
      kind: 'write-body',
      input: {
        issueNumber: String(header.scope.issue),
        repo: header.scope.repository,
        body: afterBytes,
      },
    };
    let current = beforeBody;
    for (const [index, attempt] of c.attempts.entries()) {
      if (
        !same(attempt.request, writeRequest) ||
        !same(attempt.before, current) ||
        (index > 0 && c.attempts[index - 1].write?.kind !== 'threw')
      )
        throw new TypeError();
      if (attempt.write === null) {
        if (index !== c.attempts.length - 1) throw new TypeError();
      } else {
        if (
          attempt.after === null ||
          (!same(attempt.after, attempt.before) && !same(attempt.after, afterBody)) ||
          (attempt.write.kind === 'returned' && !same(attempt.after, afterBody))
        )
          throw new TypeError();
        current = attempt.after;
      }
    }
    const last = c.attempts.at(-1);
    if (c.readback !== null) {
      const step = {
        ordinal: 15,
        kind: 'rollback-state',
        previous: c.previous,
        intent: c.intent,
        readback: c.readback,
      };
      const actual = reconstructNativeStageBodyStep({
        repository: header.scope.repository,
        issue: header.scope.issue,
        transitionId: header.intent.transitionId,
        body: beforeBody.bytes,
        ordinal: 15,
        previous: c.previous,
        step,
      });
      if (
        actual.readbackBody !== afterBytes ||
        !last ||
        !c.attempts.some(
          (attempt) =>
            ['returned', 'threw'].includes(attempt.write?.kind) && same(attempt.after, afterBody)
        ) ||
        !same(current, afterBody)
      )
        throw new TypeError();
    }
    const resources = structuredClone(
      board.afterRecognized ? board.afterResources : board.beforeResources
    );
    const afterResources = structuredClone(resources);
    if (c.audit !== null) {
      if (c.attempts.length !== 2 || last?.write?.kind !== 'threw') throw new TypeError();
      const a = c.audit;
      const expectedBody = [
        '> ⚠ state-recording-failed',
        '',
        `Marker rollback to \`${c.intent.priorState}\` failed after 2 attempts. Board Status was not confirmed; the actual board and marker resources remain pending recovery.`,
        '',
        `Error: \`${last.write.message}\``,
        '',
        '<!-- aitm-state-recording-failed -->',
      ].join('\n');
      if (
        !same(a.request, {
          kind: 'post-comment',
          input: {
            issueNumber: String(header.scope.issue),
            repo: header.scope.repository,
            body: expectedBody,
          },
        })
      )
        throw new TypeError();
      const next = String(Math.max(0, ...resources.comments.map((v) => Number(v.id))) + 1);
      const nodeId = 'IC_memory_compensation_' + header.id.slice(7);
      const comment = {
        id: Number(next),
        node_id: nodeId,
        issue_url: `https://api.github.com/repos/${header.scope.repository}/issues/${header.scope.issue}`,
        body: expectedBody,
        user: {
          login: header.guardCapture.lifecycleSources.remote.identity.response.stdout.trim(),
        },
      };
      const intended = { id: next, nodeId, bytes: JSON.stringify(comment) };
      if (!same(a.intent, intended)) throw new TypeError();
      afterResources.comments.push(structuredClone(intended));
      if (
        a.readback !== null &&
        (a.write?.kind !== 'returned' || !same(a.readback.resource, intended))
      )
        throw new TypeError();
    }
    if (c.result !== null) {
      if (c.result.status === 'ok') {
        if (c.readback === null || last?.write?.kind !== 'returned' || c.audit !== null)
          throw new TypeError();
      } else if (
        c.attempts.length !== 2 ||
        last?.write?.kind !== 'threw' ||
        c.result.error !== last.write.message ||
        (c.result.auditPosted && (c.audit === null || c.audit.readback === null))
      )
        throw new TypeError();
    }
    return {
      beforeBody,
      afterBody,
      bodyPrefixes: last?.write === null ? [current, afterBody] : [current],
      beforeResources: resources,
      afterResources,
      stage: board.afterRecognized ? board.afterStage : board.beforeStage,
    };
  } catch {
    revisionError('native-stage-compensation');
  }
}

// #1913 — closed original cache DATA, never execution or lock membership.
export async function reconstructNativeStageTailCache(input) {
  try {
    const detached = JSON.parse(canonicalRecordJson(input));
    exactKeys(detached, ['header', 'steps']);
    const { header, steps } = detached;
    if (steps.length !== 18) throw new TypeError();
    validateNativeStageJournal({ schema: 'aitm.native-stage/v1', header, steps });
    const before = await reconstructNativeStageTailDispatch({ header, steps: steps.slice(0, 17) });
    if (!before.complete) throw new TypeError();
    const { deriveRecordedNativeLocalTail } = await import('../move-state/cache-unpark.mjs');
    const actor = header.original.actor;
    const projected = deriveRecordedNativeLocalTail({
      kind: 'refreshKanbanStateCache',
      issue: String(header.scope.issue),
      projectDir: header.original.observation.executor.worktree,
      statePath: actor.capture.statePath,
      identity: actor.identity,
      boundAt: null,
      local: before.resources.local,
    });
    const step = steps[17];
    const { activeTaskPath } = await import('../../paths.mjs');
    const file = activeTaskPath(actor.identity.sid, actor.capture.projectDir);
    const intent = {
      file,
      sid: actor.identity.sid,
      beforeBytes: before.resources.local.activeTask?.bytes ?? null,
      bytes: projected.local.activeTask?.bytes ?? null,
      operations: projected.operations,
    };
    if (!same(step.intent, intent)) throw new TypeError();
    const afterResources = structuredClone(before.resources);
    afterResources.local = structuredClone(projected.local);
    const readback = {
      file,
      bytes: intent.bytes,
      resources: afterResources,
      body: before.body,
      stage: before.stage,
    };
    if (step.readback !== null && !same(step.readback, readback)) throw new TypeError();
    return freezeStageData({
      beforeResources: before.resources,
      afterResources,
      body: before.body,
      stage: before.stage,
      intent,
      readback,
      complete: step.readback !== null,
    });
  } catch {
    revisionError('native-stage-tail-cache');
  }
}

// @story #1924 — detached historical facts only, never current authority.
export async function deriveRecordedNativeStagePartialFacts(input) {
  const detached = JSON.parse(canonicalRecordJson(input));
  exactKeys(detached, ['journal'], 'native-stage-partial-data');
  const journal = detached.journal;
  validateNativeStageJournal(journal);
  const { header, steps } = journal;
  let boardMoved = false,
    sentinelPresent = false,
    transitionCommitPresent = false;
  if (steps.length >= 14) {
    const board = await reconstructNativeStageBoard({ header, steps: steps.slice(0, 14) });
    boardMoved = board.confirmed && steps[13].readback !== null;
  }
  if (steps.length >= 15) {
    await reconstructNativeStageSentinel({ header, steps: steps.slice(0, 15) });
    sentinelPresent = boardMoved && steps[14].readback !== null;
  }
  if (steps.length >= 16) {
    const comment = await reconstructNativeStageTransitionComment({
      header,
      steps: steps.slice(0, 16),
    });
    transitionCommitPresent = sentinelPresent && comment.complete;
  }
  return Object.freeze({
    itemId: boardMoved ? header.intent.itemId : '',
    boardMoved,
    sentinelPresent,
    transitionCommitPresent,
    transitionCommitId: transitionCommitPresent ? steps[15].intent.commentId : null,
  });
}

// @story #1915 — historical completed-prefix inputs only, never runtime admission.
export async function deriveRecordedNativeStageKnownPrefix(input) {
  try {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype)
      revisionError('native-stage-known-prefix');
    const keys = ['journal', 'resources', 'body', 'stage', 'executor'];
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (
      Reflect.ownKeys(descriptors).length !== keys.length ||
      keys.some(
        (key) =>
          !descriptors[key] ||
          !Object.hasOwn(descriptors[key], 'value') ||
          !descriptors[key].enumerable
      )
    )
      revisionError('native-stage-known-prefix');
    const detached = JSON.parse(canonicalRecordJson(input));
    const { journal, resources, body, stage, executor } = detached;
    validateNativeStageJournal(journal);
    const { header, steps } = journal,
      ordinal = steps.length;
    if (
      ordinal > 16 ||
      Object.hasOwn(journal, 'compensation') ||
      steps.some((step) => step.readback === null) ||
      !same(executor, header.scope.executor)
    )
      revisionError('native-stage-known-prefix');
    const origin = header.original.observation;
    validateRevisionObservation(origin);
    exactKeys(
      header.scope,
      ['repository', 'issue', 'domain', 'executor'],
      'native-stage-known-prefix'
    );
    exactKeys(
      header.intent,
      [
        'source',
        'target',
        'transitionId',
        'actor',
        'provider',
        'sessionId',
        'projectId',
        'itemId',
        'statusFieldId',
        'sourceOptionId',
        'targetOptionId',
        'tailProfile',
      ],
      'native-stage-known-prefix'
    );
    const moveId = new RegExp(
      '^move:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    );
    const actor = header.original.actor;
    if (
      origin.sourceKind !== 'legacy-body' ||
      origin.stage !== 'develop' ||
      origin.issueState !== 'open' ||
      !same(header.scope, {
        repository: origin.repository,
        issue: origin.issue,
        domain: origin.writerDomain,
        executor: origin.executor,
      }) ||
      header.intent.source !== 'develop' ||
      header.intent.target !== 'test' ||
      header.intent.tailProfile !== 'task-owner' ||
      typeof header.intent.transitionId !== 'string' ||
      !moveId.test(header.intent.transitionId) ||
      typeof actor.capture.ts !== 'string' ||
      !Number.isFinite(Date.parse(actor.capture.ts)) ||
      new Date(actor.capture.ts).toISOString() !== actor.capture.ts ||
      header.intent.provider !== actor.identity.provider ||
      header.intent.sessionId !== actor.identity.sid ||
      actor.identity.sid !== origin.executor.sessionId ||
      [
        'actor',
        'provider',
        'sessionId',
        'projectId',
        'itemId',
        'statusFieldId',
        'sourceOptionId',
        'targetOptionId',
      ].some((key) => typeof header.intent[key] !== 'string' || !header.intent[key])
    )
      revisionError('native-stage-known-prefix');
    let expectedResources = structuredClone(header.original.resources);
    let expectedBody = structuredClone(header.original.observation.body);
    let expectedStage = header.original.observation.stage;
    if (ordinal === 1) expectedResources.local.actorFlush = { bytes: steps[0].intent.journalBytes };
    else if (ordinal === 2)
      expectedResources = (
        await reconstructNativeStageActorTiming({ header, first: steps[0], step: steps[1] })
      ).afterResources;
    else if (ordinal === 3)
      expectedResources = (
        await reconstructNativeStageActorCursor({
          header,
          first: steps[0],
          second: steps[1],
          step: steps[2],
        })
      ).afterResources;
    else if ([4, 5, 6, 8, 9, 10].includes(ordinal))
      expectedResources = (await reconstructNativeStageCheckpointSteps({ header, steps }))
        .afterResources;
    else if (ordinal === 7)
      expectedResources = (await reconstructNativeStageActorRemoval({ header, steps }))
        .afterResources;
    else if ([11, 12].includes(ordinal))
      expectedResources = (await reconstructNativeStagePhaseTiming({ header, steps }))
        .afterResources;
    else if (ordinal === 13) {
      const entry = await reconstructNativeStageEntryBody({ header, steps });
      expectedResources = entry.resources;
      expectedBody = entry.afterBody;
    } else if (ordinal === 14) {
      const board = await reconstructNativeStageBoard({ header, steps });
      if (!board.confirmed) revisionError('native-stage-known-prefix');
      expectedResources = board.afterResources;
      expectedBody = board.body;
      expectedStage = board.afterStage;
    } else if (ordinal === 15) {
      const sentinel = await reconstructNativeStageSentinel({ header, steps });
      expectedResources = sentinel.resources;
      expectedBody = sentinel.afterBody;
      expectedStage = sentinel.stage;
    } else if (ordinal === 16) {
      const comment = await reconstructNativeStageTransitionComment({ header, steps });
      if (!comment.complete) revisionError('native-stage-known-prefix');
      expectedResources = comment.afterResources;
      expectedBody = comment.body;
      expectedStage = comment.stage;
    }
    if (!same(resources, expectedResources) || !same(body, expectedBody) || stage !== expectedStage)
      revisionError('native-stage-known-prefix');
    return Object.freeze({
      ordinal,
      nextOrdinal: ordinal + 1,
      transitionId: header.intent.transitionId,
      actorClock: header.original.actor.capture.ts,
    });
  } catch {
    revisionError('native-stage-known-prefix');
  }
}
