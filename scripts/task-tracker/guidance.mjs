#!/usr/bin/env node
import { enforceDirectGuidance } from './lib/direct-guidance-admission.mjs';
enforceDirectGuidance(import.meta.url, 'guidance');
// @story #1672 #1675
// Offline, read-only recovery surface. #1673 routes `aitm guidance` here.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveGuidanceProjectRoot,
  resolveGuidanceSource,
  observeGuidanceSource,
} from '../../guidance/source.mjs';
import { loadGuidance } from '../../guidance/cache.mjs';
import { emitSelfDoc } from '../lib/self-doc.mjs';

const HELP =
  'Usage: npx aitm guidance <validate|source|explain> [ID] [--json] [--file <path>|--published] [--refresh]\n';

function publicValidation(result, selected) {
  const source =
    selected?.sourceType === 'project'
      ? '.ai-task-manager/aitm-guidance.yml'
      : selected?.sourceType === 'package'
        ? 'instructions/aitm-guidance.yml'
        : result.source;
  const errors =
    Array.isArray(result.errors) && (result.valid || result.errors.length > 0)
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

function validateCandidate(file, projectRoot, moduleUrl, cwd, refresh) {
  const absolute = path.resolve(cwd, file);
  try {
    const result = loadGuidance({
      projectRoot,
      moduleUrl,
      profile: 'candidate',
      candidatePath: absolute,
      need: 'diagnostics',
      refresh,
    });
    const activePath =
      projectRoot === null ? null : path.join(projectRoot, '.ai-task-manager/aitm-guidance.yml');
    const warnings = [];
    if (activePath === null) {
      warnings.push('candidate-tracking-indeterminate');
    } else if (absolute !== activePath) {
      warnings.push('candidate-not-active-project-path');
    } else {
      const selected = observeGuidanceSource({ projectRoot, moduleUrl });
      if (selected.trust === 'project-untracked') warnings.push('candidate-untracked');
      if (selected.trust === 'indeterminate') warnings.push('candidate-tracking-indeterminate');
    }
    return publicValidation(
      { ...result, source: absolute, sourceType: 'candidate', warnings },
      null
    );
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
  const [command, ...rawFlags] = argv;
  if (!command || ['help', '--help', '-h', '?'].includes(command)) {
    emitSelfDoc('guidance', (value) => stdout.write(value));
    return 0;
  }
  if (!['validate', 'source', 'explain'].includes(command)) {
    stderr.write(`guidance: unknown command ${command}\n${HELP}`);
    return 2;
  }
  const humanId = command === 'explain' ? rawFlags[0] : null;
  const flags = command === 'explain' ? rawFlags.slice(1) : rawFlags;
  if (command === 'explain' && (!humanId || humanId.startsWith('--'))) {
    stderr.write('guidance: explain needs one guidance ID\n');
    return 2;
  }
  const allowed =
    command === 'validate'
      ? new Set(['--json', '--file', '--published', '--refresh'])
      : new Set(['--json']);
  let file = null;
  let published = false;
  let json = false;
  let refresh = false;
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
    else if (flag === '--refresh') refresh = true;
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
  if (command === 'explain') {
    const loaded = loadGuidance({ projectRoot, moduleUrl, need: 'human' });
    const entry = loaded.humanCatalog?.byId?.[humanId];
    if (!loaded.valid || !entry) {
      stderr.write(`guidance: unknown or unavailable guidance ID ${humanId}\n`);
      return 1;
    }
    const report = {
      schema: 'aitm.guidance-human-explanation/v1',
      source: loaded.source?.path ?? null,
      sourceType: loaded.source?.sourceType ?? null,
      trust: loaded.source?.trust ?? null,
      catalogDigest: loaded.catalogDigest,
      ...entry,
    };
    stdout.write(
      json
        ? `${JSON.stringify(report)}\n`
        : `${entry.id}: ${entry.summary}\n\n${entry.explanation}\n`
    );
    return 0;
  }
  let report;
  if (file !== null) {
    report = validateCandidate(file, projectRoot, moduleUrl, cwd, refresh);
  } else {
    const validation = loadGuidance({
      projectRoot,
      moduleUrl,
      publishedOnly: published,
      profile: published ? 'published' : 'active-project',
      need: 'diagnostics',
      refresh,
    });
    report = publicValidation(validation, validation.source);
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
