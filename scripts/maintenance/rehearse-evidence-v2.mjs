#!/usr/bin/env node
// @story #1501
import { readFileSync } from 'node:fs';
import {
  captureRehearsal,
  disposeRehearsal,
  inspectRehearsal,
  runRehearsal,
} from '../task-tracker/lib/evidence-v2/rehearsal-manifest.mjs';

const [command, ...argv] = process.argv.slice(2);
const option = (name, required = true) => {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : null;
  if (required && !value) throw new Error(`missing-option:${name}`);
  return value;
};
const help = `Usage:
  rehearse-evidence-v2 capture --sources-file <json> --output-root <owned-path>
  rehearse-evidence-v2 run --manifest <path> --tool-root <pinned-runtime> --provider recorded
  rehearse-evidence-v2 inspect --run-manifest <path>
  rehearse-evidence-v2 dispose --run-manifest <path> --confirm-run <runId>`;

try {
  let result;
  if (command === 'capture') {
    result = captureRehearsal({
      sources: JSON.parse(readFileSync(option('--sources-file'), 'utf8')),
      outputRoot: option('--output-root'),
    });
  } else if (command === 'run') {
    result = runRehearsal({
      captureManifestPath: option('--manifest'),
      toolRoot: option('--tool-root'),
      provider: option('--provider'),
    });
  } else if (command === 'inspect') {
    result = inspectRehearsal(option('--run-manifest'));
  } else if (command === 'dispose') {
    result = disposeRehearsal(option('--run-manifest'), option('--confirm-run'));
  } else {
    process.stdout.write(`${help}\n`);
    process.exitCode = command && command !== 'help' ? 1 : 0;
  }
  if (result) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
