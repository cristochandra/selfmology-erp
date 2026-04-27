// ============================================================
// SELFMOLOGY ERP – Inventory Module
// Updated: Added Stock Summary sub-tab showing qty per SKU
// ============================================================

const Inventory = {
  inData: [],
  outData: [],

  async load() {
    const [inResult, outResult] = await Promise.all([
      API.call('getInventoryIn'),
      API.call('getInventoryOut')
    ]);

    if (inResult.success) this.inData = inResult.data;
    if (outResult.success) this.outData = outResult.data;

    this.renderHistory();
    this.renderSummary();
    this.bindForms();
    this.bindCSV();

    const today = App.todayStr();
    document.getElementById('si-date').value = today;
    document.getElementById('so-date').value = today;
  },

  bindForms() {
    document.getElementById('si-sku').addEventListener('change', (e) => {
      const product = App.getProductBySKU(e.target.value);
      document.getElementById('si-product-name').value = product ? product.Product_Name : '';
    });

    document.getElementById('stock-in-form').onsubmit = (e) => { e.preventDefault(); this.submitStockIn(); };
    document.getElementById('si-submit').onclick = () => this.submitStockIn();
    document.getElementById('stock-out-form').onsubmit = (e) => { e.preventDefault(); this.submitStockOut(); };
    document.getElementById('so-submit').onclick = () => this.submitStockOut();
  },

  async submitStockIn() {
    const data = {
      SKU: document.getElementById('si-sku').value,
      Date_Received: document.getElementById('si-date').value,
      Quantity: document.getElementById('si-quantity').value,
      Batch_Number: document.getElementById('si-batch').value,
      Expiry_Date: document.getElementById('si-expiry').value
    };

    if (!data.SKU || !data.Quantity) {
      App.toast('SKU and Quantity are required.', 'warning');
      return;
    }

    const result = await API.call('addInventoryIn', data);
    if (result.success) {
      App.toast(result.message, 'success');
      document.getElementById('si-sku').value = '';
      document.getElementById('si-product-name').value = '';
      document.getElementById('si-quantity').value = '';
      document.getElementById('si-batch').value = '';
      document.getElementById('si-expiry').value = '';
      this.load();
    }
  },

  async submitStockOut() {
    const data = {
      SKU: document.getElementById('so-sku').value,
      Date: document.getElementById('so-date').value,
      Quantity: document.getElementById('so-quantity').value,
      Reason: document.getElementById('so-reason').value,
      Reference_ID: document.getElementById('so-reference').value
    };

    if (!data.SKU || !data.Quantity || !data.Reason) {
      App.toast('SKU, Quantity, and Reason are required.', 'warning');
      return;
    }

    const result = await API.call('addInventoryOut', data);
    if (result.success) {
      App.toast(result.message, 'success');
      document.getElementById('so-sku').value = '';
      document.getElementById('so-quantity').value = '';
      document.getElementById('so-reason').value = '';
      document.getElementById('so-reference').value = '';
      this.load();
    }
  },

  // --- Stock Summary ---
  renderSummary() {
    const container = document.getElementById('inv-summary-list');
    if (!container) return;

    // Build stock map from master data
    const stockMap = {};
    AppState.masterData.forEach(p => {
      stockMap[p.SKU] = {
        SKU: p.SKU,
        Product_Name: p.Product_Name,
        Category: p.Category,
        totalIn: 0,
        totalOut: 0,
        currentStock: 0
      };
    });

    this.inData.forEach(r => {
      if (stockMap[r.SKU]) stockMap[r.SKU].totalIn += Number(r.Quantity) || 0;
    });
    this.outData.forEach(r => {
      if (stockMap[r.SKU]) stockMap[r.SKU].totalOut += Number(r.Quantity) || 0;
    });

    Object.values(stockMap).forEach(item => {
      item.currentStock = item.totalIn - item.totalOut;
    });

    const items = Object.values(stockMap).sort((a, b) => a.Product_Name.localeCompare(b.Product_Name));

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📊</div>
          <p class="empty-state-title">No Stock Data</p>
          <p class="empty-state-text">Add products and record stock movements first</p>
        </div>`;
      return;
    }

    // Total units
    const totalUnits = items.reduce((sum, i) => sum + i.currentStock, 0);

    container.innerHTML = `
      <div class="card card-elevated" style="padding:14px;margin-bottom:16px;">
        <div class="flex-between">
          <span class="text-sm text-secondary">Total Stock Units</span>
          <span class="text-bold" style="font-size:20px;">${totalUnits.toLocaleString()}</span>
        </div>
      </div>
      ${items.map(item => {
        const stockClass = item.currentStock <= 10 ? 'badge-low-stock' : 'badge-in-stock';
        const product = App.getProductBySKU(item.SKU);
        const icon = product && product.Image_URL
          ? `<img src="${product.Image_URL}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:var(--radius-md);">`
          : '📦';
        return `
          <div class="list-item" style="cursor:default;">
            <div class="list-item-icon" style="background:var(--color-primary-light);overflow:hidden;">${icon}</div>
            <div class="list-item-content">
              <div class="list-item-title">${item.Product_Name}</div>
              <div class="list-item-meta">${item.SKU} · In: ${item.totalIn} · Out: ${item.totalOut}</div>
            </div>
            <span class="badge ${stockClass}" style="font-size:13px;padding:4px 12px;">${item.currentStock}</span>
          </div>`;
      }).join('')}
    `;
  },

  // --- CSV Upload ---
  bindCSV() {
    const dropZone = document.getElementById('csv-drop-zone');
    const fileInput = document.getElementById('csv-file-input');

    dropZone.onclick = () => fileInput.click();

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--color-primary)';
      dropZone.style.background = 'var(--color-primary-light)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '';
      dropZone.style.background = '';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.background = '';
      const file = e.dataTransfer.files[0];
      if (file) this.parseCSV(file);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) this.parseCSV(fileInput.files[0]);
    });
  },

  parseCSV(file) {
    if (!file.name.endsWith('.csv')) {
      App.toast('Please select a CSV file.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        App.toast('CSV must have a header row and at least one data row.', 'warning');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const rows = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
        if (!row.Reason) row.Reason = 'Online Sales';
        rows.push(row);
      }

      this._csvRows = rows;

      const preview = document.getElementById('csv-preview');
      preview.classList.remove('hidden');
      preview.innerHTML = `
        <div class="card-elevated card" style="padding:12px;">
          <p class="text-sm text-bold mb-sm">${rows.length} rows found</p>
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
              <tbody>
                ${rows.slice(0, 5).map(r => `<tr>${headers.map(h => `<td>${r[h] || '-'}</td>`).join('')}</tr>`).join('')}
                ${rows.length > 5 ? '<tr><td colspan="' + headers.length + '" class="text-center text-secondary">...and ' + (rows.length - 5) + ' more</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      `;

      document.getElementById('csv-import-btn').classList.remove('hidden');
      document.getElementById('csv-import-btn').onclick = () => this.importCSV();
    };
    reader.readAsText(file);
  },

  async importCSV() {
    if (!this._csvRows || this._csvRows.length === 0) {
      App.toast('No rows to import.', 'warning');
      return;
    }
    const result = await API.call('bulkAddInventoryOut', { rows: this._csvRows });
    if (result.success) {
      App.toast(result.message, 'success');
      document.getElementById('csv-preview').classList.add('hidden');
      document.getElementById('csv-import-btn').classList.add('hidden');
      document.getElementById('csv-file-input').value = '';
      this._csvRows = null;
      this.load();
    }
  },

  // --- History ---
  renderHistory() {
    const container = document.getElementById('inv-history-list');
    const all = [
      ...this.inData.map(r => ({ ...r, type: 'in', date: r.Date_Received })),
      ...this.outData.map(r => ({ ...r, type: 'out', date: r.Date }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (all.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p class="empty-state-title">No Transactions</p>
          <p class="empty-state-text">Record your first stock movement</p>
        </div>`;
      return;
    }

    container.innerHTML = all.slice(0, 50).map(r => {
      const isIn = r.type === 'in';
      const product = App.getProductBySKU(r.SKU);
      const productName = r.Product_Name || (product ? product.Product_Name : '');
      return `
        <div class="list-item">
          <div class="list-item-icon" style="background:${isIn ? 'var(--color-mint-light)' : 'var(--color-red-light)'};">
            ${isIn ? '📥' : '📤'}
          </div>
          <div class="list-item-content">
            <div class="list-item-title">${r.SKU} ${productName ? '· ' + productName : ''}</div>
            <div class="list-item-meta">${App.formatDate(r.date)} ${r.Reason ? '· ' + r.Reason : ''} ${r.Batch_Number ? '· Batch: ' + r.Batch_Number : ''}</div>
          </div>
          <div class="list-item-value" style="color:${isIn ? '#059669' : 'var(--color-red)'};">
            ${isIn ? '+' : '-'}${r.Quantity}
          </div>
        </div>`;
    }).join('');
  }
};
