// Author-time lint that rejects compound CLI commands in issue-body checklists
// before they reach `gh issue create` / `gh issue edit`. Symmetric with the
// `/task test` sandbox: same FORBIDDEN needle list, same two checklist sources
// (AC `aitm-verified-by:` markers + `## Verification Commands` section).
//
// Single source of truth: `FORBIDDEN_TOKENS` is re-exported from
// `verification-allowlist.mjs` so author-time and run-time can't drift.

import { parseEvidenceChecklist } from './evidence-markers.mjs';
import { parseVerificationCommands } from './verification-commands.mjs';
import { _internals as allowlistInternals } from './verification-allowlist.mjs';
import { parseProofMarker, hasExecutionProof } from './proof-marker.mjs';

export const FORBIDDEN_TOKENS = allowlistInternals.FORBIDDEN;

function scanCommand(command) {
  for (const { needle, name } of FORBIDDEN_TOKENS) {
    if (command.includes(needle)) return name;
  }
  return null;
}

export function lintChecklistCommands(body = '') {
  const violations = [];
  const src = String(body || '');

  const evidence = parseEvidenceChecklist(src);
  for (const ac of evidence.acceptanceCriteria) {
    for (const cmd of ac.evidenceCommands) {
      const rule = scanCommand(cmd);
      if (rule) {
        violations.push({
          section: 'ac-evidence-marker',
          lineIndex: ac.lineIndex,
          command: cmd,
          rule,
          severity: 'error',
        });
      }
    }
  }

  const acMarkerWarnings = collectBareMarkerWarnings(src);
  for (const w of acMarkerWarnings) violations.push(w);

  const vcItems = parseVerificationCommands(src);
  for (const item of vcItems) {
    const rule = scanCommand(item.command);
    if (rule) {
      violations.push({
        section: 'verification-commands',
        lineIndex: item.lineIndex,
        command: item.command,
        rule,
        severity: 'error',
      });
    }
  }

  const ok = violations.every((v) => v.severity !== 'error');
  return { ok, violations };
}

const EVIDENCE_RE = /<!--\s*aitm-verified-by:\s*([\s\S]*?)\s*-->/g;
// #418 — bare-marker matcher for the consolidated declaration form. A
// `cmd="..."` whose value carries no backticks is the consolidated equivalent
// of a bare legacy marker. Restricted to declarations: a proof stamp (ts/sha)
// is excluded via `hasExecutionProof`, and we read `cmd` through the same parser
// the readers use so escaping stays consistent.
const CONSOLIDATED_DECL_RE = /<!--\s*aitm-verified\s+[\s\S]*?-->/;

function collectBareMarkerWarnings(src) {
  const warnings = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let sawLegacy = false;
    for (const m of line.matchAll(EVIDENCE_RE)) {
      sawLegacy = true;
      const payload = (m[1] || '').trim();
      if (!payload) continue;
      const backtickHits = payload.match(/`[^`]+`/g);
      if (!backtickHits || backtickHits.length === 0) {
        warnings.push({
          section: 'ac-evidence-marker',
          lineIndex: i,
          command: payload,
          rule: 'missing-backticks',
          severity: 'warn',
        });
      }
    }
    // Consolidated declaration: only when the line carries no legacy marker
    // (avoids double-warning a dual-marker line) and is a declaration, not a
    // record-of-run proof stamp.
    if (!sawLegacy && CONSOLIDATED_DECL_RE.test(line) && !hasExecutionProof(line)) {
      const props = parseProofMarker(line);
      const cmd = props && typeof props.cmd === 'string' ? props.cmd.trim() : '';
      if (cmd && !/`[^`]+`/.test(cmd)) {
        warnings.push({
          section: 'ac-evidence-marker',
          lineIndex: i,
          command: cmd,
          rule: 'missing-backticks',
          severity: 'warn',
        });
      }
    }
  }
  return warnings;
}

export function formatViolations(violations) {
  return violations.map(
    (v) => `${v.severity}: ${v.section}:${v.lineIndex + 1}: \`${v.command}\` — forbidden ${v.rule}`
  );
}
