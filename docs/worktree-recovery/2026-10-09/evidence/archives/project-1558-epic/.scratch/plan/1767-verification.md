node --test scripts/tests/unit/task-tracker/lib/guidance-candidate-measurement.test.mjs
node scripts/maintenance/measure-guidance-candidate.mjs --all --assert-feasible --json
