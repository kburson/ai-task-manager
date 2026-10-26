import { parseProofMarker } from './proof-marker.mjs';
import { canonicalVerificationCommandSet } from './verification-receipt.mjs';

// Execution proof belongs to the declaration observed before running/reusing it.
// Ignore mutable run properties, but retain the citation and its resolved set.
export function stampDeclarationIdentity(body, target) {
  if (!target) return null;
  const properties = parseProofMarker(String(body).split('\n')[target.lineIndex]) || {};
  return JSON.stringify({
    key: target.key,
    label: target.label,
    cmd: properties.cmd ?? null,
    citations: properties['vc-list'] ?? null,
    commands: canonicalVerificationCommandSet(target.evidenceCommands),
  });
}
