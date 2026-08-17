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
    this.renderReconciliation();

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
  // Map a Shopee listing -> master SKU(s). A listing can expand to multiple
  // master SKUs (bundles); pack size is resolved separately by packSize().
  //
  // Shopee's SKU scheme was renamed in Aug 2026: numeric parent codes
  // ("002", "011", "B-0010") became alpha codes ("CL-02", "SS-04", "BD-02"),
  // and the variation SKU gained the pack size as a third segment
  // ("CL-02-3" = 3 pcs). The rename also CONSOLIDATES listings — the three
  // separate cleanser listings 002/006/011 are all "CL-02" now.
  //
  // Historical exports still carry the old codes and get re-uploaded to close
  // deduction gaps (TK-002), so BOTH schemes stay mapped here permanently.
  // Never delete the legacy block.
  ECOMMERCE_SKU_MAP: {
    // ---- current scheme (SKU Induk, post-rename) ----
    'CL-02': [{ sku: 'SM-OCC-100', units: 1 }],                                 // Oil Control Cleanser (all cleanser listings)
    'TN-01': [{ sku: 'SM-CT-100', units: 1 }],                                  // Cleansing Toner
    'SS-04': [{ sku: 'SM-UVS-025', units: 1 }],                                 // UV Shield Sunscreen SPF50
    'SS-08': [{ sku: 'SM-AUV-025', units: 1 }],                                 // Acneshield UV Defense Sunscreen Glow (new Aug 2026)
    'BD-01': [{ sku: 'SM-OCC-100', units: 1 }, { sku: 'SM-CT-100', units: 1 }],                                 // OCC + Toner
    'BD-02': [{ sku: 'SM-OCC-100', units: 1 }, { sku: 'SM-UVS-025', units: 1 }],                                // OCC + UV Shield
    'BD-03': [{ sku: 'SM-UVS-025', units: 1 }, { sku: 'SM-CT-100', units: 1 }],                                 // UV Shield + Toner
    'BD-04': [{ sku: 'SM-OCC-100', units: 1 }, { sku: 'SM-CT-100', units: 1 }, { sku: 'SM-UVS-025', units: 1 }], // Acne Kit Trio
    'BD-06': [{ sku: 'SM-OCC-100', units: 1 }, { sku: 'SM-CT-100', units: 1 }, { sku: 'SM-AUV-025', units: 1 }], // Triple Defense Trio (new Aug 2026)

    // ---- legacy numeric scheme (exports created before the rename) ----
    '002': [{ sku: 'SM-OCC-100', units: 1 }],                                   // Oil Control Cleanser        -> CL-02
    '006': [{ sku: 'SM-OCC-100', units: 1 }],                                   // Twin Oil Control Cleanser   -> CL-02
    '011': [{ sku: 'SM-OCC-100', units: 1 }],                                   // Triple Pack Cleanser        -> CL-02
    '005': [{ sku: 'SM-CT-100', units: 1 }],                                    // Twin Cleansing Toner        -> TN-01
    '004': [{ sku: 'SM-UVS-025', units: 1 }],                                   // UV Shield Sunscreen         -> SS-04
    '012': [{ sku: 'SM-UVS-025', units: 1 }],                                   // Triple Pack UV Shield       -> SS-04
    '003': [{ sku: 'SM-OCC-100', units: 1 }, { sku: 'SM-CT-100', units: 1 }],                                   // -> BD-01
    '007': [{ sku: 'SM-OCC-100', units: 1 }, { sku: 'SM-CT-100', units: 1 }, { sku: 'SM-UVS-025', units: 1 }],   // Acne Kit Trio -> BD-04
    '0010': [{ sku: 'SM-OCC-100', units: 1 }, { sku: 'SM-UVS-025', units: 1 }],                                  // Morning routine pack -> BD-02
    'B-0010': [{ sku: 'SM-OCC-100', units: 1 }, { sku: 'SM-UVS-025', units: 1 }]                                 // same listing, later code
  },

  // Listings that deliberately do NOT move finished-goods stock. Listed
  // explicitly (rather than just left unmapped) so an unmapped listing can be
  // reported as a warning instead of silently vanishing from the deduction.
  ECOMMERCE_IGNORED_SKUS: [
    'CP-09', '009',        // Cleansing Cotton Pads — accessory, not stock-tracked
    'GA-01',               // Greeting Card
    'GA-02',               // Box Wrapping
    'GA-03',               // Extra Bubble Wrap  (packaging stock pending TK-004)
    'BD-05'                // DUO Bestfriend Gift Set — composition unconfirmed (TK-007)
  ],

  processUpload(file) {
    if (!file) return;
    App.showLoading();

    const CUTOVER = '2026-06-25'; // orders on/after this date deduct stock; before it = revenue/qty only

    // Pack size (pcs per ordered unit).
    //
    // Post-rename, the variation SKU is authoritative: its third segment IS the
    // quantity — "CL-02-3" = 3 pcs, "SS-08-2" = 2 pcs. Only a full three-segment
    // LL-NN-N match counts, so a suffix-less bundle parent ("BD-02") is never
    // misread as 2 pcs, and a lettered variant ("CP-09-A" = Bulat) is never
    // misread as a quantity.
    //
    // Legacy rows (variation SKU "1103", "0010") don't match that shape and
    // fall through to the "Nama Variasi" text rule, which is how they have
    // always been read — so re-uploading any pre-rename month is unchanged.
    const PACK_FROM_VARIATION_SKU = /^[A-Za-z]{2}-\d{2}-(\d+)$/;

    const packSizeOf = (variationSku, variationName) => {
      const bySku = String(variationSku || '').trim().match(PACK_FROM_VARIATION_SKU);
      if (bySku) return Number(bySku[1]) || 1;

      const v = String(variationName || '').toLowerCase();
      const m = v.match(/(\d+)\s*pcs/);
      if (m) return Number(m[1]) || 1;
      if (v.indexOf('triple') !== -1) return 3;
      if (v.indexOf('twin') !== -1 || v.indexOf('double') !== -1) return 2;
      return 1; // single / blank / unknown
    };

    const isIgnoredListing = (code) => {
      const c = String(code || '').trim().toUpperCase();
      if (!c) return false;
      return this.ECOMMERCE_IGNORED_SKUS.some(ig => c === ig.toUpperCase());
    };

    // Read the product name into master targets, independently of any SKU.
    // Used twice: as the fallback for an unmapped listing, and as a cross-check
    // on every mapped listing (see resolveTargets).
    //
    // Bundles are tested FIRST: "Bundle Oil Control Cleanser + UV Shield
    // Sunscreen" contains "sunscreen", so a single-product test run first would
    // deduct only the sunscreen and silently drop the cleanser.
    const targetsFromName = (rawName) => {
      const n = String(rawName || '').toLowerCase();
      if (!n) return null;
      const has = (...words) => words.every(w => n.indexOf(w) !== -1);
      const isSunscreen = n.indexOf('sunscreen') !== -1 || n.indexOf('uv shield') !== -1 || n.indexOf('uv defense') !== -1 || n.indexOf('acneshield') !== -1 || n.indexOf('spf') !== -1;
      const isToner = n.indexOf('toner') !== -1;
      const isCleanser = n.indexOf('cleanser') !== -1 || n.indexOf('oil control') !== -1 || has('sabun', 'salicylic');
      const looksBundled = n.indexOf('bundle') !== -1 || n.indexOf('kit') !== -1 || n.indexOf('trio') !== -1 || n.indexOf('duo') !== -1 || n.indexOf('paket') !== -1 || n.indexOf('+') !== -1;
      const acne = n.indexOf('acneshield') !== -1 || n.indexOf('uv defense') !== -1;

      if (looksBundled) {
        const parts = [];
        if (isCleanser) parts.push({ sku: 'SM-OCC-100', units: 1 });
        if (isToner) parts.push({ sku: 'SM-CT-100', units: 1 });
        if (isSunscreen) parts.push({ sku: acne ? 'SM-AUV-025' : 'SM-UVS-025', units: 1 });
        if (parts.length > 1) return parts;   // >1 component = a real bundle
      }

      if (acne) return [{ sku: 'SM-AUV-025', units: 1 }];
      if (isSunscreen) return [{ sku: 'SM-UVS-025', units: 1 }];
      if (n.indexOf('cleansing toner') !== -1 || (isToner && n.indexOf('niacinamide') !== -1)) return [{ sku: 'SM-CT-100', units: 1 }];
      if (isCleanser) return [{ sku: 'SM-OCC-100', units: 1 }];
      return null; // name has no opinion (cotton pads, gift wrapping, gift sets)
    };

    // Compare a SKU-map result against the name at PRODUCT FAMILY level rather
    // than exact SKU. The name can tell "sunscreen" from "toner", but it cannot
    // tell UV Shield from Acneshield — both are sunscreens — so comparing exact
    // SKUs would fire on every BD-06 sale. Families keep the check meaningful.
    const familyOf = (sku) => ({
      'SM-OCC-100': 'cleanser',
      'SM-CT-100': 'toner',
      'SM-UVS-025': 'sunscreen',
      'SM-AUV-025': 'sunscreen'
    })[sku] || sku;

    const familySignature = (targets) =>
      [...new Set((targets || []).map(t => familyOf(t.sku)))].sort().join('+');

    // Listings whose SKU->name disagreement was checked and is expected.
    // Keyed by parent code, value is the name-derived signature to tolerate.
    const CROSSCHECK_EXCEPTIONS = {};

    // Warnings raised during this file's parse, deduped per listing.
    const mismatchWarnings = new Map();

    // Resolve a row to master targets [{sku, units}], or null to skip the line.
    //   1) SKU Induk lookup (both schemes)
    //   2) parent derived from the variation SKU, when SKU Induk is blank
    //   3) name-keyword fallback, for a listing created before it is mapped here
    //
    // A SKU-map hit is never trusted blindly: Shopee reassigned parent codes
    // wholesale in the Aug 2026 rename, so a stale map entry would keep
    // deducting the wrong product with no visible symptom. The name is read on
    // every row and any family-level disagreement is surfaced in the preview
    // BEFORE the user confirms. The map still wins — it is the explicit
    // configuration — but the operator gets told.
    const resolveTargets = (skuInduk, variationSku, rawName) => {
      const map = this.ECOMMERCE_SKU_MAP;

      const lookup = (code) => {
        const raw = String(code || '').trim();
        if (!raw) return null;
        const upper = raw.toUpperCase();
        const stripped = raw.replace(/^0+(?=\d)/, '');
        return map[raw] || map[upper] || map[stripped] || map['0' + stripped] || map['00' + stripped] || null;
      };

      const varSku = String(variationSku || '').trim();
      const parentFromVar = varSku.match(PACK_FROM_VARIATION_SKU) ? varSku.replace(/-\d+$/, '') : varSku;

      const byName = targetsFromName(rawName);

      const crossCheck = (code, viaSku) => {
        if (!byName) return viaSku;              // name has no opinion -> nothing to compare
        const wantSig = familySignature(byName);
        const gotSig = familySignature(viaSku);
        if (wantSig === gotSig) return viaSku;
        if (CROSSCHECK_EXCEPTIONS[code] === wantSig) return viaSku;
        const key = `${code}|${wantSig}|${gotSig}`;
        if (!mismatchWarnings.has(key)) {
          mismatchWarnings.set(key, {
            code, lines: 0, name: String(rawName || '').trim(),
            mapped: (viaSku || []).map(t => t.sku).join(' + '),
            expected: (byName || []).map(t => t.sku).join(' + ')
          });
        }
        mismatchWarnings.get(key).lines++;
        return viaSku;                            // map still wins; operator is warned
      };

      // An ignored listing is still cross-checked, so that a code landing on the
      // ignore list while its name says "cleanser" cannot silently drop stock.
      if (isIgnoredListing(skuInduk)) { crossCheck(skuInduk, []); return null; }

      const direct = lookup(skuInduk);
      if (direct) return crossCheck(skuInduk, direct);

      // SKU Induk blank/unknown -> recover the parent from the variation SKU
      // ("CL-02-3" -> "CL-02"), then retry.
      if (isIgnoredListing(parentFromVar)) { crossCheck(parentFromVar, []); return null; }
      const viaVariation = lookup(parentFromVar);
      if (viaVariation) return crossCheck(parentFromVar, viaVariation);

      return byName; // unmapped listing -> trust the name, or null if it has none
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
        
        // Dedupe across re-uploads, keyed by `${Order_ID}|${SKU}`:
        //   salesKeys     -> a sale already recorded in Ecommerce_Sales
        //   deductionKeys -> stock already deducted in Inventory_Out (online/clinic)
        // A line's SALE is skipped only when its key is in salesKeys, but its
        // stock is still DEDUCTED when the key is missing from deductionKeys.
        // This lets a full-month re-upload close gaps (orders whose sale was
        // recorded but stock never deducted — TK-002) without ever
        // double-counting an order that was already fully handled.
        let salesKeys = new Set();
        let deductionKeys = new Set();
        try {
          const idsRes = await API.call('getEcommerceOrderIds');
          if (idsRes && idsRes.success) {
            if (Array.isArray(idsRes.data)) salesKeys = new Set(idsRes.data);
            if (Array.isArray(idsRes.deductionKeys)) deductionKeys = new Set(idsRes.deductionKeys);
          }
        } catch (e) {}
        const seenSales = new Set();
        const seenDeduct = new Set();
        let newSalesLines = 0, newDeductionLines = 0, repairedDeductionLines = 0;

        for (const row of rawJson) {
          // Skip cancelled orders only ("Batal"); everything else is a real sale.
          const status = String(row['Status Pesanan'] || row['Order Status'] || '').toLowerCase().trim();
          if (status.indexOf('batal') !== -1 || status.indexOf('cancel') !== -1) continue;

          const rawName = String(row['Nama Produk'] || row['Product Name'] || '').trim();
          // "SKU Induk" = parent listing code, "Nomor Referensi SKU" = variation
          // code. Post-rename the variation code carries the pack size, so the
          // two are read as separate fields rather than one falling back to the other.
          const skuInduk = String(row['SKU Induk'] || row['Parent SKU'] || '').trim();
          const variationSku = String(row['Nomor Referensi SKU'] || row['SKU'] || '').trim();
          const targets = resolveTargets(skuInduk, variationSku, rawName);
          if (!targets) continue; // unmapped listing (e.g. Cotton Pads) -> ignore

          const refId = String(row['No. Pesanan'] || row['Order ID'] || '').trim();
          const variasi = String(row['Nama Variasi'] || row['Variation Name'] || '').trim();
          const packSize = packSizeOf(variationSku, variasi);
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
            const soldAlready = refId && (salesKeys.has(dedupeKey) || seenSales.has(dedupeKey));
            const deductedAlready = refId && (deductionKeys.has(dedupeKey) || seenDeduct.has(dedupeKey));
            const eligibleForStock = dateStr >= CUTOVER;

            // Fully handled already (sale recorded AND — if post-cutover — stock
            // deducted): skip entirely so a full-month re-upload never double-counts.
            if (soldAlready && (!eligibleForStock || deductedAlready)) { skippedDuplicates++; return; }

            // 1) Record the SALE only if it isn't in Ecommerce_Sales yet.
            if (!soldAlready) {
              if (refId) seenSales.add(dedupeKey);
              newSalesLines++;
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
            }

            // 2) Deduct stock for post-cutover orders that haven't been deducted
            // yet. Runs even when the sale was already recorded, repairing the
            // "stock out not recorded" gap (TK-002).
            if (eligibleForStock && !deductedAlready) {
              if (refId) seenDeduct.add(dedupeKey);
              if (soldAlready) repairedDeductionLines++; else newDeductionLines++;
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

        // Nothing new to record AND nothing to repair -> file already fully imported.
        if (recapItems.length === 0 && outRows.length === 0) {
          App.hideLoading();
          let msg = "No new sales or deductions found — this file is already fully imported.";
          if (skippedDuplicates > 0) {
            msg = `Everything in this file was already imported (${skippedDuplicates} lines skipped). Nothing to do.`;
          }
          // Nothing is being written, but a mismatch here means the earlier
          // import already deducted the wrong product — still worth saying.
          if (mismatchWarnings.size > 0) {
            App.toast(`${mismatchWarnings.size} listing(s) have a SKU/product-name mismatch — the SKU map may be stale. Check ECOMMERCE_SKU_MAP.`, "warning");
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
                ⚠️ <strong>Duplicate Prevention:</strong> ${skippedDuplicates} order lines already fully imported were skipped (no double-count).
              </div>
            `;
          }

          // Highlight recovered deductions: orders whose sale was previously
          // recorded but whose stock was never deducted, now being repaired.
          let repairNotice = '';
          if (repairedDeductionLines > 0) {
            repairNotice = `
              <div style="background: var(--color-blue-light, #e8f1ff); border-left: 4px solid var(--color-blue, #2563eb); padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 12px; color: var(--color-blue, #2563eb); line-height: 1.5; font-weight: 500;">
                🔧 <strong>Gap Repair:</strong> ${repairedDeductionLines} order line(s) were sold earlier but never had stock deducted. Their stock will now be deducted (sale not re-counted).
              </div>
            `;
          }

          // SKU->name disagreement. Shown before confirmation because the stock
          // effect is invisible afterwards: the deduction simply lands on the
          // wrong product. Red rather than orange — this one wants a decision.
          let mismatchNotice = '';
          if (mismatchWarnings.size > 0) {
            const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            const items = [...mismatchWarnings.values()].sort((a, b) => b.lines - a.lines);
            const totalLines = items.reduce((s, w) => s + w.lines, 0);
            mismatchNotice = `
              <div style="background: var(--color-red-light, #fee2e2); border-left: 4px solid var(--color-red, #dc2626); padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 12px; color: var(--color-red, #dc2626); line-height: 1.5;">
                <div style="font-weight:700; margin-bottom:6px;">
                  🚨 SKU / product-name mismatch — ${totalLines} line(s) across ${items.length} listing(s)
                </div>
                <div style="font-weight:500; margin-bottom:8px;">
                  The SKU map and the product name disagree about what was sold. Stock will be deducted per the SKU map. Check these before you confirm.
                </div>
                ${items.map(w => `
                  <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(220,38,38,.25);">
                    <div style="font-weight:600;">[${esc(w.code) || 'no code'}] × ${w.lines} line(s)</div>
                    <div style="font-size:11px; opacity:.9;">${esc(w.name).slice(0, 90)}</div>
                    <div style="font-size:11px; margin-top:2px;">
                      deducting <strong>${esc(w.mapped) || '(nothing — on ignore list)'}</strong>
                      · name suggests <strong>${esc(w.expected)}</strong>
                    </div>
                  </div>`).join('')}
              </div>
            `;
          }

          const chip = (label, val, color) => `
            <div style="flex:1; min-width:96px; background:var(--bg-secondary); border-radius:8px; padding:10px 12px; text-align:center;">
              <div style="font-size:18px; font-weight:800; color:${color};">${val}</div>
              <div style="font-size:10px; color:var(--text-tertiary); text-transform:uppercase; font-weight:600; margin-top:2px;">${label}</div>
            </div>`;
          const breakdown = `
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
              ${chip('New Sales', newSalesLines, 'var(--color-primary)')}
              ${chip('New Deductions', newDeductionLines, 'var(--color-green, #16a34a)')}
              ${chip('Gap Repairs', repairedDeductionLines, 'var(--color-blue, #2563eb)')}
              ${chip('Skipped (dup)', skippedDuplicates, 'var(--text-tertiary)')}
            </div>`;

          previewEl.innerHTML = `
            ${mismatchNotice}
            ${duplicateWarning}
            ${repairNotice}
            ${breakdown}
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
            <div style="font-weight:700; margin-bottom:8px; font-size:13px;">${recapItems.length > 0 ? 'Sales Summary Recap' : 'No new sales — stock-gap repair only'}</div>
            <div class="table-responsive ${recapItems.length > 0 ? '' : 'hidden'}" style="max-height:320px; overflow-y:auto;">
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
          if (totalPcsSold > 0 && totalPcsDeducted > 0) {
            importBtn.innerHTML = `Execute (Deduct: ${totalPcsDeducted} Pcs, New Sales: ${totalPcsSold} Pcs)`;
          } else if (totalPcsDeducted > 0) {
            importBtn.innerHTML = `Repair Stock Deductions (${totalPcsDeducted} Pcs)`;
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
        this.renderReconciliation(true);
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
  },

  // TK-002: Reconciliation & Import Log. Proves every post-cutover online sale
  // has a matching stock deduction, and lists each import batch with the
  // order-date window it covered so coverage gaps are visible.
  async renderReconciliation(force) {
    const el = document.getElementById('ecom-reconciliation');
    if (!el) return;
    if (force) el.innerHTML = '<p class="text-sm text-secondary">Refreshing…</p>';

    let res;
    try {
      res = await API.call('getEcommerceReconciliation');
    } catch (e) {
      el.innerHTML = '<p class="text-sm" style="color:var(--color-red);">Could not load reconciliation (network error).</p>';
      return;
    }
    if (!res || !res.success) {
      el.innerHTML = '<p class="text-sm" style="color:var(--color-red);">Reconciliation unavailable. Redeploy the backend to enable it.</p>';
      return;
    }

    const perSku = res.perSku || [];
    const imports = res.imports || [];
    const byMonth = res.byMonth || [];
    const mismatches = perSku.filter(r => r.diff !== 0);
    const money = (n) => (typeof App.formatCurrency === 'function') ? App.formatCurrency(n || 0) : ('Rp ' + (Number(n) || 0).toLocaleString('id-ID'));

    // ---- Section 1: balance banner + per-SKU sold vs deducted ----
    const statusBanner = mismatches.length === 0
      ? `<div style="background:var(--color-green-light,#e7f7ec); border-left:4px solid var(--color-green,#16a34a); padding:12px 16px; border-radius:6px; margin-bottom:20px; font-size:12px; color:var(--color-green,#16a34a); font-weight:600;">
           ✅ In balance — every online sale on/after ${res.cutover} has its stock deducted. No missing deductions.
         </div>`
      : `<div style="background:var(--color-red-light,#fdeaea); border-left:4px solid var(--color-red,#dc2626); padding:12px 16px; border-radius:6px; margin-bottom:20px; font-size:12px; color:var(--color-red,#dc2626); font-weight:600;">
           ⚠️ ${mismatches.length} product(s) don't balance — sold ≠ deducted. Re-upload the full-month file to auto-repair.
         </div>`;

    const skuRows = perSku.map(r => {
      const ok = r.diff === 0;
      const color = ok ? 'var(--color-green,#16a34a)' : 'var(--color-red,#dc2626)';
      const label = ok ? '✓ Balanced' : (r.diff > 0 ? `${r.diff} pcs not deducted` : `${-r.diff} pcs over-deducted`);
      return `<tr>
        <td><div style="font-weight:600;">${r.Product_Name}</div><div style="font-size:10px; color:var(--text-tertiary);">${r.SKU}</div></td>
        <td style="text-align:center;">${r.sold}</td>
        <td style="text-align:center;">${r.deducted}</td>
        <td style="text-align:right; font-weight:700; color:${color};">${label}</td>
      </tr>`;
    }).join('');

    // ---- Section 2: coverage by order month (did I capture the whole month?) ----
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthLabel = (mo) => {
      const m = /^(\d{4})-(\d{2})$/.exec(mo || '');
      return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (mo || 'Unknown');
    };
    // Fill interior month gaps (e.g. a month with zero recorded orders between
    // two months that have data) so a forgotten upload is visible, not invisible.
    const monthIdx = (mo) => { const m = /^(\d{4})-(\d{2})$/.exec(mo || ''); return m ? Number(m[1]) * 12 + (Number(m[2]) - 1) : null; };
    const idxToMonth = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
    let monthRows = byMonth.slice();
    const realIdx = byMonth.map(m => monthIdx(m.month)).filter(i => i !== null);
    if (realIdx.length > 1) {
      const hi = Math.max(...realIdx), lo = Math.min(...realIdx);
      const present = new Set(realIdx);
      const filled = [];
      for (let i = hi; i >= lo; i--) {
        const found = byMonth.find(m => monthIdx(m.month) === i);
        if (found) filled.push(found);
        else if (!present.has(i)) filled.push({ month: idxToMonth(i), orderCount: 0, pcs: 0, revenue: 0, _gap: true });
      }
      monthRows = filled;
    }
    const monthSection = byMonth.length === 0 ? '' : `
      <div style="font-weight:700; margin:4px 0 4px; font-size:13px;">Coverage by order month</div>
      <p class="text-xs text-secondary" style="margin-bottom:8px;">How many completed orders are recorded for each month. A highlighted row = zero orders recorded; re-upload that month's export to be sure you didn't miss it (duplicates are skipped automatically).</p>
      <div class="table-responsive" style="margin-bottom:24px;">
        <table class="data-table" style="font-size:12px;">
          <thead><tr>
            <th>Month</th>
            <th style="text-align:center;">Orders</th>
            <th style="text-align:center;">Pcs</th>
            <th style="text-align:right;">Est. Net Revenue</th>
          </tr></thead>
          <tbody>${monthRows.map(m => m._gap ? `
            <tr style="background:var(--color-orange-light,#fff4e5);">
              <td style="font-weight:600; color:var(--color-orange,#d97706);">${monthLabel(m.month)}</td>
              <td colspan="3" style="text-align:center; color:var(--color-orange,#d97706); font-size:11px; font-weight:600;">⚠️ No orders recorded — check if this month's upload was missed</td>
            </tr>` : `
            <tr>
              <td style="font-weight:600;">${monthLabel(m.month)}</td>
              <td style="text-align:center;">${m.orderCount}</td>
              <td style="text-align:center;">${m.pcs}</td>
              <td style="text-align:right; font-weight:600;">${money(m.revenue)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    // ---- Section 3: import log with type badges + coverage + revenue ----
    const daysBetween = (a, b) => {
      if (!a || !b) return 0;
      return Math.round((new Date(b) - new Date(a)) / 86400000);
    };
    const earliestImport = imports.reduce((min, b) => (!min || String(b.Import_Date) < min) ? String(b.Import_Date) : min, null);
    const badge = (b) => {
      const span = daysBetween(b.minDate, b.maxDate);
      let text, bg, fg;
      if (b.Import_Date === earliestImport || span > 45 || b.lineCount >= 60) { text = 'Initial load'; bg = 'var(--bg-secondary)'; fg = 'var(--text-secondary)'; }
      else if (span > 10) { text = 'Catch-up'; bg = 'var(--color-blue-light,#e8f1ff)'; fg = 'var(--color-blue,#2563eb)'; }
      else { text = 'Weekly'; bg = 'var(--color-green-light,#e7f7ec)'; fg = 'var(--color-green,#16a34a)'; }
      return `<span style="display:inline-block; font-size:10px; font-weight:700; padding:2px 8px; border-radius:999px; background:${bg}; color:${fg};">${text}</span>`;
    };
    const hasRevenue = imports.some(b => b.revenue !== undefined);
    const importRows = imports.map(b => `
      <tr>
        <td><div style="font-weight:600;">${b.Import_Date}</div><div style="margin-top:2px;">${badge(b)}</div></td>
        <td style="text-align:center;">${b.minDate && b.maxDate ? (b.minDate === b.maxDate ? b.minDate : b.minDate + ' → ' + b.maxDate) : '—'}</td>
        <td style="text-align:center; font-weight:600;">${b.orderCount}</td>
        <td style="text-align:center;">${b.pcs}</td>
        ${hasRevenue ? `<td style="text-align:right;">${money(b.revenue)}</td>` : ''}
      </tr>`).join('');
    const importSection = `
      <div style="font-weight:700; margin-bottom:4px; font-size:13px;">Import log — every upload</div>
      <p class="text-xs text-secondary" style="margin-bottom:8px;">Each row is one file you uploaded, newest first. <strong>Orders covered</strong> is the span of order dates inside that file. Re-uploading is always safe — orders already recorded are skipped, never double-counted.</p>
      <div class="table-responsive">
        <table class="data-table" style="font-size:12px;">
          <thead><tr>
            <th>Uploaded</th>
            <th style="text-align:center;">Orders covered</th>
            <th style="text-align:center;">New orders</th>
            <th style="text-align:center;">Pcs</th>
            ${hasRevenue ? '<th style="text-align:right;">Net revenue</th>' : ''}
          </tr></thead>
          <tbody>${importRows || `<tr><td colspan="${hasRevenue ? 5 : 4}" style="text-align:center; color:var(--text-tertiary);">No imports yet.</td></tr>`}</tbody>
        </table>
      </div>`;

    el.innerHTML = `
      ${statusBanner}
      <div style="font-weight:700; margin-bottom:8px; font-size:13px;">Sold vs. deducted (per product, on/after ${res.cutover})</div>
      <div class="table-responsive" style="margin-bottom:24px;">
        <table class="data-table" style="font-size:12px;">
          <thead><tr>
            <th>Product</th>
            <th style="text-align:center;">Sold (pcs)</th>
            <th style="text-align:center;">Deducted (pcs)</th>
            <th style="text-align:right;">Status</th>
          </tr></thead>
          <tbody>${skuRows || '<tr><td colspan="4" style="text-align:center; color:var(--text-tertiary);">No online sales recorded yet.</td></tr>'}</tbody>
        </table>
      </div>
      ${monthSection}
      ${importSection}
    `;
  }
};
