// @story #2146
// Strict native verifier: all input/code bytes belong to this checkout's actual HEAD.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PINS,
  ORIGINAL_RELATIVE_ROOT,
  sha,
  validateArchive,
  restoreArchive,
  requirePhysicalDirectory,
} from './archive.mjs';
import { assertNodeRuntime, inspectCarrier } from './carrier.mjs';
import { allocateValidationRoot, reconstructHistoricalSource } from './reconstruct.mjs';

let allocation, historical;
try {
  if (process.argv.length !== 3 || !['report', 'plan'].includes(process.argv[2]))
    throw new Error('verification:usage');
  const mode = process.argv[2];
  assertNodeRuntime();
  const carrier = requirePhysicalDirectory(fileURLToPath(new URL('../../../', import.meta.url)));
  if (requirePhysicalDirectory(process.cwd()) !== carrier) throw new Error('carrier:root');
  const before = inspectCarrier(carrier);
  const data = path.join(carrier, 'docs/archive/2146-native-recovery');
  const indexBytes = readFileSync(path.join(data, 'index.json'));
  const archiveBytes = readFileSync(path.join(data, 'objects.json.gz'));
  const validated = validateArchive(indexBytes, archiveBytes);
  allocation = await allocateValidationRoot(carrier);
  historical = reconstructHistoricalSource(carrier, allocation);
  const evidence = path.join(historical.sourceRoot, ORIGINAL_RELATIVE_ROOT);
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  restoreArchive(validated, evidence);

  // Validation modules are separate, byte-pinned copies; archived scripts stay data.
  const adapterRoot = path.join(allocation.ownedRoot, 'validation-modules');
  mkdirSync(adapterRoot, { mode: 0o700 });
  const adapterDigests = {};
  for (const name of ['historical-context.mjs', 'verify-historical.mjs']) {
    const relative = 'scripts/research/2146-native-recovery/' + name;
    const bytes = readFileSync(path.join(carrier, relative));
    assert.equal(sha(bytes), before.digests[relative]);
    const destination = path.join(adapterRoot, name);
    writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
    assert.equal(sha(readFileSync(destination)), before.digests[relative]);
    adapterDigests[name] = sha(bytes);
  }
  const { createHistoricalContext } = await import(
    pathToFileURL(path.join(adapterRoot, 'historical-context.mjs'))
  );
  const { runHistoricalAssertions } = await import(
    pathToFileURL(path.join(adapterRoot, 'verify-historical.mjs'))
  );
  const context = createHistoricalContext({
    sourceRoot: historical.sourceRoot,
    restoredEvidence: evidence,
    sourceGit: historical.sourceGit,
  });
  const result = runHistoricalAssertions(context, mode);
  assert.equal(result.executionRecords, 81);
  assert.equal(result.matrixCases, 16);
  assert.equal(result.exactRecovery, 'UNIMPLEMENTED');
  assert.equal(result.nativeHostActivation, 'UNPROVEN');
  const after = inspectCarrier(carrier);
  assert.deepEqual(after, before);
  const output = {
    ...result,
    archiveCarrierCommit: before.archiveCarrierCommit,
    archiveCarrierClean: before.archiveCarrierClean,
    historicalSourceCommit: historical.sourceCommit,
    historicalSourceTree: historical.sourceTree,
    archiveSha256: sha(archiveBytes),
    inventorySha256: sha(indexBytes),
    originalManifestSha256: PINS.manifestSha256,
    adapterDigests,
    carrierInputDigests: before.digests,
    gitCommands: historical.commands,
  };
  // Persist complete callback history before emitting the successful native result.
  writeFileSync(
    path.join(allocation.ownedRoot, 'verification-result.json'),
    JSON.stringify(output, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 }
  );
  requirePhysicalDirectory(allocation.ownedRoot);
  rmSync(allocation.ownedRoot, { recursive: true });
  console.log(JSON.stringify(output));
} catch (error) {
  const reason =
    error.message === 'verification:usage'
      ? 'verification:usage'
      : error.code === 'ERR_ASSERTION'
        ? 'verification:assertion'
        : 'verification:input-or-reconstruction';
  const failure = {
    schema: 'aitm.archival-verification-failure/v1',
    reason,
    ownedRoot: allocation?.ownedRoot ?? null,
    commands: historical?.commands ?? error.diagnostics?.commands ?? [],
  };
  if (allocation) {
    try {
      requirePhysicalDirectory(allocation.ownedRoot);
      writeFileSync(
        path.join(allocation.ownedRoot, 'verification-failure.json'),
        JSON.stringify(failure, null, 2) + '\n',
        { flag: 'wx', mode: 0o600 }
      );
    } catch {
      failure.diagnosticWriteFailed = true;
    }
  }
  console.error(reason);
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
}
