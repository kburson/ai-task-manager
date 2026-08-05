#!/usr/bin/env node
// Convert the LinkedIn article series from Markdown into ready-to-paste
// publish folders under `.tmp/published/`.
//
// Usage:
//   node scripts/articles/publish-articles.mjs [--article <slug|NN>] [--skip-diagrams]
//                                              [--out <dir>] [--help]
//
// The publisher only reads docs/articles/. It never writes there.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishAll, ARTICLE_HTML, COMPANION_POST } from './lib/publish.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_ARTICLES_DIR = path.join(REPO_ROOT, 'docs', 'articles');
const DEFAULT_OUT_ROOT = path.join(REPO_ROOT, '.tmp', 'published');

const HELP = `publish-articles — Markdown article series -> LinkedIn-ready publish folders

Usage
  node scripts/articles/publish-articles.mjs [options]
  npm run publish:articles -- [options]

Options
  --article <slug|NN>   Publish only one article ("05" or "05-just-in-time-planner").
                        Skips the shared _diagrams/ library render.
  --skip-diagrams       Do every text transform but render no images. Fast; the
                        image placeholders in article.html then name files that
                        a later full run produces.
  --out <dir>           Output root (default .tmp/published).
  --help                Show this message.

Output, per article
  ${ARTICLE_HTML}          Open in a browser, select all, copy, paste into LinkedIn.
  ${COMPANION_POST}   The short feed post that announces the article.
  article-0N-header.png Upload as the article cover image.
  <slug>-diagram-N.png  Upload where article.html shows an INSERT IMAGE placeholder.
`;

export function parseArgs(argv) {
  const options = { article: null, skipDiagrams: false, out: DEFAULT_OUT_ROOT, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h' || arg === 'help') {
      options.help = true;
    } else if (arg === '--skip-diagrams') {
      options.skipDiagrams = true;
    } else if (arg === '--article') {
      options.article = argv[(i += 1)];
      if (!options.article) throw new Error('--article requires a value');
    } else if (arg === '--out') {
      options.out = argv[(i += 1)];
      if (!options.out) throw new Error('--out requires a value');
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const summary = await publishAll({
    articlesDir: DEFAULT_ARTICLES_DIR,
    outRoot: path.resolve(options.out),
    only: options.article,
    skipDiagrams: options.skipDiagrams,
  });

  for (const result of summary.results) {
    process.stdout.write(
      `${path.relative(REPO_ROOT, result.outDir)} — ${result.diagramCount} diagram(s)\n`
    );
  }
  if (!options.article) {
    process.stdout.write(`${summary.libraryCount} diagram source(s) in the shared library\n`);
  }
  if (summary.drift.length > 0) {
    process.stdout.write(
      `\n${summary.drift.length} in-body fence(s) differ from assets/diagrams/:\n` +
        `${summary.drift.map((line) => `  ${line}`).join('\n')}\n`
    );
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`publish-articles: ${error.message}\n`);
      process.exit(1);
    }
  );
}
