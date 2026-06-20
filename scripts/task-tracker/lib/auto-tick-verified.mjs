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

import {
  serializeProofMarker,
  extractVerifiedCommands,
  stripProofMarkers,
} from './proof-marker.mjs';
import { stampEvidenceMarker, KEY_CLASSIFICATION } from './functional-dod-evidence.mjs';

// A Functional DoD line's canonical `dod:functional:<key>` tag. When present we
// record the run as ONE `aitm-dod-evidence` marker (upserted by
// `stampEvidenceMarker`) rather than appending a second `aitm-verified` proof
// next to the line's existing `aitm-verified cmd="…"` declaration — the
// double-`aitm-verified` redundancy #480 (AC8) removes.
const FUNCTIONAL_KEY_RE = /<!--\s*dod:functional:([a-z0-9-]+)\s*-->/i;

const HEADING_RE = /^#{1,6}\s+/;
const VC_HEADING_RE = /^#{1,6}\s+Verification Commands\b/i;
const FUNCTIONAL_HEADING_RE = /^#{1,6}\s+Functional\b/i;
// Capture the unchecked-box prefix so we can flip the marker in place while
// preserving leading whitespace and the label that follows.
const UNCHECKED_RE = /^(\s*- \[) (\]\s+)(.*)$/;
const VC_LABEL_RE = /^`([^`]+)`\s*$/;

// Extract the backtick-wrapped commands declared on a Functional item's label.
// #418 — routed through the shared dual-form extractor so a consolidated
// `aitm-verified cmd="..."` declaration is recognized identically to the legacy
// `aitm-verified-by` form. Returns [] when the item carries no declaration.
function evidenceCommands(label) {
  return extractVerifiedCommands(label);
}

// #362 — proof marker stamped inline at tick time so the
// `findCheckboxesTickedWithoutProof` invariant in `mutateIssueBody` accepts
// the resulting body. `sha="sandbox" proof="none"` is a documented sentinel
// meaning "evidence is the green sandbox exit code in hand at tick time,
// not a stored artifact reachable by URL." Callers pass `now` (ISO string)
// for determinism; defaults to `new Date().toISOString()`.
//
// #368 — emits the consolidated `<!-- aitm-verified key="value" ... -->` form
// via the shared serializer.
//
// #382 (parent epic #367) — normalized key contract: `cmd` (the backtick
// command(s) whose green exit backs the tick), `sha`, `ts` (the timestamp,
// renamed from the legacy `verified-at`), `evidence`, `proof`. No packed
// `<sha>:<iso>` value and no duplicate `sha`. Readers stay dual-tolerant
// (`parseProofMarker` maps legacy `verified-at`->`ts` and `verified-by`->`cmd`),
// so bodies written by the old shape still resolve until the #369 corpus sweep.
function buildProofMarker(now, evidence, cmd) {
  return serializeProofMarker({
    cmd,
    sha: 'sandbox',
    ts: now,
    evidence,
    proof: 'none',
  });
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
  // Keyed Functional lines ticked this run; their evidence markers are upserted
  // after the line scan so `stampEvidenceMarker` re-locates against the final
  // (box-flipped) body. `{ key, cmd }`.
  const pendingEvidence = [];

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
        const marker = buildProofMarker(now, `sandbox exit 0 (${cmd})`, cmd);
        lines[i] = `${open}x${close}${rest} ${marker}`;
        tickedVc.push(cmd);
      }
      continue;
    }

    // Functional: tick only when the item is command-backed and every
    // referenced command passed.
    const cmds = evidenceCommands(rest);
    if (cmds.length > 0 && cmds.every((c) => passed.has(c))) {
      const keyMatch = rest.match(FUNCTIONAL_KEY_RE);
      const key = keyMatch ? keyMatch[1].toLowerCase() : null;
      if (key && key in KEY_CLASSIFICATION) {
        // #480 AC8 — canonical keyed item: flip the box now, record the run as a
        // single `aitm-dod-evidence` marker below. The existing
        // `aitm-verified cmd="…"` declaration stays; no second `aitm-verified`.
        lines[i] = `${open}x${close}${rest}`;
        pendingEvidence.push({ key, cmd: cmds.join(', ') });
      } else {
        // Non-keyed (custom/legacy) declared item — no key to form a dod-evidence
        // marker, so stamp the consolidated `aitm-verified` proof inline.
        const marker = buildProofMarker(
          now,
          `sandbox exit 0 (${cmds.join(', ')})`,
          cmds.join(', ')
        );
        lines[i] = `${open}x${close}${rest} ${marker}`;
      }
      tickedFunctional.push(stripProofMarkers(rest));
    }
  }

  let outBody = lines.join('\n');
  for (const ev of pendingEvidence) {
    outBody = stampEvidenceMarker(outBody, ev.key, {
      cmd: ev.cmd,
      sha: 'sandbox',
      ts: now,
      exit: 0,
    });
  }

  return { body: outBody, tickedVc, tickedFunctional };
}
