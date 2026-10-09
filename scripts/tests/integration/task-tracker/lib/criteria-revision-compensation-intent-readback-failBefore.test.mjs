// @story #1916
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('compensation', import.meta.url, {
  when: 'failBefore',
  suffix: 'intent-readback',
});
