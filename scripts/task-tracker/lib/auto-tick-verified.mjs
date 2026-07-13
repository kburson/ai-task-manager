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
//   - `## Acceptance Criteria` (#721): an item whose `aitm-verified` marker
//     declares `cmd="vc:<n>"` (one or more citations into the issue's own VC
//     list) or a legacy embedded command ticks only once every resolved
//     command passed (AND-fan-in) — a partial citation match leaves it unticked.
//
// Pure and idempotent. The caller invokes it only on the green path, so a red
// result ticks nothing by construction.

import {
  upsertProofMarker,
  extractVerifiedCommands,
  stripProofMarkers,
  parseProofMarker,
} from './proof-marker.mjs';
import { stampEvidenceMarker, KEY_CLASSIFICATION } from './functional-dod-evidence.mjs';
// #719 — share the exact VC command-line regex the runner-side parser uses, so
// a VC line carrying a trailing `<!-- ... -->` declaration ticks back identically
// to how `parseVerificationCommands` extracts and runs it. A local strict copy
// (the old `VC_LABEL_RE`) drifted from #368's tolerant `BACKTICK_CMD_RE` and
// silently left green-but-commented VC boxes unticked.
import { BACKTICK_CMD_RE, parseVerificationCommands } from './verification-commands.mjs';
// #721 — resolve an AC's `cmd="vc:<n>"` citation against the issue's own VC
// list before checking every cited command's pass state (AND-fan-in). A
// legacy embedded-command AC (`cmd="\`...\`"`) resolves unchanged.
import { resolveCitedOrLiteralCommands, resolveVcRefCommands } from './vc-ref.mjs';

// A Functional DoD line's canonical `dod:functional:<key>` tag. When present we
// record the run by upserting run-props into that line's single `aitm-verified`
// marker (via `stampEvidenceMarker`) rather than emitting a sibling evidence
// comment — the two-marker form #481 collapses.
const FUNCTIONAL_KEY_RE = /<!--\s*dod:functional:([a-z0-9-]+)\s*-->/i;

const HEADING_RE = /^#{1,6}\s+/;
const VC_HEADING_RE = /^#{1,6}\s+Verification Commands\b/i;
const FUNCTIONAL_HEADING_RE = /^#{1,6}\s+Functional\b/i;
const AC_HEADING_RE = /^#{1,6}\s+Acceptance Criteria\b/i;
// Capture the unchecked-box prefix so we can flip the marker in place while
// preserving leading whitespace and the label that follows.
const UNCHECKED_RE = /^(\s*- \[) (\]\s+)(.*)$/;

// Extract the backtick-wrapped commands declared on a Functional item's label.
// #418 — routed through the shared dual-form extractor so a consolidated
// `aitm-verified cmd="..."` declaration is recognized identically to the legacy
// `aitm-verified-by` form. Returns [] when the item carries no declaration.
function evidenceCommands(label) {
  return extractVerifiedCommands(label);
}

// #481 — run-props upserted into the line's single `aitm-verified` marker at
// tick time so the `findCheckboxesTickedWithoutProof` invariant in
// `mutateIssueBody` accepts the resulting body. `sha="sandbox"` is the
// documented sentinel meaning "evidence is the green sandbox exit code in hand
// at tick time, not a stored artifact reachable by URL"; the vestigial
// `proof="none"` sentinel is dropped. `exit="0"` records the passing exit code.
// Callers pass `now` (ISO string) for determinism; defaults to now.
//
// `cmd` is included only when the line carries no existing `aitm-verified`
// declaration — `upsertProofMarker` preserves a present declaration's cmd, so
// re-seeding it would be redundant. VC entries have no declaration, so they
// always seed cmd.
function runProps(now, evidence, { cmd } = {}) {
  const props = { exit: '0', sha: 'sandbox', ts: now, evidence };
  if (cmd != null) props.cmd = cmd;
  return props;
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
  const tickedAc = [];

  if (passed.size === 0) {
    return { body: source, tickedVc, tickedFunctional, tickedAc };
  }

  const vcItems = parseVerificationCommands(source);
  const lines = source.split('\n');
  let section = null; // 'vc' | 'functional' | 'ac' | null
  // Keyed Functional lines ticked this run; their evidence markers are upserted
  // after the line scan so `stampEvidenceMarker` re-locates against the final
  // (box-flipped) body. `{ key, cmd }`.
  const pendingEvidence = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (HEADING_RE.test(line)) {
      if (VC_HEADING_RE.test(line)) section = 'vc';
      else if (FUNCTIONAL_HEADING_RE.test(line)) section = 'functional';
      else if (AC_HEADING_RE.test(line)) section = 'ac';
      else section = null;
      continue;
    }

    if (!section) continue;

    const box = line.match(UNCHECKED_RE);
    if (!box) continue;
    const [, open, close, rest] = box;

    if (section === 'vc') {
      const cmd = rest.match(BACKTICK_CMD_RE)?.[1] ?? null;
      if (cmd && passed.has(cmd)) {
        const flipped = upsertProofMarker(rest, runProps(now, `sandbox exit 0 (${cmd})`, { cmd }));
        lines[i] = `${open}x${close}${flipped}`;
        tickedVc.push(cmd);
      }
      continue;
    }

    if (section === 'ac') {
      // #721 — resolve the AC's declared `cmd` (either a `vc:<n>` citation or
      // a legacy embedded command) and tick only when every resolved command
      // passed (AND-fan-in). A citation naming a nonexistent VC entry is a
      // malformed body, not sandbox evidence to act on — leave the box alone.
      const props = parseProofMarker(rest);
      let cmds = [];
      // #803 — mirror `ac-evidence.mjs::extractCommands`: the canonical by-id
      // citation (#774) lives in the `vc-list` attribute (the form #773's
      // Refine-exit guardrail mandates), resolved strictly by id. The legacy
      // `cmd` attribute is the fallback. Reading only `cmd` (pre-#803) left a
      // `vc-list`-cited AC un-ticked by a green sandbox, so Develop→Test then
      // refused with a misleading `code-complete-ac-unticked`.
      if (props && typeof props['vc-list'] === 'string') {
        try {
          cmds = resolveVcRefCommands(props['vc-list'], vcItems) || [];
        } catch {
          cmds = [];
        }
      } else if (props && typeof props.cmd === 'string') {
        try {
          cmds = resolveCitedOrLiteralCommands(props.cmd, vcItems);
        } catch {
          cmds = [];
        }
      }
      if (cmds.length > 0 && cmds.every((c) => passed.has(c))) {
        const flipped = upsertProofMarker(
          rest,
          runProps(now, `sandbox exit 0 (${cmds.join(', ')})`)
        );
        lines[i] = `${open}x${close}${flipped}`;
        tickedAc.push(stripProofMarkers(rest));
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
        // #481 — canonical keyed item: flip the box now, upsert run-props into
        // the line's single `aitm-verified` marker below (located by its
        // `dod:functional:<key>` tag). The declaration's `cmd` is preserved.
        lines[i] = `${open}x${close}${rest}`;
        pendingEvidence.push({ key, cmd: cmds.join(', ') });
      } else {
        // Non-keyed (custom/legacy) declared item — upsert run-props into the
        // existing `aitm-verified cmd="…"` declaration in place. cmd is omitted
        // so the declaration's command survives unchanged (no second marker).
        const flipped = upsertProofMarker(
          rest,
          runProps(now, `sandbox exit 0 (${cmds.join(', ')})`)
        );
        lines[i] = `${open}x${close}${flipped}`;
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

  return { body: outBody, tickedVc, tickedFunctional, tickedAc };
}
