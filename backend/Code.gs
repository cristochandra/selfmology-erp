// ============================================================
// SELFMOLOGY ERP – Google Apps Script Backend (Fixed)
// ============================================================
// Deploy as Web App: Execute as ME, Access: Anyone
// ============================================================

const SPREADSHEET_ID = '1AWfxSfHPFMhiwQoginzCK1TkJ3WXj6Jw4WRy7fV6JIo';

const SHEETS = {
  MASTER_DATA: 'Master_Data',
  INVENTORY_IN: 'Inventory_In',
  INVENTORY_OUT: 'Inventory_Out',
  INVOICES: 'Invoices',
  INVOICE_LINE_ITEMS: 'Invoice_Line_Items',
  DELIVERY_ORDERS: 'Delivery_Orders',
  EXPENSES: 'Expenses',
  USERS: 'Users',
  CUSTOMERS: 'Customers'
};

// ============================================================
// ROUTING – supports both GET (?payload=) and POST
// ============================================================

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    let parsed = {};
    if (params.payload) {
      parsed = JSON.parse(params.payload);
    } else if (e.postData) {
      parsed = JSON.parse(e.postData.contents);
    }
    const action = parsed.action || params.action || '';
    const data = parsed.data || {};

    let result;
    switch (action) {
      case 'login':               result = login(data); break;
      case 'getMasterData':       result = getMasterData(); break;
      case 'addProduct':          result = addProduct(data); break;
      case 'updateProduct':       result = updateProduct(data); break;
      case 'deleteProduct':       result = deleteProduct(data); break;
      case 'getInventoryIn':      result = getInventoryIn(); break;
      case 'addInventoryIn':      result = addInventoryIn(data); break;
      case 'getInventoryOut':     result = getInventoryOut(); break;
      case 'addInventoryOut':     result = addInventoryOut(data); break;
      case 'bulkAddInventoryOut': result = bulkAddInventoryOut(data); break;
      case 'getInvoices':         result = getInvoices(); break;
      case 'createInvoice':       result = createInvoice(data); break;
      case 'updateInvoice':       result = updateInvoice(data); break;
      case 'finalizeInvoice':     result = finalizeInvoice(data); break;
      case 'getLineItems':        result = getLineItems(data); break;
      case 'getDeliveryOrders':   result = getDeliveryOrders(); break;
      case 'createDeliveryOrder': result = createDeliveryOrder(data); break;
      case 'executeDeliveryOrder':result = executeDeliveryOrder(data); break;
      case 'updatePaymentStatus': result = updatePaymentStatus(data); break;
      case 'getExpenses':         result = getExpenses(); break;
      case 'addExpense':          result = addExpense(data); break;
      case 'getCustomers':        result = getCustomers(); break;
      case 'getDashboardData':    result = getDashboardData(data); break;
      case 'getUsers':            result = getUsers(); break;
      case 'addUser':             result = addUser(data); break;
      case 'updateUser':          result = updateUser(data); break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// UTILITIES
// ============================================================

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function getSheetData(sheetName) {
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function appendRow(sheetName, rowData, headers) {
  const sheet = getSheet(sheetName);
  const row = headers.map(h => rowData[h] !== undefined ? rowData[h] : '');
  sheet.appendRow(row);
}

function generateId(prefix) {
  return prefix + '-' + new Date().getTime() + '-' + Math.random().toString(36).substr(2, 5);
}

function formatDate(d) {
  if (!d) d = new Date();
  if (typeof d === 'string') d = new Date(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'h_' + Math.abs(hash).toString(36);
}

// ============================================================
// AUTH
// ============================================================

function login(data) {
  const { email, password } = data;
  if (!email || !password) return { success: false, error: 'Email and password are required.' };
  const users = getSheetData(SHEETS.USERS);
  const user = users.find(u => u.Email && u.Email.toString().toLowerCase() === email.toLowerCase());
  if (!user) return { success: false, error: 'User not found.' };
  const hashed = simpleHash(password);
  if (user.Password && user.Password !== hashed) return { success: false, error: 'Invalid password.' };
  return { success: true, user: { userId: user.User_ID, email: user.Email, role: user.Role, name: user.Name || user.Email } };
}

// ============================================================
// MASTER DATA
// ============================================================

function getMasterData() { return { success: true, data: getSheetData(SHEETS.MASTER_DATA) }; }

function addProduct(data) {
  const headers = ['SKU', 'Product_Name', 'Category', 'Description', 'COGS', 'Standard_Price', 'Image_URL'];
  if (!data.SKU || !data.Product_Name) return { success: false, error: 'SKU and Product Name are required.' };
  const existing = getSheetData(SHEETS.MASTER_DATA);
  if (existing.find(p => p.SKU === data.SKU)) return { success: false, error: 'SKU already exists.' };
  appendRow(SHEETS.MASTER_DATA, data, headers);
  return { success: true, message: 'Product added successfully.' };
}

function updateProduct(data) {
  const sheet = getSheet(SHEETS.MASTER_DATA);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const skuIdx = headers.indexOf('SKU');
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][skuIdx] === data.SKU) {
      headers.forEach((h, j) => { if (data[h] !== undefined && h !== 'SKU') sheet.getRange(i + 1, j + 1).setValue(data[h]); });
      return { success: true, message: 'Product updated.' };
    }
  }
  return { success: false, error: 'SKU not found.' };
}

