// ============================================================
// SELFMOLOGY ERP – Invoices Module
// Updated: Customer dropdown, product names in line items,
//          discount by percentage option, proceed-to-DO flow
// ============================================================

const Invoices = {
  invoices: [],
  filtered: [],

  async load() {
    const result = await API.call('getInvoices');
    if (result.success) {
      this.invoices = result.data;
      this.filtered = [...this.invoices];
      this.render();
      this.bindSearch();
    }
  },

  bindSearch() {
    const searchInput = document.getElementById('invoice-search');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      this.filtered = this.invoices.filter(inv =>
        (inv.Invoice_ID || '').toLowerCase().includes(q) ||
        (inv.Customer_Name || '').toLowerCase().includes(q)
      );
      this.render();
    });
  },

  render() {
    const container = document.getElementById('invoices-list');

    if (this.filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <p class="empty-state-title">No Invoices</p>
          <p class="empty-state-text">Create your first invoice using the + button</p>
        </div>`;
      return;
    }

    container.innerHTML = this.filtered.map(inv => {
      const net = this._calcNet(inv);
      return `
        <div class="list-item" onclick="Invoices.showDetail('${inv.Invoice_ID}')">
          <div class="list-item-icon" style="background:${inv.Status === 'Finalized' ? 'var(--color-mint-light)' : 'var(--color-orange-light)'};">
            ${inv.Status === 'Finalized' ? '✅' : '📝'}
          </div>
          <div class="list-item-content">
            <div class="list-item-title">${inv.Invoice_ID}</div>
            <div class="list-item-meta">${inv.Customer_Name} · ${App.formatDate(inv.Date_Created)}</div>
          </div>
          <div>
            <div class="list-item-value">${App.formatCurrency(net)}</div>
            <span class="badge ${inv.Status === 'Finalized' ? 'badge-finalized' : 'badge-draft'}" style="float:right;margin-top:4px;">${inv.Status}</span>
          </div>
        </div>`;
    }).join('');
  },

  _calcNet(inv) {
    const total = Number(inv.Total_Amount) || 0;
    const discVal = Number(inv.Discount_Value) || 0;
    const discType = inv.Discount_Type || 'fixed';
    if (discType === 'percentage') {
      return total - (total * discVal / 100);
    }
    return total - discVal;
  },

  async showDetail(invoiceId) {
    const inv = this.invoices.find(i => i.Invoice_ID === invoiceId);
    if (!inv) return;

    const lineResult = await API.call('getLineItems', { Invoice_ID: invoiceId });
    const lines = lineResult.success ? lineResult.data : [];

    const netTotal = this._calcNet(inv);
    const discType = inv.Discount_Type || 'fixed';
    const discLabel = discType === 'percentage' ? `${inv.Discount_Value}%` : App.formatCurrency(inv.Discount_Value || 0);

    let html = `
      <h3 class="modal-title">${inv.Invoice_ID}</h3>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div class="flex-between">
          <span class="text-sm text-secondary">Customer</span>
          <span class="text-sm text-bold">${inv.Customer_Name}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Date</span>
          <span class="text-sm">${App.formatDate(inv.Date_Created)}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Due Date</span>
          <span class="text-sm">${App.formatDate(inv.Payment_Due_Date)}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Status</span>
          <span class="badge ${inv.Status === 'Finalized' ? 'badge-finalized' : 'badge-draft'}">${inv.Status}</span>
        </div>
        <hr style="border:none;border-top:1px solid var(--border-light);">
        <h4 class="text-sm text-bold">Line Items</h4>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
            <tbody>
              ${lines.map(l => {
                const product = App.getProductBySKU(l.SKU);
                const productName = product ? product.Product_Name : '-';
                return `
                  <tr>
                    <td>${l.SKU}</td>
                    <td style="white-space:normal;max-width:100px;">${productName}</td>
                    <td>${l.Quantity}</td>
                    <td>${App.formatCurrency(l.Unit_Price)}</td>
                    <td>${App.formatCurrency(l.Line_Total)}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="flex-between mt-sm">
          <span class="text-sm text-secondary">Subtotal</span>
          <span class="text-sm">${App.formatCurrency(inv.Total_Amount)}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Discount</span>
          <span class="text-sm" style="color:var(--color-red);">-${discLabel}</span>
        </div>
        <div class="flex-between" style="padding-top:8px;border-top:2px solid var(--text-primary);">
          <span class="text-sm text-bold">Net Total</span>
          <span class="text-sm text-bold" style="font-size:16px;">${App.formatCurrency(netTotal)}</span>
        </div>
        <hr style="border:none;border-top:1px solid var(--border-light);">
        <div class="form-actions" style="flex-wrap:wrap;">
          ${inv.Status === 'Draft' ? `
            <button class="btn btn-primary" style="flex:1;" onclick="Invoices.handleFinalize('${inv.Invoice_ID}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
              Finalize
            </button>
          ` : ''}
          <button class="btn btn-secondary" style="flex:1;" onclick="Invoices.generatePDF('${inv.Invoice_ID}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print / PDF
          </button>
          ${inv.Status === 'Finalized' ? `
            <button class="btn btn-outline" style="flex:1;" onclick="Invoices.proceedToDO('${inv.Invoice_ID}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              Create DO
            </button>
          ` : ''}
        </div>
      </div>
    `;
    App.openModal(html);
  },

  showCreateForm() {
    const today = App.todayStr();
    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Build customer datalist options
    const customerOptions = AppState.customers.map(c => `<option value="${c}">`).join('');

    let html = `
      <h3 class="modal-title">Create Invoice</h3>
      <form id="invoice-form" onsubmit="return false;">
        <div class="form-group">
          <label class="form-label">Customer Name</label>
          <input type="text" id="inv-customer" class="form-input" list="customer-list" placeholder="Type or select customer" required>
          <datalist id="customer-list">${customerOptions}</datalist>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" id="inv-date" class="form-input" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">Due Date</label>
            <input type="date" id="inv-due" class="form-input" value="${dueDate}" readonly style="opacity:0.6">
            <span class="form-sublabel">Auto: +14 days</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Discount</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <select id="inv-discount-type" class="form-select" style="width:110px;flex-shrink:0;">
              <option value="fixed">Rp (Fixed)</option>
              <option value="percentage">% (Percent)</option>
            </select>
            <input type="number" id="inv-discount" class="form-input" value="0" min="0" placeholder="0" style="flex:1;">
          </div>
        </div>

        <h4 class="text-sm text-bold mt-lg mb-md">Line Items</h4>
        <div class="line-item-row header">
          <span>Product</span>
          <span>Qty</span>
          <span>Price</span>
          <span>Total</span>
          <span></span>
        </div>
        <div id="line-items-container"></div>
        <button type="button" class="btn btn-outline btn-sm btn-full mt-md" onclick="Invoices.addLineItemRow()">
          + Add Item
        </button>

        <div class="flex-between mt-xl" style="padding-top:12px;border-top:2px solid var(--text-primary);">
          <span class="text-bold">Total</span>
          <span class="text-bold" id="inv-total-display" style="font-size:18px;">Rp 0</span>
        </div>

        <div class="form-actions mt-xl">
          <button type="button" class="btn btn-secondary" style="flex:1;" onclick="Invoices.handleCreate('Draft')">Save Draft</button>
          <button type="button" class="btn btn-primary" style="flex:1;" onclick="Invoices.handleCreate('Finalized')">Finalize</button>
        </div>
      </form>
    `;

    App.openModal(html);

    document.getElementById('inv-date').addEventListener('change', (e) => {
      const d = new Date(e.target.value);
      d.setDate(d.getDate() + 14);
      document.getElementById('inv-due').value = d.toISOString().split('T')[0];
    });

    // Discount type/value change → recalc total
    document.getElementById('inv-discount-type').addEventListener('change', () => this.updateTotal());
    document.getElementById('inv-discount').addEventListener('input', () => this.updateTotal());

    this.addLineItemRow();
  },

  _lineCounter: 0,

  addLineItemRow() {
    this._lineCounter++;
    const container = document.getElementById('line-items-container');
    const row = document.createElement('div');
    row.className = 'line-item-row';
    row.id = 'line-row-' + this._lineCounter;

    // Show product name in the dropdown
    const options = '<option value="">Select...</option>' +
      AppState.masterData.map(p => `<option value="${p.SKU}" data-price="${p.Standard_Price}">${p.SKU} – ${p.Product_Name}</option>`).join('');

    row.innerHTML = `
      <select class="li-sku" onchange="Invoices.onLineItemChange(this)">${options}</select>
      <input type="number" class="li-qty" min="1" value="1" onchange="Invoices.onLineItemChange(this)">
      <input type="number" class="li-price" min="0" value="0" onchange="Invoices.onLineItemChange(this)">
      <span class="li-total text-sm text-bold">Rp 0</span>
      <button class="remove-line-btn" onclick="this.closest('.line-item-row').remove();Invoices.updateTotal();">×</button>
    `;
    container.appendChild(row);
  },

  onLineItemChange(el) {
    const row = el.closest('.line-item-row');
    const skuSelect = row.querySelector('.li-sku');
    const qtyInput = row.querySelector('.li-qty');
    const priceInput = row.querySelector('.li-price');
    const totalSpan = row.querySelector('.li-total');

    if (el === skuSelect) {
      const selected = skuSelect.options[skuSelect.selectedIndex];
      if (selected && selected.dataset.price) {
        priceInput.value = selected.dataset.price;
      }
    }

    const qty = Number(qtyInput.value) || 0;
    const price = Number(priceInput.value) || 0;
    totalSpan.textContent = App.formatCurrency(qty * price);

    this.updateTotal();
  },

  updateTotal() {
    const rows = document.querySelectorAll('#line-items-container .line-item-row');
    let subtotal = 0;
    rows.forEach(row => {
      const qty = Number(row.querySelector('.li-qty')?.value) || 0;
      const price = Number(row.querySelector('.li-price')?.value) || 0;
      subtotal += qty * price;
    });

    const discType = document.getElementById('inv-discount-type')?.value || 'fixed';
    const discVal = Number(document.getElementById('inv-discount')?.value) || 0;

    let net;
    if (discType === 'percentage') {
      net = subtotal - (subtotal * discVal / 100);
    } else {
      net = subtotal - discVal;
    }

    const display = document.getElementById('inv-total-display');
    if (display) display.textContent = App.formatCurrency(Math.max(0, net));
  },

  async handleCreate(status) {
    const customer = document.getElementById('inv-customer').value.trim();
    const date = document.getElementById('inv-date').value;
    const discType = document.getElementById('inv-discount-type').value;
    const discVal = Number(document.getElementById('inv-discount').value) || 0;

    if (!customer) {
      App.toast('Customer name is required.', 'warning');
      return;
    }

    const rows = document.querySelectorAll('#line-items-container .line-item-row');
    const lineItems = [];
    let valid = true;

    rows.forEach(row => {
      const sku = row.querySelector('.li-sku').value;
      const qty = Number(row.querySelector('.li-qty').value) || 0;
      const price = Number(row.querySelector('.li-price').value) || 0;

      if (!sku || qty <= 0) { valid = false; return; }
      lineItems.push({ SKU: sku, Quantity: qty, Unit_Price: price });
    });

    if (!valid || lineItems.length === 0) {
      App.toast('Add at least one valid line item.', 'warning');
      return;
    }

    const header = {
      Customer_Name: customer,
      Date_Created: date,
      Discount_Value: discVal,
      Discount_Type: discType,
      Status: 'Draft'
    };

    const result = await API.call('createInvoice', { header, lineItems });
    if (result.success) {
      if (status === 'Finalized' && result.invoiceId) {
        const finalResult = await API.call('finalizeInvoice', { Invoice_ID: result.invoiceId });
        if (finalResult.success) {
          App.toast('Invoice finalized as ' + finalResult.newInvoiceId, 'success');
          // Ask to proceed to DO
          App.closeModal();
          setTimeout(() => {
            App.confirm(
              'Create Delivery Order?',
              `Would you like to create a Delivery Order for ${finalResult.newInvoiceId} now?`,
              async () => {
                const doResult = await API.call('createDeliveryOrder', { Invoice_ID: finalResult.newInvoiceId });
                if (doResult.success) {
                  App.toast('Delivery Order created!', 'success');
                  App.navigate('delivery');
                }
              },
              'success'
            );
          }, 400);
          this.load();
          return;
        }
      } else {
        App.toast(result.message, 'success');
      }
      App.closeModal();
      this.load();

      // Add new customer to list if not exists
      if (!AppState.customers.includes(customer)) {
        AppState.customers.push(customer);
      }
    }
  },

  handleFinalize(invoiceId) {
    App.closeModal();
    setTimeout(() => {
      App.confirm(
        'Finalize Invoice',
        'This will assign a sequential Invoice ID and lock the invoice. Proceed?',
        async () => {
          const result = await API.call('finalizeInvoice', { Invoice_ID: invoiceId });
          if (result.success) {
            App.toast('Invoice finalized as ' + result.newInvoiceId, 'success');
            this.load();
            // Ask to proceed to DO
            setTimeout(() => {
              App.confirm(
                'Create Delivery Order?',
                `Create a Delivery Order for ${result.newInvoiceId} now?`,
                async () => {
                  const doResult = await API.call('createDeliveryOrder', { Invoice_ID: result.newInvoiceId });
                  if (doResult.success) {
                    App.toast('Delivery Order created!', 'success');
                    App.navigate('delivery');
                  }
                },
                'success'
              );
            }, 400);
          }
        },
        'success'
      );
    }, 300);
  },

  // Proceed to DO from invoice detail
  proceedToDO(invoiceId) {
    App.closeModal();
    setTimeout(() => {
      App.confirm(
        'Create Delivery Order',
        `Create a Delivery Order for invoice ${invoiceId}?`,
        async () => {
          const result = await API.call('createDeliveryOrder', { Invoice_ID: invoiceId });
          if (result.success) {
            App.toast(result.message, 'success');
            App.navigate('delivery');
            if (typeof DeliveryOrders !== 'undefined') DeliveryOrders.load();
          }
        },
        'success'
      );
    }, 300);
  },

  async generatePDF(invoiceId) {
    App.closeModal();

    const inv = this.invoices.find(i => i.Invoice_ID === invoiceId);
    if (!inv) return;

    const lineResult = await API.call('getLineItems', { Invoice_ID: invoiceId });
    const lines = lineResult.success ? lineResult.data : [];
    const netTotal = this._calcNet(inv);
    const discType = inv.Discount_Type || 'fixed';
    const discLabel = discType === 'percentage' ? `${inv.Discount_Value}%` : App.formatCurrency(inv.Discount_Value || 0);

    const printDiv = document.getElementById('invoice-print');
    printDiv.innerHTML = `
      <div class="invoice-preview" style="padding:40px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:32px;padding-bottom:16px;border-bottom:3px solid #1A1A2E;">
          <div>
            <div style="font-size:28px;font-weight:800;">SELFMOLOGY</div>
            <p style="font-size:12px;color:#6B7280;margin-top:4px;">Premium Skincare Products</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;">Invoice</div>
            <div style="font-size:22px;font-weight:700;">${inv.Invoice_ID}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:32px;">
          <div>
            <p style="font-size:11px;color:#6B7280;text-transform:uppercase;">Bill To</p>
            <p style="font-size:15px;font-weight:600;margin-top:4px;">${inv.Customer_Name}</p>
          </div>
          <div style="text-align:right;">
            <p style="font-size:11px;color:#6B7280;">Date: <strong>${App.formatDate(inv.Date_Created)}</strong></p>
            <p style="font-size:11px;color:#6B7280;">Due: <strong>${App.formatDate(inv.Payment_Due_Date)}</strong></p>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <thead>
            <tr style="border-bottom:2px solid #1A1A2E;">
              <th style="text-align:left;padding:10px 8px;font-size:11px;text-transform:uppercase;color:#6B7280;">SKU</th>
              <th style="text-align:left;padding:10px 8px;font-size:11px;text-transform:uppercase;color:#6B7280;">Product</th>
              <th style="text-align:right;padding:10px 8px;font-size:11px;text-transform:uppercase;color:#6B7280;">Qty</th>
              <th style="text-align:right;padding:10px 8px;font-size:11px;text-transform:uppercase;color:#6B7280;">Price</th>
              <th style="text-align:right;padding:10px 8px;font-size:11px;text-transform:uppercase;color:#6B7280;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${lines.map(l => {
              const product = App.getProductBySKU(l.SKU);
              const pName = product ? product.Product_Name : '-';
              return `
                <tr style="border-bottom:1px solid #E5E7EB;">
                  <td style="padding:10px 8px;font-size:13px;">${l.SKU}</td>
                  <td style="padding:10px 8px;font-size:13px;">${pName}</td>
                  <td style="text-align:right;padding:10px 8px;font-size:13px;">${l.Quantity}</td>
                  <td style="text-align:right;padding:10px 8px;font-size:13px;">${App.formatCurrency(l.Unit_Price)}</td>
                  <td style="text-align:right;padding:10px 8px;font-size:13px;font-weight:600;">${App.formatCurrency(l.Line_Total)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;">
          <div style="width:220px;">
            <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
              <span style="color:#6B7280;">Subtotal</span>
              <span>${App.formatCurrency(inv.Total_Amount)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
              <span style="color:#6B7280;">Discount</span>
              <span style="color:#EF4444;">-${discLabel}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:16px;font-weight:700;border-top:2px solid #1A1A2E;margin-top:6px;">
              <span>Total</span>
              <span>${App.formatCurrency(netTotal)}</span>
            </div>
          </div>
        </div>
        <div style="margin-top:48px;padding-top:16px;border-top:1px solid #E5E7EB;text-align:center;">
          <p style="font-size:11px;color:#9CA3AF;">Thank you for your business! · Selfmology · Premium Skincare</p>
        </div>
      </div>
    `;

    printDiv.classList.remove('hidden');
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Invoice ${inv.Invoice_ID}</title>
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
