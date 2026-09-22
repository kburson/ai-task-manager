// @story #1672
import { loadGuidance } from './cache.mjs';
import { observeGuidanceSource } from './source.mjs';

const HELP = new Set(['help', '?', '--help', '-h']);
const COMMAND_HELP = new Set(['help', '?', '--help', '-h']);

/** Shared recovery classification for the #1673 dispatcher and direct entrypoints. */
export function classifyGuidanceRoute(argv, { surface = 'router' } = {}) {
  if (!Array.isArray(argv) || argv.some((part) => typeof part !== 'string')) {
    throw new TypeError('guidance route must be a string argument array');
  }
  const [command, subcommand] = argv;
  if (surface === 'direct-verb') return 'operational';
  if (surface === 'task-hub') {
    return (argv.length === 1 && HELP.has(command)) ||
      (argv.length === 2 && (command === 'help' || COMMAND_HELP.has(subcommand)))
      ? 'recovery'
      : 'operational';
  }
  if (surface !== 'router') throw new TypeError(`unknown guidance route surface: ${surface}`);
  if (argv.length === 0 || HELP.has(command)) return 'recovery';
  if (argv.length === 1 && ['--version', '-v', 'version'].includes(command)) return 'recovery';
  if (argv.length === 2 && COMMAND_HELP.has(subcommand)) return 'recovery';
  if (command === 'ai-task-manager' && ['version', '-v', '--version'].includes(subcommand)) {
    return 'recovery';
  }
  if (command === 'guidance' && ['validate', 'source'].includes(subcommand)) return 'recovery';
  return 'operational';
}

export function compactGuidanceRefusal(selected) {
  const displayPath =
    selected.sourceType === 'project'
      ? '.ai-task-manager/aitm-guidance.yml'
      : 'instructions/aitm-guidance.yml';
  return (
    `AITM guidance catalog is invalid:\n${displayPath}\n\n` +
    'No action was performed. Run:\n\n  npx aitm guidance validate\n\n' +
    'Fix the reported errors or delete the project catalog to restore the\n' +
    'published AITM guidance.\n'
  );
}

/** Admission performs no effects before full source selection and validation. */
export function admitGuidance({
  projectRoot,
  moduleUrl,
  argv = [],
  surface,
  onAdmitted = null,
} = {}) {
  if (classifyGuidanceRoute(argv, { surface }) === 'recovery') {
    return { admitted: true, recovery: true, code: null };
  }
  const validation = loadGuidance({ projectRoot, moduleUrl, need: 'manifest' });
  const selected = validation.source ?? observeGuidanceSource({ projectRoot, moduleUrl });
  if (!validation.valid) {
    return {
      admitted: false,
      recovery: false,
      code: 'guidance-catalog-invalid',
      detailCode: validation.code,
      trust: selected.trust,
      source: selected.path,
      diagnostic: compactGuidanceRefusal(selected),
    };
  }
  if (onAdmitted !== null) {
    if (typeof onAdmitted !== 'function') throw new TypeError('onAdmitted must be a function');
    onAdmitted(validation);
  }
  return {
    admitted: true,
    recovery: false,
    code: null,
    trust: selected.trust,
    source: selected.path,
    validation,
  };
}
