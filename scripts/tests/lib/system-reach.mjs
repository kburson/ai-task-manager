// @story #1413
/**
 * Does a test file touch a live system?
 *
 * The 2026-08-24 test-architecture direction: contract-test each live system in a
 * few CI-only integration tests, then mock that system in every unit test that
 * depends on it. This classifier decides which side of that line a file sits on.
 *
 * It exists as committed code rather than a checked-in list of paths because a
 * list rots silently — the first person to add a 74th offender gets a green
 * build. A classifier fails instead.
 *
 * The signals are deliberately about *spawning and real repositories*, not about
 * imports. A unit test may import anything; what it may not do is create a git
 * repository, shell out to `git`, or launch the product CLI. Those are the three
 * mechanisms measured as putting 1976 `git` spawns and ~900s of aggregate `git`
 * time into a single unit-lane run, at which saturation unrelated tests trip the
 * 10s `GIT_TIMEOUT_MS` and the lane stops being deterministic.
 *
 * DEFAULT-DENY here, unlike the coverage-reach detector's default-allow. That
 * detector decides whether to *reject* a file, so ambiguity must not condemn it.
 * This one decides whether a file may stay in the fast local lane, and the cost
 * of a false positive is a test running in CI instead of locally — cheap — while
 * a false negative reintroduces the nondeterminism this whole effort removes.
 */

/** Creates a real git repository via the shared sandbox helper. */
const SANDBOX_RE = /\bmkdtempProjectIsolated\b/;

/** Shells out to `git` directly — `execFileSync('git', …)`, `spawn('git', …)`. */
const GIT_SPAWN_RE = /\b(?:execFile|execFileSync|spawn|spawnSync|exec|execSync)\s*\(\s*['"`]git['"`]/;

/** Launches the product CLI as a child process. */
const CLI_SPAWN_RE = /\b(?:execFile|execFileSync|spawn|spawnSync)\s*\(\s*(?:['"`]node['"`]|process\.execPath)/;

const SIGNALS = Object.freeze([
  ['sandbox', SANDBOX_RE],
  ['git-spawn', GIT_SPAWN_RE],
  ['cli-spawn', CLI_SPAWN_RE],
]);

/**
 * @param {string} source file contents
 * @returns {string[]} the signals present, in stable order; empty when the file
 *   touches no live system
 */
export function classifySystemReach(source) {
  const text = String(source || '');
  return SIGNALS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

/**
 * @param {string} source file contents
 * @returns {boolean} true when the file may not live in the unit lane
 */
export function touchesLiveSystem(source) {
  return classifySystemReach(source).length > 0;
}

/** The signal names this classifier can report, for tests and reporting. */
export const SYSTEM_REACH_SIGNALS = Object.freeze(SIGNALS.map(([name]) => name));

// ── Transitive reach ────────────────────────────────────────────────────────
//
// Inspecting a test's own source is not enough, and `close-repair.test.mjs` is
// the proof: its source spawns nothing, but it calls `verbClose`, and the verb
// spawns `git worktree list` ten times per run. That test is the one whose 10s
// timeout started this whole thread — a self-source classifier would have left
// it in the unit lane and "fixed" nothing.
//
// So a test inherits the system reach of the modules it imports. Walk the static
// import graph from the test and union the signals found across the closure.
//
// Static imports only. Dynamic `import()` with a computed specifier is not
// resolvable without executing the module, so the closure is a lower bound —
// which is why the lane's determinism, not the classifier's file count, is the
// measurement that decides whether this worked.
//
// THE CLOSURE STOPS AT PRODUCT CODE, and where it stops is the whole design.
// Following imports all the way into `scripts/` flags 489 of 779 unit files —
// 63% — because nearly every test imports something that can eventually reach
// `git`. That is not a relocation list, it is the mocking backlog the per-system
// sister epics exist to work through. Relocating it would empty the unit lane
// and leave nothing meaningful running locally.
//
// So the walk follows only TEST-SUPPORT modules: files under `scripts/tests/`
// that are not themselves `*.test.mjs`. A fixture that shells out is morally
// part of the test that imports it — `co-review-fixture.mjs` spawns the product
// CLI and `git`, and the three co-review suites importing it were the last
// tests failing on timeouts after the first relocation pass. Product code that
// spawns is a different problem with a different fix: mock it.

const STATIC_IMPORT_RE = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;

/**
 * A test-support module: lives under the test tree but is not itself a test.
 * Fixtures, case tables, and shared harness helpers. The transitive walk follows
 * these and nothing else.
 */
export function isTestSupportModule(file) {
  const normalized = String(file).replaceAll('\\\\', '/');
  return normalized.startsWith('scripts/tests/') && !/\.test\.mjs$/.test(normalized);
}

function resolveRelativeImport(root, importer, specifier, deps) {
  if (!specifier.startsWith('.')) return null; // bare specifier — not our code
  const { path: pathMod, existsSync } = deps;
  const unresolved = pathMod.resolve(pathMod.dirname(pathMod.join(root, importer)), specifier);
  const relative = pathMod.relative(root, unresolved).replaceAll(pathMod.sep, '/');
  if (relative === '..' || relative.startsWith('../')) return null; // escaped the repo
  const candidates = pathMod.extname(unresolved)
    ? [unresolved]
    : [`${unresolved}.mjs`, `${unresolved}.js`, pathMod.join(unresolved, 'index.mjs')];
  const hit = candidates.find((candidate) => existsSync(candidate));
  return hit ? pathMod.relative(root, hit).replaceAll(pathMod.sep, '/') : null;
}

/**
 * Signals reachable from a file, including through the modules it imports.
 *
 * @param {string} file repo-relative path to the test file
 * @param {object} deps - `{ root, readFileSync, existsSync, path }`
 * @returns {string[]} the union of signals across the import closure
 */
export function classifyTransitiveSystemReach(file, deps) {
  const { root, readFileSync } = deps;
  const found = new Set();
  const seen = new Set();
  const queue = [file];
  while (queue.length > 0) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    let source;
    try {
      source = readFileSync(`${root}/${current}`, 'utf8');
    } catch {
      continue;
    }
    for (const signal of classifySystemReach(source)) found.add(signal);
    for (const match of source.matchAll(STATIC_IMPORT_RE)) {
      const next = resolveRelativeImport(root, current, match[1], deps);
      if (next && isTestSupportModule(next) && !seen.has(next)) queue.push(next);
    }
  }
  return SYSTEM_REACH_SIGNALS.filter((signal) => found.has(signal));
}
