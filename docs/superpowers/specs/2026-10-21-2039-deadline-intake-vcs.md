node --test scripts/tests/unit/task-tracker/lib/decomposition-snapshot-deadline.test.mjs
node --test scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs
git diff --check
