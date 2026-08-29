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

/**
 * @param {unknown} file candidate repo-relative path
 * @returns {file is string} true only for canonical Git repository paths
 */
function isCanonicalRepositoryPath(file) {
  if (typeof file !== 'string' || file.length === 0) return false;
  if (file.includes('\\') || file.startsWith('/')) return false;

  return file
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
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
