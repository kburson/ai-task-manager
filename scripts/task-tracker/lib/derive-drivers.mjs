// Auto-derive drivers under Full-Auto mode from observable signals on the
// issue body + comments + fields. Pure functions only: each detector takes
// `{ body, comments, fields }` and returns zero or one driver bullet string.
//
// Detectors are intentionally cheap — no external API calls, just regex
// against material already fetched by the approve verb.

import { unescapeValue } from './marker-grammar.mjs';

/** @typedef {{ body:string, comments:Array<{body:string,createdAt:string}>, fields:Record<string,any> }} Signals */

const SANDBOX_FAIL_RE = /##\s+✗\s+Sandboxed verification failed/;
const ENTERED_DEVELOP_RE = /<!--\s*aitm-entered-develop[: ]/g;
// Dual-grammar (#381): legacy colon CSV + new quoted-attribute `shas="..."`.
const COMMITS_MARKER_LEGACY_RE = /<!--\s*aitm-commits:\s*([\s\S]*?)\s*-->/;
const COMMITS_MARKER_NEW_RE = /<!--\s*aitm-commits\s+shas="((?:[^"]|&quot;)*)"\s*-->/;

/** Δ% misestimate detector — emits when |Δ%| > 100. */
export function detectMisestimate({ fields }) {
  if (!fields) return null;
  const estHr = Number(fields.estimate);
  const actMin = Number(fields.engagedTime);
  if (!Number.isFinite(estHr) || estHr <= 0) return null;
  if (!Number.isFinite(actMin)) return null;
  const estMin = estHr * 60;
  if (estMin === 0) return null;
  const deltaPct = ((actMin - estMin) / estMin) * 100;
  if (Math.abs(deltaPct) > 100) {
    const sign = deltaPct >= 0 ? '+' : '−';
    return `significant misestimate (Δ ${sign}${Math.abs(deltaPct).toFixed(0)}%)`;
  }
  return null;
}

/** Sandbox-failure count — emits when >= 2 failed sandbox runs. */
export function detectSandboxRetries({ comments }) {
  if (!Array.isArray(comments)) return null;
  let count = 0;
  for (const c of comments) {
    if (!c || typeof c.body !== 'string') continue;
    if (SANDBOX_FAIL_RE.test(c.body)) count += 1;
  }
  if (count >= 2) return `${count} test-cycle retries in sandbox`;
  return null;
}

/** Re-pickup — emits when develop-entry marker appears more than once. */
export function detectRepickup({ body }) {
  if (typeof body !== 'string') return null;
  const matches = body.match(ENTERED_DEVELOP_RE);
  if (matches && matches.length > 1) {
    return 'develop-stage re-entry detected';
  }
  return null;
}

/** Large diff vs Size — emits when commit lines-changed exceeds Size threshold. */
export function detectLargeDiff({ body, fields }) {
  if (typeof body !== 'string' || !fields) return null;
  const neu = body.match(COMMITS_MARKER_NEW_RE);
  const payload = neu ? unescapeValue(neu[1]) : (body.match(COMMITS_MARKER_LEGACY_RE)?.[1] ?? null);
  if (payload == null) return null;
  // Lines-changed is a rough heuristic; parse `+N -M` patterns and sum.
  let total = 0;
  for (const lc of payload.matchAll(/\+(\d+)\s*[/\-]\s*-?(\d+)/g)) {
    total += Number(lc[1]) + Number(lc[2]);
  }
  if (total === 0) return null;
  const size = String(fields.size || '').toUpperCase();
  const threshold = { XS: 50, S: 150, M: 400, L: 1000, XL: 2500 }[size] ?? null;
  if (threshold !== null && total > threshold) {
    return `scope larger than Size suggested (${total} lines vs ${size} threshold ${threshold})`;
  }
  return null;
}

/**
 * Compose detectors into a final drivers list. If none fire, emit a single
 * fallback bullet so the audit trail isn't silent.
 *
 * @param {Signals} signals
 * @returns {string[]}
 */
export function deriveDrivers(signals) {
  const detectors = [detectMisestimate, detectSandboxRetries, detectRepickup, detectLargeDiff];
  const out = [];
  for (const d of detectors) {
    try {
      const r = d(signals || {});
      if (r) out.push(r);
    } catch {
      // detector errors must not crash the verb; skip.
    }
  }
  if (out.length === 0) {
    out.push('no notable drivers observed (auto-derived under TT_FULL_AUTO)');
  }
  return out;
}
