import {
  publicationForecastTransitionUsable,
  publicationProposalMatchesAuthority,
} from './decomposition-publication-inputs.mjs';
// @story #1987 — privately owned assessment mutation and exact read-back.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID, createHash } from 'node:crypto';
import { withIssueLock, currentIssueLockOwner } from '../issue-mutator-lock.mjs';
import { findMainWorktreePath } from '../fleet-registry.mjs';
import {
  canonicalDecompositionJson,
  validateDecompositionPublication,
  assessDecomposition,
} from './decomposition-assessment.mjs';
import { readDecompositionRecords, replaceDecompositionRecords } from './decomposition-records.mjs';
const owned = new WeakSet();
const capabilities = new WeakSet();
const active = new AsyncLocalStorage();
const publicationReconciliation = new WeakMap();
const sha = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : canonicalDecompositionJson(value))
    .digest('hex');
const same = (a, b) => canonicalDecompositionJson(a) === canonicalDecompositionJson(b);
function refuse(reason) {
  throw new Error(`decomposition:${reason}`);
}
export function validateDecompositionAdvance({
  markerId,
  baseBody,
  nextBody,
  decompositionMutationCapability,
  issueNumber,
  repo,
}) {
  const cap = decompositionMutationCapability;
  if (
    !cap ||
    !capabilities.has(cap) ||
    !owned.has(cap.context) ||
    active.getStore() !== cap.context
  )
    refuse('mutation-capability');
  const ctx = cap.context;
  if (
    currentIssueLockOwner(ctx.subject.issue) !== ctx.lockOwner ||
    ctx.subject.issue !== Number(issueNumber) ||
    ctx.subject.repository !== String(repo).toLowerCase()
  )
    refuse('mutation-owner');
  if (
    !['refresh', 'owner'].includes(ctx.role) ||
    (ctx.role === 'refresh' && markerId !== 'aitm-decomposition-assessment')
  )
    refuse('mutation-operation');
  const before = readDecompositionRecords(String(baseBody));
  const after = readDecompositionRecords(String(nextBody));
  if (
    sha(before) !== cap.beforeDigest ||
    sha(after) !== cap.afterDigest ||
    (ctx.role === 'refresh' && !same(before.publication, after.publication)) ||
    !after.assessment ||
    !same(after.assessment.subject, ctx.subject)
  )
    refuse('mutation-drift');
}
export async function refreshDecompositionProjection({
  subject,
  cfg,
  projectDir,
  deps = {},
  context,
} = {}) {
  if (
    context !== undefined &&
    context !== null &&
    (!owned.has(context) || active.getStore() !== context || !same(context.subject, subject))
  )
    refuse('foreign-context');
  const main = (deps.findMainWorktreePath ?? findMainWorktreePath)(projectDir);
  return withIssueLock(
    { issue: subject.issue, verb: 'decomposition-refresh', projDir: main },
    async () => {
      const lockOwner = currentIssueLockOwner(subject.issue);
      if (!lockOwner || lockOwner.projDir !== main) refuse('lock-owner');
      const { collectDecompositionAuthority } = await import('./decomposition-authority.mjs');
      const collected = await collectDecompositionAuthority({ subject, cfg, projectDir, deps });
      if (collected.projection.status === 'malformed') refuse(collected.projection.diagnostic);
      if (collected.input.availability.status !== 'complete') refuse('authority-unavailable');
      const ctx = Object.freeze({
        subject: collected.input.subject,
        operationId: randomUUID(),
        role: 'refresh',
        lockOwner,
      });
      owned.add(ctx);
      try {
        return await active.run(ctx, async () => {
          const before = {
            assessment:
              collected.sourceObservations.readIssue.status === 'observed'
                ? readDecompositionRecords(collected.sourceObservations.readIssue.value.body)
                    .assessment
                : null,
            publication: collected.publication,
          };
          const after = { assessment: collected.assessment, publication: collected.publication };
          const cap = Object.freeze({
            context: ctx,
            beforeDigest: sha(before),
            afterDigest: sha(after),
          });
          capabilities.add(cap);
          const { mutateIssueBody } = await import('./issue-body-mutate.mjs');
          try {
            await (deps.mutateIssueBody ?? mutateIssueBody)({
              issueNumber: subject.issue,
              repo: subject.repository,
              deps,
              allowMarkerAdvance: ['aitm-decomposition-assessment'],
              decompositionMutationCapability: cap,
              validateFreshBaseAsync: async (base) => {
                const issue = { number: subject.issue, body: base };
                const fresh = await collectDecompositionAuthority({
                  subject,
                  cfg,
                  projectDir,
                  deps: {
                    ...deps,
                    readIssue: async () => ({
                      status: 'observed',
                      value: issue,
                      revision: null,
                      digest: sha(issue),
                    }),
                  },
                });
                if (
                  fresh.inputDigest !== collected.inputDigest ||
                  fresh.projection.status === 'malformed'
                )
                  refuse('semantic-drift');
              },
              mutate: (base) => replaceDecompositionRecords(base, after),
            });
          } finally {
            capabilities.delete(cap);
          }
          let readBack;
          try {
            readBack = deps.readBackIssue
              ? await deps.readBackIssue({ subject, cfg, projectDir })
              : await (
                  await import('../../gh/lib/github-projects.mjs')
                )
                  .gh([
                    'issue',
                    'view',
                    String(subject.issue),
                    '--repo',
                    subject.repository,
                    '--json',
                    'number,body',
                  ])
                  .then((s) => {
                    const value = JSON.parse(s);
                    return { status: 'observed', value, digest: sha(value) };
                  });
          } catch {
            return { ...collected, status: 'unconfirmed' };
          }
          try {
            if (
              readBack.status !== 'observed' ||
              readBack.digest !== sha(readBack.value) ||
              readBack.value.number !== subject.issue ||
              !same(readDecompositionRecords(readBack.value.body), after)
            )
              return { ...collected, status: 'unconfirmed' };
          } catch {
            return { ...collected, status: 'unconfirmed' };
          }
          const current = await collectDecompositionAuthority({ subject, cfg, projectDir, deps });
          if (
            current.inputDigest !== collected.inputDigest ||
            current.projection.status !== 'current'
          )
            return { ...current, status: 'unconfirmed' };
          return { ...current, status: 'confirmed' };
        });
      } finally {
        owned.delete(ctx);
        publicationReconciliation.delete(ctx);
      }
    }
  );
}

