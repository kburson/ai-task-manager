#!/usr/bin/env node
import { registerTask } from '../fleet-registry.mjs';
const [, , projectDir, issueRef, branch, delayMs] = process.argv;
if (delayMs) {
  const until = Date.now() + Number(delayMs);
  while (Date.now() < until) {}
}
registerTask(projectDir, issueRef, `/tmp/wt-${issueRef.replace('#', '')}`, branch);
