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
    const input = document.getElementById('csv-file-input');
    const importBtn = document.getElementById('csv-import-btn');
    if (!dropZone || !input) return;

    dropZone.onclick = () => input.click();
    input.onchange = (e) => this.processUpload(e.target.files[0]);
    
    if (importBtn) {
      importBtn.onclick = () => this.confirmUpload();
    }
  },

  assignBatchFIFO(sku, qtyNeeded) {
    // We deep clone summary locally in processUpload, but assignBatchFIFO is called there.
    // It's safer to pass the active summary map so preview doesn't permanently modify it until confirm.
    return []; // We'll handle this in processUpload
  },

  processUpload(file) {
    if (!file) return;
    App.showLoading();
    
    // Create a deep copy of summary to simulate FIFO for the preview without touching real stock yet
    const localSummary = JSON.parse(JSON.stringify(this.summary));
    
    const assignBatchFIFOLocal = (sku, qtyNeeded) => {
      const batches = localSummary
        .filter(s => s.SKU === sku && s.Warehouse_Type === 'Online Warehouse' && s.Qty > 0)
        .sort((a, b) => {
          if (a.Expiry_Date && b.Expiry_Date) return new Date(a.Expiry_Date) - new Date(b.Expiry_Date);
          if (a.Expiry_Date) return -1;
          if (b.Expiry_Date) return 1;
          return a.Batch_Number.localeCompare(b.Batch_Number);
        });

      const assignments = [];
      let remaining = qtyNeeded;

      for (const b of batches) {
        if (remaining <= 0) break;
        const take = Math.min(b.Qty, remaining);
        assignments.push({ batch: b.Batch_Number, qty: take });
        remaining -= take;
      }

      if (remaining > 0) {
        assignments.push({ batch: 'ONLINE-AUTO', qty: remaining });
      }

      return assignments;
    };

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = typeof XLSX !== 'undefined' ? XLSX.read(data, { type: 'array' }) : null;
        if (!workbook) throw new Error("XLSX library not loaded. Please ensure you are connected to the internet.");
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const rawJson = XLSX.utils.sheet_to_json(worksheet);
        if (!rawJson || rawJson.length === 0) {
          throw new Error("File is empty or invalid format.");
        }

        const outRows = [];
        const recapMap = {};
        let minDate = null;
        let maxDate = null;
        
        // Sort master products by length descending so more specific names take priority
        const sortedMaster = [...AppState.masterData].sort((a, b) => b.Product_Name.length - a.Product_Name.length);
        
        for (const row of rawJson) {
          // Status check: ignore cancelled or pending/unpaid orders
          const status = String(row['Status Pesanan'] || row['Order Status'] || '').toLowerCase();
          if (status.includes('batal') || status.includes('pending') || status.includes('belum') || status.includes('unpaid')) {
            continue; // Skip cancelled or unconfirmed/pending orders
          }
          
          // Rely on Product Name matching against Master Product Data instead of SKU
          const rawName = String(row['Nama Produk'] || row['Product Name'] || row['Nama Variasi'] || '').trim();
          if (!rawName) continue;
          const lowerName = rawName.toLowerCase();
          
          let matchedProduct = null;
          for (const mp of sortedMaster) {
            if (lowerName.includes(mp.Product_Name.toLowerCase())) {
              matchedProduct = mp;
              break;
            }
          }
          
          // Fallback keyword matching if direct substring fails
          if (!matchedProduct) {
            for (const mp of sortedMaster) {
              const keywords = mp.Product_Name.toLowerCase().split(/\s+/).filter(k => k.length > 2);
              const hasAll = keywords.length > 0 && keywords.every(k => lowerName.includes(k));
              if (hasAll) {
                matchedProduct = mp;
                break;
              }
            }
          }

          if (!matchedProduct) {
            continue; // Skip items that don't match any Master Product
          }
          
          const sku = matchedProduct.SKU;
          const productName = matchedProduct.Product_Name;

          const variasi = String(row['Nama Variasi'] || row['Variation Name'] || '').toLowerCase();
          let multiplier = 1;
          if (variasi.includes('triple')) multiplier = 3;
          else if (variasi.includes('twin')) multiplier = 2;
          
          const rawQty = Number(row['Jumlah'] || row['Quantity'] || 1) || 1;
          const totalQty = rawQty * multiplier;
          
          const refId = String(row['No. Pesanan'] || row['Order ID'] || '').trim();
          let dateStr = String(row['Waktu Pesanan Dibuat'] || row['Order Creation Date'] || '').trim();
          if (dateStr.length >= 10) dateStr = dateStr.substring(0, 10);
          else dateStr = App.todayStr();

          if (!minDate || dateStr < minDate) minDate = dateStr;
          if (!maxDate || dateStr > maxDate) maxDate = dateStr;

          // Track recap aggregation
          if (!recapMap[sku]) {
            recapMap[sku] = {
              SKU: sku,
              Product_Name: productName,
              totalQty: 0,
              totalValue: 0
            };
          }
          recapMap[sku].totalQty += totalQty;
          
          // Extract Net Value
          const valStr = String(row['Total Harga Produk'] || row['Total Pembayaran'] || '0').replace(/\./g, '');
          const netVal = Number(valStr.replace(/[^0-9]/g, '')) || 0;
          recapMap[sku].totalValue += netVal;

          // Apply FIFO logic using local summary
          const batchAssignments = assignBatchFIFOLocal(sku, totalQty);
          
          for (const ba of batchAssignments) {
            outRows.push({
              SKU: sku,
              Quantity: ba.qty,
              Date: dateStr,
              Reason: 'Online Sales',
              Reference_ID: refId,
              Batch_Number: ba.batch,
              Warehouse_Type: 'Online Warehouse'
            });
            // Decrement local summary so next row sees updated stock
            const summaryRow = localSummary.find(s => s.SKU === sku && s.Warehouse_Type === 'Online Warehouse' && s.Batch_Number === ba.batch);
            if (summaryRow) summaryRow.Qty -= ba.qty;
          }
        }

        const recapItems = Object.values(recapMap);

        if (outRows.length === 0 || recapItems.length === 0) {
          App.hideLoading();
          App.toast("No valid completed sales items matching Master Products found.", "info");
          document.getElementById('csv-file-input').value = '';
          return;
        }

        // Store globally for confirmation
        this.pendingOutRows = outRows;
        
        // Render Grouped Recap Preview
        const previewEl = document.getElementById('csv-preview');
        const importBtn = document.getElementById('csv-import-btn');
        const dateRangeDisplay = (minDate && maxDate && minDate !== maxDate) ? `${minDate} to ${maxDate}` : (minDate || App.todayStr());

        if (previewEl && importBtn) {
          previewEl.innerHTML = `
            <div style="background:var(--bg-secondary); padding:12px 16px; border-radius:8px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-size:11px; color:var(--text-tertiary); text-transform:uppercase; font-weight:600;">Date Range</div>
                <div style="font-weight:700; font-size:13px; color:var(--color-primary);">${dateRangeDisplay}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:11px; color:var(--text-tertiary); text-transform:uppercase; font-weight:600;">Matched Items</div>
                <div style="font-weight:700; font-size:13px;">${recapItems.length} Products</div>
              </div>
            </div>
            <div style="font-weight:700; margin-bottom:8px; font-size:13px;">Sales Summary Recap</div>
            <div class="table-responsive" style="max-height:320px; overflow-y:auto;">
              <table class="data-table" style="font-size:12px;">
                <thead>
                  <tr>
                    <th>Item (Master Product)</th>
                    <th style="text-align:center;">Net Qty Sold</th>
                    <th style="text-align:right;">Est. Net Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${recapItems.map(r => `
                    <tr>
                      <td>
                        <div style="font-weight:600; color:var(--text-primary);">${r.Product_Name}</div>
                        <div style="font-size:10px; color:var(--text-tertiary);">${r.SKU}</div>
                      </td>
                      <td style="text-align:center;">
                        <span class="badge badge-admin" style="font-weight:700; font-size:12px;">${r.totalQty}</span>
                      </td>
                      <td style="text-align:right; font-weight:600; color:var(--text-secondary);">
                        ${App.formatCurrency(r.totalValue)}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
          previewEl.classList.remove('hidden');
          importBtn.classList.remove('hidden');
          importBtn.innerHTML = `Execute Deduction (${outRows.length} total units across batches)`;
        }

        App.hideLoading();
        App.toast("E-commerce summary ready! Review recap before execution.", 'success');
        document.getElementById('csv-file-input').value = '';

      } catch (err) {
        App.hideLoading();
        console.error(err);
        App.toast("Error parsing e-commerce data. Make sure format is correct.", 'danger');
        document.getElementById('csv-file-input').value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  },



  async confirmUpload() {
    if (!this.pendingOutRows || this.pendingOutRows.length === 0) return;
    
    App.showLoading();
    try {
      const result = await API.call('bulkAddInventoryOut', { rows: this.pendingOutRows });
      App.hideLoading();
      if (result.success) {
        App.toast(`Successfully processed ${this.pendingOutRows.length} stock out transactions!`, 'success');
        
        // Reset preview
        this.pendingOutRows = null;
        document.getElementById('csv-preview').classList.add('hidden');
        document.getElementById('csv-import-btn').classList.add('hidden');
        
        this.load();
        // Reload dashboard to update charts
        if (typeof Dashboard !== 'undefined' && AppState.currentPage === 'dashboard') Dashboard.load();
      } else {
        App.toast(result.error || "Failed to process bulk stock out.", 'danger');
      }
    } catch (err) {
      App.hideLoading();
      App.toast("Network error during execution.", 'danger');
    }
  }
};
