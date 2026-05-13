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
    const netTotal = Number(inv.Total_Amount) || 0;

    // First, let's check if Line_Total column in database stores the discount amount instead of net total.
    // We sum Line_Total and sum (Gross - Line_Total) across all lines.
    let sumLt = 0;
    let sumGrossMinusLt = 0;
    lines.forEach(l => {
      const up = Number(l.Unit_Price) || 0;
      const q  = Number(l.Quantity)   || 1;
      const lt = Number(l.Line_Total) || 0;
      sumLt += lt;
      sumGrossMinusLt += (up * q - lt);
    });
    // If sumGrossMinusLt is closer to netTotal than sumLt is, legacy Line_Total represents the discount amount.
    const isLtDiscount = Math.abs(sumGrossMinusLt - netTotal) < Math.abs(sumLt - netTotal);

    // Helper: compute per-unit nominal discount for a line item
    const getUnitDisc = (l) => {
      const up = Number(l.Unit_Price) || 0;
      const q  = Number(l.Quantity)  || 1;
      const dv = Number(l.Discount_Value);
      const dt = l.Discount_Type || 'fixed';
      const d  = Number(l.Discount); // total discount stored by backend

      if (dv > 0) {
        // Discount_Value is per-unit nominal for fixed, or % rate for percentage
        const uDisc = dt === 'percentage' ? up * (dv / 100) : dv;
        return uDisc < up ? uDisc : 0;
      }
      if (d > 0) {
        // Discount column = Discount_Value * Qty (per backend line 359)
        // So per-unit = d / q
        const uDisc = d / q;
        return uDisc < up ? uDisc : 0;
      }
      // Fallback: infer from Line_Total
      const lt = Number(l.Line_Total) || 0;
      if (lt > 0 && lt < up * q) {
        if (isLtDiscount) {
          // lt is the total discount amount for this line
          return lt / q;
        } else {
          // lt is the net total amount for this line
          return (up * q - lt) / q;
        }
      }
      return 0;
    };

    // Build row data
    const rows = lines.map(l => {
      const up   = Number(l.Unit_Price) || 0;
      const q    = Number(l.Quantity)   || 1;
      const uDisc = getUnitDisc(l);
      const finalUp = up - uDisc;             // After Disc unit price
      const rowTotal = finalUp * q;           // Total column
      return { l, up, q, uDisc, finalUp, rowTotal };
    });

    // Subtotal = sum of all rowTotals (what's actually charged)
    const tableSubtotal = rows.reduce((s, r) => s + r.rowTotal, 0);

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
            <thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Price</th><th>After Disc</th><th>Total</th></tr></thead>
            <tbody>
              ${rows.map(({ l, up, q, uDisc, finalUp, rowTotal }) => {
                const product = App.getProductBySKU(l.SKU);
                const productName = product ? product.Product_Name : '-';
                const hasDiscount = uDisc > 0.01;

                const priceDisplay = hasDiscount
                  ? `<span style="text-decoration:line-through; color:var(--text-secondary);">${App.formatCurrency(up)}</span>`
                  : App.formatCurrency(up);

                const afterDiscDisplay = hasDiscount
                  ? `<span style="color:var(--color-primary); font-weight:bold;">${App.formatCurrency(finalUp)}</span>`
                  : '<span style="color:var(--text-secondary);">-</span>';

                return `
                  <tr>
                    <td>${l.SKU}</td>
                    <td style="white-space:normal;max-width:100px;">${productName}</td>
                    <td>${q}</td>
                    <td>${priceDisplay}</td>
                    <td>${afterDiscDisplay}</td>
                    <td>${App.formatCurrency(rowTotal)}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="flex-between" style="padding-top:12px; margin-top:8px;">
          <span class="text-sm text-secondary">Subtotal</span>
          <span class="text-sm">${App.formatCurrency(tableSubtotal)}</span>
        </div>
        <div class="flex-between" style="padding-top:8px;border-top:2px solid var(--text-primary); margin-top:4px;">
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
            <button class="btn btn-outline" style="flex:1;" onclick="Invoices.editInvoice('${inv.Invoice_ID}')">
              Edit
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

  async editInvoice(invoiceId) {
    App.closeModal();
    const inv = this.invoices.find(i => i.Invoice_ID === invoiceId);
    if (!inv) return;

    App.showLoading();
    const lineResult = await API.call('getLineItems', { Invoice_ID: invoiceId });
    App.hideLoading();
    const lines = lineResult.success ? lineResult.data : [];

    this._editingInvoiceId = invoiceId;
    this.showCreateForm(inv, lines);
  },

  async showCreateForm(existingInv = null, existingLines = []) {
    const isEdit = !!existingInv;
    const customerValue = isEdit ? existingInv.Customer_Name : '';
    const dateValue = isEdit ? (existingInv.Date_Created.split('T')[0] || App.todayStr()) : App.todayStr();
    
    // Calculate initial due date
    const d = new Date(dateValue);
    d.setDate(d.getDate() + 14);
    const dueDateValue = isEdit && existingInv.Payment_Due_Date ? existingInv.Payment_Due_Date.split('T')[0] : d.toISOString().split('T')[0];

    // Fetch next ID for preview if not editing
    let displayId = isEdit ? existingInv.Invoice_ID : '...';
    if (!isEdit) {
      const idResult = await API.call('getNextInvoiceId');
      if (idResult.success) displayId = idResult.nextId;
    }

    // Build customer datalist options
    const customerOptions = AppState.customers.map(c => `<option value="${c}">`).join('');

    let html = `
      <h3 class="modal-title">${isEdit ? 'Edit Draft Invoice' : 'Create Invoice'} <span style="font-size:14px; color:var(--text-secondary); margin-left:8px;">(${displayId})</span></h3>
      <form id="invoice-form" onsubmit="return false;">
        <div class="form-group">
          <label class="form-label">Customer Name</label>
          <input type="text" id="inv-customer" class="form-input" list="customer-list" placeholder="Type or select customer" value="${customerValue}" onchange="Invoices.onCustomerChange()" required>
          <datalist id="customer-list">${customerOptions}</datalist>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" id="inv-date" class="form-input" value="${dateValue}">
          </div>
          <div class="form-group">
            <label class="form-label">Due Date</label>
            <input type="date" id="inv-due" class="form-input" value="${dueDateValue}" readonly style="opacity:0.6">
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
      const changedD = new Date(e.target.value);
      changedD.setDate(changedD.getDate() + 14);
      document.getElementById('inv-due').value = changedD.toISOString().split('T')[0];
    });

    if (isEdit && existingLines.length > 0) {
      existingLines.forEach(line => this.addLineItemRow(line));
    } else {
      this.addLineItemRow();
    }
  },

  _lineCounter: 0,

  addLineItemRow(existingLine = null) {
    this._lineCounter++;
    const container = document.getElementById('line-items-container');
    const row = document.createElement('div');
    row.className = 'line-item-row';
    row.id = 'line-row-' + this._lineCounter;

    const sku = existingLine ? existingLine.SKU : '';
    const qty = existingLine ? existingLine.Quantity : 1;
    const price = existingLine ? existingLine.Unit_Price : 0;
    const discType = existingLine ? (existingLine.Discount_Type || 'fixed') : 'fixed';
    const discVal = existingLine ? existingLine.Discount_Value : 0;

    // Show product name and total stock
    const options = '<option value="">Select...</option>' +
      AppState.masterData.map(p => {
        let currentStock = 0;
        if (Inventory && Inventory.summary) {
           currentStock = Inventory.summary.filter(s => s.SKU === p.SKU).reduce((acc, curr) => acc + Number(curr.Qty), 0);
        }
        const selected = (p.SKU === sku) ? 'selected' : '';
        return `<option value="${p.SKU}" data-price="${p.Standard_Price}" data-stock="${currentStock}" ${selected}>${p.SKU} – ${p.Product_Name} (Stock: ${currentStock})</option>`;
      }).join('');

    row.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:2px; flex:2; min-width:140px;">
        <select class="li-sku" onchange="Invoices.onLineItemChange(this)">${options}</select>
        <span class="text-xs text-secondary li-stock-display"></span>
      </div>
      <input type="number" class="li-qty" min="1" value="${qty}" onchange="Invoices.onLineItemChange(this)" style="flex:1; min-width:50px;">
      <input type="number" class="li-price" min="0" value="${price}" onchange="Invoices.onLineItemChange(this)" style="flex:1.5; min-width:70px;">
      <div style="display:flex; gap:2px; flex:1.5; min-width:100px;">
        <select class="li-disc-type" onchange="Invoices.onLineItemChange(this)" style="padding:4px; font-size:12px; width:45px;">
          <option value="fixed" ${discType === 'fixed' ? 'selected' : ''}>Rp</option>
          <option value="percentage" ${discType === 'percentage' ? 'selected' : ''}>%</option>
        </select>
        <input type="number" class="li-discount-val" min="0" value="${discVal}" placeholder="Disc" onchange="Invoices.onLineItemChange(this)" style="width:100%;">
      </div>
      <span class="li-total text-sm text-bold" style="flex:1.5; min-width:80px; align-self:center;">Rp 0</span>
      <button class="remove-line-btn" style="flex:0.5; min-width:30px; align-self:center;" onclick="this.closest('.line-item-row').remove();Invoices.updateTotal();">×</button>
    `;
    container.appendChild(row);

    if (existingLine) {
      this.onLineItemChange(row.querySelector('.li-qty'));
    }
  },

  onCustomerChange() {
    const custName = document.getElementById('inv-customer')?.value?.trim();
    if (!custName) return;
    const custObj = (AppState.customerObjects || []).find(c => c.Customer_Name === custName);
    let b2bPrices = {};
    try { if (custObj && custObj.B2B_Prices) b2bPrices = JSON.parse(custObj.B2B_Prices); } catch (e) {}

    let appliedCount = 0;
    document.querySelectorAll('#line-items-container .line-item-row').forEach(row => {
      const skuSelect = row.querySelector('.li-sku');
      const priceInput = row.querySelector('.li-price');
      const discTypeSelect = row.querySelector('.li-disc-type');
      const discValInput = row.querySelector('.li-discount-val');
      if (skuSelect && priceInput && skuSelect.value) {
        const sku = skuSelect.value;
        const standardPrice = Number(skuSelect.options[skuSelect.selectedIndex]?.dataset.price) || 0;
        if (b2bPrices[sku] !== undefined) {
          const b2bPrice = Number(b2bPrices[sku]);
          if (b2bPrice > 0 && standardPrice > b2bPrice) {
            priceInput.value = standardPrice;
            if (discTypeSelect) discTypeSelect.value = 'fixed';
            if (discValInput) discValInput.value = standardPrice - b2bPrice;
            appliedCount++;
            
            const totalSpan = row.querySelector('.li-total');
            const qty = Number(row.querySelector('.li-qty')?.value) || 0;
            const lineTotal = b2bPrice * qty;
            if (totalSpan) totalSpan.textContent = App.formatCurrency(Math.max(0, lineTotal));
          }
        }
      }
    });

    if (appliedCount > 0) {
      App.toast(`Applied B2B agreed prices to ${appliedCount} item(s)`, 'info');
      this.updateTotal();
    }
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
        const standardPrice = Number(selected.dataset.price);
        priceInput.value = standardPrice;

        // Auto apply B2B agreed pricing for selected customer if configured
        const custName = document.getElementById('inv-customer')?.value?.trim();
        const custObj = (AppState.customerObjects || []).find(c => c.Customer_Name === custName);
        let b2bPrices = {};
        try { if (custObj && custObj.B2B_Prices) b2bPrices = JSON.parse(custObj.B2B_Prices); } catch (e) {}

        const sku = skuSelect.value;
        if (sku && b2bPrices[sku] !== undefined) {
          const b2bPrice = Number(b2bPrices[sku]);
          if (b2bPrice > 0 && standardPrice > b2bPrice) {
            discTypeSelect.value = 'fixed';
            discValInput.value = standardPrice - b2bPrice;
            App.toast(`Applied B2B agreed price for ${sku}`, 'info');
          }
        } else {
          discValInput.value = 0;
        }
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
      // Per unit discount: discVal * qty
      discountAmount = discVal * qty;
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
        // Per unit discount: discVal * qty
        discountAmount = discVal * qty;
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

    const isEditing = !!this._editingInvoiceId;
    if (isEditing) {
      header.Invoice_ID = this._editingInvoiceId;
      await API.call('deleteInvoice', { Invoice_ID: this._editingInvoiceId });
    }

    const result = await API.call('createInvoice', { header, lineItems });
    if (result.success) {
      this._editingInvoiceId = null;
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

    // Intelligent legacy check: does Line_Total represent discount amount?
    let sumLt = 0;
    let sumGrossMinusLt = 0;
    lines.forEach(l => {
      const up = Number(l.Unit_Price) || 0;
      const q  = Number(l.Quantity)   || 1;
      const lt = Number(l.Line_Total) || 0;
      sumLt += lt;
      sumGrossMinusLt += (up * q - lt);
    });
    const isLtDiscountPrint = Math.abs(sumGrossMinusLt - netTotal) < Math.abs(sumLt - netTotal);

    // Helper: per-unit discount
    const getUnitDiscP = (l) => {
      const up = Number(l.Unit_Price) || 0;
      const q  = Number(l.Quantity)  || 1;
      const dv = Number(l.Discount_Value);
      const dt = l.Discount_Type || 'fixed';
      const d  = Number(l.Discount);
      if (dv > 0) {
        const uDisc = dt === 'percentage' ? up * (dv / 100) : dv;
        return uDisc < up ? uDisc : 0;
      }
      if (d > 0) {
        const uDisc = d / q;
        return uDisc < up ? uDisc : 0;
      }
      const lt = Number(l.Line_Total) || 0;
      if (lt > 0 && lt < up * q) {
        return isLtDiscountPrint ? (lt / q) : ((up * q - lt) / q);
      }
      return 0;
    };

    const pRows = lines.map(l => {
      const up = Number(l.Unit_Price) || 0;
      const q  = Number(l.Quantity)   || 1;
      const uDisc = getUnitDiscP(l);
      const finalUp = up - uDisc;
      const rowTotal = finalUp * q;
      return { l, up, q, uDisc, finalUp, rowTotal };
    });

    // Subtotal = sum of all row totals in the table
    const tableSubtotalPrint = pRows.reduce((s, r) => s + r.rowTotal, 0);

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
              <th style="text-align:right; padding:12px 8px; font-size:11px; text-transform:uppercase; color:#6B7280;">Disc. Price</th>
              <th style="text-align:right; padding:12px 8px; font-size:11px; text-transform:uppercase; color:#6B7280;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${pRows.map(({ l, up, q, uDisc, finalUp, rowTotal }) => {
              const product = App.getProductBySKU(l.SKU);
              const pName = product ? product.Product_Name : '-';
              const hasDiscount = uDisc > 0.01;

              const origPriceDisplay = hasDiscount
                ? `<span style="text-decoration:line-through; color:#9CA3AF;">${App.formatCurrency(up)}</span>`
                : App.formatCurrency(up);

              const afterDiscDisplay = hasDiscount
                ? `<span style="color:#10B981; font-weight:600;">${App.formatCurrency(finalUp)}</span>`
                : '-';

              return `
                <tr style="border-bottom:1px solid #E5E7EB;">
                  <td style="padding:16px 8px;">
                    <div style="font-size:14px; font-weight:600;">${pName}</div>
                    <div style="font-size:11px; color:#9CA3AF; margin-top:2px;">SKU: ${l.SKU}</div>
                  </td>
                  <td style="text-align:right; padding:16px 8px; font-size:14px;">${q}</td>
                  <td style="text-align:right; padding:16px 8px; font-size:14px;">${origPriceDisplay}</td>
                  <td style="text-align:right; padding:16px 8px; font-size:14px;">${afterDiscDisplay}</td>
                  <td style="text-align:right; padding:16px 8px; font-size:14px; font-weight:600;">${App.formatCurrency(rowTotal)}</td>
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
              <span style="font-weight:500;">${App.formatCurrency(tableSubtotalPrint)}</span>
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
