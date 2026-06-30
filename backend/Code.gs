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
  CUSTOMERS: 'Customers',
  ECOMMERCE_SALES: 'Ecommerce_Sales'
};

// Warehouse identifiers. Offline + Online are existing; Clinic (Express) is new.
// Stored as plain strings in Warehouse_Type columns, so adding this is non-breaking.
const WAREHOUSES = {
  OFFLINE: 'Warehouse',
  ONLINE: 'Online Warehouse',
  CLINIC: 'Clinic (Express)'
};

// E-commerce orders dated on/after this deduct stock. Orders before it are
// recorded for revenue/qty analytics only (no stock movement). Inclusive.
const ECOMMERCE_STOCK_CUTOVER = '2026-06-25';

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
      case 'getEcommerceOrderIds': result = getEcommerceOrderIds(); break;
      case 'resetOnlineTransactions': result = resetOnlineTransactions(); break;
      case 'moveStock':           result = moveStock(data); break;
      case 'getStockSummary':     result = { success: true, data: getStockSummaryInternal() }; break;
      case 'getInvoices':         result = getInvoices(); break;
      case 'createInvoice':       result = createInvoice(data); break;
      case 'updateInvoice':       result = updateInvoice(data); break;
      case 'finalizeInvoice':     result = finalizeInvoice(data); break;
      case 'deleteInvoice':       result = deleteInvoice(data); break;
      case 'cancelInvoice':       result = cancelInvoice(data); break;
      case 'getNextInvoiceId':    result = { success: true, nextId: getNextId('INV') }; break;
      case 'getLineItems':        result = getLineItems(data); break;
      case 'getDeliveryOrders':   result = getDeliveryOrders(); break;
      case 'createDeliveryOrder': result = createDeliveryOrder(data); break;
      case 'executeDeliveryOrder':result = executeDeliveryOrder(data); break;
      case 'updatePaymentStatus': result = updatePaymentStatus(data); break;
      case 'getExpenses':         result = getExpenses(); break;
      case 'addExpense':          result = addExpense(data); break;
      case 'bulkAddExpenses':     result = bulkAddExpenses(data); break;
      case 'uploadFileToDrive':   result = uploadFileToDrive(data); break;
      case 'getCustomers':        result = getCustomers(); break;
      case 'getDashboardData':    result = getDashboardData(data); break;
      case 'getUsers':            result = getUsers(); break;
      case 'addUser':             result = addUser(data); break;
      case 'updateUser':          result = updateUser(data); break;
      case 'deleteUser':          result = deleteUser(data); break;
      case 'addCustomer':         result = addCustomer(data); break;
      case 'updateCustomer':      result = updateCustomer(data); break;
      case 'generateDummyData':   result = generateDummyData(); break;
      case 'migrateSchemaV2':     result = migrateSchemaV2(); break;
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

// Safely make sure a sheet has the given header columns. Missing ones are
// APPENDED at the end of the header row — existing columns, order, and data
// are never touched. This is what keeps new fields backward-compatible: read
// (getSheetData) is header-name based, and writes (appendRow) stay aligned
// because both code and sheet grow at the end.
function ensureColumns(sheetName, requiredHeaders) {
  const sheet = getSheet(sheetName);
  if (!sheet) return;
  const lastCol = sheet.getLastColumn();
  const existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const toAdd = requiredHeaders.filter(h => existing.indexOf(h) === -1);
  if (toAdd.length > 0) {
    sheet.getRange(1, existing.length + 1, 1, toAdd.length).setValues([toAdd]);
  }
}

// One-shot migration to add every new column this version introduces.
// Safe to run repeatedly (idempotent). Call from the Apps Script editor once
// after pasting the new code, or it runs lazily on first dashboard load.
function migrateSchemaV2() {
  ensureColumns(SHEETS.INVOICES, ['Payment_Date']);
  ensureColumns(SHEETS.DELIVERY_ORDERS, ['Payment_Date']);
  ensureColumns(SHEETS.ECOMMERCE_SALES, ['Net_Revenue', 'Warehouse_Type']);
  return { success: true, message: 'Schema ensured (Payment_Date, Net_Revenue, Warehouse_Type).' };
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
  
  try {
    setupDailyTrigger();
  } catch (err) {
    Logger.log('Daily trigger setup failed: ' + err.message);
  }

  return { success: true, user: { userId: user.User_ID, email: user.Email, role: user.Role, name: user.Name || user.Email } };
}

// ============================================================
// MASTER DATA
// ============================================================

function getMasterData() { return { success: true, data: getSheetData(SHEETS.MASTER_DATA) }; }

function addProduct(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const headers = ['SKU', 'Product_Name', 'Category', 'Description', 'COGS', 'Standard_Price', 'Image_URL'];
    if (!data.SKU || !data.Product_Name) return { success: false, error: 'SKU and Product Name are required.' };
    const existing = getSheetData(SHEETS.MASTER_DATA);
    if (existing.find(p => p.SKU === data.SKU)) return { success: false, error: 'SKU already exists.' };
    appendRow(SHEETS.MASTER_DATA, data, headers);
    return { success: true, message: 'Product added successfully.' };
  } catch (err) {
    return { success: false, error: 'Database busy: ' + err.message };
  } finally {
    lock.releaseLock();
  }
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
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    // Warehouse_Type: 'Warehouse' (Offline) or 'Online Warehouse'
    const headers = ['Transaction_ID', 'Date_Received', 'SKU', 'Product_Name', 'Quantity', 'Batch_Number', 'Expiry_Date', 'Warehouse_Type', 'Location'];
    if (data.SKU && !data.Product_Name) {
      const products = getSheetData(SHEETS.MASTER_DATA);
      const product = products.find(p => p.SKU === data.SKU);
      if (product) data.Product_Name = product.Product_Name;
    }
    if (!data.Transaction_ID) data.Transaction_ID = generateId('IN');
    if (!data.Date_Received) data.Date_Received = formatDate();
    if (!data.Warehouse_Type) data.Warehouse_Type = 'Warehouse'; // Default to Offline
    data.Quantity = Number(data.Quantity) || 0;
    appendRow(SHEETS.INVENTORY_IN, data, headers);
    return { success: true, message: 'Stock In recorded.', transactionId: data.Transaction_ID };
  } catch (err) {
    return { success: false, error: 'Database busy: ' + err.message };
  } finally {
    lock.releaseLock();
  }
}

function getInventoryOut() { return { success: true, data: getSheetData(SHEETS.INVENTORY_OUT) }; }

