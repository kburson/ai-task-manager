// Verification-Commands parser (#137). Extracts the `- [ ] \`cmd\`` checkbox
// list from the `## Verification Commands` section of an issue body.
//
// Returns `[{ label, command, checked, lineIndex }, ...]` in body order.
// Used by the sandboxed `/task test` runner and (read-only) by the slimmed
// `/task review` AC-ticker.

const VC_HEADING_RE = /^#{1,6}\s+Verification Commands\s*$/i;
const ANY_HEADING_RE = /^#{1,6}\s+/;
const CHECKBOX_RE = /^- \[([ x])\] (.+)$/;
const BACKTICK_CMD_RE = /^`([^`]+)`$/;

export function parseVerificationCommands(body) {
  const src = String(body || '');
  const lines = src.split('\n');
  const items = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (VC_HEADING_RE.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && ANY_HEADING_RE.test(line)) {
      inSection = false;
      continue;
    }
    if (!inSection) continue;
    const cb = line.match(CHECKBOX_RE);
    if (!cb) continue;
    const checked = cb[1] === 'x';
    const label = cb[2].trim();
    const cmdMatch = label.match(BACKTICK_CMD_RE);
    if (!cmdMatch) continue;
    items.push({
      lineIndex: i,
      checked,
      label,
      command: cmdMatch[1],
    });
  }
  return items;
}
