/**
 * Strict argv parsing for maintenance scripts (#878).
 *
 * Every `--apply`-capable maintenance script used to parse argv permissively
 * (`argv.includes('--flag')`), so an unrecognized token was silently dropped.
 * A typo — `--scope 877` at a script that has no `--scope` — left `--apply`
 * honored and the intended narrowing gone, turning a single-issue write into a
 * repo-wide one.
 *
 * `parseStrict` refuses any token the caller has not declared. It throws
 * `StrictArgvError` rather than calling `process.exit`, so `main(argv, deps)`
 * stays unit-testable in-process; the direct-invocation footer is what turns the
 * throw into a usage dump and a non-zero exit.
 */

export class StrictArgvError extends Error {
  constructor(message, { token, usage } = {}) {
    super(message);
    this.name = 'StrictArgvError';
    this.token = token;
    this.usage = usage;
  }
}

const HELP_TOKENS = new Set(['--help', '-h']);

/**
 * @param {string[]} argv                 raw arguments (already sliced past node + script)
 * @param {object}   spec
 * @param {string[]} [spec.flags]         boolean flag names, e.g. ['--apply']
 * @param {string[]} [spec.options]       value-taking option names, e.g. ['--scope']
 * @param {{min?: number, max?: number}} [spec.positionals]
 * @param {string}   [spec.usage]         usage text carried on the thrown error
 * @param {boolean}  [spec.allowHelp]     recognize --help/-h (default true)
 * @returns {{values: Record<string, string|boolean>, positionals: string[], help: boolean}}
 */
export function parseStrict(argv = [], spec = {}) {
  const flags = new Set(spec.flags || []);
  const options = new Set(spec.options || []);
  const usage = spec.usage;
  const allowHelp = spec.allowHelp !== false;
  const { min = 0, max = 0 } = spec.positionals || {};

  // --help wins over every refusal, and before any work the caller would do.
  if (allowHelp && argv.some((a) => HELP_TOKENS.has(a))) {
    return { values: {}, positionals: [], help: true };
  }

  const values = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (flags.has(token)) {
      values[token] = true;
      continue;
    }

    // `--opt=value` is in live use across the maintenance family; it must parse
    // identically to `--opt value` or adoption would break working invocations.
    const eq = token.indexOf('=');
    if (eq > 0) {
      const name = token.slice(0, eq);
      if (options.has(name)) {
        values[name] = token.slice(eq + 1);
        continue;
      }
      if (flags.has(name)) {
        throw new StrictArgvError(`flag ${name} does not take a value`, { token, usage });
      }
    }

    if (options.has(token)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new StrictArgvError(`option ${token} requires a value`, { token, usage });
      }
      values[token] = value;
      i += 1;
      continue;
    }

    if (token.startsWith('-')) {
      throw new StrictArgvError(`unrecognized argument: ${token}`, { token, usage });
    }

    positionals.push(token);
  }

  if (positionals.length < min) {
    throw new StrictArgvError(
      `expected at least ${min} positional argument(s), got ${positionals.length}`,
      { usage }
    );
  }
  if (positionals.length > max) {
    throw new StrictArgvError(`unexpected positional argument: ${positionals[max]}`, {
      token: positionals[max],
      usage,
    });
  }

  return { values, positionals, help: false };
}

/**
 * Validation-only adoption path.
 *
 * Most maintenance scripts already have a hand-rolled `parseArgs` whose
 * semantics (numeric coercion, `#` stripping, comma splitting, `--check-only`
 * inverting `--apply`) are load-bearing and tested. Rewriting them onto
 * `parseStrict`'s return value would be a behavior change wearing a refactor's
 * clothes. Instead these scripts call `assertKnownArgv` first, purely for the
 * refusal, and keep their own parser for interpretation.
 *
 * @returns {boolean} true when `--help` was requested (caller should print usage and stop)
 */
export function assertKnownArgv(argv, spec) {
  return parseStrict(argv, spec).help;
}

/**
 * Direct-invocation footer helper: turn a StrictArgvError into a usage dump and
 * exit 2; re-throw anything else so real failures keep their stack.
 */
export function reportStrictArgvError(
  err,
  { usage, err: write = (s) => process.stderr.write(s) } = {}
) {
  if (!(err instanceof StrictArgvError)) return false;
  // Writers here are raw stream writers, not console.error — emit the newline.
  write(`${err.message}\n`);
  const text = err.usage || usage;
  if (text) write(text.endsWith('\n') ? text : `${text}\n`);
  return true;
}
