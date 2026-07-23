#!/usr/bin/env node
// @story #191
// Asserts the worker context contract (#191) is wired correctly:
//   - docs/guides/worker-context-contract.md exists with every required section
//   - templates/worker-report.md exists with every required report field
//   - docs/guides/parallel-agents.md cross-references the contract
//   - the contract cross-references the #190 session-boot index

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

const CONTRACT = path.join(repoRoot, 'docs', 'guides', 'worker-context-contract.md');
const REPORT_TEMPLATE = path.join(repoRoot, 'templates', 'worker-report.md');
const PARALLEL_AGENTS = path.join(repoRoot, 'docs', 'guides', 'parallel-agents.md');

const REQUIRED_CONTRACT_HEADINGS = [
  'Three context packs',
  'Chatter policy',
  'STOP conditions',
  'Worker report schema',
  'No inherited transcript',
  'Disjoint write scopes',
  'Example worker prompt',
  'Example worker final report',
  'Practical thresholds',
];

const REQUIRED_REPORT_FIELDS = [
  'status',
  'bound_issue',
  'files_changed',
  'root_cause',
  'changes_made',
  'verification_run',
  'integration_notes',
  'decisions_needed',
];

test('worker-context-contract.md exists', () => {
  assert.ok(existsSync(CONTRACT), `missing contract: ${CONTRACT}`);
});

test('worker-context-contract.md contains every required section heading', () => {
  const body = readFileSync(CONTRACT, 'utf8');
  for (const h of REQUIRED_CONTRACT_HEADINGS) {
    const re = new RegExp(`^##\\s+\\d+\\.\\s+${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'm');
    assert.match(body, re, `contract is missing section: "${h}"`);
  }
});

test('worker-context-contract.md names the three packs', () => {
  const body = readFileSync(CONTRACT, 'utf8');
  for (const pack of ['Orchestrator pack', 'Worker boot pack', 'Worker task pack']) {
    assert.ok(body.includes(pack), `contract must name pack: "${pack}"`);
  }
});

test('worker-context-contract.md cross-references the #190 session boot index', () => {
  const body = readFileSync(CONTRACT, 'utf8');
  assert.match(
    body,
    /\.ai-task-manager\/templates\/session-boot\.md/,
    'contract must reference .ai-task-manager/templates/session-boot.md (the #190 boot index)'
  );
  assert.match(body, /#190/, 'contract must mention #190 explicitly so the link is auditable');
});

test('templates/worker-report.md exists', () => {
  assert.ok(existsSync(REPORT_TEMPLATE), `missing template: ${REPORT_TEMPLATE}`);
});

test('templates/worker-report.md contains every required report field', () => {
  const body = readFileSync(REPORT_TEMPLATE, 'utf8');
  for (const field of REQUIRED_REPORT_FIELDS) {
    assert.ok(body.includes(field), `worker-report template is missing required field: "${field}"`);
  }
});

test('templates/worker-report.md states the three allowed status values', () => {
  const body = readFileSync(REPORT_TEMPLATE, 'utf8');
  for (const status of ['done', 'partial', 'blocked']) {
    assert.ok(
      body.includes(status),
      `worker-report template must mention status value: "${status}"`
    );
  }
});

test('parallel-agents.md cross-references the worker context contract', () => {
  const body = readFileSync(PARALLEL_AGENTS, 'utf8');
  assert.match(
    body,
    /worker-context-contract\.md/,
    'parallel-agents.md must link to worker-context-contract.md'
  );
});

test('parallel-agents.md has a dedicated worker-context-contract section', () => {
  const body = readFileSync(PARALLEL_AGENTS, 'utf8');
  assert.match(
    body,
    /^##\s+9\.\s+Worker context contract\b/m,
    'parallel-agents.md must add a "§9. Worker context contract" section'
  );
});
