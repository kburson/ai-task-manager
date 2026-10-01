// @story #1859
import { stripMarkers } from '../ac-evidence.mjs';
import { POLICY_MARKER, parsePointer, stripReviewedPointer, sha256, refuse } from './model.mjs';

export function isVerifierBearingScopeTarget(raw) {
  return /aitm-(?:verified(?:-by|-at)?|ac-evidence|dod-evidence)|\bvc-list\s*=|(?<![\w:])vc:[1-9][0-9]*(?![\w])/i.test(
    String(raw)
  );
}
function liveLines(body) {
  let fence = null,
    comment = false;
  const result = [];
  for (const [lineIndex, raw] of String(body).split('\n').entries()) {
    const marker = raw.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = null;
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    if (comment) {
      const end = raw.indexOf('-->');
      if (end < 0) continue;
      comment = false;
      if (raw.slice(end + 3).trim()) refuse('reviewed-scope-ambiguous-comment');
      continue;
    }
    const begin = raw.indexOf('<!--');
    if (begin >= 0 && raw.indexOf('-->', begin) < 0) {
      comment = true;
      if (raw.slice(0, begin).trim()) refuse('reviewed-scope-ambiguous-comment');
      continue;
    }
    result.push({ lineIndex, raw });
  }
  if (fence || comment) refuse('reviewed-scope-unclosed-example');
  return result;
}
export function scanScope(body) {
  const lines = liveLines(body),
    scope = lines.filter((x) => /^## Scope\s*$/.test(x.raw));
  if (scope.length !== 1) refuse('reviewed-scope-scope-heading');
  const start = scope[0].lineIndex,
    end = lines.find((x) => x.lineIndex > start && /^## /.test(x.raw))?.lineIndex ?? Infinity;
  const policies = lines.filter((x) => /<!--\s*aitm-scope-evidence-policy/.test(x.raw));
  if (
    policies.length > 1 ||
    policies.some((x) => x.raw !== POLICY_MARKER || x.lineIndex <= start || x.lineIndex >= end)
  )
    refuse('reviewed-scope-policy-invalid');
  const targets = [],
    pointers = [],
    allTargets = [];
  for (const { lineIndex, raw } of lines) {
    const inScope = lineIndex > start && lineIndex < end;
    const pointer = parsePointer(raw);
    if (pointer) pointers.push({ lineIndex, pointer, inScope });
    const match = /^\s*[-*+] \[([ xX])\] (.+)$/.exec(raw);
    const selectable = /^- \[[ x]\] (.+)$/.test(raw);
    if (!match) {
      if (pointer) refuse('reviewed-scope-pointer-target');
      continue;
    }
    const target = {
      lineIndex,
      label: stripMarkers(match[2]),
      checked: match[1] === 'x',
      raw,
      pointer,
      verifierBearing: isVerifierBearingScopeTarget(raw),
      contentDigest: sha256(stripReviewedPointer(raw).replace(/^- \[[ x]\] /, '')),
    };
    allTargets.push(target);
    if (inScope && selectable) targets.push(target);
  }
  return { policy: policies.length ? 'v1' : 'legacy', targets, pointers, allTargets };
}
export function resolveScopeTarget(body, label) {
  const scan = scanScope(body),
    wanted = stripMarkers(label),
    matches = scan.allTargets.filter((x) => x.label === wanted);
  if (matches.length !== 1 || !scan.targets.includes(matches[0])) refuse('reviewed-scope-target');
  return matches[0];
}
