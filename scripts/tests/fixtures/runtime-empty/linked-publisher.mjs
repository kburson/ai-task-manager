// @story #1861
import fs, { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import * as initialization from '../../../task-tracker/lib/runtime-initialize.mjs';
import {
  inspectRuntimeCoordinator,
  recoverRuntimeCoordinator,
} from '../../../task-tracker/lib/runtime-migration-lock.mjs';
const [file, boundary, mode = 'apply'] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(file));
if (mode === 'resume-before-owned-journal') {
  const unlink = fs.unlinkSync;
  fs.unlinkSync = (target) => {
    const result = unlink(target);
    if (target.includes('initialization-recoveries') && target.endsWith('.pending'))
      process.kill(process.pid, 'SIGKILL');
    return result;
  };
  syncBuiltinESMExports();
}
const owner = {
  provider: 'fixture',
  sid: randomUUID(),
  pid: process.pid,
  processToken: randomUUID(),
  host: hostname(),
};
const input = {
  projectRoot: plan.projectRoot,
  mainRoot: plan.mainRoot,
  operationId: plan.operationId,
};
const adapters = {
  identity: () => owner,
  fault: async (point) => {
    if (point === boundary) {
      process.send({ boundary, pid: process.pid });
      setInterval(() => {}, 1000);
      await new Promise(() => {});
    }
  },
};
try {
  let result;
  if (mode === 'apply')
    result = await initialization.applyRuntimeInitialization({
      plan,
      approvedPlanDigest: plan.digest,
      adapters,
    });
  else {
    const coordinator = inspectRuntimeCoordinator(input);
    if (coordinator.status === 'owned')
      recoverRuntimeCoordinator({
        ...input,
        transactionId: plan.operationId,
        approvedPlanDigest: plan.digest,
        expectedDigest: coordinator.digest,
        adapters,
      });
    const observed = initialization.inspectRuntimeInitialization(input);
    result = await initialization.resumeRuntimeInitialization({
      ...input,
      observedDigest: observed.digest,
      approvedPlanDigest: plan.digest,
      adapters,
    });
  }
  process.send({ result });
} catch (error) {
  process.send({ error: { code: error.code, message: error.message } });
  process.exitCode = 1;
}
process.disconnect();
