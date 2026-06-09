// #255 — auto-tick command-backed checkboxes on green sandbox verification.
//
// `/task test` (verbs/test.mjs) holds, on an all-green run, one result per
// `## Verification Commands` entry: `{ command, passed, exit }`. It already has
// direct exit-code evidence for every VC entry and for any Functional DoD item
// whose `aitm-verified-by` command(s) ran. Previously it ticked none of them,
// forcing manual box-ticking between Test and Close to satisfy the review/close
// gates the verb already had the evidence to satisfy.
//
// `autoTickVerified(body, results)` ticks exactly the boxes backed by passing
// machine evidence:
//   - `## Verification Commands`: a `- [ ] \`cmd\`` whose command exited 0.
//   - `#### Functional (verified at Test)`: an item that carries ≥1
//     `aitm-verified-by` command AND whose every referenced command passed.
//     Judgment items (no marker) are left untouched, honoring the
//     pickup-directive "do not check ahead of evidence" contract for items without
//     machine evidence. The Lifecycle section (owned by approve/close) and all
//     other sections are never touched.
//
// Pure and idempotent. The caller invokes it only on the green path, so a red
// result ticks nothing by construction.

const EVIDENCE_RE = /<!--\s*aitm-verified-by:\s*([\s\S]*?)\s*-->/g;
const HEADING_RE = /^#{1,6}\s+/;
const VC_HEADING_RE = /^#{1,6}\s+Verification Commands\b/i;
const FUNCTIONAL_HEADING_RE = /^#{1,6}\s+Functional\b/i;
// Capture the unchecked-box prefix so we can flip the marker in place while
// preserving leading whitespace and the label that follows.
const UNCHECKED_RE = /^(\s*- \[) (\]\s+)(.*)$/;
const VC_LABEL_RE = /^`([^`]+)`\s*$/;

// Extract the backtick-wrapped commands from any `aitm-verified-by` markers in
// a Functional item's label. Returns [] when the item carries no marker.
function evidenceCommands(label) {
  const commands = [];
  for (const marker of label.matchAll(EVIDENCE_RE)) {
    for (const cmd of marker[1].matchAll(/`([^`]+)`/g)) commands.push(cmd[1]);
  }
  return commands;
}

// #362 — proof marker stamped inline at tick time so the new
// `findCheckboxesTickedWithoutProof` invariant in `mutateIssueBody` accepts
// the resulting body. `sha=sandbox proof=none` is a documented sentinel
// meaning "evidence is the green sandbox exit code in hand at tick time,
// not a stored artifact reachable by URL." Callers pass `now` (ISO string)
// for determinism; defaults to `new Date().toISOString()`.
function buildProofMarker(now, evidence) {
  return `<!-- aitm-verified-at: ${now} evidence:"${evidence}" sha=sandbox proof=none -->`;
}

export function autoTickVerified(body, results = [], now = new Date().toISOString()) {
  const source = String(body || '');
  const passed = new Set(
    (Array.isArray(results) ? results : [])
      .filter((r) => r && r.passed === true && typeof r.command === 'string')
      .map((r) => r.command)
  );
  const tickedVc = [];
  const tickedFunctional = [];

  if (passed.size === 0) {
    return { body: source, tickedVc, tickedFunctional };
  }

  const lines = source.split('\n');
  let section = null; // 'vc' | 'functional' | null

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (HEADING_RE.test(line)) {
      if (VC_HEADING_RE.test(line)) section = 'vc';
      else if (FUNCTIONAL_HEADING_RE.test(line)) section = 'functional';
      else section = null;
      continue;
    }

    if (!section) continue;

    const box = line.match(UNCHECKED_RE);
    if (!box) continue;
    const [, open, close, rest] = box;

    if (section === 'vc') {
      const cmd = rest.match(VC_LABEL_RE)?.[1] ?? null;
      if (cmd && passed.has(cmd)) {
        const marker = buildProofMarker(now, `sandbox exit 0 (${cmd})`);
        lines[i] = `${open}x${close}${rest} ${marker}`;
        tickedVc.push(cmd);
      }
      continue;
    }

    // Functional: tick only when the item is command-backed and every
    // referenced command passed.
    const cmds = evidenceCommands(rest);
    if (cmds.length > 0 && cmds.every((c) => passed.has(c))) {
      const marker = buildProofMarker(now, `sandbox exit 0 (${cmds.join(', ')})`);
      lines[i] = `${open}x${close}${rest} ${marker}`;
      tickedFunctional.push(rest.replace(EVIDENCE_RE, '').trim());
    }
  }

  return { body: lines.join('\n'), tickedVc, tickedFunctional };
}
