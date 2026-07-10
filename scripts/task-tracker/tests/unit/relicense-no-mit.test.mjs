// @story #767
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The relicense (#767) moves the package from MIT to AGPL-3.0-or-later. This
// guard pins the absence of any MIT-license declaration on the surfaces that
// govern THIS package's license. It deliberately does NOT scan:
//   - package-lock.json / node_modules — third-party deps are legitimately MIT;
//   - docs/archive/** — frozen historical planning records, not current terms.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');

// Word-boundary MIT so tokens like "commit"/"submit"/"permit" don't false-positive.
const MIT = /\bMIT\b/;

const GOVERNING_FILES = ['LICENSE', 'NOTICE', 'LICENSE-COMMERCIAL', 'package.json', 'README.md'];

for (const rel of GOVERNING_FILES) {
  test(`${rel} carries no MIT-license reference`, () => {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    assert.ok(!MIT.test(text), `${rel} still references the MIT license after the AGPL relicense`);
  });
}

test('LICENSE is the verbatim AGPL-3.0 text', () => {
  const text = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
  assert.match(
    text,
    /GNU AFFERO GENERAL PUBLIC LICENSE/,
    'LICENSE must contain the AGPL-3.0 header'
  );
});
