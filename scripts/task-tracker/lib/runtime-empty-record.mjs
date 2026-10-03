// @story #1861
import { createHash } from 'node:crypto';
export function emptyRuntimeDigest(value) {
  const stable = (item) =>
    Array.isArray(item)
      ? item.map(stable)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, stable(item[key])])
          )
        : item;
  return (
    'sha256:' +
    createHash('sha256')
      .update(Buffer.isBuffer(value) ? value : JSON.stringify(stable(value)))
      .digest('hex')
  );
}
export const INITIAL_SHARED_RUNTIME_RECORDS = Object.freeze({
  'fleet/task-fleet.json': '{}\n',
  'fleet/occupancy.json': '{}\n',
});
export function emptyRuntimeObservationProjection(observation) {
  return {
    roots: observation.roots,
    rootIdentities: observation.rootIdentities,
    unavailableRoots: observation.unavailableRoots,
    authority: observation.authority,
    blockers: observation.blockers,
    writerObservation: observation.writerObservation,
  };
}
