// Strict allowlist validator for /task review verification commands.
//
// Goal: a verification command extracted from an issue body must never reach a
// shell. This module returns an `argv` array suitable for `execFile`, or an
// explicit rejection. See issue #2 for threat model.

import path from 'node:path';
import { existsSync, statSync } from 'node:fs';

const FORBIDDEN = [
  { needle: ';', name: 'semicolon (;)' },
  { needle: '&&', name: 'logical-and (&&)' },
  { needle: '||', name: 'logical-or (||)' },
  { needle: '|', name: 'pipe (|)' },
  { needle: '>', name: 'redirect (>)' },
  { needle: '<', name: 'redirect (<)' },
  { needle: '`', name: 'backtick (`)' },
  { needle: '$(', name: 'command substitution ($()' },
  { needle: '\n', name: 'newline (\\n)' },
  { needle: '\r', name: 'carriage return (\\r)' },
];

const BIN_ALLOWLIST = new Set([
  'node', 'npm', 'npx', 'pnpm', 'yarn',
  'bash', 'sh',
  'python', 'python3', 'pytest',
  'gh', 'git', 'make',
]);

// Tokenize on whitespace, respecting balanced single/double quotes. We do NOT
// interpret backslash escapes — any string with shell metacharacters has been
// rejected upstream by the FORBIDDEN check, so quotes are the only nuance left.
function tokenize(raw) {
  const tokens = [];
  let buf = '';
  let quote = null; // null, "'" or '"'
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      buf += ch;
      continue;
    }
    if (ch === '\'' || ch === '"') { quote = ch; continue; }
    if (ch === ' ' || ch === '\t') {
      if (buf.length) { tokens.push(buf); buf = ''; }
      continue;
    }
    buf += ch;
  }
  if (quote) return { error: `unbalanced quote (${quote})` };
  if (buf.length) tokens.push(buf);
  return { tokens };
}

export function validateVerificationCommand(raw, opts = {}) {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'command must be a string' };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'empty command' };

  for (const { needle, name } of FORBIDDEN) {
    if (raw.includes(needle)) {
      return { ok: false, reason: `forbidden ${name}` };
    }
  }

  const tok = tokenize(trimmed);
  if (tok.error) return { ok: false, reason: tok.error };
  const argv = tok.tokens;
  if (argv.length === 0) return { ok: false, reason: 'empty command' };

  const head = argv[0];

  // Branch 1: bare-name binary in allowlist.
  if (BIN_ALLOWLIST.has(head)) {
    return { ok: true, argv };
  }

  // Branch 2: relative path under ./scripts/ or scripts/ resolving inside the
  // project's scripts dir, ending in .mjs or .sh, that exists.
  const projectDir = opts.projectDir;
  if (!projectDir) {
    return { ok: false, reason: `argv[0] not in allowlist: ${head}` };
  }

  const isScriptsRel = head.startsWith('./scripts/') || head.startsWith('scripts/');
  if (!isScriptsRel) {
    return { ok: false, reason: `argv[0] not in allowlist: ${head}` };
  }

  const ext = path.extname(head);
  if (ext !== '.mjs' && ext !== '.sh') {
    return { ok: false, reason: `script must end with .mjs or .sh: ${head}` };
  }

  const scriptsRoot = path.resolve(projectDir, 'scripts');
  const resolved = path.resolve(projectDir, head);
  const rel = path.relative(scriptsRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: `path traversal outside scripts/: ${head}` };
  }
  if (!existsSync(resolved)) {
    return { ok: false, reason: `script not found: ${head}` };
  }
  try {
    if (!statSync(resolved).isFile()) {
      return { ok: false, reason: `not a regular file: ${head}` };
    }
  } catch {
    return { ok: false, reason: `cannot stat: ${head}` };
  }

  return { ok: true, argv };
}

export const _internals = { FORBIDDEN, BIN_ALLOWLIST };
