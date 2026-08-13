// Strict allowlist validator for /task review verification commands.
//
// Threat model: a verification command is extracted from an issue body — which
// may be authored by an adversary — and then executed by an automated agent
// with the operator's Git/GitHub credentials. We MUST prevent any authenticated
// mutation, any interpreter payload, and any side-effect write.
//
// The previous version allowed a flat BIN_ALLOWLIST (`gh`, `git`, `bash`,
// `node`, ...) which let through `gh issue close`, `git push`, `bash -c '...'`,
// `node -e '...'`, and `npm publish`. We now resolve each bin to a per-bin
// rule object that constrains:
//
//   - allowedSubcommands  (first non-flag arg after the bin)
//   - forbiddenFlags      (any positional flag, anywhere in argv)
//   - allowPassthrough    (no subcommand check; only flag check)
//   - requireScriptPath   (the next argv slot must be a project-local file)
//
// The exported `validateVerificationCommand(raw, opts)` signature is preserved
// so existing callers (`verbs/review.mjs`, `verbs/test.mjs`) work unchanged.
//
// See issues #2 and #198 for context.
//
// cspell:ignore userconfig globalconfig rcfile metachar subforms

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

// Per-bin rule definitions. `null` for a list means "no constraint at that
// level"; an empty list `[]` means "nothing allowed at that level".
const BIN_RULES = {
  // Package managers: only read/test/build script invocations. `publish`,
  // `pack`, `install`, `audit fix`, etc. are explicitly excluded.
  npm: {
    allowedSubcommands: ['test', 'run', 'run-script', 'exec', 'ci', 'rebuild', 'audit'],
    // `npm audit` alone (or with flags like --audit-level) is read-only; a
    // non-flag second token is `npm audit fix`, which mutates the lockfile.
    allowedSecondTokens: { audit: [] },
    forbiddenFlags: ['--prefix', '--cwd', '--registry', '--userconfig', '--globalconfig'],
  },
  pnpm: {
    allowedSubcommands: ['test', 'run', 'exec'],
    forbiddenFlags: ['--registry', '--userconfig'],
  },
  yarn: {
    allowedSubcommands: ['test', 'run'],
    forbiddenFlags: ['--registry'],
  },

  // Interpreters: reject any inline-code flag; the next argv slot must be a
  // script path (no further constraint on extension or location — `npm test`
  // does the same and is fine).
  node: {
    forbiddenFlags: ['-e', '--eval', '-p', '--print', '-c'],
  },
  python: {
    forbiddenFlags: ['-c', '-m'],
  },
  python3: {
    forbiddenFlags: ['-c', '-m'],
  },

  // Shell interpreters: outright reject `-c` (inline script) and `-s` (stdin).
  // We still allow `bash scripts/foo.sh` (positional script path).
  bash: {
    forbiddenFlags: ['-c', '-s', '--rcfile', '--init-file'],
  },
  sh: {
    forbiddenFlags: ['-c', '-s'],
  },

  // `gh`: only read verbs. Mutations (`close`, `merge`, `delete`, `api -X`,
  // `auth`, `repo create`, `release create`, ...) are excluded.
  gh: {
    allowedSubcommands: [
      'issue',
      'pr',
      'api',
      'repo',
      'release',
      'search',
      'run',
      'workflow',
      'label',
    ],
    allowedSecondTokens: {
      issue: ['view', 'list', 'status'],
      pr: ['view', 'list', 'diff', 'status', 'checks'],
      api: null, // checked separately for -X
      repo: ['view', 'list'],
      release: ['view', 'list'],
      search: null, // search is read-only by design
      run: ['view', 'list'],
      workflow: ['view', 'list'],
      label: ['list', 'view'],
    },
    // -X / --method anything other than GET is a mutation.
    forbiddenFlags: ['-X', '--method', '-F', '-f'],
  },

  // `git`: only read verbs. `push`, `reset`, `checkout`, `commit`, `merge`,
  // `rebase`, `pull`, `fetch`, `tag`, `clean`, `stash`, `rm`, `mv` are all
  // excluded by absence.
  git: {
    allowedSubcommands: [
      'status',
      'log',
      'diff',
      'show',
      'rev-parse',
      'rev-list',
      'branch',
      'ls-files',
      'ls-tree',
      'cat-file',
      'config',
      'describe',
      'blame',
      'grep',
    ],
    // `git config` with write is `git config <key> <value>`; we only allow
    // read forms (`git config --get`, `git config --list`). Bare two-positional
    // form is also a write, so block it.
    forbiddenFlags: ['--global', '--system', '--unset', '--add', '--replace-all'],
  },

  // `pytest` and `make` are path/target-scoped; we keep them pass-through but
  // still apply the shell-metachar check at the top of validate.
  pytest: { allowPassthrough: true },
  make: { allowPassthrough: true },

  // `npx`: runs arbitrary npm packages; restrict to known-installed names
  // would be ideal but for now leave pass-through. Document as follow-up.
  npx: { allowPassthrough: true },

  // `grep` / `rg`: read-only text search. Common AC evidence command ("file
  // contains line X"). No destructive flags exist; pass-through.
  grep: { allowPassthrough: true },
  rg: { allowPassthrough: true },

  // `test` / `[`: POSIX file-test predicates. Side-effect-free evidence checks
  // ("file exists / is executable"). No destructive subforms; the top-level
  // forbidden-metachar scan still rejects injection. Pass-through (#713).
  test: { allowPassthrough: true },
  '[': { allowPassthrough: true },
};

