export const FIELD_DB_START = '<!-- ai-task-manager:fields:start -->';
export const FIELD_DB_END = '<!-- ai-task-manager:fields:end -->';

const FENCE_START = '```json';
const FENCE_END = '```';

export function defaultFieldValues(fieldDefs = []) {
  const values = {};
  for (const def of fieldDefs) values[def.key] = null;
  return values;
}

export function parseIssueFieldDb(body) {
  const start = body.indexOf(FIELD_DB_START);
  const end = body.indexOf(FIELD_DB_END);
  if (start === -1 || end === -1 || end < start) {
    return { ok: false, reason: 'missing' };
  }
  const block = body.slice(start + FIELD_DB_START.length, end).trim();
  const jsonStart = block.indexOf(FENCE_START);
  const jsonEnd = block.lastIndexOf(FENCE_END);
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return { ok: false, reason: 'invalid-fence', start, end: end + FIELD_DB_END.length };
  }
  const raw = block.slice(jsonStart + FENCE_START.length, jsonEnd).trim();
  try {
    const parsed = JSON.parse(raw);
    const values = parsed.values && typeof parsed.values === 'object' ? parsed.values : parsed;
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      return { ok: false, reason: 'invalid-values', start, end: end + FIELD_DB_END.length };
    }
    return { ok: true, values, raw: parsed, start, end: end + FIELD_DB_END.length };
  } catch {
    return { ok: false, reason: 'invalid-json', start, end: end + FIELD_DB_END.length };
  }
}

export function formatIssueFieldDb(values) {
  const compact = JSON.stringify({ schema: 1, values });
  return `${FIELD_DB_START}\n${FENCE_START}\n${compact}\n${FENCE_END}\n${FIELD_DB_END}`;
}

export function stripIssueFieldDb(body) {
  const parsed = parseIssueFieldDb(body);
  if (parsed.start == null || parsed.end == null) return body.trimEnd();
  return `${body.slice(0, parsed.start)}${body.slice(parsed.end)}`.trimEnd();
}

function parseScalar(raw) {
  const value = raw.trim();
  if (!value) return null;
  const hours = value.match(/^([0-9]+(?:\.[0-9]+)?)\s*h(?:ours?)?$/i);
  if (hours) return Number(hours[1]);
  const minutes = value.match(/^([0-9]+(?:\.[0-9]+)?)\s*m(?:in(?:utes?)?)?$/i);
  if (minutes) return Number(minutes[1]);
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(value)) return Number(value);
  return value;
}

export function inferVisibleFieldValues(body, fieldDefs = []) {
  const values = {};
  for (const def of fieldDefs) {
    const names = [def.name, ...(def.aliases || [])];
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*(.+)$`, 'im');
      const match = body.match(re);
      if (match) {
        values[def.key] = parseScalar(match[1]);
        break;
      }
    }
  }
  return values;
}

export function normalizeFieldValues(values, fieldDefs = []) {
  const out = {};
  for (const def of fieldDefs) {
    const value = values[def.key];
    out[def.key] = value === undefined ? null : value;
  }
  return out;
}

export function ensureIssueFieldDb(body, fieldDefs = [], projectValues = {}) {
  const parsed = parseIssueFieldDb(body);
  const base = defaultFieldValues(fieldDefs);
  const visible = inferVisibleFieldValues(body, fieldDefs);
  const values = parsed.ok
    ? normalizeFieldValues({ ...base, ...projectValues, ...visible, ...parsed.values }, fieldDefs)
    : normalizeFieldValues({ ...base, ...projectValues, ...visible }, fieldDefs);
  const nextBody = `${stripIssueFieldDb(body)}\n\n${formatIssueFieldDb(values)}\n`;
  return {
    changed: !parsed.ok || nextBody !== body,
    values,
    body: nextBody,
    healed: !parsed.ok,
    reason: parsed.ok ? null : parsed.reason,
  };
}

