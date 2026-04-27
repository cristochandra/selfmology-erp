// ============================================================
// SELFMOLOGY ERP – Core Application Logic
// ============================================================

// ==================== CONFIGURATION ====================
const API_URL = 'https://script.google.com/macros/s/AKfycbwIX89SskvTC1WmeXp3bm6mUnOXn38T9A3TxuKxnkhyx3_GZDSq7cHpzuykvb6vJkX3nQ/exec'; // <-- Paste your Google Apps Script Web App URL here

// ==================== APP STATE ====================
const AppState = {
  user: null,
  currentPage: 'dashboard',
  masterData: [],
  customers: [], // Customer database for invoice dropdowns
  isLoading: false,
  demoMode: false
};

// ==================== API LAYER ====================
const API = {
  async call(action, data = {}) {
    if (!API_URL || API_URL === '') {
      AppState.demoMode = true;
      return this.demoResponse(action, data);
    }

    App.showLoading();
    try {
      // Use GET with URL params to avoid CORS preflight (GAS handles GET CORS-free)
      const payload = encodeURIComponent(JSON.stringify({ action, data }));
      const url = API_URL + '?payload=' + payload;
      const response = await fetch(url, { redirect: 'follow' });
      const result = await response.json();
      if (!result.success) {
        App.toast(result.error || 'Something went wrong', 'error');
      }
      return result;
    } catch (err) {
      console.error('API Error:', err);
      App.toast('Network error. Check your connection.', 'error');
      return { success: false, error: err.message };
    } finally {
      App.hideLoading();
    }
  },

  demoResponse(action, data) {
    const demoData = DemoData[action];
    if (typeof demoData === 'function') return demoData(data);
    if (demoData) return { success: true, ...demoData };
    return { success: true, data: [], message: 'Demo mode – no backend connected.' };
  }
};

