// `npm test` (fast lane) stays in the set so legacy bodies keep passing;
// `npm run test:all` is the new canonical Functional-DoD command (#305).
import { parseProofMarker, serializeProofMarker } from './proof-marker.mjs';
import { parseVerificationCommands } from './verification-commands.mjs';
import { citeCommands, resolveCitedOrLiteralCommands } from './vc-ref.mjs';

export const STANDARD_DOD_COMMANDS = new Set([
  'npm test',
  'npm run test:all',
  'npm run lint',
  'npm run format:check',
]);

const CHECKBOX_RE = /^- \[([ x])\] (.+)$/;
const HEADING_RE = /^#{1,6}\s+(.+)$/;

function cleanLabel(label) {
  return label.trim();
}

function evidenceCommands(label, vcItems = []) {
  // #481 — `cmd` is the PERSISTENT declaration component, read regardless of any
  // run-props upserted onto the same `aitm-verified` marker. The pre-#481
  // `hasExecutionProof` guard hid the declared command once proof and declaration
  // shared one comment, which made a stamped AC's command vanish from the audit
  // and re-opened the #429 missing-Verification-Commands gap. A declared command
  // still needs to be listed in `## Verification Commands` whether or not it has
  // been run, so the command is always surfaced.
  const props = parseProofMarker(label);
  if (!props || typeof props.cmd !== 'string') return [];
  // #762 — resolve the declaration against the issue's VC list so a `vc:<n>`
  // citation surfaces the same literal command(s) an embedded backtick form
  // would. Without this, a citation-form AC looks evidence-less to the audit
  // (missing-evidence / missing-VC / stale-VC false positives) and to the
  // Refine→Plan demonstrability gate.
  try {
    return resolveCitedOrLiteralCommands(props.cmd, vcItems);
  } catch {
    // A citation naming a nonexistent VC position resolves to no usable
    // command; surface zero evidence so the audit flags it rather than throwing.
    return [];
  }
}

const FUNCTIONAL_HEADING_RE = /^#{1,6}\s+Functional\b/i;

export function parseEvidenceChecklist(body = '') {
  const src = String(body);
  const lines = src.split('\n');
  const acceptanceCriteria = [];
  const functionalDodItems = [];
  // #762 — the authoritative `## Verification Commands` list, parsed via the
  // same primitive the read side uses to resolve `vc:<n>` citations
  // (`parseVerificationCommands`), so emit/audit and consume agree on the exact
  // 1-based positions a citation indexes into.
  const vcItems = parseVerificationCommands(src);
  const verificationCommands = vcItems.map((it) => it.command);
  let section = '';
  let inFunctional = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const heading = line.match(HEADING_RE);
    if (heading) {
      section = heading[1].trim().toLowerCase();
      inFunctional = FUNCTIONAL_HEADING_RE.test(line);
      continue;
    }

    const checkbox = line.match(CHECKBOX_RE);
    if (!checkbox) continue;
    const rawLabel = checkbox[2].trim();
    if (section === 'acceptance criteria') {
      acceptanceCriteria.push({
        lineIndex: i,
        checked: checkbox[1] === 'x',
        label: cleanLabel(rawLabel),
        evidenceCommands: evidenceCommands(rawLabel, vcItems),
      });
    }
    if (inFunctional) {
      const cmds = evidenceCommands(rawLabel, vcItems);
      if (cmds.length > 0) {
        functionalDodItems.push({
          lineIndex: i,
          checked: checkbox[1] === 'x',
          label: cleanLabel(rawLabel),
          evidenceCommands: cmds,
        });
      }
    }
  }

  return { lines, acceptanceCriteria, functionalDodItems, verificationCommands };
}

// #231 — closes Hole 1 (standard-command exemption) and Hole 2 (Functional DoD
// items invisible to the audit). Every command claimed as `aitm-verified-by`
// evidence — by an AC OR by a Functional DoD item — must appear in
// `## Verification Commands` so the sandbox actually runs it. `standardCommands`
// is retained as a parameter for backward compatibility but no longer exempts.
export function auditEvidenceMarkers(body = '', _opts = {}) {
  const parsed = parseEvidenceChecklist(body);
  const verificationSet = new Set(parsed.verificationCommands);
  const missingEvidence = parsed.acceptanceCriteria
    .filter((cb) => cb.evidenceCommands.length === 0)
    .map((cb) => ({ label: cb.label, lineIndex: cb.lineIndex }));
  const missingVerificationCommands = [];

  const allClaimants = [...parsed.acceptanceCriteria, ...parsed.functionalDodItems];
  for (const cb of allClaimants) {
    for (const cmd of cb.evidenceCommands) {
      if (!verificationSet.has(cmd) && !missingVerificationCommands.includes(cmd)) {
        missingVerificationCommands.push(cmd);
      }
    }
  }

  const referenced = new Set(allClaimants.flatMap((cb) => cb.evidenceCommands));
  const staleVerificationCommands = parsed.verificationCommands.filter(
    (cmd) => !referenced.has(cmd)
  );

  return {
    ok: missingEvidence.length === 0 && missingVerificationCommands.length === 0,
    acceptanceCriteria: parsed.acceptanceCriteria,
    functionalDodItems: parsed.functionalDodItems,
    verificationCommands: parsed.verificationCommands,
    missingEvidence,
    missingVerificationCommands,
    staleVerificationCommands,
  };
}

