// Author-time lint that rejects compound CLI commands in issue-body checklists
// before they reach `gh issue create` / `gh issue edit`. Symmetric with the
// `/task test` sandbox: same FORBIDDEN needle list, same two checklist sources
// (AC `aitm-verified cmd="..."` markers + `## Verification Commands` section).
//
// Single source of truth: `FORBIDDEN_TOKENS` is re-exported from
// `verification-allowlist.mjs` so author-time and run-time can't drift.

import { parseEvidenceChecklist } from './evidence-markers.mjs';
import { parseVerificationCommands } from './verification-commands.mjs';
import { _internals as allowlistInternals } from './verification-allowlist.mjs';
import { parseProofMarker, hasExecutionProof } from './proof-marker.mjs';
import { parseVcRefIndexes } from './vc-ref.mjs';

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

// Bare-marker matcher for the consolidated declaration form. A `cmd="..."` whose
// value carries no backticks is a malformed marker. Restricted to declarations:
// a proof stamp (ts/sha) is excluded via `hasExecutionProof`, and we read `cmd`
// through the same parser the readers use so escaping stays consistent.
const CONSOLIDATED_DECL_RE = /<!--\s*aitm-verified\s+[\s\S]*?-->/;

function collectBareMarkerWarnings(src) {
  const warnings = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (CONSOLIDATED_DECL_RE.test(line) && !hasExecutionProof(line)) {
      const props = parseProofMarker(line);
      // #773 — a `vc-list="vc:N"` id-citation marker is intentionally
      // backtick-free; its command lives in `## Verification Commands`, not the
      // marker. Never warn for the citation form: a `vc-list` attribute, or a
      // `cmd` whose value is a pure `vc:N` run (the interim ordinal citation).
      if (props && typeof props['vc-list'] === 'string') continue;
      const cmd = props && typeof props.cmd === 'string' ? props.cmd.trim() : '';
      if (cmd && parseVcRefIndexes(cmd) !== null) continue;
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
