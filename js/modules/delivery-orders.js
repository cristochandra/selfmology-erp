// ============================================================
// SELFMOLOGY ERP – Delivery Orders Module
// Updated: Payment status tracking with proof of payment upload,
//          proceed-from-invoice flow
// ============================================================

const DeliveryOrders = {
  orders: [],

  async load() {
    const result = await API.call('getDeliveryOrders');
    if (result.success) {
      this.orders = result.data;
      this.render();
    }
  },

  render() {
    const container = document.getElementById('delivery-list');

    if (this.orders.length === 0) {
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

    const lineResult = await API.call('getLineItems', { Invoice_ID: d.Invoice_ID });
    const lines = lineResult.success ? lineResult.data : [];

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

        <hr style="border:none;border-top:1px solid var(--border-light);">
        <h4 class="text-sm text-bold">Items to Deliver</h4>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>SKU</th><th>Product</th><th>Qty</th></tr></thead>
            <tbody>
              ${lines.map(l => {
                const product = App.getProductBySKU(l.SKU);
                return `
                  <tr>
                    <td>${l.SKU}</td>
                    <td style="white-space:normal;">${product ? product.Product_Name : '-'}</td>
                    <td>${l.Quantity}</td>
                  </tr>`;
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
          <div style="background:var(--color-mint-light);border-radius:var(--radius-md);padding:12px 16px;">
            <p class="text-sm" style="color:#059669;">
              <strong>✅ Executed</strong> – Inventory has been deducted for all items.
            </p>
          </div>
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
    App.closeModal();
    setTimeout(() => {
      App.confirm(
        'Execute Delivery Order',
        'This will update the DO status to "Executed" and automatically deduct inventory. This cannot be undone.',
        async () => {
          const result = await API.call('executeDeliveryOrder', { DO_ID: doId });
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
  }
};
