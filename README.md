# Finance Manager

A comprehensive personal finance management tool for analyzing bank transactions, tracking budgets, and managing credit card payments.

## Features

### ✅ Current Implementation

- **Transaction Analysis**: Parse and analyze FIBI bank (Israel) XLS statements
- **Credit Card Integration**: Advanced credit card statement parsing with table detection and detailed payment breakdown
- **Multi-File Import**: Load multiple bank and credit card files with automatic deduplication and import history
- **Category Management**: Define and manage income/expense categories with color coding and auto-assignment
- **Smart Classification**: Automatic category suggestions based on historical patterns with warning system
- **File Browser**: Persistent folder selection with file preview, metadata, and permission management
- **Data Persistence**: LocalStorage-based data storage with full backup/restore functionality
- **Backup & Restore**: Export all data to JSON and import from backup with confirmation dialogs
- **Installment Tracking**: Full support for credit card installments (תשלומים) with total purchase amount display
- **Custom Modals**: YesNo confirmation dialogs and alert modals (no native browser dialogs)
- **Duplicate Detection**: Smart duplicate transaction key generation to prevent React errors

### 📊 Analysis Views

1. **Import Files**: Upload and store bank/credit card statements with toast notifications
2. **Cash Flow Analysis**: Track when money actually moves (charging dates) with intelligent paid charge detection
3. **Budget Tracking**: Monitor spending by category (transaction dates) with category filtering and sidebar collapse
4. **Future Payments**: _(Coming soon)_ View upcoming installments and recurring expenses
5. **Settings**: Manage categories, configure default folder, and backup/restore all data

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
- `finance-transactions` - Transaction data with monthly snapshots
- `finance-categories` - Categories and classifications with historical patterns
- `finance-imported-files` - Imported file metadata and processing dates
- `directory-handle` - Persisted folder selection for File System Access API

**Backup System**: Full export/import of all localStorage data in JSON format

## Technical Details

### File Formats Supported
- FIBI Bank XLS/XLSX statements with automatic column detection
- Isracard credit card statements with table detection and charging date extraction
- Automatic encoding detection and Hebrew text support

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
