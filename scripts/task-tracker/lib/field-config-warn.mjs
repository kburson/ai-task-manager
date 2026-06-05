// #314 — Operator-visible warnings when a project-field id is missing from
// `.ai-task-manager/task-tracker.json`.
//
// Several helpers silently no-op when their required `cfg.field*` key is
// absent. Verbs report success, body markers land, but the kanban board
// column stays empty. Operators have no signal that the configuration is
// incomplete.
//
// This module emits a single-line WARN to stderr the first time each key is
// observed missing in a process. Re-runs in the same process are deduped to
// keep the log readable under block/unblock loops.

const warned = new Set();

/**
 * Project-field display names keyed by the cfg.field* key. Used to render
 * a human-readable WARN. Unknown keys fall back to the cfg key itself.
 */
const DISPLAY_NAMES = {
  fieldBlockedBy: 'Blocked By',
  fieldStartTime: 'Start Time',
  fieldEngagedTime: 'Engaged Time',
  fieldSessionTime: 'Session Time',
  fieldReviewTime: 'Review Time',
  fieldEstimate: 'Estimate',
  fieldSize: 'Size',
  fieldPriority: 'Priority',
  fieldSequence: 'Sequence',
  fieldKanban: 'Status',
};

/**
 * Emit a single-line WARN to stderr when a required cfg.field* key is
 * absent. Deduped per (process, key).
 *
 * @param {object} opts
 * @param {string} opts.cfgKey     The cfg key that was missing (e.g. "fieldBlockedBy").
 * @param {string} [opts.displayName]  Override the display name.
 * @param {string} [opts.context]      Optional one-phrase tail (e.g. "board mirror skipped").
 * @param {object} [opts.stream]       Override stderr (test injection).
 * @returns {boolean}  true when a WARN was emitted; false when deduped.
 */
export function warnMissingFieldId({ cfgKey, displayName, context, stream } = {}) {
  if (!cfgKey || typeof cfgKey !== 'string') return false;
  if (warned.has(cfgKey)) return false;
  warned.add(cfgKey);
  const out = stream || process.stderr;
  const name = displayName || DISPLAY_NAMES[cfgKey] || cfgKey;
  const tail = context ? ` — ${context}` : '';
  const msg =
    `[task-tracker] WARN: required project field "${name}" (cfg.${cfgKey}) ` +
    `is not configured${tail}. Re-run \`scripts/gh/init-project-config.sh\` ` +
    `to discover and persist field ids.\n`;
  out.write(msg);
  return true;
}

/**
 * Reset the dedupe set. Intended for tests; not part of the runtime contract.
 */
export function __resetFieldConfigWarnings() {
  warned.clear();
}

/**
 * Project-field cfg keys the self-check considers "well-known". When any of
 * these are absent the startup self-check emits a consolidated WARN listing
 * the missing keys.
 */
export const WELL_KNOWN_FIELD_KEYS = Object.keys(DISPLAY_NAMES);

/**
 * One-shot startup self-check. Examines the loaded cfg and emits a single
 * consolidated WARN listing every well-known field key that is absent. The
 * WARN is deduped per process via the same `warned` set keyed by
 * `__selfCheck__`.
 *
 * @param {object} opts
 * @param {object} opts.cfg     Loaded config object.
 * @param {object} [opts.stream]
 * @returns {{warned: boolean, missing: string[]}}
 */
export function selfCheckFieldConfig({ cfg, stream } = {}) {
  if (warned.has('__selfCheck__')) return { warned: false, missing: [] };
  const missing = WELL_KNOWN_FIELD_KEYS.filter((k) => !cfg || !cfg[k]);
  if (missing.length === 0) return { warned: false, missing: [] };
  warned.add('__selfCheck__');
  for (const k of missing) warned.add(k); // suppress per-site repeats this process
  const out = stream || process.stderr;
  const labels = missing.map((k) => `${DISPLAY_NAMES[k] || k} (cfg.${k})`).join(', ');
  out.write(
    `[task-tracker] WARN: configuration is missing ${missing.length} known project field id(s): ${labels}. ` +
      `Some board mirrors will be skipped. Re-run \`scripts/gh/init-project-config.sh\` to discover and persist them.\n`
  );
  return { warned: true, missing };
}
