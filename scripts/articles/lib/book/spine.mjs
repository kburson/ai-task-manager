// The book's spine: which articles compose, and in what order.
//
// Order is filename order, because the series was written to be read in that
// order. Membership is the `## Series Link` section, which every drafted
// article carries and no outline does.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const ARTICLE_FILE_RE = /^(\d{2})-(.+)\.md$/;

const SERIES_LINK_RE = /^## Series Link\s*$/m;

/** @param {string} source raw Markdown of one article file */
export function isOnSpine(source) {
  return SERIES_LINK_RE.test(source);
}

/**
 * @param {string} articlesDir
 * @returns {Promise<Array<{file: string, slug: string, number: number, source: string}>>}
 */
export async function listSpine(articlesDir) {
  const names = (await readdir(articlesDir)).filter((name) => ARTICLE_FILE_RE.test(name)).sort();
  const spine = [];
  for (const file of names) {
    const source = await readFile(path.join(articlesDir, file), 'utf8');
    if (!isOnSpine(source)) continue;
    const match = file.match(ARTICLE_FILE_RE);
    spine.push({
      file,
      slug: file.replace(/\.md$/, ''),
      number: Number(match[1]),
      source,
    });
  }
  return spine;
}
