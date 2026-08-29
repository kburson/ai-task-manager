// @story #1411
/**
 * Scope rule for the legacy state-vocabulary residue audit (#1206).
 *
 * Research dumps under `docs/research/` include machine-generated inventories of
 * the repo: import graphs, overlap matrices, timing tables. Those name modules,
 * and one of the modules is the legacy-rename migration CLI — so a generated
 * file reports a match without any legacy vocabulary having survived anywhere in
 * the product. That is the audit asserting about its own evidence.
 *
 * Only the GENERATED DATA is exempt. Authored prose under `docs/research/` stays
 * on the audited path, matching how `docs/migration-history.md` and the other
 * historical records are handled — allowlisted with an exact count, not waved
 * through. A human who reintroduces the vocabulary in a research narrative is
 * still caught; a tool that inventories module paths is not.
 *
 * The alternative — an exact-count allowlist entry for the artifact — was
 * rejected: it hardcodes a generated file's current match count into a test, so
 * regenerating the dump or landing the next one breaks the lane again.
 *
 * Lives here rather than inside the audit's own test file so the boundary tests
 * can import the predicate without executing the audit as a side effect.
 */

const RESEARCH_ROOT = 'docs/research/';
const GENERATED_DATA_EXTENSIONS = ['.json', '.txt', '.csv', '.ndjson'];
const LEGACY_TOKEN = /on[- _]?deck/i;
const SPLIT_LEGACY_TOKEN = /on[ \t]*\r?\n[ \t]*(?:(?:\/\/|#|\*)[ \t]*)?deck/gi;

/**
 * @param {unknown} file candidate repo-relative path
 * @returns {file is string} true only for canonical Git repository paths
 */
function isCanonicalRepositoryPath(file) {
  if (typeof file !== 'string' || file.length === 0) return false;
  if (file.includes('\\') || file.startsWith('/')) return false;

  return file.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * @param {unknown} file repo-relative path
 * @returns {boolean} true when the path is a generated research artifact and so
 *   is exempt from the residue walk
 */
export function isGeneratedResearchArtifact(file) {
  if (!isCanonicalRepositoryPath(file)) return false;
  if (!file.startsWith(RESEARCH_ROOT)) return false;
  return GENERATED_DATA_EXTENSIONS.some((ext) => file.endsWith(ext));
}

/**
 * @param {unknown} source file contents
 * @returns {string[]} matching line descriptions
 */
export function legacyMatches(source) {
  const text = String(source || '');
  const matches = [];
  text.split('\n').forEach((line, index) => {
    if (LEGACY_TOKEN.test(line)) matches.push(`${index + 1}:${line.trim()}`);
  });
  for (const match of text.matchAll(SPLIT_LEGACY_TOKEN)) {
    const line = text.slice(0, match.index).split('\n').length;
    matches.push(`${line}:split:${match[0].replace(/\s+/g, ' ')}`);
  }
  return matches;
}

/**
 * @param {{
 *   entries: Array<{ file: string, source: string }>,
 *   allowlist: Map<string, [number, string]>
 * }} input explicit audit inputs
 * @returns {string[]} deterministic policy failures
 */
export function evaluateResidueAudit({ entries, allowlist }) {
  const residue = new Map();
  for (const { file, source } of entries) {
    if (isGeneratedResearchArtifact(file)) continue;
    const matches = legacyMatches(source);
    if (matches.length > 0) residue.set(file, matches);
  }

  const failures = [];
  for (const [file, matches] of residue) {
    const allowed = allowlist.get(file);
    if (!allowed) {
      failures.push(`UNEXPECTED ${file}\n  ${matches.join('\n  ')}`);
    } else if (matches.length !== allowed[0]) {
      failures.push(
        `COUNT ${file}: expected ${allowed[0]}, found ${matches.length} (${allowed[1]})\n  ${matches.join('\n  ')}`
      );
    }
  }
  for (const [file, [count, reason]] of allowlist) {
    if (!residue.has(file)) failures.push(`MISSING ${file}: expected ${count} (${reason})`);
  }

  return failures;
}
