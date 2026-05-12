import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getProjectDir } from './paths.mjs';

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

export function buildFieldSyncPlan({ cfg, fieldDefs, values }) {
  const plan = [];
  for (const def of fieldDefs) {
    const fieldId = fieldIdFor(cfg, def.key);
    if (!fieldId) continue;
    const value = valueForProjectField(values[def.key], def.type);
    if (!value) continue;
    plan.push({ key: def.key, type: def.type, fieldId, value });
  }
  return plan;
}
