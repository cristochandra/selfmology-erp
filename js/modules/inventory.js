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
      skuMap[p.SKU] = { SKU: p.SKU, Product_Name: p.Product_Name, Offline: 0, Online: 0, Clinic: 0, Total: 0 };
    });

    this.summary.forEach(s => {
      if (skuMap[s.SKU]) {
        const wh = String(s.Warehouse_Type).trim();
        if (wh === 'Warehouse') skuMap[s.SKU].Offline += Number(s.Qty);
        else if (wh === 'Clinic (Express)') skuMap[s.SKU].Clinic += Number(s.Qty);
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
            <div style="font-size: 10px; color: var(--text-tertiary);">Offline WH</div>
            <div style="font-weight: 700;">${item.Offline}</div>
          </div>
          <div style="flex: 1; border-left: 1px solid var(--border-light); padding-left: 12px;">
            <div style="font-size: 10px; color: var(--text-tertiary);">Online WH</div>
            <div style="font-weight: 700; color: ${item.Online < 10 ? 'var(--color-danger)' : 'var(--text-primary)'}">${item.Online}</div>
          </div>
          <div style="flex: 1; border-left: 1px solid var(--border-light); padding-left: 12px;">
            <div style="font-size: 10px; color: var(--text-tertiary);">Clinic (Express)</div>
            <div style="font-weight: 700;">${item.Clinic}</div>
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
              <td><span style="font-size:10px; padding:2px 6px;" class="badge ${s.Warehouse_Type === 'Warehouse' ? 'badge-staff' : 'badge-admin'}">${s.Warehouse_Type === 'Warehouse' ? 'Offline' : (String(s.Warehouse_Type).trim() === 'Clinic (Express)' ? 'Clinic' : 'Online')}</span></td>
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
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 150);

    if (all.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No history yet.</p></div>';
      return;
    }

    container.innerHTML = all.map(row => {
      // Look up product name from master data if missing
      let pName = row.Product_Name || '';
      if (!pName && row.SKU) {
        const prod = AppState.masterData.find(p => String(p.SKU).trim() === String(row.SKU).trim());
        if (prod) pName = prod.Product_Name;
      }
      
      // Determine colors and character based on type and reason
      let iconColor = 'var(--color-red)';
      let iconBg = 'var(--color-red-light)';
      let iconChar = '↑';
      
      const isMove = (row.Reason && row.Reason.includes('Stock Move')) || (row.Reference_ID && String(row.Reference_ID).startsWith('MOVE-'));
      
      if (isMove) {
        iconColor = 'var(--color-primary)';
        iconBg = 'var(--color-primary-light)';
        iconChar = '⇄';
      } else if (row.type === 'IN') {
        iconColor = 'var(--color-mint)';
        iconBg = 'var(--color-mint-light)';
        iconChar = '↓';
      }
      
      return `
      <div class="list-item">
        <div class="list-item-icon" style="background: ${iconBg}; color: ${iconColor}; font-weight: bold; font-size: 16px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
          ${iconChar}
        </div>
        <div class="list-item-content">
          <div class="list-item-title">${row.SKU} · ${pName}</div>
          <div class="list-item-meta">${row.date} · <strong style="color:${iconColor};">${isMove ? 'MOVE' : row.type}</strong> · ${row.type === 'IN' ? 'Inbound' : (row.Reason || 'Outbound')} · Qty <strong>${row.qty}</strong></div>
          <div style="font-size: 10px; color: var(--text-tertiary);">Batch: ${row.Batch_Number || '-'} · <strong>${row.Warehouse_Type || 'Warehouse'}</strong> · Ref: ${row.Reference_ID || '-'}</div>
        </div>
      </div>
      `;
    }).join('');
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
    return [];
  },

  // ---- E-commerce CSV mapping config ----
  // Map Shopee "SKU Induk" (column N) -> master SKU(s). A listing can expand to
  // multiple master SKUs (bundles). Pack size always comes from "Nama Variasi".
  // Add new marketplace listings here without touching the parsing logic.
  ECOMMERCE_SKU_MAP: {
    '002': [{ sku: 'SM-OCC-100', units: 1 }],                                  // Oil Control Cleanser
    '006': [{ sku: 'SM-OCC-100', units: 1 }],                                  // Twin Oil Control Cleanser listing
    '011': [{ sku: 'SM-OCC-100', units: 1 }],                                  // Triple Pack Cleanser (Sabun, Salicylic)
    '005': [{ sku: 'SM-CT-100', units: 1 }],                                   // Twin Cleansing Toner listing
    '003': [{ sku: 'SM-OCC-100', units: 1 }, { sku: 'SM-CT-100', units: 1 }]   // Bundle = 1 OCC + 1 CT
    // '009' (Cleansing Cotton Pads) intentionally omitted -> ignored
  },

  processUpload(file) {
    if (!file) return;
    App.showLoading();

    const CUTOVER = '2026-06-25'; // orders on/after this date deduct stock; before it = revenue/qty only

    // Pack size from "Nama Variasi" (Q): Single/blank=1, Twin=2, Triple=3, else parse "(N pcs)".
    const packSizeFromVariation = (variation) => {
      const v = String(variation || '').toLowerCase();
      const m = v.match(/(\d+)\s*pcs/);
      if (m) return Number(m[1]) || 1;
      if (v.indexOf('triple') !== -1) return 3;
      if (v.indexOf('twin') !== -1 || v.indexOf('double') !== -1) return 2;
      return 1; // single / blank / unknown
    };

    // Resolve a row to master targets [{sku, units}].
    // 1) by SKU Induk map  2) name-keyword fallback (resilient to new listings).
    const resolveTargets = (skuInduk, rawName) => {
      const raw = String(skuInduk || '').trim();
      const stripped = raw.replace(/^0+(?=\d)/, '');
      const map = this.ECOMMERCE_SKU_MAP;
      const direct = map[raw] || map[stripped] || map['0' + stripped] || map['00' + stripped];
      if (direct) return direct;
      const n = String(rawName || '').toLowerCase();
      if (n.indexOf('sunscreen') !== -1 || n.indexOf('uv shield') !== -1 || n.indexOf('spf') !== -1) return [{ sku: 'SM-UVS-025', units: 1 }];
      if (n.indexOf('cleansing toner') !== -1 || (n.indexOf('toner') !== -1 && n.indexOf('niacinamide') !== -1)) return [{ sku: 'SM-CT-100', units: 1 }];
      if (n.indexOf('cleanser') !== -1 || n.indexOf('oil control') !== -1 || (n.indexOf('sabun') !== -1 && n.indexOf('salicylic') !== -1)) return [{ sku: 'SM-OCC-100', units: 1 }];
      return null; // unmapped (e.g. cotton pads) -> ignore
    };

    // Route to warehouse by "Opsi Pengiriman" (G).
    const routeWarehouse = (carrier) => {
      const c = String(carrier || '').toLowerCase();
      if (c.indexOf('same day') !== -1 || c.indexOf('gosend') !== -1 || c.indexOf('grabexpress') !== -1 || c.indexOf('instant') !== -1) {
        return 'Clinic (Express)';
      }
      return 'Online Warehouse';
    };

    // Indonesian currency uses '.' as thousands separator -> strip non-digits.
    const idrToNumber = (val) => Number(String(val == null ? '' : val).replace(/[^0-9]/g, '')) || 0;

    const matchProduct = (rawName, masterData) => {
      const lowerName = rawName.toLowerCase();
      
      // 1. Direct contains check
      const directMatch = masterData.find(mp => 
        lowerName.includes(mp.Product_Name.toLowerCase()) ||
        mp.Product_Name.toLowerCase().includes(lowerName)
      );
      if (directMatch) return directMatch;
      
      // 2. Normalized check (ignoring spaces, punctuation, special chars like +)
      const normalize = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normName = normalize(rawName);
      if (normName.length > 3) {
        const normMatch = masterData.find(mp => {
          const normMP = normalize(mp.Product_Name);
          return normName.includes(normMP) || normMP.includes(normName);
        });
        if (normMatch) return normMatch;
      }
      
      // 3. Specific keyword mappings based on Selfmology product lines
      if (lowerName.includes('cleanser')) {
        const p = masterData.find(mp => mp.SKU === 'SM-CLN-001');
        if (p) return p;
      }
      if (lowerName.includes('toner')) {
        const p = masterData.find(mp => mp.SKU === 'SM-TNR-001');
        if (p) return p;
      }
      if (lowerName.includes('serum')) {
        const p = masterData.find(mp => mp.SKU === 'SM-SRM-001');
        if (p) return p;
      }
      if (lowerName.includes('moisturizer') || lowerName.includes('moist')) {
        const p = masterData.find(mp => mp.SKU === 'SM-MST-001');
        if (p) return p;
      }
      if (lowerName.includes('mask')) {
        const p = masterData.find(mp => mp.SKU === 'SM-MSK-001');
        if (p) return p;
      }
      if (lowerName.includes('eye')) {
        const p = masterData.find(mp => mp.SKU === 'SM-EYE-001');
        if (p) return p;
      }
      if (lowerName.includes('sunscreen') || lowerName.includes('uv shield') || lowerName.includes('uvshield')) {
        const p = masterData.find(mp => mp.SKU === 'SM-UVS-025');
        if (p) return p;
      }
      
      // 4. Keyword overlapping match fallback
      for (const mp of masterData) {
        const keywords = mp.Product_Name.toLowerCase().split(/\s+/).filter(k => k.length > 2 && k !== 'pack' && k !== 'shield');
        if (keywords.length > 0 && keywords.every(k => lowerName.includes(k))) {
          return mp;
        }
      }
      return null;
    };

    // Create a deep copy of summary to simulate FIFO for the preview without touching real stock yet
    const localSummary = JSON.parse(JSON.stringify(this.summary));
    
    const assignBatchFIFOLocal = (sku, qtyNeeded, warehouse) => {
      const batches = localSummary
        .filter(s => s.SKU === sku && s.Warehouse_Type === warehouse && s.Qty > 0)
        .sort((a, b) => {
          if (a.Expiry_Date && b.Expiry_Date) return new Date(a.Expiry_Date) - new Date(b.Expiry_Date);
          if (a.Expiry_Date) return -1;
          if (b.Expiry_Date) return 1;
          return String(a.Batch_Number).localeCompare(String(b.Batch_Number));
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
        assignments.push({ batch: warehouse === 'Clinic (Express)' ? 'CLINIC-AUTO' : 'ONLINE-AUTO', qty: remaining });
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
        const rawSales = [];
        const recapMap = {};
        let minDate = null;
        let maxDate = null;
        let skippedDuplicates = 0;
        
        // Sort master products by length descending so more specific names take priority
        const sortedMaster = [...AppState.masterData].sort((a, b) => b.Product_Name.length - a.Product_Name.length);
        
        // Dedupe across re-uploads: every processed line is recorded in
        // Ecommerce_Sales as `${Order_ID}|${SKU}`. Skip lines already there
        // (covers pre-cutover revenue-only rows too) and in-file repeats.
        let existingKeys = new Set();
        try {
          const idsRes = await API.call('getEcommerceOrderIds');
          if (idsRes && idsRes.success && Array.isArray(idsRes.data)) existingKeys = new Set(idsRes.data);
        } catch (e) {}
        const seenKeys = new Set();

        for (const row of rawJson) {
          // Skip cancelled orders only ("Batal"); everything else is a real sale.
          const status = String(row['Status Pesanan'] || row['Order Status'] || '').toLowerCase().trim();
          if (status.indexOf('batal') !== -1 || status.indexOf('cancel') !== -1) continue;

          const rawName = String(row['Nama Produk'] || row['Product Name'] || '').trim();
          const skuInduk = String(row['SKU Induk'] || row['Nomor Referensi SKU'] || '').trim();
          const targets = resolveTargets(skuInduk, rawName);
          if (!targets) continue; // unmapped listing (e.g. Cotton Pads) -> ignore

          const refId = String(row['No. Pesanan'] || row['Order ID'] || '').trim();
          const variasi = String(row['Nama Variasi'] || row['Variation Name'] || '').trim();
          const packSize = packSizeFromVariation(variasi);
          const jumlah = Number(row['Jumlah'] || row['Quantity'] || 1) || 1;

          let dateStr = String(row['Waktu Pesanan Dibuat'] || row['Order Creation Date'] || '').trim();
          if (dateStr.length >= 10) dateStr = dateStr.substring(0, 10);
          else dateStr = App.todayStr();
          if (!minDate || dateStr < minDate) minDate = dateStr;
          if (!maxDate || dateStr > maxDate) maxDate = dateStr;

          // Net revenue = Harga Setelah Diskon (S) − Voucher Ditanggung Penjual (AC)
          const priceAfterDisc = idrToNumber(row['Harga Setelah Diskon'] || row['Harga Awal'] || 0);
          const voucherSeller = idrToNumber(row['Voucher Ditanggung Penjual'] || 0);
          const netRevenue = Math.max(0, priceAfterDisc - voucherSeller);

          const carrier = String(row['Opsi Pengiriman'] || row['Courier'] || row['Jasa Kirim'] || '').trim();
          const warehouse = routeWarehouse(carrier);
          const statusLabel = row['Status Pesanan'] || row['Order Status'] || 'Selesai';

          // Channel detection
          let channel = 'Shopee';
          const firstKeyStr = JSON.stringify(Object.keys(row)).toLowerCase();
          if (firstKeyStr.includes('tokopedia')) channel = 'Tokopedia';
          else if (firstKeyStr.includes('tiktok')) channel = 'TikTok Shop';

          // A listing may expand to multiple master SKUs (bundle). Attribute the
          // line's net revenue to the FIRST target only (no double-count);
          // quantities apply to each component.
          targets.forEach((t, ti) => {
            const sku = t.sku;
            const product = AppState.masterData.find(m => m.SKU === sku);
            const productName = product ? product.Product_Name : sku;
            const qtyPcs = jumlah * packSize * (t.units || 1);
            const lineNet = ti === 0 ? netRevenue : 0;

            const dedupeKey = `${refId}|${sku}`;
            if (refId && (existingKeys.has(dedupeKey) || seenKeys.has(dedupeKey))) { skippedDuplicates++; return; }
            if (refId) seenKeys.add(dedupeKey);

            if (!recapMap[sku]) recapMap[sku] = { SKU: sku, Product_Name: productName, totalQty: 0, totalValue: 0 };
            recapMap[sku].totalQty += qtyPcs;
            recapMap[sku].totalValue += lineNet;

            rawSales.push({
              Order_ID: refId,
              Date: dateStr,
              Channel: channel,
              SKU: sku,
              Product_Name: productName,
              Variation_Name: variasi,
              Quantity: qtyPcs,
              Raw_Quantity: jumlah,
              Price: priceAfterDisc,
              Total_Price: lineNet,
              Status: statusLabel,
              Shipping_Carrier: carrier,
              Net_Revenue: lineNet,
              Warehouse_Type: warehouse
            });

            // Deduct stock only for orders on/after the cutover date.
            if (dateStr >= CUTOVER) {
              const reason = warehouse === 'Clinic (Express)' ? 'Clinic Sales' : 'Online Sales';
              const batchAssignments = assignBatchFIFOLocal(sku, qtyPcs, warehouse);
              for (const ba of batchAssignments) {
                outRows.push({
                  SKU: sku,
                  Quantity: ba.qty,
                  Date: dateStr,
                  Reason: reason,
                  Reference_ID: refId,
                  Batch_Number: ba.batch,
                  Warehouse_Type: warehouse
                });
                const summaryRow = localSummary.find(s => s.SKU === sku && s.Warehouse_Type === warehouse && s.Batch_Number === ba.batch);
                if (summaryRow) summaryRow.Qty -= ba.qty;
              }
            }
          });
        }

        const recapItems = Object.values(recapMap);

        if (recapItems.length === 0) {
          App.hideLoading();
          let msg = "No valid completed sales items matching Master Products found.";
          if (skippedDuplicates > 0) {
            msg += ` (${skippedDuplicates} duplicate rows were skipped)`;
          }
          App.toast(msg, "info");
          document.getElementById('csv-file-input').value = '';
          return;
        }

        // Store globally for confirmation
        this.pendingOutRows = outRows;
        this.pendingRawSales = rawSales;
        
        // Render Grouped Recap Preview
        const previewEl = document.getElementById('csv-preview');
        const importBtn = document.getElementById('csv-import-btn');
        const dateRangeDisplay = (minDate && maxDate && minDate !== maxDate) ? `${minDate} to ${maxDate}` : (minDate || App.todayStr());

        if (previewEl && importBtn) {
          let duplicateWarning = '';
          if (skippedDuplicates > 0) {
            duplicateWarning = `
              <div style="background: var(--color-orange-light); border-left: 4px solid var(--color-orange); padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 12px; color: var(--color-orange); line-height: 1.5; font-weight: 500;">
                ⚠️ <strong>Duplicate Prevention:</strong> ${skippedDuplicates} transaction lines in this file were skipped because they have already been imported previously.
              </div>
            `;
          }

          previewEl.innerHTML = `
            ${duplicateWarning}
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
                    <th style="text-align:right;">Est. Value/Unit</th>
                    <th style="text-align:right;">Est. Net Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${recapItems.map(r => {
                    const valPerUnit = r.totalQty > 0 ? Math.round(r.totalValue / r.totalQty) : 0;
                    return `
                    <tr>
                      <td>
                        <div style="font-weight:600; color:var(--text-primary);">${r.Product_Name}</div>
                        <div style="font-size:10px; color:var(--text-tertiary);">${r.SKU}</div>
                      </td>
                      <td style="text-align:center;">
                        <span class="badge badge-admin" style="font-weight:700; font-size:12px;">${r.totalQty}</span>
                      </td>
                      <td style="text-align:right; font-weight:600; color:var(--text-tertiary);">
                        ${App.formatCurrency(valPerUnit)}
                      </td>
                      <td style="text-align:right; font-weight:600; color:var(--text-secondary);">
                        ${App.formatCurrency(r.totalValue)}
                      </td>
                    </tr>
                  `}).join('')}
                </tbody>
              </table>
            </div>
          `;
          previewEl.classList.remove('hidden');
          importBtn.classList.remove('hidden');
          const totalPcsDeducted = outRows.reduce((sum, r) => sum + r.Quantity, 0);
          const totalPcsSold = recapItems.reduce((sum, r) => sum + r.totalQty, 0);
          if (totalPcsDeducted > 0) {
            importBtn.innerHTML = `Execute Deduction (Deduct: ${totalPcsDeducted} Pcs, Total Sales: ${totalPcsSold} Pcs)`;
          } else {
            importBtn.innerHTML = `Record Sales Only (Total Sales: ${totalPcsSold} Pcs)`;
          }
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
    if ((!this.pendingOutRows || this.pendingOutRows.length === 0) && (!this.pendingRawSales || this.pendingRawSales.length === 0)) return;
    
    App.showLoading();
    try {
      const result = await API.call('bulkAddInventoryOut', { 
        rows: this.pendingOutRows || [],
        rawSales: this.pendingRawSales || []
      });
      App.hideLoading();
      if (result.success) {
        const count = (this.pendingOutRows ? this.pendingOutRows.length : 0);
        const salesCount = (this.pendingRawSales ? this.pendingRawSales.length : 0);
        App.toast(`Successfully processed ${count} stock deductions and ${salesCount} sales records!`, 'success');
        
        // Reset preview
        this.pendingOutRows = null;
        this.pendingRawSales = null;
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
  },

  async resetOnlineTransactions() {
    App.confirm(
      'Reset Online Transactions',
      'Are you sure you want to delete and reverse all online CSV transaction records from the inventory ledger? This will restore stock counts for the stock opname.',
      async () => {
        App.showLoading();
        try {
          const result = await API.call('resetOnlineTransactions');
          App.hideLoading();
          if (result.success) {
            App.toast(result.message, 'success');
            this.load();
            if (typeof Dashboard !== 'undefined' && AppState.currentPage === 'dashboard') Dashboard.load();
          } else {
            App.toast(result.error || 'Failed to reset online transactions.', 'danger');
          }
        } catch (err) {
          App.hideLoading();
          App.toast('Network error during reset.', 'danger');
        }
      },
      'danger'
    );
  }
};