function deleteProduct(data) {
  const sheet = getSheet(SHEETS.MASTER_DATA);
  const allData = sheet.getDataRange().getValues();
  const skuIdx = allData[0].indexOf('SKU');
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][skuIdx] === data.SKU) { sheet.deleteRow(i + 1); return { success: true, message: 'Product deleted.' }; }
  }
  return { success: false, error: 'SKU not found.' };
}

// ============================================================
// INVENTORY
// ============================================================

function getInventoryIn() { return { success: true, data: getSheetData(SHEETS.INVENTORY_IN) }; }

function addInventoryIn(data) {
  const headers = ['Transaction_ID', 'Date_Received', 'SKU', 'Product_Name', 'Quantity', 'Batch_Number', 'Expiry_Date'];
  if (data.SKU && !data.Product_Name) {
    const products = getSheetData(SHEETS.MASTER_DATA);
    const product = products.find(p => p.SKU === data.SKU);
    if (product) data.Product_Name = product.Product_Name;
  }
  if (!data.Transaction_ID) data.Transaction_ID = generateId('IN');
  if (!data.Date_Received) data.Date_Received = formatDate();
  data.Quantity = Number(data.Quantity) || 0;
  appendRow(SHEETS.INVENTORY_IN, data, headers);
  return { success: true, message: 'Stock In recorded.', transactionId: data.Transaction_ID };
}

function getInventoryOut() { return { success: true, data: getSheetData(SHEETS.INVENTORY_OUT) }; }

function addInventoryOut(data) {
  const headers = ['Transaction_ID', 'Date', 'SKU', 'Quantity', 'Reason', 'Reference_ID'];
  if (!data.Transaction_ID) data.Transaction_ID = generateId('OUT');
  if (!data.Date) data.Date = formatDate();
  data.Quantity = Number(data.Quantity) || 0;
  appendRow(SHEETS.INVENTORY_OUT, data, headers);
  return { success: true, message: 'Stock Out recorded.', transactionId: data.Transaction_ID };
}

