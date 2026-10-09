// @story #1913
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('tail-cache', import.meta.url, {
  when: 'failAfter',
  suffix: 'effect-write',
});
