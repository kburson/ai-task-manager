// @story #1672
import { loadSelectedGuidance, resolveGuidanceSource } from './source.mjs';

const HELP = new Set(['help', '?', '--help', '-h']);
const COMMAND_HELP = new Set(['help', '?', '--help', '-h']);

/** Shared recovery classification for the #1673 dispatcher and direct entrypoints. */
export function classifyGuidanceRoute(argv) {
  if (!Array.isArray(argv) || argv.some((part) => typeof part !== 'string')) {
    throw new TypeError('guidance route must be a string argument array');
  }
  const [command, subcommand] = argv;
  if (argv.length === 0 || HELP.has(command)) return 'recovery';
  if (argv.length === 1 && ['--version', '-v', 'version'].includes(command)) return 'recovery';
  if (argv.length === 2 && COMMAND_HELP.has(subcommand)) return 'recovery';
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
export function admitGuidance({ projectRoot, moduleUrl, argv = [], onAdmitted = null } = {}) {
  if (classifyGuidanceRoute(argv) === 'recovery') {
    return { admitted: true, recovery: true, code: null };
  }
  const selected = resolveGuidanceSource({ projectRoot, moduleUrl });
  const validation = loadSelectedGuidance(selected);
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
