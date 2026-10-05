// Does per-file wall inflate with pool width? Same 120 light files, N=1..12.
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';

const t = JSON.parse(readFileSync('.tmp/testaudit/timing-unit.json', 'utf8')).files;
const files = Object.entries(t)
  .filter(([, v]) => v.inProcMs != null && v.inProcMs < 50 && v.wallMs > 300 && v.wallMs < 900)
  .map(([f]) => f)
  .slice(0, 120);

function runOne(f) {
  return new Promise((res) => {
    const s = process.hrtime.bigint();
    execFile(process.execPath, [f], { maxBuffer: 1 << 26 }, () =>
      res(Number(process.hrtime.bigint() - s) / 1e6)
    );
  });
}

async function pool(width) {
  const q = [...files];
  const durs = [];
  const start = process.hrtime.bigint();
  await Promise.all(
    Array.from({ length: width }, async () => {
      for (;;) {
        const f = q.shift();
        if (!f) return;
        durs.push(await runOne(f));
      }
    })
  );
  const wall = Number(process.hrtime.bigint() - start) / 1e6;
  durs.sort((a, b) => a - b);
  return { wall, median: durs[durs.length >> 1], sum: durs.reduce((a, b) => a + b, 0) };
}

console.log(`${files.length} light test files, ${(await import('node:os')).cpus().length} cpus\n`);
console.log('width   wall     median/file   aggregate-cpu   speedup-vs-1');
let base = null;
for (const w of [1, 2, 4, 6, 8, 9, 12]) {
  const r = await pool(w);
  base ??= r.wall;
  console.log(
    `${String(w).padStart(5)} ${(r.wall / 1000).toFixed(1).padStart(7)}s ${r.median.toFixed(0).padStart(9)}ms ${(r.sum / 1000).toFixed(1).padStart(13)}s ${(base / r.wall).toFixed(2).padStart(13)}x`
  );
}