function addInventoryOut(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const headers = ['Transaction_ID', 'Date', 'SKU', 'Quantity', 'Reason', 'Reference_ID', 'Batch_Number', 'Warehouse_Type'];
    if (!data.Transaction_ID) data.Transaction_ID = generateId('OUT');
    if (!data.Date) data.Date = formatDate();
    if (!data.Warehouse_Type) data.Warehouse_Type = 'Warehouse';
    data.Quantity = Number(data.Quantity) || 0;

    // Check availability for Offline + Clinic (both are physically managed and
    // must not go negative). Online keeps allowing negatives (CSV opname flow).
    if (data.Warehouse_Type === WAREHOUSES.OFFLINE || data.Warehouse_Type === WAREHOUSES.CLINIC) {
      const summary = getStockSummaryInternal();
      const available = summary.find(s => s.SKU === data.SKU && s.Warehouse_Type === data.Warehouse_Type && s.Batch_Number === data.Batch_Number);
      const currentQty = available ? available.Qty : 0;
      if (currentQty < data.Quantity) {
        return { success: false, error: `Insufficient stock in ${data.Warehouse_Type} for Batch ${data.Batch_Number}. Available: ${currentQty}` };
      }
    }

    appendRow(SHEETS.INVENTORY_OUT, data, headers);
    return { success: true, message: 'Stock Out recorded.', transactionId: data.Transaction_ID };
  } catch (err) {
    return { success: false, error: 'Database busy: ' + err.message };
  } finally {
    lock.releaseLock();
  }
}

function moveStock(data) {
  // data: { SKU, Quantity, Batch_Number, From_Warehouse, To_Warehouse }
  const outResult = addInventoryOut({
    SKU: data.SKU,
    Quantity: data.Quantity,
    Batch_Number: data.Batch_Number,
    Warehouse_Type: data.From_Warehouse,
    Reason: 'Stock Move Out',
    Reference_ID: `MOVE-${data.To_Warehouse}`
  });

  if (!outResult.success) return outResult;

  const inResult = addInventoryIn({
    SKU: data.SKU,
    Quantity: data.Quantity,
    Batch_Number: data.Batch_Number,
    Warehouse_Type: data.To_Warehouse,
    Reason: 'Stock Move In',
    Reference_ID: `MOVE-${data.From_Warehouse}`
  });

  return inResult;
}

// Returns existing `${Order_ID}|${SKU}` keys so the CSV importer can skip
// already-imported lines (works for pre-cutover revenue-only rows too).
function getEcommerceOrderIds() {
  const sales = getSheetData(SHEETS.ECOMMERCE_SALES) || [];
  const ids = sales.map(s => `${String(s.Order_ID || '').trim()}|${String(s.SKU || '').trim()}`);
  return { success: true, data: ids };
}

function bulkAddInventoryOut(data) {
  const rows = data.rows || [];
  const rawSales = data.rawSales || [];
  if (!rows.length && !rawSales.length) return { success: false, error: 'No rows or sales provided.' };
  
  // 1. Write stock ledger deductions to Inventory_Out
  if (rows.length > 0) {
    const sheet = getSheet(SHEETS.INVENTORY_OUT);
    const headers = ['Transaction_ID', 'Date', 'SKU', 'Quantity', 'Reason', 'Reference_ID', 'Batch_Number', 'Warehouse_Type'];
    const newRows = rows.map(row => {
      if (!row.Transaction_ID) row.Transaction_ID = generateId('OUT');
      if (!row.Date) row.Date = formatDate(row.Date);
      if (!row.Warehouse_Type) row.Warehouse_Type = 'Online Warehouse'; // CSV is for online
      row.Quantity = Number(row.Quantity) || 0;
      return headers.map(h => row[h] !== undefined ? row[h] : '');
    });
    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
    }
  }
  
  // 2. Write raw sales transactions to Ecommerce_Sales for future analysis
  if (rawSales.length > 0) {
    let salesSheet = getSheet(SHEETS.ECOMMERCE_SALES);
    if (!salesSheet) {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      salesSheet = ss.insertSheet(SHEETS.ECOMMERCE_SALES);
    }
    
    // Define standard headers for ecommerce sales.
    // Net_Revenue = Harga Setelah Diskon - Voucher Ditanggung Penjual (income basis).
    // Warehouse_Type = routed warehouse (Online / Clinic Express) for this order.
    const salesHeaders = [
      'Order_ID', 'Date', 'Channel', 'SKU', 'Product_Name',
      'Variation_Name', 'Quantity', 'Raw_Quantity',
      'Price', 'Total_Price', 'Status', 'Shipping_Carrier',
      'Import_Date', 'Net_Revenue', 'Warehouse_Type'
    ];

    // Check if sheet is brand new (needs headers)
    if (salesSheet.getLastRow() === 0) {
      salesSheet.getRange(1, 1, 1, salesHeaders.length).setValues([salesHeaders]);
    } else {
      // Existing sheet: append any missing new columns without disturbing data
      ensureColumns(SHEETS.ECOMMERCE_SALES, ['Net_Revenue', 'Warehouse_Type']);
    }
    
    const importDateStr = formatDate(new Date());
    const salesRows = rawSales.map(s => {
      s.Import_Date = importDateStr;
      return salesHeaders.map(h => s[h] !== undefined ? s[h] : '');
    });
    
    salesSheet.getRange(salesSheet.getLastRow() + 1, 1, salesRows.length, salesHeaders.length).setValues(salesRows);
  }
  
  return { success: true, message: rows.length + ' deductions and ' + rawSales.length + ' sales records processed.', count: rows.length };
}

