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

export function parseEvidenceChecklist(body = '') {
  const lines = String(body).split('\n');
  const acceptanceCriteria = [];
  const verificationCommands = [];
  let section = '';
  let inVerificationCommands = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const heading = line.match(HEADING_RE);
    if (heading) {
      section = heading[1].trim().toLowerCase();
      inVerificationCommands = section === 'verification commands';
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
    if (inVerificationCommands) {
      const command = rawLabel.match(/^`(.+)`$/)?.[1] ?? null;
      if (command) verificationCommands.push(command);
    }
  }

  return { lines, acceptanceCriteria, verificationCommands };
}

export function auditEvidenceMarkers(body = '', { standardCommands = STANDARD_DOD_COMMANDS } = {}) {
  const parsed = parseEvidenceChecklist(body);
  const verificationSet = new Set(parsed.verificationCommands);
  const missingEvidence = parsed.acceptanceCriteria
    .filter((cb) => cb.evidenceCommands.length === 0)
    .map((cb) => ({ label: cb.label, lineIndex: cb.lineIndex }));
  const missingVerificationCommands = [];

  for (const cb of parsed.acceptanceCriteria) {
    for (const cmd of cb.evidenceCommands) {
      if (standardCommands.has(cmd)) continue;
      if (!verificationSet.has(cmd) && !missingVerificationCommands.includes(cmd)) {
        missingVerificationCommands.push(cmd);
      }
    }
  }

  const referenced = new Set(
    parsed.acceptanceCriteria.flatMap((cb) =>
      cb.evidenceCommands.filter((cmd) => !standardCommands.has(cmd))
    )
  );
  const staleVerificationCommands = parsed.verificationCommands.filter(
    (cmd) => !referenced.has(cmd)
  );

  return {
    ok: missingEvidence.length === 0 && missingVerificationCommands.length === 0,
    acceptanceCriteria: parsed.acceptanceCriteria,
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
    let end = out.length;
    for (let i = headingIdx + 1; i < out.length; i += 1) {
      if (/^##\s+/.test(out[i])) {
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

export function buildEvidenceBackfill(
  body = '',
  { mappings = {}, standardCommands = STANDARD_DOD_COMMANDS } = {}
) {
  const parsed = parseEvidenceChecklist(body);
  const audit = auditEvidenceMarkers(body, { standardCommands });
  const ambiguousLabels = audit.missingEvidence
    .map((item) => item.label)
    .filter((label) => !Array.isArray(mappings[label]) || mappings[label].length === 0);

  if (ambiguousLabels.length > 0) return { ok: false, ambiguousLabels, audit };

  let lines = [...parsed.lines];
  for (const item of audit.missingEvidence) {
    lines[item.lineIndex] =
      `${lines[item.lineIndex].trimEnd()} ${buildMarker(mappings[item.label])}`;
  }

  const postMarkerAudit = auditEvidenceMarkers(lines.join('\n'), { standardCommands });
  lines = insertVerificationCommands(lines, postMarkerAudit.missingVerificationCommands);

  return {
    ok: true,
    body: lines.join('\n'),
    addedEvidenceLabels: audit.missingEvidence.map((item) => item.label),
    addedVerificationCommands: postMarkerAudit.missingVerificationCommands,
  };
}
