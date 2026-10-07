// @story #1855
// Pure native checkbox glyph transform; no current eligibility or authority.
import { stripMarkers } from './ac-evidence.mjs';

export function setChecklistLine(body, label, desired) {
  const targetChecked = desired === 'checked';
  const wanted = stripMarkers(label);
  const src = String(body);
  const lines = src.split('\n');
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \[([ x])\] (.+)$/);
    if (!m) continue;
    if (stripMarkers(m[2]) === wanted) {
      matches.push({ index: i, checked: m[1] === 'x' });
    }
  }
  if (matches.length === 0) return { status: 'not-found' };
  if (matches.length > 1) return { status: 'ambiguous', count: matches.length };
  const { index, checked: alreadyChecked } = matches[0];
  const changed = alreadyChecked !== targetChecked;
  if (!changed) {
    // Byte-identical no-op: return the original string untouched.
    return { status: 'set', body: src, changed: false, alreadyChecked };
  }
  lines[index] = lines[index].replace(/^- \[[ x]\]/, targetChecked ? '- [x]' : '- [ ]');
  return { status: 'set', body: lines.join('\n'), changed: true, alreadyChecked };
}

// Fold `setChecklistLine` over many labels against one accumulating body. A
// `not-found`/`ambiguous` label is recorded and skipped — it never aborts the
// batch. Returns { body, results } where results is
//   [{ label, status: 'set'|'not-found'|'ambiguous', changed, alreadyChecked, count? }]
export function setChecklistLines(body, labels, desired) {
  let current = body;
  const results = [];
  for (const label of labels) {
    const r = setChecklistLine(current, label, desired);
    if (r.status === 'not-found') {
      results.push({ label, status: 'not-found', changed: false, alreadyChecked: false });
      continue;
    }
    if (r.status === 'ambiguous') {
      results.push({
        label,
        status: 'ambiguous',
        changed: false,
        alreadyChecked: false,
        count: r.count,
      });
      continue;
    }
    current = r.body;
    results.push({ label, status: 'set', changed: r.changed, alreadyChecked: r.alreadyChecked });
  }
  return { body: current, results };
}

