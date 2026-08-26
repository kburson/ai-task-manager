// @chore
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from '../../../../../articles/compose-book.mjs';
import {
  latexmkArgs,
  pandocArgs,
  TOC_DEPTH,
  renderInvocations,
  TARGETS,
} from '../../../../../articles/lib/book/render.mjs';

test('pandocArgs maps top-level headings to chapters and loads the metadata file', () => {
  const args = pandocArgs({
    manuscriptPath: '/tmp/book/manuscript.md',
    bookDir: '/repo/docs/articles/assets/book',
    target: 'pdf',
    outDir: '/tmp/book',
  });
  assert.ok(args.includes('--top-level-division=chapter'));
  assert.ok(args.includes('--metadata-file=/repo/docs/articles/assets/book/book.json'));
  assert.ok(args.includes('--toc'));
  assert.ok(args.includes('--standalone'));
  assert.ok(
    args.includes('--include-in-header=/repo/docs/articles/assets/book/chapter-openers.tex')
  );
  assert.deepEqual(args.slice(-2), ['-o', '/tmp/book/book.tex']);
});

test('pandocArgs emits epub and html directly', () => {
  const base = { manuscriptPath: '/m.md', bookDir: '/b', outDir: '/o' };
  const epub = pandocArgs({ ...base, target: 'epub' });
  const html = pandocArgs({ ...base, target: 'html' });
  assert.ok(epub.includes('--css=book.css'));
  assert.ok(html.includes('--css=book.css'));
  assert.deepEqual(epub.slice(-2), ['-o', '/o/book.epub']);
  assert.deepEqual(html.slice(-2), ['-o', '/o/book.html']);
});

test('latexmkArgs drives xelatex with an output directory', () => {
  const args = latexmkArgs({ texPath: '/o/book.tex', outDir: '/o' });
  assert.ok(args.includes('-xelatex'));
  assert.ok(args.includes('-interaction=nonstopmode'));
  assert.ok(args.includes('-outdir=/o'));
  assert.equal(args.at(-1), '/o/book.tex');
});

test('parseArgs defaults to every target', () => {
  const options = parseArgs([]);
  assert.deepEqual(options.targets, TARGETS);
  assert.equal(options.doctor, false);
});

test('parseArgs accepts a single target and a doctor flag', () => {
  assert.deepEqual(parseArgs(['--target', 'epub']).targets, ['epub']);
  assert.equal(parseArgs(['--doctor']).doctor, true);
  assert.equal(parseArgs(['--out', '/x']).out, '/x');
});

test('parseArgs rejects unknown targets and unknown flags', () => {
  assert.throws(() => parseArgs(['--target', 'mobi']), /unknown target/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('renderInvocations runs pandoc with cwd set to outDir, so bare-filename image references (e.g. from extractBookDiagrams) resolve', () => {
  const invocations = renderInvocations({
    manuscriptPath: '/tmp/book/manuscript.md',
    bookDir: '/repo/docs/articles/assets/book',
    outDir: '/tmp/book',
    target: 'epub',
  });
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].command, 'pandoc');
  assert.deepEqual(invocations[0].options, { cwd: '/tmp/book' });
});

test('the reviewable manuscript target never invokes pandoc', () => {
  assert.deepEqual(
    renderInvocations({
      manuscriptPath: '/tmp/book/manuscript.md',
      bookDir: '/repo/docs/articles/assets/book',
      outDir: '/tmp/book',
      target: 'manuscript',
    }),
    []
  );
});

test('renderInvocations also runs latexmk with cwd set to outDir for the pdf target, so LaTeX image includes resolve', () => {
  const invocations = renderInvocations({
    manuscriptPath: '/tmp/book/manuscript.md',
    bookDir: '/repo/docs/articles/assets/book',
    outDir: '/tmp/book',
    target: 'pdf',
  });
  assert.equal(invocations.length, 2);
  assert.deepEqual(
    invocations.map((i) => i.command),
    ['pandoc', 'latexmk']
  );
  assert.deepEqual(invocations[0].options, { cwd: '/tmp/book' });
  assert.deepEqual(invocations[1].options, { cwd: '/tmp/book' });
});

test('toc depth is per target: chapters plus sections in the pdf, unchanged elsewhere', () => {
  const base = { manuscriptPath: '/o/m.md', bookDir: '/b', outDir: '/o' };
  const depthOf = (target) =>
    pandocArgs({ ...base, target }).find((arg) => arg.startsWith('--toc-depth='));

  assert.equal(
    depthOf('pdf'),
    '--toc-depth=1',
    'under the book class 1 is section, 2 is subsection'
  );
  assert.equal(depthOf('epub'), '--toc-depth=2');
  assert.equal(depthOf('html'), '--toc-depth=2');
  assert.equal(TOC_DEPTH.pdf, 1);
});
