// ============================================================
// SELFMOLOGY ERP – User Management Module
// ============================================================

const UsersModule = {
  users: [],
  filtered: [],

  async load() {
    const result = await API.call('getUsers');
    if (result.success) {
      this.users = result.data;
      this.filtered = [...this.users];
      this.render();
      this.bindSearch();
    }
  },

  bindSearch() {
    const searchInput = document.getElementById('user-search');
    if (!searchInput) return;
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      this.filtered = this.users.filter(u => 
        (u.Name || '').toLowerCase().includes(q) || 
        (u.Email || '').toLowerCase().includes(q)
      );
      this.render();
    });
  },

  render() {
    const container = document.getElementById('users-list');
    if (!container) return;

    if (this.filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <p class="empty-state-title">No Users Found</p>
          <p class="empty-state-text">Create staff accounts using the + button</p>
        </div>`;
      return;
    }

    container.innerHTML = this.filtered.map(user => `
      <div class="list-item" onclick="UsersModule.showEditForm('${user.User_ID}')">
        <div class="list-item-icon" style="background: var(--bg-secondary);">
          ${user.Role === 'Admin' ? '🛡️' : '👤'}
        </div>
        <div class="list-item-content">
          <div class="list-item-title">${user.Name || 'Unnamed User'}</div>
          <div class="list-item-meta">${user.Email} · <span class="badge ${user.Role === 'Admin' ? 'badge-admin' : 'badge-staff'}">${user.Role}</span></div>
        </div>
        <div class="list-item-actions">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
    `).join('');
  },

  showAddForm() {
    const html = `
      <h2 class="modal-title">Add New User</h2>
      <form id="add-user-form" onsubmit="return false;">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input type="text" id="user-name" class="form-input" placeholder="e.g. John Doe" required>
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input type="email" id="user-email" class="form-input" placeholder="e.g. john@selfmology.com" required>
        </div>
        <div class="form-group">
          <label class="form-label">Role</label>
          <select id="user-role" class="form-input form-select" required>
            <option value="Staff">Staff (Inventory & Sales only)</option>
            <option value="Admin">Admin (Full Access)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Initial Password</label>
          <input type="password" id="user-password" class="form-input" placeholder="Set a temporary password" required>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="save-user-btn">Create Account</button>
        </div>
      </form>
    `;
    App.openModal(html);
    document.getElementById('add-user-form').addEventListener('submit', () => this.handleAdd());
  },

  async handleAdd() {
    const data = {
      Name: document.getElementById('user-name').value,
      Email: document.getElementById('user-email').value,
      Role: document.getElementById('user-role').value,
      Password: document.getElementById('user-password').value
    };

    const result = await API.call('addUser', data);
    if (result.success) {
      App.toast('User account created successfully.', 'success');
      App.closeModal();
      this.load();
    }
  },

  showEditForm(userId) {
    const user = this.users.find(u => u.User_ID === userId);
    if (!user) return;

    const html = `
      <h2 class="modal-title">Edit User Account</h2>
      <form id="edit-user-form" onsubmit="return false;">
        <input type="hidden" id="edit-user-id" value="${user.User_ID}">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input type="text" id="edit-user-name" class="form-input" value="${user.Name || ''}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input type="email" id="edit-user-email" class="form-input" value="${user.Email}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Role</label>
          <select id="edit-user-role" class="form-input form-select" required>
            <option value="Staff" ${user.Role === 'Staff' ? 'selected' : ''}>Staff (Inventory & Sales only)</option>
            <option value="Admin" ${user.Role === 'Admin' ? 'selected' : ''}>Admin (Full Access)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Change Password (leave blank to keep current)</label>
          <input type="password" id="edit-user-password" class="form-input" placeholder="New password">
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-danger" onclick="UsersModule.handleDelete('${user.User_ID}')">Delete User</button>
          <div style="flex:1"></div>
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Account</button>
        </div>
      </form>
    `;
    App.openModal(html);
    document.getElementById('edit-user-form').addEventListener('submit', () => this.handleUpdate());
  },

  async handleUpdate() {
    const data = {
      User_ID: document.getElementById('edit-user-id').value,
      Name: document.getElementById('edit-user-name').value,
      Email: document.getElementById('edit-user-email').value,
      Role: document.getElementById('edit-user-role').value
    };
    
    const pass = document.getElementById('edit-user-password').value;
    if (pass) data.Password = pass;

    const result = await API.call('updateUser', data);
    if (result.success) {
      App.toast('User updated successfully.', 'success');
      App.closeModal();
      this.load();
    }
  },

  handleDelete(userId) {
    App.confirm('Delete User', 'Are you sure you want to delete this account? This action cannot be undone.', async () => {
      const result = await API.call('deleteUser', { User_ID: userId });
      if (result.success) {
        App.toast('User deleted.', 'success');
        this.load();
      }
    }, 'danger');
  }
};