// Tokenize on whitespace, respecting balanced single/double quotes.
function tokenize(raw) {
  const tokens = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      buf += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (buf.length) {
        tokens.push(buf);
        buf = '';
      }
      continue;
    }
    buf += ch;
  }
  if (quote) return { error: `unbalanced quote (${quote})` };
  if (buf.length) tokens.push(buf);
  return { tokens };
}

function firstNonFlag(argv, fromIndex = 1) {
  for (let i = fromIndex; i < argv.length; i++) {
    if (!argv[i].startsWith('-')) return { token: argv[i], index: i };
  }
  return null;
}

function validateBinRule(bin, argv) {
  const rule = BIN_RULES[bin];
  if (!rule) return { ok: false, reason: `bin not in allowlist: ${bin}` };

  // Forbidden-flag scan applies to every bin that defines it.
  if (Array.isArray(rule.forbiddenFlags) && rule.forbiddenFlags.length > 0) {
    for (let i = 1; i < argv.length; i++) {
      const tok = argv[i];
      // Match exact flag or `--flag=value` form.
      const eq = tok.indexOf('=');
      const head = eq >= 0 ? tok.slice(0, eq) : tok;
      if (rule.forbiddenFlags.includes(head)) {
        return {
          ok: false,
          reason: `bin '${bin}' rejects flag '${head}' (mutation/inline-code vector)`,
        };
      }
    }
  }

  // Pass-through bins (pytest, make, npx) need no further check.
  if (rule.allowPassthrough) return { ok: true };

  // Subcommand check.
  if (Array.isArray(rule.allowedSubcommands)) {
    const sub = firstNonFlag(argv, 1);
    if (!sub) {
      // Interpreters (node, python, bash, sh) define no allowedSubcommands —
      // skip subcommand check entirely when undefined.
      return { ok: true };
    }
    if (!rule.allowedSubcommands.includes(sub.token)) {
      return {
        ok: false,
        reason: `bin '${bin}' rejects subcommand '${sub.token}' (not in per-bin allowlist)`,
      };
    }

    // Optional second-token check (e.g. `gh issue view` ok, `gh issue close` not).
    if (rule.allowedSecondTokens && rule.allowedSecondTokens[sub.token] !== undefined) {
      const allowedSecond = rule.allowedSecondTokens[sub.token];
      if (Array.isArray(allowedSecond)) {
        const second = firstNonFlag(argv, sub.index + 1);
        if (second && !allowedSecond.includes(second.token)) {
          return {
            ok: false,
            reason: `bin '${bin} ${sub.token}' rejects '${second.token}' (not in per-bin allowlist)`,
          };
        }
      }
    }
  }

  return { ok: true };
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

  // Branch 1: bare-name binary with per-bin rule check.
  if (Object.prototype.hasOwnProperty.call(BIN_RULES, head)) {
    const rule = validateBinRule(head, argv);
    if (!rule.ok) return rule;
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

// Back-compat: legacy export name. Build a flat Set of permitted bins.
const BIN_ALLOWLIST = new Set(Object.keys(BIN_RULES));

export const _internals = { FORBIDDEN, BIN_RULES, BIN_ALLOWLIST };
