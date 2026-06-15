#!/usr/bin/env node
// #404 — verify the P3 ("Chore") priority option is provisioned end-to-end:
//   1. `.ai-task-manager/task-tracker.json` carries a non-empty `priorityOptionP3`.
//   2. The live GitHub Project Priority single-select field has a `P3` option
//      whose id matches the configured `priorityOptionP3`.
//
// Exits 0 when both hold, non-zero (with a diagnostic on stderr) otherwise.
// Used as the AC verifier for the live-board / live-config acceptance criteria,
// and reusable as a standalone drift check.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CONFIG = '.ai-task-manager/task-tracker.json';

function fail(msg) {
  console.error(`verify-priority-p3: ${msg}`);
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
} catch (err) {
  fail(`cannot read ${CONFIG}: ${err.message}`);
}

const configuredId = cfg.priorityOptionP3;
if (!configuredId) fail(`${CONFIG} has no priorityOptionP3`);

const query = `query($p:ID!){node(id:$p){... on ProjectV2{field(name:"Priority"){... on ProjectV2SingleSelectField{options{id name}}}}}}`;
let out;
try {
  out = execFileSync('gh', ['api', 'graphql', '-f', `query=${query}`, '-F', `p=${cfg.projectId}`], {
    encoding: 'utf8',
  });
} catch (err) {
  fail(`live Priority field query failed: ${err.message}`);
}

const options = JSON.parse(out)?.data?.node?.field?.options ?? [];
const p3 = options.find((o) => o.name === 'P3');
if (!p3) fail('live Priority field has no P3 option');
if (p3.id !== configuredId) {
  fail(`live P3 option id ${p3.id} != configured priorityOptionP3 ${configuredId}`);
}

console.log(`verify-priority-p3: OK — live P3 option ${p3.id} matches configured priorityOptionP3`);
