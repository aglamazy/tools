# Finance Manager - Workflow Redesign TODO

## Core Concept
Separate the application into 4 distinct flows, each with a clear purpose. All flows read from a centralized data store that contains imported files.

---

## A. IMPORT FILES FLOW (Data Storage)

**Purpose**: Store imported bank and credit card files locally for later analysis

### Tasks
- [ ] Create centralized data store structure (localStorage → future: Google Drive/file download)
- [ ] Store raw imported files with metadata
- [ ] Parse and store all transactions
- [ ] Simple import UI with file upload
- [ ] Allow multiple imports without resetting
- [ ] Store charging dates with credit card payments

---

## B. CASH FLOW ANALYSIS FLOW

**Purpose**: See all money movement for a specific month (when money left/entered bank account)

### Tasks
- [ ] Create CashFlowAnalysis page/component
- [ ] Month selector
- [ ] Display bank transactions from selected month
- [ ] Display credit card charges (lump sum)
- [ ] Show future committed payments (installments)
- [ ] Summary: Income, Expenses, Net, Opening/Closing balance

**Key Point**: Shows when money moves (charging date)

---

## C. BUDGET ANALYSIS FLOW

**Purpose**: Track spending by category for a month (when purchases were made)

### Important Change
- [ ] **Remove `isFixed` from Category**
- [ ] **Add `isFixed` to individual transactions**
- [ ] Reason: Same category can have fixed AND variable expenses

### Tasks
- [ ] Create BudgetAnalysis page/component
- [ ] Month selector
- [ ] Display all purchases from selected month:
  - [ ] Bank transactions
  - [ ] Credit card payments (transaction date in month, from current+next statements)
- [ ] Transaction table columns:
  - [ ] Date (transaction date)
  - [ ] Business
  - [ ] Subject (category dropdown)
  - [ ] Amount
  - [ ] **isFixed checkbox** (per transaction)
  - [ ] Payment index (3/12)
  - [ ] Total amount (full purchase price for installments)
- [ ] Category summaries (fixed vs variable)
- [ ] Budget vs Actual comparison

**Key Point**: Shows when you spent money (transaction date)

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

### Phase 1: Core Infrastructure
1. Create centralized data store
2. Update Import flow
3. Update data models (move isFixed to transaction)

### Phase 2: Cash Flow View
4. Create component
5. Month selector
6. Display transactions by charging date

### Phase 3: Budget View
7. Create component
8. Display transactions by transaction date
9. Add isFixed checkbox per transaction
10. Show installment details

### Phase 4: Future Payments
11. Create component
12. Calculate upcoming installments
13. Project future months

### Phase 5: Polish
14. Navigation
15. Remove debug logs
16. Export/import
17. Storage abstraction

---

## G. KEY INSIGHTS

1. **isFixed is per-transaction, not per-category**
2. **Two filtering methods**:
   - Cash Flow: Charging date
   - Budget: Transaction date
3. **Single source of truth**: Import once, analyze multiple ways
4. **Credit cards store both dates**: Transaction date + Charging date
5. **Future view reads existing data**: No new imports needed
