# Finance Manager - Workflow Redesign TODO

## Core Concept
Separate the application into 4 distinct flows, each with a clear purpose. All flows read from a centralized data store that contains imported files.

---

## A. IMPORT FILES FLOW (Data Storage)

**Purpose**: Store imported bank and credit card files locally for later analysis

### Tasks
- [x] Create centralized data store structure (localStorage)
- [x] Store raw imported files with metadata
- [x] Parse and store all transactions
- [x] Simple import UI with file upload
- [x] Allow multiple imports without resetting
- [x] Store charging dates with credit card payments
- [x] Toast notifications for import success/errors
- [x] Duplicate file detection and replacement
- [x] Import history display

---

## B. CASH FLOW ANALYSIS FLOW

**Purpose**: See all money movement for a specific month (when money left/entered bank account)

### Tasks
- [x] Create CashFlowAnalysis page/component
- [x] Month selector
- [x] Display bank transactions from selected month
- [x] Display credit card charges (lump sum by card)
- [x] Intelligent charge detection (hide charges already paid)
- [x] Summary: Income, Expenses, Net
- [x] Conditional rendering (hide credit card table if no unpaid charges)
- [ ] Show future committed payments (installments) - deferred
- [ ] Opening/Closing balance - deferred

**Key Point**: Shows when money moves (charging date)

**Implementation Details**:
- Filters bank transactions by `date` field (matches selected month)
- Shows credit card charges by `chargingDate` field
- Detects paid charges by parsing card numbers from bank descriptions (e.g., "1473 - ישראכרט בע"מ")
- Only shows charges not yet appearing in bank transactions

---

## C. BUDGET ANALYSIS FLOW

**Purpose**: Track spending by category for a month (when purchases were made)

### Important Change
- [x] **Remove `isFixed` from Category** - kept in Category settings for UI but not enforced
- [x] **Add `isFixed` to individual transactions**
- [x] Reason: Same category can have fixed AND variable expenses

### Tasks
- [x] Create BudgetAnalysis page/component
- [x] Month selector
- [x] Display all purchases from selected month:
  - [x] Bank transactions (by transaction date)
  - [x] Credit card payments (by transaction date)
- [x] Transaction table columns:
  - [x] Date (transaction date)
  - [x] Business
  - [x] Subject (category dropdown from Settings)
  - [x] Amount
  - [x] Payment method (bank account number or card last 4 digits)
  - [x] **isFixed checkbox** (per transaction)
  - [x] Payment index (3/12 installment info)
  - [x] Total amount (full purchase price for installments)
- [x] Summary cards: Income, Expenses, Net
- [x] Persistent storage (category and isFixed saved to localStorage)
- [ ] Category summaries (fixed vs variable)
- [ ] Budget vs Actual comparison

**Key Point**: Shows when you spent money (transaction date)

**Implementation Details**:
- Uses `transactionStore` for all localStorage operations
- Uses `subjectStore` to load categories from Settings page
- Filters bank transactions by `transactionDate` (date field)
- Filters credit card payments by `transactionDate` field
- Stores category and isFixed per transaction (not per category)
- Bank account numbers extracted from imported file metadata

---

## D. FUTURE PAYMENTS FLOW

**Purpose**: See impact on future months (installments + recurring expenses)

### Tasks
- [ ] Create FuturePayments page/component
- [ ] Read from stored data (no new imports)
- [ ] Display next 12 months
- [ ] Show per month:
  - [ ] Installment payments (remaining)
  - [ ] Fixed recurring expenses (marked isFixed=true)
- [ ] Monthly projection table
- [ ] Cash flow forecast
- [ ] Alerts for large upcoming payments

**Key Point**: Shows commitments and helps planning

---

## E. DATA MODEL UPDATES

### Transaction
```typescript
type Transaction = {
  // ... existing fields
  monthYear: string
  source: 'bank' | 'credit-card'
  categoryId?: string
  isFixed: boolean  // NEW: Per-transaction
}
```

### Credit Card Payment
```typescript
type CreditCardPayment = {
  // ... existing fields
  chargingDate: string
  categoryId?: string
  isFixed: boolean  // NEW
  purchaseId: string  // Groups installments
  totalPurchaseAmount: number
}
```

### Category (Updated)
```typescript
type Category = {
  // ... existing fields
  // REMOVED: isFixed
  // NEW: monthlyBudget?: number
}
```

---

## F. IMPLEMENTATION PRIORITY

### Phase 1: Core Infrastructure ✅ COMPLETED
1. ✅ Create centralized data store (localStorage with `finance-imported-files` and `finance-transactions`)
2. ✅ Update Import flow with toast notifications and file history
3. ✅ Update data models (added category and isFixed to transactions and credit card payments)

### Phase 2: Cash Flow View ✅ COMPLETED
4. ✅ Create component (`/tools/cash-flow/page.tsx`)
5. ✅ Month selector
6. ✅ Display transactions by charging date
7. ✅ Intelligent detection of paid credit card charges

### Phase 3: Budget View ✅ COMPLETED
7. ✅ Create component (`/tools/budget/page.tsx`)
8. ✅ Display transactions by transaction date
9. ✅ Add isFixed checkbox per transaction
10. ✅ Show installment details
11. ✅ Create transactionStore and subjectStore for data management
12. ✅ Integrate with Settings page for categories

### Phase 4: Future Payments 🔜 NEXT
11. [ ] Create component
12. [ ] Calculate upcoming installments
13. [ ] Project future months

### Phase 5: Polish
14. ✅ Navigation (Sidebar with all pages)
15. [ ] Remove debug logs (console.log in cash-flow page)
16. [ ] Export/import
17. [ ] Storage abstraction (consider moving to separate service)

---

## G. KEY INSIGHTS

1. **isFixed is per-transaction, not per-category**
2. **Two filtering methods**:
   - Cash Flow: Charging date (`chargingDate` field)
   - Budget: Transaction date (`transactionDate` or `date` field)
3. **Single source of truth**: Import once, analyze multiple ways
4. **Credit cards store both dates**: Transaction date + Charging date
5. **Future view reads existing data**: No new imports needed
6. **Store pattern**: All localStorage operations centralized in stores (`transactionStore`, `subjectStore`)
7. **Categories managed in Settings**: Budget page dynamically loads categories from Settings page

---

## H. ARCHITECTURE

### Data Flow
```
Import Files → localStorage (finance-imported-files + finance-transactions)
                      ↓
         ┌────────────┼────────────┐
         ↓            ↓            ↓
   Cash Flow      Budget      Future Payments
   (charging)  (transaction)   (projections)
```

### Stores
- **transactionStore** (`/app/stores/transactionStore.ts`)
  - `getData()` - get raw transaction data
  - `getBudgetTransactions(month)` - load transactions by transaction date
  - `getBankAccountNumber(month)` - get account number for month
  - `updateAny(id, updates)` - update category/isFixed

- **subjectStore** (`/app/stores/subjectStore.ts`)
  - `getAll()` - all categories from Settings
  - `getExpenseCategories()` - only expenses
  - `getIncomeCategories()` - only income
  - `getById(id)` / `getByName(name)` - lookup

### Key Files
- `/app/tools/import/page.tsx` - Import flow
- `/app/tools/cash-flow/page.tsx` - Cash flow analysis
- `/app/tools/budget/page.tsx` - Budget analysis
- `/app/components/Settings.tsx` - Category management
- `/app/types/transactions.ts` - Type definitions
