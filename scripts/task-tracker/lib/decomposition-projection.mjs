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
  const main = findMainWorktreePath(projectDir);
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
      }
    }
  );
}

export function assertDecompositionPublicationOwner(
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
  return context;
}
function sealedPublication(publication) {
  return {
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
  };
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
// A controlled operation entry, never a raw capability constructor. Task 3
// supplies registered read-back adapters and runs its named effects in this
// issue-locked frame; only exact record deltas receive a private capability.
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
  const nested = active.getStore();
  if (nested) {
    if (
      !owned.has(nested) ||
      nested.role !== 'owner' ||
      !same(nested.subject, subject) ||
      nested.operationId !== publication.operationId ||
      nested.manifestDigest !== sha(sealedPublication(publication)) ||
      currentIssueLockOwner(subject.issue) !== nested.lockOwner
    )
      refuse('foreign-operation');
    return operation(nested);
  }
  const main = findMainWorktreePath(projectDir);
  return withIssueLock(
    { issue: subject.issue, verb: 'decomposition-publication', projDir: main },
    async () => {
      const lockOwner = currentIssueLockOwner(subject.issue);
      if (!lockOwner || lockOwner.projDir !== main) refuse('lock-owner');
      const { collectDecompositionAuthority } = await import('./decomposition-authority.mjs');
      const collect = () => collectDecompositionAuthority({ subject, cfg, projectDir, deps });
      const initial = await collect();
      const previous = initial.publication;
      const resuming =
        previous?.operationId === publication.operationId && previous.status === 'pending';
      const superseding =
        previous?.status === 'pending' &&
        publication.supersedes?.operationId === previous.operationId;
      if (
        initial.projection.status === 'malformed' ||
        (initial.input.availability.status !== 'complete' &&
          !(
            (resuming || superseding) &&
            initial.input.availability.reasons.every((reason) => reason === 'authority-conflict')
          ))
      )
        refuse('authority-unavailable');
      if (
        resuming
          ? !same(sealedPublication(previous), sealedPublication(publication))
          : initial.inputDigest !== publication.beforeInputDigest
      )
        refuse('publication-drift');
      if (previous?.status === 'pending' && !resuming && !superseding)
        refuse('publication-reconciliation-required');
      if (!resuming && publication.effects.some((e) => e.status !== 'pending'))
        refuse('publication-before-intent');
      const sealed = sealedPublication(publication);
      let intentPersisted = resuming;
      const persistPublication = async (candidate) => {
        if (
          !owned.has(ctx) ||
          active.getStore() !== ctx ||
          currentIssueLockOwner(subject.issue) !== lockOwner
        )
          refuse('publication-context');
        validateDecompositionPublication(candidate);
        if (candidate.status === 'superseded') refuse('supersession-requires-linked-revision');
        if (!same(sealedPublication(candidate), sealed)) refuse('publication-manifest-drift');
        if (
          !intentPersisted &&
          (candidate.status !== 'pending' || candidate.effects.some((e) => e.status !== 'pending'))
        )
          refuse('publication-before-intent');
        const current = await collect();
        if (
          current.projection.status === 'malformed' ||
          current.input.scopeDigest !== initial.input.scopeDigest
        )
          refuse('semantic-drift');
        if (!intentPersisted && superseding) {
          const identities = (effects) =>
            effects.map(({ id, resource, targetIdentity, intendedDigest }) => ({
              id,
              resource,
              targetIdentity,
              intendedDigest,
            }));
          if (!same(identities(previous.effects), identities(candidate.supersedes.effects)))
            refuse('supersession-manifest');
          for (const effect of candidate.supersedes.effects) {
            if (typeof deps.readPublicationEffect !== 'function') refuse('effect-read-back');
            const read = await deps.readPublicationEffect({
              subject,
              operationId: previous.operationId,
              effect,
              context: ctx,
            });
            if (
              read?.status !== 'observed' ||
              read.digest !== sha(read.value) ||
              read.digest !== effect.observedDigest
            )
              refuse('effect-read-back');
          }
        }
        if (
          current.publication &&
          !same(current.publication.operationId, publication.operationId) &&
          current.publication.status === 'pending' &&
          !(superseding && current.publication.operationId === candidate.supersedes.operationId)
        )
          refuse('publication-drift');
        if (
          current.publication?.operationId === publication.operationId &&
          current.publication.status === 'complete' &&
          candidate.status !== 'complete'
        )
          refuse('publication-terminal');
        for (const effect of candidate.effects.filter((e) =>
          ['confirmed', 'failed'].includes(e.status)
        )) {
          if (typeof deps.readPublicationEffect !== 'function') refuse('effect-read-back');
          const read = await deps.readPublicationEffect({
            subject,
            operationId: publication.operationId,
            effect,
            context: ctx,
          });
          if (
            read?.status !== 'observed' ||
            read.digest !== sha(read.value) ||
            read.digest !== effect.observedDigest ||
            (effect.status === 'confirmed' && read.digest !== effect.intendedDigest)
          )
            refuse('effect-read-back');
        }
        if (
          candidate.status === 'complete' &&
          (current.input.availability.status !== 'complete' ||
            current.inputDigest !== candidate.intendedInputDigest ||
            current.input.estimate.hours !== candidate.proposal.estimate.hours ||
            current.input.size !== candidate.proposal.size)
        )
          refuse('publication-authority');
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
              if (fresh.inputDigest !== current.inputDigest) refuse('semantic-drift');
            },
            mutate: (base) => replaceDecompositionRecords(base, after),
          });
        } finally {
          capabilities.delete(cap);
        }
        await exactReadBack({ subject, cfg, projectDir, deps }, after);
        intentPersisted = true;
        return after;
      };
      const ctx = Object.freeze({
        subject,
        operationId: publication.operationId,
        writerId: publication.writerId,
        role: 'owner',
        effectIds: Object.freeze(publication.effects.map((effect) => effect.id)),
        get intentConfirmed() {
          return intentPersisted;
        },
        manifestDigest: sha(sealed),
        lockOwner,
        persistPublication,
      });
      owned.add(ctx);
      try {
        return await active.run(ctx, () => operation(ctx));
      } finally {
        owned.delete(ctx);
      }
    }
  );
}