// ==================== DEMO DATA ====================
const DemoData = {
  login(data) {
    const users = [
      { userId: 'USR-001', email: 'admin@selfmology.com', role: 'Admin', name: 'Administrator' },
      { userId: 'USR-002', email: 'staff@selfmology.com', role: 'Staff', name: 'Staff Member' }
    ];
    const user = users.find(u => u.email.toLowerCase() === (data.email || '').toLowerCase());
    if (!user) return { success: false, error: 'User not found. Try admin@selfmology.com or staff@selfmology.com' };
    return { success: true, user };
  },

  getMasterData() {
    return {
      success: true, data: [
        { SKU: 'SM-CLN-001', Product_Name: 'Gentle Foam Cleanser', Category: 'Cleanser', Description: 'Mild foaming cleanser for sensitive skin', COGS: 35000, Standard_Price: 89000, Image_URL: '' },
        { SKU: 'SM-TNR-001', Product_Name: 'Hydrating Toner', Category: 'Toner', Description: 'Alcohol-free hydrating toner with niacinamide', COGS: 28000, Standard_Price: 79000, Image_URL: '' },
        { SKU: 'SM-SRM-001', Product_Name: 'Vitamin C Serum', Category: 'Serum', Description: 'Brightening serum with 15% Vitamin C', COGS: 55000, Standard_Price: 149000, Image_URL: '' },
        { SKU: 'SM-MST-001', Product_Name: 'Daily Moisturizer SPF30', Category: 'Moisturizer', Description: 'Lightweight moisturizer with SPF protection', COGS: 42000, Standard_Price: 119000, Image_URL: '' },
        { SKU: 'SM-MSK-001', Product_Name: 'Clay Detox Mask', Category: 'Mask', Description: 'Deep cleansing clay mask with kaolin', COGS: 38000, Standard_Price: 99000, Image_URL: '' },
        { SKU: 'SM-EYE-001', Product_Name: 'Eye Cream Anti-Aging', Category: 'Eye Care', Description: 'Retinol-infused anti-aging eye cream', COGS: 65000, Standard_Price: 179000, Image_URL: '' },
      ]
    };
  },

  getInventoryIn() {
    return {
      success: true, data: [
        { Transaction_ID: 'IN-001', Date_Received: '2026-04-01', SKU: 'SM-CLN-001', Product_Name: 'Gentle Foam Cleanser', Quantity: 200, Batch_Number: 'B2026-01', Expiry_Date: '2028-04-01' },
        { Transaction_ID: 'IN-002', Date_Received: '2026-04-01', SKU: 'SM-TNR-001', Product_Name: 'Hydrating Toner', Quantity: 150, Batch_Number: 'B2026-01', Expiry_Date: '2028-04-01' },
        { Transaction_ID: 'IN-003', Date_Received: '2026-04-05', SKU: 'SM-SRM-001', Product_Name: 'Vitamin C Serum', Quantity: 100, Batch_Number: 'B2026-02', Expiry_Date: '2027-10-05' },
        { Transaction_ID: 'IN-004', Date_Received: '2026-04-10', SKU: 'SM-MST-001', Product_Name: 'Daily Moisturizer SPF30', Quantity: 180, Batch_Number: 'B2026-02', Expiry_Date: '2028-04-10' },
        { Transaction_ID: 'IN-005', Date_Received: '2026-04-15', SKU: 'SM-MSK-001', Product_Name: 'Clay Detox Mask', Quantity: 80, Batch_Number: 'B2026-03', Expiry_Date: '2028-01-15' },
        { Transaction_ID: 'IN-006', Date_Received: '2026-04-20', SKU: 'SM-EYE-001', Product_Name: 'Eye Cream Anti-Aging', Quantity: 60, Batch_Number: 'B2026-03', Expiry_Date: '2027-10-20' },
      ]
    };
  },

  getInventoryOut() {
    return {
      success: true, data: [
        { Transaction_ID: 'OUT-001', Date: '2026-04-05', SKU: 'SM-CLN-001', Quantity: 50, Reason: 'Online Sales', Reference_ID: 'Shopee' },
        { Transaction_ID: 'OUT-002', Date: '2026-04-08', SKU: 'SM-SRM-001', Quantity: 30, Reason: 'Online Sales', Reference_ID: 'Tokopedia' },
        { Transaction_ID: 'OUT-003', Date: '2026-04-12', SKU: 'SM-TNR-001', Quantity: 45, Reason: 'B2B Sales', Reference_ID: 'INV-00001' },
        { Transaction_ID: 'OUT-004', Date: '2026-04-15', SKU: 'SM-MST-001', Quantity: 60, Reason: 'Online Sales', Reference_ID: 'Shopee' },
        { Transaction_ID: 'OUT-005', Date: '2026-04-18', SKU: 'SM-CLN-001', Quantity: 25, Reason: 'B2B Sales', Reference_ID: 'INV-00002' },
        { Transaction_ID: 'OUT-006', Date: '2026-04-20', SKU: 'SM-MSK-001', Quantity: 75, Reason: 'Write-off/Promo', Reference_ID: 'PROMO-APR' },
        { Transaction_ID: 'OUT-007', Date: '2026-04-22', SKU: 'SM-EYE-001', Quantity: 55, Reason: 'Online Sales', Reference_ID: 'Tokopedia' },
      ]
    };
  },

  getInvoices() {
    return {
      success: true, data: [
        { Invoice_ID: 'INV-00001', Date_Created: '2026-04-10', Customer_Name: 'PT. Beauty Store Jakarta', Total_Amount: 3555000, Discount_Value: 0, Discount_Type: 'fixed', Status: 'Finalized', Payment_Due_Date: '2026-04-24' },
        { Invoice_ID: 'INV-00002', Date_Created: '2026-04-16', Customer_Name: 'CV. Glow Skincare Bandung', Total_Amount: 2225000, Discount_Value: 100000, Discount_Type: 'fixed', Status: 'Finalized', Payment_Due_Date: '2026-04-30' },
        { Invoice_ID: 'DRAFT-003', Date_Created: '2026-04-25', Customer_Name: 'Toko Kecantikan Surabaya', Total_Amount: 1470000, Discount_Value: 0, Discount_Type: 'fixed', Status: 'Draft', Payment_Due_Date: '2026-05-09' },
      ]
    };
  },

  getLineItems(data) {
    const allItems = {
      'INV-00001': [
        { Line_ID: 'INV-00001-L1', Invoice_ID: 'INV-00001', SKU: 'SM-TNR-001', Quantity: 45, Unit_Price: 79000, Line_Total: 3555000 },
      ],
      'INV-00002': [
        { Line_ID: 'INV-00002-L1', Invoice_ID: 'INV-00002', SKU: 'SM-CLN-001', Quantity: 25, Unit_Price: 89000, Line_Total: 2225000 },
      ],
      'DRAFT-003': [
        { Line_ID: 'DRAFT-003-L1', Invoice_ID: 'DRAFT-003', SKU: 'SM-MST-001', Quantity: 10, Unit_Price: 119000, Line_Total: 1190000 },
        { Line_ID: 'DRAFT-003-L2', Invoice_ID: 'DRAFT-003', SKU: 'SM-MSK-001', Quantity: 4, Unit_Price: 70000, Line_Total: 280000 },
      ]
    };
    return { success: true, data: allItems[data.Invoice_ID] || [] };
  },

  getDeliveryOrders() {
    return {
      success: true, data: [
        { DO_ID: 'DO-001', Invoice_ID: 'INV-00001', Date_Created: '2026-04-10', Status: 'Executed', Payment_Status: 'Paid', Payment_Proof_URL: '' },
        { DO_ID: 'DO-002', Invoice_ID: 'INV-00002', Date_Created: '2026-04-16', Status: 'Pending', Payment_Status: 'Unpaid', Payment_Proof_URL: '' },
      ]
    };
  },

  getExpenses() {
    return {
      success: true, data: [
        { Expense_ID: 'EXP-001', Date: '2026-03-03', Category: 'Packaging', Amount: 2500000, Notes: 'Monthly packaging supplies restock', Receipt_Image_URL: '' },
        { Expense_ID: 'EXP-002', Date: '2026-03-15', Category: 'Marketing', Amount: 3000000, Notes: 'Social media ads for March campaign', Receipt_Image_URL: '' },
        { Expense_ID: 'EXP-003', Date: '2026-04-03', Category: 'Packaging', Amount: 2500000, Notes: 'April packaging materials', Receipt_Image_URL: '' },
        { Expense_ID: 'EXP-004', Date: '2026-04-10', Category: 'Marketing', Amount: 5000000, Notes: 'Instagram influencer collaboration', Receipt_Image_URL: '' },
        { Expense_ID: 'EXP-005', Date: '2026-04-15', Category: 'Logistics', Amount: 1200000, Notes: 'Shipping cost with JNE for B2B orders', Receipt_Image_URL: '' },
        { Expense_ID: 'EXP-006', Date: '2026-04-20', Category: 'Office Supplies', Amount: 350000, Notes: 'Printer paper and stationery', Receipt_Image_URL: '' },
      ]
    };
  },

  getCustomers() {
    return {
      success: true, data: [
        { Customer_Name: 'PT. Beauty Store Jakarta' },
        { Customer_Name: 'CV. Glow Skincare Bandung' },
        { Customer_Name: 'Toko Kecantikan Surabaya' },
        { Customer_Name: 'UD. Cantik Bali' },
        { Customer_Name: 'PT. Radiant Cosmetics' },
      ]
    };
  },

  getUsers() {
    return {
      success: true, data: [
        { User_ID: 'USR-001', Email: 'admin@selfmology.com', Role: 'Admin', Name: 'Administrator' },
        { User_ID: 'USR-002', Email: 'staff@selfmology.com', Role: 'Staff', Name: 'Staff Member' }
      ]
    };
  },
  getDashboardData(data) {
    const master = DemoData.getMasterData().data;
    const invIn = DemoData.getInventoryIn().data;
    const invOut = DemoData.getInventoryOut().data;

    const stockMap = {};
    master.forEach(p => {
      stockMap[p.SKU] = { ...p, totalIn: 0, totalOut: 0, currentStock: 0, stockValue: 0 };
    });
    invIn.forEach(r => { if (stockMap[r.SKU]) stockMap[r.SKU].totalIn += Number(r.Quantity); });
    invOut.forEach(r => { if (stockMap[r.SKU]) stockMap[r.SKU].totalOut += Number(r.Quantity); });

    let totalStockUnits = 0, totalStockValue = 0;
    const lowStockItems = [];
    Object.values(stockMap).forEach(item => {
      item.currentStock = item.totalIn - item.totalOut;
      item.stockValue = item.currentStock * item.COGS;
      totalStockUnits += item.currentStock;
      totalStockValue += item.stockValue;
      if (item.currentStock <= 10) lowStockItems.push(item);
    });

    const salesMap = {};
    invOut.forEach(r => {
      if (r.Reason === 'B2B Sales' || r.Reason === 'Online Sales') {
        if (!salesMap[r.SKU]) salesMap[r.SKU] = { SKU: r.SKU, totalSold: 0 };
        salesMap[r.SKU].totalSold += Number(r.Quantity);
      }
    });
    const topSelling = Object.values(salesMap)
      .sort((a, b) => b.totalSold - a.totalSold)
      .map(s => ({ ...s, Product_Name: stockMap[s.SKU]?.Product_Name || s.SKU }));

    return {
      success: true, data: {
        totalSKUs: master.length,
        totalStockUnits,
        totalStockValue,
        lowStockCount: lowStockItems.length,
        stockDetails: Object.values(stockMap),
        lowStockItems,
        topSelling
      }
    };
  },

  addProduct(data) { return { success: true, message: 'Product added (demo).' }; },
  updateProduct(data) { return { success: true, message: 'Product updated (demo).' }; },
  deleteProduct(data) { return { success: true, message: 'Product deleted (demo).' }; },
  addInventoryIn(data) { return { success: true, message: 'Stock In recorded (demo).', transactionId: 'IN-DEMO-' + Date.now() }; },
  addInventoryOut(data) { return { success: true, message: 'Stock Out recorded (demo).', transactionId: 'OUT-DEMO-' + Date.now() }; },
  bulkAddInventoryOut(data) { return { success: true, message: (data.rows?.length || 0) + ' rows imported (demo).', count: data.rows?.length || 0 }; },
  createInvoice(data) { return { success: true, message: 'Invoice created (demo).', invoiceId: 'DRAFT-DEMO-' + Date.now() }; },
  updateInvoice(data) { return { success: true, message: 'Invoice updated (demo).' }; },
  finalizeInvoice(data) { return { success: true, message: 'Invoice finalized (demo).', newInvoiceId: 'INV-' + String(Date.now()).slice(-5) }; },
  createDeliveryOrder(data) { return { success: true, message: 'DO created (demo).', doId: 'DO-DEMO-' + Date.now() }; },
  executeDeliveryOrder(data) { return { success: true, message: 'DO executed – inventory deducted (demo).', inventoryOutCount: 2 }; },
  updatePaymentStatus(data) { return { success: true, message: 'Payment status updated (demo).' }; },
  addExpense(data) { return { success: true, message: 'Expense recorded (demo).', expenseId: 'EXP-DEMO-' + Date.now() }; },
};


