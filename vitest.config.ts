import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // fake-indexeddb attaches to a process-global `indexedDB`, not scoped
    // per test file -- any two files that both touch the same Dexie table
    // (financeDB.ts's `db` is a module singleton) can race each other's
    // transactions when vitest runs files in parallel, producing a real but
    // nondeterministic ConstraintError (found via applyMergedBackupService.
    // resurrection.test.ts vs. SettlementSummary.vatParity.test.ts, both
    // touching db.appSettings, aglamazo#347/#350). Files still run
    // sequentially within a single worker either way; this just stops two
    // files running at once across workers.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
