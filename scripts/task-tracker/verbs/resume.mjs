import { verbSwitch } from './switch.mjs';
import { verbStart } from './start.mjs';

export async function verbResume(ctx) {
  const target = ctx.rest[0];
  if (target && /^#\d+$/.test(target)) {
    await verbSwitch(ctx, target);
  } else {
    await verbStart(ctx);
  }
}
