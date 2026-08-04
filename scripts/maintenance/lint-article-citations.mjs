#!/usr/bin/env node
// #1101 — Lint guard: every citation in an article's `## Bibliography` section
// must be an absolute URL.
//
// Six of the nine articles cited repo-internal docs by relative path
// (`../introduction/core-workflow.md`). A relative path resolves against the
// repo checkout, which a published LinkedIn article is not — there it renders as
// literal text pointing nowhere. The three clean articles were clean by
// accident, so the corpus needed a rule, not just a fix.
//
// Scope is deliberately narrow:
//   - Only the `## Bibliography` section is checked. The scan starts at the
//     heading and stops at the next `## ` heading, so nothing outside the
//     section is visible to the lint.
//   - Only the numbered `NN-*.md` article files are walked. The publishing
//     guide, README, and other repo-internal docs in the same directory keep
//     their relative links.
//   - Body prose is out of scope. Articles cross-link each other by relative
//     filename on purpose; those are rewritten to real LinkedIn URLs during the
//     post-publish backfill pass.
//
// This file is self-executing: run directly it checks the live corpus and exits
// non-zero on any violation. It also exports `lintArticleCitations(root)` so the
// companion test can drive it against fixtures — which is what lets that test
// exercise a repo module and clear the #866 reach gate.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

export const ARTICLES_DIR = 'docs/articles';

// Numbered series articles only — `00-…` through `08-…`.
const ARTICLE_FILE_RE = /^\d{2}-.*\.md$/;

const BIBLIOGRAPHY_HEADING_RE = /^##\s+(Bibliography|Sources)\s*$/i;
const SECTION_END_RE = /^##\s/;

// A citation line is a list item. Everything after the last `. ` separating the
// title from the target is the target itself; simpler and more robust is to look
// for anything that smells like a path or URL and require the URL form.
const RELATIVE_TARGET_RE = /(?:^|\s)(\.{1,2}\/[A-Za-z0-9._/-]+)/;
const BARE_REPO_PATH_RE = /(?:^|\s)((?:docs|scripts)\/[A-Za-z0-9._/-]+\.\w+)/;

// Return the lines of the `## Bibliography` section, each as `{ lineNo, text }`.
// Empty when the doc has no such section.
export function extractBibliographyLines(doc) {
  const lines = doc.split('\n');
  const out = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (BIBLIOGRAPHY_HEADING_RE.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && SECTION_END_RE.test(line)) break;
    if (inSection) out.push({ lineNo: i + 1, text: line });
  }
  return out;
}

// Check one document's bibliography. Returns human-readable violation strings.
export function lintBibliography(rel, doc) {
  const offenders = [];
  for (const { lineNo, text } of extractBibliographyLines(doc)) {
    const relativeHit = RELATIVE_TARGET_RE.exec(text);
    if (relativeHit) {
      offenders.push(
        `${rel}:${lineNo}: relative citation target \`${relativeHit[1]}\` — ` +
          `cite repo docs as https://github.com/kburson/ai-task-manager/blob/trunk/<path>`
      );
      continue;
    }
    const barePathHit = BARE_REPO_PATH_RE.exec(text);
    if (barePathHit) {
      offenders.push(
        `${rel}:${lineNo}: bare repo path \`${barePathHit[1]}\` — ` +
          `cite repo docs as https://github.com/kburson/ai-task-manager/blob/trunk/<path>`
      );
    }
  }
  return offenders;
}

// Walk every numbered article under `<root>/docs/articles` and lint its
// bibliography. Returns a flat list of violation strings (empty when clean).
export function lintArticleCitations(root = REPO_ROOT) {
  const dir = path.join(root, ARTICLES_DIR);
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (err) {
    return [`${ARTICLES_DIR}: cannot read (${err.code || err.message})`];
  }
  const offenders = [];
  for (const name of entries.filter((n) => ARTICLE_FILE_RE.test(n)).sort()) {
    const rel = path.posix.join(ARTICLES_DIR, name);
    let doc;
    try {
      doc = readFileSync(path.join(dir, name), 'utf8');
    } catch (err) {
      offenders.push(`${rel}: cannot read (${err.code || err.message})`);
      continue;
    }
    offenders.push(...lintBibliography(rel, doc));
  }
  return offenders;
}

// Count the numbered articles scanned, for the clean-run summary line.
export function countArticles(root = REPO_ROOT) {
  try {
    return readdirSync(path.join(root, ARTICLES_DIR)).filter((n) => ARTICLE_FILE_RE.test(n)).length;
  } catch {
    return 0;
  }
}

// Self-execute only when invoked directly, so importing the module for a test
// does not run the process-exiting path.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const offenders = lintArticleCitations();
  if (offenders.length) {
    process.stderr.write(`lint:article-citations — ${offenders.length} violation(s):\n`);
    for (const o of offenders) process.stderr.write(`  ${o}\n`);
    process.stderr.write(
      `\nFix: rewrite the citation as an absolute URL. A published article is not ` +
        `a repo checkout, so a relative path renders as dead literal text.\n`
    );
    process.exit(1);
  }
  console.log(`lint:article-citations — ${countArticles()} article bibliograph(ies) clean`);
}
