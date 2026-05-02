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

    container.innerHTML = this.filtered.map(cust => `
      <div class="list-item" onclick="CustomersModule.showEditForm('${cust.Customer_Name}')">
        <div class="list-item-icon" style="background: var(--bg-secondary);">🏢</div>
        <div class="list-item-content">
          <div class="list-item-title">${cust.Customer_Name}</div>
          <div class="list-item-meta">${cust.Phone || 'No phone'} · ${cust.Address || 'No address'}</div>
        </div>
        <div class="list-item-actions">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
    `).join('');
  },

  showAddForm() {
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
    const data = {
      Customer_Name: document.getElementById('cust-name').value,
      Email: document.getElementById('cust-email').value,
      Phone: document.getElementById('cust-phone').value,
      Address: document.getElementById('cust-address').value
    };

    const result = await API.call('addCustomer', data);
    if (result.success) {
      App.toast('Customer added.', 'success');
      App.closeModal();
      this.load();
    }
  },

  showEditForm(name) {
    const cust = this.customers.find(c => c.Customer_Name === name);
    if (!cust) return;

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
    const data = {
      Old_Name: document.getElementById('edit-cust-old-name').value,
      Customer_Name: document.getElementById('edit-cust-name').value,
      Email: document.getElementById('edit-cust-email').value,
      Phone: document.getElementById('edit-cust-phone').value,
      Address: document.getElementById('edit-cust-address').value
    };

    const result = await API.call('updateCustomer', data);
    if (result.success) {
      App.toast('Customer updated.', 'success');
      App.closeModal();
      this.load();
    }
  }
};
