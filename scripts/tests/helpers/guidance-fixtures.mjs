// @story #1671

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GUIDANCE_PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export function packagedGuidanceSource() {
  return readFileSync(
    path.join(GUIDANCE_PACKAGE_ROOT, 'instructions', 'aitm-guidance.yml'),
    'utf8'
  );
}
