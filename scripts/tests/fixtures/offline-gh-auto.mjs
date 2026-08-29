// @story #1410
// Explicit per-test-process declaration for files whose unrelated default
// GitHub reads are expected to fail best-effort.
import { installStubGh } from './stub-gh.mjs';

const stubGh = installStubGh();
process.once('exit', () => stubGh.restore());

export { stubGh };
