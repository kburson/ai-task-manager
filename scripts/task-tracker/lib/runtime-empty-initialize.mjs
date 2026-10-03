// @story #1861
import { randomUUID } from 'node:crypto';
import { RuntimeRootError } from './runtime-storage.mjs';
import { INITIAL_RUNTIME_RECORDS } from './runtime-initialization-record.mjs';
import { observeRuntimeAuthorityCensus } from './runtime-authority-census.mjs';
import {
  emptyRuntimeDigest,
  emptyRuntimeObservationProjection,
  INITIAL_SHARED_RUNTIME_RECORDS,
} from './runtime-empty-record.mjs';
export async function planEmptyRuntimeInitialization({ projectRoot, mainRoot, adapters = {} }) {
  const observation = await observeRuntimeAuthorityCensus({ projectRoot, mainRoot, adapters });
  const blockers = [...observation.blockers];
  if (observation.layout.projectRoot !== observation.layout.mainRoot)
    blockers.push({ code: 'main-only', target: projectRoot });
  if (!observation.mainIdentity)
    blockers.push({ code: 'main-identity-unavailable', target: mainRoot });
  if (blockers.length) {
    const error = new RuntimeRootError(
      'RUNTIME_EMPTY_INIT_REFUSED',
      'Explicit empty initialization requires complete all-root absence and writer proof'
    );
    error.blockers = blockers;
    throw error;
  }
  const projection = emptyRuntimeObservationProjection(observation);
  const plan = {
    schema: 'aitm.runtime-empty-plan/v1',
    operationId: randomUUID(),
    projectRoot: observation.mainIdentity.projectRoot,
    mainRoot: observation.mainIdentity.projectRoot,
    mainIdentity: observation.mainIdentity,
    observation: projection,
    observationDigest: emptyRuntimeDigest(projection),
    originalRoots: [observation.mainIdentity.projectRoot],
    sourcePolicy: 'proven-total-absence-no-inherited-grants',
    records: { ...INITIAL_RUNTIME_RECORDS, ...INITIAL_SHARED_RUNTIME_RECORDS },
  };
  return { ...plan, digest: emptyRuntimeDigest(plan) };
}
