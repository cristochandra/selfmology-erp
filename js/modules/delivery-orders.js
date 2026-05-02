// ============================================================
// SELFMOLOGY ERP – Delivery Orders Module
// Updated: Payment status tracking with proof of payment upload,
//          proceed-from-invoice flow
// ============================================================

const DeliveryOrders = {
  orders: [],

  async load() {
    try {
      const result = await API.call('getDeliveryOrders');
      if (result.success) {
        this.orders = result.data.reverse();
        this.render();
      } else {
        throw new Error(result.error || 'Failed to load delivery orders');
      }
    } catch (err) {
      console.error(err);
      const container = document.getElementById('delivery-list');
      if (container) {
        container.innerHTML = `<div class="empty-state"><p class="text-danger">Error loading data: ${err.message}</p></div>`;
      }
    }
  },

  render() {
    const container = document.getElementById('delivery-list');
    if (!container) return;

    if (!this.orders || this.orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🚚</div>
          <p class="empty-state-title">No Delivery Orders</p>
          <p class="empty-state-text">Create a DO from a finalized invoice</p>
        </div>`;
      return;
    }

    container.innerHTML = this.orders.map(d => {
      const payBadge = d.Payment_Status === 'Paid'
        ? '<span class="badge badge-finalized">Paid</span>'
        : '<span class="badge badge-low-stock">Unpaid</span>';
      return `
        <div class="list-item" onclick="DeliveryOrders.showDetail('${d.DO_ID}')">
          <div class="list-item-icon" style="background:${d.Status === 'Executed' ? 'var(--color-mint-light)' : 'var(--color-primary-light)'};">
            ${d.Status === 'Executed' ? '✅' : '📦'}
          </div>
          <div class="list-item-content">
            <div class="list-item-title">${d.DO_ID}</div>
            <div class="list-item-meta">Invoice: ${d.Invoice_ID} · ${App.formatDate(d.Date_Created)}</div>
          </div>
          <div style="text-align:right;">
            <span class="badge ${d.Status === 'Executed' ? 'badge-executed' : 'badge-pending'}">${d.Status}</span>
            <div style="margin-top:4px;">${payBadge}</div>
          </div>
        </div>`;
    }).join('');
  },

  async showDetail(doId) {
    const d = this.orders.find(o => o.DO_ID === doId);
    if (!d) return;

    // Fetch line items, stock summary, invoices (for customer name) and customers (for address)
    const [lineResult, summaryResult, invoicesResult, custResult] = await Promise.all([
      API.call('getLineItems', { Invoice_ID: d.Invoice_ID }),
      API.call('getStockSummary'),
      API.call('getInvoices'),
      API.call('getCustomers')
    ]);
    
    const lines = lineResult.success ? lineResult.data : [];
    const summary = summaryResult.success ? summaryResult.data : [];
    const invoices = invoicesResult.success ? invoicesResult.data : [];
    const inv = invoices.find(i => i.Invoice_ID === d.Invoice_ID);
    const customerName = inv ? inv.Customer_Name : '';
    const customers = custResult.success ? custResult.data.map(c => typeof c === 'string' ? { Customer_Name: c } : c) : [];
    const customer = customers.find(c => c.Customer_Name === customerName);
    const defaultAddress = customer ? (customer.Address || '') : '';

    const isPaid = d.Payment_Status === 'Paid';
    const isExecuted = d.Status === 'Executed';

    let html = `
      <h3 class="modal-title">Delivery Order</h3>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div class="flex-between">
          <span class="text-sm text-secondary">DO ID</span>
          <span class="text-sm text-bold">${d.DO_ID}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Invoice</span>
          <span class="text-sm text-bold">${d.Invoice_ID}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Date Created</span>
          <span class="text-sm">${App.formatDate(d.Date_Created)}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Delivery Status</span>
          <span class="badge ${isExecuted ? 'badge-executed' : 'badge-pending'}">${d.Status}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Payment Status</span>
          <span class="badge ${isPaid ? 'badge-finalized' : 'badge-low-stock'}">${d.Payment_Status || 'Unpaid'}</span>
        </div>
        ${isExecuted ? `
        <div class="flex-between" style="align-items:flex-start;">
          <span class="text-sm text-secondary">Shipping Address</span>
          <span class="text-sm text-right" style="max-width:200px;word-break:break-word;">${d.Shipping_Address || defaultAddress || '-'}</span>
        </div>
        ` : `
        <div class="form-group mb-sm mt-sm">
          <label class="form-label">Shipping Address</label>
          <textarea id="do-shipping-address" class="form-input" rows="3" placeholder="Enter shipping address...">${d.Shipping_Address || defaultAddress}</textarea>
        </div>
        `}

        <hr style="border:none;border-top:1px solid var(--border-light);">
        <h4 class="text-sm text-bold">Items to Deliver</h4>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>SKU</th><th>Product</th><th>Qty</th></tr></thead>
            <tbody>
              ${lines.map((l, index) => {
                const product = App.getProductBySKU(l.SKU);
                
                // Find all available batches for this SKU (offline warehouse only)
                const batches = summary.filter(s => s.SKU === l.SKU && s.Qty > 0 && String(s.Warehouse_Type).trim() === 'Warehouse');
                // Sort by Expiry Date ascending (closest first)
                batches.sort((a, b) => new Date(a.Expiry_Date || '2100-01-01').getTime() - new Date(b.Expiry_Date || '2100-01-01').getTime());
                
                let batchOptions = batches.map((b, bIdx) => {
                  const isRecommended = bIdx === 0 ? ' ✨' : '';
                  return `<option value="${b.Warehouse_Type}|${b.Batch_Number}">Batch: ${b.Batch_Number || '-'} (Exp: ${b.Expiry_Date ? App.formatDate(b.Expiry_Date) : '-'} | Qty: ${b.Qty})${isRecommended}</option>`;
                }).join('');
                
                if (batchOptions === '') {
                  batchOptions = '<option value="">No offline batches found in stock</option>';
                }

                return `
                  <tr>
                    <td>${l.SKU}</td>
                    <td style="white-space:normal;">${product ? product.Product_Name : '-'}</td>
                    <td>${l.Quantity}</td>
                  </tr>
                  ${!isExecuted ? `
                  <tr>
                    <td colspan="3" style="padding-top:4px; padding-bottom:12px; border-bottom:1px solid var(--border-light);">
                      <div style="background:var(--bg-light); padding:8px; border-radius:var(--radius-sm);">
                        <label class="form-label" style="font-size:11px; margin-bottom:4px;">Select Batch (${l.Quantity} units) <span style="color:var(--color-primary);font-weight:600;margin-left:8px;">✨ Recommended</span></label>
                        <select id="do-batch-${index}" class="form-input do-batch-select" data-sku="${l.SKU}" data-qty="${l.Quantity}" style="font-size:12px; padding:6px;">
                          ${batchOptions}
                        </select>
                      </div>
                    </td>
                  </tr>
                  ` : ''}`;
              }).join('')}
              ${lines.length === 0 ? '<tr><td colspan="3" class="text-center text-secondary">No items found</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        <!-- Execute Delivery Section -->
        ${!isExecuted ? `
          <div class="mt-lg">
            <div style="background:var(--color-orange-light);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:12px;">
              <p class="text-sm" style="color:var(--color-orange);">
                <strong>⚠️ Important:</strong> Executing this DO will deduct inventory for all items above. This cannot be undone.
              </p>
            </div>
            <button class="btn btn-primary btn-full btn-lg" onclick="DeliveryOrders.handleExecute('${d.DO_ID}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
              Execute Delivery
            </button>
          </div>
        ` : `
          <div style="background:var(--color-mint-light);border-radius:var(--radius-md);padding:12px 16px; margin-bottom:12px;">
            <p class="text-sm" style="color:#059669;">
              <strong>✅ Executed</strong> – Inventory has been deducted for all items.
            </p>
          </div>
          <button class="btn btn-secondary btn-full btn-lg mb-md" onclick="DeliveryOrders.printDO('${d.DO_ID}')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-right:8px;"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print Delivery Order
          </button>
        `}

        <!-- Payment Status Section -->
        <hr style="border:none;border-top:1px solid var(--border-light);">
        <h4 class="text-sm text-bold">Payment</h4>

        ${isPaid ? `
          <div style="background:var(--color-mint-light);border-radius:var(--radius-md);padding:12px 16px;">
            <p class="text-sm" style="color:#059669;"><strong>✅ Payment Received</strong></p>
          </div>
          ${d.Payment_Proof_URL ? `
            <div class="mt-sm">
              <p class="text-xs text-secondary mb-sm">Proof of Payment</p>
              <img src="${d.Payment_Proof_URL}" alt="Payment proof" style="max-width:100%;border-radius:var(--radius-md);border:1px solid var(--border-light);">
            </div>
          ` : ''}
          <button class="btn btn-secondary btn-full mt-md" onclick="DeliveryOrders.updatePayment('${d.DO_ID}', 'Unpaid')">
            Mark as Unpaid
          </button>
        ` : `
          <div class="form-group mt-sm">
            <label class="form-label">Upload Proof of Payment</label>
            <div class="file-upload" id="payment-proof-drop-${d.DO_ID}" style="padding:16px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:24px;height:24px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <div class="file-upload-text">Tap to upload</div>
              <div class="file-upload-hint">Image of transfer proof</div>
            </div>
            <input type="file" id="payment-proof-input-${d.DO_ID}" accept="image/*" class="hidden">
            <div id="payment-proof-preview-${d.DO_ID}" class="hidden mt-sm"></div>
          </div>
          <button class="btn btn-primary btn-full" onclick="DeliveryOrders.updatePayment('${d.DO_ID}', 'Paid')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
            Mark as Paid
          </button>
        `}
      </div>
    `;
    App.openModal(html);

    // Bind payment proof upload
    if (!isPaid) {
      this._bindPaymentUpload(d.DO_ID);
    }
  },

  _paymentProofData: {},

  _bindPaymentUpload(doId) {
    const dropZone = document.getElementById('payment-proof-drop-' + doId);
    const fileInput = document.getElementById('payment-proof-input-' + doId);
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) this._handlePaymentProofFile(doId, fileInput.files[0]);
    });
  },

  _handlePaymentProofFile(doId, file) {
    if (!file.type.startsWith('image/')) {
      App.toast('Please select an image file.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      this._paymentProofData[doId] = e.target.result;
      const preview = document.getElementById('payment-proof-preview-' + doId);
      if (preview) {
        preview.innerHTML = `<img src="${e.target.result}" alt="Payment proof" style="max-width:100%;border-radius:var(--radius-md);border:1px solid var(--border-light);">`;
        preview.classList.remove('hidden');
      }
      const dropZone = document.getElementById('payment-proof-drop-' + doId);
      if (dropZone) {
        dropZone.querySelector('.file-upload-text').textContent = file.name;
        dropZone.querySelector('.file-upload-hint').textContent = 'Tap to change';
      }
    };
    reader.readAsDataURL(file);
  },

  handleExecute(doId) {
    // Gather all batch selections
    const selects = document.querySelectorAll('.do-batch-select');
    const items = [];
    let hasError = false;

    selects.forEach(select => {
      const val = select.value;
      if (!val) {
        hasError = true;
      } else {
        const [warehouse, batch] = val.split('|');
        items.push({
          SKU: select.dataset.sku,
          Quantity: Number(select.dataset.qty),
          Warehouse_Type: warehouse,
          Batch_Number: batch
        });
      }
    });

    if (hasError) {
      App.toast('Cannot execute: Missing batch selection for one or more items due to low stock.', 'danger');
      return;
    }

    const addressField = document.getElementById('do-shipping-address');
    const shippingAddress = addressField ? addressField.value.trim() : '';

    App.closeModal();
    setTimeout(() => {
      App.confirm(
        'Execute Delivery Order',
        'This will update the DO status to "Executed" and deduct the selected batches. This cannot be undone.',
        async () => {
          const result = await API.call('executeDeliveryOrder', { DO_ID: doId, items: items, Shipping_Address: shippingAddress });
          if (result.success) {
            App.toast(result.message, 'success');
            this.load();
          }
        },
        'warning'
      );
    }, 300);
  },

  async updatePayment(doId, status) {
    const proofUrl = this._paymentProofData[doId] || '';

    const result = await API.call('updatePaymentStatus', {
      DO_ID: doId,
      Payment_Status: status,
      Payment_Proof_URL: proofUrl
    });

    if (result.success) {
      App.toast(`Payment marked as ${status}`, 'success');
      // Update local data
      const order = this.orders.find(o => o.DO_ID === doId);
      if (order) {
        order.Payment_Status = status;
        if (status === 'Paid') order.Payment_Proof_URL = proofUrl;
      }
      App.closeModal();
      this.render();
      delete this._paymentProofData[doId];
    }
  },

  showCreateForm() {
    const existingInvIds = this.orders.map(d => d.Invoice_ID);

    let html = `
      <h3 class="modal-title">Create Delivery Order</h3>
      <p class="text-sm text-secondary mb-lg">Select a finalized invoice to create a Delivery Order:</p>
      <div id="do-invoice-list">
        <p class="text-sm text-secondary text-center">Loading invoices...</p>
      </div>
    `;
    App.openModal(html);
    this.loadInvoicesForDO(existingInvIds);
  },

  async loadInvoicesForDO(existingInvIds) {
    const result = await API.call('getInvoices');
    const container = document.getElementById('do-invoice-list');
    if (!container) return;

    if (!result.success) {
      container.innerHTML = '<p class="text-sm text-secondary">Failed to load invoices.</p>';
      return;
    }

    const available = result.data.filter(inv =>
      inv.Status === 'Finalized' && !existingInvIds.includes(inv.Invoice_ID)
    );

    if (available.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:24px 0;">
          <div class="empty-state-icon">📋</div>
          <p class="empty-state-title">No Available Invoices</p>
          <p class="empty-state-text">All finalized invoices already have DOs, or there are no finalized invoices yet.</p>
        </div>`;
      return;
    }

    container.innerHTML = available.map(inv => `
      <div class="list-item" onclick="DeliveryOrders.createDO('${inv.Invoice_ID}')">
        <div class="list-item-icon" style="background:var(--color-mint-light);">📄</div>
        <div class="list-item-content">
          <div class="list-item-title">${inv.Invoice_ID}</div>
          <div class="list-item-meta">${inv.Customer_Name} · ${App.formatDate(inv.Date_Created)}</div>
        </div>
        <div class="list-item-value">${App.formatCurrency(inv.Total_Amount)}</div>
      </div>
    `).join('');
  },

  async createDO(invoiceId) {
    App.closeModal();
    const result = await API.call('createDeliveryOrder', { Invoice_ID: invoiceId });
    if (result.success) {
      App.toast(result.message, 'success');
      this.load();
    }
  },

  async printDO(doId) {
    App.closeModal();
    const d = this.orders.find(o => o.DO_ID === doId);
    if (!d) return;

    const [invOutResult, invoicesResult] = await Promise.all([
      API.call('getInventoryOut'),
      API.call('getInvoices')
    ]);

    const invoices = invoicesResult.success ? invoicesResult.data : [];
    const inv = invoices.find(i => i.Invoice_ID === d.Invoice_ID);
    const customerName = inv ? inv.Customer_Name : '';

    const invOut = invOutResult.success ? invOutResult.data : [];
    const doItems = invOut.filter(o => o.Reference_ID === d.Invoice_ID);

    const printDiv = document.getElementById('invoice-print');
    
    const groupedItems = doItems.map(item => {
      const product = App.getProductBySKU(item.SKU);
      return `
        <tr style="border-bottom:1px solid #E5E7EB;">
          <td style="padding:10px 8px;font-size:13px;">${item.SKU}</td>
          <td style="padding:10px 8px;font-size:13px;">${product ? product.Product_Name : '-'}</td>
          <td style="padding:10px 8px;font-size:13px;">${item.Batch_Number || '-'}</td>
          <td style="text-align:right;padding:10px 8px;font-size:13px;font-weight:600;">${item.Quantity}</td>
        </tr>
      `;
    }).join('');

    printDiv.innerHTML = `
      <div class="invoice-preview" style="padding:40px; color:#1A1A2E;">
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; margin-bottom:40px;">
          <div>
            <div style="display:flex; align-items:center; gap:4px;">
              <span style="font-size:32px; font-weight:900; letter-spacing:-1px;">Selfmology</span>
              <div style="width:24px; height:12px; border-bottom:4px solid #FDB913; border-radius:0 0 50% 50%; margin-bottom:8px;"></div>
            </div>
            <div style="font-size:12px; color:#6B7280; margin-top:8px; line-height:1.5;">
              Jl. Puri Indah A4/17, Kembangan<br>
              Jakarta Barat 11610<br>
              0813-8821-0580 | info@selfmology.com
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:2px; margin-bottom:4px;">Delivery Order</div>
            <div style="font-size:28px; font-weight:800; color:#1A1A2E;">${d.DO_ID}</div>
            <div style="font-size:12px; color:#6B7280; margin-top:8px;">
              Ref Invoice: <strong>${d.Invoice_ID}</strong><br>
              Date: <strong>${App.formatDate(d.Date_Created)}</strong>
            </div>
          </div>
        </div>

        <!-- Shipping Info -->
        <div style="background:#F9FAFB; border-radius:12px; padding:20px; margin-bottom:32px;">
          <p style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Ship To</p>
          <p style="font-size:16px; font-weight:700; margin-bottom:4px;">${customerName}</p>
          <p style="font-size:13px; color:#374151; line-height:1.5;">${(d.Shipping_Address || '').replace(/\\n/g, '<br>')}</p>
        </div>

        <!-- Table -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:32px;">
          <thead>
            <tr style="border-bottom:2px solid #1A1A2E;">
              <th style="text-align:left; padding:12px 8px; font-size:11px; text-transform:uppercase; color:#6B7280;">Description</th>
              <th style="text-align:left; padding:12px 8px; font-size:11px; text-transform:uppercase; color:#6B7280;">Batch</th>
              <th style="text-align:right; padding:12px 8px; font-size:11px; text-transform:uppercase; color:#6B7280;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${doItems.map(item => {
              const product = App.getProductBySKU(item.SKU);
              return `
                <tr style="border-bottom:1px solid #E5E7EB;">
                  <td style="padding:16px 8px;">
                    <div style="font-size:14px; font-weight:600;">${product ? product.Product_Name : '-'}</div>
                    <div style="font-size:11px; color:#9CA3AF; margin-top:2px;">SKU: ${item.SKU}</div>
                  </td>
                  <td style="padding:16px 8px; font-size:13px; color:#4B5563;">${item.Batch_Number || '-'}</td>
                  <td style="text-align:right; padding:16px 8px; font-size:14px; font-weight:700;">${item.Quantity}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="3" style="text-align:center;padding:24px;color:#9CA3AF;">No items recorded</td></tr>'}
          </tbody>
        </table>
        
        <!-- Signatures -->
        <div style="margin-top:80px; display:flex; justify-content:space-between; padding:0 20px;">
           <div style="text-align:center; width:180px;">
             <p style="font-size:12px; color:#6B7280; margin-bottom:64px;">Prepared By,</p>
             <div style="border-top:1px solid #D1D5DB; padding-top:8px; font-size:13px; font-weight:600;">( Warehouse Staff )</div>
           </div>
           <div style="text-align:center; width:180px;">
             <p style="font-size:12px; color:#6B7280; margin-bottom:64px;">Received By,</p>
             <div style="border-top:1px solid #D1D5DB; padding-top:8px; font-size:13px; font-weight:600;">( Customer )</div>
           </div>
        </div>

        <!-- Footer -->
        <div style="margin-top:80px; text-align:center; border-top:1px solid #E5E7EB; padding-top:24px;">
          <p style="font-size:14px; font-weight:600; color:#1A1A2E; margin-bottom:4px;">Self Love, Selfmology!</p>
          <p style="font-size:11px; color:#9CA3AF;">Fulfilling your beauty needs with love.</p>
        </div>
      </div>
    `;

    printDiv.classList.remove('hidden');
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>DO ${d.DO_ID}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
      <style>body{font-family:'Inter',sans-serif;margin:0;padding:20px;}</style>
      </head><body>${printDiv.innerHTML}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printDiv.classList.add('hidden');
    }, 500);
  }
};