export const DECOMPOSITION_AUTHORITY_CONTEXT_EFFECT_ID = 'authority-context';
function authorityContextValue(input) {
  return {
    subject: input.subject,
    scopeDigest: input.scopeDigest,
    kind: input.kind,
    policyDigest: input.policy.digest,
  };
}
export function decompositionPublicationContextDigest(input) {
  return sha(authorityContextValue(input));
}
function usableForReconciliation(current) {
  return (
    current.projection.status !== 'malformed' &&
    current.input.availability.reasons.every((reason) => reason === 'authority-conflict')
  );
}
export async function assertDecompositionPublicationOwner(
  context,
  { subject, operationId, writerId, effectId, requireIntent = false } = {}
) {
  if (
    !context ||
    !owned.has(context) ||
    active.getStore() !== context ||
    context.role !== 'owner' ||
    currentIssueLockOwner(context.subject.issue) !== context.lockOwner ||
    (subject && !same(subject, context.subject)) ||
    (operationId && operationId !== context.operationId) ||
    (writerId && writerId !== context.writerId) ||
    (effectId && !context.effectIds.includes(effectId))
  )
    refuse('owner-context');
  if (requireIntent && !context.intentConfirmed) refuse('publication-intent');
  const current = await context.collectCurrent();
  if (
    !(await (publicationReconciliation.get(context)?.(current) ??
      Promise.resolve(usableForReconciliation(current)))) ||
    decompositionPublicationContextDigest(current.input) !== context.authorityContextDigest
  )
    refuse('semantic-context-drift');
  if (requireIntent) {
    const pub = current.publication;
    const binding = pub?.effects.find(
      (effect) => effect.id === DECOMPOSITION_AUTHORITY_CONTEXT_EFFECT_ID
    );
    if (
      pub?.operationId !== context.operationId ||
      pub.status !== 'pending' ||
      binding?.status !== 'confirmed' ||
      binding.intendedDigest !== context.authorityContextDigest ||
      binding.observedDigest !== context.authorityContextDigest
    )
      refuse('publication-intent');
  }
  return context;
}
function sealedPublication(publication) {
  return structuredClone({
    subject: publication.subject,
    operationId: publication.operationId,
    writerId: publication.writerId,
    beforeInputDigest: publication.beforeInputDigest,
    intendedInputDigest: publication.intendedInputDigest,
    proposal: publication.proposal,
    effects: publication.effects.map(({ id, resource, targetIdentity, intendedDigest }) => ({
      id,
      resource,
      targetIdentity,
      intendedDigest,
    })),
    supersedes: publication.supersedes,
    createdAt: publication.createdAt,
  });
}
async function exactReadBack({ subject, cfg, projectDir, deps }, expected) {
  let result;
  try {
    result = deps.readBackIssue
      ? await deps.readBackIssue({ subject, cfg, projectDir })
      : await (
          await import('../../gh/lib/github-projects.mjs')
        )
          .gh([
            'issue',
            'view',
            String(subject.issue),
            '--repo',
            subject.repository,
            '--json',
            'number,body',
          ])
          .then((bytes) => {
            const value = JSON.parse(bytes);
            return { status: 'observed', value, digest: sha(value) };
          });
    if (
      result.status !== 'observed' ||
      result.digest !== sha(result.value) ||
      result.value.number !== subject.issue ||
      !same(readDecompositionRecords(result.value.body), expected)
    )
      refuse('projection-read-back');
  } catch {
    refuse('projection-read-back');
  }
}
// Controlled ownership; context attestation is a package-owned assessment
// effect, not an extra external mutation. Its digest survives refresh/partial
// estimate writes and consumes one of the closed record's 32 effect slots.
export async function withDecompositionPublicationOwner(
  { subject, publication, cfg, projectDir, deps = {} },
  operation
) {
  validateDecompositionPublication(publication);
  if (
    !same(subject, publication.subject) ||
    publication.status !== 'pending' ||
    typeof operation !== 'function'
  )
    refuse('publication-context');
  const rawPublication = structuredClone(publication);
  const nested = active.getStore();
  if (nested) {
    const publicManifest = (value) =>
      sealedPublication({
        ...value,
        effects: value.effects.filter(
          (effect) => effect.id !== DECOMPOSITION_AUTHORITY_CONTEXT_EFFECT_ID
        ),
      });
    if (
      !owned.has(nested) ||
      nested.role !== 'owner' ||
      !same(nested.subject, subject) ||
      nested.operationId !== rawPublication.operationId ||
      nested.publicManifestDigest !== sha(publicManifest(rawPublication)) ||
      currentIssueLockOwner(subject.issue) !== nested.lockOwner
    )
      refuse('foreign-operation');
    await assertDecompositionPublicationOwner(nested, { subject });
    return operation(nested);
  }
  const main = (deps.findMainWorktreePath ?? findMainWorktreePath)(projectDir);
  return withIssueLock(
    { issue: subject.issue, verb: 'decomposition-publication', projDir: main },
    async () => {
      const lockOwner = currentIssueLockOwner(subject.issue);
      if (!lockOwner || lockOwner.projDir !== main) refuse('lock-owner');
      const { collectDecompositionAuthority } = await import('./decomposition-authority.mjs');
      const collect = () => collectDecompositionAuthority({ subject, cfg, projectDir, deps });
      let ownerContext = null;
      const snapshotUsable = async (current) =>
        usableForReconciliation(current) ||
        publicationForecastTransitionUsable(current, rawPublication, (effect) =>
          deps.readPublicationEffect?.({
            subject,
            operationId: rawPublication.operationId,
            effect,
            context: ownerContext,
          })
        );
      const initial = await collect(),
        previous = initial.publication;
      const resuming =
        previous?.operationId === rawPublication.operationId && previous.status === 'pending';
      if (
        !resuming &&
        rawPublication.supersedes &&
        (!previous || rawPublication.supersedes.operationId !== previous.operationId)
      )
        refuse('supersession-predecessor');
      const superseding = Boolean(rawPublication.supersedes);
      if (
        !(await snapshotUsable(initial)) ||
        (initial.input.availability.status !== 'complete' && !resuming && !superseding)
      )
        refuse('authority-unavailable');
      const previousBinding = previous?.effects.find(
        (effect) => effect.id === DECOMPOSITION_AUTHORITY_CONTEXT_EFFECT_ID
      );
      const originalDigest = resuming
        ? previousBinding?.intendedDigest
        : decompositionPublicationContextDigest(initial.input);
      if (
        !originalDigest ||
        originalDigest !== decompositionPublicationContextDigest(initial.input)
      )
        refuse('semantic-context-drift');
      const targetIdentity = `${subject.repository}#${subject.issue}:authority-context`;
      let contextEffect = resuming
        ? structuredClone(previousBinding)
        : {
            id: DECOMPOSITION_AUTHORITY_CONTEXT_EFFECT_ID,
            resource: 'assessment',
            targetIdentity,
            intendedDigest: originalDigest,
            status: 'pending',
            observedDigest: null,
          };
      if (
        contextEffect.resource !== 'assessment' ||
        contextEffect.targetIdentity !== targetIdentity
      )
        refuse('authority-context');
      const callerBinding = rawPublication.effects.find(
        (effect) => effect.id === DECOMPOSITION_AUTHORITY_CONTEXT_EFFECT_ID
      );
      if (callerBinding && (!resuming || !same(callerBinding, previousBinding)))
        refuse('authority-context-collision');
      const publicEffects = rawPublication.effects.filter(
        (effect) => effect.id !== DECOMPOSITION_AUTHORITY_CONTEXT_EFFECT_ID
      );
      if (publicEffects.length > 31) refuse('authority-context-capacity');
      const normalizeCandidate = (candidate) => {
        const copy = structuredClone(candidate),
          binding = copy.effects.find(
            (effect) => effect.id === DECOMPOSITION_AUTHORITY_CONTEXT_EFFECT_ID
          );
        if (
          binding &&
          !same(
            { ...binding, status: 'pending', observedDigest: null },
            { ...contextEffect, status: 'pending', observedDigest: null }
          )
        )
          refuse('authority-context-collision');
        copy.effects = copy.effects.filter(
          (effect) => effect.id !== DECOMPOSITION_AUTHORITY_CONTEXT_EFFECT_ID
        );
        copy.effects.push(structuredClone(contextEffect));
        return copy;
      };
      const normalized = normalizeCandidate(rawPublication),
        sealed = sealedPublication(normalized);
      if (
        resuming
          ? !same(sealedPublication(previous), sealed)
          : initial.inputDigest !== rawPublication.beforeInputDigest
      )
        refuse('publication-drift');
      if (previous?.status === 'pending' && !resuming && !superseding)
        refuse('publication-reconciliation-required');
      if (!resuming && publicEffects.some((effect) => effect.status !== 'pending'))
        refuse('publication-before-intent');
      let intentPersisted =
        resuming &&
        contextEffect.status === 'confirmed' &&
        contextEffect.observedDigest === originalDigest;
      let latest = resuming ? structuredClone(previous) : normalized;
      const readEffect = async (effect, operationId) => {
        if (effect.id === DECOMPOSITION_AUTHORITY_CONTEXT_EFFECT_ID) {
          if (effect.resource !== 'assessment' || effect.targetIdentity !== targetIdentity)
            refuse('authority-context');
          const current = await collect();
          if (!(await snapshotUsable(current))) refuse('effect-read-back');
          const value = authorityContextValue(current.input);
          return { status: 'observed', value, digest: sha(value) };
        }
        if (typeof deps.readPublicationEffect !== 'function') refuse('effect-read-back');
        return deps.readPublicationEffect({ subject, operationId, effect, context: ctx });
      };
      const verifyEffect = async (effect, operationId) => {
        const read = await readEffect(effect, operationId);
        if (
          read?.status !== 'observed' ||
          read.digest !== sha(read.value) ||
          read.digest !== effect.observedDigest ||
          (effect.status === 'confirmed' && read.digest !== effect.intendedDigest)
        )
          refuse('effect-read-back');
      };
      const writeRecords = async (candidate, current) => {
        const before = readDecompositionRecords(current.sourceObservations.readIssue.value.body);
        const after = {
          assessment: assessDecomposition(current.input, { publication: candidate }),
          publication: candidate,
        };
        const cap = Object.freeze({
          context: ctx,
          beforeDigest: sha(before),
          afterDigest: sha(after),
        });
        capabilities.add(cap);
        const { mutateIssueBody } = await import('./issue-body-mutate.mjs');
        try {
          await (deps.mutateIssueBody ?? mutateIssueBody)({
            issueNumber: subject.issue,
            repo: subject.repository,
            deps,
            allowMarkerAdvance: ['aitm-decomposition-assessment', 'aitm-decomposition-publication'],
            decompositionMutationCapability: cap,
            validateFreshBaseAsync: async (base) => {
              const value = { number: subject.issue, body: base };
              const fresh = await collectDecompositionAuthority({
                subject,
                cfg,
                projectDir,
                deps: {
                  ...deps,
                  readIssue: async () => ({ status: 'observed', value, digest: sha(value) }),
                },
              });
              if (
                fresh.inputDigest !== current.inputDigest ||
                decompositionPublicationContextDigest(fresh.input) !== originalDigest
              )
                refuse('semantic-drift');
            },
            mutate: (base) => replaceDecompositionRecords(base, after),
          });
        } finally {
          capabilities.delete(cap);
        }
        await exactReadBack({ subject, cfg, projectDir, deps }, after);
        latest = structuredClone(candidate);
        return after;
      };
      const persistPublication = async (rawCandidate) => {
        if (
          !owned.has(ctx) ||
          active.getStore() !== ctx ||
          currentIssueLockOwner(subject.issue) !== lockOwner
        )
          refuse('publication-context');
        validateDecompositionPublication(rawCandidate);
        if (rawCandidate.status === 'superseded') refuse('supersession-requires-linked-revision');
        let candidate = normalizeCandidate(rawCandidate);
        if (!same(sealedPublication(candidate), sealed)) refuse('publication-manifest-drift');
        if (
          !intentPersisted &&
          (candidate.status !== 'pending' ||
            candidate.effects
              .filter((effect) => effect.id !== DECOMPOSITION_AUTHORITY_CONTEXT_EFFECT_ID)
              .some((effect) => effect.status !== 'pending'))
        )
          refuse('publication-before-intent');
        const current = await collect();
        if (
          !(await snapshotUsable(current)) ||
          decompositionPublicationContextDigest(current.input) !== originalDigest
        )
          refuse('semantic-drift');
        if (!intentPersisted && superseding && !resuming) {
          const identities = (effects) =>
            effects.map(({ id, resource, targetIdentity, intendedDigest }) => ({
              id,
              resource,
              targetIdentity,
              intendedDigest,
            }));
          if (!same(identities(previous.effects), identities(candidate.supersedes.effects)))
            refuse('supersession-manifest');
          for (const effect of candidate.supersedes.effects)
            await verifyEffect(effect, previous.operationId);
        }
        if (
          current.publication &&
          current.publication.operationId !== candidate.operationId &&
          current.publication.status === 'pending' &&
          !(superseding && current.publication.operationId === candidate.supersedes.operationId)
        )
          refuse('publication-drift');
        if (
          current.publication?.operationId === candidate.operationId &&
          current.publication.status === 'complete' &&
          candidate.status !== 'complete'
        )
          refuse('publication-terminal');
        for (const effect of candidate.effects.filter((effect) =>
          ['confirmed', 'failed'].includes(effect.status)
        ))
          await verifyEffect(effect, candidate.operationId);
        if (
          candidate.status === 'complete' &&
          (current.input.availability.status !== 'complete' ||
            current.inputDigest !== candidate.intendedInputDigest ||
            !publicationProposalMatchesAuthority(current, candidate))
        )
          refuse('publication-authority');
        let result = await writeRecords(candidate, current);
        if (!intentPersisted) {
          const fresh = await collect();
          if (
            !(await snapshotUsable(fresh)) ||
            decompositionPublicationContextDigest(fresh.input) !== originalDigest
          )
            refuse('semantic-drift');
          contextEffect = { ...contextEffect, status: 'confirmed', observedDigest: originalDigest };
          candidate = normalizeCandidate(candidate);
          await verifyEffect(contextEffect, candidate.operationId);
          result = await writeRecords(candidate, fresh);
          intentPersisted = true;
        }
        return result;
      };
      const ctx = Object.freeze({
        subject: Object.freeze(structuredClone(subject)),
        operationId: normalized.operationId,
        writerId: normalized.writerId,
        role: 'owner',
        lockOwner,
        effectIds: Object.freeze(publicEffects.map((effect) => effect.id)),
        authorityContextDigest: originalDigest,
        publicManifestDigest: sha(sealedPublication({ ...normalized, effects: publicEffects })),
        get intentConfirmed() {
          return intentPersisted;
        },
        collectCurrent: collect,
        publication: () => structuredClone(latest),
        persistPublication,
      });
      ownerContext = ctx;
      publicationReconciliation.set(ctx, snapshotUsable);
      owned.add(ctx);
      try {
        return await active.run(ctx, async () => {
          if (resuming)
            await exactReadBack(
              { subject, cfg, projectDir, deps },
              {
                assessment: readDecompositionRecords(
                  initial.sourceObservations.readIssue.value.body
                ).assessment,
                publication: previous,
              }
            );
          return operation(ctx);
        });
      } finally {
        owned.delete(ctx);
        publicationReconciliation.delete(ctx);
      }
    }
  );
}
