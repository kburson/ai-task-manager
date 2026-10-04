// @story #1861
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export function snapshotTree(root) {
  const rows = [];
  const walk = (relative) => {
    const target = path.join(root, relative);
    const stat = lstatSync(target);
    const row = { path: relative, mode: stat.mode };
    if (stat.isSymbolicLink()) rows.push({ ...row, kind: 'link', target: readlinkSync(target) });
    else if (stat.isDirectory()) {
      rows.push({ ...row, kind: 'directory' });
      for (const name of readdirSync(target).sort()) walk(path.join(relative, name));
    } else if (stat.isFile())
      rows.push({
        ...row,
        kind: 'file',
        sha256: createHash('sha256').update(readFileSync(target)).digest('hex'),
      });
    else rows.push({ ...row, kind: 'other' });
  };
  walk('');
  return rows;
}
