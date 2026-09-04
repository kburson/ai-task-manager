// @story #1499
import path from 'node:path';
import { canonical, frozen, fail, uuidValue } from './value.mjs';

const comparableKeys = [
  'repositoryId',
  'issue',
  'cycleId',
  'sid',
  'worktreePath',
  'bindingGenerationId',
];

function comparable(value = {}) {
  return Object.fromEntries(
    comparableKeys.map((key) => [
      key,
      key === 'worktreePath' && value[key] ? path.resolve(value[key]) : (value[key] ?? null),
    ])
  );
}

export function sameBindingGeneration(expected, actual) {
  return canonical(comparable(expected)) === canonical(comparable(actual));
}

export async function inspectBindingGeneration({ context, ports } = {}) {
  if (!context?.expectedBinding) fail('binding-generation:expected');
  const inspect = async () => {
    const actual = await ports.readBinding(context);
    if (context.expectedBinding.status === 'absent') {
      return frozen({ status: actual ? 'pending-conflict' : 'absent', actual: actual ?? null });
    }
    if (context.expectedBinding.status === 'paused') {
      if (!actual) return frozen({ status: 'pending-conflict', actual: null });
      return frozen({
        status: sameBindingGeneration(context.expectedBinding, actual)
          ? 'paused'
          : 'pending-conflict',
        actual,
      });
    }
    uuidValue(context.expectedBinding.bindingGenerationId, 'binding-generation');
    if (!actual) return frozen({ status: 'already-released', actual: null });
    return frozen({
      status: sameBindingGeneration(context.expectedBinding, actual) ? 'owned' : 'pending-conflict',
      actual,
    });
  };
  return ports.withAuthorityLock ? ports.withAuthorityLock(inspect) : inspect();
}

export async function releaseBindingGeneration({ expected, ports } = {}) {
  const release = async () => {
    const inspected = await inspectBindingGeneration({
      context: { expectedBinding: expected },
      ports: { ...ports, withAuthorityLock: null },
    });
    if (['absent', 'already-released', 'paused', 'pending-conflict'].includes(inspected.status))
      return inspected;
    await ports.clearBinding({ expected, actual: inspected.actual });
    const readBack = await ports.readBinding({ expectedBinding: expected });
    if (readBack && sameBindingGeneration(expected, readBack))
      fail('binding-generation:release-readback');
    if (readBack) return frozen({ status: 'pending-conflict', actual: readBack });
    return frozen({ status: 'released', actual: null });
  };
  return ports.withAuthorityLock ? ports.withAuthorityLock(release) : release();
}
