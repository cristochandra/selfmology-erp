// ============================================================
// SELFMOLOGY ERP – Customer Management Module
// ============================================================

const CustomersModule = {
  customers: [],
  filtered: [],

  async load() {
    const result = await API.call('getCustomers');
    if (result.success) {
      // In demo mode result.data is just strings, let's normalize
      this.customers = result.data.map(c => typeof c === 'string' ? { Customer_Name: c } : c);
      this.filtered = [...this.customers];
      this.render();
      this.bindSearch();
    }
  },

  bindSearch() {
    const searchInput = document.getElementById('customer-search');
    if (!searchInput) return;
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      this.filtered = this.customers.filter(c => 
        (c.Customer_Name || '').toLowerCase().includes(q) ||
        (c.Email || '').toLowerCase().includes(q)
      );
      this.render();
    });
  },

  render() {
    const container = document.getElementById('customers-list');
    if (!container) return;

    if (this.filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏢</div>
          <p class="empty-state-title">No Customers Found</p>
          <p class="empty-state-text">Add your business partners here</p>
        </div>`;
      return;
    }

    container.innerHTML = this.filtered.map(cust => {
      let b2bBadge = '';
      if (cust.B2B_Prices && cust.B2B_Prices !== '{}' && cust.B2B_Prices.length > 5) {
        b2bBadge = '<span style="background:#D1FAE5; color:#065F46; font-size:10px; font-weight:600; padding:2px 6px; border-radius:4px; margin-left:8px;">🤝 B2B Price</span>';
      }
      return `
        <div class="list-item" onclick="CustomersModule.showEditForm('${cust.Customer_Name}')">
          <div class="list-item-icon" style="background: var(--bg-secondary);">🏢</div>
          <div class="list-item-content">
            <div class="list-item-title" style="display:flex; align-items:center;">${cust.Customer_Name}${b2bBadge}</div>
            <div class="list-item-meta">${cust.Phone || 'No phone'} · ${cust.Address || 'No address'}</div>
          </div>
          <div class="list-item-actions">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </div>
      `;
    }).join('');
  },

  showAddForm() {
    const products = AppState.masterData || [];
    const b2bInputsHtml = products.map(p => `
      <div class="form-group" style="margin-top: 8px;">
        <label class="form-label" style="font-weight:normal; font-size:12px; color:#374151;">${p.Product_Name} (${p.SKU})</label>
        <input type="number" data-sku="${p.SKU}" class="form-input b2b-price-input" placeholder="Special agreed price (leave blank for standard)">
      </div>
    `).join('');

    const html = `
      <h2 class="modal-title">Add New Customer</h2>
      <form id="add-customer-form" onsubmit="return false;">
        <div class="form-group">
          <label class="form-label">Customer/Company Name</label>
          <input type="text" id="cust-name" class="form-input" placeholder="e.g. PT. Global Retail" required>
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input type="email" id="cust-email" class="form-input" placeholder="e.g. contact@retail.com">
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input type="text" id="cust-phone" class="form-input" placeholder="e.g. 0812345678">
        </div>
        <div class="form-group">
          <label class="form-label">Billing Address</label>
          <textarea id="cust-address" class="form-input" rows="3" placeholder="Full address..."></textarea>
        </div>

        <div style="background:#F3F4F6; padding:12px; border-radius:8px; margin-top:16px; margin-bottom:16px;">
          <p style="font-size:13px; font-weight:600; color:#1A1A2E; margin-bottom:4px;">🤝 Special B2B Agreement Prices (Optional)</p>
          <p style="font-size:11px; color:#6B7280; margin-bottom:12px;">Set agreed unit prices for this specific customer. Invoices will automatically suggest these special prices.</p>
          ${b2bInputsHtml}
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Customer</button>
        </div>
      </form>
    `;
    App.openModal(html);
    document.getElementById('add-customer-form').addEventListener('submit', () => this.handleAdd());
  },

  async handleAdd() {
    const b2bPrices = {};
    document.querySelectorAll('.b2b-price-input').forEach(input => {
      const val = Number(input.value);
      if (val > 0) {
        b2bPrices[input.dataset.sku] = val;
      }
    });

    const data = {
      Customer_Name: document.getElementById('cust-name').value,
      Email: document.getElementById('cust-email').value,
      Phone: document.getElementById('cust-phone').value,
      Address: document.getElementById('cust-address').value,
      B2B_Prices: JSON.stringify(b2bPrices)
    };

    const result = await API.call('addCustomer', data);
    if (result.success) {
      App.toast('Customer added.', 'success');
      App.closeModal();
      this.load();
      // Reload global customer records mapping
      if (typeof App !== 'undefined') App.loadCustomers();
    }
  },

  showEditForm(name) {
    const cust = this.customers.find(c => c.Customer_Name === name);
    if (!cust) return;

    let parsedB2B = {};
    try {
      if (cust.B2B_Prices) parsedB2B = JSON.parse(cust.B2B_Prices);
    } catch (e) {}

    const products = AppState.masterData || [];
    const b2bInputsHtml = products.map(p => {
      const currentPrice = parsedB2B[p.SKU] !== undefined ? parsedB2B[p.SKU] : '';
      return `
        <div class="form-group" style="margin-top: 8px;">
          <label class="form-label" style="font-weight:normal; font-size:12px; color:#374151;">${p.Product_Name} (${p.SKU})</label>
          <input type="number" data-sku="${p.SKU}" class="form-input b2b-price-input" placeholder="Special agreed price (leave blank for standard)" value="${currentPrice}">
        </div>
      `;
    }).join('');

    const html = `
      <h2 class="modal-title">Edit Customer</h2>
      <form id="edit-customer-form" onsubmit="return false;">
        <input type="hidden" id="edit-cust-old-name" value="${cust.Customer_Name}">
        <div class="form-group">
          <label class="form-label">Customer/Company Name</label>
          <input type="text" id="edit-cust-name" class="form-input" value="${cust.Customer_Name}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input type="email" id="edit-cust-email" class="form-input" value="${cust.Email || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input type="text" id="edit-cust-phone" class="form-input" value="${cust.Phone || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Billing Address</label>
          <textarea id="edit-cust-address" class="form-input" rows="3">${cust.Address || ''}</textarea>
        </div>

        <div style="background:#F3F4F6; padding:12px; border-radius:8px; margin-top:16px; margin-bottom:16px;">
          <p style="font-size:13px; font-weight:600; color:#1A1A2E; margin-bottom:4px;">🤝 Special B2B Agreement Prices (Optional)</p>
          <p style="font-size:11px; color:#6B7280; margin-bottom:12px;">Set agreed unit prices for this specific customer. Invoices will automatically suggest these special prices.</p>
          ${b2bInputsHtml}
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Customer</button>
        </div>
      </form>
    `;
    App.openModal(html);
    document.getElementById('edit-customer-form').addEventListener('submit', () => this.handleUpdate());
  },

  async handleUpdate() {
    const b2bPrices = {};
    document.querySelectorAll('.b2b-price-input').forEach(input => {
      const val = Number(input.value);
      if (val > 0) {
        b2bPrices[input.dataset.sku] = val;
      }
    });

    const data = {
      Old_Name: document.getElementById('edit-cust-old-name').value,
      Customer_Name: document.getElementById('edit-cust-name').value,
      Email: document.getElementById('edit-cust-email').value,
      Phone: document.getElementById('edit-cust-phone').value,
      Address: document.getElementById('edit-cust-address').value,
      B2B_Prices: JSON.stringify(b2bPrices)
    };

    const result = await API.call('updateCustomer', data);
    if (result.success) {
      App.toast('Customer updated.', 'success');
      App.closeModal();
      this.load();
      // Reload global customer records mapping
      if (typeof App !== 'undefined') App.loadCustomers();
    }
  }
};
