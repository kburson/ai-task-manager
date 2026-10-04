// @story #1861
import fs, { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as empty from '../../../task-tracker/lib/runtime-empty-initialize.mjs';
import {
  inspectRuntimeCoordinator,
  recoverRuntimeCoordinator,
} from '../../../task-tracker/lib/runtime-migration-lock.mjs';
const [planFile, boundary, mode = 'apply', observedDigest] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planFile));
if (mode === 'resume-after-coordinator-release') {
  const unlink = fs.unlinkSync,
    close = fs.closeSync;
  let released = false;
  fs.unlinkSync = (file) => {
    const result = unlink(file);
    if (file.endsWith('coordinator.lock')) released = true;
    return result;
  };
  fs.closeSync = (fd) => {
    const result = close(fd);
    if (released) process.kill(process.pid, 'SIGKILL');
    return result;
  };
  syncBuiltinESMExports();
}
const owner = {
  provider: 'fixture',
  sid: 'empty-child-' + randomUUID(),
  pid: process.pid,
  processToken: randomUUID(),
  host: hostname(),
};
const adapters = {
  identity: () => owner,
  writerCensus: () => ({ complete: true, writers: [], claims: [], unknown: [] }),
  fault: async (point) => {
    if (point === boundary) {
      process.send({ boundary: point, pid: process.pid, operationId: plan.operationId });
      setInterval(() => {}, 1000);
      await new Promise(() => {});
    }
  },
};
try {
  let result;
  if (mode === 'apply')
    result = await empty.applyEmptyRuntimeInitialization({
      plan,
      approvedPlanDigest: plan.digest,
      adapters,
    });
  else {
    const input = {
      projectRoot: plan.projectRoot,
      mainRoot: plan.mainRoot,
      operationId: plan.operationId,
    };
    const coordinator = inspectRuntimeCoordinator(input);
    if (coordinator.status === 'owned')
      recoverRuntimeCoordinator({
        ...input,
        transactionId: plan.operationId,
        approvedPlanDigest: plan.digest,
        expectedDigest: coordinator.digest,
        adapters: {
          ...adapters,
          faultSync: (point) => {
            if (point === boundary) {
              process.send({ boundary: point, pid: process.pid, operationId: plan.operationId });
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
            }
          },
        },
      });
    const observed = empty.inspectEmptyRuntimeInitialization(input);
    result = await empty.resumeEmptyRuntimeInitialization({
      ...input,
      observedDigest: observedDigest || observed.digest,
      approvedPlanDigest: plan.digest,
      adapters,
    });
  }
  process.send({ result, pid: process.pid, operationId: plan.operationId });
} catch (error) {
  process.send({
    error: { code: error.code, message: error.message },
    pid: process.pid,
    operationId: plan.operationId,
  });
  process.exitCode = 1;
}
process.disconnect();
