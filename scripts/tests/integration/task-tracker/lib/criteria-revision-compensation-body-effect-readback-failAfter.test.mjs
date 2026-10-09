// @story #1916
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('compensation', import.meta.url, {
  when: 'failAfter',
  suffix: 'body-effect-readback',
});
