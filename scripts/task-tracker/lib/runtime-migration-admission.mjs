// @story #1857
// Closed argv admission only. Shell parsing and runtime mutation are separate callers.
import { realpathSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runtimeStoragePaths } from './runtime-storage.mjs';

const registeredExecutable = fileURLToPath(new URL('../../../bin/aitm.mjs', import.meta.url));
const registeredHub = fileURLToPath(new URL('../task-tracker.mjs', import.meta.url));
const transactionPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,95}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

// Lexical routing alone grants no executable, root, plan, or mutation authority.
export function parseRuntimeMigrationInvocation(argv) {
  if (!Array.isArray(argv) || !argv.every((arg) => typeof arg === 'string')) return null;
  if (argv[0] !== 'migrate-runtime') return null;
  const mode = argv[1];
  const contracts = {
    plan: { allowed: ['--trust-plan', '--approved-plan'], required: [] },
    status: { allowed: ['--transaction'], required: [] },
    apply: {
      allowed: ['--transaction', '--approved-plan', '--plan-file'],
      required: ['--transaction', '--approved-plan', '--plan-file'],
    },
    resume: {
      allowed: ['--transaction', '--approved-plan'],
      required: ['--transaction', '--approved-plan'],
    },
    'initialize-plan': { allowed: [], required: [] },
    'initialize-apply': {
      allowed: ['--approved-plan', '--plan-file'],
      required: ['--approved-plan', '--plan-file'],
    },
    'initialize-resume': { allowed: ['--approved-plan'], required: ['--approved-plan'] },
    'recover-coordinator': {
      allowed: ['--observed', '--transaction', '--approved-plan'],
      required: ['--observed'],
    },
    'recover-writer': { allowed: ['--observed', '--lease'], required: ['--observed', '--lease'] },
    'batch-status': { allowed: ['--operation'], required: ['--operation'] },
    'batch-resume': {
      allowed: ['--operation', '--observed'],
      required: ['--operation', '--observed'],
    },
    'recover-operation': {
      allowed: ['--observed', '--record'],
      required: ['--observed', '--record'],
    },
  };
  if (!Object.hasOwn(contracts, mode)) return null;
  const contract = contracts[mode];
  const options = {};
  for (let index = 2; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !contract.allowed.includes(name) ||
      !value ||
      value.includes(String.fromCharCode(0)) ||
      value.startsWith('--') ||
      name in options
    )
      return null;
    options[name] = value;
  }
  if (contract.required.some((name) => !options[name])) return null;
  const transactionId = options['--transaction'];
  const approvedPlanDigest = options['--approved-plan'];
  if (transactionId !== undefined && !transactionPattern.test(transactionId)) return null;
  if (approvedPlanDigest !== undefined && !digestPattern.test(approvedPlanDigest)) return null;
  const planFile = options['--plan-file'];
  const trustPlanFile = options['--trust-plan'];
  const expectedDigest = options['--observed'];
  const leaseId = options['--lease'];
  const recordKey = options['--record'];
  const operationId = options['--operation'];
  if (
    operationId !== undefined &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(operationId)
  )
    return null;
  if (recordKey !== undefined && !/^[a-f0-9]{64}$/.test(recordKey)) return null;
  if (expectedDigest !== undefined && !digestPattern.test(expectedDigest)) return null;
  if (leaseId !== undefined && !/^[a-f0-9-]+$/.test(leaseId)) return null;
  if (mode === 'plan' && Boolean(trustPlanFile) !== Boolean(approvedPlanDigest)) return null;
  if (mode === 'recover-coordinator' && Boolean(transactionId) !== Boolean(approvedPlanDigest))
    return null;
  return Object.freeze({
    mode,
    transactionId,
    approvedPlanDigest,
    planFile,
    trustPlanFile,
    ...(operationId === undefined ? {} : { operationId }),
    ...(recordKey === undefined ? {} : { recordKey }),
    ...(expectedDigest === undefined ? {} : { expectedDigest }),
    ...(leaseId === undefined ? {} : { leaseId }),
  });
}

export function classifyRuntimeMigrationInvocation({ argv, executable, physicalRoots } = {}) {
  const parsed = parseRuntimeMigrationInvocation(argv);
  if (!parsed) return null;
  try {
    // Compare the actual package entrypoint, never a caller-supplied allowlist or basename.
    if (
      !statSync(executable).isFile() ||
      ![registeredExecutable, registeredHub].some(
        (entry) => realpathSync(executable) === realpathSync(entry)
      )
    )
      return null;
    const roots = runtimeStoragePaths(physicalRoots);
    return Object.freeze({
      ...parsed,
      projectRoot: roots.projectRoot,
      mainRoot: roots.mainRoot,
      executable: realpathSync(executable),
    });
  } catch {
    return null;
  }
}