function bulkAddInventoryOut(data) {
  const rows = data.rows || [];
  if (!rows.length) return { success: false, error: 'No rows provided.' };
  const sheet = getSheet(SHEETS.INVENTORY_OUT);
  const headers = ['Transaction_ID', 'Date', 'SKU', 'Quantity', 'Reason', 'Reference_ID'];
  const newRows = rows.map(row => {
    if (!row.Transaction_ID) row.Transaction_ID = generateId('OUT');
    if (!row.Date) row.Date = formatDate();
    row.Quantity = Number(row.Quantity) || 0;
    return headers.map(h => row[h] || '');
  });
  if (newRows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
  return { success: true, message: newRows.length + ' rows imported.', count: newRows.length };
}

// ============================================================
// INVOICES
// ============================================================

function getInvoices() { return { success: true, data: getSheetData(SHEETS.INVOICES) }; }

function createInvoice(data) {
  const { header, lineItems } = data;
  if (!header.Invoice_ID) header.Invoice_ID = 'DRAFT-' + generateId('');
  if (!header.Date_Created) header.Date_Created = formatDate();
  if (!header.Status) header.Status = 'Draft';
  const created = new Date(header.Date_Created);
  const due = new Date(created.getTime() + 14 * 24 * 60 * 60 * 1000);
  header.Payment_Due_Date = formatDate(due);

  let total = 0;
  const lineHeaders = ['Line_ID', 'Invoice_ID', 'SKU', 'Quantity', 'Unit_Price', 'Line_Total'];
  if (lineItems && lineItems.length > 0) {
    const lineSheet = getSheet(SHEETS.INVOICE_LINE_ITEMS);
    const newLineRows = lineItems.map((item, idx) => {
      item.Line_ID = header.Invoice_ID + '-L' + (idx + 1);
      item.Invoice_ID = header.Invoice_ID;
      item.Quantity = Number(item.Quantity) || 0;
      item.Unit_Price = Number(item.Unit_Price) || 0;
      item.Line_Total = item.Quantity * item.Unit_Price;
      total += item.Line_Total;
      return lineHeaders.map(h => item[h] || '');
    });
    if (newLineRows.length > 0) lineSheet.getRange(lineSheet.getLastRow() + 1, 1, newLineRows.length, lineHeaders.length).setValues(newLineRows);
  }

  header.Total_Amount = total;
  header.Discount_Value = Number(header.Discount_Value) || 0;
  if (!header.Discount_Type) header.Discount_Type = 'fixed';

  const invoiceHeaders = ['Invoice_ID', 'Date_Created', 'Customer_Name', 'Total_Amount', 'Discount_Value', 'Discount_Type', 'Status', 'Payment_Due_Date'];
  appendRow(SHEETS.INVOICES, header, invoiceHeaders);

  // Add customer if new
  if (header.Customer_Name) {
    const customers = getSheetData(SHEETS.CUSTOMERS);
    if (!customers.find(c => c.Customer_Name === header.Customer_Name)) {
      appendRow(SHEETS.CUSTOMERS, { Customer_Name: header.Customer_Name }, ['Customer_Name']);
    }
  }

  return { success: true, message: 'Invoice created.', invoiceId: header.Invoice_ID };
}

function updateInvoice(data) {
  const sheet = getSheet(SHEETS.INVOICES);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idIdx = headers.indexOf('Invoice_ID');
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idIdx] === data.Invoice_ID) {
      if (allData[i][headers.indexOf('Status')] === 'Finalized') return { success: false, error: 'Cannot edit a finalized invoice.' };
      headers.forEach((h, j) => { if (data[h] !== undefined && h !== 'Invoice_ID') sheet.getRange(i + 1, j + 1).setValue(data[h]); });
      return { success: true, message: 'Invoice updated.' };
    }
  }
  return { success: false, error: 'Invoice not found.' };
}

function finalizeInvoice(data) {
  const sheet = getSheet(SHEETS.INVOICES);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idIdx = headers.indexOf('Invoice_ID');
  const statusIdx = headers.indexOf('Status');

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idIdx] === data.Invoice_ID) {
      if (allData[i][statusIdx] === 'Finalized') return { success: false, error: 'Already finalized.' };
      const allInvoices = getSheetData(SHEETS.INVOICES);
      const finalizedCount = allInvoices.filter(inv => inv.Status === 'Finalized').length;
      const newId = 'INV-' + String(finalizedCount + 1).padStart(5, '0');
      const oldId = allData[i][idIdx];

      sheet.getRange(i + 1, idIdx + 1).setValue(newId);
      sheet.getRange(i + 1, statusIdx + 1).setValue('Finalized');

      // Update line items
      const lineSheet = getSheet(SHEETS.INVOICE_LINE_ITEMS);
      const lineData = lineSheet.getDataRange().getValues();
      const lh = lineData[0];
      const liIdx = lh.indexOf('Invoice_ID');
      const llIdx = lh.indexOf('Line_ID');
      for (let j = 1; j < lineData.length; j++) {
        if (lineData[j][liIdx] === oldId) {
          lineSheet.getRange(j + 1, liIdx + 1).setValue(newId);
          const suffix = lineData[j][llIdx].toString().split('-L').pop();
          lineSheet.getRange(j + 1, llIdx + 1).setValue(newId + '-L' + suffix);
        }
      }
      return { success: true, message: 'Invoice finalized.', newInvoiceId: newId };
    }
  }
  return { success: false, error: 'Invoice not found.' };
}

