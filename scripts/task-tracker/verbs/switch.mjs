import { verbResume } from './resume.mjs';

// Canonical numeric bind entrypoint. Cross-issue behavior is owned by the
// governed bind orchestration used by resume/start: read-only preflight,
// durable switchLease intent, authority transition, claim, exact projections,
// heartbeat, then advisories. Keeping this adapter thin prevents the historical
// queue/timing/fleet/state mutations from bypassing fenced authority.
export async function verbSwitch(ctx, target) {
  if (!/^#[1-9]\d*$/.test(String(target ?? ''))) {
    throw new Error(`invalid issue ref: ${target}`);
  }
  return verbResume({
    ...ctx,
    verb: target,
    rest: [target],
  });
}
