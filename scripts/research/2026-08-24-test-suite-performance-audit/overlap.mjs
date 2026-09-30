import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const rows = JSON.parse(readFileSync('.tmp/testaudit/test-inventory.json', 'utf8'));

// ---- source module -> tests that import it -------------------------------
const byModule = new Map();
for (const r of rows) {
  for (const imp of r.imports) {
    const key = imp.endsWith('.mjs') || imp.endsWith('.js') ? imp : `${imp}.mjs`;
    if (!byModule.has(key)) byModule.set(key, []);
    byModule.get(key).push(r.file);
  }
}

// ---- all production source modules under scripts/ ------------------------
const allSrc = execFileSync('git', ['ls-files', 'scripts'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && !f.startsWith('scripts/tests/'));

const srcInfo = allSrc.map((f) => {
  const src = existsSync(f) ? readFileSync(f, 'utf8') : '';
  return { file: f, lines: src.split('\n').length, testCount: (byModule.get(f) || []).length };
});

const untested = srcInfo.filter((s) => s.testCount === 0);
const hot = srcInfo.filter((s) => s.testCount >= 8).sort((a, b) => b.testCount - a.testCount);

// ---- helper / fixture reuse ---------------------------------------------
const helperUse = new Map();
for (const r of rows) for (const h of r.helpers) helperUse.set(h, (helperUse.get(h) || 0) + 1);

// ---- duplicated setup fingerprints --------------------------------------
// crude: files with mkdtemp + git init but no shared helper import
const rollsOwnSandbox = rows.filter(
  (r) => r.mkdtemp > 0 && r.gitInitCalls > 0 && r.helpers.length === 0
);
const usesHelper = rows.filter((r) => r.helpers.length > 0);

const out = {
  totals: {
    testFiles: rows.length,
    testCases: rows.reduce((a, r) => a + r.tests, 0),
    assertions: rows.reduce((a, r) => a + r.asserts, 0),
    srcModules: allSrc.length,
    srcModulesUntestedByDirectImport: untested.length,
  },
  subprocess: {
    filesSpawning: rows.filter((r) => r.spawnsSubprocess).length,
    byLane: ['unit', 'integration', 'slow'].map((l) => ({
      lane: l,
      total: rows.filter((r) => r.lane === l).length,
      spawning: rows.filter((r) => r.lane === l && r.spawnsSubprocess).length,
      execFileSyncCalls: rows.filter((r) => r.lane === l).reduce((a, r) => a + r.execFileSync, 0),
      nodeChildSpawns: rows.filter((r) => r.lane === l).reduce((a, r) => a + r.nodeChildOfNode, 0),
      mkdtempCalls: rows.filter((r) => r.lane === l).reduce((a, r) => a + r.mkdtemp, 0),
      gitInitCalls: rows.filter((r) => r.lane === l).reduce((a, r) => a + r.gitInitCalls, 0),
    })),
  },
  fixtures: {
    filesUsingSharedHelper: usesHelper.length,
    filesRollingOwnGitSandbox: rollsOwnSandbox.length,
    helperUsage: [...helperUse.entries()].sort((a, b) => b[1] - a[1]),
    rollsOwnSandboxFiles: rollsOwnSandbox
      .map((r) => ({ file: r.file, lane: r.lane, mkdtemp: r.mkdtemp, gitInit: r.gitInitCalls }))
      .sort((a, b) => b.gitInit - a.gitInit),
  },
  overlap: {
    hottestModules: hot.slice(0, 60).map((s) => ({
      module: s.file,
      lines: s.lines,
      testFiles: s.testCount,
      tests: (byModule.get(s.file) || []).slice(0, 200),
    })),
    untestedModules: untested.map((s) => ({ module: s.file, lines: s.lines })),
  },
};

writeFileSync('.tmp/testaudit/overlap.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.totals, null, 1));
console.log(JSON.stringify(out.subprocess, null, 1));
console.log('shared-helper users:', out.fixtures.filesUsingSharedHelper);
console.log('roll-own git sandbox:', out.fixtures.filesRollingOwnGitSandbox);
console.log('\nTop helpers:');
for (const [h, n] of out.fixtures.helperUsage.slice(0, 25)) console.log(`  ${n}  ${h}`);
console.log('\nHottest modules (testFiles >= 8):');
for (const m of out.overlap.hottestModules.slice(0, 30))
  console.log(
    `  ${String(m.testFiles).padStart(3)} tests / ${String(m.lines).padStart(5)} src lines  ${m.module}`
  );
