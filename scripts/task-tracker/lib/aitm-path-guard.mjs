// #487 — PreToolUse Bash guard: refuse direct `node node_modules/ai-task-manager
// /scripts/...` invocations of commands the `aitm` orchestrator (#413) already
// exposes, steering the caller to `npx aitm <name>`.
//
// Rationale: #413 made `aitm` the single front-router for the task-tracker
// verbs and operator-facing support scripts, but enforcement was documentation
// + discipline. This guard moves the convention to the tool boundary so a
// direct-path invocation is refused, mirroring the `gh-edit-guard` refusal
// model. Pure logic — the registry resolution is deterministic from repo
// source, so the whole module is unit-testable without spawning a process.
//
// Three rails (see #487 ACs):
//   1. A direct path to an exposed script / the verb hub is refused with a
//      message naming the exact `npx aitm <name>` replacement.
//   2. Hook-runner wiring (`hook-handler.mjs`) is allowlisted via the shared
//      `isHookWiring` boundary — the Claude hook runner legitimately invokes
//      plumbing by direct path; it is NOT an `aitm` command.
//   3. A path that maps to no registered command is internal-only and passes
//      untouched (`resolveAitmPath` returns null), so the guard never blocks
//      scripts we have deliberately not exposed.

import { resolveAitmPath } from '../../../bin/aitm-registry.mjs';

// Direct-invocation matcher. Anchored on a `node` token, tolerates an absolute
// path prefix before `node_modules/`, and captures the repo-relative
// `scripts/...` path (group 1) plus the trailing argument remainder (group 2)
// up to the next shell separator. Recreate per use — `g` flag carries state.
function directInvocationRe() {
  return /\bnode\b[^\n|;&]*?node_modules\/ai-task-manager\/(scripts\/[A-Za-z0-9._/-]+\.(?:mjs|js|sh))((?:[ \t]+[^\n|;&]*)?)/g;
}

// Plain textual detector for the doc-lint (mirrors #413 AC8's `forbidden`).
export const DIRECT_NODE_MODULES_RE = /node\s+(?:\S*\/)?node_modules\/ai-task-manager\/scripts\//;

// Shared carve-out boundary (reused by the dispatcher AC8 doc-lint and the
// #487 doc-lint): the hook runner names `hook-handler.mjs` by direct path in
// settings.json wiring — that is plumbing, not an `aitm` command.
export function isHookWiring(line) {
  return /hook-handler\.mjs/.test(String(line || ''));
}

// First whitespace-delimited token of the verb-hub argument remainder — the
// concrete verb (e.g. `promote`). Strips a leading `#` so a bind-style
// `task-tracker.mjs "#12" --role agent` still surfaces a usable token.
function firstVerbToken(remainder) {
  const m = String(remainder || '')
    .trim()
    .match(/^(\S+)/);
  return m ? m[1] : null;
}

function scriptRefusal(relPath, name) {
  return (
    `Direct \`node node_modules/ai-task-manager/${relPath}\` invocation is forbidden.\n` +
    `  Use \`npx aitm ${name}\` instead — the orchestrator routes to the same script (see #413). Append \`help\` for its API.`
  );
}

function verbHubRefusal(relPath, verb) {
  const v = verb || '<verb>';
  return (
    `Direct \`node node_modules/ai-task-manager/${relPath}\` invocation of the task-tracker verb hub is forbidden.\n` +
    `  Use \`npx aitm ${v}\` instead (e.g. \`npx aitm promote <#>\`). The orchestrator routes to the same verb hub (see #413).`
  );
}

// Evaluate a (preferably quote-stripped) Bash command. Returns
// `{ block: true, reason }` for the first direct invocation of a registered
// command, else `{ block: false }`. Caller passes the quote-stripped command
// so path-like substrings inside quoted argument strings (e.g. a grep pattern)
// are not flagged.
export function evaluateAitmPath({ command } = {}) {
  const src = String(command || '');
  const re = directInvocationRe();
  let m;
  while ((m = re.exec(src)) !== null) {
    const relPath = m[1];
    const remainder = m[2] || '';
    const segment = m[0];
    // Rail 2: hook-runner wiring is allowlisted.
    if (isHookWiring(segment)) continue;
    // Rail 1/3: resolve against the registry.
    const resolved = resolveAitmPath(relPath);
    if (!resolved) continue; // internal-only — not steered
    if (resolved.target === 'verb-hub') {
      return { block: true, reason: verbHubRefusal(relPath, firstVerbToken(remainder)) };
    }
    return { block: true, reason: scriptRefusal(relPath, resolved.name) };
  }
  return { block: false };
}

// Doc-lint helper (#487 AC6): return the offending lines of a doc that instruct
// a direct `node node_modules/.../scripts/...` invocation, excluding legitimate
// hook-runner wiring. Blanket textual policy, consistent with #413 AC8 — after
// the doc sweep every such reference resolves to an exposed command, so any
// residual direct path is a regression.
export function findOffendingDocLines(text) {
  return String(text || '')
    .split('\n')
    .filter((line) => DIRECT_NODE_MODULES_RE.test(line) && !isHookWiring(line));
}
