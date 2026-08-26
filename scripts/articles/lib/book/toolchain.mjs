// Toolchain doctor.
//
// LaTeX is a system prerequisite: no usable engine exists on npm. Rather than
// hard-coding a package list that drifts as pandoc's template evolves, the
// doctor compiles a one-line probe per package and reports exactly which ones
// this machine is missing, as a command the author can paste.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

// Pandoc renders every target. LaTeX renders exactly one of them, so a machine
// that only wants EPUB or HTML should not be told to install BasicTeX.
export const PANDOC_BINARIES = ['pandoc'];
export const LATEX_BINARIES = ['xelatex', 'latexmk', 'makeindex'];
export const REQUIRED_BINARIES = [...PANDOC_BINARIES, ...LATEX_BINARIES];

/** @param {string[]} targets */
export function requiredBinariesFor(targets) {
  return targets.includes('pdf') ? REQUIRED_BINARIES : [...PANDOC_BINARIES];
}

export const PROBE_PACKAGES = [
  'fontspec',
  'unicode-math',
  'xcolor',
  'geometry',
  'hyperref',
  'booktabs',
  'etoolbox',
  'footnotehyper',
  'upquote',
  'fancyvrb',
  'parskip',
  'xurl',
  'bookmark',
  'makeidx',
  'adjustbox',
];

export function probeDocument(pkg) {
  return `\\documentclass{book}\n\\usepackage{${pkg}}\n\\begin{document}probe\\end{document}\n`;
}

export function tlmgrHint(missingPackages) {
  if (missingPackages.length === 0) return null;
  return `sudo tlmgr install ${missingPackages.join(' ')}`;
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', ...options });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

/** Default probe: compile a throwaway document that loads exactly one package. */
export async function compileProbe(pkg) {
  const dir = await mkdtemp(path.join(projectScratchDir('book'), 'texprobe-'));
  try {
    const file = path.join(dir, 'probe.tex');
    await writeFile(file, probeDocument(pkg));
    return await run('xelatex', ['-interaction=nonstopmode', '-halt-on-error', 'probe.tex'], {
      cwd: dir,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * @param {{targets?: string[], runBinary?: (name: string) => Promise<boolean>, runProbe?: (pkg: string) => Promise<boolean>}} [injected]
 * @returns {Promise<{ok: boolean, latexChecked: boolean, missingBinaries: string[], missingPackages: string[], hint: string|null}>}
 */
export async function doctor({
  targets = ['pdf'],
  runBinary = (name) => run('command', ['-v', name], { shell: true }),
  runProbe = compileProbe,
} = {}) {
  const wantsPdf = targets.includes('pdf');
  const missingBinaries = [];
  for (const name of requiredBinariesFor(targets)) {
    if (!(await runBinary(name))) missingBinaries.push(name);
  }
  if (missingBinaries.length > 0) {
    return {
      ok: false,
      latexChecked: wantsPdf,
      missingBinaries,
      missingPackages: [],
      hint: null,
    };
  }

  if (!wantsPdf) {
    return { ok: true, latexChecked: false, missingBinaries, missingPackages: [], hint: null };
  }

  const missingPackages = [];
  for (const pkg of PROBE_PACKAGES) {
    if (!(await runProbe(pkg))) missingPackages.push(pkg);
  }
  return {
    ok: missingPackages.length === 0,
    latexChecked: true,
    missingBinaries,
    missingPackages,
    hint: tlmgrHint(missingPackages),
  };
}