function resetOnlineTransactions() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = getSheet(SHEETS.INVENTORY_OUT);
    if (!sheet) return { success: false, error: 'Inventory Out sheet not found.' };
    
    const allData = sheet.getDataRange().getValues();
    if (allData.length <= 1) {
      return { success: true, message: 'No inventory out records to reset.', removedCount: 0 };
    }
    
    const headers = allData[0];
    const reasonIdx = headers.indexOf('Reason');
    const whIdx = headers.indexOf('Warehouse_Type');
    
    if (reasonIdx === -1 || whIdx === -1) {
      return { success: false, error: 'Required columns (Reason, Warehouse_Type) not found in Inventory_Out.' };
    }
    
    const newRows = [headers];
    let removedCount = 0;
    
    for (let i = 1; i < allData.length; i++) {
      const reason = allData[i][reasonIdx];
      const wh = allData[i][whIdx];
      if (reason === 'Online Sales' && wh === 'Online Warehouse') {
        removedCount++;
      } else {
        newRows.push(allData[i]);
      }
    }
    
    // Clear and rewrite sheet contents
    sheet.clearContent();
    sheet.getRange(1, 1, newRows.length, headers.length).setValues(newRows);
    
    return { 
      success: true, 
      message: 'Successfully reset and reversed ' + removedCount + ' online stock deductions.', 
      removedCount: removedCount 
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

function getStockSummaryInternal() {
  const invIn = getSheetData(SHEETS.INVENTORY_IN);
  const invOut = getSheetData(SHEETS.INVENTORY_OUT);
  const summaryMap = {};

  invIn.forEach(r => {
    const key = `${r.SKU}|${r.Batch_Number}|${r.Warehouse_Type}`;
    if (!summaryMap[key]) summaryMap[key] = { SKU: r.SKU, Batch_Number: r.Batch_Number, Warehouse_Type: r.Warehouse_Type, Qty: 0, Expiry_Date: r.Expiry_Date };
    summaryMap[key].Qty += Number(r.Quantity);
  });

  invOut.forEach(r => {
    const key = `${r.SKU}|${r.Batch_Number}|${r.Warehouse_Type}`;
    if (summaryMap[key]) {
      summaryMap[key].Qty -= Number(r.Quantity);
    } else {
      // For Online Warehouse, we allow negative, so initialize if not found
      summaryMap[key] = { SKU: r.SKU, Batch_Number: r.Batch_Number, Warehouse_Type: r.Warehouse_Type, Qty: -Number(r.Quantity) };
    }
  });

  return Object.values(summaryMap);
}

// ============================================================
// INVOICES
// ============================================================

function getInvoices() { return { success: true, data: getSheetData(SHEETS.INVOICES) }; }

function createInvoice(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const { header, lineItems } = data;
    if (!header.Invoice_ID) {
      header.Invoice_ID = header.Status === 'Draft' ? 'DRAFT-' + generateId('') : getNextId('INV');
    }
    if (!header.Date_Created) header.Date_Created = formatDate();
    if (!header.Status) header.Status = 'Draft';
    const created = new Date(header.Date_Created);
    const due = new Date(created.getTime() + 14 * 24 * 60 * 60 * 1000);
    header.Payment_Due_Date = formatDate(due);

    let total = 0;
    const lineHeaders = ['Line_ID', 'Invoice_ID', 'SKU', 'Quantity', 'Unit_Price', 'Discount', 'Discount_Type', 'Discount_Value', 'Line_Total'];
    if (lineItems && lineItems.length > 0) {
      const lineSheet = getSheet(SHEETS.INVOICE_LINE_ITEMS);
      const newLineRows = lineItems.map((item, idx) => {
        item.Line_ID = header.Invoice_ID + '-L' + (idx + 1);
        item.Invoice_ID = header.Invoice_ID;
        item.Quantity = Number(item.Quantity) || 0;
        item.Unit_Price = Number(item.Unit_Price) || 0;
        item.Discount_Type = item.Discount_Type || 'fixed';
        item.Discount_Value = Number(item.Discount_Value) || 0;
        
        const subtotal = item.Quantity * item.Unit_Price;
        if (item.Discount_Type === 'percentage') {
          item.Discount = subtotal * (item.Discount_Value / 100);
        } else {
          // Per unit discount: Discount_Value * Quantity
          item.Discount = item.Discount_Value * item.Quantity;
        }
        
        item.Line_Total = subtotal - item.Discount;
        total += item.Line_Total;
        return lineHeaders.map(h => item[h] || '');
      });
      if (newLineRows.length > 0) lineSheet.getRange(lineSheet.getLastRow() + 1, 1, newLineRows.length, lineHeaders.length).setValues(newLineRows);
    }

    header.Total_Amount = total;
    header.Discount_Value = 0;
    header.Discount_Type = 'itemized';

    const invoiceHeaders = ['Invoice_ID', 'Date_Created', 'Customer_Name', 'Total_Amount', 'Discount_Value', 'Discount_Type', 'Status', 'Payment_Due_Date', 'Payment_Status'];
    appendRow(SHEETS.INVOICES, header, invoiceHeaders);

    if (header.Customer_Name) {
      const customers = getSheetData(SHEETS.CUSTOMERS);
      if (!customers.find(c => c.Customer_Name === header.Customer_Name)) {
        appendRow(SHEETS.CUSTOMERS, { Customer_Name: header.Customer_Name }, ['Customer_Name']);
      }
    }

    return { success: true, message: 'Invoice created.', invoiceId: header.Invoice_ID };
  } catch (err) {
    return { success: false, error: 'Database busy: ' + err.message };
  } finally {
    lock.releaseLock();
  }
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
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getSheet(SHEETS.INVOICES);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idIdx = headers.indexOf('Invoice_ID');
    const statusIdx = headers.indexOf('Status');

    for (let i = 1; i < allData.length; i++) {
      if (allData[i][idIdx] === data.Invoice_ID) {
        if (allData[i][statusIdx] === 'Finalized') return { success: false, error: 'Already finalized.' };
        const newId = getNextId('INV');
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
  } catch (err) {
    return { success: false, error: 'Database busy: ' + err.message };
  } finally {
    lock.releaseLock();
  }
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
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const headers = ['DO_ID', 'Invoice_ID', 'Date_Created', 'Status', 'Payment_Status', 'Payment_Proof_URL', 'Shipping_Address', 'Payment_Date'];
    if (!data.Invoice_ID) return { success: false, error: 'Invoice_ID is required.' };
    const existing = getSheetData(SHEETS.DELIVERY_ORDERS);
    if (existing.find(d => d.Invoice_ID === data.Invoice_ID)) return { success: false, error: 'DO already exists for this invoice.' };
    if (!data.DO_ID) {
      if (data.Invoice_ID.startsWith('INV-')) {
        data.DO_ID = data.Invoice_ID.replace('INV-', 'DO-');
      } else {
        data.DO_ID = 'DO-' + data.Invoice_ID;
      }
    }
    if (!data.Date_Created) data.Date_Created = formatDate();
    data.Status = 'Pending';
    data.Payment_Status = 'Unpaid';
    data.Payment_Proof_URL = '';
    data.Payment_Date = '';
    appendRow(SHEETS.DELIVERY_ORDERS, data, headers);
    return { success: true, message: 'Delivery Order created.', doId: data.DO_ID };
  } catch (err) {
    return { success: false, error: 'Database busy: ' + err.message };
  } finally {
    lock.releaseLock();
  }
}

