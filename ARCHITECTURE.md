# Architecture Guidelines

## Layered Architecture

This application follows a strict layered architecture. Each layer has specific responsibilities and should NOT mix concerns.

### Layer Structure

```
┌─────────────────────────────────────┐
│         Pages (UI Layer)            │  Orchestrates user interactions
├─────────────────────────────────────┤
│      Services (Business Logic)      │  Coordinates operations between layers
├─────────────────────────────────────┤
│     Parsers & Utilities (Logic)     │  Pure functions, data transformation
├─────────────────────────────────────┤
│      Stores (Data Access)           │  localStorage operations only
└─────────────────────────────────────┘
```

### Layer Responsibilities

#### 1. **Pages** (`/app/tools/*/page.tsx`, `/app/components/*.tsx`)
- **DO**:
  - Handle user interactions (clicks, form inputs)
  - Orchestrate calls to services
  - Display UI components
  - Manage local component state (UI state only)
- **DON'T**:
  - Access `localStorage` directly
  - Parse Excel files
  - Know about XLSX library
  - Contain business logic

**Example:**
```typescript
// ✅ GOOD
const handleFileSelect = async (file: File) => {
  const metadata = await extractFileMetadata(file)
  await fileImportService.importCreditCardFile(file, metadata.cardNumber, null)
  showToast('success', 'File imported!')
}

// ❌ BAD - Page knows about XLSX and localStorage
const handleFileSelect = async (file: File) => {
  const workbook = XLSX.read(await file.arrayBuffer())
  localStorage.setItem('data', JSON.stringify(workbook))
}
```

#### 2. **Services** (`/app/services/*.ts`)
- **DO**:
  - Coordinate between parsers and stores
  - Handle file operations (reading Excel files)
  - Implement business workflows
  - Transform data between layers
- **DON'T**:
  - Access localStorage directly (use stores)
  - Contain parsing logic (use parsers)
  - Handle UI concerns

**Example:**
```typescript
// ✅ GOOD
export const fileImportService = {
  importCreditCardFile: async (file: File, cardNumber: string, billingDate: Date | null) => {
    // Read file
    const rows = await readExcelFile(file)

    // Parse data
    const statement = parseCreditCardStatement(rows)

    // Save to storage
    transactionStore.saveCreditCardData(cardNumber, statement.payments, chargingDateStr)
  }
}
```

#### 3. **Parsers & Utilities** (`/app/utils/*.ts`)
- **DO**:
  - Pure functions that transform data
  - Parse specific file formats
  - Format data for display
  - Generate derived data (like colors, dates)
- **DON'T**:
  - Access localStorage
  - Know about XLSX library (receive rows as input)
  - Have side effects

**Example:**
```typescript
// ✅ GOOD - Pure function, receives rows
export function parseCreditCardStatement(rows: SheetRow[]): CreditCardStatement {
  const headerIndex = findHeader(rows)
  const payments = parsePayments(rows, headerIndex)
  return { payments, cardNumber, billingDate }
}

// ❌ BAD - Parser reads files directly
export function parseCreditCardStatement(file: File): CreditCardStatement {
  const workbook = XLSX.read(file)  // Parser shouldn't know about XLSX
}
```

#### 4. **Stores** (`/app/stores/*.ts`)
- **DO**:
  - Read from localStorage
  - Write to localStorage
  - Provide typed interfaces for data access
  - Handle data consistency
- **DON'T**:
  - Parse files
  - Know about XLSX
  - Contain business logic
  - Transform data (except basic filtering)

**Example:**
```typescript
// ✅ GOOD - Only handles localStorage
export const transactionStore = {
  saveCreditCardData: (cardNumber: string, payments: CreditCardPayment[], chargingDate?: string) => {
    const data = getStorageData()
    data.creditCardData.push({ cardNumber, payments })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }
}

// ❌ BAD - Store parses data
export const transactionStore = {
  importFile: (file: File) => {
    const workbook = XLSX.read(file)  // Store shouldn't parse
    const data = parseData(workbook)  // Store shouldn't have business logic
    localStorage.setItem(KEY, data)
  }
}
```

### Type Organization

All types should live in `/app/types/*.ts`:

```typescript
// ✅ GOOD
// /app/types/transactions.ts
export type CreditCardPayment = { ... }
export type Transaction = { ... }

// ❌ BAD - Types in store file
// /app/stores/transactionStore.ts
type CreditCardPayment = { ... }  // Move to /app/types
```

### Data Flow Example

**Importing a credit card file:**

```
User clicks import
      ↓
Page: handleFileSelect(file)
      ↓
Service: fileImportService.importCreditCardFile(file, cardNumber, billingDate)
      ├─→ Read XLSX file → rows
      ├─→ Parser: parseCreditCardStatement(rows) → statement
      └─→ Store: transactionStore.saveCreditCardData(...) → localStorage
```

### Quick Checklist

Before writing code, ask:

- **Am I in a Page?** → Only orchestrate, call services
- **Am I in a Service?** → Coordinate parsers and stores, handle files
- **Am I in a Parser?** → Pure function, transform data, no side effects
- **Am I in a Store?** → Only touch localStorage, no business logic

### Benefits

- **Testability**: Each layer can be tested independently
- **Maintainability**: Changes to one layer don't affect others
- **Reusability**: Parsers and stores can be reused across features
- **Clarity**: Each file has a single, clear responsibility
- **Type Safety**: Strong typing across all layers

---

**Remember**: Respect the layers. Don't let pages touch localStorage. Don't let stores parse files. Keep it clean! 🎯
