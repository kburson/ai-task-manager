// @story #1855
import { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';
registerNativeStageCase('intent-prefix', import.meta.url, { when: 'failBefore', suffix: 'write' });
