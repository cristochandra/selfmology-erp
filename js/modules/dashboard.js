// ============================================================
// SELFMOLOGY ERP – Dashboard Module (Admin Only)
// ============================================================

const Dashboard = {
  data: null,
  channel: '',

  setChannel(chan) {
    this.channel = chan;
    ['all', 'online', 'b2b'].forEach(c => {
      const btn = document.getElementById('dash-chan-' + c);
      if (btn) {
        if ((c === 'all' && chan === '') || c === chan) {
          btn.classList.add('active');
          btn.style.background = '';
          btn.style.color = '';
        } else {
          btn.classList.remove('active');
          btn.style.background = 'transparent';
          btn.style.color = 'var(--text-secondary)';
        }
      }
    });
    this.load();
  },

  async load() {
    const dateFromInput = document.getElementById('dash-date-from');
    const dateToInput = document.getElementById('dash-date-to');
    const dateFrom = dateFromInput ? dateFromInput.value : '';
    const dateTo = dateToInput ? dateToInput.value : '';
    
    try {
      const [result, summaryResult] = await Promise.all([
        API.call('getDashboardData', { dateFrom, dateTo, channel: this.channel }),
        API.call('getStockSummary')
      ]);

      if (summaryResult && summaryResult.success) {
        Inventory.summary = summaryResult.data || [];
      }

      if (result && result.success) {
        this.data = result.data;
        this.render();
      } else {
        throw new Error(result ? result.error : 'No dashboard data received');
      }
    } catch (err) {
      console.error('Dashboard Load Error:', err);
      // Show empty state instead of freezing
      this.data = { totalSKUs: 0, totalStockUnits: 0, overdueCount: 0, lowStockOnlineCount: 0, stockDetails: [], topPendingInvoices: [], topSelling: [], expiringBatches: [], totalExpenses: 0, totalIncome: 0, expenseBreakdown: [], cashflow: [] };
      this.render();
    }
  },

  render() {
    const d = this.data;

    // KPI Cards
    document.getElementById('kpi-skus').textContent = d.totalSKUs;
    document.getElementById('kpi-stock').textContent = d.totalStockUnits.toLocaleString();
    
    const kpiExpenses = document.getElementById('kpi-expenses');
    if (kpiExpenses) {
      kpiExpenses.textContent = App.formatCurrency(d.totalExpenses || 0);
    }

    const kpiIncome = document.getElementById('kpi-income');
    if (kpiIncome) {
      kpiIncome.textContent = App.formatCurrency(d.totalIncome || 0);
    }

    // Reflect the active date range (defaults to month-to-date from backend)
    const fromInput = document.getElementById('dash-date-from');
    const toInput = document.getElementById('dash-date-to');
    if (fromInput && !fromInput.value && d.dateFrom) fromInput.value = d.dateFrom;
    if (toInput && !toInput.value && d.dateTo) toInput.value = d.dateTo;

    // Show alerts if any
    const alertContainer = document.getElementById('dashboard-alerts');
    if (alertContainer) {
      let alertsHtml = '';
      if (d.overdueCount > 0) {
        alertsHtml += `
          <div class="alert alert-danger mb-md" style="cursor:pointer;" onclick="App.navigate('delivery')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span><strong>${d.overdueCount}</strong> Invoices are overdue! Click here to view Delivery Orders.</span>
          </div>`;
      }
      if (d.lowStockOnlineCount > 0) {
        alertsHtml += `
          <div class="alert alert-warning mb-md">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span><strong>${d.lowStockOnlineCount}</strong> items are low in Online Warehouse (< 10 pcs).</span>
          </div>`;
      }
      alertContainer.innerHTML = alertsHtml;
    }

    // Cashflow (Income vs Expense) chart
    this.renderCashflow(d.cashflow);

    // Top Selling Chart
    this.renderTopSelling(d.topSelling);

    // Expense Breakdown Chart
    this.renderExpenseBreakdown(d.expenseBreakdown);

    // Stock Table
    this.renderStockTable(d.stockDetails);

    // Pending Invoices
    this.renderPendingInvoices(d.topPendingInvoices);

    // Expiring Batches
    this.renderExpiringBatches(d.expiringBatches);

    // Bind filter button
    document.getElementById('dash-filter-btn').onclick = () => this.load();
  },

  renderExpenseBreakdown(items) {
    const container = document.getElementById('expense-breakdown-chart');
    if (!container) return;
    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💸</div>
          <p class="empty-state-text">No expense data for this range</p>
        </div>`;
      return;
    }

    const max = Math.max(...items.map(i => i.Amount));
    container.innerHTML = items.map(item => `
      <div class="bar-row">
        <div class="bar-label" title="${item.Category}">${item.Category}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${(item.Amount / max * 100)}%; background: var(--color-red);"></div>
        </div>
        <div class="bar-value">${App.formatCurrency(item.Amount)}</div>
      </div>
    `).join('');
  },

  renderTopSelling(items) {
    const container = document.getElementById('top-selling-chart');
    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📊</div>
          <p class="empty-state-text">No sales data yet</p>
        </div>`;
      return;
    }

    const max = Math.max(...items.map(i => i.totalSold));
    container.innerHTML = items.map(item => `
      <div class="bar-row">
        <div class="bar-label" title="${item.Product_Name}">${item.Product_Name}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${(item.totalSold / max * 100)}%"></div>
        </div>
        <div class="bar-value">${item.totalSold}</div>
      </div>
    `).join('');
  },



  renderStockTable(items) {
    const tbody = document.getElementById('stock-table-body');
    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary" style="padding:24px;">No data</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(item => {
      const clinic = item.clinicStock || 0;
      const offlineClass = item.offlineStock <= 10 ? 'badge-low-stock' : 'badge-in-stock';
      const onlineClass = item.onlineStock <= 10 ? 'badge-low-stock' : 'badge-in-stock';
      const clinicClass = clinic <= 10 ? 'badge-low-stock' : 'badge-in-stock';
      return `
        <tr>
          <td><strong>${item.SKU}</strong></td>
          <td>${item.Product_Name}</td>
          <td><span class="badge ${offlineClass}">${item.offlineStock}</span></td>
          <td><span class="badge ${onlineClass}">${item.onlineStock}</span></td>
          <td><span class="badge ${clinicClass}">${clinic}</span></td>
        </tr>`;
    }).join('');
  },

  renderCashflow(items) {
    const container = document.getElementById('cashflow-chart');
    if (!container) return;
    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📈</div>
          <p class="empty-state-text">No cashflow data yet</p>
        </div>`;
      return;
    }

    const max = Math.max(1, ...items.map(i => Math.max(Number(i.income) || 0, Number(i.expense) || 0)));
    const bars = items.map(m => {
      const inc = Number(m.income) || 0;
      const exp = Number(m.expense) || 0;
      const incH = Math.round((inc / max) * 100);
      const expH = Math.round((exp / max) * 100);
      const net = inc - exp;
      const netColor = net >= 0 ? 'var(--color-mint)' : 'var(--color-red)';
      return `
        <div style="flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:6px;">
          <div title="Income ${App.formatCurrency(inc)} · Expense ${App.formatCurrency(exp)} · Net ${App.formatCurrency(net)}"
               style="display:flex; align-items:flex-end; justify-content:center; gap:3px; height:150px; width:100%;">
            <div style="width:42%; max-width:18px; height:${incH}%; min-height:2px; background:var(--color-mint); border-radius:4px 4px 0 0;"></div>
            <div style="width:42%; max-width:18px; height:${expH}%; min-height:2px; background:var(--color-red); border-radius:4px 4px 0 0;"></div>
          </div>
          <div class="text-xs text-secondary" style="white-space:nowrap;">${m.label || m.month}</div>
          <div class="text-xs" style="font-weight:600; color:${netColor};">${this.shortCurrency(net)}</div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div style="display:flex; gap:16px; align-items:center; margin-bottom:14px; font-size:12px;">
        <span style="display:flex; align-items:center; gap:6px;"><span style="width:12px; height:12px; border-radius:3px; background:var(--color-mint); display:inline-block;"></span>Income</span>
        <span style="display:flex; align-items:center; gap:6px;"><span style="width:12px; height:12px; border-radius:3px; background:var(--color-red); display:inline-block;"></span>Expense</span>
        <span class="text-xs text-secondary" style="margin-left:auto;">Net shown below each month</span>
      </div>
      <div style="display:flex; gap:8px; align-items:flex-end; overflow-x:auto; padding-bottom:4px;">
        ${bars}
      </div>`;
  },

  shortCurrency(n) {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)}K`;
    return `${sign}${abs}`;
  },

  renderPendingInvoices(items) {
    const container = document.getElementById('pending-invoices-list');
    if (!container) return;
    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <p class="empty-state-title">No Pending Invoices</p>
          <p class="empty-state-text">All finalized invoices are paid.</p>
        </div>`;
      return;
    }

    container.innerHTML = items.map(inv => {
      const isOverdue = inv.Payment_Due_Date && inv.Payment_Due_Date < App.todayStr();
      return `
        <div class="list-item" style="cursor:pointer;" onclick="App.navigate('delivery')">
          <div class="list-item-icon" style="background:${isOverdue ? 'var(--color-red-light)' : 'var(--color-orange-light)'};">📄</div>
          <div class="list-item-content">
            <div class="list-item-title">${inv.Invoice_ID} <span class="badge ${isOverdue ? 'badge-low-stock' : 'badge-pending'}">${isOverdue ? 'Overdue' : 'Pending'}</span></div>
            <div class="list-item-meta">${inv.Customer_Name} · Due: ${inv.Payment_Due_Date ? App.formatDate(inv.Payment_Due_Date) : 'N/A'}</div>
          </div>
          <div class="list-item-value">${App.formatCurrency(inv.Total_Amount)}</div>
        </div>
      `;
    }).join('');
  },

  renderExpiringBatches(items) {
    const container = document.getElementById('expiring-batches-list');
    if (!container) return;
    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <p class="empty-state-title">No Expiring Batches</p>
          <p class="empty-state-text">All batches have > 1 year shelf life.</p>
        </div>`;
      return;
    }

    let html = `
      <div class="alert mb-md" style="background:var(--color-orange-light); color:var(--color-orange); border:1px solid var(--color-orange);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        <span><strong>${items.length}</strong> batches have a shelf life of less than 1 year. Please review inventory.</span>
      </div>
    `;

    html += items.map(item => `
      <div class="list-item" style="cursor:pointer;" onclick="Inventory.showSkuDetails('${item.SKU}')">
        <div class="list-item-icon" style="background:var(--color-orange-light);">⏳</div>
        <div class="list-item-content">
          <div class="list-item-title">${item.Product_Name}</div>
          <div class="list-item-meta">${item.SKU} · Batch: ${item.Batch_Number || '-'}</div>
        </div>
        <div>
          <div class="badge badge-low-stock" style="margin-bottom:4px;">Exp: ${item.Expiry_Date ? App.formatDate(item.Expiry_Date) : '-'}</div>
          <div class="text-xs text-secondary text-right">Qty: <strong>${item.Qty}</strong></div>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = html;
  }
};
