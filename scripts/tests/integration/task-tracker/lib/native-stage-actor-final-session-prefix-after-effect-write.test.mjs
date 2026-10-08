// @story #1855
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('actor-final-session-prefix', import.meta.url, {
  when: 'failAfter',
  suffix: 'effect-write',
});