function getLineItems(data) {
  const all = getSheetData(SHEETS.INVOICE_LINE_ITEMS);
  return { success: true, data: data.Invoice_ID ? all.filter(li => li.Invoice_ID === data.Invoice_ID) : all };
}

// ============================================================
// DELIVERY ORDERS
// ============================================================

function getDeliveryOrders() { return { success: true, data: getSheetData(SHEETS.DELIVERY_ORDERS) }; }

function createDeliveryOrder(data) {
  const headers = ['DO_ID', 'Invoice_ID', 'Date_Created', 'Status', 'Payment_Status', 'Payment_Proof_URL'];
  if (!data.Invoice_ID) return { success: false, error: 'Invoice_ID is required.' };
  const existing = getSheetData(SHEETS.DELIVERY_ORDERS);
  if (existing.find(d => d.Invoice_ID === data.Invoice_ID)) return { success: false, error: 'DO already exists for this invoice.' };
  if (!data.DO_ID) data.DO_ID = generateId('DO');
  if (!data.Date_Created) data.Date_Created = formatDate();
  data.Status = 'Pending';
  data.Payment_Status = 'Unpaid';
  data.Payment_Proof_URL = '';
  appendRow(SHEETS.DELIVERY_ORDERS, data, headers);
  return { success: true, message: 'Delivery Order created.', doId: data.DO_ID };
}

function executeDeliveryOrder(data) {
  const doSheet = getSheet(SHEETS.DELIVERY_ORDERS);
  const doData = doSheet.getDataRange().getValues();
  const dh = doData[0];
  const doIdIdx = dh.indexOf('DO_ID'), doStatusIdx = dh.indexOf('Status'), doInvIdx = dh.indexOf('Invoice_ID');
  let doRow = -1, invoiceId = '';
  for (let i = 1; i < doData.length; i++) {
    if (doData[i][doIdIdx] === data.DO_ID) {
      if (doData[i][doStatusIdx] === 'Executed') return { success: false, error: 'Already executed.' };
      doRow = i; invoiceId = doData[i][doInvIdx]; break;
    }
  }
  if (doRow === -1) return { success: false, error: 'DO not found.' };

  doSheet.getRange(doRow + 1, doStatusIdx + 1).setValue('Executed');
  const lineItems = getSheetData(SHEETS.INVOICE_LINE_ITEMS).filter(li => li.Invoice_ID === invoiceId);
  if (lineItems.length === 0) return { success: false, error: 'No line items for ' + invoiceId };

  const outSheet = getSheet(SHEETS.INVENTORY_OUT);
  const outHeaders = ['Transaction_ID', 'Date', 'SKU', 'Quantity', 'Reason', 'Reference_ID'];
  const today = formatDate();
  const newRows = lineItems.map(li => [generateId('OUT'), today, li.SKU, Number(li.Quantity) || 0, 'B2B Sales', invoiceId]);
  if (newRows.length > 0) outSheet.getRange(outSheet.getLastRow() + 1, 1, newRows.length, outHeaders.length).setValues(newRows);
  return { success: true, message: 'DO executed. ' + newRows.length + ' item(s) deducted.', inventoryOutCount: newRows.length };
}

function updatePaymentStatus(data) {
  const sheet = getSheet(SHEETS.DELIVERY_ORDERS);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idIdx = headers.indexOf('DO_ID');
  const payIdx = headers.indexOf('Payment_Status');
  const proofIdx = headers.indexOf('Payment_Proof_URL');

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idIdx] === data.DO_ID) {
      if (payIdx >= 0) sheet.getRange(i + 1, payIdx + 1).setValue(data.Payment_Status || 'Unpaid');
      if (proofIdx >= 0 && data.Payment_Proof_URL) sheet.getRange(i + 1, proofIdx + 1).setValue(data.Payment_Proof_URL);
      return { success: true, message: 'Payment status updated.' };
    }
  }
  return { success: false, error: 'DO not found.' };
}

// ============================================================
// EXPENSES
// ============================================================

function getExpenses() { return { success: true, data: getSheetData(SHEETS.EXPENSES) }; }

