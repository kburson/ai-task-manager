// @story #1500
import { fail } from './value.mjs';
import { validateRuntimeCapability } from './runtime-capabilities.mjs';

export function guardEvidenceMutation({
  selection,
  capability,
  authorityHostId,
  residentEntries,
  verb,
}) {
  if (selection?.protocol === 'v1') return { protocol: 'v1' };
  if (selection?.protocol !== 'v2') fail('protocol-selection');
  if (
    !['verify', 'test', 'review', 'approve', 'deliver', 'close', 'reopen', 'evidence'].includes(
      verb
    )
  )
    fail('entry-unsupported');
  validateRuntimeCapability(capability, { authorityHostId, residentEntries });
  return { protocol: 'v2', projection: selection.projection };
}
