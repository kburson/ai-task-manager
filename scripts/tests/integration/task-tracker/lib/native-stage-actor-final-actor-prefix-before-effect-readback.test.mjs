// @story #1855
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('actor-final-actor-prefix', import.meta.url, {
  when: 'failBefore',
  suffix: 'effect-readback',
});
