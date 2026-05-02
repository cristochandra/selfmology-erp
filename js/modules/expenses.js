// ============================================================
// SELFMOLOGY ERP – Expenses Module
// Updated: Notes input, date range filter, monthly view
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
      .map(e => `
        <div class="list-item" onclick="Expenses.showDetail('${e.Expense_ID}')">
          <div class="list-item-icon" style="background:var(--color-orange-light);">
            ${this.getCategoryEmoji(e.Category)}
          </div>
          <div class="list-item-content">
            <div class="list-item-title">${e.Category || 'Uncategorized'}</div>
            <div class="list-item-meta">${e.Expense_ID} · ${App.formatDate(e.Date)}${e.Notes ? ' · ' + e.Notes.substring(0, 30) + (e.Notes.length > 30 ? '…' : '') : ''}</div>
          </div>
          <div class="list-item-value" style="color:var(--color-red);">
            ${App.formatCurrency(e.Amount)}
          </div>
        </div>
      `).join('');

    container.innerHTML = summaryHtml + listHtml;
  },

  renderMonthly(container) {
    // Group ALL expenses by month (not just filtered)
    const byMonth = {};
    this.expenses.forEach(e => {
      const date = new Date(e.Date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
      const [year, month] = m.month.split('-');
      const monthName = new Date(year, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const byCat = {};
      m.items.forEach(e => {
        const cat = e.Category || 'Other';
        if (!byCat[cat]) byCat[cat] = 0;
        byCat[cat] += Number(e.Amount) || 0;
      });

      return `
        <div class="card" style="margin-bottom:12px;">
          <div class="flex-between mb-md">
            <div>
              <div class="text-sm text-bold">${monthName}</div>
              <div class="text-xs text-secondary">${m.items.length} transaction${m.items.length !== 1 ? 's' : ''}</div>
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

  getCategoryEmoji(cat) {
    const map = {
      'Packaging': '📦', 'Marketing': '📢', 'Logistics': '🚚',
      'Office Supplies': '🖊️', 'Utilities': '💡', 'Salary': '👤',
      'Production': '🏭', 'Travel': '✈️', 'Maintenance': '🔧',
      'Software': '💻', 'Other': '📋'
    };
    return map[cat] || '💸';
  },

  showDetail(expenseId) {
    const e = this.expenses.find(ex => ex.Expense_ID === expenseId);
    if (!e) return;

    let html = `
      <h3 class="modal-title">Expense Detail</h3>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div class="flex-between">
          <span class="text-sm text-secondary">Expense ID</span>
          <span class="text-sm text-bold">${e.Expense_ID}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Date</span>
          <span class="text-sm">${App.formatDate(e.Date)}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Category</span>
          <span class="badge badge-draft">${e.Category || '-'}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Amount</span>
          <span class="text-sm text-bold" style="font-size:18px;color:var(--color-red);">${App.formatCurrency(e.Amount)}</span>
        </div>
        ${e.Notes ? `
          <div>
            <p class="text-sm text-secondary mb-xs">Notes</p>
            <p class="text-sm" style="background:var(--bg-secondary);padding:10px 14px;border-radius:var(--radius-sm);">${e.Notes}</p>
          </div>
        ` : ''}
        ${e.Receipt_Image_URL ? `
          <div class="mt-sm">
            <p class="text-sm text-secondary mb-sm">Receipt</p>
            <img src="${e.Receipt_Image_URL}" alt="Receipt" style="width:100%;border-radius:var(--radius-md);border:1px solid var(--border-light);">
          </div>
        ` : ''}
      </div>
    `;
    App.openModal(html);
  },

  showAddForm() {
    const today = App.todayStr();
    const categories = [
      'Packaging', 'Marketing', 'Logistics', 'Office Supplies',
      'Utilities', 'Salary', 'Production', 'Travel', 'Maintenance', 'Software', 'Other'
    ];

    let html = `
      <h3 class="modal-title">Add Expense</h3>
      <form id="expense-form" onsubmit="return false;">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" id="exp-date" class="form-input" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="exp-category" class="form-select" required>
            <option value="">Select category...</option>
            ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Amount (Rp)</label>
          <input type="number" id="exp-amount" class="form-input" min="0" required placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label">Notes / Description</label>
          <textarea id="exp-notes" class="form-textarea" placeholder="e.g. Monthly packaging supplies restock" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Receipt Image</label>
          <div class="file-upload" id="receipt-drop-zone" style="padding:16px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:24px;height:24px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <div class="file-upload-text">Tap to upload receipt</div>
            <div class="file-upload-hint">JPG, PNG, or PDF</div>
          </div>
          <input type="file" id="receipt-file-input" accept="image/*,.pdf" class="hidden">
          <div id="receipt-preview" class="hidden mt-sm"></div>
          <input type="hidden" id="exp-receipt-url" value="">
        </div>
        <button type="submit" class="btn btn-primary btn-full btn-lg" id="exp-submit-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14"/></svg>
          Record Expense
        </button>
      </form>
    `;

    App.openModal(html);
    this.bindReceiptUpload();

    document.getElementById('expense-form').onsubmit = (e) => { e.preventDefault(); this.handleSubmit(); };
    document.getElementById('exp-submit-btn').onclick = () => this.handleSubmit();
  },

  bindReceiptUpload() {
    const dropZone = document.getElementById('receipt-drop-zone');
    const fileInput = document.getElementById('receipt-file-input');
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
      if (file) this.handleReceiptFile(file);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) this.handleReceiptFile(fileInput.files[0]);
    });
  },

  handleReceiptFile(file) {
    const preview = document.getElementById('receipt-preview');
    if (!preview) return;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.innerHTML = `<img src="${e.target.result}" alt="Receipt preview" style="max-width:100%;border-radius:var(--radius-md);border:1px solid var(--border-light);">`;
        preview.classList.remove('hidden');
        document.getElementById('exp-receipt-url').value = e.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      preview.innerHTML = `
        <div class="card card-elevated" style="padding:12px;text-align:center;">
          <p class="text-sm">📎 ${file.name}</p>
        </div>`;
      preview.classList.remove('hidden');
    }

    const dropZone = document.getElementById('receipt-drop-zone');
    if (dropZone) {
      dropZone.querySelector('.file-upload-text').textContent = file.name;
      dropZone.querySelector('.file-upload-hint').textContent = 'Tap to change';
    }
  },

  async handleSubmit() {
    const data = {
      Date: document.getElementById('exp-date').value,
      Category: document.getElementById('exp-category').value,
      Amount: Number(document.getElementById('exp-amount').value) || 0,
      Notes: document.getElementById('exp-notes').value.trim(),
      Receipt_Image_URL: document.getElementById('exp-receipt-url').value
    };

    if (!data.Category || data.Amount <= 0) {
      App.toast('Category and Amount are required.', 'warning');
      return;
    }

    const result = await API.call('addExpense', data);
    if (result.success) {
      App.toast(result.message, 'success');
      App.closeModal();
      this.load();
    }
  }
};
