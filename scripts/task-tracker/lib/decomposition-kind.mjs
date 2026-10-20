// @story #2073 — shared strict kind grammar; no permissive marker fallback.
import { maskFencedCodeBlocksPreservingOffsets } from './markers.mjs';
import { DECOMPOSITION_KINDS } from './decomposition-assessment.mjs';
export function classifyDecompositionKind(body) {
  const reasons = new Set();
  const kind = genuineKind(body, reasons);
  return { kind, reasons: [...reasons] };
}
function genuineKind(body, reasons) {
  const source = maskFencedCodeBlocksPreservingOffsets(body);
  const matches = [...source.matchAll(/<!--\s*aitm-issue-kind\b[\s\S]*?(?:-->|$)/gi)];
  if (!matches.length) return 'code';
  if (matches.length !== 1) {
    reasons.add('kind-duplicate');
    return 'code';
  }
  const m = matches[0];
  const marker = m[0].match(/^<!--\s*aitm-issue-kind\s+kind="([a-z-]+)"\s*-->$/i);
  const progress = source.match(/^##\s+(?:AITM\s+)?Progress Markers\s*$/im);
  const tail = progress ? source.slice(progress.index + progress[0].length) : '';
  if (
    !marker ||
    !DECOMPOSITION_KINDS.includes(marker[1].toLowerCase()) ||
    !progress ||
    m.index < progress.index ||
    /^##\s+/m.test(tail.slice(0, m.index - progress.index - progress[0].length))
  ) {
    reasons.add('kind-invalid');
    return 'code';
  }
  return marker[1].toLowerCase();
}
