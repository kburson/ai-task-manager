// scripts/task-tracker/activity-policy.mjs
//
// Pure classifier for "activity classes" used by the activity-guard hook
// (epic #61, W2.2). Decides whether a tool invocation is WRITE_CODE,
// WRITE_DOCS, WRITE_ISSUE, COMMIT_CODE, RUN_TESTS, RUN_BUILD, READ_*, or
// WRITE_OTHER, based on path globs and command patterns from a policy file.
//
// Exports:
//   DEFAULT_POLICY   — shipped defaults, mirrored in `.ai-task-manager/activity-policy.json`.
//   STATE_MATRIX     — kanban state → array of allowed activity classes.
//   classifyEdit(filePath, policy?)  → string activity class.
//   classifyBash(command,  policy?)  → string activity class.
//   isAllowed(state, activityClass)  → boolean.
//   loadPolicy(cwd)                  → policy object (file or fallback).
//
// Pure module: classifiers do no I/O. `loadPolicy` reads the filesystem once
// per call and falls back to defaults on missing/invalid file.
//
// Bash command-target extraction is shared with the PreToolUse/PostToolUse
// effect classifier so activity classification and lease governance cannot
// diverge on shell grammar.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractWriteTargets } from './lib/bash-effect-classifier.mjs';

export { extractWriteTargets };

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_POLICY = Object.freeze({
  codeGlobs: ['src/**', 'lib/**', 'bin/**', 'scripts/**'],
  codeGlobExcludes: [],
  codeGlobReincludes: [],
  docGlobs: ['docs/**', '.claude/plans/**', 'docs/plans/**', '**/*.md', 'CLAUDE.md'],
  // Repo-root and tooling config files that ARE part of the project's code
  // surface (ignore lists, formatter/linter configs, TS/JS configs, package
  // manifests, Claude/editor settings). Without these, every edit to
  // `.gitignore`, `package.json`, `eslint.config.*`, etc. classifies as
  // WRITE_OTHER — which no kanban state permits, locking out routine
  // config maintenance under any active task. Classified as WRITE_CODE.
  configGlobs: [
    '.gitignore',
    '.prettierignore',
    '.eslintignore',
    '.editorconfig',
    '.npmrc',
    '.nvmrc',
    '.node-version',
    '.markdownlintignore',
    'eslint.config.*',
    'prettier.config.*',
    '.prettierrc',
    '.prettierrc.*',
    'cspell.json',
    'cspell.config.*',
    'tsconfig.json',
    'tsconfig.*.json',
    'jsconfig.json',
    'jsconfig.*.json',
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'markdownlint.json',
    'markdownlint.*.json',
    '.markdownlint.json',
    '.markdownlint.*.json',
    '.markdownlint-cli2.jsonc',
    '.markdownlint-cli2.*',
    '.claude/settings.json',
    '.claude/settings.*.json',
    // The activity-policy file itself is part of the project's config surface.
    // Without this, editing it classifies as WRITE_OTHER (permitted in no
    // state), so the very first policy edit needs a chore-mode escape hatch.
    '.ai-task-manager/activity-policy.json',
  ],
  // Repo-root container / deployment files that ARE a first-class code
  // deliverable when shipping an image (Dockerfiles, compose stacks, the
  // container web-server config). They live at repo root, so they match no
  // `src/**`/`scripts/**` code glob and none of the tooling `configGlobs` —
  // without this list every such edit falls through to WRITE_OTHER (permitted
  // in no kanban state), blocking a legitimate `develop`-stage build file.
  // Classified as WRITE_CODE. See DEFAULT_POLICY.configGlobs for the sibling
  // pattern this mirrors (#712).
  deployGlobs: [
    'Dockerfile',
    'Dockerfile.*',
    '*.dockerfile',
    '.dockerignore',
    'Containerfile',
    'compose.y*ml',
    'docker-compose.y*ml',
    'nginx.conf',
  ],
  testRunners: ['npm test', 'npm run test', 'node --test', 'pytest', 'cargo test', 'go test'],
  buildCommands: ['npm run build', 'tsc', 'cargo build', 'go build'],
});

export const STATE_MATRIX = Object.freeze({
  backlog: ['WRITE_ISSUE', 'READ_*'],
  'on-deck': ['WRITE_ISSUE', 'READ_*'],
  refine: ['WRITE_ISSUE', 'READ_*'],
  plan: ['WRITE_ISSUE', 'WRITE_DOCS', 'RUN_TESTS', 'READ_*'],
  develop: [
    'WRITE_CODE',
    'COMMIT_CODE',
    'WRITE_DOCS',
    'WRITE_ISSUE',
    'RUN_TESTS',
    'RUN_BUILD',
    'READ_*',
  ],
  test: ['RUN_TESTS', 'RUN_BUILD', 'WRITE_ISSUE', 'READ_*'],
  review: ['WRITE_ISSUE', 'WRITE_DOCS', 'READ_*'],
  done: ['READ_*'],
});

