import { existsSync, writeFileSync } from 'node:fs';

import { enqueue, removeExactQueueEntries } from '../../queue.mjs';

const [operation, queuePath, readyPath, goPath, payloadJson] = process.argv.slice(2);

function barrier() {
  writeFileSync(readyPath, `${process.pid}\n`);
  const deadline = Date.now() + 5_000;
  while (!existsSync(goPath)) {
    if (Date.now() > deadline) throw new Error('queue mutation barrier timed out');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}

const payload = JSON.parse(payloadJson);
if (operation === 'enqueue') {
  enqueue(payload, queuePath, { onMutationLockAcquired: barrier });
} else if (operation === 'remove') {
  removeExactQueueEntries(payload, queuePath, { onMutationLockAcquired: barrier });
} else {
  throw new Error(`unknown queue worker operation: ${operation}`);
}
