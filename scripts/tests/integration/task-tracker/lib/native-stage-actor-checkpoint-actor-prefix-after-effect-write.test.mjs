// @story #1855
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('actor-checkpoint-actor-prefix', import.meta.url, {
  when: 'failAfter',
  suffix: 'effect-write',
});