function executeDeliveryOrder(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const doSheet = getSheet(SHEETS.DELIVERY_ORDERS);
    const doData = doSheet.getDataRange().getValues();
    const dh = doData[0];
    const doIdIdx = dh.indexOf('DO_ID'), doStatusIdx = dh.indexOf('Status'), doInvIdx = dh.indexOf('Invoice_ID');
    let shipIdx = dh.indexOf('Shipping_Address');
    if (shipIdx === -1) {
      shipIdx = 6;
      doSheet.getRange(1, 7).setValue('Shipping_Address');
    }
    let doRow = -1, invoiceId = '';
    for (let i = 1; i < doData.length; i++) {
      if (doData[i][doIdIdx] === data.DO_ID) {
        if (doData[i][doStatusIdx] === 'Executed') return { success: false, error: 'Already executed.' };
        doRow = i; invoiceId = doData[i][doInvIdx]; break;
      }
    }
    if (doRow === -1) return { success: false, error: 'DO not found.' };

    doSheet.getRange(doRow + 1, doStatusIdx + 1).setValue('Executed');
    if (data.Shipping_Address) {
      doSheet.getRange(doRow + 1, shipIdx + 1).setValue(data.Shipping_Address);
    }
    const lineItems = getSheetData(SHEETS.INVOICE_LINE_ITEMS).filter(li => li.Invoice_ID === invoiceId);
    if (lineItems.length === 0) return { success: false, error: 'No line items for ' + invoiceId };

    const outSheet = getSheet(SHEETS.INVENTORY_OUT);
    const outHeaders = ['Transaction_ID', 'Date', 'SKU', 'Quantity', 'Reason', 'Reference_ID', 'Batch_Number', 'Warehouse_Type'];
    const today = formatDate();
    const newRows = [];

    if (data.items && data.items.length > 0) {
      data.items.forEach(li => {
        newRows.push([generateId('OUT'), today, li.SKU, Number(li.Quantity) || 0, 'B2B Sales', data.DO_ID, li.Batch_Number || '', li.Warehouse_Type || 'Warehouse']);
      });
    } else {
      lineItems.forEach(li => {
        newRows.push([generateId('OUT'), today, li.SKU, Number(li.Quantity) || 0, 'B2B Sales', data.DO_ID, '', 'Warehouse']);
      });
    }

    if (newRows.length > 0) outSheet.getRange(outSheet.getLastRow() + 1, 1, newRows.length, outHeaders.length).setValues(newRows);
    return { success: true, message: 'DO executed. ' + newRows.length + ' item(s) deducted.', inventoryOutCount: newRows.length };
  } catch (err) {
    return { success: false, error: 'Database busy: ' + err.message };
  } finally {
    lock.releaseLock();
  }
}

function updatePaymentStatus(data) {
  const sheet = getSheet(SHEETS.DELIVERY_ORDERS);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idIdx = headers.indexOf('DO_ID');
  const payIdx = headers.indexOf('Payment_Status');
  const proofIdx = headers.indexOf('Payment_Proof_URL');
  const dateIdx = headers.indexOf('Payment_Date');
  const invIdx = headers.indexOf('Invoice_ID');

  let invoiceId = '';
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idIdx] === data.DO_ID) {
      if (payIdx >= 0) sheet.getRange(i + 1, payIdx + 1).setValue(data.Payment_Status || 'Unpaid');
      if (proofIdx >= 0 && data.Payment_Proof_URL) sheet.getRange(i + 1, proofIdx + 1).setValue(data.Payment_Proof_URL);
      if (dateIdx >= 0 && data.Payment_Date !== undefined) sheet.getRange(i + 1, dateIdx + 1).setValue(data.Payment_Date);
      
      if (invIdx >= 0) {
        invoiceId = allData[i][invIdx];
      }
      
      // Sync payment status to Invoices sheet
      if (invoiceId) {
        const invSheet = getSheet(SHEETS.INVOICES);
        if (invSheet) {
          const invData = invSheet.getDataRange().getValues();
          const invHeaders = invData[0];
          const invIdIdx = invHeaders.indexOf('Invoice_ID');
          const invPayIdx = invHeaders.indexOf('Payment_Status');
          if (invIdIdx >= 0 && invPayIdx >= 0) {
            for (let j = 1; j < invData.length; j++) {
              if (invData[j][invIdIdx] === invoiceId) {
                invSheet.getRange(j + 1, invPayIdx + 1).setValue(data.Payment_Status || 'Unpaid');
                break;
              }
            }
          }
        }
      }
      
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
  const headers = ['Expense_ID', 'Date', 'Item', 'Amount', 'Category', 'Debited_From', 'Credited_To', 'Remarks', 'Invoice_Link', 'Payment_Proof_Link', 'Executed', 'Month', 'Year'];
  if (!data.Expense_ID) data.Expense_ID = generateId('EXP');
  if (!data.Date) data.Date = formatDate();
  
  // Automatically calculate Month and Year from Date
  try {
    const dateObj = new Date(data.Date);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    if (!data.Month) data.Month = months[dateObj.getMonth()];
    if (!data.Year) data.Year = String(dateObj.getFullYear());
  } catch (e) {
    if (!data.Month) data.Month = '';
    if (!data.Year) data.Year = '';
  }

  data.Amount = Number(data.Amount) || 0;
  appendRow(SHEETS.EXPENSES, data, headers);
  return { success: true, message: 'Expense recorded.', expenseId: data.Expense_ID };
}

function bulkAddExpenses(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const rows = data.rows || [];
    if (!rows.length) return { success: false, error: 'No rows provided.' };
    
    const sheet = getSheet(SHEETS.EXPENSES);
    const headers = ['Expense_ID', 'Date', 'Item', 'Amount', 'Category', 'Debited_From', 'Credited_To', 'Remarks', 'Invoice_Link', 'Payment_Proof_Link', 'Executed', 'Month', 'Year'];
    
    if (data.overwrite) {
      if (sheet.getLastRow() >= 2) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
      }
    }
    
    // Process rows and make sure Month and Year are populated
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const newRows = rows.map((row, idx) => {
      if (!row.Expense_ID) {
        row.Expense_ID = 'EXP-' + String(1001 + idx).padStart(4, '0');
      }
      row.Amount = Number(row.Amount) || 0;
      row.Executed = row.Executed === true || row.Executed === 'true' || row.Executed === 'YES' || row.Executed === 'checked';
      
      if (row.Date) {
        try {
          const dateObj = new Date(row.Date);
          if (!row.Month) row.Month = months[dateObj.getMonth()];
          if (!row.Year) row.Year = String(dateObj.getFullYear());
        } catch (e) {}
      }
      
      return headers.map(h => row[h] !== undefined ? row[h] : '');
    });
    
    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
    }
    return { success: true, message: newRows.length + ' expenses imported successfully.' };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

