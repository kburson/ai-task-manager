// @story #1497
// cspell:ignore objectname
import { execFileSync } from 'node:child_process';
import { realpathSync, readFileSync, lstatSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import { hash, fail, repository, frozen, canonical } from './value.mjs';
import { validateInputs } from './subject-inputs.mjs';
import { validateSubject } from './record-schema.mjs';
function manifestFor({ sourceRoot, git, treeOid }) {
  const output = git(['ls-tree', '-r', '-z', '--full-tree', treeOid]);
  const chunks = [];
  let start = 0;
  for (let i = 0; i < output.length; i++) {
    if (output[i] === 0) {
      chunks.push(output.subarray(start, i));
      start = i + 1;
    }
  }
  if (start !== output.length) fail('manifest-termination');
  const entries = chunks.map((raw) => {
    const tab = raw.indexOf(9);
    if (tab < 0) fail('manifest-entry');
    const [mode, type, oid] = raw.subarray(0, tab).toString('ascii').split(' ');
    const rawPath = raw.subarray(tab + 1);
    if (type !== 'blob' || !['100644', '100755', '120000'].includes(mode))
      fail('unresolved-material');
    const bytes = git(['cat-file', 'blob', oid]);
    if (bytes.subarray(0, 43).toString().startsWith('version https://git-lfs.github.com/spec/v1'))
      fail('unresolved-material');
    const fullPath = Buffer.concat([Buffer.from(sourceRoot + path.sep), rawPath]);
    let stat, working;
    try {
      stat = lstatSync(fullPath);
      working = stat.isSymbolicLink()
        ? readlinkSync(fullPath, { encoding: 'buffer' })
        : readFileSync(fullPath);
    } catch {
      fail('dirty-source');
    }
    const workingMode = stat.isSymbolicLink() ? '120000' : stat.mode & 0o111 ? '100755' : '100644';
    if (workingMode !== mode || !working.equals(bytes)) fail('dirty-source');
    return { pathBytes: rawPath.toString('hex'), mode, type, contentDigest: hash(bytes) };
  });
  entries.sort((a, b) => a.pathBytes.localeCompare(b.pathBytes));
  return entries;
}
function consumedFiles(sourceRoot, names) {
  const seen = new Set();
  return names
    .map((name) => {
      if (
        typeof name !== 'string' ||
        !name ||
        path.isAbsolute(name) ||
        name.split(/[\\/]/).some((s) => ['..', '.git'].includes(s)) ||
        seen.has(name)
      )
        fail('consumed-input-path');
      seen.add(name);
      const full = path.resolve(sourceRoot, name);
      let resolved;
      try {
        resolved = realpathSync(full);
      } catch {
        fail('consumed-input-missing');
      }
      if (!resolved.startsWith(sourceRoot + path.sep) || !lstatSync(full).isFile())
        fail('consumed-input-path');
      return { path: name, contentDigest: hash(readFileSync(full)) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}
export function buildEvidenceSubject({
  repositoryId,
  sourceRoot,
  requirements,
  recipe,
  environment,
  gitInputs = null,
  ports = {},
}) {
  repository(repositoryId);
  const normalizedRecipe = validateInputs({ requirements, recipe, environment });
  const root = realpathSync(sourceRoot);
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      env: ports.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 128 * 1024 * 1024,
    });
  const text = (args) => git(args).toString('utf8').trim();
  if (text(['rev-parse', '--show-toplevel']) !== root) fail('source-root');
  const sourceSha = text(['rev-parse', 'HEAD']);
  const treeOid = text(['rev-parse', 'HEAD^{tree}']);
  if (git(['diff', '--no-ext-diff', '--raw', 'HEAD', '--']).length) fail('dirty-source');
  const manifest = manifestFor({ sourceRoot: root, git, treeOid });
  const consumed = consumedFiles(root, environment.consumedFiles);
  const sensitivity = normalizedRecipe.sensitivity;
  const history =
    sensitivity === 'history-sensitive'
      ? {
          sourceSha,
          commits: hash(git(['log', '--all', '--format=raw', '--no-decorate'])),
          refs: hash(git(['for-each-ref', '--format=%(refname) %(objectname)'])),
          head: hash(git(['rev-parse', '--abbrev-ref', 'HEAD'])),
          declared: gitInputs,
        }
      : null;
  const identity = {
    schema: 'aitm.evidence-subject/v2',
    repositoryId,
    source: {
      objectFormat: text(['rev-parse', '--show-object-format']),
      treeOid,
      manifestDigest: hash(manifest),
    },
    requirementsDigest: hash(requirements),
    recipeDigest: hash(normalizedRecipe),
    environmentDigest: hash({ environment, consumed }),
    gitInputs: { sensitivity, digest: history ? hash(history) : null },
  };
  if (
    sourceSha !== text(['rev-parse', 'HEAD']) ||
    canonical(manifest) !== canonical(manifestFor({ sourceRoot: root, git, treeOid })) ||
    canonical(consumed) !== canonical(consumedFiles(root, environment.consumedFiles))
  )
    fail('source-changed-during-capture');
  const subject = { ...identity, subjectId: hash(identity) };
  validateSubject(subject);
  return frozen({
    subject,
    manifest,
    observations: { sourceSha, sourceRoot: root, capturedAt: new Date().toISOString() },
    inputs: { requirements, recipe: normalizedRecipe, environment, consumed, history },
  });
}
