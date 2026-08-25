// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  doctor,
  PROBE_PACKAGES,
  probeDocument,
  REQUIRED_BINARIES,
  tlmgrHint,
} from '../../../../../articles/lib/book/toolchain.mjs';

test('probeDocument compiles a single package', () => {
  const tex = probeDocument('makeidx');
  assert.match(tex, /\\usepackage\{makeidx\}/);
  assert.match(tex, /\\begin\{document\}/);
  assert.match(tex, /\\end\{document\}/);
});

test('tlmgrHint names every missing package in one command', () => {
  assert.equal(tlmgrHint([]), null);
  assert.equal(tlmgrHint(['makeidx', 'xurl']), 'sudo tlmgr install makeidx xurl');
});

test('doctor reports a clean toolchain', async () => {
  const result = await doctor({
    runBinary: async () => true,
    runProbe: async () => true,
  });
  assert.deepEqual(result, { ok: true, missingBinaries: [], missingPackages: [], hint: null });
});

test('doctor reports missing binaries and skips probing', async () => {
  let probed = 0;
  const result = await doctor({
    runBinary: async (name) => name !== 'latexmk',
    runProbe: async () => {
      probed += 1;
      return true;
    },
  });
  assert.deepEqual(result.missingBinaries, ['latexmk']);
  assert.equal(result.ok, false);
  assert.equal(probed, 0, 'probing a missing engine would only produce noise');
});

test('doctor reports missing packages with a tlmgr hint', async () => {
  const result = await doctor({
    runBinary: async () => true,
    runProbe: async (pkg) => pkg !== 'makeidx',
  });
  assert.deepEqual(result.missingPackages, ['makeidx']);
  assert.equal(result.hint, 'sudo tlmgr install makeidx');
  assert.equal(result.ok, false);
});

test('the probe list covers what the pandoc book template needs', () => {
  for (const required of ['fontspec', 'unicode-math', 'hyperref', 'geometry', 'makeidx']) {
    assert.ok(PROBE_PACKAGES.includes(required), `missing ${required}`);
  }
  assert.deepEqual(REQUIRED_BINARIES, ['pandoc', 'xelatex', 'latexmk', 'makeindex']);
});
