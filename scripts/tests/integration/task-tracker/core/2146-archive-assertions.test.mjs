// @story #2146
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  PINS,
  ORIGINAL_RELATIVE_ROOT,
  sha,
  validateArchive,
  restoreArchive,
} from '../../../../research/2146-native-recovery/archive.mjs';
import {
  allocateValidationRoot,
  reconstructHistoricalSource,
} from '../../../../research/2146-native-recovery/reconstruct.mjs';
import { createHistoricalContext } from '../../../../research/2146-native-recovery/historical-context.mjs';
import { runHistoricalAssertions } from '../../../../research/2146-native-recovery/verify-historical.mjs';

// Real historical assertions must reject semantic corruption even after a fixture's
// local consistency hashes are updated. This cannot change production CLI pins.
test('preserves all historical assertions in both modes and rejects semantic drift', async () => {
  const allocation = await allocateValidationRoot(process.cwd());
  const historical = reconstructHistoricalSource(process.cwd(), allocation);
  const evidence = path.join(historical.sourceRoot, ORIGINAL_RELATIVE_ROOT);
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const archive = fileURLToPath(
    new URL('../../../../../docs/archive/2146-native-recovery/', import.meta.url)
  );
  restoreArchive(
    validateArchive(
      readFileSync(path.join(archive, 'index.json')),
      readFileSync(path.join(archive, 'objects.json.gz'))
    ),
    evidence
  );
  const context = createHistoricalContext({
    sourceRoot: historical.sourceRoot,
    restoredEvidence: evidence,
    sourceGit: historical.sourceGit,
  });
  for (const mode of ['report', 'plan']) {
    const result = runHistoricalAssertions(context, mode);
    assert.equal(result.executionRecords, 81);
    assert.equal(result.matrixCases, 16);
    assert.equal(result.historicalReconstructionClean, true);
    assert.equal(result.exactRecovery, 'UNIMPLEMENTED');
    assert.equal(result.nativeHostActivation, 'UNPROVEN');
    assert.equal(Object.hasOwn(result, 'sourceClean'), false);
  }
  assert.throws(() => runHistoricalAssertions(context, 'unsupported'));
  const manifestPath = path.join(evidence, 'manifest-v2.json');
  const originalManifestBytes = readFileSync(manifestPath);
  const originalManifest = JSON.parse(originalManifestBytes);
  const summaries = Object.keys(originalManifest.artifacts).filter((name) =>
    name.endsWith('/summary.json')
  );
  const summaryDir = path.dirname(summaries[0]);
  const base = context.readJson(path.join(evidence, 'qualified-baseline-results.json'));
  const baselineDir = context.resolveHistoricalOutput(base.draft.out);
  const cases = [
    [
      summaryDir + '/execution-identity.json',
      (data) => {
        data.harnessSha256 = '0'.repeat(64);
      },
      'identity',
    ],
    [
      summaries[0],
      (data) => {
        data.dependenciesUnchanged = false;
      },
      'dependencies',
    ],
    [
      'qualified-baseline-results.json',
      (data) => {
        data.draft.cliStatus = 0;
      },
      'baseline',
    ],
    [
      baselineDir + '/runtime-after.json',
      (data) => {
        const side = Object.keys(data).find((key) => Object.keys(data[key].files).length);
        data[side].files[Object.keys(data[side].files)[0]] = 'changed';
      },
      'runtime',
    ],
    [
      'activation-probes-baseline03.json',
      (data) => {
        data[0].blocked = null;
      },
      'activation',
    ],
    [
      'matrix-v2.json',
      (data) => {
        data.cases.find((item) => item.id === 'ref-reflog-drift').status = 'pass';
      },
      'refusal-outcome',
    ],
  ];
  for (const [relative, edit, label] of cases) {
    const target = path.join(evidence, relative),
      originalBytes = readFileSync(target);
    try {
      const value = JSON.parse(originalBytes);
      edit(value);
      const changed = Buffer.from(JSON.stringify(value));
      writeFileSync(target, changed);
      const manifest = structuredClone(originalManifest);
      manifest.artifacts[relative] = sha(changed);
      writeFileSync(manifestPath, JSON.stringify(manifest));
      assert.throws(
        () =>
          createHistoricalContext({
            sourceRoot: historical.sourceRoot,
            restoredEvidence: evidence,
            sourceGit: historical.sourceGit,
          }),
        /manifest-pin/
      );
      // Internal assertion entrypoint consumes an explicit test context. The production
      // context and strict archive still independently refuse the changed manifest.
      const semanticContext = {
        ...context,
        readJson: (file) => (file === manifestPath ? manifest : context.readJson(file)),
      };
      assert.throws(
        () => runHistoricalAssertions(semanticContext, 'report'),
        { code: 'ERR_ASSERTION' },
        label
      );
    } finally {
      writeFileSync(target, originalBytes);
      writeFileSync(manifestPath, originalManifestBytes);
    }
  }
  for (const [relative, phrase, mode] of [
    ['report-v2.md', 'not proof that the Codex native host', 'report'],
    ['2026-11-03-2146-native-recovery-defect-plan.md', 'NOT authorization to implement', 'plan'],
  ]) {
    const target = path.join(evidence, relative),
      originalBytes = readFileSync(target);
    try {
      const changed = Buffer.from(originalBytes.toString().replaceAll(phrase, 'changed claim'));
      writeFileSync(target, changed);
      const manifest = structuredClone(originalManifest);
      manifest.artifacts[relative] = sha(changed);
      assert.throws(
        () =>
          runHistoricalAssertions(
            {
              ...context,
              readJson: (file) => (file === manifestPath ? manifest : context.readJson(file)),
            },
            mode
          ),
        { code: 'ERR_ASSERTION' }
      );
    } finally {
      writeFileSync(target, originalBytes);
    }
  }
  const source = path.join(historical.sourceRoot, 'bin/aitm.mjs'),
    originalSource = readFileSync(source);
  try {
    writeFileSync(source, 'changed source');
    assert.throws(() => runHistoricalAssertions(context, 'report'), { code: 'ERR_ASSERTION' });
    // Independently reach the original source-hash assertion after the real dirty-tree refusal.
    const hashContext = {
      ...context,
      execFileSync: (command, args, options) =>
        args[0] === 'status' ? '' : context.execFileSync(command, args, options),
    };
    assert.throws(
      () => runHistoricalAssertions(hashContext, 'report'),
      /owned source changed bin\/aitm.mjs/
    );
  } finally {
    writeFileSync(source, originalSource);
  }
  const headFile = path.join(historical.sourceRoot, '.git/HEAD'),
    savedHead = readFileSync(headFile);
  try {
    writeFileSync(headFile, '0'.repeat(40) + '\n');
    assert.throws(() => runHistoricalAssertions(context, 'report'), { code: 'ERR_ASSERTION' });
  } finally {
    writeFileSync(headFile, savedHead);
  }
  const member = path.join(evidence, 'report-v2.md');
  renameSync(member, member + '.saved');
  try {
    assert.throws(() => runHistoricalAssertions(context, 'report'), { code: 'ENOENT' });
  } finally {
    renameSync(member + '.saved', member);
  }
  assert.equal(sha(readFileSync(manifestPath)), PINS.manifestSha256);
  // Disconnect only this disposable shared clone's object pointer. The carrier's
  // objects remain intact; the negative must stop at cat-file and never fetch/clone.
  const alternates = path.join(historical.sourceRoot, '.git/objects/info/alternates');
  const savedAlternates = readFileSync(alternates);
  let missing;
  try {
    rmSync(alternates);
    // Internal allocator seam avoids importing any reconstructed historical runtime.
    const emptyObjects = await allocateValidationRoot(historical.sourceRoot, {
      resolveRoot: (root) => root,
    });
    try {
      reconstructHistoricalSource(historical.sourceRoot, emptyObjects);
    } catch (error) {
      missing = error;
    }
    assert.match(missing?.message ?? '', /^reconstruct:git-failed:cat-file$/);
    assert.equal(
      missing.diagnostics.commands.some(
        (row) => row.args.includes('fetch') || row.args.includes('clone')
      ),
      false
    );
  } finally {
    writeFileSync(alternates, savedAlternates);
  }
  console.log(
    JSON.stringify({
      schema: 'aitm.archival-assertions/v1',
      modes: ['report', 'plan'],
      semanticNegatives: 8,
      dirtySource: true,
      sourceHash: true,
      wrongHead: true,
      missingMember: true,
      missingObject: missing.diagnostics,
      commands: historical.commands,
    })
  );
  rmSync(allocation.ownedRoot, { recursive: true });
});
