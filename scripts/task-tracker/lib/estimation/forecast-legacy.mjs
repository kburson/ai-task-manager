// @story #2039 #2065
import { validateEstimationForecast } from './forecast-record.mjs';
import { FORECAST_V3_SCHEMA, validateForecastProvenance } from './forecast-v3.mjs';
import { resolveLocalForecast } from './forecast-lineage.mjs';
import { validateLocalSelection } from './local-runtime.mjs';

/** Current authority requires retained bytes and the caller's current native selection. */
export function requireCurrentSchema(
  value,
  { expectedIssue, repository, evidenceStore, identity, selection } = {}
) {
  if (value?.schema !== FORECAST_V3_SCHEMA) throw new TypeError('forecast-current:schema');
  if (repository !== undefined && repository !== identity?.repository)
    throw new TypeError('forecast-current:repository');
  if (typeof evidenceStore?.read !== 'function')
    throw new TypeError('forecast-current:evidence-store-required');
  validateForecastProvenance(value, { expectedIssue });
  const resolved = resolveLocalForecast({ forecast: value, evidenceStore, identity });
  if (resolved.status !== 'resolved') throw new TypeError('forecast-current:' + resolved.reason);
  const { manifest, payloads, planBytes } = resolved.evidence;
  validateLocalSelection({ evidence: { manifest, payloads, planBytes }, selection });
  return resolved.forecast;
}

/** Legacy reads retain exact v1 arbitrary-hour and v2 half-hour semantics and values. */
export function readForecastVersioned(value, options = {}) {
  if (value?.schema === FORECAST_V3_SCHEMA) return requireCurrentSchema(value, options);
  return validateEstimationForecast(value, { expectedIssue: options.expectedIssue });
}
