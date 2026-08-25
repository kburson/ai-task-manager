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

/**
 * `cwd` matters: image references embedded by `extractBookDiagrams` (Task 14)
 * are bare filenames like `![](03-slug-diagram-1.png)`, written alongside the
 * manuscript in `outDir`. Both pandoc and the xelatex engine `latexmk` drives
 * resolve relative image paths against the spawned process's working
 * directory, not against the manuscript file's directory — so without `cwd`
 * set to `outDir`, every diagram fails to resolve during pdf/epub/html
 * rendering. `manuscriptPath`/`texPath`/`outDir` are already absolute at every
 * call site in this file, so pointing `cwd` at `outDir` doesn't change how
 * those absolute paths resolve.
 */
export function runCommand(command, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))
    );
  });
}

/**
 * Pure: the ordered list of subprocess invocations `renderTarget` runs for a
 * given target, each with the `cwd: outDir` option described above. Kept
 * separate from `renderTarget` so the `cwd` wiring can be checked by a test
 * without spawning anything.
 *
 * @returns {Array<{command: string, args: string[], options: {cwd: string}}>}
 */
export function renderInvocations({ manuscriptPath, bookDir, outDir, target }) {
  const invocations = [
    {
      command: 'pandoc',
      args: pandocArgs({ manuscriptPath, bookDir, target, outDir }),
      options: { cwd: outDir },
    },
  ];
  if (target === 'pdf') {
    const texPath = path.join(outDir, 'book.tex');
    invocations.push({
      command: 'latexmk',
      args: latexmkArgs({ texPath, outDir }),
      options: { cwd: outDir },
    });
  }
  return invocations;
}

export async function renderTarget({ manuscriptPath, bookDir, outDir, target }) {
  for (const { command, args, options } of renderInvocations({
    manuscriptPath,
    bookDir,
    outDir,
    target,
  })) {
    await runCommand(command, args, options);
  }
}
