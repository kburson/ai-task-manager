// User Story section guard (#432).
//
// Two guards over the same validation function:
//
//   userStoryWarnGuard  — refine entry (backlog → refine):
//     non-blocking; prints a warning to stderr but returns { ok: true } so the
//     transition is never refused. Existing issues without the section can still
//     advance to Refine; the warning nudges the author to fill it in.
//
//   userStoryBlockGuard — refine exit (refine → ready-for-plan):
//     blocking; returns { ok: false, reason } when the section is missing,
//     has fewer than 3 non-empty lines, or any line still contains placeholder
//     text. Authors must fill in a real user story before entering R4P.
//
// Validation: `## User Story` heading present, followed by at least 3 non-empty
// non-comment lines before the next `##` heading, none equal to a placeholder
// string (trimmed comparison).

export const GUARD_ID_WARN = 'user-story-warn';
export const GUARD_ID_BLOCK = 'user-story-block';

// #662 — exported so `lib/user-story-author.mjs` rejects the same placeholder
// strings the block guard rejects (single source of truth for the contract).
export const PLACEHOLDERS = new Set([
  'As a [who wants to accomplish something]',
  'I want to [what they want to accomplish]',
  'So that [why they want to accomplish that thing]',
]);

const WARN_REASON =
  'User Story section missing or incomplete — add `## User Story` with three non-placeholder lines before promoting to Refine';

const BLOCK_REASON =
  'User Story section missing or incomplete — `## User Story` must contain three non-placeholder lines before promoting to Ready for Planning (Connextra format: "As a…\\nI want to…\\nSo that…")';

// #503 — `## User Story` must be the FIRST `## ` heading in the body. Bodies
// authored outside the `--shape` templates (legacy tail-only / hand-written
// specs) often lead with `## Scope`, pushing User Story down. Presence alone is
// not enough; position is part of the contract.
const POSITION_REASON =
  'User Story section out of order — `## User Story` must be the first `## ` heading in the issue body';

// Returns the text of the first `## ` heading in the body, or null if there is
// none. HTML-comment lines and the leading `aitm-last-known-state` marker are
// not `## ` headings, so a plain line-anchored scan is sufficient.
// #662 — exported so the author lib can position `## User Story` as the first
// `## ` heading using the same detection the guard validates against.
export function firstH2Heading(body) {
  const m = body.match(/^## (.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

export function validateUserStory(body) {
  if (typeof body !== 'string') return { ok: false, reason: BLOCK_REASON };
  const headingIdx = body.search(/^## User Story\s*$/m);
  if (headingIdx === -1) return { ok: false, reason: BLOCK_REASON };

  if (firstH2Heading(body) !== 'User Story') {
    return { ok: false, reason: POSITION_REASON };
  }

  const afterHeading = body.slice(headingIdx + '## User Story'.length);
  const nextSection = afterHeading.search(/^##\s/m);
  const section = nextSection === -1 ? afterHeading : afterHeading.slice(0, nextSection);

  const lines = section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('<!--'));

  if (lines.length < 3) return { ok: false, reason: BLOCK_REASON };
  for (const line of lines) {
    if (PLACEHOLDERS.has(line)) return { ok: false, reason: BLOCK_REASON };
  }
  return { ok: true };
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