function addExpense(data) {
  const headers = ['Expense_ID', 'Date', 'Category', 'Amount', 'Notes', 'Receipt_Image_URL'];
  if (!data.Expense_ID) data.Expense_ID = generateId('EXP');
  if (!data.Date) data.Date = formatDate();
  data.Amount = Number(data.Amount) || 0;
  appendRow(SHEETS.EXPENSES, data, headers);
  return { success: true, message: 'Expense recorded.', expenseId: data.Expense_ID };
}

// ============================================================
// CUSTOMERS
// ============================================================

function getCustomers() { return { success: true, data: getSheetData(SHEETS.CUSTOMERS) }; }

// ============================================================
// DASHBOARD
// ============================================================

function getDashboardData(data) {
  const masterData = getSheetData(SHEETS.MASTER_DATA);
  const inventoryIn = getSheetData(SHEETS.INVENTORY_IN);
  const inventoryOut = getSheetData(SHEETS.INVENTORY_OUT);
  const dateFrom = data.dateFrom ? new Date(data.dateFrom) : null;
  const dateTo = data.dateTo ? new Date(data.dateTo) : null;

  const stockMap = {};
  masterData.forEach(p => {
    stockMap[p.SKU] = { SKU: p.SKU, Product_Name: p.Product_Name, Category: p.Category, COGS: Number(p.COGS) || 0, Standard_Price: Number(p.Standard_Price) || 0, totalIn: 0, totalOut: 0, currentStock: 0, stockValue: 0 };
  });
  inventoryIn.forEach(r => { if (stockMap[r.SKU]) stockMap[r.SKU].totalIn += Number(r.Quantity) || 0; });
  inventoryOut.forEach(r => { if (stockMap[r.SKU]) stockMap[r.SKU].totalOut += Number(r.Quantity) || 0; });

  let totalStockUnits = 0, totalStockValue = 0;
  const lowStockItems = [];
  Object.values(stockMap).forEach(item => {
    item.currentStock = item.totalIn - item.totalOut;
    item.stockValue = item.currentStock * item.COGS;
    totalStockUnits += item.currentStock;
    totalStockValue += item.stockValue;
    if (item.currentStock <= 10 && item.currentStock >= 0) lowStockItems.push(item);
  });

  const salesMap = {};
  inventoryOut.forEach(r => {
    const rd = r.Date ? new Date(r.Date) : null;
    let inRange = true;
    if (dateFrom && rd && rd < dateFrom) inRange = false;
    if (dateTo && rd && rd > dateTo) inRange = false;
    if (inRange && r.Reason && (r.Reason === 'B2B Sales' || r.Reason === 'Online Sales')) {
      if (!salesMap[r.SKU]) salesMap[r.SKU] = { SKU: r.SKU, totalSold: 0 };
      salesMap[r.SKU].totalSold += Number(r.Quantity) || 0;
    }
  });
  const topSelling = Object.values(salesMap).sort((a, b) => b.totalSold - a.totalSold).slice(0, 10)
    .map(s => ({ ...s, Product_Name: stockMap[s.SKU] ? stockMap[s.SKU].Product_Name : s.SKU }));

  return { success: true, data: { totalSKUs: masterData.length, totalStockUnits, totalStockValue, lowStockCount: lowStockItems.length, stockDetails: Object.values(stockMap), lowStockItems, topSelling } };
}

// ============================================================
// USERS
// ============================================================

function getUsers() {
  const users = getSheetData(SHEETS.USERS);
  return { success: true, data: users.map(u => ({ User_ID: u.User_ID, Email: u.Email, Role: u.Role, Name: u.Name })) };
}

function addUser(data) {
  const headers = ['User_ID', 'Email', 'Role', 'Name', 'Password'];
  if (!data.Email || !data.Role) return { success: false, error: 'Email and Role are required.' };
  const existing = getSheetData(SHEETS.USERS);
  if (existing.find(u => u.Email && u.Email.toString().toLowerCase() === data.Email.toLowerCase())) return { success: false, error: 'Email already exists.' };
  if (!data.User_ID) data.User_ID = generateId('USR');
  if (data.Password) data.Password = simpleHash(data.Password);
  appendRow(SHEETS.USERS, data, headers);
  return { success: true, message: 'User created.', userId: data.User_ID };
}

