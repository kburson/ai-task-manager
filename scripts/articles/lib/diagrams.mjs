// Mermaid handling: pull fences out of the article body, and drive the Mermaid
// CLI to turn Mermaid source into images.
//
// Fences are rendered from the ARTICLE BODY, not from the matching `.mmd` file
// under assets/diagrams/. Those two have drifted for three of the fourteen
// in-body diagrams, and the body is what a reader actually sees, so the body is
// authoritative for published output. The `.mmd` library renders separately.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const MMDC = path.join(REPO_ROOT, 'node_modules', '.bin', 'mmdc');

/** Marker a Mermaid fence leaves behind in the body line stream. */
export const DIAGRAM_TOKEN_RE = /^@@DIAGRAM:(.+)@@$/;

export function diagramToken(imageName) {
  return `@@DIAGRAM:${imageName}@@`;
}

/**
 * Replace every ```mermaid fence in the section line streams with a token line,
 * returning the extracted diagrams in document order.
 *
 * Any fence in another language throws: this corpus has none, and silently
 * emitting one as literal text is exactly the failure the publisher exists to
 * prevent.
 *
 * @param {Array<{heading: string|null, lines: string[]}>} sections
 * @param {string} slug article slug, used to build image filenames
 */
export function extractMermaidFences(sections, slug) {
  const diagrams = [];

  const out = sections.map((section) => {
    const lines = [];
    let i = 0;
    while (i < section.lines.length) {
      const open = section.lines[i].match(/^```(\w*)\s*$/);
      if (!open) {
        lines.push(section.lines[i]);
        i += 1;
        continue;
      }
      const language = open[1];
      const code = [];
      i += 1;
      while (i < section.lines.length && !/^```\s*$/.test(section.lines[i])) {
        code.push(section.lines[i]);
        i += 1;
      }
      if (i >= section.lines.length) throw new Error('unterminated code fence in article body');
      i += 1;
      if (language !== 'mermaid') {
        throw new Error(
          `unsupported code fence language \`${language}\` — publisher handles mermaid only`
        );
      }
      const imageName = `${slug}-diagram-${diagrams.length + 1}.png`;
      diagrams.push({ imageName, code: code.join('\n') });
      lines.push(diagramToken(imageName));
    }
    return { heading: section.heading, lines };
  });

  return { sections: out, diagrams };
}

function runMmdc(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(MMDC, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mmdc exited ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Render one Mermaid source string to an image file.
 *
 * `-b transparent` matches LinkedIn's white article background without a
 * colored box; `-s 3` keeps the render sharp at LinkedIn's article width. Both
 * come from the publishing guide.
 */
export async function renderMermaidSource(code, outPath) {
  // `.tmp/publish/`, not the system temp dir — scratch stays inside the repo.
  const dir = await mkdtemp(path.join(projectScratchDir('publish', REPO_ROOT), 'mermaid-'));
  const input = path.join(dir, 'diagram.mmd');
  try {
    await writeFile(input, `${code}\n`, 'utf8');
    await runMmdc(['-i', input, '-o', outPath, '-b', 'transparent', '-s', '3']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Run `tasks` with bounded concurrency; each task is a zero-arg async fn. */
export async function runPool(tasks, limit = 4) {
  const results = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}
