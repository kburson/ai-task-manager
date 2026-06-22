// #496 — Customer beta report channel: pure core.
//
// Everything here is side-effect-free and unit-testable: upstream target
// resolution, kind records, the env block, the privacy scanner, and
// title/marker/body assembly. The I/O shell (scratch draft, review gate,
// `gh issue create`) lives in `verbs/report.mjs`.
//
// Reports go UPSTREAM to a PUBLIC repo, so the load-bearing controls are the
// mandatory review gate (verb) and the privacy scan (here). No raw repository
// file contents are ever embedded — only the whitelisted env block plus the
// user-authored prose.

export const CANONICAL_UPSTREAM = 'kburson/ai-task-manager';

const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

// Resolve the upstream target. Hardcoded canonical constant by default; a hidden
// `AITM_UPSTREAM_REPO` env override (shaped `owner/name`) is honored for
// fork/testing. Returns `{ repo, source }` so callers can show which target a
// submission will hit before the user confirms.
export function resolveUpstream(env = process.env) {
  const override = env && env.AITM_UPSTREAM_REPO ? String(env.AITM_UPSTREAM_REPO).trim() : '';
  if (override) {
    if (!REPO_RE.test(override)) {
      throw new Error(`AITM_UPSTREAM_REPO must be "owner/name" — got "${override}"`);
    }
    return { repo: override, source: 'env' };
  }
  return { repo: CANONICAL_UPSTREAM, source: 'default' };
}

// Per-kind config: title prefix, hidden marker (the durable label source for the
// upstream Action — title prefixes can be hand-edited, the marker cannot), and a
// short human label.
const KIND_RECORDS = {
  defect: {
    kind: 'defect',
    label: 'defect report',
    titlePrefix: '[BETA-DEFECT]',
    marker: 'aitm-beta-defect',
  },
  feature: {
    kind: 'feature',
    label: 'feature request',
    titlePrefix: '[BETA-FEATURE]',
    marker: 'aitm-beta-feature',
  },
};

export const VALID_KINDS = Object.freeze(Object.keys(KIND_RECORDS));

// Normalize + validate a `--kind` argument. Defaults to `defect` because the
// proactive block-point path (#498) is defect-only; feature is explicit.
export function resolveKind(raw) {
  const k = String(raw == null || raw === '' ? 'defect' : raw)
    .trim()
    .toLowerCase();
  if (!KIND_RECORDS[k]) {
    throw new Error(`unknown kind "${raw}" — expected one of: ${VALID_KINDS.join(', ')}`);
  }
  return KIND_RECORDS[k];
}

// Whitelisted environment block: exactly three low-sensitivity facts. Assembled
// purely so a submitter cannot leak machine layout, tokens, or source.
export function buildEnvBlock({ pkgVersion, nodeVersion, platform } = {}) {
  return [
    '## Environment',
    '',
    `- ai-task-manager: ${pkgVersion || 'unknown'}`,
    `- Node: ${nodeVersion || 'unknown'}`,
    `- OS: ${platform || 'unknown'}`,
  ].join('\n');
}

// Scan text for absolute paths under `$HOME`. Returns `{ hits }` where each hit
// is `{ line, text }` (1-based line). Non-home absolute paths are ignored; the
// env block (pkg/node/OS only) is the sole sanctioned machine-derived content.
export function scanForPrivacy(text, home) {
  const hits = [];
  const h = home && String(home).trim();
  if (!h) return { hits };
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(h)) {
      hits.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return { hits };
}

// Assemble the prefixed title. The kind prefix is idempotent — re-prefixing an
// already-prefixed summary is a no-op.
export function buildTitle(kindRecord, summary) {
  const s = String(summary || '').trim() || 'untitled report';
  if (s.startsWith(kindRecord.titlePrefix)) return s;
  return `${kindRecord.titlePrefix} ${s}`;
}

// Build the full draft body: hidden marker (durable label source), the user
// prose / pre-filled template, then the whitelisted env block.
export function buildBody({ kindRecord, prose, envBlock }) {
  const marker = `<!-- ${kindRecord.marker} -->`;
  return [marker, '', String(prose || '').trim(), '', envBlock]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

// Skeleton template for a kind. When `hint` is present (defect, from a block
// point), the reproduction/context fields are pre-filled with the failing verb
// and reason; otherwise an empty manual-fill skeleton is produced.
export function buildTemplate(kindRecord, hint) {
  if (kindRecord.kind === 'feature') {
    return [
      '## What I want',
      '',
      '<!-- Describe the capability you wish the skill had. -->',
      '',
      '## Why it matters',
      '',
      '<!-- What does this unblock or make easier? -->',
      '',
      '## Notes',
      '',
      '<!-- Anything else maintainers should know. -->',
    ].join('\n');
  }
  const fromVerb = hint && hint.verb ? hint.verb : '';
  const fromReason = hint && hint.reason ? hint.reason : '';
  return [
    '## What happened',
    '',
    fromReason || '<!-- Describe the defect you hit. -->',
    '',
    '## Where',
    '',
    fromVerb ? `Blocked at verb: \`${fromVerb}\`` : '<!-- Which command/verb blocked you? -->',
    '',
    '## Steps to reproduce',
    '',
    '<!-- 1. ... 2. ... 3. ... -->',
    '',
    '## Expected vs actual',
    '',
    '<!-- What you expected, and what happened instead. -->',
  ].join('\n');
}

// Parse a `--from-hint "<verb> <reason>"` string into `{ verb, reason }`. The
// first whitespace-delimited token is the verb; the remainder is the reason.
export function parseHint(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(\S+)\s*(.*)$/);
  if (!m) return null;
  return { verb: m[1], reason: m[2].trim() };
}

// Assemble the `gh issue create` argv (no execution). Kept here so the exact
// command surface is unit-testable against a stub.
export function buildGhArgs({ repo, title, bodyFile }) {
  return ['issue', 'create', '--repo', repo, '--title', title, '--body-file', bodyFile];
}
