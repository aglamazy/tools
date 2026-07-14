# Import wizard: date-range fixes

Status as of 2026-07-10, end of session. Parts 1-3 are DONE (built + typecheck/lint
clean + verified live on localhost:3100 against real data). Part 4 (real gap
detection) is in-progress, working design, NOT yet verified end-to-end in the
wizard UI — see "Open work" below. Nothing committed yet.

## Part 1-3: DONE

### Root cause (was)
`ImportedFile.processingMonth` was a single `MM/YYYY` string derived from just the
**first parsed transaction row** of a file, so a multi-month file collapsed to one
month everywhere downstream, and a misleading "already exists, replace?" popup
gated re-imports without actually replacing anything.

### What shipped
1. **`app/stores/transactionStore.ts` `getImportedFiles()`** — groups by
   `(fileId, month)` instead of `fileId` alone, so one wide file now emits one
   entry PER month it actually spans. Verified live: the Apr1-Jul10 test file
   now shows as 4 separate month rows (24+35+30+20=109 txns) instead of
   collapsing to one "July" row.
2. **`app/(dashboard)/app/import/page.tsx`** — removed the collision dialog in
   `handleFileSelect` (was lines ~256-310). Traced it: clicking כן (yes) ran the
   exact same additive `doImport()` that would run anyway (nothing was ever
   replaced/deleted); clicking לא (no) was the only button with an effect — it
   silently dropped the new file's transactions. Now every import just goes
   through directly.
3. Confirmed **transaction-level dedup is safe** regardless of the above:
   `saveBankTransactions`/`saveCreditCardData` key by `date|description|amount`
   (+`currentStep|totalSteps` for credit), scoped per account/card against full
   history, and never touch an existing row on a dedup hit (so manual edits like
   categorization survive a wider re-import).

No Dexie schema change in any of this — `ImportedFile` here is synthesized from
`transactions`, not a stored table read.

## Part 4: real gap detection — design landed, needs finishing

### What was tried and rejected (for the record — don't redo these)
- **Adjacent-row balance chain** (`balance[i] == balance[i-1] + amount[i]`):
  wrong model. Bank statements only print a balance on SOME rows (e.g. once per
  same-day batch), not every line — see the real statement screenshot Agla
  shared. Comparing adjacent rows 1:1 produced ~40-70 false "mismatches" against
  real data.
- **Anchor-based reconciliation** (accumulate sum of amounts between
  balance-bearing rows, check anchor-to-anchor): more correct in principle, but
  still noisy on Agla's real data (28 flagged items) because of a separate,
  real issue: **the parser's `normalizeAmount()` silently returns `0` for any
  balance cell it can't parse instead of leaving it `undefined`**
  (`app/utils/parsers/shared.ts` — `toNumber`/`normalizeAmount` NaN fallback to
  `0`), so ~42% of one real account's rows had a fake zero balance. On top of
  that, repeated overlapping re-imports (same calendar days imported 2-3 times
  across different export sessions/formats over months) produced multiple
  slightly-different balance readings for the same day, with no reliable
  intra-day ordering signal (`transaction.id` = insertion order, not statement
  order) — same-day anchor-vs-anchor comparisons are fundamentally unreliable
  given the current data model.

### Current design (Agla's redirect, 2026-07-10): use the files index, not the transaction lines
Transaction-level reconciliation is too noisy given real import history. Instead:
treat each imported file as a coverage **interval**, union the intervals per
account/card, and flag holes in that union. This sidesteps balance data, dedup
residue, and same-day ordering entirely.

Implemented in `app/utils/importGapAnalyzer.ts`:
- `computeFileSpans(rows)` — per `fileId`, the actual min/max transaction date.
- **Declared-range widening**: some filenames encode the requested statement
  range, e.g. `report__2026-04-01__2026-05-08.xlsx`. Confirmed on real data:
  EVERY `report__` file's last actual transaction trails its declared end by
  several days (up to 9), and one file's first transaction trails its declared
  *start* by 11 days — i.e. "no transactions near the boundary" is normal, not
  a sign of missing data, when the file's own declared range covers it. So
  `computeFileSpans` widens (never narrows) each file's span using the
  `(\d{4}-\d{2}-\d{2})__(\d{4}-\d{2}-\d{2})` pattern extracted from `fileId`
  when present.
- `findTimelineGaps(spans)` — sorts spans, merges overlaps, flags any hole
  between merged spans wider than `GAP_DAY_THRESHOLD` (currently 2 days).
- `findBankGaps`/`findCreditGaps` — thin wrappers filtering by account/card.
- Wired into `app/components/ImportWizard.tsx` — `scanGaps()` runs on wizard
  open independent of the folder scan, renders a banner listing flagged
  ranges per account/card.

Verified against the real account (316-211362, 389 bank transactions, 14
distinct source files): **4 clean gap candidates**, all at plausible
month-boundary seams (e.g. 2025-09-19 → 2025-10-03, 14 days) — down from 28
with the anchor approach and considerably more trustworthy since the signal no
longer depends on balance-cell parsing or same-day ordering at all.

### Known limitation (accepted, not fixed)
Files whose name does NOT encode a `START__END` range (e.g. `FibiSave12345.xls`,
`211362-June.pdf`) fall back to actual transaction min/max only — same
imprecision as before for those files. Options for later: infer a full-calendar-
month span for files that only imply a single month (weaker but still better
than raw min/max), or extract the statement's own printed "מתאריך/עד תאריך"
header from file content (stronger, needs parser work, bigger change).

### Open work (not done)
- Final live verification of the wizard banner render was interrupted by the
  dev server (port 3100) becoming unresponsive mid-session — separate issue,
  not yet diagnosed (unrelated Turbopack cache corruption was observed on the
  OTHER worktree's dev server, port 3102, in `/tmp/expenses-table-dev.log`; it's
  not confirmed whether that's connected to port 3100's hang or coincidental).
  **Check both dev servers' health before resuming.**
- `GAP_DAY_THRESHOLD = 2` is a first guess, not tuned with Agla.
- Decide the fallback-file heuristic above (full-month inference vs. leave as
  transaction min/max vs. parse the statement header).
- Nothing in Part 4 is committed. Parts 1-3 are also uncommitted (bundled
  together in the working tree) — decide whether to split the commit (ship
  1-3 now, land 4 separately) or ship together once 4 is finished.

## Files touched (all parts, uncommitted)

| File | Change |
|---|---|
| `app/stores/transactionStore.ts` | `getImportedFiles()` — per-(fileId,month) grouping |
| `app/(dashboard)/app/import/page.tsx` | Removed collision dialog |
| `app/utils/importGapAnalyzer.ts` | NEW — file-coverage-union gap detection |
| `app/components/ImportWizard.tsx` | Wired in `scanGaps()` + gap banner |
