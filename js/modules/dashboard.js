// ============================================================
// SELFMOLOGY ERP – Dashboard Module (Admin Only)
// ============================================================

const Dashboard = {
  data: null,

  async load() {
    const dateFrom = document.getElementById('dash-date-from').value;
    const dateTo = document.getElementById('dash-date-to').value;
    const result = await API.call('getDashboardData', { dateFrom, dateTo });
    if (result.success) {
      this.data = result.data;
      this.render();
    }
  },

  render() {
    const d = this.data;

    // KPI Cards
    document.getElementById('kpi-skus').textContent = d.totalSKUs;
    document.getElementById('kpi-stock').textContent = d.totalStockUnits.toLocaleString();
    document.getElementById('kpi-value').textContent = App.formatCurrency(d.totalStockValue);
    document.getElementById('kpi-low').textContent = d.lowStockCount;

    // Top Selling Chart
    this.renderTopSelling(d.topSelling);

    // Low Stock Alerts
    this.renderLowStock(d.lowStockItems);

    // Stock Table
    this.renderStockTable(d.stockDetails);

    // Bind filter button
    document.getElementById('dash-filter-btn').onclick = () => this.load();
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

  renderLowStock(items) {
    const container = document.getElementById('low-stock-list');
    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <p class="empty-state-title">All Good!</p>
          <p class="empty-state-text">No low stock items</p>
        </div>`;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="list-item">
        <div class="list-item-icon" style="background:var(--color-red-light);">⚠️</div>
        <div class="list-item-content">
          <div class="list-item-title">${item.Product_Name}</div>
          <div class="list-item-meta">${item.SKU}</div>
        </div>
        <div>
          <span class="badge badge-low-stock">${item.currentStock} left</span>
        </div>
      </div>
    `).join('');
  },

  renderStockTable(items) {
    const tbody = document.getElementById('stock-table-body');
    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-secondary" style="padding:24px;">No data</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(item => {
      const stockClass = item.currentStock <= 10 ? 'badge-low-stock' : 'badge-in-stock';
      return `
        <tr>
          <td><strong>${item.SKU}</strong></td>
          <td>${item.Product_Name}</td>
          <td>${item.totalIn}</td>
          <td>${item.totalOut}</td>
          <td><span class="badge ${stockClass}">${item.currentStock}</span></td>
          <td>${App.formatCurrency(item.stockValue)}</td>
        </tr>`;
    }).join('');
  }
};
