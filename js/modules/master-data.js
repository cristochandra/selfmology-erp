// ============================================================
// SELFMOLOGY ERP – Master Data Module (Admin Only)
// Updated: Image upload support for product pictures
// ============================================================

const MasterData = {
  products: [],
  filteredProducts: [],

  async load() {
    const result = await API.call('getMasterData');
    if (result.success) {
      this.products = result.data;
      this.filteredProducts = [...this.products];
      this.render();
      this.bindSearch();
    }
  },

  bindSearch() {
    const searchInput = document.getElementById('master-search');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      this.filteredProducts = this.products.filter(p =>
        p.SKU.toLowerCase().includes(q) ||
        p.Product_Name.toLowerCase().includes(q) ||
        (p.Category || '').toLowerCase().includes(q)
      );
      this.render();
    });
  },

  render() {
    const container = document.getElementById('master-list');

    if (this.filteredProducts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <p class="empty-state-title">No Products</p>
          <p class="empty-state-text">Add your first product using the + button</p>
        </div>`;
      return;
    }

    container.innerHTML = this.filteredProducts.map(p => `
      <div class="list-item" onclick="MasterData.showDetail('${p.SKU}')">
        <div class="list-item-icon" style="background:var(--color-primary-light);overflow:hidden;border-radius:var(--radius-md);">
          ${p.Image_URL
            ? `<img src="${p.Image_URL}" alt="${p.Product_Name}" style="width:40px;height:40px;object-fit:cover;border-radius:var(--radius-md);">`
            : this.getCategoryEmoji(p.Category)
          }
        </div>
        <div class="list-item-content">
          <div class="list-item-title">${p.Product_Name}</div>
          <div class="list-item-meta">${p.SKU} · ${p.Category || 'Uncategorized'}</div>
        </div>
        <div class="list-item-value">${App.formatCurrency(p.Standard_Price)}</div>
      </div>
    `).join('');
  },

  getCategoryEmoji(cat) {
    const map = {
      'Cleanser': '🧴', 'Toner': '💧', 'Serum': '✨',
      'Moisturizer': '🌿', 'Mask': '🎭', 'Eye Care': '👁️',
      'Sunscreen': '☀️', 'Body Care': '🛁'
    };
    return map[cat] || '📦';
  },

  showDetail(sku) {
    const p = this.products.find(pr => pr.SKU === sku);
    if (!p) return;

    const html = `
      <h3 class="modal-title">${p.Product_Name}</h3>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${p.Image_URL ? `
          <div style="text-align:center;margin-bottom:8px;">
            <img src="${p.Image_URL}" alt="${p.Product_Name}" style="max-width:160px;border-radius:var(--radius-md);border:1px solid var(--border-light);margin:0 auto;">
          </div>
        ` : ''}
        <div class="flex-between">
          <span class="text-sm text-secondary">SKU</span>
          <span class="text-sm text-bold">${p.SKU}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Category</span>
          <span class="badge badge-finalized">${p.Category || '-'}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">COGS</span>
          <span class="text-sm text-bold">${App.formatCurrency(p.COGS)}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-secondary">Standard Price</span>
          <span class="text-sm text-bold">${App.formatCurrency(p.Standard_Price)}</span>
        </div>
        ${p.Description ? `<p class="text-sm text-secondary mt-sm">${p.Description}</p>` : ''}
        <hr style="border:none;border-top:1px solid var(--border-light);">
        <div class="form-actions">
          <button class="btn btn-secondary" style="flex:1;" onclick="MasterData.showEditForm('${p.SKU}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <button class="btn btn-danger" style="flex:1;" onclick="MasterData.confirmDelete('${p.SKU}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Delete
          </button>
        </div>
      </div>
    `;
    App.openModal(html);
  },

  showAddForm() {
    this._showForm('Add New Product', {});
  },

  showEditForm(sku) {
    App.closeModal();
    setTimeout(() => {
      const p = this.products.find(pr => pr.SKU === sku);
      if (p) this._showForm('Edit Product', p, true);
    }, 300);
  },

  _showForm(title, data, isEdit = false) {
    const hasImage = data.Image_URL ? true : false;
    const html = `
      <h3 class="modal-title">${title}</h3>
      <form id="master-form" onsubmit="return false;">
        <div class="form-group">
          <label class="form-label">Product Picture</label>
          <div class="file-upload" id="product-img-drop" style="padding:16px;">
            ${hasImage
              ? `<img src="${data.Image_URL}" alt="Product" style="max-width:80px;border-radius:var(--radius-sm);margin:0 auto 8px;">`
              : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:28px;height:28px;color:var(--text-tertiary);margin:0 auto 4px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
            }
            <div class="file-upload-text">${hasImage ? 'Change picture' : 'Upload picture'}</div>
            <div class="file-upload-hint">JPG, PNG up to 2MB</div>
          </div>
          <input type="file" id="product-img-input" accept="image/*" class="hidden">
          <input type="hidden" id="mf-image" value="${data.Image_URL || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">SKU</label>
          <input type="text" id="mf-sku" class="form-input" value="${data.SKU || ''}" placeholder="e.g. SM-CLN-001" ${isEdit ? 'readonly style="opacity:0.6"' : 'required'}>
        </div>
        <div class="form-group">
          <label class="form-label">Product Name</label>
          <input type="text" id="mf-name" class="form-input" value="${data.Product_Name || ''}" placeholder="Product name" required>
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="mf-category" class="form-select">
            <option value="">Select category...</option>
            ${['Cleanser','Toner','Serum','Moisturizer','Mask','Eye Care','Sunscreen','Body Care','Other']
              .map(c => `<option value="${c}" ${data.Category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea id="mf-desc" class="form-textarea" placeholder="Brief description">${data.Description || ''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">COGS</label>
            <input type="number" id="mf-cogs" class="form-input" value="${data.COGS || ''}" placeholder="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Standard Price</label>
            <input type="number" id="mf-price" class="form-input" value="${data.Standard_Price || ''}" placeholder="0" min="0">
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-full btn-lg" id="mf-submit">
          ${isEdit ? 'Update Product' : 'Add Product'}
        </button>
      </form>
    `;
    App.openModal(html);

    // Bind image upload
    const dropZone = document.getElementById('product-img-drop');
    const fileInput = document.getElementById('product-img-input');
    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) this._handleProductImage(fileInput.files[0]);
      });
    }

    document.getElementById('master-form').addEventListener('submit', () => this.handleSubmit(isEdit));
    document.getElementById('mf-submit').addEventListener('click', () => this.handleSubmit(isEdit));
  },

  _handleProductImage(file) {
    if (!file.type.startsWith('image/')) {
      App.toast('Please select an image file.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('mf-image').value = e.target.result;
      const dropZone = document.getElementById('product-img-drop');
      // Replace drop zone content with preview
      const existingImg = dropZone.querySelector('img');
      if (existingImg) {
        existingImg.src = e.target.result;
      } else {
        const svg = dropZone.querySelector('svg');
        if (svg) svg.remove();
        const img = document.createElement('img');
        img.src = e.target.result;
        img.style.cssText = 'max-width:80px;border-radius:var(--radius-sm);margin:0 auto 8px;';
        dropZone.insertBefore(img, dropZone.firstChild);
      }
      dropZone.querySelector('.file-upload-text').textContent = file.name;
      dropZone.querySelector('.file-upload-hint').textContent = 'Tap to change';
    };
    reader.readAsDataURL(file);
  },

  async handleSubmit(isEdit) {
    const data = {
      SKU: document.getElementById('mf-sku').value.trim(),
      Product_Name: document.getElementById('mf-name').value.trim(),
      Category: document.getElementById('mf-category').value,
      Description: document.getElementById('mf-desc').value.trim(),
      COGS: Number(document.getElementById('mf-cogs').value) || 0,
      Standard_Price: Number(document.getElementById('mf-price').value) || 0,
      Image_URL: document.getElementById('mf-image').value.trim()
    };

    if (!data.SKU || !data.Product_Name) {
      App.toast('SKU and Product Name are required.', 'warning');
      return;
    }

    const action = isEdit ? 'updateProduct' : 'addProduct';
    const result = await API.call(action, data);
    if (result.success) {
      App.toast(result.message, 'success');
      App.closeModal();
      this.load();
      App.loadMasterData();
    }
  },

  confirmDelete(sku) {
    App.closeModal();
    setTimeout(() => {
      App.confirm(
        'Delete Product',
        `Are you sure you want to delete ${sku}? This cannot be undone.`,
        () => this.deleteProduct(sku),
        'danger'
      );
    }, 300);
  },

  async deleteProduct(sku) {
    const result = await API.call('deleteProduct', { SKU: sku });
    if (result.success) {
      App.toast(result.message, 'success');
      this.load();
      App.loadMasterData();
    }
  }
};
