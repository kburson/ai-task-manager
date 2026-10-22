// @story #2039 #2064
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { validateForecastProvenance } from './forecast-v3.mjs';
import { readLocalForecastEvidence } from './forecast-reader.mjs';
import { localFailureReason } from './local-runtime.mjs';

/** Resolve locally retained evidence only; unavailable inputs never trigger cloud hydration. */
export function resolveLocalForecast({ forecast, evidenceStore, identity } = {}) {
  try {
    const snapshot = JSON.parse(canonicalRecordJson(forecast));
    validateForecastProvenance(snapshot);
    const evidence = readLocalForecastEvidence({
      evidenceStore,
      identity,
      manifestDigest: snapshot.localEvidence.manifestDigest,
    });
    validateForecastProvenance(snapshot, {
      expectedIssue: evidence.manifest.issue,
      repository: evidence.manifest.repository,
      evidence: {
        manifest: evidence.manifest,
        planBytes: evidence.planBytes,
        payloads: evidence.payloads,
      },
    });
    return { status: 'resolved', forecast: snapshot, evidence };
  } catch (error) {
    return { status: 'unavailable', reason: localFailureReason(error, 'local-forecast-invalid') };
  }
}
