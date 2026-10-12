// @story #1855
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertRevisionMemoryHostProcess } from '../criteria-revision/transport-quarantine.mjs';
const original = promisify(execFile);
export function nativeMoveExecFile(_file, _args, _options, _callback) {
  assertRevisionMemoryHostProcess();
  return Reflect.apply(original, this, arguments);
}
