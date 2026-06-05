#!/usr/bin/env node
import { registerTask } from '../../fleet-registry.mjs';
const [, , projectDir, issueRef, branch, delayMs] = process.argv;
if (delayMs) {
  const until = Date.now() + Number(delayMs);
  // eslint-disable-next-line no-empty -- intentional busy-wait for concurrency test
  while (Date.now() < until) {}
}
registerTask(projectDir, issueRef, `./.tmp/test/wt-${issueRef.replace('#', '')}`, branch);
