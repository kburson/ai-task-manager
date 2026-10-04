// @story #1861
// Read admission uses caller-supplied physical/path primitives, avoiding a storage cycle.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  validEmptyOperationId,
  validEmptyRuntimeJournal,
  validEmptyRuntimeControl,
} from './runtime-empty-record.mjs';
const exists = (file) => {
  try {
    return lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
function read(file, base, { assertPath, fail }) {
  assertPath(file, base, 'RUNTIME_CONTROL_INVALID');
  const stat = exists(file);
  if (!stat?.isFile())
    fail('RUNTIME_CONTROL_INVALID', 'Protected activation proof is missing: ' + file);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file)));
  } catch {
    fail('RUNTIME_CONTROL_INVALID', 'Protected activation proof is unreadable: ' + file);
  }
}
export function assertRuntimeEmptyAdmission(layout, primitives) {
  const { assertPath, fail } = primitives;
  const directory = assertPath(
    path.join(layout.sharedRuntimeRoot, 'empty-initializations'),
    layout.sharedRuntimeRoot,
    'RUNTIME_CONTROL_INVALID'
  );
  const stat = exists(directory);
  if (!stat) return;
  if (!stat.isDirectory())
    fail('RUNTIME_CONTROL_INVALID', 'Empty activation history must be a protected directory');
  const names = readdirSync(directory);
  if (!names.length)
    fail('RUNTIME_CONTROL_INVALID', 'Unbound empty activation ancestors require exact recovery');
  for (const id of names) {
    if (!validEmptyOperationId(id))
      fail('RUNTIME_CONTROL_INVALID', 'Unknown empty activation history');
    const operation = assertPath(
      path.join(directory, id),
      layout.sharedRuntimeRoot,
      'RUNTIME_CONTROL_INVALID'
    );
    if (
      !exists(operation)?.isDirectory() ||
      readdirSync(operation).sort().join(',') !== 'journal.json'
    )
      fail(
        'RUNTIME_CONTROL_INVALID',
        'Unbound empty activation artifact requires exact recovery: ' + operation
      );
    const journal = read(
      path.join(operation, 'journal.json'),
      layout.sharedRuntimeRoot,
      primitives
    );
    if (
      !validEmptyRuntimeJournal(journal) ||
      journal.plan.operationId !== id ||
      journal.plan.mainRoot !== layout.mainRoot
    )
      fail('RUNTIME_CONTROL_INVALID', 'Malformed empty activation journal');
    if (journal.status !== 'complete')
      fail(
        'RUNTIME_TRANSACTION_INCOMPLETE',
        'Empty activation publication requires registered status and exact resume'
      );
    const control = exists(layout.sharedControlPath)
      ? read(layout.sharedControlPath, layout.sharedRuntimeRoot, primitives)
      : null;
    if (control?.schema === 'aitm.runtime-control/v2' && control.activation?.id === id) {
      if (!validEmptyRuntimeControl(control) || control.activation.digest !== journal.plan.digest)
        fail('RUNTIME_CONTROL_INVALID', 'Empty activation control contradicts its journal');
      if (control.status !== 'active')
        fail(
          'RUNTIME_TRANSACTION_INCOMPLETE',
          'Empty journal completed before active control; use exact resume'
        );
    } else if (!control)
      fail('RUNTIME_CONTROL_INVALID', 'Complete empty authority has lost its main control');
  }
}
