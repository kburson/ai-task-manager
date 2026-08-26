// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  doctor,
  EPUB_BINARIES,
  PROBE_PACKAGES,
  probeDocument,
  REQUIRED_BINARIES,
  requiredBinariesFor,
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
  assert.deepEqual(result, {
    ok: true,
    latexChecked: true,
    missingBinaries: [],
    missingPackages: [],
    hint: null,
  });
});

test('an EPUB target needs Pandoc and archive tools but no LaTeX', async () => {
  const asked = [];
  let probed = 0;
  const result = await doctor({
    targets: ['epub', 'html'],
    runBinary: async (name) => {
      asked.push(name);
      return ['pandoc', 'zip', 'unzip'].includes(name);
    },
    runProbe: async () => {
      probed += 1;
      return true;
    },
  });
  assert.deepEqual(asked, ['pandoc', 'zip', 'unzip'], 'no LaTeX binary is demanded');
  assert.equal(probed, 0, 'no LaTeX package probe is compiled');
  assert.equal(result.ok, true, 'a TeX-free machine can still render epub and html');
  assert.equal(result.latexChecked, false);
});

test('a non-pdf target still fails when pandoc is missing', async () => {
  const result = await doctor({
    targets: ['html'],
    runBinary: async () => false,
    runProbe: async () => true,
  });
  assert.deepEqual(result.missingBinaries, ['pandoc']);
  assert.equal(result.ok, false);
});

test('requiredBinariesFor adds the LaTeX chain only for the pdf target', () => {
  assert.deepEqual(EPUB_BINARIES, ['zip', 'unzip']);
  assert.deepEqual(requiredBinariesFor(['epub']), ['pandoc', 'zip', 'unzip']);
  assert.deepEqual(requiredBinariesFor(['html']), ['pandoc']);
  assert.deepEqual(requiredBinariesFor(['manuscript', 'pdf']), REQUIRED_BINARIES);
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

test('doctor names a missing page-style package in its pasteable hint', async () => {
  const result = await doctor({
    runBinary: async () => true,
    runProbe: async (pkg) => pkg !== 'fancyhdr',
  });
  assert.deepEqual(result.missingPackages, ['fancyhdr']);
  assert.equal(result.hint, 'sudo tlmgr install fancyhdr');
});

test('the probe list covers what the pandoc book template needs', () => {
  for (const required of ['fontspec', 'unicode-math', 'hyperref', 'geometry', 'makeidx']) {
    assert.ok(PROBE_PACKAGES.includes(required), `missing ${required}`);
  }
  assert.ok(PROBE_PACKAGES.includes('adjustbox'));
  assert.ok(PROBE_PACKAGES.includes('fancyhdr'));
  assert.deepEqual(REQUIRED_BINARIES, ['pandoc', 'xelatex', 'latexmk', 'makeindex']);
});
