import { pexec } from '../../gh/lib/gh-client.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
const FIELDS = ['engagedTime', 'sessionTime', 'reviewTime', 'planTime'];
const PREFIX = 'AITM_TIMING_RESULT ';
function fail() {
  throw new TypeError('timing-field-result:invalid');
}
function objectKeys(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',')
  );
}
function measure(value) {
  return value === null || (Number.isFinite(value) && value >= 0);
}
export function parseTimingFieldResult(stdout, { issue, repository } = {}) {
  const lines = String(stdout)
    .split(String.fromCharCode(10))
    .filter((line) => line.startsWith(PREFIX));
  if (!lines.length) return { status: 'unavailable', reason: 'projection-unreported' };
  if (lines.length !== 1) fail();
  let result;
  try {
    result = JSON.parse(lines[0].slice(PREFIX.length));
  } catch {
    fail();
  }
  if (
    !objectKeys(result, [
      'schema',
      'status',
      'issue',
      'repository',
      'sourceCommentId',
      'reasons',
      'knownEngagedSec',
      'values',
      'secondsByKey',
      'unknownFields',
    ]) ||
    result.schema !== 'aitm.timing-field-result/v1' ||
    !['complete', 'incomplete'].includes(result.status) ||
    !Number.isSafeInteger(result.issue) ||
    result.issue <= 0 ||
    result.issue !== Number(String(issue).replace('#', '')) ||
    result.repository !== repository ||
    typeof result.sourceCommentId !== 'string' ||
    !result.sourceCommentId.trim() ||
    !Array.isArray(result.reasons) ||
    result.reasons.some((reason) => typeof reason !== 'string' || !reason.trim()) ||
    (result.status === 'incomplete' && !result.reasons.length) ||
    !measure(result.knownEngagedSec) ||
    !objectKeys(result.values, FIELDS) ||
    !objectKeys(result.secondsByKey, FIELDS) ||
    !Array.isArray(result.unknownFields)
  )
    fail();
  for (const key of FIELDS) {
    if (
      !measure(result.values[key]) ||
      !measure(result.secondsByKey[key]) ||
      (result.values[key] === null) !== (result.secondsByKey[key] === null)
    )
      fail();
  }
  const unknown = FIELDS.filter((key) => result.values[key] === null);
  if (JSON.stringify([...result.unknownFields].sort()) !== JSON.stringify(unknown.sort())) fail();
  return result;
}
export async function runTimingFieldUpdate({
  issue,
  repository,
  execute = pexec,
  log = console.log,
} = {}) {
  const scriptPath = new URL('../../gh/log-issue-time.mjs', import.meta.url).pathname;
  const { stdout } = await execute(process.execPath, [scriptPath, String(issue)], {
    timeout: GH_API_TIMEOUT_MS,
  });
  if (stdout.trim()) log(stdout.trim());
  return parseTimingFieldResult(stdout, { issue, repository });
}
