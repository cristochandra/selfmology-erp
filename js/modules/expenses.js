// ============================================================
// SELFMOLOGY ERP – Expenses Module
// Updated: 13-column schema, Google Drive uploads, and details
// ============================================================

const Expenses = {
  expenses: [],
  filtered: [],
  viewMode: 'all', // 'all' or 'monthly'

  async load() {
    const result = await API.call('getExpenses');
    if (result.success) {
      this.expenses = result.data.reverse();
      this.filtered = [...this.expenses];

      // Set default filter: 1st of month → today
      const today = new Date();
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      document.getElementById('exp-filter-from').value = firstOfMonth.toISOString().split('T')[0];
      document.getElementById('exp-filter-to').value = today.toISOString().split('T')[0];

      this.applyFilter();
    }
  },

  applyFilter() {
    const fromDate = document.getElementById('exp-filter-from').value;
    const toDate = document.getElementById('exp-filter-to').value;

    this.filtered = this.expenses.filter(e => {
      if (!e.Date) return true;
      if (fromDate && e.Date < fromDate) return false;
      if (toDate && e.Date > toDate) return false;
      return true;
    });

    this.render();
  },

  setView(mode) {
    this.viewMode = mode;
    // Update tab active state
    const tabs = document.querySelectorAll('#page-expenses > .tabs .tab');
    tabs.forEach((t, i) => t.classList.toggle('active', i === (mode === 'all' ? 0 : 1)));
    this.render();
  },

  render() {
    const container = document.getElementById('expenses-list');

    if (this.viewMode === 'monthly') {
      this.renderMonthly(container);
      return;
    }

    // All view
    if (this.filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💸</div>
          <p class="empty-state-title">No Expenses</p>
          <p class="empty-state-text">Record your first expense using the + button</p>
        </div>`;
      return;
    }

    // Category summary
    const byCategory = {};
    let totalExpenses = 0;
    this.filtered.forEach(e => {
      const cat = e.Category || 'Other';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += Number(e.Amount) || 0;
      totalExpenses += Number(e.Amount) || 0;
    });

    let summaryHtml = `
      <div class="card card-elevated" style="padding:16px;margin-bottom:16px;">
        <div class="flex-between mb-sm">
          <span class="text-sm text-secondary">Total Expenses</span>
          <span class="text-bold" style="font-size:18px;">${App.formatCurrency(totalExpenses)}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${Object.entries(byCategory).map(([cat, amt]) => `
            <span class="badge badge-draft">${cat}: ${App.formatCurrency(amt)}</span>
          `).join('')}
        </div>
      </div>
    `;

    const listHtml = this.filtered
      .sort((a, b) => new Date(b.Date) - new Date(a.Date))
      .map(e => {
        const titleStr = e.Item || e.Remarks || e.Category || 'Uncategorized';
        const remarksSnippet = e.Remarks ? ` · ${e.Remarks.substring(0, 30)}${e.Remarks.length > 30 ? '…' : ''}` : '';
        const debitCreditStr = (e.Debited_From || e.Credited_To) ? ` · ${e.Debited_From || '-' } ➔ ${e.Credited_To || '-'}` : '';
        const executedBadge = e.Executed === true || e.Executed === 'true' || e.Executed === 'YES' || e.Executed === 'checked' ? '✅' : '⏳';
        
        return `
          <div class="list-item" onclick="Expenses.showDetail('${e.Expense_ID}')">
            <div class="list-item-icon" style="background:var(--color-orange-light);">
              ${this.getCategoryEmoji(e.Category)}
            </div>
            <div class="list-item-content">
              <div class="list-item-title">${titleStr} ${executedBadge}</div>
              <div class="list-item-meta">${e.Expense_ID} · ${App.formatDate(e.Date)} · ${e.Category || 'Other'}${debitCreditStr}${remarksSnippet}</div>
            </div>
            <div class="list-item-value" style="color:var(--color-red); text-align:right;">
              ${App.formatCurrency(e.Amount)}
            </div>
          </div>
        `;
      }).join('');

    container.innerHTML = summaryHtml + listHtml;
  },

  renderMonthly(container) {
    // Group ALL expenses by month
    const byMonth = {};
    const monthsEng = { 'Januari': '01', 'Februari': '02', 'Maret': '03', 'April': '04', 'Mei': '05', 'Juni': '06', 'Juli': '07', 'Agustus': '08', 'September': '09', 'Oktober': '10', 'November': '11', 'Desember': '12' };
    
    this.expenses.forEach(e => {
      let key;
      if (e.Date) {
        const parts = e.Date.split('-');
        if (parts.length === 3) {
          key = `${parts[0]}-${parts[1]}`;
        }
      }
      if (!key) {
        if (e.Month && e.Year) {
          const m = monthsEng[e.Month] || '01';
          key = `${e.Year}-${m}`;
        } else {
          key = 'Unknown';
        }
      }
      if (!byMonth[key]) byMonth[key] = { month: key, total: 0, items: [] };
      byMonth[key].total += Number(e.Amount) || 0;
      byMonth[key].items.push(e);
    });

    const months = Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month));

    if (months.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📊</div>
          <p class="empty-state-title">No Data</p>
          <p class="empty-state-text">Record expenses to see monthly summaries</p>
        </div>`;
      return;
    }

    container.innerHTML = months.map(m => {
      let monthName = m.month;
      if (m.month !== 'Unknown' && m.month.includes('-')) {
        const [year, month] = m.month.split('-');
        monthName = new Date(year, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
      
      const byCat = {};
      m.items.forEach(e => {
        const cat = e.Category || 'Other';
        if (!byCat[cat]) byCat[cat] = 0;
        byCat[cat] += Number(e.Amount) || 0;
      });

      const clickable = m.month !== 'Unknown' && m.month.includes('-');
      return `
        <div class="card" style="margin-bottom:12px; ${clickable ? 'cursor:pointer;' : ''}" ${clickable ? `onclick="Expenses.drillMonth('${m.month}')"` : ''}>
          <div class="flex-between mb-md">
            <div>
              <div class="text-sm text-bold">${monthName}</div>
              <div class="text-xs text-secondary">${m.items.length} transaction${m.items.length !== 1 ? 's' : ''}${clickable ? ' · tap to view' : ''}</div>
            </div>
            <span class="text-bold" style="font-size:16px;color:var(--color-red);">${App.formatCurrency(m.total)}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => `
              <span class="badge badge-draft" style="font-size:10px;">${cat}: ${App.formatCurrency(amt)}</span>
            `).join('')}
          </div>
        </div>`;
    }).join('');
  },

  // Drill from the monthly summary into all transactions of that month.
  drillMonth(monthKey) {
    if (!monthKey || monthKey.indexOf('-') === -1) return;
    const [year, month] = monthKey.split('-');
    const from = `${year}-${month}-01`;
    const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
    const to = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    const fromEl = document.getElementById('exp-filter-from');
    const toEl = document.getElementById('exp-filter-to');
    if (fromEl) fromEl.value = from;
    if (toEl) toEl.value = to;
    this.viewMode = 'all';
    const tabs = document.querySelectorAll('#page-expenses > .tabs .tab');
    tabs.forEach((t, i) => t.classList.toggle('active', i === 0));
    this.applyFilter();
    const container = document.getElementById('expenses-list');
    if (container && container.scrollIntoView) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  getCategoryEmoji(cat) {
    const map = {
      'Packaging': '📦', 'Marketing': '📢', 'Logistics': '🚚',
      'Office Supplies': '🖊️', 'Utilities': '💡', 'Salary': '👤',
      'Production': '🏭', 'Travel': '✈️', 'Maintenance': '🔧',
      'Software': '💻', 'Other': '📋', 'Operational': '⚙️', 'Investment': '📈'
    };
    return map[cat] || '💸';
  },

  showDetail(expenseId) {
    const e = this.expenses.find(ex => ex.Expense_ID === expenseId);
    if (!e) return;

    const executed = e.Executed === true || e.Executed === 'true' || e.Executed === 'YES' || e.Executed === 'checked';

    let html = `
      <h3 class="modal-title">Expense Detail</h3>
      <div style="display:flex;flex-direction:column;gap:12px;max-height:80vh;overflow-y:auto;padding-right:4px;">
        <div class="flex-between">
          <span class="text-sm text-secondary">Expense ID</span>
          <span class="text-sm text-bold">${e.Expense_ID}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Date</span>
          <span class="text-sm">${App.formatDate(e.Date)}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Execution Status</span>
          <span class="badge ${executed ? 'badge-in-stock' : 'badge-pending'}">${executed ? 'Executed / Paid' : 'Pending'}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Item / Name</span>
          <span class="text-sm text-bold">${e.Item || '-'}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Category</span>
          <span class="badge badge-draft">${e.Category || '-'}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Amount</span>
          <span class="text-sm text-bold" style="font-size:18px;color:var(--color-red);">${App.formatCurrency(e.Amount)}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Debited From</span>
          <span class="text-sm">${e.Debited_From || '-'}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Credited To</span>
          <span class="text-sm">${e.Credited_To || '-'}</span>
        </div>
        
        ${e.Remarks ? `
          <div>
            <p class="text-sm text-secondary mb-xs">Remarks / Notes</p>
            <p class="text-sm" style="background:var(--bg-secondary);padding:10px 14px;border-radius:var(--radius-sm);white-space:pre-wrap;">${e.Remarks}</p>
          </div>
        ` : ''}
        
        <div style="display:flex; gap:8px; margin-top:12px;">
          ${e.Invoice_Link ? `
            <a href="${e.Invoice_Link}" target="_blank" class="btn btn-secondary btn-sm" style="flex:1; display:flex; align-items:center; justify-content:center; gap:4px; text-decoration:none;">
              📄 Open Invoice
            </a>
          ` : `
            <button class="btn btn-secondary btn-sm" disabled style="flex:1; opacity:0.5;">No Invoice File</button>
          `}
          
          ${e.Payment_Proof_Link ? `
            <a href="${e.Payment_Proof_Link}" target="_blank" class="btn btn-secondary btn-sm" style="flex:1; display:flex; align-items:center; justify-content:center; gap:4px; text-decoration:none;">
              💸 View Proof
            </a>
          ` : `
            <button class="btn btn-secondary btn-sm" disabled style="flex:1; opacity:0.5;">No Payment Proof</button>
          `}
        </div>
      </div>
    `;
    App.openModal(html);
  },

  showAddForm() {
    const today = App.todayStr();
    const categories = [
      'Marketing', 'Operational', 'Investment', 'Other',
      'Packaging', 'Logistics', 'Office Supplies', 'Utilities', 'Salary', 'Production', 'Travel', 'Maintenance', 'Software'
    ];

    let html = `
      <h3 class="modal-title">Record Expense</h3>
      <form id="expense-form" onsubmit="return false;" style="max-height:75vh; overflow-y:auto; padding-right:6px;">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" id="exp-date" class="form-input" value="${today}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="exp-category" class="form-select" required>
              <option value="">Select category...</option>
              ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Item / Description</label>
          <input type="text" id="exp-item" class="form-input" placeholder="e.g. Design Fiver, Sample WKI" required>
        </div>
        
        <div class="form-group">
          <label class="form-label">Amount (Rp)</label>
          <input type="number" id="exp-amount" class="form-input" min="0" required placeholder="0">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Debited From</label>
            <input type="text" id="exp-debited" class="form-input" placeholder="e.g. Devin, Cristo, Kas Kecil">
          </div>
          <div class="form-group">
            <label class="form-label">Credited To</label>
            <input type="text" id="exp-credited" class="form-input" placeholder="e.g. Freelance, Supplier, External">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Remarks / Notes</label>
          <textarea id="exp-remarks" class="form-textarea" placeholder="Additional details..." rows="2"></textarea>
        </div>

        <div class="form-group" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="exp-executed" style="width:18px; height:18px; accent-color:var(--color-primary);" checked>
          <label for="exp-executed" class="form-label" style="margin:0; cursor:pointer;">Executed / Paid</label>
        </div>

        <div class="form-group">
          <label class="form-label">Invoice File</label>
          <div class="file-upload" id="invoice-drop-zone" style="padding:12px;">
            <div class="file-upload-text">Tap to select Invoice</div>
            <div class="file-upload-hint">Auto-uploads to Google Drive</div>
          </div>
          <input type="file" id="invoice-file-input" accept="image/*,.pdf" class="hidden">
          <div id="invoice-preview" class="hidden mt-sm text-xs text-secondary" style="padding:6px; background:var(--bg-secondary); border-radius:4px;"></div>
          <input type="hidden" id="exp-invoice-data" value="">
          <input type="hidden" id="exp-invoice-name" value="">
        </div>

        <div class="form-group">
          <label class="form-label">Payment Proof File</label>
          <div class="file-upload" id="proof-drop-zone" style="padding:12px;">
            <div class="file-upload-text">Tap to select Payment Proof</div>
            <div class="file-upload-hint">Auto-uploads to Google Drive</div>
          </div>
          <input type="file" id="proof-file-input" accept="image/*,.pdf" class="hidden">
          <div id="proof-preview" class="hidden mt-sm text-xs text-secondary" style="padding:6px; background:var(--bg-secondary); border-radius:4px;"></div>
          <input type="hidden" id="exp-proof-data" value="">
          <input type="hidden" id="exp-proof-name" value="">
        </div>

        <button type="submit" class="btn btn-primary btn-full btn-lg mt-md" id="exp-submit-btn">
          Record Expense
        </button>
      </form>
    `;

    App.openModal(html);
    this.bindFileHandlers();

    document.getElementById('expense-form').onsubmit = (e) => { e.preventDefault(); this.handleSubmit(); };
    document.getElementById('exp-submit-btn').onclick = () => this.handleSubmit();
  },

  bindFileHandlers() {
    this.setupFileField('invoice-drop-zone', 'invoice-file-input', 'invoice-preview', 'exp-invoice-data', 'exp-invoice-name');
    this.setupFileField('proof-drop-zone', 'proof-file-input', 'proof-preview', 'exp-proof-data', 'exp-proof-name');
  },

  setupFileField(dropZoneId, fileInputId, previewId, dataInputId, nameInputId) {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId);
    const preview = document.getElementById(previewId);
    const dataInput = document.getElementById(dataInputId);
    const nameInput = document.getElementById(nameInputId);

    if (!dropZone || !fileInput) return;

    dropZone.onclick = () => fileInput.click();

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--color-primary)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file) this.handleFileSelect(file, dropZone, preview, dataInput, nameInput);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) this.handleFileSelect(fileInput.files[0], dropZone, preview, dataInput, nameInput);
    });
  },

  handleFileSelect(file, dropZone, preview, dataInput, nameInput) {
    const reader = new FileReader();
    reader.onload = (e) => {
      dataInput.value = e.target.result;
      nameInput.value = file.name;
      preview.innerHTML = `📎 Selected: <strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
      preview.classList.remove('hidden');
      dropZone.querySelector('.file-upload-text').textContent = 'Change file';
    };
    reader.readAsDataURL(file);
  },

  async handleSubmit() {
    const date = document.getElementById('exp-date').value;
    const category = document.getElementById('exp-category').value;
    const item = document.getElementById('exp-item').value.trim();
    const amount = Number(document.getElementById('exp-amount').value) || 0;
    const debited = document.getElementById('exp-debited').value.trim();
    const credited = document.getElementById('exp-credited').value.trim();
    const remarks = document.getElementById('exp-remarks').value.trim();
    const executed = document.getElementById('exp-executed').checked;

    if (!category || !item || amount <= 0) {
      App.toast('Item, Category, and Amount are required.', 'warning');
      return;
    }

    const invoiceData = document.getElementById('exp-invoice-data').value;
    const invoiceName = document.getElementById('exp-invoice-name').value;
    const proofData = document.getElementById('exp-proof-data').value;
    const proofName = document.getElementById('exp-proof-name').value;

    let invoiceLink = '';
    let proofLink = '';

    // If in demo mode, skip Drive uploads
    if (AppState.demoMode) {
      if (invoiceData) invoiceLink = 'https://drive.google.com/file/demo-invoice';
      if (proofData) proofLink = 'https://drive.google.com/file/demo-proof';
    } else {
      // 1. Upload Invoice to Drive
      if (invoiceData) {
        App.showLoading();
        App.toast('Uploading Invoice to Google Drive...', 'info');
        const res = await API.call('uploadFileToDrive', {
          fileData: invoiceData,
          fileName: invoiceName || `invoice_${Date.now()}`,
          folderId: '1w6g6jZPmXU9Kwxec9y5EtFAzOy__lOde'
        });
        App.hideLoading();
        if (res.success && res.url) {
          invoiceLink = res.url;
        } else {
          App.toast('Invoice upload failed: ' + (res.error || 'Unknown error'), 'error');
          return;
        }
      }

      // 2. Upload Payment Proof to Drive
      if (proofData) {
        App.showLoading();
        App.toast('Uploading Payment Proof to Google Drive...', 'info');
        const res = await API.call('uploadFileToDrive', {
          fileData: proofData,
          fileName: proofName || `payment_proof_${Date.now()}`,
          folderId: '12WvTFCrqWpd7v_CTndhDxVoeFjdHf0R7'
        });
        App.hideLoading();
        if (res.success && res.url) {
          proofLink = res.url;
        } else {
          App.toast('Payment Proof upload failed: ' + (res.error || 'Unknown error'), 'error');
          return;
        }
      }
    }

    // Record the expense
    const payload = {
      Date: date,
      Item: item,
      Amount: amount,
      Category: category,
      Debited_From: debited,
      Credited_To: credited,
      Remarks: remarks,
      Invoice_Link: invoiceLink,
      Payment_Proof_Link: proofLink,
      Executed: executed
    };

    const result = await API.call('addExpense', payload);
    if (result.success) {
      App.toast(result.message, 'success');
      App.closeModal();
      this.load();
    }
  }
};