function updateUser(data) {
  const sheet = getSheet(SHEETS.USERS);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idIdx = headers.indexOf('User_ID');
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idIdx] === data.User_ID) {
      headers.forEach((h, j) => {
        if (data[h] !== undefined && h !== 'User_ID') {
          sheet.getRange(i + 1, j + 1).setValue(h === 'Password' ? simpleHash(data[h]) : data[h]);
        }
      });
      return { success: true, message: 'User updated.' };
    }
  }
  return { success: false, error: 'User not found.' };
}

// ============================================================
// INITIALIZATION – Run this ONCE
// ============================================================

function initializeSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetsConfig = {
    'Master_Data':        ['SKU', 'Product_Name', 'Category', 'Description', 'COGS', 'Standard_Price', 'Image_URL'],
    'Inventory_In':       ['Transaction_ID', 'Date_Received', 'SKU', 'Product_Name', 'Quantity', 'Batch_Number', 'Expiry_Date'],
    'Inventory_Out':      ['Transaction_ID', 'Date', 'SKU', 'Quantity', 'Reason', 'Reference_ID'],
    'Invoices':           ['Invoice_ID', 'Date_Created', 'Customer_Name', 'Total_Amount', 'Discount_Value', 'Discount_Type', 'Status', 'Payment_Due_Date'],
    'Invoice_Line_Items': ['Line_ID', 'Invoice_ID', 'SKU', 'Quantity', 'Unit_Price', 'Line_Total'],
    'Delivery_Orders':    ['DO_ID', 'Invoice_ID', 'Date_Created', 'Status', 'Payment_Status', 'Payment_Proof_URL'],
    'Expenses':           ['Expense_ID', 'Date', 'Category', 'Amount', 'Notes', 'Receipt_Image_URL'],
    'Users':              ['User_ID', 'Email', 'Role', 'Name', 'Password'],
    'Customers':          ['Customer_Name']
  };

  Object.entries(sheetsConfig).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  });

  // Default admin user
  const usersSheet = ss.getSheetByName('Users');
  if (usersSheet.getLastRow() <= 1) {
    usersSheet.appendRow(['USR-001', 'admin@selfmology.com', 'Admin', 'Administrator', simpleHash('admin123')]);
  }
  Logger.log('All sheets initialized successfully!');
}

// ============================================================
// SEED SAMPLE DATA – Run ONCE to populate starter data
// ============================================================

