// cspell:ignore apikey apikeypolicy authorizationdecision credentialpolicy fortunecookie inputtokencount outputtokencount passwordpolicy pousr priorauthorization sessioncookiepolicy tokencount
import { canonicalRecordJson } from './canonical-json.mjs';

const SAFE_KEY_FAMILY_PREFIXES = [
  'inputtokencount',
  'outputtokencount',
  'tokencount',
  'passwordpolicy',
  'priorauthorization',
  'authorizationdecision',
  'credentialpolicy',
  'apikeypolicy',
  'sessioncookiepolicy',
  'fortunecookie',
  'secretary',
  'tokenizer',
];
const COLLAPSED_SENSITIVE_FRAGMENTS = [
  'token',
  'secret',
  'credential',
  'password',
  'passwd',
  'authorization',
  'cookie',
  'apikey',
  'privatekey',
  'bearer',
];
const AUTHORIZATION_BEARER_RE = /\bauthorization\s*:\s*bearer\b/i;
const BEARER_CREDENTIAL_RE = /\bbearer\s+\S+/i;
const GITHUB_TOKEN_RE = /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/i;
const TOKEN_ENV_NAME_RE =
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:ACCESS_TOKEN|API_KEY|AUTH_TOKEN|CLIENT_SECRET|PRIVATE_KEY|TOKEN|PASSWORD|CREDENTIALS)\b/i;
const PRIVATE_KEY_RE = /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/i;

function secretError() {
  return new TypeError('record-envelope:secret');
}

function collapsedSecretKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function containsSensitiveKeyFragment(value) {
  return COLLAPSED_SENSITIVE_FRAGMENTS.some((fragment) => value.includes(fragment));
}

function containsAuthPatAbbreviation(value) {
  return value.includes('auth') || value.includes('pat');
}

function isSafeSemanticKey(collapsed) {
  const family = SAFE_KEY_FAMILY_PREFIXES.find((prefix) => collapsed.startsWith(prefix));
  if (family === undefined) return false;
  const suffix = collapsed.slice(family.length);
  return (
    !containsSensitiveKeyFragment(suffix) &&
    !containsAuthPatAbbreviation(suffix) &&
    !suffix.includes('header')
  );
}

function isSecretKey(key) {
  const collapsed = collapsedSecretKey(key);
  if (isSafeSemanticKey(collapsed)) return false;
  return containsSensitiveKeyFragment(collapsed) || containsAuthPatAbbreviation(collapsed);
}

function containsCredentialSignature(value) {
  return (
    AUTHORIZATION_BEARER_RE.test(value) ||
    BEARER_CREDENTIAL_RE.test(value) ||
    GITHUB_TOKEN_RE.test(value) ||
    TOKEN_ENV_NAME_RE.test(value) ||
    PRIVATE_KEY_RE.test(value)
  );
}

export function assertNoCredentialValues(value) {
  if (typeof value === 'string') {
    if (containsCredentialSignature(value)) throw secretError();
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) assertNoCredentialValues(child);
}

/** Rejects non-durable or secret-bearing data before it becomes a record payload. */
export function assertNoSecretRecordData(value, { safeKeyNames = [] } = {}) {
  if (!Array.isArray(safeKeyNames) || !safeKeyNames.every((key) => typeof key === 'string')) {
    throw secretError();
  }
  canonicalRecordJson(value);
  const safeKeys = new Set(safeKeyNames);
  const assertNoSecretKeys = (current) => {
    if (current === null || typeof current !== 'object') return;
    for (const key of Object.keys(current)) {
      if (!safeKeys.has(key) && isSecretKey(key)) throw secretError();
      assertNoSecretKeys(current[key]);
    }
  };
  assertNoSecretKeys(value);
  assertNoCredentialValues(value);
}
