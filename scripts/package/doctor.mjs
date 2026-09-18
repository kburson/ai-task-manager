#!/usr/bin/env node
// @story #1693
// Standalone, read-only installation health command. This is not a task verb.

import { emitSelfDoc, isDirectInvocation, wantsHelp } from '../lib/self-doc.mjs';
import { diagnoseInstallation } from './install-observer.mjs';

export class DoctorUsageError extends Error {}

export function parseDoctorArgs(argv) {
  if (argv.length === 0) return { json: false };
  if (argv.length === 1 && argv[0] === '--json') return { json: true };
  throw new DoctorUsageError('Usage: npx aitm doctor [--json]');
}

export function renderDoctorJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderDoctorHuman(report) {
  const lines = [`AITM installation health: ${report.healthy ? 'healthy' : 'unhealthy'}`, ''];
  for (const item of report.checks) {
    lines.push(`[${item.status.toUpperCase()}] ${item.id}: ${item.details}`);
    if (item.recovery) lines.push(`  Recovery: ${item.recovery}`);
  }
  lines.push('');
  lines.push(
    `Summary: ${report.summary.ok} ok, ${report.summary.unhealthy} unhealthy, ${report.summary.optional} optional`
  );
  return `${lines.join('\n')}\n`;
}

export function runDoctor({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  stdout = (value) => process.stdout.write(value),
  stderr = (value) => process.stderr.write(value),
  deps = {},
} = {}) {
  if (wantsHelp(argv)) {
    emitSelfDoc('doctor', stdout);
    return 0;
  }
  try {
    const { json } = parseDoctorArgs(argv);
    const report = (deps.diagnose || diagnoseInstallation)({ cwd, deps });
    stdout(json ? renderDoctorJson(report) : renderDoctorHuman(report));
    return report.healthy ? 0 : 1;
  } catch (error) {
    if (error instanceof DoctorUsageError) {
      stderr(`${error.message}\n`);
      return 2;
    }
    const report = {
      schema: 'aitm.doctor/v1',
      healthy: false,
      projectRoot: null,
      summary: { ok: 0, unhealthy: 1, optional: 0 },
      checks: [
        {
          id: 'package.runtime',
          status: 'invalid',
          required: true,
          details: `Doctor inspection failed: ${error.message}`,
          recovery: 'Verify the installed AITM package and rerun doctor.',
        },
      ],
    };
    const json = argv.length === 1 && argv[0] === '--json';
    stdout(json ? renderDoctorJson(report) : renderDoctorHuman(report));
    return 1;
  }
}

if (isDirectInvocation(import.meta.url)) process.exit(runDoctor());
