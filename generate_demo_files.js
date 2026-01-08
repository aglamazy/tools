#!/usr/bin/env node
/**
 * Generate demo bank and credit card files for finance app demo
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function createBankFile(filename, month, year, accountNumber = "123-456789") {
  const data = [];

  // Header rows
  data.push([`חשבון מספר: ${accountNumber}`]);
  data.push([`תאריך הדפסה: ${new Date().toLocaleDateString('he-IL')}`]);
  data.push([]);

  // Column headers
  data.push(["תאריך", "תאור", "אסמכתא", "חובה", "זכות", "יתרה"]);

  let balance = 15000.00;

  // Salary (first day of month)
  const salary = 10000.00;
  data.push([`01/${String(month).padStart(2, '0')}/${year}`, "שכר חודש", "123456", "", salary, balance + salary]);
  balance += salary;

  // Electricity bill (5th of month)
  const elecAmount = random(350, 450);
  data.push([`05/${String(month).padStart(2, '0')}/${year}`, "חברת החשמל", "789012", elecAmount, "", balance - elecAmount]);
  balance -= elecAmount;

  // Municipality payment (7th of month)
  const muniAmount = random(550, 650);
  data.push([`07/${String(month).padStart(2, '0')}/${year}`, "עיריית תל אביב - ארנונה", "345678", muniAmount, "", balance - muniAmount]);
  balance -= muniAmount;

  // Credit card charges (10th of month)
  const ccAmount1 = random(2500, 3000);
  data.push([`10/${String(month).padStart(2, '0')}/${year}`, "4256 - ישראכרט", "901234", ccAmount1, "", balance - ccAmount1]);
  balance -= ccAmount1;

  // Another credit card charge (15th of month)
  const ccAmount2 = random(2500, 3000);
  data.push([`15/${String(month).padStart(2, '0')}/${year}`, "4256 - ישראכרט", "567890", ccAmount2, "", balance - ccAmount2]);
  balance -= ccAmount2;

  // Internet/Phone (12th of month)
  const internetAmount = random(100, 150);
  data.push([`12/${String(month).padStart(2, '0')}/${year}`, "בזק בינלאומי", "234567", internetAmount, "", balance - internetAmount]);
  balance -= internetAmount;

  // Gym membership (20th of month)
  const gymAmount = random(200, 250);
  data.push([`20/${String(month).padStart(2, '0')}/${year}`, "מועדון כושר - חיוב חודשי", "890123", gymAmount, "", balance - gymAmount]);
  balance -= gymAmount;

  // Cash withdrawal (22nd of month)
  const cashAmount = random(800, 1000);
  data.push([`22/${String(month).padStart(2, '0')}/${year}`, "משיכת מזומן - סניף", "456789", cashAmount, "", balance - cashAmount]);
  balance -= cashAmount;

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Statement");

  // Write file
  XLSX.writeFile(wb, filename);
  console.log(`Created ${filename}`);
}

function createCreditCardFile(filename, month, year, cardNumber = "4256") {
  const data = [];

  // Header rows
  data.push([`כרטיס אשראי מספר: ****${cardNumber}`]);
  data.push([`מועד חיוב: ${month === 12 ? 'ינואר' : month === 11 ? 'דצמבר' : 'נובמבר'} ${year}`]);
  data.push([]);

  // Column headers
  data.push(["תאריך עסקה", "שם בית העסק", "סכום עסקה", "סכום חיוב", "פירוט"]);

  const merchants = [
    ["סופר פארם", 150, 250],
    ["שופרסל", 300, 500],
    ["דלק", 200, 300],
    ["רמי לוי", 250, 400],
    ["קפה נמרוד", 30, 80],
    ["דומינוס פיצה", 80, 150],
    ["ויקטורי", 400, 600],
    ["איקאה", 300, 800],
    ["רולדין", 50, 150],
    ["סטימצקי", 50, 200],
    ["זארה", 150, 400],
    ["מקדונלד'ס", 40, 80],
    ["נלסון", 200, 400],
    ["גולף", 150, 250],
    ["אם טו גו", 100, 200],
  ];

  let total = 0;
  let day = 3;

  for (const [merchant, minAmount, maxAmount] of merchants) {
    if (day > 28) break;

    const amount = Math.round(random(minAmount, maxAmount) * 100) / 100;
    const transDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

    // Some transactions in installments
    let detail = "רגיל";
    if (amount > 300 && Math.random() > 0.6) {
      const installments = [2, 3, 4, 6][Math.floor(Math.random() * 4)];
      detail = `תשלום 1 מתוך ${installments}`;
    }

    data.push([transDate, merchant, amount, amount, detail]);
    total += amount;

    day += Math.floor(random(1, 4));
  }

  // Add total row
  data.push([]);
  data.push(["", "סה\"כ לחיוב", "", total.toFixed(2), ""]);

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");

  // Write file
  XLSX.writeFile(wb, filename);
  console.log(`Created ${filename} - Total: ${total.toFixed(2)} ILS`);
}

// Main execution
const demoDir = path.join(__dirname, 'public', 'demo_files');

// Create directory if it doesn't exist
if (!fs.existsSync(demoDir)) {
  fs.mkdirSync(demoDir, { recursive: true });
}

// Create demo files
console.log('Generating demo files...\n');

// Bank files for November and December 2025
createBankFile(path.join(demoDir, '2025-11.xlsx'), 11, 2025);
createBankFile(path.join(demoDir, '2025-12.xlsx'), 12, 2025);

// Credit card files for November and December 2025
createCreditCardFile(path.join(demoDir, '4256_11_2025.xlsx'), 11, 2025);
createCreditCardFile(path.join(demoDir, '4256_12_2025.xlsx'), 12, 2025);

console.log('\nDemo files created successfully!');
console.log('Files created in: public/demo_files/');
