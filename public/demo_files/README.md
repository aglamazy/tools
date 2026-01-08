# Demo Files

This directory contains fake demo files for demonstrating the finance app.

## Files

### Bank Statements (.xlsx)
- `2025-11.xlsx` - November 2025 bank statement
- `2025-12.xlsx` - December 2025 bank statement

**Account**: 123-456789
**Format**: FIBI Bank format

**Typical monthly transactions**:
- Salary: ₪10,000
- Electricity: ~₪400
- Municipality (Arnona): ~₪600
- Credit card payments: ~₪5,000-6,000
- Internet/Phone: ~₪100-150
- Gym membership: ~₪200-250
- Cash withdrawal: ~₪800-1,000

**Total expenses**: ~₪8,000/month

### Credit Card Statements (.xlsx)
- `4256_11_2025.xlsx` - November 2025 credit card statement
- `4256_12_2025.xlsx` - December 2025 credit card statement

**Card**: **** 4256
**Format**: Israeli credit card format (Isracard/Max compatible)

**Typical transactions**:
- Supermarkets (Shufersal, Rami Levy)
- Gas stations (Dor Alon, Paz, Sonol)
- Restaurants and cafes
- Clothing stores
- Pharmacies
- Online purchases

**Total charges**: ~₪3,000-4,000/month

## Purpose

These files demonstrate:
- Monthly income and expenses
- Various transaction types
- Hebrew language support
- Multiple file format compatibility
- Realistic financial data structure

## Usage

1. Import these files through the app's import page
2. View transactions in budget and cash flow tools
3. Test categorization and reporting features
4. Demo the app to potential users

## Data Privacy

⚠️ **All data in these files is completely fake and randomly generated**

- No real account numbers
- No real transaction details
- Merchants are common Israeli brands (for realism only)
- Amounts are randomized within realistic ranges

## Regeneration

To regenerate these files with new random values:

```bash
node generate_demo_files.js
```

This will create new files with different random amounts while maintaining the same structure and merchant types.
