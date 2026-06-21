// INTERNAL — library module, imported, never executed as a CLI and not exposed
// through `aitm`. See bin/aitm-registry.mjs (INTERNAL map) for the rationale.

export const FIELD_DB_START = '<!-- ai-task-manager:fields:start -->';
export const FIELD_DB_END = '<!-- ai-task-manager:fields:end -->';
export const FIELDS_COMMENT_PREFIX = '<!-- aitm-fields:';

const LEGACY_BLOCK_RE =
  /^[ \t]*<!--\s*ai-task-manager:fields:start\s*-->[\s\S]*?<!--\s*ai-task-manager:fields:end\s*-->/gm;
const NEW_BLOCK_RE = /^[ \t]*<!--\s*aitm-fields:\s*(\{[\s\S]*?\})\s*-->/gm;
const FENCE_INNER_RE = /```json\s*([\s\S]*?)\s*```/;

export function defaultFieldValues(fieldDefs = []) {
  const values = {};
  for (const def of fieldDefs) values[def.key] = null;
  return values;
}

function tryParseValues(rawJson) {
  try {
    const parsed = JSON.parse(rawJson);
    const values = parsed.values && typeof parsed.values === 'object' ? parsed.values : parsed;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
    return { values, raw: parsed };
  } catch {
    return null;
  }
}

function collectMatches(body) {
  const out = [];
  for (const m of body.matchAll(NEW_BLOCK_RE)) {
    out.push({ kind: 'new', start: m.index, end: m.index + m[0].length, json: m[1] });
  }
  for (const m of body.matchAll(LEGACY_BLOCK_RE)) {
    const inner = m[0];
    const fence = inner.match(FENCE_INNER_RE);
    out.push({
      kind: 'legacy',
      start: m.index,
      end: m.index + m[0].length,
      json: fence ? fence[1] : null,
    });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

export function parseIssueFieldDb(body) {
  const matches = collectMatches(body);
  if (matches.length === 0) return { ok: false, reason: 'missing' };
  const last = matches[matches.length - 1];
  if (last.json == null) {
    return {
      ok: false,
      reason: last.kind === 'legacy' ? 'invalid-fence' : 'invalid-json',
      start: last.start,
      end: last.end,
    };
  }
  const parsed = tryParseValues(last.json);
  if (!parsed) {
    return { ok: false, reason: 'invalid-json', start: last.start, end: last.end };
  }
  return { ok: true, values: parsed.values, raw: parsed.raw, start: last.start, end: last.end };
}

export function formatIssueFieldDb(values) {
  const compact = JSON.stringify({ schema: 1, values });
  return `<!-- aitm-fields: ${compact} -->`;
}

export function stripIssueFieldDb(body) {
  const stripped = body
    .replace(NEW_BLOCK_RE, '')
    .replace(LEGACY_BLOCK_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  return stripped;
}

function parseScalar(raw) {
  const value = raw.trim();
  if (!value) return null;
  const selectPrefix = value.match(/^([A-Za-z0-9]+)\s+(?:-|--|—|:)\s+.+$/);
  if (selectPrefix) return selectPrefix[1];
  const hours = value.match(/^([0-9]+(?:\.[0-9]+)?)\s*h(?:ours?)?$/i);
  if (hours) return Number(hours[1]);
  const minutes = value.match(/^([0-9]+(?:\.[0-9]+)?)\s*m(?:in(?:utes?)?)?$/i);
  if (minutes) return Number(minutes[1]);
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(value)) return Number(value);
  return value;
}

function sectionValue(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `^###\\s+${escaped}\\s*\\n+([\\s\\S]*?)(?=\\n###\\s+|\\n<!--\\s*ai-task-manager:fields:start\\s*-->|\\n<!--\\s*aitm-fields:|$)`,
    'im'
  );
  const match = body.match(re);
  if (!match) return null;
  return match[1].trim();
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
      const formValue = sectionValue(body, name);
      if (formValue != null) {
        values[def.key] = parseScalar(formValue.split('\n')[0]);
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

export function ensureIssueFieldDb(body, fieldDefs = [], projectValues = {}, options = {}) {
  const parsed = parseIssueFieldDb(body);
  const base = defaultFieldValues(fieldDefs);
  const visible = inferVisibleFieldValues(body, fieldDefs);
  // Default precedence: parsed (persisted DB) wins over projectValues (treated as defaults/seeds).
  // With { override: true } (or per-key { overrideKeys: [...] }), projectValues win — used by
  // log-issue-time.mjs to push fresh authoritative values into the body marker.
  const overrideAll = options.override === true;
  const overrideKeys = new Set(options.overrideKeys || []);
  const overrides = {};
  if (overrideAll || overrideKeys.size) {
    for (const [k, v] of Object.entries(projectValues || {})) {
      if (overrideAll || overrideKeys.has(k)) overrides[k] = v;
    }
  }
  const values = parsed.ok
    ? normalizeFieldValues(
        { ...base, ...projectValues, ...visible, ...parsed.values, ...overrides },
        fieldDefs
      )
    : normalizeFieldValues({ ...base, ...projectValues, ...visible, ...overrides }, fieldDefs);
  const nextBody = `${stripIssueFieldDb(body)}\n\n${formatIssueFieldDb(values)}\n`;
  return {
    changed: !parsed.ok || nextBody !== body,
    values,
    body: nextBody,
    healed: !parsed.ok,
    reason: parsed.ok ? null : parsed.reason,
  };
}