function uploadFileToDrive(data) {
  try {
    const { fileData, fileName, folderId } = data;
    if (!fileData || !fileName || !folderId) {
      return { success: false, error: 'fileData, fileName, and folderId are required.' };
    }
    
    const folder = DriveApp.getFolderById(folderId);
    const splitData = fileData.split(',');
    const contentType = splitData[0].match(/:(.*?);/)[1];
    const rawData = splitData[1];
    const decodedData = Utilities.base64Decode(rawData);
    const blob = Utilities.newBlob(decodedData, contentType, fileName);
    const file = folder.createFile(blob);
    
    // Set file visibility to public link so anyone inside the ERP can open it
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return { success: true, url: file.getUrl() };
  } catch (err) {
    return { success: false, error: 'Drive upload error: ' + err.message };
  }
}

// ============================================================
// CUSTOMERS
// ============================================================

function getCustomers() { return { success: true, data: getSheetData(SHEETS.CUSTOMERS) }; }

// ============================================================
// DASHBOARD
// ============================================================

function getDashboardData(options) {
  options = options || {};
  // Lazily ensure new columns exist (idempotent, safe). Wrapped so a failure
  // here can never break the dashboard.
  try { migrateSchemaV2(); } catch (e) {}

  const master = getSheetData(SHEETS.MASTER_DATA);
  const invSummary = getStockSummaryInternal();
  const invoices = getSheetData(SHEETS.INVOICES);
  const invOut = getSheetData(SHEETS.INVENTORY_OUT);
  const deliveryOrders = getSheetData(SHEETS.DELIVERY_ORDERS);
  const ecommerceSales = getSheetData(SHEETS.ECOMMERCE_SALES) || [];
  const expensesData = getSheetData(SHEETS.EXPENSES) || [];

  const now = new Date();
  const todayStr = formatDate(now);

  // Default range = month-to-date (1st of current month → today) so the
  // dashboard shows the current month on login, not all-time totals.
  const channelFilter = options.channel || '';
  let dateFrom = options.dateFrom || '';
  let dateTo = options.dateTo || '';
  if (!dateFrom && !dateTo) {
    dateFrom = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    dateTo = todayStr;
  }
  
  // Pending Invoices logic - check both Invoices and Delivery Orders sheets
  const pendingInvoices = invoices.filter(inv => {
    if (inv.Status !== 'Finalized') return false;
    const doItem = deliveryOrders.find(d => String(d.Invoice_ID).trim() === String(inv.Invoice_ID).trim());
    const isPaid = (doItem && doItem.Payment_Status === 'Paid') || inv.Payment_Status === 'Paid';
    return !isPaid;
  });
  const overdueCount = pendingInvoices.filter(inv => inv.Payment_Due_Date && inv.Payment_Due_Date < todayStr).length;
  
  // Sort pending invoices: Earliest due date first, then newest created
  pendingInvoices.sort((a, b) => {
    const dueA = new Date(a.Payment_Due_Date || a.Date_Created).getTime();
    const dueB = new Date(b.Payment_Due_Date || b.Date_Created).getTime();
    if (dueA !== dueB) return dueA - dueB;
    return new Date(b.Date_Created).getTime() - new Date(a.Date_Created).getTime();
  });
  const topPendingInvoices = pendingInvoices.slice(0, 5);

  const stockDetails = master.map(p => {
    const skuSummary = invSummary.filter(s => String(s.SKU).trim() === String(p.SKU).trim());
    const sumWh = (wh) => skuSummary.filter(s => String(s.Warehouse_Type).trim() === wh).reduce((sum, s) => sum + (Number(s.Qty) || 0), 0);
    const offlineQty = sumWh(WAREHOUSES.OFFLINE);
    const clinicQty = sumWh(WAREHOUSES.CLINIC);
    // Online = everything that isn't Offline or Clinic (keeps legacy values working)
    const onlineQty = skuSummary
      .filter(s => { const w = String(s.Warehouse_Type).trim(); return w !== WAREHOUSES.OFFLINE && w !== WAREHOUSES.CLINIC; })
      .reduce((sum, s) => sum + (Number(s.Qty) || 0), 0);
    return {
      SKU: p.SKU,
      Product_Name: p.Product_Name,
      offlineStock: offlineQty,
      onlineStock: onlineQty,
      clinicStock: clinicQty
    };
  });

  const lowStockOnlineCount = stockDetails.filter(s => s.onlineStock < 10).length;

  // ---- Top selling (qty) ----
  // B2B qty comes from Inventory_Out (Reason 'B2B Sales'); online qty comes from
  // Ecommerce_Sales (all dates). We deliberately do NOT read Inventory_Out
  // 'Online Sales' rows here, because the same orders already live in
  // Ecommerce_Sales — that would double-count post-cutover sales.
  const salesMap = {};
  const addSale = (sku, qty) => {
    if (!sku) return;
    if (!salesMap[sku]) salesMap[sku] = { SKU: sku, totalSold: 0 };
    salesMap[sku].totalSold += Number(qty) || 0;
  };

  if (channelFilter !== 'online') {
    invOut.forEach(r => {
      if (r.Reason !== 'B2B Sales') return;
      const rDate = r.Date ? formatDate(r.Date) : '';
      if (dateFrom && rDate < dateFrom) return;
      if (dateTo && rDate > dateTo) return;
      addSale(r.SKU, r.Quantity);
    });
  }
  if (channelFilter !== 'b2b') {
    ecommerceSales.forEach(r => {
      const status = String(r.Status || '').toLowerCase();
      if (status.indexOf('batal') !== -1) return; // exclude cancelled
      const rDate = r.Date ? formatDate(r.Date) : '';
      if (dateFrom && rDate < dateFrom) return;
      if (dateTo && rDate > dateTo) return;
      addSale(r.SKU, r.Quantity);
    });
  }
  const topSelling = Object.values(salesMap).sort((a, b) => b.totalSold - a.totalSold).slice(0, 10)
    .map(s => ({ ...s, Product_Name: master.find(m => m.SKU === s.SKU)?.Product_Name || s.SKU }));

  // Expiry check (< 1 year)
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  const expiringBatches = invSummary.filter(s => {
    if (!s.Expiry_Date || s.Qty <= 0) return false;
    const expDate = new Date(s.Expiry_Date);
    return expDate < oneYearFromNow;
  }).map(s => ({
    ...s,
    Product_Name: master.find(m => m.SKU === s.SKU)?.Product_Name || s.SKU
  }));

  // ---- Expenses (month-to-date, excluding 'Investment') ----
  let totalExpenses = 0;
  const expenseBreakdownMap = {};
  expensesData.forEach(e => {
    const category = String(e.Category || '').trim();
    if (category.toLowerCase() === 'investment') return;
    const eDate = e.Date ? formatDate(e.Date) : '';
    if (dateFrom && eDate < dateFrom) return;
    if (dateTo && eDate > dateTo) return;
    const amount = Number(e.Amount) || 0;
    totalExpenses += amount;
    const catName = category || 'Other';
    expenseBreakdownMap[catName] = (expenseBreakdownMap[catName] || 0) + amount;
  });
  const expenseBreakdown = Object.keys(expenseBreakdownMap)
    .map(cat => ({ Category: cat, Amount: expenseBreakdownMap[cat] }))
    .sort((a, b) => b.Amount - a.Amount);

  // ---- Cashflow: Income vs Expense, last 12 months ----
  const cashflow = computeCashflowSeries({
    months: 12, now: now,
    invoices: invoices, deliveryOrders: deliveryOrders,
    ecommerceSales: ecommerceSales, expensesData: expensesData
  });
  const thisMonthKey = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');
  const thisMonthCash = cashflow.find(c => c.month === thisMonthKey) || { income: 0, expense: 0 };

  return {
    success: true,
    data: {
      totalSKUs: master.length,
      totalStockUnits: stockDetails.reduce((sum, s) => sum + s.offlineStock + s.onlineStock + (s.clinicStock || 0), 0),
      lowStockOnlineCount: lowStockOnlineCount,
      overdueCount: overdueCount,
      stockDetails: stockDetails,
      topPendingInvoices: topPendingInvoices,
      topSelling: topSelling,
      expiringBatches: expiringBatches,
      totalExpenses: totalExpenses,
      totalIncome: thisMonthCash.income,
      expenseBreakdown: expenseBreakdown,
      cashflow: cashflow,
      dateFrom: dateFrom,
      dateTo: dateTo
    }
  };
}

