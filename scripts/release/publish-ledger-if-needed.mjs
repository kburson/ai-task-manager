#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitSelfDoc, wantsHelp } from '../lib/self-doc.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const LEDGER_NAME = '@kburson/aitm-ledger';

function parsePublishedVersion(stdout) {
  try {
    const parsed = JSON.parse(String(stdout || '').trim());
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch {
    return [];
  }
}

export function decideLedgerPublish({ status, stdout, stderr, version }) {
  if (status === 0) {
    const published = parsePublishedVersion(stdout);
    if (published.includes(version)) return 'skip';
    throw new Error(
      `ledger registry returned an unexpected version for ${LEDGER_NAME}@${version}; refusing to publish`
    );
  }
  if (/\bE404\b|404 Not Found/i.test(String(stderr || ''))) return 'publish';
  throw new Error(
    `ledger registry lookup failed ambiguously for ${LEDGER_NAME}@${version}; refusing to publish`
  );
}

export function publishLedgerIfNeeded({
  root = ROOT,
  spawn = spawnSync,
  publish = execFileSync,
} = {}) {
  const rootManifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const ledgerManifest = JSON.parse(
    readFileSync(path.join(root, 'packages', 'aitm-ledger', 'package.json'), 'utf8')
  );
  const version = ledgerManifest.version;
  if (rootManifest.dependencies?.[LEDGER_NAME] !== version) {
    throw new Error(`root dependency and ledger version must match exactly (${version})`);
  }

  const lookup = spawn('npm', ['view', `${LEDGER_NAME}@${version}`, 'version', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  const decision = decideLedgerPublish({
    status: lookup.status,
    stdout: lookup.stdout,
    stderr: lookup.stderr,
    version,
  });
  if (decision === 'skip') {
    console.log(`${LEDGER_NAME}@${version} already published; continuing root release`);
    return decision;
  }

  publish('npm', ['publish', '--access', 'public', '--workspace', LEDGER_NAME], {
    cwd: root,
    stdio: 'inherit',
  });
  return decision;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (wantsHelp(process.argv.slice(2))) {
    emitSelfDoc('publish-ledger-if-needed');
    process.exit(0);
  }
  publishLedgerIfNeeded();
}