// #419 (C2): the consolidated declaration form. #762: the `cmd` inner value is
// pre-built by the caller — either a `vc:<n>` citation run (the authoring
// default when a VC list is available to cite into) or a legacy space-joined
// backtick-embedded command list (the compat path when no VC context exists).
// Every reader is dual-form (#418/#419/#721), so both remain readable.
function buildMarker(cmd) {
  return serializeProofMarker({ cmd });
}

// #422 — a line already carrying a rich `aitm-dod-evidence` marker (the
// functional-DoD execution proof from #303/#345) needs no separate
// `aitm-verified` declaration: the evidence marker is a strict content superset
// (same `cmd` plus exit/sha/ts/key). Emitting the declaration there is redundant
// and can trip `detectFunctionalPretick`'s spurious un-tick. Matches both the
// keyed (`aitm-dod-evidence:key`) and new (`aitm-dod-evidence key="…"`) forms.
const DOD_EVIDENCE_RE = /<!--\s*aitm-dod-evidence(?::[a-z0-9-]+)?\s[\s\S]*?-->/i;

function lineHasDodEvidence(line) {
  return DOD_EVIDENCE_RE.test(String(line));
}

export function insertVerificationCommands(lines, commands) {
  if (commands.length === 0) return lines;
  const out = [...lines];
  const headingIdx = out.findIndex((line) => /^#{2,3}\s+Verification Commands\b/i.test(line));
  if (headingIdx >= 0) {
    // #296: section-end detection must be heading-level aware.
    // If `### Verification Commands` (H3) is nested under a Deep-Dive H2,
    // we must terminate at the NEXT heading of the same or higher level
    // (H1/H2/H3 — i.e. depth `<=` matched depth), not at the next H2.
    // Otherwise we sail past sibling H3 subsections (`### Identified
    // risks`, `### Sibling sub-issues`) and insert bullets in the wrong
    // logical section — the parser tracks `inVerificationCommands` by
    // the most recent heading at ANY level, so the inserted bullets get
    // dropped on audit.
    const matched = out[headingIdx].match(/^(#{1,6})\s+/);
    const matchedLevel = matched ? matched[1].length : 2;
    const sameOrHigherRe = new RegExp(`^#{1,${matchedLevel}}\\s+`);
    let end = out.length;
    for (let i = headingIdx + 1; i < out.length; i += 1) {
      if (sameOrHigherRe.test(out[i])) {
        end = i;
        break;
      }
    }
    const insertion = commands.map((cmd) => `- [ ] \`${cmd}\``);
    out.splice(end, 0, ...(out[end - 1]?.trim() ? [''] : []), ...insertion);
    return out;
  }

  const pickupIdx = out.findIndex((line) => /^##\s+Pickup Directive\b/i.test(line));
  const insertAt = pickupIdx >= 0 ? pickupIdx : out.length;
  out.splice(
    insertAt,
    0,
    '### Verification Commands',
    '',
    ...commands.map((cmd) => `- [ ] \`${cmd}\``),
    ''
  );
  return out;
}

export function buildEvidenceBackfill(body = '', { mappings = {} } = {}) {
  const parsed = parseEvidenceChecklist(body);
  const audit = auditEvidenceMarkers(body);
  const ambiguousLabels = audit.missingEvidence
    .map((item) => item.label)
    .filter((label) => !Array.isArray(mappings[label]) || mappings[label].length === 0);

  if (ambiguousLabels.length > 0) return { ok: false, ambiguousLabels, audit };

  let lines = [...parsed.lines];
  const skippedDodEvidenceLabels = [];
  // #762 — emit `vc:<n>` citations by default. Start from the issue's
  // authoritative VC list and grow it as ACs cite commands not yet present, so
  // each cited 1-based position is stable and matches the bullets appended
  // below. A command already in the list reuses its position; the VC-insertion
  // set is driven by the citation append-set (not a post-marker re-audit), so
  // the marker's citation and the inserted bullet can never disagree.
  const running = parseVerificationCommands(body).map((it) => ({ command: it.command }));
  const addedVerificationCommands = [];
  for (const item of audit.missingEvidence) {
    // #422 — never append a redundant `aitm-verified` declaration to a line
    // that already carries an `aitm-dod-evidence` marker. The evidence marker
    // is a strict content superset of the declaration, so the declaration adds
    // nothing and risks a `detectFunctionalPretick` spurious un-tick.
    if (lineHasDodEvidence(lines[item.lineIndex])) {
      skippedDodEvidenceLabels.push(item.label);
      continue;
    }
    const commands = mappings[item.label];
    const { cmd, appended } = citeCommands(commands, running);
    for (const c of appended) {
      running.push({ command: c });
      if (!addedVerificationCommands.includes(c)) addedVerificationCommands.push(c);
    }
    lines[item.lineIndex] = `${lines[item.lineIndex].trimEnd()} ${buildMarker(cmd)}`;
  }

  lines = insertVerificationCommands(lines, addedVerificationCommands);

  return {
    ok: true,
    body: lines.join('\n'),
    addedEvidenceLabels: audit.missingEvidence.map((item) => item.label),
    addedVerificationCommands,
  };
}