// ---------------------------------------------------------------------------
// Glob → RegExp
// ---------------------------------------------------------------------------

// Minimal glob compiler: supports `**` (any segments incl. zero), `*` (any
// chars except `/`), and literal `/`. No `?` or character classes — not used
// by the shipped policy. Sufficient for the documented globs.
function globToRegExp(glob) {
  // Normalize: strip leading `./`.
  const g = glob.replace(/^\.\//, '');
  let re = '';
  let i = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      // `**/` matches any number of path segments incl. zero;
      // `**`   at end matches anything.
      if (g[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 3;
      } else {
        re += '.*';
        i += 2;
      }
    } else if (c === '*') {
      re += '[^/]*';
      i += 1;
    } else if ('.+^$()|[]{}\\'.includes(c)) {
      re += '\\' + c;
      i += 1;
    } else {
      re += c;
      i += 1;
    }
  }
  return new RegExp('^' + re + '$');
}

function anyGlobMatch(filePath, globs) {
  if (!Array.isArray(globs)) return false;
  for (const g of globs) {
    if (globToRegExp(g).test(filePath)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// classifyEdit
// ---------------------------------------------------------------------------

const ISSUE_TEMPLATE_RE = /^\.github\/ISSUE_TEMPLATE\//;

export function classifyEdit(filePath, policy = DEFAULT_POLICY) {
  if (typeof filePath !== 'string' || !filePath) return 'WRITE_OTHER';
  // Normalize: collapse leading `./`, no other transforms (caller passes
  // repo-relative paths).
  const p = filePath.replace(/^\.\//, '');

  // Issue templates take precedence over docs (they happen to be .md too).
  if (ISSUE_TEMPLATE_RE.test(p)) return 'WRITE_ISSUE';

  // Docs precede code so `scripts/foo.md` (matches both code-glob `scripts/**`
  // and doc-glob `**/*.md`) classifies as WRITE_DOCS.
  if (anyGlobMatch(p, policy.docGlobs)) return 'WRITE_DOCS';

  // Repo-root / tooling config files (e.g. `.gitignore`, `package.json`,
  // `eslint.config.*`) classify as WRITE_CODE so they remain editable under
  // any state that permits WRITE_CODE. Checked AFTER docs so `*.md` configs
  // still go to docs, and BEFORE code so bare-root configs don't fall
  // through to WRITE_OTHER. See DEFAULT_POLICY.configGlobs for the list.
  if (anyGlobMatch(p, policy.configGlobs)) return 'WRITE_CODE';

  // Repo-root container / deployment files (e.g. `Dockerfile`, `.dockerignore`,
  // `compose.yaml`, `nginx.conf`) classify as WRITE_CODE so a container image
  // is a first-class deliverable in `develop`. Checked AFTER docs (so a
  // `Dockerfile.md` note still goes to docs) and alongside config, BEFORE the
  // code globs. See DEFAULT_POLICY.deployGlobs for the list.
  if (anyGlobMatch(p, policy.deployGlobs)) return 'WRITE_CODE';

  if (anyGlobMatch(p, policy.codeGlobs)) {
    if (anyGlobMatch(p, policy.codeGlobExcludes)) {
      // Re-include carve-outs (e.g., tests under excluded runtime paths).
      if (anyGlobMatch(p, policy.codeGlobReincludes)) return 'WRITE_CODE';
      return 'WRITE_OTHER';
    }
    return 'WRITE_CODE';
  }

  return 'WRITE_OTHER';
}

// ---------------------------------------------------------------------------
// classifyBash — command prefix / write-target extraction
// ---------------------------------------------------------------------------

// Command-prefix match: command line starts with `pattern` followed by a
// word boundary (space, end-of-string, or `-`/`-`-flag). Matches the
// `npm test`, `npm run build`, `tsc`, etc. style entries in the policy.
function startsWithCommand(command, pattern) {
  const trimmed = command.replace(/^\s+/, '');
  if (!trimmed.startsWith(pattern)) return false;
  const next = trimmed.charAt(pattern.length);
  // Boundary: end-of-string, whitespace, semicolon, ampersand, pipe.
  return next === '' || /\s|;|&|\|/.test(next);
}

export function classifyBash(command, policy = DEFAULT_POLICY) {
  if (typeof command !== 'string' || !command) return 'READ_*';
  const cmd = command.replace(/^\s+/, '');

  // `git commit ...`
  if (/^git\s+commit\b/.test(cmd)) return 'COMMIT_CODE';
  if (/^gh\s+issue\s+(?:edit|reopen)\b/.test(cmd)) return 'WRITE_ISSUE';

  // Test runners — longest-first so `npm run test` wins over `npm`.
  const testRunners = [...(policy.testRunners || [])].sort((a, b) => b.length - a.length);
  for (const pat of testRunners) {
    if (startsWithCommand(cmd, pat)) return 'RUN_TESTS';
  }

  // Build commands.
  const buildCommands = [...(policy.buildCommands || [])].sort((a, b) => b.length - a.length);
  for (const pat of buildCommands) {
    if (startsWithCommand(cmd, pat)) return 'RUN_BUILD';
  }

  // Write targets (redirect / tee / touch / mkdir / rm).
  const targets = extractWriteTargets(cmd);
  if (targets.length > 0) {
    // Project-local scratch writes are intentionally outside issue authority
    // and must remain usable in every workflow state. This is target-role aware:
    // mixed commands still classify from their non-scratch destination(s).
    if (targets.every((target) => target === '.tmp' || target.startsWith('.tmp/'))) {
      return 'READ_*';
    }
    // Classify the most-specific target — if any matches code or docs, return that.
    // Iterate by precedence: WRITE_ISSUE > WRITE_DOCS > WRITE_CODE > WRITE_OTHER.
    let best = 'WRITE_OTHER';
    for (const t of targets) {
      let cls = classifyEdit(t, policy);
      if (cls === 'WRITE_OTHER') cls = classifyEdit(`${t.replace(/\/$/, '')}/.aitm-target`, policy);
      if (cls === 'WRITE_ISSUE') return 'WRITE_ISSUE';
      if (cls === 'WRITE_DOCS') best = 'WRITE_DOCS';
      else if (cls === 'WRITE_CODE' && best !== 'WRITE_DOCS') best = 'WRITE_CODE';
    }
    return best;
  }

  return 'READ_*';
}

// ---------------------------------------------------------------------------
// isAllowed
// ---------------------------------------------------------------------------

export function isAllowed(state, activityClass) {
  // READ_* is universally allowed.
  if (activityClass === 'READ_*') return true;

  // No-active-task policy: refuse WRITE_CODE / COMMIT_CODE; allow all else.
  if (state == null) {
    if (activityClass === 'WRITE_CODE' || activityClass === 'COMMIT_CODE') return false;
    return true;
  }

  const allowed = STATE_MATRIX[state];
  if (!Array.isArray(allowed)) return false;
  return allowed.includes(activityClass);
}

// ---------------------------------------------------------------------------
// loadPolicy
// ---------------------------------------------------------------------------

export function loadPolicy(cwd) {
  if (typeof cwd !== 'string' || !cwd) return DEFAULT_POLICY;
  const filePath = path.join(cwd, '.ai-task-manager', 'activity-policy.json');
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return DEFAULT_POLICY;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_POLICY;
    // Per-key base merge: a list-valued key present in the file fully REPLACES
    // the corresponding default; absent keys keep the default. The additive
    // `*Extra` siblings (`codeGlobsExtra` / `docGlobsExtra` / `configGlobsExtra`)
    // are then APPENDED onto whichever base list is in effect, so a project can
    // widen a glob set without restating the (version-drifting) defaults.
    // Non-array `*Extra` values are ignored. Base first, extras after — the
    // `classifyEdit` precedence is unchanged; extras only broaden membership.
    const withExtra = (baseKey, extraKey) => {
      const base = Array.isArray(parsed[baseKey]) ? parsed[baseKey] : DEFAULT_POLICY[baseKey];
      const extra = Array.isArray(parsed[extraKey]) ? parsed[extraKey] : [];
      return extra.length ? [...base, ...extra] : base;
    };
    return {
      codeGlobs: withExtra('codeGlobs', 'codeGlobsExtra'),
      codeGlobExcludes: Array.isArray(parsed.codeGlobExcludes)
        ? parsed.codeGlobExcludes
        : DEFAULT_POLICY.codeGlobExcludes,
      codeGlobReincludes: Array.isArray(parsed.codeGlobReincludes)
        ? parsed.codeGlobReincludes
        : DEFAULT_POLICY.codeGlobReincludes,
      docGlobs: withExtra('docGlobs', 'docGlobsExtra'),
      configGlobs: withExtra('configGlobs', 'configGlobsExtra'),
      deployGlobs: withExtra('deployGlobs', 'deployGlobsExtra'),
      testRunners: Array.isArray(parsed.testRunners)
        ? parsed.testRunners
        : DEFAULT_POLICY.testRunners,
      buildCommands: Array.isArray(parsed.buildCommands)
        ? parsed.buildCommands
        : DEFAULT_POLICY.buildCommands,
    };
  } catch {
    return DEFAULT_POLICY;
  }
}
