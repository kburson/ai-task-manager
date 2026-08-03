// Shared flat-label metadata-section grammar (#892).
//
// Story Origin and Plan Metadata are adjacent top-level sections with the same
// line grammar. Callers supply the exact H2 heading; every operation stops at
// the next heading of any depth so one section can never consume the other.

const FIELD_RE = /^(?:- )?(?:\*\*([\w][\w-]*)(?:\*\*:|:\*\*)|([\w][\w-]*):)\s*(.*)$/;
const ANY_HEADING_RE = /^#{1,6}\s+/;
const KEY_RE = /^[\w][\w-]*$/;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function headingRe(heading) {
  return new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`);
}

export function normalizeMetadataLine(line) {
  const source = String(line);
  const field = parseMetadataField(source);
  if (!field || field.bold) return source;
  const bullet = source.startsWith('- ') ? '- ' : '';
  return `${bullet}**${field.key}**: ${field.value}`;
}

export function parseMetadataField(line) {
  const match = FIELD_RE.exec(String(line));
  if (!match) return null;
  return { key: match[1] ?? match[2], value: match[3], bold: match[1] != null };
}

export function isSubstantiveMetadataValue(value) {
  return String(value).replace(HTML_COMMENT_RE, '').trim().length > 0;
}

export function normalizeMetadataValue(value) {
  return String(value).split('\n').map(normalizeMetadataLine).join('\n');
}

export function sectionBounds(lines, heading) {
  const source = Array.isArray(lines) ? lines : String(lines).split('\n');
  const target = headingRe(heading);
  const headingIdx = source.findIndex((line) => target.test(line));
  if (headingIdx === -1) return null;
  let end = headingIdx + 1;
  while (end < source.length && !ANY_HEADING_RE.test(source[end])) end += 1;
  return { heading: headingIdx, start: headingIdx + 1, end };
}

export function hasNestedMetadataHeading(body, heading) {
  const lines = String(body).split('\n');
  const target = headingRe(heading);
  const start = lines.findIndex((line) => target.test(line));
  if (start === -1) return false;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) return false;
    if (ANY_HEADING_RE.test(lines[i])) return true;
  }
  return false;
}

export function normalizeMetadataSection(body, heading) {
  const source = String(body);
  const lines = source.split('\n');
  const bounds = sectionBounds(lines, heading);
  if (!bounds) return source;
  let changed = false;
  for (let i = bounds.start; i < bounds.end; i += 1) {
    const next = normalizeMetadataLine(lines[i]);
    if (next !== lines[i]) {
      lines[i] = next;
      changed = true;
    }
  }
  return changed ? lines.join('\n') : source;
}

export function findUnboldMetadataLabels(body, heading) {
  const lines = String(body).split('\n');
  const bounds = sectionBounds(lines, heading);
  if (!bounds) return [];
  const out = [];
  for (let i = bounds.start; i < bounds.end; i += 1) {
    const field = parseMetadataField(lines[i]);
    if (!field || field.bold) continue;
    out.push({ line: lines[i], label: field.key });
  }
  return out;
}

export function hasMetadataFields(body, heading) {
  const lines = String(body).split('\n');
  const bounds = sectionBounds(lines, heading);
  if (!bounds) return false;
  for (let i = bounds.start; i < bounds.end; i += 1) {
    const field = parseMetadataField(lines[i]);
    if (field && isSubstantiveMetadataValue(field.value)) return true;
  }
  return false;
}

export function metadataFieldValue(body, heading, key) {
  const lines = String(body).split('\n');
  const bounds = sectionBounds(lines, heading);
  if (!bounds) return null;
  const wanted = String(key).toLowerCase();
  for (let i = bounds.start; i < bounds.end; i += 1) {
    const field = parseMetadataField(lines[i]);
    if (field?.key.toLowerCase() === wanted) return field.value.trim();
  }
  return null;
}

export function upsertMetadataField(body, heading, key, value) {
  const field = String(key);
  if (!KEY_RE.test(field)) {
    throw new TypeError(`metadata key must match ${KEY_RE} (got ${JSON.stringify(field)})`);
  }
  const renderedValue = String(value).trim();
  if (!isSubstantiveMetadataValue(renderedValue)) {
    throw new TypeError(`metadata value for ${field} must be non-empty`);
  }

  const lines = String(body).split('\n');
  const bounds = sectionBounds(lines, heading);
  if (!bounds) throw new Error(`metadata section missing: ## ${heading}`);

  const rendered = `- **${field}**: ${renderedValue}`;
  const existing = lines.findIndex(
    (line, index) =>
      index >= bounds.start &&
      index < bounds.end &&
      parseMetadataField(line)?.key.toLowerCase() === field.toLowerCase()
  );
  if (existing !== -1) {
    if (lines[existing] === rendered) return String(body);
    lines[existing] = rendered;
    return lines.join('\n');
  }

  let insertAt = bounds.end;
  while (insertAt > bounds.start && lines[insertAt - 1].trim() === '') insertAt -= 1;
  lines.splice(insertAt, 0, rendered);
  return lines.join('\n');
}
