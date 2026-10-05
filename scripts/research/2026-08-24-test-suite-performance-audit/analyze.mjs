import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const files = execFileSync('git', ['ls-files', '*.test.mjs'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((f) => f.startsWith('scripts/tests/'));

const IMPORT_RE =
  /(?:^|\n)\s*(?:import[\s\S]*?from\s*|import\s*|export\s*[\s\S]*?from\s*)['"]([^'"]+)['"]/g;
const DYN_RE = /import\(\s*['"]([^'"]+)['"]/g;

const rows = [];
for (const f of files) {
  let src;
  try {
    src = readFileSync(path.join(root, f), 'utf8');
  } catch {
    continue;
  }
  const dir = path.dirname(path.join(root, f));
  const targets = new Set();
  const helpers = new Set();
  for (const re of [IMPORT_RE, DYN_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const rel = path.relative(root, path.resolve(dir, spec));
      if (rel.startsWith('scripts/tests/')) helpers.add(rel);
      else targets.add(rel);
    }
  }
  rows.push({
    file: f,
    lane: f.startsWith('scripts/tests/unit/')
      ? 'unit'
      : f.startsWith('scripts/tests/integration/')
        ? 'integration'
        : f.startsWith('scripts/tests/slow/')
          ? 'slow'
          : 'other',
    bytes: Buffer.byteLength(src),
    lines: src.split('\n').length,
    tests: (src.match(/^\s*(?:await\s+)?(?:it|test)\s*\(/gm) || []).length,
    describes: (src.match(/^\s*describe\s*\(/gm) || []).length,
    asserts: (src.match(/\bassert\.\w+\(/g) || []).length,
    spawnsSubprocess: /(?:from\s*|require\(\s*)['"]node:child_process['"]|\bchild_process\b/.test(
      src
    ),
    execFileSync: (src.match(/\bexecFileSync\s*\(/g) || []).length,
    execFileAsync: (src.match(/\bexecFile\s*\(/g) || []).length,
    spawnSync: (src.match(/\bspawnSync\s*\(/g) || []).length,
    spawnCalls: (src.match(/\bspawn\s*\(/g) || []).length,
    mkdtemp: (src.match(/mkdtemp(?:Sync)?\s*\(/g) || []).length,
    gitInitCalls: (src.match(/git[\s\S]{0,80}?['"]init['"]/g) || []).length,
    npmInstall: /npm\s+(?:ci|install)/.test(src),
    nodeChildOfNode: (src.match(/['"]node['"]\s*,\s*\[/g) || []).length,
    fakeGh: /fake[-_]?gh|FAKE_GH|gh-stub|stubGh|writeFakeGh/i.test(src),
    sleepMs: (src.match(/setTimeout\([^,]*,\s*(\d{3,})\)/g) || []).length,
    parallelUnsafe: /@parallel-unsafe\b/.test(src),
    slowParallelSafe: /@slow-parallel-safe/.test(src),
    imports: [...targets].sort(),
    helpers: [...helpers].sort(),
    story: (src.match(/@story\s+([^\n]*)/) || [])[1]?.trim() || null,
  });
}

writeFileSync('.tmp/testaudit/test-inventory.json', JSON.stringify(rows, null, 1));
console.log('files', rows.length);
console.log(
  'by lane',
  JSON.stringify(rows.reduce((a, r) => ((a[r.lane] = (a[r.lane] || 0) + 1), a), {}))
);
console.log(
  'total test cases',
  rows.reduce((a, r) => a + r.tests, 0)
);
