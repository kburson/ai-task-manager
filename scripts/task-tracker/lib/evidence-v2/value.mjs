// @story #1497
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
export const canonical = canonicalRecordJson;
export const fail = (reason) => {
  throw new TypeError(`evidence-v2:${reason}`);
};
export const hash = (value) =>
  `sha256:${createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value))
    .digest('hex')}`;
export const HASH = /^sha256:[a-f0-9]{64}$/;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
export function exact(value, keys, reason = 'keys') {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    canonical(Object.keys(value).sort()) !== canonical([...keys].sort())
  )
    fail(reason);
  canonical(value);
}
export function textValue(value, reason = 'text') {
  if (typeof value !== 'string' || !value.trim()) fail(reason);
}
export function digestValue(value, reason = 'digest') {
  if (!HASH.test(value)) fail(reason);
}
export function uuidValue(value, reason = 'uuid') {
  if (!UUID.test(value)) fail(reason);
}
export function repository(value) {
  exact(value, ['nodeId', 'nameWithOwner'], 'repository-keys');
  textValue(value.nodeId, 'repository-id');
  if (!/^[\w.-]+\/[\w.-]+$/.test(value.nameWithOwner)) fail('repository-name');
}
export function frozen(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
export function policyValue(value) {
  exact(value, ['id', 'version'], 'policy-keys');
  textValue(value.id, 'policy-id');
  textValue(value.version, 'policy-version');
}
