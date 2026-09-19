// @story #1711
import { stripFencedCodeBlocks, parsePlanApprovedMarker } from './markers.mjs';
import { CANONICAL_USER_STORY_TEMPLATE } from './user-story-author.mjs';
import { evaluateStoryBody, storyDigest } from './user-story-quality.mjs';

export const storyApprovalBindingGuard = {
  id: 'plan-exit-story-approval-binding',
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    const body = ctx?.body ?? '';
    if (!/<!--\s*aitm-plan-approved(?=[:\s>])/.test(stripFencedCodeBlocks(body)))
      return { ok: true };
    const refuse = (code, message) => ({
      ok: false,
      code,
      reason: `${code}: ${String(message).slice(0, 240)}; repair/review the source, then npx aitm plan-approve #${ctx.issueNumber ?? ctx.issue ?? '<N>'} before promotion.`,
    });
    const approved = parsePlanApprovedMarker(body);
    if (!approved?.storyDigest || !approved.storyIntentDigest || !approved.storyIntentSource)
      return refuse(
        'story-approval-binding-missing',
        'Existing approval lacks a complete content binding'
      );
    const story = evaluateStoryBody(body, {
      mode: 'approval',
      canonicalTemplate: CANONICAL_USER_STORY_TEMPLATE,
    });
    if (!story.ok) return refuse(story.violations[0].code, story.violations[0].message);
    let intent;
    try {
      intent = await ctx.deps.resolveStoryIntent({ body, projectDir: ctx.projectDir });
    } catch (error) {
      return refuse('story-intent-source-unresolvable', error.message);
    }
    if (!intent?.ok)
      return refuse(
        intent?.violations?.[0]?.code ?? 'story-intent-source-unresolvable',
        intent?.violations?.[0]?.message ?? 'Intent observation unavailable'
      );
    if (approved.storyIntentSource !== intent.source)
      return refuse('story-approval-stale-source', 'Authoritative intent source changed');
    if (approved.storyDigest !== storyDigest(story.lines))
      return refuse('story-approval-stale-story', 'User Story changed');
    if (approved.storyIntentDigest !== intent.digest)
      return refuse('story-approval-stale-intent', 'Story Intent changed');
    return { ok: true };
  },
};
