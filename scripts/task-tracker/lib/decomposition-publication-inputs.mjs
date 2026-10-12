// @story #1988 — earlier Plan forecasts are historical only after confirmed revision.
export function confirmedEstimateProjectionRevision({ publication, project, bodyFields }) {
  if (
    !publication ||
    !['pending', 'complete'].includes(publication.status) ||
    publication.writerId === 'plan-estimate-adaptive' ||
    publication.proposal.estimate.basis === 'proposed'
  )
    return false;
  const hours = publication.proposal.estimate.hours,
    size = publication.proposal.size;
  return (
    publication.subject.projectItemId === project?.projectItemId &&
    project.estimate === hours &&
    bodyFields?.estimate === hours &&
    project.size === size &&
    bodyFields?.size === size &&
    ['project-estimate', 'body-fields'].every((resource) =>
      publication.effects.some(
        (effect) =>
          effect.resource === resource &&
          effect.status === 'confirmed' &&
          effect.observedDigest === effect.intendedDigest
      )
    )
  );
}

export function forecastPublicationTransition({
  ready,
  readyId,
  active,
  projection,
  proposalsAvailable,
}) {
  if (
    !proposalsAvailable ||
    active.length !== 1 ||
    projection.activeForecastRecordIds.length !== 1 ||
    ready.length > 1 ||
    (ready.length === 1 && (!readyId || projection.forecast?.recordId !== readyId))
  )
    return null;
  const envelope = active[0].envelope;
  return {
    recordId: envelope.recordId,
    payloadHash: envelope.payloadHash,
    readyRecordId: readyId ?? null,
  };
}
export async function publicationForecastTransitionUsable(current, publication, readEffect) {
  if (
    current.projection.status === 'malformed' ||
    publication?.writerId !== 'plan-estimate-adaptive' ||
    current.publication?.operationId !== publication.operationId ||
    current.publication.status !== 'pending' ||
    current.input.availability.reasons.some(
      (reason) => !['authority-conflict', 'forecast-unavailable'].includes(reason)
    )
  )
    return false;
  const transition = current.sourceObservations.readForecast.value?.publicationTransition;
  if (!transition || typeof readEffect !== 'function') return false;
  const effect = publication.effects.find(
    (e) => e.resource === 'forecast' && e.targetIdentity === `record:${transition.recordId}`
  );
  const ready = publication.effects.find((e) => e.resource === 'ready-marker');
  if (!effect || !ready) return false;
  const { estimateEffectDigest } = await import('./decomposition-publication.mjs');
  const value = { recordId: transition.recordId, payloadHash: transition.payloadHash };
  if (
    effect.intendedDigest !== estimateEffectDigest(value) ||
    ready.intendedDigest !== estimateEffectDigest(transition.recordId)
  )
    return false;
  try {
    const actual = await readEffect(effect);
    return (
      actual?.status === 'observed' &&
      actual.digest === estimateEffectDigest(actual.value) &&
      actual.digest === effect.intendedDigest
    );
  } catch {
    return false;
  }
}
