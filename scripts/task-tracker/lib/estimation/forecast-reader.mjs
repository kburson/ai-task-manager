// @story #2039 #2064
import { validateLocalEvidence } from './local-evidence.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';

/** Read the native immutable manifest; regenerate projections from every retained payload. */
export function readLocalForecastEvidence({ evidenceStore, manifestDigest, identity } = {}) {
  const requested = JSON.parse(canonicalRecordJson(identity));
  if (
    typeof requested?.host !== 'string' ||
    typeof requested.repository !== 'string' ||
    !Number.isSafeInteger(requested.issue) ||
    requested.issue <= 0
  )
    throw new TypeError('forecast-lineage:identity');
  const read = evidenceStore.read(manifestDigest);
  // The native store returns projections too. Only its raw bundle is replay input.
  const retained = validateLocalEvidence({
    manifest: read.manifest,
    planBytes: read.planBytes,
    payloads: read.payloads,
  });
  if (retained.manifestDigest !== manifestDigest)
    throw new TypeError('forecast-lineage:manifest-digest');
  for (const field of ['host', 'repository', 'issue'])
    if (retained.manifest[field] !== requested[field])
      throw new TypeError('forecast-lineage:identity-' + field);
  return retained;
}
