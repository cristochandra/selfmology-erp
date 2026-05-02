// ============================================================
// SELFMOLOGY ERP – Inventory Module
// Updated: Batch Tracking, Dual Warehouse, Stock Move
// ============================================================

const Inventory = {
  inData: [],
  outData: [],
  summary: [],

  async load() {
    const [inResult, outResult, summaryResult] = await Promise.all([
      API.call('getInventoryIn'),
      API.call('getInventoryOut'),
      API.call('getStockSummary')
    ]);

    if (inResult.success) this.inData = inResult.data;
    if (outResult.success) this.outData = outResult.data;
    if (summaryResult.success) this.summary = summaryResult.data;

    this.renderHistory();
    this.renderSummary();
    this.bindForms();
    this.bindCSV();

    const today = App.todayStr();
    document.getElementById('si-date').value = today;
    document.getElementById('so-date').value = today;
  },

  bindForms() {
    // SKU Selectors
    document.querySelectorAll('.sku-dropdown').forEach(sel => {
      const id = sel.id;
      sel.addEventListener('change', (e) => {
        if (id === 'si-sku') {
          const product = App.getProductBySKU(e.target.value);
          document.getElementById('si-product-name').value = product ? product.Product_Name : '';
        } else if (id === 'so-sku') {
          this.loadBatchDropdown('so');
        } else if (id === 'sm-sku') {
          this.loadBatchDropdown('sm');
        }
      });
    });

    document.getElementById('stock-in-form').onsubmit = (e) => { e.preventDefault(); this.submitStockIn(); };
    document.getElementById('stock-out-form').onsubmit = (e) => { e.preventDefault(); this.submitStockOut(); };
    document.getElementById('stock-move-form').onsubmit = (e) => { e.preventDefault(); this.submitMove(); };
  },

  loadBatchDropdown(prefix) {
    const sku = document.getElementById(`${prefix}-sku`).value;
    const batchSelect = document.getElementById(`${prefix}-batch`);
    if (!batchSelect) return;
    
    batchSelect.innerHTML = '<option value="">Select Batch...</option>';
    
    // For Move Stock, show batches from the "From" warehouse
    const fromWH = prefix === 'sm' ? document.getElementById('sm-from').value : document.getElementById('so-warehouse').value;
    
    const batches = this.summary.filter(s => s.SKU === sku && s.Warehouse_Type === fromWH && s.Qty > 0);
    
    batches.forEach(b => {
      const expStr = b.Expiry_Date ? ` (Exp: ${b.Expiry_Date})` : '';
      batchSelect.innerHTML += `<option value="${b.Batch_Number}">${b.Batch_Number}${expStr} · ${b.Qty} pcs</option>`;
    });

    if (batches.length === 0) {
      batchSelect.innerHTML += `<option value="" disabled>No stock available in ${fromWH}</option>`;
    }
  },

  async submitStockIn() {
    const data = {
      SKU: document.getElementById('si-sku').value,
      Date_Received: document.getElementById('si-date').value,
      Quantity: document.getElementById('si-quantity').value,
      Batch_Number: document.getElementById('si-batch').value,
      Expiry_Date: document.getElementById('si-expiry').value,
      Warehouse_Type: document.getElementById('si-warehouse').value,
      Location: document.getElementById('si-location').value
    };

    if (!data.SKU || !data.Quantity) {
      App.toast('SKU and Quantity are required.', 'warning');
      return;
    }

    const result = await API.call('addInventoryIn', data);
    if (result.success) {
      App.toast(result.message, 'success');
      document.getElementById('stock-in-form').reset();
      this.load();
    }
  },

  async submitStockOut() {
    const data = {
      SKU: document.getElementById('so-sku').value,
      Batch_Number: document.getElementById('so-batch').value,
      Warehouse_Type: document.getElementById('so-warehouse').value,
      Date: document.getElementById('so-date').value,
      Quantity: document.getElementById('so-quantity').value,
      Reason: document.getElementById('so-reason').value,
      Reference_ID: document.getElementById('so-reference').value
    };

    if (!data.SKU || !data.Quantity || !data.Batch_Number) {
      App.toast('SKU, Quantity, and Batch Number are required.', 'warning');
      return;
    }

    const result = await API.call('addInventoryOut', data);
    if (result.success) {
      App.toast(result.message, 'success');
      document.getElementById('stock-out-form').reset();
      this.load();
    } else {
      App.toast(result.error, 'danger');
    }
  },

  async submitMove() {
    const data = {
      SKU: document.getElementById('sm-sku').value,
      Batch_Number: document.getElementById('sm-batch').value,
      From_Warehouse: document.getElementById('sm-from').value,
      To_Warehouse: document.getElementById('sm-to').value,
      Quantity: document.getElementById('sm-quantity').value
    };

    if (!data.SKU || !data.Quantity || !data.Batch_Number) {
      App.toast('All fields are required for stock move.', 'warning');
      return;
    }

    const result = await API.call('moveStock', data);
    if (result.success) {
      App.toast('Stock moved successfully.', 'success');
      document.getElementById('stock-move-form').reset();
      this.load();
    } else {
      App.toast(result.error, 'danger');
    }
  },

  // --- Stock Summary ---
  renderSummary() {
    const container = document.getElementById('inv-summary-list');
    if (!container) return;

    const skuMap = {};
    AppState.masterData.forEach(p => {
      skuMap[p.SKU] = { SKU: p.SKU, Product_Name: p.Product_Name, Offline: 0, Online: 0, Total: 0 };
    });

    this.summary.forEach(s => {
      if (skuMap[s.SKU]) {
        if (s.Warehouse_Type === 'Warehouse') skuMap[s.SKU].Offline += Number(s.Qty);
        else skuMap[s.SKU].Online += Number(s.Qty);
        skuMap[s.SKU].Total += Number(s.Qty);
      }
    });

    const items = Object.values(skuMap).sort((a, b) => a.Total - b.Total);

    container.innerHTML = items.map(item => `
      <div class="card mb-md" style="padding: 16px; cursor: pointer;" onclick="Inventory.showSkuDetails('${item.SKU}')">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <div style="font-weight: 700; font-size: 14px;">${item.Product_Name}</div>
            <div style="font-size: 11px; color: var(--text-tertiary);">${item.SKU}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 800; font-size: 18px; color: ${item.Total < 10 ? 'var(--color-danger)' : 'var(--text-primary)'}">${item.Total}</div>
            <div style="font-size: 9px; text-transform: uppercase;">Total Units</div>
          </div>
        </div>
        
        <div style="display: flex; gap: 12px; border-top: 1px solid var(--border-light); padding-top: 10px;">
          <div style="flex: 1;">
            <div style="font-size: 10px; color: var(--text-tertiary);">Offline Warehouse</div>
            <div style="font-weight: 700;">${item.Offline}</div>
          </div>
          <div style="flex: 1; border-left: 1px solid var(--border-light); padding-left: 12px;">
            <div style="font-size: 10px; color: var(--text-tertiary);">Online Warehouse</div>
            <div style="font-weight: 700; color: ${item.Online < 10 ? 'var(--color-danger)' : 'var(--text-primary)'}">${item.Online}</div>
          </div>
        </div>
        ${item.Online < 10 ? '<div style="margin-top: 6px; font-size: 10px; color: var(--color-danger); font-weight: 600;">⚠️ Low Online Stock</div>' : ''}
      </div>
    `).join('');
  },

  showSkuDetails(sku) {
    const skuData = this.summary.filter(s => s.SKU === sku);
    const product = App.getProductBySKU(sku);
    
    let html = `
      <h2 class="modal-title" style="margin-bottom:4px;">${product ? product.Product_Name : sku}</h2>
      <div style="font-size: 12px; color: var(--text-tertiary); margin-bottom: 16px;">Batch details & Expiry dates</div>
      
      <table class="data-table" style="font-size: 13px;">
        <thead>
          <tr>
            <th>Type</th>
            <th>Batch</th>
            <th>Qty</th>
            <th>Exp</th>
          </tr>
        </thead>
        <tbody>
          ${skuData.map(s => `
            <tr>
              <td><span style="font-size:10px; padding:2px 6px;" class="badge ${s.Warehouse_Type === 'Warehouse' ? 'badge-staff' : 'badge-admin'}">${s.Warehouse_Type === 'Warehouse' ? 'Offline' : 'Online'}</span></td>
              <td>${s.Batch_Number || '-'}</td>
              <td style="font-weight:700;">${s.Qty}</td>
              <td style="font-size: 10px;">${s.Expiry_Date || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <button class="btn btn-primary btn-full mt-lg" onclick="App.closeModal()">Close</button>
    `;
    App.openModal(html);
  },

  renderHistory() {
    const container = document.getElementById('inv-history-list');
    if (!container) return;

    const all = [
      ...this.inData.map(r => ({ ...r, type: 'IN', date: r.Date_Received, qty: r.Quantity })),
      ...this.outData.map(r => ({ ...r, type: 'OUT', date: r.Date, qty: r.Quantity }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);

    if (all.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No history yet.</p></div>';
      return;
    }

    container.innerHTML = all.map(row => `
      <div class="list-item">
        <div class="list-item-icon ${row.type === 'IN' ? 'text-success' : 'text-danger'}" style="background: var(--bg-secondary);">
          ${row.type === 'IN' ? '↓' : '↑'}
        </div>
        <div class="list-item-content">
          <div class="list-item-title">${row.SKU} · ${row.Product_Name || ''}</div>
          <div class="list-item-meta">${row.date} · ${row.type === 'IN' ? 'Inbound' : (row.Reason || 'Outbound')} · <strong>${row.qty}</strong></div>
          <div style="font-size: 10px; color: var(--text-tertiary);">Batch: ${row.Batch_Number || '-'} · ${row.Warehouse_Type || 'Warehouse'}</div>
        </div>
      </div>
    `).join('');
  },

  bindCSV() {
    const dropZone = document.getElementById('csv-drop-zone');
    if (!dropZone) return;

    dropZone.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv';
      input.onchange = (e) => this.processCSV(e.target.files[0]);
      input.click();
    };
  },

  processCSV(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const lines = text.trim().split('\n');
      if (lines.length < 2) return;

      const headers = lines[0].split(',').map(h => h.trim());
      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((h, i) => { obj[h] = values[i]; });
        return obj;
      });

      const result = await API.call('bulkAddInventoryOut', { rows });
      if (result.success) {
        App.toast(result.message, 'success');
        this.load();
      }
    };
    reader.readAsText(file);
  }
};