// Build a [{month:'YYYY-MM', label:'Mon yy', income, expense}] series for the
// last N months. Income = online (Ecommerce_Sales, 'Selesai' net revenue) +
// B2B (paid invoices, placed by payment-received date). Expense excludes
// 'Investment' to match the operational expense figure used elsewhere.
function computeCashflowSeries(args) {
  const now = args.now;
  const invoices = args.invoices || [];
  const deliveryOrders = args.deliveryOrders || [];
  const ecommerceSales = args.ecommerceSales || [];
  const expensesData = args.expensesData || [];
  const months = args.months || 12;
  const tz = Session.getScriptTimeZone();
  const monthKeyOf = (d) => { try { return Utilities.formatDate(new Date(d), tz, 'yyyy-MM'); } catch (e) { return ''; } };

  const buckets = {};
  const order = [];
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = Utilities.formatDate(dt, tz, 'yyyy-MM');
    buckets[key] = { month: key, label: Utilities.formatDate(dt, tz, 'MMM yy'), income: 0, expense: 0 };
    order.push(key);
  }
  const addIncome = (dateStr, amt) => { const k = monthKeyOf(dateStr); if (buckets[k]) buckets[k].income += Number(amt) || 0; };
  const addExpense = (dateStr, amt) => { const k = monthKeyOf(dateStr); if (buckets[k]) buckets[k].expense += Number(amt) || 0; };

  // Online income: completed ('Selesai') only, net revenue.
  ecommerceSales.forEach(r => {
    const status = String(r.Status || '').toLowerCase();
    if (status.indexOf('selesai') === -1 && status.indexOf('completed') === -1) return;
    let net = Number(r.Net_Revenue);
    if (!(net || net === 0)) net = Number(r.Total_Price) || 0;
    if (isNaN(net)) net = 0;
    addIncome(r.Date, net);
  });

  // B2B income: paid invoices, dated by payment received (DO Payment_Date) or
  // invoice creation date as fallback.
  const doByInvoice = {};
  deliveryOrders.forEach(d => { const inv = String(d.Invoice_ID || '').trim(); if (inv) doByInvoice[inv] = d; });
  invoices.forEach(inv => {
    if (String(inv.Status || '') === 'Cancelled') return;
    const doItem = doByInvoice[String(inv.Invoice_ID || '').trim()];
    const isPaid = (doItem && doItem.Payment_Status === 'Paid') || inv.Payment_Status === 'Paid';
    if (!isPaid) return;
    const payDate = (doItem && doItem.Payment_Date) ? doItem.Payment_Date : inv.Date_Created;
    addIncome(payDate, Number(inv.Total_Amount) || 0);
  });

  // Expense: exclude Investment
  expensesData.forEach(e => {
    if (String(e.Category || '').trim().toLowerCase() === 'investment') return;
    addExpense(e.Date, Number(e.Amount) || 0);
  });

  return order.map(k => buckets[k]);
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