// ==================== APP CORE ====================
const App = {

  init() {
    this.checkAuth();
    this.bindEvents();
  },

  checkAuth() {
    const saved = localStorage.getItem('selfmology_user');
    if (saved) {
      AppState.user = JSON.parse(saved);
      this.showApp();
    }
  },

  bindEvents() {
    document.getElementById('login-form').addEventListener('submit', () => this.handleLogin());
    document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());
    document.getElementById('logout-btn').addEventListener('click', () => this.logout());

    // Bottom Nav – direct navigation for all 6 tabs
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        this.navigate(page);
      });
    });

    document.getElementById('fab-btn').addEventListener('click', () => this.handleFAB());

    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });
  },

  async handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      this.toast('Please enter email and password.', 'warning');
      return;
    }

    const result = await API.call('login', { email, password });
    if (result.success) {
      AppState.user = result.user;
      localStorage.setItem('selfmology_user', JSON.stringify(result.user));
      this.showApp();
      this.toast(`Welcome, ${result.user.name}!`, 'success');
    }
  },

  logout() {
    AppState.user = null;
    localStorage.removeItem('selfmology_user');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-main').classList.add('hidden');
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
  },

  showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-main').classList.remove('hidden');

    // Role-based visibility
    const isAdmin = AppState.user && AppState.user.role === 'Admin';
    const navUsers = document.getElementById('nav-users');
    const navMaster = document.getElementById('nav-master');
    const navExpenses = document.getElementById('nav-expenses');

    if (navUsers) navUsers.style.display = isAdmin ? 'flex' : 'none';
    if (navExpenses) navExpenses.style.display = isAdmin ? 'flex' : 'none';
    if (navMaster) navMaster.style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('nav-dashboard').style.display = isAdmin ? 'flex' : 'none';

    const badge = document.getElementById('user-role-badge');
    if (badge) {
      badge.textContent = AppState.user.role;
      badge.className = 'badge ' + (isAdmin ? 'badge-admin' : 'badge-staff');
    }

    const defaultPage = isAdmin ? 'dashboard' : 'inventory';
    this.navigate(defaultPage);

    // Load master data for dropdowns
    this.loadMasterData();
    this.loadCustomers();

    // Set default dashboard date filters: 1st of this month → today
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('dash-date-from').value = firstOfMonth.toISOString().split('T')[0];
    document.getElementById('dash-date-to').value = today.toISOString().split('T')[0];
  },

  navigate(page) {
    AppState.currentPage = page;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById('page-' + page);
    if (targetPage) targetPage.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');

    const titles = {
      dashboard: 'Dashboard',
      master: 'Master Data',
      inventory: 'Inventory',
      invoices: 'Invoices',
      delivery: 'Delivery Orders',
      expenses: 'Expenses',
      users: 'User Management'
    };
    document.getElementById('top-bar-subtitle').textContent = titles[page] || 'Selfmology';
    document.getElementById('top-bar-title').textContent = 'Selfmology';

    this.loadPageData(page);
  },

  async loadPageData(page) {
    switch (page) {
      case 'dashboard': if (typeof Dashboard !== 'undefined') Dashboard.load(); break;
      case 'master': if (typeof MasterData !== 'undefined') MasterData.load(); break;
      case 'inventory': if (typeof Inventory !== 'undefined') Inventory.load(); break;
      case 'invoices': if (typeof Invoices !== 'undefined') Invoices.load(); break;
      case 'delivery': if (typeof DeliveryOrders !== 'undefined') DeliveryOrders.load(); break;
      case 'expenses': if (typeof Expenses !== 'undefined') Expenses.load(); break;
      case 'users': if (typeof UsersModule !== 'undefined') UsersModule.load(); break;
    }
  },

  async loadMasterData() {
    const result = await API.call('getMasterData');
    if (result.success) {
      AppState.masterData = result.data;
      this.populateSKUDropdowns();
    }
  },

  async loadCustomers() {
    const result = await API.call('getCustomers');
    if (result.success) {
      AppState.customers = result.data.map(c => c.Customer_Name);
    }
  },

  populateSKUDropdowns() {
    const dropdowns = document.querySelectorAll('.sku-dropdown');
    const options = '<option value="">Select SKU...</option>' +
      AppState.masterData.map(p => `<option value="${p.SKU}">${p.SKU} – ${p.Product_Name}</option>`).join('');
    dropdowns.forEach(dd => { dd.innerHTML = options; });
  },

  switchTab(section, tabId) {
    const tabBtns = document.querySelectorAll(`#page-${section} > .tabs .tab`);
    tabBtns.forEach(t => t.classList.remove('active'));
    const activeBtn = document.querySelector(`#page-${section} > .tabs .tab[data-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const contents = document.querySelectorAll(`#page-${section} > .tab-content`);
    contents.forEach(c => c.classList.remove('active'));
    const activeContent = document.getElementById('tab-' + tabId);
    if (activeContent) activeContent.classList.add('active');

    // Load summary data when switching to summary tab
    if (tabId === 'inv-summary' && typeof Inventory !== 'undefined') {
      Inventory.renderSummary();
    }
  },

  switchSubTab(parent, subTab) {
    const parentEl = document.getElementById('tab-' + parent);
    if (!parentEl) return;
    const btns = parentEl.querySelectorAll('.tabs .tab');
    btns.forEach((t, i) => t.classList.toggle('active', i === (subTab === 'manual' ? 0 : 1)));

    const contents = parentEl.querySelectorAll(':scope > .tab-content');
    contents.forEach(c => c.classList.remove('active'));
    const target = document.getElementById('subtab-' + subTab);
    if (target) target.classList.add('active');
  },

  handleFAB() {
    switch (AppState.currentPage) {
      case 'master':
        if (typeof MasterData !== 'undefined') MasterData.showAddForm();
        break;
      case 'invoices':
        if (typeof Invoices !== 'undefined') Invoices.showCreateForm();
        break;
      case 'expenses':
        if (typeof Expenses !== 'undefined') Expenses.showAddForm();
        break;
      case 'delivery':
        if (typeof DeliveryOrders !== 'undefined') DeliveryOrders.showCreateForm();
        break;
      case 'users':
        if (typeof UsersModule !== 'undefined') UsersModule.showAddForm();
        break;
      default:
        this.toast('Use the form on this page to add items.', 'warning');
    }
  },

  // --- Modal ---
  openModal(html) {
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.style.overflow = '';
  },

  // --- Toast ---
  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  showLoading() {
    AppState.isLoading = true;
    document.getElementById('loading-overlay').classList.add('active');
  },

  hideLoading() {
    AppState.isLoading = false;
    document.getElementById('loading-overlay').classList.remove('active');
  },

  confirm(title, text, onConfirm, iconType = 'warning') {
    const html = `
      <div class="confirm-dialog">
        <div class="confirm-icon ${iconType}">${iconType === 'danger' ? '🗑️' : iconType === 'success' ? '✅' : '⚠️'}</div>
        <h3 class="confirm-title">${title}</h3>
        <p class="confirm-text">${text}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button class="btn ${iconType === 'danger' ? 'btn-danger' : 'btn-primary'}" id="confirm-action-btn">Confirm</button>
        </div>
      </div>
    `;
    this.openModal(html);
    document.getElementById('confirm-action-btn').addEventListener('click', () => {
      this.closeModal();
      onConfirm();
    });
  },

  formatCurrency(num) {
    return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  },

  todayStr() {
    return new Date().toISOString().split('T')[0];
  },

  getProductBySKU(sku) {
    return AppState.masterData.find(p => p.SKU === sku);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
