// @story #1954
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { mkdtempProjectIsolated } from '../../task-tracker/lib/scratch-dir.mjs';

const archivedDirectory = 'scripts/tests/fixtures/1857/1866-current';

export function withArchivedGuidanceSource(projectRoot, run) {
  const archive = path.join(projectRoot, archivedDirectory);
  const manifest = JSON.parse(readFileSync(path.join(archive, 'final-capture-manifest.json')));
  const fixture = mkdtempProjectIsolated('guidance-archived-source-');
  try {
    execFileSync('git', ['fetch', '--no-tags', projectRoot, manifest.sourceCommit], {
      cwd: fixture,
    });
    execFileSync('git', ['checkout', '-q', '--detach', 'FETCH_HEAD'], { cwd: fixture });
    // Publication follows its recorded source commit. Replay the exact archived
    // data against those source bytes, never against an earlier artifact.
    cpSync(archive, path.join(fixture, archivedDirectory), { recursive: true });
    return run(fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

export function archivedGuidanceContextReport(fixture) {
  const script = `
    import { readFileSync } from 'node:fs';
    import { buildGuidanceContextReport } from './scripts/task-tracker/measure-guidance-context.mjs';
    const captureBytes = readFileSync('scripts/tests/fixtures/1857/1866-current/actual-explain-traffic-final.json');
    process.stdout.write(JSON.stringify(await buildGuidanceContextReport({ captureBytes })));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: fixture,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: fixture },
    })
  );
}
