#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GIT_SHA_RE = /^[a-f0-9]{40}$/;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function redactGitleaksReport(reportBytes) {
  const findings = JSON.parse(String(reportBytes || '[]'));
  if (!Array.isArray(findings)) throw new TypeError('Gitleaks report must be a JSON array');
  const redacted = findings.map((finding) => ({
    commit: finding.Commit ?? null,
    description: finding.Description ?? null,
    end_line: finding.EndLine ?? null,
    file: finding.File ?? null,
    fingerprint: finding.Fingerprint ?? null,
    rule_id: finding.RuleID ?? null,
    start_line: finding.StartLine ?? null,
  }));
  return `${JSON.stringify(redacted, null, 2)}\n`;
}

export function buildSecretScanRecord({
  toolVersion,
  configBytes,
  scannedRef,
  redactedReportBytes,
  exitCode,
}) {
  const version = String(toolVersion ?? '').trim().match(/\d+\.\d+\.\d+/)?.[0];
  if (!version) throw new Error('Gitleaks version is missing or malformed');
  if (!GIT_SHA_RE.test(scannedRef ?? '')) throw new Error('Gitleaks scanned ref is malformed');
  if (exitCode !== 0) throw new Error(`Gitleaks scan failed with exit ${exitCode}`);
  return Object.freeze({
    tool: 'gitleaks',
    tool_version: version,
    config_digest: sha256(configBytes),
    scanned_ref: scannedRef,
    report_digest: sha256(redactedReportBytes),
    result: 'pass',
  });
}

async function run(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      ...options,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      exitCode: Number.isInteger(error.code) ? error.code : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
    };
  }
}

async function atomicWriteJson(file, value) {
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, file);
}

export async function runSecretScan({ root, ref, deps = {} }) {
  if (!GIT_SHA_RE.test(ref ?? '')) throw new Error('usage: --ref must be a 40-character Git SHA');
  const execute = deps.run ?? run;
  const configPath = path.join(root, '.gitleaks.toml');
  const manifestPath = path.join(root, 'provenance', 'extraction-manifest.json');
  const scratchRoot = path.join(root, '.scratch', 'peer-review');
  const reportPath = path.join(scratchRoot, `gitleaks-report-${process.pid}.json`);
  await mkdir(scratchRoot, { recursive: true });
  const configBytes = await readFile(configPath);
  const versionResult = await execute('gitleaks', ['version'], { cwd: root });
  if (versionResult.exitCode !== 0) throw new Error(`Gitleaks unavailable: ${versionResult.stderr}`);
  const scanResult = await execute(
    'gitleaks',
    [
      'git',
      root,
      '--config',
      configPath,
      '--report-format',
      'json',
      '--report-path',
      reportPath,
      '--redact=100',
      '--no-banner',
      '--no-color',
      '--log-opts',
      ref,
    ],
    { cwd: root }
  );
  let rawReport = '[]';
  try {
    rawReport = await readFile(reportPath, 'utf8');
  } finally {
    await rm(reportPath, { force: true });
  }
  const redactedReport = redactGitleaksReport(rawReport);
  const record = buildSecretScanRecord({
    toolVersion: versionResult.stdout,
    configBytes,
    scannedRef: ref,
    redactedReportBytes: Buffer.from(redactedReport),
    exitCode: scanResult.exitCode,
  });
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.secret_scan = record;
  await atomicWriteJson(manifestPath, manifest);
  return record;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--ref') {
    throw new Error('usage: node scripts/run-secret-scan.mjs --ref <40-character-git-sha>');
  }
  const record = await runSecretScan({ root: process.cwd(), ref: args[1] });
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
