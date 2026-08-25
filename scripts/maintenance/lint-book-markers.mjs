#!/usr/bin/env node
// Lint guard: every `book:` marker in a spine article must parse, balance, and
// point at a fragment that exists.
//
// The composer enforces the same rules, but it runs at build time and reports
// no line numbers, because `parseArticle` discards them. This lint reads raw
// files, so it can say exactly where the mistake is — and it runs in the normal
// lint sweep, long before anyone renders a book.

import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARTICLE_FILE_RE, isOnSpine } from '../articles/lib/book/spine.mjs';
import { parseMarkerLine } from '../articles/lib/book/markers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

const FENCE_RE = /^```/;

/**
 * @param {string} root repository root
 * @returns {Promise<Array<{file: string, line: number, message: string}>>}
 */
export async function lintBookMarkers(root) {
  const articlesDir = path.join(root, 'docs', 'articles');
  const bookDir = path.join(articlesDir, 'assets', 'book');
  const findings = [];

  const names = (await readdir(articlesDir)).filter((name) => ARTICLE_FILE_RE.test(name)).sort();
  for (const file of names) {
    const source = await readFile(path.join(articlesDir, file), 'utf8');
    if (!isOnSpine(source)) continue;

    const lines = source.split('\n');
    let inFence = false;
    let open = 0;
    let openLine = 0;

    for (const [index, text] of lines.entries()) {
      const line = index + 1;
      if (FENCE_RE.test(text)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      let marker;
      try {
        marker = parseMarkerLine(text, file);
      } catch (error) {
        findings.push({ file, line, message: error.message.replace(`${file}: `, '') });
        continue;
      }
      if (marker === null) continue;

      if (marker.verb === 'exclude') {
        open += 1;
        openLine = line;
      }
      if (marker.verb === 'end') {
        open -= 1;
        if (open < 0) {
          findings.push({ file, line, message: 'book:end without a matching book:exclude' });
          open = 0;
        }
      }
      if (marker.verb === 'include') {
        try {
          await access(path.join(bookDir, marker.attrs.path));
        } catch {
          findings.push({
            file,
            line,
            message: `book:include points at ${marker.attrs.path}, which does not exist`,
          });
        }
      }
    }

    if (open > 0) {
      findings.push({ file, line: openLine, message: 'unclosed book:exclude span' });
    }
  }

  return findings;
}

async function main() {
  const findings = await lintBookMarkers(REPO_ROOT);
  if (findings.length === 0) {
    console.log('lint-book-markers: every book marker parses and resolves.');
    return;
  }
  console.error(`lint-book-markers: ${findings.length} problem(s):`);
  for (const finding of findings) {
    console.error(`  docs/articles/${finding.file}:${finding.line}: ${finding.message}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
