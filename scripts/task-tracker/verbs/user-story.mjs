// `user-story` verb (alias `story`) — author/repair the `## User Story` section.
//
// CLI: /task user-story [#N] --as "<role>" --want "<goal>" --so-that "<benefit>"
//
// Writes the three Connextra lines via `setUserStory` (lib/user-story-author.mjs)
// through the sanctioned `mutateIssueBody` primitive, so a refine→plan
// transition blocked by `userStoryBlockGuard` can be unblocked in-workflow
// without hand-editing the body in the GitHub web UI. Body-only: touches no
// board field and no Status (mirrors `block.mjs`).
//
// Pure core: `runUserStory({ target, story, cfg, deps })`. All I/O injectable.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadState } from '../state.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { setUserStory } from '../lib/user-story-author.mjs';

const pexec = promisify(execFile);

// Resolve the target issue: explicit positional `#N` / `N` wins, else the
// bound active issue. Returns a positive integer or null.
export function resolveTargetIssue({ rest, activeIssue }) {
  for (const tok of rest) {
    const m = String(tok).match(/^#?(\d+)$/);
    if (m) return Number(m[1]);
  }
  if (activeIssue) {
    const m = String(activeIssue).match(/^#?(\d+)$/);
    if (m) return Number(m[1]);
  }
  return null;
}

// Parse `rest` into { target, story }. Flags: --as, --want, --so-that
// (aliases --i-want / --so). Unknown tokens that look like `#N` are positional.
export function parseArgs(rest, activeIssue) {
  const story = { asA: null, iWant: null, soThat: null };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    switch (tok) {
      case '--as':
      case '--as-a':
        story.asA = rest[++i] ?? '';
        break;
      case '--want':
      case '--i-want':
        story.iWant = rest[++i] ?? '';
        break;
      case '--so-that':
      case '--so':
        story.soThat = rest[++i] ?? '';
        break;
      default:
        positional.push(tok);
    }
  }
  const target = resolveTargetIssue({ rest: positional, activeIssue });
  return { target, story };
}

async function defaultMutateIssueBody({ issueNumber, repo, mutate }) {
  return mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec } });
}

/**
 * Core runner. Composes the story lines and writes the section in one
 * `mutateIssueBody` transaction. Throws on invalid/placeholder input
 * (surfaced by `setUserStory`).
 *
 * @returns {Promise<{status:'written'|'no-op', target:number}>}
 */
export async function runUserStory({ target, story, cfg, deps = {} } = {}) {
  if (!Number.isInteger(target) || target <= 0) {
    throw new Error('user-story: no target issue (bind via /task #N or pass a positional)');
  }
  if (!cfg || !cfg.repo) {
    throw new Error('user-story: cfg.repo is required');
  }
  const mutateBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const writeRes = await mutateBody({
    issueNumber: target,
    repo: cfg.repo,
    mutate: (base) => setUserStory(base, story),
  });
  if (writeRes?.status === 'no-op') {
    return { status: 'no-op', target };
  }
  return { status: 'written', target };
}

export async function verbUserStory(ctx) {
  const { cfg, statePath, rest } = ctx;
  const s = loadState(statePath);
  const active = s.active || null;
  const { target, story } = parseArgs(rest, active);
  if (!target) {
    console.error(
      'Usage: /task user-story [#N] --as "<role>" --want "<goal>" --so-that "<benefit>"'
    );
    process.exit(2);
  }
  if (!story.asA || !story.iWant || !story.soThat) {
    console.error('user-story: --as, --want, and --so-that are all required');
    process.exit(2);
  }
  try {
    const res = await runUserStory({ target, story, cfg });
    if (res.status === 'no-op') {
      console.log(`[task-tracker] ✓ #${target} User Story already current — no change`);
    } else {
      console.log(`[task-tracker] ✓ #${target} User Story written`);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
