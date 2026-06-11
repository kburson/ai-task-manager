import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getProjectDir } from './paths.mjs';
import { warnMissingFieldId } from './lib/field-config-warn.mjs';
import { secondsToFloatHours } from './lib/duration.mjs';

// #230 — the four board "actuals" fields are written in float-HOURS (not
// minute-rounded integers) so `Estimate − Actual` is a one-line subtraction.
// `buildFieldSyncPlan` converts these keys via `secondsToFloatHours`. Seconds
// come from the caller's `secondsByKey` map when available (close-time, true
// second precision); otherwise the field-DB minutes in `values` are used at
// minute granularity (`values[key] * 60`). The `aitm-fields` body marker is
// untouched and stays in minutes — only the board write is converted.
export const TIMING_HOUR_FIELD_KEYS = new Set([
  'engagedTime',
  'sessionTime',
  'reviewTime',
  'planTime',
]);

export function loadProjectFieldDefs(dir = getProjectDir()) {
  const local = path.join(dir, '.ai-task-manager', 'project-fields.json');
  const fallback = new URL('../../config/project-fields.default.json', import.meta.url);
  for (const file of [local, fallback]) {
    try {
      if (typeof file === 'string' && !existsSync(file)) continue;
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {}
  }
  return [];
}

export function fieldIdFor(cfg, key) {
  const direct = cfg.fieldIds?.[key];
  if (direct) return direct;
  const pascal = `${key[0].toUpperCase()}${key.slice(1)}`;
  return cfg[`field${pascal}`] || '';
}

export function valueForProjectField(value, type) {
  if (value === undefined || value === null || value === '') return null;
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? { number: n } : null;
  }
  if (type === 'date') {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? { date: String(value) } : null;
  }
  if (type === 'text') {
    return { text: String(value) };
  }
  if (type === 'single_select') {
    return { singleSelectOptionName: String(value) };
  }
  return null;
}

export function buildFieldSyncPlan({ cfg, fieldDefs, values, secondsByKey = {} }) {
  const plan = [];
  for (const def of fieldDefs) {
    const fieldId = fieldIdFor(cfg, def.key);
    if (!fieldId) {
      // #314 — surface missing field ids so operators can re-run init.
      const pascal = `${def.key[0].toUpperCase()}${def.key.slice(1)}`;
      warnMissingFieldId({ cfgKey: `field${pascal}`, context: 'field sync skipped' });
      continue;
    }
    // #230 — timing fields write float-hours, never minutes. Prefer the
    // caller's seconds (true precision); fall back to field-DB minutes×60.
    let raw = values[def.key];
    if (TIMING_HOUR_FIELD_KEYS.has(def.key)) {
      const sec =
        secondsByKey[def.key] != null
          ? secondsByKey[def.key]
          : typeof values[def.key] === 'number'
            ? values[def.key] * 60
            : null;
      raw = sec == null ? null : secondsToFloatHours(sec);
    }
    const value = valueForProjectField(raw, def.type);
    // Accept explicit zero / falsy-but-valid wrapped values. Skip only when
    // the field genuinely had no input (null/undefined upstream rejected by
    // `valueForProjectField`).
    if (value === undefined || value === null) continue;
    plan.push({ key: def.key, type: def.type, fieldId, value });
  }
  return plan;
}
