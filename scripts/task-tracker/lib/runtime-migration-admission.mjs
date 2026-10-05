// @story #1857
// Closed argv admission only. Shell parsing and runtime mutation are separate callers.
import { realpathSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runtimeStoragePaths } from './runtime-storage.mjs';

const registeredExecutable = fileURLToPath(new URL('../../../bin/aitm.mjs', import.meta.url));
const transactionPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,95}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function classifyRuntimeMigrationInvocation({ argv, executable, physicalRoots } = {}) {
  if (!Array.isArray(argv) || !argv.every((arg) => typeof arg === 'string')) return null;
  if (argv[0] !== 'migrate-runtime') return null;
  const mode = argv[1];
  if (!['plan', 'status', 'apply', 'resume'].includes(mode)) return null;
  const options = {};
  for (let index = 2; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!['--transaction', '--approved-plan'].includes(name) || !value || name in options)
      return null;
    options[name] = value;
  }
  const transactionId = options['--transaction'];
  const approvedPlanDigest = options['--approved-plan'];
  if (transactionId !== undefined && !transactionPattern.test(transactionId)) return null;
  if (approvedPlanDigest !== undefined && !digestPattern.test(approvedPlanDigest)) return null;
  if (mode === 'plan' && Object.keys(options).length !== 0) return null;
  if (mode === 'status' && approvedPlanDigest !== undefined) return null;
  if (['apply', 'resume'].includes(mode) && (!transactionId || !approvedPlanDigest)) return null;
  try {
    // Compare the actual package entrypoint, never a caller-supplied allowlist or basename.
    if (
      !statSync(executable).isFile() ||
      realpathSync(executable) !== realpathSync(registeredExecutable)
    )
      return null;
    const roots = runtimeStoragePaths(physicalRoots);
    return Object.freeze({
      mode,
      transactionId,
      approvedPlanDigest,
      projectRoot: roots.projectRoot,
      mainRoot: roots.mainRoot,
      executable: realpathSync(registeredExecutable),
    });
  } catch {
    return null;
  }
}
