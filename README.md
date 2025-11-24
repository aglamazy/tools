# Finance Manager

A comprehensive personal finance management tool for analyzing bank transactions, tracking budgets, and managing credit card payments.

## Features

### ✅ Current Implementation

- **Transaction Analysis**: Parse and analyze FIBI bank (Israel) XLS statements
- **Credit Card Integration**: Parse credit card statements with detailed payment breakdown
- **Multi-File Import**: Load multiple bank and credit card files with automatic deduplication
- **Category Management**: Define and manage income/expense categories with color coding
- **Smart Classification**: Automatic category suggestions based on historical patterns
- **File Browser**: Persistent folder selection with file preview and metadata
- **Data Persistence**: LocalStorage-based data storage with export/import functionality
- **Installment Tracking**: Full support for credit card installments (תשלומים)
- **Historical Snapshots**: Monthly financial summaries with category breakdowns

### 📊 Analysis Views

1. **Import Files**: Upload and store bank/credit card statements
2. **Cash Flow Analysis**: Track when money actually moves (charging dates)
3. **Budget Tracking**: Monitor spending by category (transaction dates)
4. **Future Payments**: View upcoming installments and recurring expenses

### 🎨 Category System

- Color-coded categories (8 income colors, 12 expense colors)
- Automatic color assignment to avoid duplicates
- Import/Export category definitions
- Transaction-level classification with historical pattern matching

### 💳 Credit Card Handling

- **Dual Date Tracking**:
  - Transaction Date: When purchase was made
  - Charging Date: When payment hits bank account
- **Installment Support**: Track multi-payment purchases (X/12)
- **Smart Filtering**: Prevent double-counting across multiple statements
- **Detailed Breakdown**: Expand bank charges to see individual purchases

## Architecture

### Data Models

**Transaction**
- Bank account transactions
- Classification by category
- Per-transaction `isFixed` flag for recurring expenses

**Credit Card Payment**
- Transaction date + Charging date
- Installment tracking (current step / total steps)
- Links to bank account charges
- Category classification

**Category**
- Income/Expense type
- Color coding
- Monthly budget targets

### Storage

**LocalStorage Keys**:
- `finance-transactions` - Transaction data
- `finance-categories` - Categories and classifications
- `finance-history` - Monthly snapshots

**Future**: Planned support for Google Drive sync and file-based storage

## Technical Details

### File Formats Supported
- FIBI Bank XLS/XLSX statements
- Isracard credit card statements

### Key Insights

1. **isFixed per transaction**: Same category can have fixed and variable expenses
2. **Two filtering modes**:
   - Cash Flow: By charging date
   - Budget: By transaction date
3. **Single source of truth**: Import once, analyze multiple ways
4. **Future payments**: Calculated from installments + recurring expenses

## Development

Built with Next.js, React, and TypeScript.

### LocalStorage Structure
```typescript
// Transactions
{
  version: '1.0',
  processingMonth: 'MM/YYYY',
  transactions: Transaction[],
  creditCardData: CreditCardData[],
  loadedFiles: string[],
  lastUpdated: string
}

// Categories
{
  version: '1.0',
  categories: Category[],
  classifications: Classification[],
  lastUpdated: string
}

// History
{
  version: '1.0',
  months: MonthSnapshot[],
  lastUpdated: string
}
```

## Roadmap

See [TODO.md](TODO.md) for detailed implementation plan.

### Planned Features
- Multi-month data management
- Budget vs Actual tracking with alerts
- Cash flow projections
- Recurring expense detection
- Google Drive sync
- PDF/Excel export
- Multi-currency support
