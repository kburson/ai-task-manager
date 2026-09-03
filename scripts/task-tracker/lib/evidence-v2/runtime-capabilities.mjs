// @story #1500
import { exact, fail, frozen, digestValue, hash, textValue, uuidValue } from './value.mjs';

export const REQUIRED_EVIDENCE_ENTRIES = Object.freeze([
  'approve',
  'close',
  'deliver',
  'evidence',
  'reopen',
  'review',
  'test',
  'verify',
]);

function normalizedEntries(entries) {
  if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string' || !entry))
    fail('capability-entry');
  const result = [...new Set(entries)].sort();
  if (result.length !== entries.length) fail('capability-entry-duplicate');
  return result;
}

export function buildRuntimeCapability({
  authorityHostId,
  providerMode,
  toolDigest,
  commandCatalogDigest,
  entries,
  protocolVersions = ['v1', 'v2'],
  schemaVersions = ['aitm.evidence-record/v2'],
  entryGuardVersion = '1',
}) {
  uuidValue(authorityHostId, 'capability-authority-host');
  if (!['live', 'recorded'].includes(providerMode)) fail('capability-provider');
  digestValue(toolDigest, 'capability-tool');
  digestValue(commandCatalogDigest, 'capability-catalog');
  const identity = {
    schema: 'aitm.runtime-capability/v2',
    authorityHostId,
    providerMode,
    toolDigest,
    commandCatalogDigest,
    protocolVersions: [...protocolVersions],
    schemaVersions: [...schemaVersions],
    entryGuardVersion,
    entries: normalizedEntries(entries),
  };
  textValue(entryGuardVersion, 'capability-guard-version');
  return frozen({ ...identity, capabilityDigest: hash(identity) });
}

export function validateRuntimeCapability(capability, { authorityHostId, residentEntries } = {}) {
  exact(
    capability,
    [
      'schema',
      'authorityHostId',
      'providerMode',
      'toolDigest',
      'commandCatalogDigest',
      'protocolVersions',
      'schemaVersions',
      'entryGuardVersion',
      'entries',
      'capabilityDigest',
    ],
    'capability-keys'
  );
  const rebuilt = buildRuntimeCapability(capability);
  if (rebuilt.capabilityDigest !== capability.capabilityDigest) fail('capability-digest');
  if (authorityHostId && capability.authorityHostId !== authorityHostId)
    fail('authority-host-mismatch');
  if (
    !capability.protocolVersions.includes('v2') ||
    !capability.schemaVersions.includes('aitm.evidence-record/v2')
  )
    fail('capability-version');
  const installed = new Set(capability.entries);
  for (const entry of REQUIRED_EVIDENCE_ENTRIES)
    if (!installed.has(entry)) fail('entry-inventory-incomplete');
  if (residentEntries) {
    const resident = normalizedEntries(residentEntries);
    if (resident.some((entry) => !installed.has(entry))) fail('resident-entry-incompatible');
    for (const entry of REQUIRED_EVIDENCE_ENTRIES)
      if (!resident.includes(entry)) fail('entry-inventory-incomplete');
  }
  return rebuilt;
}
