// @story #1673
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { admitGuidance } from '../../../guidance/admission.mjs';

/** Guard a supported direct executable without affecting library imports. */
export function enforceDirectGuidance(moduleUrl, command, argv = process.argv.slice(2)) {
  const invokedPath = process.argv.at(1);
  if (!invokedPath) return false;
  let direct;
  try {
    direct = realpathSync(invokedPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    // Node cannot execute a missing entrypoint; imported modules do not enforce.
    return false;
  }
  if (!direct) return false;
  const admission = admitGuidance({ argv: [command, ...argv] });
  if (!admission.admitted) {
    process.stderr.write(admission.diagnostic);
    process.exit(1);
  }
  return true;
}