function deleteUser(data) {
  const sheet = getSheet(SHEETS.USERS);
  const allData = sheet.getDataRange().getValues();
  const idIdx = allData[0].indexOf('User_ID');
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idIdx] === data.User_ID) {
      if (data.User_ID === 'USR-001') return { success: false, error: 'Cannot delete the primary admin account.' };
      sheet.deleteRow(i + 1);
      return { success: true, message: 'User deleted.' };
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
    'Delivery_Orders':    ['DO_ID', 'Invoice_ID', 'Date_Created', 'Status', 'Payment_Status', 'Payment_Proof_URL', 'Shipping_Address', 'Payment_Date'],
    'Expenses':           ['Expense_ID', 'Date', 'Item', 'Amount', 'Category', 'Debited_From', 'Credited_To', 'Remarks', 'Invoice_Link', 'Payment_Proof_Link', 'Executed', 'Month', 'Year'],
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

  // Products (Real Case)
  const md = ss.getSheetByName('Master_Data');
  if (md.getLastRow() <= 1) {
    md.appendRow(['SM-OCC-100', 'Oil Control Cleanser', 'Cleanser', 'Deeply cleanses and controls excessive sebum production', 45000, 89000, '']);
    md.appendRow(['SM-CT-100', 'Cleansing Toner', 'Toner', 'Removes residual impurities and tightens pores', 40000, 79000, '']);
    md.appendRow(['SM-UVS-025', 'UV Shield Sunscreen SPF 50 PA++++', 'Sunscreen', 'Extra protection from UVA & UVB with Mangosteen Fruit Extract', 25000, 47500, '']);
    Logger.log('✅ Real products seeded');
  }

  // Inventory In (Initial Stock for Real Products)
  const invIn = ss.getSheetByName('Inventory_In');
  if (invIn.getLastRow() <= 1) {
    invIn.appendRow(['IN-001', formatDate(), 'SM-OCC-100', 'Oil Control Cleanser', 200, 'B2026-01', '2028-04-01', 'Warehouse', 'A1-01']);
    invIn.appendRow(['IN-002', formatDate(), 'SM-CT-100', 'Cleansing Toner', 150, 'B2026-01', '2028-04-01', 'Warehouse', 'A1-01']);
    invIn.appendRow(['IN-003', formatDate(), 'SM-UVS-025', 'UV Shield Sunscreen SPF 50 PA++++', 100, 'B2026-02', '2027-10-05', 'Warehouse', 'A1-01']);
    Logger.log('✅ Inventory In seeded');
  }

  // Inventory Out (Empty for fresh start)
  const invOut = ss.getSheetByName('Inventory_Out');
  if (invOut.getLastRow() <= 1) {
    Logger.log('✅ Inventory Out ready');
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

  // Invoices (Empty for fresh start)
  const inv = ss.getSheetByName('Invoices');
  if (inv.getLastRow() <= 1) {
    Logger.log('✅ Invoices ready');
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

function addCustomer(data) {
  const sheet = getSheet(SHEETS.CUSTOMERS);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0] || [];
  let b2bIdx = headers.indexOf('B2B_Prices');
  if (b2bIdx === -1 && headers.length > 0) {
    b2bIdx = headers.length;
    sheet.getRange(1, b2bIdx + 1).setValue('B2B_Prices');
    headers.push('B2B_Prices');
  }
  const rowObj = {
    Customer_Name: data.Customer_Name,
    Email: data.Email || '',
    Phone: data.Phone || '',
    Address: data.Address || '',
    B2B_Prices: data.B2B_Prices || ''
  };
  const targetHeaders = headers.length > 0 ? headers : ['Customer_Name', 'Email', 'Phone', 'Address', 'B2B_Prices'];
  if (headers.length === 0) {
    sheet.appendRow(targetHeaders);
  }
  const row = targetHeaders.map(h => rowObj[h] !== undefined ? rowObj[h] : '');
  sheet.appendRow(row);
  return { success: true, message: 'Customer added.' };
}

function updateCustomer(data) {
  const sheet = getSheet(SHEETS.CUSTOMERS);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  let b2bIdx = headers.indexOf('B2B_Prices');
  if (b2bIdx === -1) {
    b2bIdx = headers.length;
    sheet.getRange(1, b2bIdx + 1).setValue('B2B_Prices');
    headers.push('B2B_Prices');
  }
  const nameIdx = headers.indexOf('Customer_Name');
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][nameIdx] === data.Old_Name) {
      sheet.getRange(i + 1, nameIdx + 1).setValue(data.Customer_Name);
      const emailIdx = headers.indexOf('Email');
      if (emailIdx >= 0) sheet.getRange(i + 1, emailIdx + 1).setValue(data.Email || '');
      const phoneIdx = headers.indexOf('Phone');
      if (phoneIdx >= 0) sheet.getRange(i + 1, phoneIdx + 1).setValue(data.Phone || '');
      const addrIdx = headers.indexOf('Address');
      if (addrIdx >= 0) sheet.getRange(i + 1, addrIdx + 1).setValue(data.Address || '');
      sheet.getRange(i + 1, b2bIdx + 1).setValue(data.B2B_Prices || '');
      return { success: true, message: 'Customer updated.' };
    }
  }
  return { success: false, error: 'Customer not found.' };
}

function getNextId(prefix) {
  const sheet = getSheet(SHEETS.INVOICES);
  const data = sheet.getDataRange().getValues();
  
  const idIdx = data[0].indexOf('Invoice_ID');
  let max = 0;
  if (data.length >= 2) {
    for (let i = 1; i < data.length; i++) {
      const id = data[i][idIdx].toString();
      if (id.startsWith(prefix)) {
        const num = parseInt(id.split('-').pop());
        if (!isNaN(num) && num > max) max = num;
      }
    }
  }
  
  // Starting point is 96 as requested
  const nextNum = max < 96 ? 96 : max + 1;
  return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
}

function deleteInvoice(data) {
  const invoiceId = data.Invoice_ID;
  if (!invoiceId) return { success: false, error: 'No Invoice ID provided.' };

  // Delete from Invoices sheet
  const invSheet = getSheet(SHEETS.INVOICES);
  const invData = invSheet.getDataRange().getValues();
  const idIdx = invData[0].indexOf('Invoice_ID');
  for (let i = 1; i < invData.length; i++) {
    if (invData[i][idIdx] === invoiceId) {
      invSheet.deleteRow(i + 1);
      break;
    }
  }

  // Delete line items
  const lineSheet = getSheet(SHEETS.INVOICE_LINE_ITEMS);
  const lineData = lineSheet.getDataRange().getValues();
  const lineIdIdx = lineData[0].indexOf('Invoice_ID');
  for (let i = lineData.length - 1; i >= 1; i--) {
    if (lineData[i][lineIdIdx] === invoiceId) {
      lineSheet.deleteRow(i + 1);
    }
  }

  return { success: true, message: 'Invoice deleted.' };
}

function cancelInvoice(data) {
  const invoiceId = data.Invoice_ID;
  const sheet = getSheet(SHEETS.INVOICES);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idIdx = headers.indexOf('Invoice_ID');
  const statusIdx = headers.indexOf('Status');

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idIdx] === invoiceId) {
      sheet.getRange(i + 1, statusIdx + 1).setValue('Cancelled');
      return { success: true, message: 'Invoice cancelled.' };
    }
  }
  return { success: false, error: 'Invoice not found.' };
}

