export const STANDARD_DOD_COMMANDS = new Set(['npm test', 'npm run lint', 'npm run format:check']);

const EVIDENCE_RE = /<!--\s*aitm-verified-by:\s*([\s\S]*?)\s*-->/g;
const CHECKBOX_RE = /^- \[([ x])\] (.+)$/;
const HEADING_RE = /^#{1,6}\s+(.+)$/;

function cleanLabel(label) {
  return label.replace(EVIDENCE_RE, '').trim();
}

function evidenceCommands(label) {
  const commands = [];
  for (const marker of label.matchAll(EVIDENCE_RE)) {
    for (const cmd of marker[1].matchAll(/`([^`]+)`/g)) commands.push(cmd[1]);
  }
  return commands;
}

const FUNCTIONAL_HEADING_RE = /^#{1,6}\s+Functional\b/i;

export function parseEvidenceChecklist(body = '') {
  const lines = String(body).split('\n');
  const acceptanceCriteria = [];
  const functionalDodItems = [];
  const verificationCommands = [];
  let section = '';
  let inVerificationCommands = false;
  let inFunctional = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const heading = line.match(HEADING_RE);
    if (heading) {
      section = heading[1].trim().toLowerCase();
      inVerificationCommands = section === 'verification commands';
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
        evidenceCommands: evidenceCommands(rawLabel),
      });
    }
    if (inFunctional) {
      const cmds = evidenceCommands(rawLabel);
      if (cmds.length > 0) {
        functionalDodItems.push({
          lineIndex: i,
          checked: checkbox[1] === 'x',
          label: cleanLabel(rawLabel),
          evidenceCommands: cmds,
        });
      }
    }
    if (inVerificationCommands) {
      const command = rawLabel.match(/^`(.+)`$/)?.[1] ?? null;
      if (command) verificationCommands.push(command);
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

function buildMarker(commands) {
  return `<!-- aitm-verified-by: ${commands.map((cmd) => `\`${cmd}\``).join(' ')} -->`;
}

function insertVerificationCommands(lines, commands) {
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
  for (const item of audit.missingEvidence) {
    lines[item.lineIndex] =
      `${lines[item.lineIndex].trimEnd()} ${buildMarker(mappings[item.label])}`;
  }

  const postMarkerAudit = auditEvidenceMarkers(lines.join('\n'));
  lines = insertVerificationCommands(lines, postMarkerAudit.missingVerificationCommands);

  return {
    ok: true,
    body: lines.join('\n'),
    addedEvidenceLabels: audit.missingEvidence.map((item) => item.label),
    addedVerificationCommands: postMarkerAudit.missingVerificationCommands,
  };
}
