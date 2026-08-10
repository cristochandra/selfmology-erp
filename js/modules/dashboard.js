// ============================================================
// SELFMOLOGY ERP – Dashboard Module (Admin Only)
// ============================================================

const Dashboard = {
  data: null,
  analytics: null,
  analyticsPeriod: 'month', // 'week' | 'month' | 'year' — drives the analytics summary range
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
      const [result, summaryResult, analyticsResult] = await Promise.all([
        API.call('getDashboardData', { dateFrom, dateTo, channel: this.channel }),
        API.call('getStockSummary'),
        // Analytics is best-effort: if the backend action isn't deployed yet
        // (older Code.gs), it just returns an error and we render empty states.
        // Its range follows the analytics period toggle (default: this month).
        API.call('getAnalyticsData', this._analyticsRange()).catch(() => null)
      ]);

      if (summaryResult && summaryResult.success) {
        Inventory.summary = summaryResult.data || [];
      }

      this.analytics = (analyticsResult && analyticsResult.success) ? analyticsResult.data : null;

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

    // Analytics section (profit/margin, trends, channel, customers, weekly online)
    this.renderAnalytics(this.analytics);

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

  // ============================================================
  // ANALYTICS RENDERING (profit/margin, trends, channel, weekly online)
  // ============================================================
  _emptyState(icon, text) {
    return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><p class="empty-state-text">${text}</p></div>`;
  },

  renderAnalytics(a) {
    this._setPeriodActive();
    const label = document.getElementById('analytics-range-label');
    if (label) label.textContent = (a && a.dateFrom) ? `${a.dateFrom} → ${a.dateTo}` : '';
    this.renderCogsWarning(a && a.cogsCoverage);
    this.renderAnalyticsKpis(a && a.totals);
    this.renderMarginTrend(a && a.monthly);
    this.renderWeeklyOnline(a && a.weeklyOnline);
    this.renderChannelSplit(a && a.channelSplit);
    this.renderTopMargin(a && a.topSkusByMargin);
  },

  // Range for the analytics summary (KPIs, channel split, top SKUs) based on
  // the selected period. Trend charts keep their own fixed 12-mo / 12-wk windows.
  _analyticsRange() {
    const now = new Date();
    const fmt = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const p = this.analyticsPeriod || 'month';
    let from;
    if (p === 'week') {
      const dow = (now.getDay() + 6) % 7; // Mon = 0
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    } else if (p === 'year') {
      from = new Date(now.getFullYear(), 0, 1);
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { dateFrom: fmt(from), dateTo: fmt(now) };
  },

  _setPeriodActive() {
    ['week', 'month', 'year'].forEach(p => {
      const btn = document.getElementById('ana-period-' + p);
      if (!btn) return;
      if (p === (this.analyticsPeriod || 'month')) {
        btn.classList.add('active');
        btn.style.background = '';
        btn.style.color = '';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-secondary)';
      }
    });
  },

  setAnalyticsPeriod(p) {
    this.analyticsPeriod = p;
    this.loadAnalytics();
  },

  // Re-fetch only the analytics block for the current period (used by the
  // Weekly / Monthly / Annual toggle without reloading the whole dashboard).
  async loadAnalytics() {
    this._setPeriodActive();
    try {
      const res = await API.call('getAnalyticsData', this._analyticsRange());
      this.analytics = (res && res.success) ? res.data : null;
    } catch (e) {
      this.analytics = null;
    }
    this.renderAnalytics(this.analytics);
  },

  renderCogsWarning(cov) {
    const el = document.getElementById('analytics-cogs-warning');
    if (!el) return;
    if (!cov || !cov.missingCount) { el.innerHTML = ''; return; }
    const names = (cov.missing || []).slice(0, 8).map(m => m.Product_Name || m.SKU).join(', ');
    el.innerHTML = `
      <div class="alert alert-warning" style="cursor:default;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span><strong>${cov.missingCount}</strong> of ${cov.totalSKUs} SKUs have no COGS set — margin figures exclude their cost and may be overstated.${names ? ` Missing: ${names}${cov.missingCount > 8 ? '…' : ''}` : ''}</span>
      </div>`;
  },

  renderAnalyticsKpis(t) {
    const el = document.getElementById('analytics-kpis');
    if (!el) return;
    if (!t) {
      el.innerHTML = `<div class="card" style="grid-column:1/-1;">${this._emptyState('📊', 'Analytics unavailable — deploy the latest backend (getAnalyticsData) to enable.')}</div>`;
      return;
    }
    const excl = t.excludesOffline ? 'excl. offline' : '';
    const cards = [
      { label: 'Revenue', value: App.formatCurrency(t.revenue), color: 'var(--color-mint)',
        note: (t.offlineRevenue > 0) ? `incl. ${App.formatCurrency(t.offlineRevenue)} offline` : '' },
      { label: 'COGS', value: App.formatCurrency(t.cogs), color: 'var(--color-red)', note: '' },
      { label: 'Gross Margin', value: App.formatCurrency(t.margin), color: t.margin >= 0 ? 'var(--color-mint)' : 'var(--color-red)', note: excl },
      { label: 'Margin %', value: `${t.marginPct}%`, color: 'var(--color-primary)', note: excl }
    ];
    el.innerHTML = cards.map(c => `
      <div class="card analytics-kpi">
        <div class="analytics-kpi-label">${c.label}</div>
        <div class="analytics-kpi-value" style="color:${c.color};">${c.value}</div>
        ${c.note ? `<div class="text-xs text-tertiary" style="margin-top:3px;">${c.note}</div>` : ''}
      </div>`).join('');
  },

  // Reusable inline-SVG multi-line chart. labels: string[]; series:
  // [{name, color, values:number[], fill?}]. Self-contained, theme-aware
  // via CSS custom properties, no external dependency.
  _svgMultiLine(labels, series, opts) {
    opts = opts || {};
    const W = 640, H = 220, padL = 8, padR = 8, padT = 12, padB = 26;
    const n = labels.length;
    if (!n) return this._emptyState('📈', 'No data yet');
    let maxV = 0;
    series.forEach(s => s.values.forEach(v => { if (Number(v) > maxV) maxV = Number(v); }));
    if (maxV <= 0) maxV = 1;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const x = (i) => padL + (n === 1 ? innerW / 2 : (innerW * i / (n - 1)));
    const y = (v) => padT + innerH - (Math.max(0, Number(v)) / maxV) * innerH;
    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const gy = (padT + innerH * g / 4).toFixed(1);
      grid += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="var(--border-light)" stroke-width="1"/>`;
    }
    let paths = '';
    series.forEach(s => {
      const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      if (s.fill) {
        const area = `${padL},${(padT + innerH).toFixed(1)} ${pts} ${x(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)}`;
        paths += `<polygon points="${area}" fill="${s.color}" opacity="0.10"/>`;
      }
      paths += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      paths += s.values.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${s.color}"><title>${labels[i]}: ${opts.fmt ? opts.fmt(v) : v}</title></circle>`).join('');
    });
    const step = n > 8 ? Math.ceil(n / 6) : 1;
    let xlab = '';
    for (let i = 0; i < n; i++) {
      if (i % step !== 0 && i !== n - 1) continue;
      xlab += `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="10" fill="var(--text-tertiary)" text-anchor="middle">${labels[i]}</text>`;
    }
    const legend = series.map(s => `<span style="display:inline-flex; align-items:center; gap:5px; margin-right:14px; font-size:12px;"><span style="width:12px;height:3px;border-radius:2px;background:${s.color};display:inline-block;"></span>${s.name}</span>`).join('');
    return `
      <div style="margin-bottom:10px;">${legend}</div>
      <div style="overflow-x:auto;">
        <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="min-width:420px; display:block;">
          ${grid}${paths}${xlab}
        </svg>
      </div>`;
  },

  renderMarginTrend(monthly) {
    const el = document.getElementById('margin-trend-chart');
    if (!el) return;
    if (!monthly || !monthly.length || monthly.every(m => !m.revenue && !m.cogs)) {
      el.innerHTML = this._emptyState('📈', 'No revenue in the last 12 months');
      return;
    }
    const labels = monthly.map(m => m.label);
    const series = [
      { name: 'Revenue', color: 'var(--color-mint)', values: monthly.map(m => m.revenue), fill: true },
      { name: 'COGS', color: 'var(--color-red)', values: monthly.map(m => m.cogs) },
      { name: 'Margin', color: 'var(--color-primary)', values: monthly.map(m => m.margin) }
    ];
    el.innerHTML = this._svgMultiLine(labels, series, { fmt: (v) => App.formatCurrency(v) });
  },

  // Renders a "delta pill" for one metric: current value + increment vs the
  // previous week (absolute Δ and % change), coloured up/down.
  _weekDeltaCard(label, cur, prev, fmt) {
    const d = cur - prev;
    const isZero = d === 0;
    const up = d > 0;
    const arrow = isZero ? '→' : (up ? '▲' : '▼');
    const color = isZero ? 'var(--text-tertiary)' : (up ? 'var(--color-mint)' : 'var(--color-red)');
    const prefix = isZero ? '' : (up ? '+' : '−');
    const pct = prev > 0 ? Math.round((d / prev) * 1000) / 10 : null;
    const pctStr = (pct === null) ? (prev === 0 && cur > 0 ? ' · new' : '') : ` · ${pct > 0 ? '+' : ''}${pct}%`;
    return `
      <div class="card" style="padding:12px 14px;">
        <div class="text-xs text-secondary" style="margin-bottom:4px;">${label}</div>
        <div style="font-size:17px; font-weight:700; line-height:1.2;">${fmt(cur)}</div>
        <div style="font-size:12px; font-weight:600; color:${color}; margin-top:5px;">${arrow} ${prefix}${fmt(Math.abs(d))}${pctStr}</div>
        <div class="text-xs text-tertiary" style="margin-top:2px;">prev week: ${fmt(prev)}</div>
      </div>`;
  },

  renderWeeklyOnline(weekly) {
    const el = document.getElementById('weekly-online-chart');
    if (!el) return;
    if (!weekly || !weekly.length || weekly.every(w => !w.revenue)) {
      el.innerHTML = this._emptyState('🛒', 'No completed online sales in the last 12 weeks');
      return;
    }
    const cur = weekly[weekly.length - 1];
    const prev = weekly[weekly.length - 2] || { revenue: 0, units: 0, orders: 0 };
    const num = (v) => Number(v || 0).toLocaleString();
    const cards =
      this._weekDeltaCard('Revenue', cur.revenue, prev.revenue, (v) => App.formatCurrency(v)) +
      this._weekDeltaCard('Units sold', cur.units, prev.units, num) +
      this._weekDeltaCard('Orders', cur.orders, prev.orders, num);
    const header = `
      <div class="text-xs text-secondary" style="margin-bottom:8px;">
        This week (${cur.label}) vs last week (${prev.label || '—'})
      </div>
      <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; margin-bottom:16px;">
        ${cards}
      </div>`;
    const labels = weekly.map(w => w.label);
    const series = [{ name: 'Online revenue', color: 'var(--color-blue)', values: weekly.map(w => w.revenue), fill: true }];
    el.innerHTML = header + this._svgMultiLine(labels, series, { fmt: (v) => App.formatCurrency(v) });
  },

  renderChannelSplit(split) {
    const el = document.getElementById('channel-split-chart');
    if (!el) return;
    const rows = (split || []).filter(s => s.revenue || s.margin);
    if (!rows.length) { el.innerHTML = this._emptyState('🧭', 'No revenue in range'); return; }
    const max = Math.max(1, ...rows.map(s => s.revenue));
    const colors = { Online: 'var(--color-blue)', B2B: 'var(--color-mint)', Offline: 'var(--color-purple)' };
    el.innerHTML = rows.map(s => {
      const pct = (s.revenue / max) * 100;
      const mPct = s.revenue > 0 ? Math.round((s.margin / s.revenue) * 100) : 0;
      return `
        <div class="bar-row" style="align-items:center;">
          <div class="bar-label" title="${s.channel}">${s.channel}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${colors[s.channel] || 'var(--color-primary)'};"></div></div>
          <div class="bar-value" style="min-width:160px; text-align:right;">${App.formatCurrency(s.revenue)} <span class="text-xs text-secondary">· ${mPct}% mgn</span></div>
        </div>`;
    }).join('');
  },

  renderTopMargin(items) {
    const el = document.getElementById('top-margin-list');
    if (!el) return;
    if (!items || !items.length) { el.innerHTML = this._emptyState('🏆', 'No sales in range'); return; }
    el.innerHTML = items.map((it, idx) => `
      <div class="list-item" style="cursor:pointer;" onclick="Inventory.showSkuDetails('${it.SKU}')">
        <div class="list-item-icon" style="background:var(--color-mint-light); color:var(--color-mint); font-weight:700;">${idx + 1}</div>
        <div class="list-item-content">
          <div class="list-item-title">${it.Product_Name}</div>
          <div class="list-item-meta">${it.SKU} · ${it.units} sold · ${it.marginPct}% margin</div>
        </div>
        <div class="list-item-value" style="color:${it.margin >= 0 ? 'var(--color-mint)' : 'var(--color-red)'};">${App.formatCurrency(it.margin)}</div>
      </div>`).join('');
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
