import { forceReleaseOccupancy } from '../lib/occupancy.mjs';

export function verbOccupancy(ctx) {
  const [operation, rawIssue, ...extra] = ctx.rest || [];
  if (operation === '--steal' || extra.includes('--steal')) {
    throw new Error('occupancy: --steal is unavailable; use --release #N after operator review');
  }
  if (operation !== '--release' || !/^#?\d+$/.test(String(rawIssue || '')) || extra.length) {
    throw new Error('Usage: /task occupancy --release #N');
  }
  const result = (ctx.forceReleaseOccupancy || forceReleaseOccupancy)({
    projectDir: ctx.projectDir,
    issue: rawIssue,
  });
  const ref = `#${String(rawIssue).replace(/^#/, '')}`;
  if (result.status === 'absent') {
    console.log(`Occupancy ${ref}: no claim found.`);
    return;
  }
  console.log(
    `Released occupancy ${ref}: provider=${result.row.provider} sid=${result.row.sid.slice(0, 12)} worktree=${result.row.worktreePath}`
  );
}
