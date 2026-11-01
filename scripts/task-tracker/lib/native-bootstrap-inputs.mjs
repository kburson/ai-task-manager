// @story #2088
// @story #2106
// Reviewed immutable setup inputs. Changes require explicit source review and pin refresh.
export const BOOTSTRAP_INPUT_DIGESTS = Object.freeze({
  'scripts/dev-env/setup-local-worktree.sh':
    'c296332aec5e67ad503b7986554ab58cbe441cd2b7cdcea059fff0f048eef85e',
  'package.json': 'c9ef4764441db3272c63ae3e61eb59d468b328090b39d44d72b2381056873ccc',
  'package-lock.json': 'b3c084e680661c3f583427186ccb0c498c6ed661d48423d4255ce708b57ccd03',
  'bin/lib/stamp-skill-version.mjs':
    '60e53c936ffb1227592250c36cf8fe9783fb517c41c99e1525acaa55c8e0ee20',
  'scripts/dev-env/verify-local-worktree.mjs':
    '038993e1954d4f505390f97247c1befbd1898b42d67f6932048d2273ec3863eb',
  'scripts/lib/self-doc.mjs': 'ca83572691fe08b9b5609b7875b5d12f004f65174c0d0e3c8a1d9e9b7cd7dbae',
  'scripts/providers/index.mjs': '279d6d51731ecd69c92566eff82e0444e2baa9bba717b4dfea68eefffa4d8a3a',
  'scripts/providers/claude.mjs':
    '36cbbca7879154fc068c09a687327d28f41d52e7be0dc160b8d44014a604f521',
  'scripts/providers/codex.mjs': '4776a182e4967f7a94d789a704c0128382bc4a8afb18017dcac95fff8237e0de',
  'scripts/providers/grok.mjs': '75fdddddce9c26b91c1a26c5d6f3f53e69a9f87816f13d0733f1c39015dc60d5',
  'scripts/task-tracker/ensure-self-link.mjs':
    '3bae56da1d5e1c014d236e4cf59d3048de19ee08043f38207371966982eddf95',
  'scripts/task-tracker/lib/ensure-self-link.mjs':
    'd18880588fbd3798c4ae48a927c0f0ae965b1441f2e763c05576bb893fd2840d',
  'scripts/task-tracker/paths.mjs':
    'eb2abab2fcd5e336802ed29166d8ec6e22ee15fd71bbfeb4a7695ee146ab0ffc',
  'scripts/task-tracker/lib/runtime-storage.mjs':
    '2aeb2f0b551203ff0bacac81773f0993181dd2b0f92c93fc09e0b13a1c05aa7a',
});
