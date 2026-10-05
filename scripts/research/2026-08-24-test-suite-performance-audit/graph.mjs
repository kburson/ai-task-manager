// Transitive module-graph size per test file (static, no execution).
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const inv = JSON.parse(readFileSync('.tmp/testaudit/test-inventory.json', 'utf8'));

const SPEC_RE =
  /(?:^|\n)\s*(?:import[\s\S]*?from\s*|import\s*|export\s*[\s\S]*?from\s*)['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]/g;

const cache = new Map();
function deps(abs) {
  if (cache.has(abs)) return cache.get(abs);
  let src = '';
  try {
    src = readFileSync(abs, 'utf8');
  } catch {
    cache.set(abs, []);
    return [];
  }
  const dir = path.dirname(abs);
  const out = [];
  SPEC_RE.lastIndex = 0;
  let m;
  while ((m = SPEC_RE.exec(src))) {
    const spec = m[1] || m[2];
    if (!spec || !spec.startsWith('.')) continue;
    let p = path.resolve(dir, spec);
    if (!existsSync(p)) {
      if (existsSync(`${p}.mjs`)) p = `${p}.mjs`;
      else if (existsSync(`${p}.js`)) p = `${p}.js`;
      else if (existsSync(path.join(p, 'index.mjs'))) p = path.join(p, 'index.mjs');
      else continue;
    } else if (statSync(p).isDirectory()) {
      if (existsSync(path.join(p, 'index.mjs'))) p = path.join(p, 'index.mjs');
      else continue;
    }
    out.push(p);
  }
  cache.set(abs, out);
  return out;
}

function closure(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const cur = stack.pop();
    for (const d of deps(cur)) {
      if (seen.has(d)) continue;
      seen.add(d);
      stack.push(d);
    }
  }
  return seen;
}

const moduleFanIn = new Map();
const rows = [];
for (const r of inv) {
  const abs = path.join(root, r.file);
  const c = closure(abs);
  let bytes = 0;
  for (const m of c) {
    const rel = path.relative(root, m);
    moduleFanIn.set(rel, (moduleFanIn.get(rel) || 0) + 1);
    try {
      bytes += statSync(m).size;
    } catch {
      /* ignore */
    }
  }
  rows.push({ file: r.file, lane: r.lane, graphModules: c.size, graphBytes: bytes });
}

rows.sort((a, b) => b.graphModules - a.graphModules);
const fanIn = [...moduleFanIn.entries()].sort((a, b) => b[1] - a[1]);
writeFileSync('.tmp/testaudit/import-graph.json', JSON.stringify({ rows, fanIn }, null, 1));

const avg = (xs) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0);
const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(
  `test files=${rows.length} avg graph modules=${avg(rows.map((r) => r.graphModules))} median=${med(rows.map((r) => r.graphModules))}`
);
console.log(
  `avg graph bytes=${(avg(rows.map((r) => r.graphBytes)) / 1024).toFixed(0)}KB median=${(med(rows.map((r) => r.graphBytes)) / 1024).toFixed(0)}KB`
);
const buckets = [0, 1, 5, 20, 50, 100, 200, 400];
for (let i = 0; i < buckets.length; i++) {
  const lo = buckets[i];
  const hi = buckets[i + 1] ?? Infinity;
  const n = rows.filter((r) => r.graphModules >= lo && r.graphModules < hi).length;
  console.log(`  graph ${String(lo).padStart(3)}–${hi === Infinity ? '∞' : hi - 1}: ${n} files`);
}
console.log('\n--- heaviest graphs ---');
for (const r of rows.slice(0, 20))
  console.log(
    `  ${String(r.graphModules).padStart(3)} mods ${(r.graphBytes / 1024).toFixed(0).padStart(5)}KB  ${r.file.replace('scripts/tests/', '')}`
  );
console.log('\n--- highest fan-in modules (loaded by N test files) ---');
for (const [m, n] of fanIn.slice(0, 30)) {
  let sz = 0;
  try {
    sz = statSync(path.join(root, m)).size;
  } catch {
    /* ignore */
  }
  console.log(`  ${String(n).padStart(3)} files  ${(sz / 1024).toFixed(0).padStart(4)}KB  ${m}`);
}
