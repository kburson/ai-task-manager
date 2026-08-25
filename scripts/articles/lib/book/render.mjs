// Rendering. Pandoc for every target; latexmk on top of it for PDF, because a
// table of contents and a makeindex index both need multiple passes and pandoc
// runs the engine exactly once.

import { spawn } from 'node:child_process';
import path from 'node:path';

export const TARGETS = ['manuscript', 'pdf', 'epub', 'html'];

const OUTPUT_NAME = { pdf: 'book.tex', epub: 'book.epub', html: 'book.html' };

export function pandocArgs({ manuscriptPath, bookDir, target, outDir }) {
  return [
    manuscriptPath,
    `--metadata-file=${path.join(bookDir, 'book.json')}`,
    '--top-level-division=chapter',
    '--toc',
    '--toc-depth=2',
    '--standalone',
    '-o',
    path.join(outDir, OUTPUT_NAME[target]),
  ];
}

export function latexmkArgs({ texPath, outDir }) {
  return ['-xelatex', '-interaction=nonstopmode', '-halt-on-error', `-outdir=${outDir}`, texPath];
}

export function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))
    );
  });
}

export async function renderTarget({ manuscriptPath, bookDir, outDir, target }) {
  await runCommand('pandoc', pandocArgs({ manuscriptPath, bookDir, target, outDir }));
  if (target !== 'pdf') return;
  const texPath = path.join(outDir, 'book.tex');
  await runCommand('latexmk', latexmkArgs({ texPath, outDir }));
}
