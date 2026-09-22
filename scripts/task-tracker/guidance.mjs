#!/usr/bin/env node
// @story #1672
// Offline, read-only recovery surface. #1673 routes `aitm guidance` here.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveGuidanceProjectRoot,
  resolveGuidanceSource,
  loadSelectedGuidance,
} from '../../guidance/source.mjs';
import { validateGuidance } from '../../guidance/validate.mjs';

const HELP =
  'Usage: npx aitm guidance <validate|source> [--json] [--file <path>|--published] [--refresh]\n';

function publicValidation(result, selected) {
  const source =
    selected?.sourceType === 'project'
      ? '.ai-task-manager/aitm-guidance.yml'
      : selected?.sourceType === 'package'
        ? 'instructions/aitm-guidance.yml'
        : result.source;
  const errors = Array.isArray(result.errors)
    ? result.errors
    : [
        {
          code: result.code ?? 'guidance-catalog-invalid',
          path: '',
          line: 1,
          column: 1,
          message: `Selected guidance source is ${selected?.trust ?? 'indeterminate'}`,
          expected: [],
          remediation: 'Inspect the source and repair the reported trust failure.',
        },
      ];
  return {
    schema: 'aitm.guidance-validation/v1',
    valid: Boolean(result.valid),
    source,
    sourceType: selected?.sourceType ?? result.sourceType,
    catalogDigest: result.catalogDigest ?? selected?.catalogFileDigest ?? null,
    errors,
    warnings: [...(result.warnings ?? []), ...(selected?.warnings ?? [])],
  };
}

function validateCandidate(file, projectRoot, moduleUrl, cwd) {
  const absolute = path.resolve(cwd, file);
  try {
    const source = readFileSync(absolute);
    const result = validateGuidance({
      source,
      sourcePath: absolute,
      profile: 'candidate',
    });
    const activePath =
      projectRoot === null ? null : path.join(projectRoot, '.ai-task-manager/aitm-guidance.yml');
    const warnings = [];
    if (activePath === null) {
      warnings.push('candidate-tracking-indeterminate');
    } else if (absolute !== activePath) {
      warnings.push('candidate-not-active-project-path');
    } else {
      const selected = resolveGuidanceSource({ projectRoot, moduleUrl });
      if (selected.trust === 'project-untracked') warnings.push('candidate-untracked');
      if (selected.trust === 'indeterminate') warnings.push('candidate-tracking-indeterminate');
    }
    return publicValidation({ ...result, warnings }, null);
  } catch {
    return publicValidation(
      {
        valid: false,
        source: absolute,
        sourceType: 'candidate',
        code: 'guidance-candidate-unreadable',
      },
      null
    );
  }
}

export function runGuidanceCli(
  argv = process.argv.slice(2),
  {
    cwd = process.cwd(),
    projectRoot = resolveGuidanceProjectRoot(cwd),
    moduleUrl,
    stdout = process.stdout,
    stderr = process.stderr,
  } = {}
) {
  const [command, ...flags] = argv;
  if (!command || ['help', '--help', '-h', '?'].includes(command)) {
    stdout.write(HELP);
    return 0;
  }
  if (!['validate', 'source'].includes(command)) {
    stderr.write(`guidance: unknown command ${command}\n${HELP}`);
    return 2;
  }
  const allowed =
    command === 'validate'
      ? new Set(['--json', '--file', '--published', '--refresh'])
      : new Set(['--json']);
  let file = null;
  let published = false;
  let json = false;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (!allowed.has(flag)) {
      stderr.write(`guidance: unsupported option ${flag}\n${HELP}`);
      return 2;
    }
    if (flag === '--file') {
      if (file !== null || !flags[index + 1] || flags[index + 1].startsWith('--')) {
        stderr.write('guidance: --file needs one path\n');
        return 2;
      }
      file = flags[index + 1];
      index += 1;
    } else if (flag === '--published') published = true;
    else if (flag === '--json') json = true;
    // --refresh is accepted but B1 has no cache to bypass.
  }
  if (file !== null && published) {
    stderr.write('guidance: --file and --published are mutually exclusive\n');
    return 2;
  }
  if (command === 'source') {
    const selected = resolveGuidanceSource({ projectRoot, moduleUrl });
    const report = {
      schema: 'aitm.guidance-source/v1',
      path: selected.path,
      sourceType: selected.sourceType,
      reason: selected.reason,
      trust: selected.trust,
      code: selected.code,
    };
    stdout.write(
      json
        ? `${JSON.stringify(report)}\n`
        : `Source: ${report.path ?? 'unavailable'}\nSelection: ${report.reason}\nTrust: ${report.trust}\n`
    );
    return selected.trust === 'indeterminate' ? 1 : 0;
  }
  let report;
  if (file !== null) {
    report = validateCandidate(file, projectRoot, moduleUrl, cwd);
  } else {
    const selected = resolveGuidanceSource({ projectRoot, moduleUrl, publishedOnly: published });
    report = publicValidation(loadSelectedGuidance(selected), selected);
  }
  if (json) {
    stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    stdout.write(`${report.valid ? 'Guidance valid' : 'Guidance invalid'}: ${report.source}\n`);
    for (const error of report.errors) {
      stdout.write(`${error.code} ${error.path} ${error.line}:${error.column} ${error.message}\n`);
    }
    for (const warning of report.warnings) stdout.write(`warning: ${warning}\n`);
  }
  return report.valid ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runGuidanceCli();
}
