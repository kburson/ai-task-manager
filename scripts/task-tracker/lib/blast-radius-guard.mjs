/**
 * Blast-radius confirmation guard for `--apply` maintenance scripts (#880).
 *
 * Every one of the 14 maintenance scripts writes its full matched issue set
 * the moment `--apply` is passed, with no signal to the operator about how
 * many issues are about to change. #878 closed the "unrecognized flag"
 * trigger; #879 added per-issue targeting. Neither stops a correctly-spelled,
 * correctly-targeted `--apply` that simply matches more issues than the
 * operator expected — which is exactly what happened on #878 (2026-07-17,
 * 11 issues rewritten when 1 was intended).
 *
 * `confirmBlastRadius` is the single shared checkpoint every script calls
 * immediately before its write loop. It always reports the count and issue
 * numbers about to be written; above `threshold` it also requires either
 * `--yes` or an interactive TTY confirmation before returning `proceed: true`.
 */

import { createInterface } from 'node:readline/promises';

/**
 * @param {object}   opts
 * @param {number[]} opts.issueNumbers   resolved issue numbers about to be written
 * @param {string[]} [opts.targets]      non-issue targets about to be written
 * @param {string}   [opts.targetLabel]  singular label used with `targets`
 * @param {number}   [opts.threshold=1]  confirmation required when count exceeds this
 * @param {boolean}  [opts.yes=false]    bypass confirmation (still logs the count)
 * @param {boolean}  [opts.isTTY]        whether stdin is interactive; defaults to process.stdin.isTTY
 * @param {(question: string) => Promise<string>} [opts.promptFn]  injected prompt for tests; defaults to a real readline prompt
 * @param {(s: string) => void} [opts.warn]  stderr-style writer
 * @param {(s: string) => void} [opts.log]   stdout-style writer
 * @returns {Promise<{proceed: boolean, reason: string, count: number}>}
 */
export async function confirmBlastRadius({
  issueNumbers,
  targets,
  targetLabel = 'target',
  threshold = 1,
  yes = false,
  isTTY = Boolean(process.stdin.isTTY),
  promptFn,
  warn = (s) => process.stderr.write(s),
  log = (s) => process.stdout.write(s),
} = {}) {
  const usesGenericTargets = Array.isArray(targets);
  const values = usesGenericTargets
    ? targets.map((target) => String(target))
    : [...(issueNumbers || [])].sort((a, b) => a - b).map((number) => `#${number}`);
  const count = values.length;
  const list = values.join(', ');
  const label = usesGenericTargets ? targetLabel : 'issue';

  log(`About to write ${count} ${label}(s)${count ? `: ${list}` : ''}\n`);

  if (count <= threshold) {
    return { proceed: true, reason: 'under-threshold', count };
  }

  if (yes) {
    log('--yes passed; proceeding without confirmation\n');
    return { proceed: true, reason: 'yes-flag', count };
  }

  if (!isTTY) {
    warn(
      `refusing: ${count} ${label}(s) exceed the confirmation threshold (${threshold}) and ` +
        '--yes was not passed on non-interactive stdin\n'
    );
    return { proceed: false, reason: 'non-tty-refused', count };
  }

  const ask = promptFn || defaultPrompt;
  const answer = await ask(`Write ${count} ${label}(s)? [y/N] `);
  const confirmed = /^y(es)?$/i.test(String(answer || '').trim());
  if (!confirmed) {
    warn('aborted: confirmation declined\n');
  }
  return { proceed: confirmed, reason: confirmed ? 'tty-confirmed' : 'tty-declined', count };
}

async function defaultPrompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}
