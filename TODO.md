# Finance App - TODO

## Current Status

### ✅ Completed Features
- Multi-tool architecture with sidebar navigation
- Transaction analysis for FIBI bank statements
- Credit card statement parsing with expandable details
- File browser with folder persistence (remembers last folder)
- Category/subject management (Settings page)
- LocalStorage persistence for:
  - Transactions and credit card data
  - Category definitions
  - Transaction classifications
- Import/Export functionality for settings
- Duplicate detection when loading additional files
- Category classification with dropdowns in transaction table
- Credit card payments have category dropdowns (expandable detail view)
- Bank credit card charges show "תשלום כרטיס" (not classified - it's just a payment method)

## 🔄 Current Issue: Credit Card Timing Mismatch

### The Problem
Credit card transactions span two different time periods:

**Example: Analyzing November Bank Statement**

1. **Bank Statement (November):**
   - Shows a credit card charge for **October purchases**
   - This is the total payment made in November for last month's spending
   - To see WHAT was purchased, need **October credit card file**

2. **Forward Planning (November):**
   - **November credit card file** shows current month's purchases
   - These will be charged in **December bank statement**
   - Important for budgeting what's coming next month

### Current Behavior
- System expects credit card file month to match bank file month
- When loading November bank + November CC file:
  - CC details don't link to bank charge (wrong month)
  - Missing breakdown of what the November charge actually is

### Proposed Solutions (Pick One)

**Option 1: Multi-Month Credit Card Support**
- Allow loading credit card files from multiple months simultaneously
- Load October CC → links to November bank charge (shows breakdown)
- Load November CC → shows upcoming charges (forward planning)
- System auto-matches CC files to bank charges by month offset

**Option 2: Separate Historical vs Future Views**
- Current tool: Historical analysis (bank + previous month CC)
- Future Payments tool: Forward-looking (next month's CC charges)
- Keep them separate to avoid confusion

**Option 3: Month Offset Toggle**
- Add UI toggle in transaction analysis:
  - [ ] "Show credit card from previous month" (default - for breakdown)
  - [ ] "Show credit card from next month" (for planning)
- Only one mode at a time

**Option 4: Smart Auto-Detection**
- When loading CC file, detect if it's:
  - Previous month → link to bank charges
  - Current month → show as "upcoming charges" section
  - Next month → show as "future planning"
- Allow multiple CC files, categorize them automatically

## 📋 Next Session Tasks

1. **Decide on credit card timing solution** (discuss options above)
2. **Implement chosen solution**
3. **Create Status/Analytics Page:**
   - New tool: "סטטוס" or "ניתוח תקציב"
   - Pie chart breakdown by category
   - Summary table with amounts per category
   - Show unclassified transaction count
   - Month-over-month comparison
   - Filter by income/expense
   - Budget targets per category (future)

## 🎯 Future Enhancements
- AI-powered category suggestions (pattern matching on merchant names)
- Budget targets and alerts
- Trend analysis over multiple months
- Export reports (PDF, Excel)
- Multi-currency support
- Recurring transaction detection

## 📝 Technical Notes
- LocalStorage keys:
  - `finance-transactions` - transaction data
  - `finance-categories` - categories and classifications
- Credit card payment IDs are used for classification (not bank transaction IDs)
- Bank credit card charge rows have `isCreditCardCharge: true` flag
