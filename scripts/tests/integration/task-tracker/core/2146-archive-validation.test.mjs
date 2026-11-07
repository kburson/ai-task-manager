// @story #2146
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { after, test } from 'node:test';
import {
  buildArchive,
  validateArchive,
  restoreArchive,
} from '../../../../research/2146-native-recovery/archive.mjs';

// Each test catches corruption, omitted evidence or a write escaping the owned root.
const { projectScratchDir } = await import(
  pathToFileURL(path.resolve('scripts/task-tracker/lib/scratch-dir.mjs'))
);
const temp = mkdtempSync(
  path.join(projectScratchDir('test', process.cwd()), '2146-archive-format-')
);
const fixture = fileURLToPath(
  new URL('../../../../../docs/archive/2146-native-recovery/', import.meta.url)
);
const indexBytes = readFileSync(path.join(fixture, 'index.json'));
const compressed = readFileSync(path.join(fixture, 'objects.json.gz'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const editIndex = (edit) => {
  const index = JSON.parse(indexBytes);
  edit(index);
  return Buffer.from(JSON.stringify(index, null, 2) + '\n');
};
after(() => rmSync(temp, { recursive: true, force: true }));

test('restores every pinned file and rebuilds identical deduplicated bytes', () => {
  const validated = validateArchive(indexBytes, compressed);
  assert.equal(validated.index.fileCount, 1134);
  assert.equal(validated.objects.size, 593);
  const destination = path.join(temp, 'round-trip');
  mkdirSync(destination, { mode: 0o700 });
  restoreArchive(validated, destination);
  for (const file of validated.index.files) {
    assert.equal(sha(readFileSync(path.join(destination, file.path))), file.sha256, file.path);
  }
  assert.equal(
    sha(readFileSync(path.join(destination, 'manifest-v2.json'))),
    '78afd54726726495057aacba467593b922b218d602081bf6b392274bc2514781'
  );
  const rebuilt = buildArchive(destination);
  assert.equal(
    sha(rebuilt.compressed),
    'e0ec6b6fa0ba3c60be2bbf102cd71028072652fdeb6fe329cc315c5446afa859'
  );
  assert.deepEqual(rebuilt.index, JSON.parse(indexBytes));
});

test('rejects a damaged compressed object before extraction', () => {
  const damaged = Buffer.from(compressed);
  damaged[100] ^= 1;
  assert.throws(() => validateArchive(indexBytes, damaged), /archive|digest|hash/);
});

test('refuses a host-dependent gzip header even with a matching outer digest', () => {
  const changed = Buffer.from(compressed);
  changed[9] = 3;
  const metadata = editIndex((i) => {
    i.objectFile.sha256 = sha(changed);
  });
  assert.throws(() => validateArchive(metadata, changed), /gzip header/);
});

for (const [name, edit] of [
  ['missing member', (i) => i.files.pop()],
  ['extra member', (i) => i.files.push({ ...i.files[0], path: 'foreign.txt' })],
  [
    'duplicate member',
    (i) => {
      i.files[1] = i.files[0];
    },
  ],
  [
    'absolute member',
    (i) => {
      i.files[0].path = '/outside.txt';
    },
  ],
  [
    'parent traversal',
    (i) => {
      i.files[0].path = '../outside.txt';
    },
  ],
  [
    'dot segment',
    (i) => {
      i.files[0].path = 'a/./outside.txt';
    },
  ],
  [
    'backslash traversal',
    (i) => {
      i.files[0].path = 'a\\..\\outside.txt';
    },
  ],
  [
    'Git metadata member',
    (i) => {
      i.files[0].path = '.git/config';
    },
  ],
  [
    'symlink declaration',
    (i) => {
      i.files[0].type = 'symlink';
    },
  ],
  [
    'hardlink declaration',
    (i) => {
      i.files[0].link = 'another-file';
    },
  ],
  [
    'executable mode drift',
    (i) => {
      i.files[0].mode = 0o777;
    },
  ],
  [
    'wrong historical source',
    (i) => {
      i.sourceCommit = '0'.repeat(40);
    },
  ],
  [
    'wrong source tree',
    (i) => {
      i.sourceTree = '0'.repeat(40);
    },
  ],
  [
    'replaced manifest pin',
    (i) => {
      i.manifestSha256 = '0'.repeat(64);
    },
  ],
  [
    'wrong executable pin',
    (i) => {
      i.originalVerifierSha256 = '0'.repeat(64);
    },
  ],
]) {
  test(`refuses ${name} with no output writes`, () => {
    const destination = path.join(temp, name.replaceAll(' ', '-'));
    mkdirSync(destination);
    assert.throws(() => {
      restoreArchive(validateArchive(editIndex(edit), compressed), destination);
    });
    assert.deepEqual(readdirSync(destination), []);
  });
}

test('bounds gzip inflation even when self-reported compressed digest agrees', () => {
  const bomb = gzipSync(Buffer.alloc(9 * 1024 * 1024, 65), { level: 9 });
  bomb[9] = 19;
  const changed = editIndex((i) => {
    i.objectFile.size = bomb.length;
    i.objectFile.sha256 = sha(bomb);
    i.objectFile.uncompressedBytes = 1024;
  });
  assert.throws(() => validateArchive(changed, bomb), /limit|inflate|length|size|bound|Buffer/);
});

for (const [name, mutate] of [
  [
    'noncanonical base64',
    (pairs) => {
      pairs[0][1] += '\n';
    },
  ],
  [
    'duplicate content identity',
    (pairs) => {
      pairs[1] = pairs[0];
    },
  ],
  [
    'unexpected object metadata',
    (pairs) => {
      pairs[0].push('link');
    },
  ],
]) {
  test(`rejects ${name} inside an otherwise self-consistent gzip carrier`, () => {
    const pairs = JSON.parse(gunzipSync(compressed));
    mutate(pairs);
    const raw = Buffer.from(JSON.stringify(pairs) + '\n');
    const changed = gzipSync(raw, { level: 9 });
    changed[9] = 19;
    const metadata = editIndex((i) => {
      i.objectFile.size = changed.length;
      i.objectFile.sha256 = sha(changed);
      i.objectFile.uncompressedBytes = raw.length;
    });
    assert.throws(() => validateArchive(metadata, changed), /object|base64|canonical/);
  });
}

test('refuses an existing symlink ancestor without touching its target', () => {
  const destination = path.join(temp, 'symlink-destination');
  const outside = path.join(temp, 'outside-target');
  mkdirSync(destination);
  mkdirSync(outside);
  symlinkSync(outside, path.join(destination, 'qualification03'), 'dir');
  assert.throws(
    () => restoreArchive(validateArchive(indexBytes, compressed), destination),
    /empty|symlink|contain|ancestor/
  );
  assert.deepEqual(readdirSync(outside), []);
});

test('never overwrites an existing extraction destination', () => {
  const destination = path.join(temp, 'occupied');
  mkdirSync(destination);
  mkdirSync(path.join(destination, 'retained'));
  assert.throws(
    () => restoreArchive(validateArchive(indexBytes, compressed), destination),
    /empty|exist|occupied/
  );
  assert.deepEqual(readdirSync(destination), ['retained']);
});

const packScript = fileURLToPath(
  new URL('../../../../research/2146-native-recovery/pack.mjs', import.meta.url)
);
test('builder CLI writes only the deterministic archive and index to a new owned directory', () => {
  const source = path.join(temp, 'cli-source');
  mkdirSync(source, { mode: 0o700 });
  restoreArchive(validateArchive(indexBytes, compressed), source);
  const destination = path.join(temp, 'cli-output');
  const result = spawnSync(process.execPath, [packScript, source, destination], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(destination).sort(), ['index.json', 'objects.json.gz']);
  assert.equal(
    sha(readFileSync(path.join(destination, 'objects.json.gz'))),
    'e0ec6b6fa0ba3c60be2bbf102cd71028072652fdeb6fe329cc315c5446afa859'
  );
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(destination, 'index.json'))),
    JSON.parse(indexBytes)
  );
});

test('builder CLI refuses existing output without changing it', () => {
  const destination = path.join(temp, 'occupied-cli');
  mkdirSync(destination);
  mkdirSync(path.join(destination, 'retained'));
  const result = spawnSync(
    process.execPath,
    [packScript, path.join(temp, 'cli-source'), destination],
    { encoding: 'utf8' }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /^pack:output-exists/m);
  assert.deepEqual(readdirSync(destination), ['retained']);
});

test('builder CLI rejects publication outside project scratch before writing', () => {
  const result = spawnSync(
    process.execPath,
    [packScript, path.join(temp, 'cli-source'), path.resolve('docs/2146-forbidden-output')],
    { encoding: 'utf8' }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /^pack:output-scope/m);
});
