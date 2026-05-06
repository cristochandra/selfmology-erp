// ============================================================
// SELFMOLOGY ERP – Invoices Module
// Updated: Customer dropdown, product names in line items,
//          discount by percentage option, proceed-to-DO flow
// ============================================================

const Invoices = {
  invoices: [],
  filtered: [],

  async load() {
    const [result, summaryResult] = await Promise.all([
      API.call('getInvoices'),
      API.call('getStockSummary')
    ]);
    
    if (summaryResult.success) {
      Inventory.summary = summaryResult.data;
    }

    if (result.success) {
      this.invoices = result.data.reverse();
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
    return Number(inv.Total_Amount) || 0;
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
            <thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Price</th><th>Disc</th><th>Total</th></tr></thead>
            <tbody>
              ${lines.map(l => {
                const product = App.getProductBySKU(l.SKU);
                const productName = product ? product.Product_Name : '-';
                let discDisplay = '-';
                if (l.Discount_Value > 0) {
                  if (l.Discount_Type === 'percentage') {
                    discDisplay = l.Discount_Value + '%';
                  } else {
                    discDisplay = App.formatCurrency(l.Discount_Value);
                  }
                }
                return `
                  <tr>
                    <td>${l.SKU}</td>
                    <td style="white-space:normal;max-width:100px;">${productName}</td>
                    <td>${l.Quantity}</td>
                    <td>${App.formatCurrency(l.Unit_Price)}</td>
                    <td style="color:var(--color-red);">${discDisplay !== '-' ? '-' + discDisplay : '-'}</td>
                    <td>${App.formatCurrency(l.Line_Total)}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="flex-between" style="padding-top:12px;border-top:2px solid var(--text-primary); margin-top:8px;">
          <span class="text-sm text-bold">Net Total</span>
          <span class="text-sm text-bold" style="font-size:16px;">${App.formatCurrency(inv.Total_Amount)}</span>
        </div>
        <hr style="border:none;border-top:1px solid var(--border-light);">
        <div class="form-actions" style="flex-wrap:wrap;">
          ${inv.Status === 'Draft' ? `
            <button class="btn btn-primary" style="flex:1;" onclick="Invoices.handleFinalize('${inv.Invoice_ID}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
              Finalize
            </button>
            <button class="btn btn-outline" style="flex:1; border-color: var(--color-red); color: var(--color-red);" onclick="Invoices.handleDelete('${inv.Invoice_ID}')">
              Delete
            </button>
          ` : ''}
          ${(inv.Status === 'Finalized' && inv.Payment_Status !== 'Paid') ? `
            <button class="btn btn-outline" style="flex:1; border-color: var(--color-orange); color: var(--color-orange);" onclick="Invoices.handleCancel('${inv.Invoice_ID}')">
              Cancel
            </button>
          ` : ''}
          <button class="btn btn-secondary" style="flex:1;" onclick="Invoices.printInvoice('${inv.Invoice_ID}')">
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

  async showCreateForm() {
    const today = App.todayStr();
    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch next ID for preview
    const idResult = await API.call('getNextInvoiceId');
    const nextId = idResult.success ? idResult.nextId : '...';

    // Build customer datalist options
    const customerOptions = AppState.customers.map(c => `<option value="${c}">`).join('');

    let html = `
      <h3 class="modal-title">Create Invoice <span style="font-size:14px; color:var(--text-secondary); margin-left:8px;">(${nextId})</span></h3>
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

        <h4 class="text-sm text-bold mt-lg mb-md">Line Items</h4>
        <div class="line-item-row header">
          <span>Product</span>
          <span>Qty</span>
          <span>Price</span>
          <span>Discount</span>
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

    this.addLineItemRow();
  },

  _lineCounter: 0,

  addLineItemRow() {
    this._lineCounter++;
    const container = document.getElementById('line-items-container');
    const row = document.createElement('div');
    row.className = 'line-item-row';
    row.id = 'line-row-' + this._lineCounter;

    // Show product name and total stock
    const options = '<option value="">Select...</option>' +
      AppState.masterData.map(p => {
        let currentStock = 0;
        if (Inventory && Inventory.summary) {
           currentStock = Inventory.summary.filter(s => s.SKU === p.SKU).reduce((acc, curr) => acc + Number(curr.Qty), 0);
        }
        return `<option value="${p.SKU}" data-price="${p.Standard_Price}" data-stock="${currentStock}">${p.SKU} – ${p.Product_Name} (Stock: ${currentStock})</option>`;
      }).join('');

    row.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:2px; flex:2; min-width:140px;">
        <select class="li-sku" onchange="Invoices.onLineItemChange(this)">${options}</select>
        <span class="text-xs text-secondary li-stock-display"></span>
      </div>
      <input type="number" class="li-qty" min="1" value="1" onchange="Invoices.onLineItemChange(this)" style="flex:1; min-width:50px;">
      <input type="number" class="li-price" min="0" value="0" onchange="Invoices.onLineItemChange(this)" style="flex:1.5; min-width:70px;">
      <div style="display:flex; gap:2px; flex:1.5; min-width:100px;">
        <select class="li-disc-type" onchange="Invoices.onLineItemChange(this)" style="padding:4px; font-size:12px; width:45px;">
          <option value="fixed">Rp</option>
          <option value="percentage">%</option>
        </select>
        <input type="number" class="li-discount-val" min="0" value="0" placeholder="Disc" onchange="Invoices.onLineItemChange(this)" style="width:100%;">
      </div>
      <span class="li-total text-sm text-bold" style="flex:1.5; min-width:80px; align-self:center;">Rp 0</span>
      <button class="remove-line-btn" style="flex:0.5; min-width:30px; align-self:center;" onclick="this.closest('.line-item-row').remove();Invoices.updateTotal();">×</button>
    `;
    container.appendChild(row);
  },

  onLineItemChange(el) {
    const row = el.closest('.line-item-row');
    const skuSelect = row.querySelector('.li-sku');
    const qtyInput = row.querySelector('.li-qty');
    const priceInput = row.querySelector('.li-price');
    const discTypeSelect = row.querySelector('.li-disc-type');
    const discValInput = row.querySelector('.li-discount-val');
    const totalSpan = row.querySelector('.li-total');
    const stockDisplay = row.querySelector('.li-stock-display');

    if (el === skuSelect) {
      const selected = skuSelect.options[skuSelect.selectedIndex];
      if (selected && selected.dataset.price) {
        priceInput.value = selected.dataset.price;
      }
      if (selected && selected.dataset.stock) {
        const stock = Number(selected.dataset.stock);
        stockDisplay.textContent = `Available: ${stock}`;
        stockDisplay.style.color = stock < 10 ? 'var(--color-danger)' : 'var(--text-secondary)';
      } else {
        stockDisplay.textContent = '';
      }
    }

    const qty = Number(qtyInput.value) || 0;
    const price = Number(priceInput.value) || 0;
    const discType = discTypeSelect.value;
    const discVal = Number(discValInput.value) || 0;
    
    const subtotal = qty * price;
    let discountAmount = 0;
    if (discType === 'percentage') {
      discountAmount = subtotal * (discVal / 100);
    } else {
      discountAmount = discVal;
    }
    
    const lineTotal = subtotal - discountAmount;
    totalSpan.textContent = App.formatCurrency(Math.max(0, lineTotal));

    this.updateTotal();
  },

  updateTotal() {
    const rows = document.querySelectorAll('#line-items-container .line-item-row');
    let net = 0;
    rows.forEach(row => {
      const qty = Number(row.querySelector('.li-qty')?.value) || 0;
      const price = Number(row.querySelector('.li-price')?.value) || 0;
      const discType = row.querySelector('.li-disc-type')?.value || 'fixed';
      const discVal = Number(row.querySelector('.li-discount-val')?.value) || 0;
      
      const subtotal = qty * price;
      let discountAmount = 0;
      if (discType === 'percentage') {
        discountAmount = subtotal * (discVal / 100);
      } else {
        discountAmount = discVal;
      }
      
      net += Math.max(0, subtotal - discountAmount);
    });

    const display = document.getElementById('inv-total-display');
    if (display) display.textContent = App.formatCurrency(net);
  },

  async handleCreate(status) {
    const customer = document.getElementById('inv-customer').value.trim();
    const date = document.getElementById('inv-date').value;

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
      const discType = row.querySelector('.li-disc-type').value;
      const discVal = Number(row.querySelector('.li-discount-val').value) || 0;

      if (!sku || qty <= 0) { valid = false; return; }
      lineItems.push({ SKU: sku, Quantity: qty, Unit_Price: price, Discount_Type: discType, Discount_Value: discVal });
    });

    if (!valid || lineItems.length === 0) {
      App.toast('Add at least one valid line item.', 'warning');
      return;
    }

    const header = {
      Customer_Name: customer,
      Date_Created: date,
      Status: 'Draft' // Status update to finalized handled sequentially below
    };

    const result = await API.call('createInvoice', { header, lineItems });
    if (result.success) {
      if (status === 'Finalized' && result.invoiceId) {
        const finalResult = await API.call('finalizeInvoice', { Invoice_ID: result.invoiceId });
        if (finalResult.success) {
          App.toast('Invoice finalized as ' + finalResult.newInvoiceId, 'success');
          this.load();
          this.showPostFinalizeModal(finalResult.newInvoiceId);
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
            this.showPostFinalizeModal(result.newInvoiceId);
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

  handleDelete(invoiceId) {
    App.closeModal();
    setTimeout(() => {
      App.confirm(
        'Delete Draft Invoice',
        `Are you sure you want to delete draft invoice ${invoiceId}? This action cannot be undone.`,
        async () => {
          const result = await API.call('deleteInvoice', { Invoice_ID: invoiceId });
          if (result.success) {
            App.toast(result.message, 'success');
            this.load();
          } else {
            App.toast(result.error || 'Failed to delete invoice.', 'danger');
          }
        },
        'danger'
      );
    }, 300);
  },

  handleCancel(invoiceId) {
    App.closeModal();
    setTimeout(() => {
      App.confirm(
        'Cancel Invoice',
        `Are you sure you want to cancel invoice ${invoiceId}?`,
        async () => {
          const result = await API.call('cancelInvoice', { Invoice_ID: invoiceId });
          if (result.success) {
            App.toast(result.message, 'success');
            this.load();
          } else {
            App.toast(result.error || 'Failed to cancel invoice.', 'danger');
          }
        },
        'danger'
      );
    }, 300);
  },

  async printInvoice(invoiceId, onComplete) {
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
            <div style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:2px; margin-bottom:4px;">Invoice</div>
            <div style="font-size:28px; font-weight:800; color:#1A1A2E;">${inv.Invoice_ID}</div>
            <div style="font-size:12px; color:#6B7280; margin-top:8px;">
              Date: <strong>${App.formatDate(inv.Date_Created)}</strong><br>
              Due: <strong style="color:#EF4444;">${App.formatDate(inv.Payment_Due_Date)}</strong>
            </div>
          </div>
        </div>

        <!-- Billing Info -->
        <div style="background:#F9FAFB; border-radius:12px; padding:20px; margin-bottom:32px; display:flex; justify-content:space-between;">
          <div style="width:50%;">
            <p style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Billed To</p>
            <p style="font-size:16px; font-weight:700; margin-bottom:4px;">${inv.Customer_Name}</p>
            <p style="font-size:13px; color:#4B5563;">Customer</p>
          </div>
          <div style="width:40%; text-align:right;">
             <p style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Payment Terms</p>
             <p style="font-size:13px; color:#1A1A2E; font-weight:500;">Due on Receipt</p>
          </div>
        </div>

        <!-- Table -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:32px;">
          <thead>
            <tr style="border-bottom:2px solid #1A1A2E;">
              <th style="text-align:left; padding:12px 8px; font-size:11px; text-transform:uppercase; color:#6B7280;">Description</th>
              <th style="text-align:right; padding:12px 8px; font-size:11px; text-transform:uppercase; color:#6B7280;">Qty</th>
              <th style="text-align:right; padding:12px 8px; font-size:11px; text-transform:uppercase; color:#6B7280;">Unit Price</th>
              <th style="text-align:right; padding:12px 8px; font-size:11px; text-transform:uppercase; color:#6B7280;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lines.map(l => {
              const product = App.getProductBySKU(l.SKU);
              const pName = product ? product.Product_Name : '-';
              return `
                <tr style="border-bottom:1px solid #E5E7EB;">
                  <td style="padding:16px 8px;">
                    <div style="font-size:14px; font-weight:600;">${pName}</div>
                    <div style="font-size:11px; color:#9CA3AF; margin-top:2px;">SKU: ${l.SKU}</div>
                  </td>
                  <td style="text-align:right; padding:16px 8px; font-size:14px;">${l.Quantity}</td>
                  <td style="text-align:right; padding:16px 8px; font-size:14px;">${App.formatCurrency(l.Unit_Price)}</td>
                  <td style="text-align:right; padding:16px 8px; font-size:14px; font-weight:600;">${App.formatCurrency(l.Line_Total)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>

        <!-- Totals & Payment -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="width:50%;">
            <div style="background:#FFF9E6; border-left:4px solid #FDB913; padding:16px; border-radius:0 8px 8px 0;">
              <p style="font-size:11px; color:#92400E; text-transform:uppercase; font-weight:700; letter-spacing:1px; margin-bottom:8px;">Payment Instructions</p>
              <div style="font-size:13px; color:#1A1A2E; line-height:1.6;">
                Bank: <strong>BCA</strong><br>
                Acc Number: <strong>2885352888</strong><br>
                Name: <strong>Devin W Cristo C</strong>
              </div>
            </div>
          </div>
          <div style="width:250px;">
            <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:14px;">
              <span style="color:#6B7280;">Subtotal</span>
              <span style="font-weight:500;">${App.formatCurrency(inv.Total_Amount)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:14px;">
              <span style="color:#6B7280;">Discount</span>
              <span style="color:#EF4444;">-${discLabel}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:16px 0; font-size:20px; font-weight:800; border-top:2px solid #1A1A2E; margin-top:8px;">
              <span>Total</span>
              <span style="color:#FDB913;">${App.formatCurrency(netTotal)}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="margin-top:80px; text-align:center; border-top:1px solid #E5E7EB; padding-top:24px;">
          <p style="font-size:14px; font-weight:600; color:#1A1A2E; margin-bottom:4px;">Self Love, Selfmology!</p>
          <p style="font-size:11px; color:#9CA3AF;">Thank you for choosing Selfmology for your skincare journey.</p>
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
      if (onComplete) {
        // Wait for the print window to be processed/closed
        setTimeout(onComplete, 500);
      }
    }, 500);
  },

  shareWhatsApp(invoiceId) {
    const inv = this.invoices.find(i => i.Invoice_ID === invoiceId);
    if (!inv) return;
    const netTotal = this._calcNet(inv);
    const message = `Hello ${inv.Customer_Name},\n\nHere is your invoice *${inv.Invoice_ID}* from Selfmology for the amount of *${App.formatCurrency(netTotal)}*.\n\nThank you for your business!`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  },

  showPostFinalizeModal(invoiceId) {
    const html = `
      <div style="text-align:center; padding: 20px 0;">
        <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
        <h3 class="modal-title" style="margin-bottom: 8px;">Invoice Finalized!</h3>
        <p class="text-secondary" style="margin-bottom: 24px;">Invoice <strong>${invoiceId}</strong> has been created successfully.</p>
        
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <button class="btn btn-primary" onclick="Invoices.printInvoice('${invoiceId}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-right:8px;"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print / Save as PDF
          </button>
          
          <button class="btn btn-outline" style="border-color: #25D366; color: #25D366;" onclick="Invoices.shareWhatsApp('${invoiceId}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-right:8px;"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
            Share to WhatsApp
          </button>
          
          <div style="margin: 12px 0; border-top: 1px solid var(--border-light);"></div>
          
          <button class="btn btn-secondary" onclick="Invoices.proceedToDO('${invoiceId}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-right:8px;"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            Create Delivery Order
          </button>
          
          <button class="btn btn-text mt-sm" onclick="App.closeModal()">Close</button>
        </div>
      </div>
    `;
    App.openModal(html);
  }
};
