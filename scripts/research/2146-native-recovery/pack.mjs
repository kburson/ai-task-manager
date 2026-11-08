// @story #2146
// Local candidate creation only. Publication and Git mutation are deliberately absent.
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildArchive, requirePhysicalDirectory, sha } from './archive.mjs';

const refuse = (code) => {
  throw new Error('pack:' + code);
};
const within = (root, target) => {
  const relative = path.relative(root, target);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
};

try {
  if (process.argv.length !== 4) refuse('usage');
  const carrier = requirePhysicalDirectory(process.cwd());
  const source = path.resolve(process.argv[2]);
  const destination = path.resolve(process.argv[3]);
  if (!within(carrier, source)) refuse('source-scope');
  if (!within(path.join(carrier, '.scratch'), destination)) refuse('output-scope');
  requirePhysicalDirectory(path.dirname(destination));
  try {
    lstatSync(destination);
    refuse('output-exists');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Resolve through the actual carrier's required helper, including during ignored candidate tests.
  const { projectScratchDir } = await import(
    pathToFileURL(path.join(carrier, 'scripts/task-tracker/lib/scratch-dir.mjs'))
  );
  const inspect = projectScratchDir('inspect', carrier);
  if (realpathSync(path.dirname(inspect)) !== path.join(carrier, '.scratch'))
    refuse('scratch-root');
  const { index, compressed } = buildArchive(source);
  const indexBytes = Buffer.from(JSON.stringify(index, null, 2) + '\n');
  mkdirSync(destination, { mode: 0o700 });
  writeFileSync(path.join(destination, 'index.json'), indexBytes, { flag: 'wx', mode: 0o644 });
  writeFileSync(path.join(destination, 'objects.json.gz'), compressed, { flag: 'wx', mode: 0o644 });
  console.log(
    JSON.stringify({
      candidate: true,
      files: index.fileCount,
      archiveSha256: sha(compressed),
      indexSha256: sha(indexBytes),
    })
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
