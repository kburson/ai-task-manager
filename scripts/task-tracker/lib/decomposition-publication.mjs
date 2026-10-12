// @story #1988 — data-only durable intent and in-process registered effects.
import { createHash } from 'node:crypto';
import {
  canonicalDecompositionJson,
  validateDecompositionPublication,
} from './decomposition-assessment.mjs';
import { assertDecompositionPublicationOwner } from './decomposition-projection.mjs';
export const estimateEffectDigest = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : canonicalDecompositionJson(value))
    .digest('hex');
function refuse(code) {
  throw new Error(`estimate-publication:${code}`);
}
function descriptor(effect) {
  if (typeof effect.apply !== 'function' || typeof effect.read !== 'function')
    refuse('effect-adapter');
  return {
    id: effect.id,
    resource: effect.resource,
    targetIdentity: effect.targetIdentity,
    intendedDigest: estimateEffectDigest(effect.value),
    status: 'pending',
    observedDigest: null,
  };
}
async function readEffect(effect) {
  const read = await effect.read();
  if (read?.status !== 'observed' || read.digest !== estimateEffectDigest(read.value))
    refuse('effect-read-back');
  return read;
}
// Callbacks are package adapter dependencies, never serialized or read from authority.
async function publishEstimateRevisionOwned({
  subject,
  operationId,
  expectedInputDigest,
  proposal,
  effects,
  deps = {},
  context,
} = {}) {
  const runtime = deps.runtime;
  if (
    !runtime ||
    typeof runtime.collect !== 'function' ||
    typeof runtime.withPublication !== 'function' ||
    !Array.isArray(effects)
  )
    refuse('dependencies');
  const initial = await runtime.collect(subject);
  const stamp = new Date().toISOString();
  const manifest = {
    schema: 'aitm.decomposition-publication/v1',
    subject,
    operationId,
    writerId: deps.writerId,
    beforeInputDigest: expectedInputDigest,
    intendedInputDigest: deps.intendedInputDigest,
    proposal,
    effects: effects.map(descriptor),
    status: 'pending',
    supersedes: deps.supersedes ?? null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const prior = initial.publication;
  const matching = prior?.operationId === operationId;
  if (matching) {
    manifest.createdAt = prior.createdAt;
    const identities = (value) =>
      value.effects
        .filter((e) => e.id !== 'authority-context')
        .map(({ id, resource, targetIdentity, intendedDigest }) => ({
          id,
          resource,
          targetIdentity,
          intendedDigest,
        }));
    for (const key of [
      'subject',
      'writerId',
      'beforeInputDigest',
      'intendedInputDigest',
      'proposal',
      'supersedes',
    ])
      if (canonicalDecompositionJson(manifest[key]) !== canonicalDecompositionJson(prior[key]))
        refuse('manifest-drift');
    if (
      canonicalDecompositionJson(identities(manifest)) !==
      canonicalDecompositionJson(identities(prior))
    )
      refuse('manifest-drift');
    if (prior.status === 'complete') {
      if (
        initial.inputDigest !== prior.intendedInputDigest ||
        initial.input.availability.status !== 'complete'
      )
        refuse('completed-authority-drift');
      for (const e of effects)
        if ((await readEffect(e)).digest !== estimateEffectDigest(e.value))
          refuse('completed-effect-drift');
      return { status: 'recorded', operationId, assessment: initial.assessment, replayed: false };
    }
  } else if (initial.inputDigest !== expectedInputDigest) refuse('input-drift');
  validateDecompositionPublication(manifest);
  const operation = async (owner) => {
    if (context && owner !== context) refuse('foreign-context');
    await owner.persistPublication(owner.publication());
    const runEffects = async () => {
      try {
        if (deps.beforeEffects) await deps.beforeEffects(owner);
        for (const adapter of effects) {
          if (deps.beforeEffect) await deps.beforeEffect(owner);
          await assertDecompositionPublicationOwner(owner, {
            subject,
            operationId,
            writerId: manifest.writerId,
            effectId: adapter.id,
            requireIntent: true,
          });
          let state = owner.publication();
          const effect = state.effects.find((e) => e.id === adapter.id);
          let observation = await readEffect(adapter);
          if (effect.status === 'confirmed' && observation.digest !== effect.intendedDigest)
            refuse('confirmed-effect-drift');
          if (observation.digest !== effect.intendedDigest) {
            try {
              await adapter.apply(owner);
            } catch (error) {
              state = owner.publication();
              const unknown = state.effects.find((e) => e.id === adapter.id);
              unknown.status = 'unknown';
              unknown.observedDigest = null;
              state.updatedAt = new Date().toISOString();
              await owner.persistPublication(state);
              throw error;
            }
            observation = await readEffect(adapter);
          }
          state = owner.publication();
          const result = state.effects.find((e) => e.id === adapter.id);
          if (observation.digest !== result.intendedDigest) {
            result.status = 'unknown';
            result.observedDigest = observation.digest;
            state.updatedAt = new Date().toISOString();
            await owner.persistPublication(state);
            refuse('effect-unconfirmed');
          }
          result.status = 'confirmed';
          result.observedDigest = observation.digest;
          state.updatedAt = new Date().toISOString();
          await owner.persistPublication(state);
        }
        if (deps.afterEffects) await deps.afterEffects(owner);
        const current = await owner.collectCurrent();
        if (
          current.input.availability.status !== 'complete' ||
          current.inputDigest !== manifest.intendedInputDigest
        )
          refuse('final-authority-drift');
        const complete = owner.publication();
        complete.status = 'complete';
        complete.updatedAt = new Date().toISOString();
        const result = await owner.persistPublication(complete);
        return {
          status: 'recorded',
          operationId,
          assessment: result.assessment,
          replayed: matching,
        };
      } catch (error) {
        if (deps.onFailure) await deps.onFailure(owner, error);
        return {
          status: 'partial',
          operationId,
          reason: error.message,
          publication: owner.publication(),
        };
      }
    };
    return deps.withEffects ? deps.withEffects(runEffects) : runEffects();
  };
  return runtime.withPublication({ subject, publication: manifest }, operation);
}

export async function publishEstimateRevision(input = {}) {
  try {
    return await publishEstimateRevisionOwned(input);
  } catch (error) {
    return { status: 'refused', operationId: input.operationId ?? null, reason: error.message };
  }
}
