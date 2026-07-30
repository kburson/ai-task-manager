import { openProjectDatabase } from '../../src/sqlite/open.mjs';
import { SqliteWorkLeaseStore } from '../../src/sqlite/work-lease-store.mjs';

process.once('message', ({ databasePath, request }) => {
  const store = new SqliteWorkLeaseStore({
    db: openProjectDatabase({ databasePath }),
  });
  try {
    const lease = store.acquire(request);
    process.send?.({ ok: true, lease });
  } catch (error) {
    process.send?.({
      ok: false,
      error:
        typeof error?.toJSON === 'function'
          ? error.toJSON().error
          : { code: 'authority-unavailable', message: 'SQLite lease authority failed' },
    });
  } finally {
    store.close();
  }
});
