#!/usr/bin/env node
// Test-only CLI harness for verb integration fixtures that replace remote I/O.
// Production entrypoints always acquire a real work lease; this harness makes
// the test authority explicit while preserving the real verb implementations.
import { buildContext } from '../../runtime.mjs';
import { withTestGovernedEffect } from './governed-effect.mjs';

const ctx = buildContext();
ctx.withGovernedEffect = withTestGovernedEffect;
ctx.workLeaseGuard = {
  ...ctx.workLeaseGuard,
  withGovernedEffect: withTestGovernedEffect,
};

try {
  switch (ctx.verb) {
    case 'check': {
      const { verbCheck } = await import('../../verbs/check.mjs');
      await verbCheck(ctx);
      break;
    }
    case 'review': {
      const { verbReview } = await import('../../verbs/review.mjs');
      await verbReview(ctx);
      break;
    }
    case 'reject': {
      const { verbReject } = await import('../../verbs/reject.mjs');
      await verbReject(ctx);
      break;
    }
    case 'close':
    case 'end': {
      const { verbClose } = await import('../../verbs/close.mjs');
      await verbClose(ctx);
      break;
    }
    default:
      process.stderr.write(`task-tracker-cli.mjs: unsupported verb ${ctx.verb}\n`);
      process.exitCode = 2;
  }
} catch (err) {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exitCode = 1;
}