function seedSampleData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Products
  const md = ss.getSheetByName('Master_Data');
  if (md.getLastRow() <= 1) {
    md.appendRow(['SM-CLN-001', 'Gentle Foam Cleanser', 'Cleanser', 'Mild foaming cleanser for sensitive skin', 35000, 89000, '']);
    md.appendRow(['SM-TNR-001', 'Hydrating Toner', 'Toner', 'Alcohol-free hydrating toner with niacinamide', 28000, 79000, '']);
    md.appendRow(['SM-SRM-001', 'Vitamin C Serum', 'Serum', 'Brightening serum with 15% Vitamin C', 55000, 149000, '']);
    md.appendRow(['SM-MST-001', 'Daily Moisturizer SPF30', 'Moisturizer', 'Lightweight moisturizer with SPF', 42000, 119000, '']);
    md.appendRow(['SM-MSK-001', 'Clay Detox Mask', 'Mask', 'Deep cleansing clay mask with kaolin', 38000, 99000, '']);
    md.appendRow(['SM-EYE-001', 'Eye Cream Anti-Aging', 'Eye Care', 'Retinol-infused anti-aging eye cream', 65000, 179000, '']);
    Logger.log('✅ Products seeded');
  }

  // Inventory In
  const invIn = ss.getSheetByName('Inventory_In');
  if (invIn.getLastRow() <= 1) {
    invIn.appendRow(['IN-001', '2026-04-01', 'SM-CLN-001', 'Gentle Foam Cleanser', 200, 'B2026-01', '2028-04-01']);
    invIn.appendRow(['IN-002', '2026-04-01', 'SM-TNR-001', 'Hydrating Toner', 150, 'B2026-01', '2028-04-01']);
    invIn.appendRow(['IN-003', '2026-04-05', 'SM-SRM-001', 'Vitamin C Serum', 100, 'B2026-02', '2027-10-05']);
    invIn.appendRow(['IN-004', '2026-04-10', 'SM-MST-001', 'Daily Moisturizer SPF30', 180, 'B2026-02', '2028-04-10']);
    invIn.appendRow(['IN-005', '2026-04-15', 'SM-MSK-001', 'Clay Detox Mask', 80, 'B2026-03', '2028-01-15']);
    invIn.appendRow(['IN-006', '2026-04-20', 'SM-EYE-001', 'Eye Cream Anti-Aging', 60, 'B2026-03', '2027-10-20']);
    Logger.log('✅ Inventory In seeded');
  }

  // Inventory Out
  const invOut = ss.getSheetByName('Inventory_Out');
  if (invOut.getLastRow() <= 1) {
    invOut.appendRow(['OUT-001', '2026-04-05', 'SM-CLN-001', 50, 'Online Sales', 'Shopee']);
    invOut.appendRow(['OUT-002', '2026-04-08', 'SM-SRM-001', 30, 'Online Sales', 'Tokopedia']);
    invOut.appendRow(['OUT-003', '2026-04-12', 'SM-TNR-001', 45, 'B2B Sales', 'INV-00001']);
    invOut.appendRow(['OUT-004', '2026-04-15', 'SM-MST-001', 60, 'Online Sales', 'Shopee']);
    invOut.appendRow(['OUT-005', '2026-04-18', 'SM-CLN-001', 25, 'B2B Sales', 'INV-00002']);
    Logger.log('✅ Inventory Out seeded');
  }

  // Customers
  const cust = ss.getSheetByName('Customers');
  if (cust.getLastRow() <= 1) {
    cust.appendRow(['PT. Beauty Store Jakarta']);
    cust.appendRow(['CV. Glow Skincare Bandung']);
    cust.appendRow(['Toko Kecantikan Surabaya']);
    cust.appendRow(['UD. Cantik Bali']);
    cust.appendRow(['PT. Radiant Cosmetics']);
    Logger.log('✅ Customers seeded');
  }

  // Invoices
  const inv = ss.getSheetByName('Invoices');
  if (inv.getLastRow() <= 1) {
    inv.appendRow(['INV-00001', '2026-04-10', 'PT. Beauty Store Jakarta', 3555000, 0, 'fixed', 'Finalized', '2026-04-24']);
    inv.appendRow(['INV-00002', '2026-04-16', 'CV. Glow Skincare Bandung', 2225000, 100000, 'fixed', 'Finalized', '2026-04-30']);
    Logger.log('✅ Invoices seeded');
  }

  // Invoice Line Items
  const li = ss.getSheetByName('Invoice_Line_Items');
  if (li.getLastRow() <= 1) {
    li.appendRow(['INV-00001-L1', 'INV-00001', 'SM-TNR-001', 45, 79000, 3555000]);
    li.appendRow(['INV-00002-L1', 'INV-00002', 'SM-CLN-001', 25, 89000, 2225000]);
    Logger.log('✅ Line Items seeded');
  }

  // Delivery Orders
  const dos = ss.getSheetByName('Delivery_Orders');
  if (dos.getLastRow() <= 1) {
    dos.appendRow(['DO-001', 'INV-00001', '2026-04-10', 'Executed', 'Paid', '']);
    dos.appendRow(['DO-002', 'INV-00002', '2026-04-16', 'Pending', 'Unpaid', '']);
    Logger.log('✅ Delivery Orders seeded');
  }

  // Expenses
  const exp = ss.getSheetByName('Expenses');
  if (exp.getLastRow() <= 1) {
    exp.appendRow(['EXP-001', '2026-04-03', 'Packaging', 2500000, 'April packaging materials', '']);
    exp.appendRow(['EXP-002', '2026-04-10', 'Marketing', 5000000, 'Instagram influencer collaboration', '']);
    exp.appendRow(['EXP-003', '2026-04-15', 'Logistics', 1200000, 'Shipping cost with JNE', '']);
    exp.appendRow(['EXP-004', '2026-04-20', 'Office Supplies', 350000, 'Printer paper and stationery', '']);
    Logger.log('✅ Expenses seeded');
  }

  // Staff user
  const users = ss.getSheetByName('Users');
  if (users.getLastRow() <= 2) {
    users.appendRow(['USR-002', 'staff@selfmology.com', 'Staff', 'Staff Member', simpleHash('staff123')]);
    Logger.log('✅ Staff user seeded');
  }

  Logger.log('🎉 All sample data seeded successfully!');
}