function generateDummyData() {
  const invInSheet = getSheet(SHEETS.INVENTORY_IN);
  const invInHeaders = ['Transaction_ID', 'Date_Received', 'SKU', 'Product_Name', 'Quantity', 'Batch_Number', 'Expiry_Date', 'Warehouse_Type', 'Location'];
  
  const invOutSheet = getSheet(SHEETS.INVENTORY_OUT);
  const invOutHeaders = ['Transaction_ID', 'Date', 'SKU', 'Quantity', 'Reason', 'Reference_ID', 'Batch_Number', 'Warehouse_Type'];
  
  const master = getSheetData(SHEETS.MASTER_DATA);
  if (master.length === 0) return { success: false, error: 'No master data found.' };
  
  // Force headers to exist in row 1
  invInSheet.getRange(1, 1, 1, invInHeaders.length).setValues([invInHeaders]);
  invOutSheet.getRange(1, 1, 1, invOutHeaders.length).setValues([invOutHeaders]);
  
  // Clear existing (optional, but let's just append)
  const today = new Date();
  const nextYear = new Date();
  nextYear.setFullYear(today.getFullYear() + 1);
  const nextMonth = new Date();
  nextMonth.setMonth(today.getMonth() + 3); // 3 months shelf life
  
  const newInRows = [];
  master.forEach((p, idx) => {
    const offlineStock = 100;
    const onlinePercentage = Math.floor(Math.random() * (21 - 14 + 1)) + 14; // random between 14 and 21
    const onlineStock = Math.floor(offlineStock * (onlinePercentage / 100));

    // Offline Warehouse Batch
    newInRows.push([
      generateId('IN'), formatDate(new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000)), p.SKU, p.Product_Name, offlineStock, `B${today.getFullYear()}-A${idx}`, formatDate(nextYear), 'Warehouse', 'A1-01'
    ]);
    // Online Warehouse Batch (14-21% of offline)
    newInRows.push([
      generateId('IN'), formatDate(new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000)), p.SKU, p.Product_Name, onlineStock, `B${today.getFullYear()}-B${idx}`, formatDate(nextMonth), 'Online Warehouse', 'A1-02'
    ]);
  });
  
  if (newInRows.length > 0) {
    invInSheet.getRange(invInSheet.getLastRow() + 1, 1, newInRows.length, invInHeaders.length).setValues(newInRows);
  }
  
  return { success: true, message: 'Dummy data generated.' };
}

function clearAllTransactions() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  const sheetsToClear = [
    SHEETS.INVOICES,
    SHEETS.INVOICE_LINE_ITEMS,
    SHEETS.DELIVERY_ORDERS,
    SHEETS.INVENTORY_OUT
  ];
  
  sheetsToClear.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow > 1 && lastCol > 0) {
        // Clear everything below the header row
        sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
      }
    }
  });
  
  Logger.log('✅ All transactions (Invoices, DOs, Line Items, Inventory Out) cleared successfully.');
  return { success: true, message: 'All transactions cleared.' };
}

function resetAdminPassword() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailIdx = headers.indexOf('Email');
  const passIdx = headers.indexOf('Password');
  
  const targetEmail = 'admin@selfmology.com';
  const newPass = 'admin123';
  const hashed = simpleHash(newPass);
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][emailIdx] && data[i][emailIdx].toString().toLowerCase() === targetEmail.toLowerCase()) {
      sheet.getRange(i + 1, passIdx + 1).setValue(hashed);
      Logger.log('✅ Admin password has been reset to: ' + newPass);
      return { success: true, message: 'Admin password reset.' };
    }
  }
  
  // If not found, create it
  sheet.appendRow(['USR-001', targetEmail, 'Admin', 'Administrator', hashed]);
  Logger.log('✅ Admin user was not found, so it was created with password: ' + newPass);
  return { success: true, message: 'Admin user created.' };
}

function checkOverdueInvoicesAndSendEmails() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const invSheet = ss.getSheetByName(SHEETS.INVOICES);
    if (!invSheet) return;
    
    const data = getSheetData(SHEETS.INVOICES);
    if (data.length === 0) return;
    
    // Date 2 days from now
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 2);
    const targetDateStr = formatDate(targetDate);
    
    const upcomingInvoices = data.filter(inv => {
      // Must be finalized and not paid
      const isPending = inv.Status === 'Finalized' && inv.Payment_Status !== 'Paid';
      if (!isPending) return false;
      
      // Compare due date
      if (!inv.Payment_Due_Date) return false;
      const dueDateStr = formatDate(new Date(inv.Payment_Due_Date));
      return dueDateStr === targetDateStr;
    });
    
    if (upcomingInvoices.length === 0) {
      Logger.log('No invoices due in 2 days.');
      return;
    }
    
    // Construct email content
    let emailBody = 'Halo Team Selfmology,\n\nBerikut adalah daftar invoice yang jatuh tempo dalam 2 hari (' + targetDateStr + '):\n\n';
    
    upcomingInvoices.forEach(inv => {
      emailBody += `- Invoice ID: ${inv.Invoice_ID}\n`;
      emailBody += `  Customer: ${inv.Customer_Name}\n`;
      emailBody += `  Total: Rp ${Number(inv.Total_Amount).toLocaleString('id-ID')}\n`;
      emailBody += `  Jatuh Tempo: ${inv.Payment_Due_Date}\n\n`;
    });
    
    emailBody += 'Mohon cek pembayaran dari customer terkait.\n\nTerima kasih,\nSelfmology ERP System';
    
    MailApp.sendEmail({
      to: 'selfmology@gmail.com',
      subject: '[Selfmology ERP] Pengingat Pembayaran Invoice - 2 Hari Sebelum Jatuh Tempo',
      body: emailBody
    });
    
    Logger.log('Sent reminder email for ' + upcomingInvoices.length + ' invoices.');
  } catch (err) {
    Logger.log('Error in checkOverdueInvoicesAndSendEmails: ' + err.message);
  }
}

function setupDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const triggerName = 'checkOverdueInvoicesAndSendEmails';
  
  const exists = triggers.some(t => t.getHandlerFunction() === triggerName);
  if (!exists) {
    ScriptApp.newTrigger(triggerName)
      .timeBased()
      .everyDays(1)
      .atHour(8) // Run daily at 8:00 AM
      .create();
    Logger.log('Daily trigger setup successfully.');
    return { success: true, message: 'Daily trigger setup successfully.' };
  }
  return { success: true, message: 'Daily trigger already exists.' };
}
