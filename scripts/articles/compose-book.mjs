#!/usr/bin/env node
// Compose the article series into a book.
//
// Usage:
//   node scripts/articles/compose-book.mjs [--target manuscript|pdf|epub|html]
//                                          [--out <dir>] [--doctor] [--help]
//
// Reads docs/articles/ and never writes there.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildManuscript } from './lib/book/manuscript.mjs';
import { renderTarget, TARGETS } from './lib/book/render.mjs';
import { doctor } from './lib/book/toolchain.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'docs', 'articles');
const BOOK_DIR = path.join(ARTICLES_DIR, 'assets', 'book');
const DEFAULT_OUT = path.join(REPO_ROOT, '.tmp', 'book');

const HELP = `compose-book — article series -> book manuscript and rendered targets

Usage
  node scripts/articles/compose-book.mjs [options]
  npm run book -- [options]

Options
  --target <name>   One of ${TARGETS.join(', ')}. Repeatable. Default: all.
  --out <dir>       Output root (default .tmp/book).
  --doctor          Check the LaTeX toolchain and exit.
  --help            Show this message.
`;

export function parseArgs(argv) {
  const options = { targets: [], out: DEFAULT_OUT, doctor: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--doctor') options.doctor = true;
    else if (arg === '--out') {
      options.out = argv[(i += 1)];
      if (!options.out) throw new Error('--out requires a value');
    } else if (arg === '--target') {
      const value = argv[(i += 1)];
      if (!TARGETS.includes(value)) throw new Error(`unknown target: ${value}`);
      options.targets.push(value);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.targets.length === 0) options.targets = [...TARGETS];
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  if (options.doctor) {
    const report = await doctor();
    if (report.missingBinaries.length > 0) {
      console.error(`missing on PATH: ${report.missingBinaries.join(', ')}`);
      console.error('install pandoc with `brew install pandoc`');
      console.error(
        'install LaTeX with `brew install --cask basictex`, then `sudo tlmgr install latexmk`'
      );
    }
    if (report.hint) console.error(report.hint);
    if (report.ok) console.log('doctor:book — toolchain is complete');
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  await mkdir(options.out, { recursive: true });

  for (const target of options.targets) {
    const built = await buildManuscript({ articlesDir: ARTICLES_DIR, bookDir: BOOK_DIR, target });
    const name = target === 'manuscript' ? 'manuscript.md' : `manuscript-${target}.md`;
    const manuscriptPath = path.join(options.out, name);
    await writeFile(manuscriptPath, built.markdown);
    console.log(
      `${target}: ${built.chapters} chapters, ${built.footnotes} footnotes, ${built.indexTerms} index terms -> ${manuscriptPath}`
    );
    if (target === 'manuscript') continue;
    await renderTarget({ manuscriptPath, bookDir: BOOK_DIR, outDir: options.out, target });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
