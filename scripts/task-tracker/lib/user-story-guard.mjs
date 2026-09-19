// Compatibility User Story guards (#432). Refine no longer registers these:
// unfinished intake is allowed, while direct validators retain substantive
// approval-mode quality checks from the shared evaluator.

import { CANONICAL_USER_STORY_LINES, CANONICAL_USER_STORY_TEMPLATE } from './user-story-author.mjs';
import { evaluateStoryBody } from './user-story-quality.mjs';
export { firstH2Heading } from './user-story-quality.mjs';

export const GUARD_ID_WARN = 'user-story-warn';
export const GUARD_ID_BLOCK = 'user-story-block';

// Retained compatibility export; template ownership stays in the author module.
export const PLACEHOLDERS = new Set(CANONICAL_USER_STORY_LINES);

const WARN_REASON = 'User Story needs substantive prose before Plan approval';

export function validateUserStory(body) {
  const result = evaluateStoryBody(body, {
    mode: 'approval',
    canonicalTemplate: CANONICAL_USER_STORY_TEMPLATE,
  });
  return result.ok
    ? { ok: true }
    : {
        ok: false,
        reason: result.violations.map(({ code, message }) => `${code}: ${message}`).join('; '),
      };
}

export const userStoryWarnGuard = {
  id: GUARD_ID_WARN,
  run(ctx) {
    if (!ctx) return { ok: true };
    if (ctx.toState && ctx.toState !== 'refine') return { ok: true };
    const body = typeof ctx.body === 'string' ? ctx.body : '';
    const result = validateUserStory(body);
    if (!result.ok) {
      process.stderr.write(`  ⚠ user-story: ${result.reason || WARN_REASON}\n`);
    }
    return { ok: true };
  },
};

export const userStoryBlockGuard = {
  id: GUARD_ID_BLOCK,
  run(ctx) {
    if (!ctx) return { ok: true };
    if (ctx.toState && ctx.toState !== 'ready-for-plan') return { ok: true };
    const body = typeof ctx.body === 'string' ? ctx.body : '';
    return validateUserStory(body);
  },
};
