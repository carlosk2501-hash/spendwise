const App = {
  currentImage: null,
  selectedTransactionId: null,
  _syncingForm: false,

  async init() {
    RecordTabs.load();
    this.setupTabs();
    this.setupCamera();
    this.setupFileUpload();
    this.setupReceiptForm();
    this.setupRecordTabs();
    this.setupHistoryFilters();
    this.setupModals();
    this.setupSettings();
    await GrokVision.checkStatus();
    this.updateGrokStatusUI();
    if (!GrokVision.isConfigured() && !GrokVision._status?.offline) {
      document.getElementById('settingsModal').hidden = false;
    }
    await this.refresh();
    this.renderRecordTabs();
    this.loadRecordForm();
  },

  setupTabs() {
    document.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
  },

  switchTab(tabId) {
    document.querySelectorAll('.nav-tab').forEach((t) => {
      const active = t.dataset.tab === tabId;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active);
    });

    document.querySelectorAll('.tab-panel').forEach((p) => {
      const active = p.id === `tab-${tabId}`;
      p.classList.toggle('active', active);
      p.hidden = !active;
    });

    if (tabId === 'history') this.renderHistory();
    if (tabId === 'records') {
      this.renderRecordTabs();
      this.loadRecordForm();
      this.renderRecentRecords();
    }
  },

  setupRecordTabs() {
    document.getElementById('btnNewRecordTab').addEventListener('click', () => {
      const name = prompt('Name this record tab:', `Record ${RecordTabs.drafts.length + 1}`);
      if (name === null) return;
      this.syncFormToDraft();
      RecordTabs.addTab(name.trim() || `Record ${RecordTabs.drafts.length}`);
      this.renderRecordTabs();
      this.loadRecordForm();
    });

    document.getElementById('btnCloseRecordTab').addEventListener('click', () => {
      if (RecordTabs.drafts.length <= 1) {
        this.toast('Keep at least one record tab open.', 'error');
        return;
      }
      if (!confirm('Close this tab? Unsaved changes will be lost.')) return;
      RecordTabs.removeTab(RecordTabs.activeId);
      this.renderRecordTabs();
      this.loadRecordForm();
    });

    document.getElementById('btnAddRecordItem').addEventListener('click', () => {
      this.addRecordItemRow();
      this.syncFormToDraft();
    });

    document.getElementById('btnRemoveReceipt').addEventListener('click', () => {
      const draft = RecordTabs.getActive();
      draft.receiptImage = null;
      RecordTabs.save();
      this.loadRecordForm();
    });

    document.querySelectorAll('.type-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.type-toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const draft = RecordTabs.getActive();
        draft.type = btn.dataset.type;
        RecordTabs.save();
      });
    });

    const form = document.getElementById('recordForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveRecord();
    });

    ['recordSource', 'recordDate', 'recordAmount', 'recordNotes'].forEach((id) => {
      document.getElementById(id).addEventListener('input', () => {
        if (!this._syncingForm) this.syncFormToDraft();
      });
      document.getElementById(id).addEventListener('change', () => {
        if (!this._syncingForm) this.syncFormToDraft();
      });
    });
  },

  renderRecordTabs() {
    const container = document.getElementById('recordTabsList');
    container.innerHTML = RecordTabs.drafts.map((draft) => {
      const active = draft.id === RecordTabs.activeId;
      const typeIcon = this.isAmountType(draft.type) ? '💵' : '🧾';
      const tabType = this.isAmountType(draft.type) ? 'amount' : 'expense';
      return `
        <button type="button"
          class="record-tab ${active ? 'active' : ''} ${tabType}"
          data-id="${draft.id}"
          role="tab"
          aria-selected="${active}"
          title="Double-click to rename">
          <span class="record-tab-icon">${typeIcon}</span>
          <span class="record-tab-name">${this.escape(draft.name)}</span>
          ${RecordTabs.drafts.length > 1 ? `<span class="record-tab-close" data-close-id="${draft.id}" title="Close tab">×</span>` : ''}
        </button>
      `;
    }).join('');

    container.querySelectorAll('.record-tab').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('record-tab-close')) return;
        this.syncFormToDraft();
        RecordTabs.setActive(el.dataset.id);
        this.renderRecordTabs();
        this.loadRecordForm();
      });

      el.addEventListener('dblclick', (e) => {
        if (e.target.classList.contains('record-tab-close')) return;
        const draft = RecordTabs.drafts.find((d) => d.id === el.dataset.id);
        if (!draft) return;
        const newName = prompt('Rename tab:', draft.name);
        if (newName === null || !newName.trim()) return;
        RecordTabs.renameTab(draft.id, newName.trim());
        this.renderRecordTabs();
      });
    });

    container.querySelectorAll('.record-tab-close').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (RecordTabs.drafts.length <= 1) {
          this.toast('Keep at least one record tab open.', 'error');
          return;
        }
        if (!confirm('Close this tab?')) return;
        this.syncFormToDraft();
        RecordTabs.removeTab(el.dataset.closeId);
        this.renderRecordTabs();
        this.loadRecordForm();
      });
    });
  },

  loadRecordForm() {
    const draft = RecordTabs.getActive();
    if (!draft) return;

    this._syncingForm = true;

    document.querySelectorAll('.type-toggle-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === draft.type);
    });

    document.getElementById('recordSource').value = draft.source || '';
    document.getElementById('recordDate').value = draft.date || new Date().toISOString().split('T')[0];
    document.getElementById('recordAmount').value = draft.amount ?? '';
    document.getElementById('recordNotes').value = draft.notes || '';

    const preview = document.getElementById('recordReceiptPreview');
    if (draft.receiptImage) {
      preview.hidden = false;
      document.getElementById('recordReceiptImg').src = draft.receiptImage;
    } else {
      preview.hidden = true;
    }

    const list = document.getElementById('recordItemsList');
    list.innerHTML = '';
    if (draft.items && draft.items.length > 0) {
      draft.items.forEach((item) => this.addRecordItemRow(item));
    }

    this._syncingForm = false;
  },

  syncFormToDraft() {
    const draft = RecordTabs.getActive();
    if (!draft) return;

    const activeType = document.querySelector('.type-toggle-btn.active');
    draft.type = activeType ? activeType.dataset.type : 'expense';
    draft.source = document.getElementById('recordSource').value.trim();
    draft.date = document.getElementById('recordDate').value;
    draft.amount = document.getElementById('recordAmount').value;
    draft.notes = document.getElementById('recordNotes').value.trim();
    draft.items = this.getRecordItemsFromForm();
    RecordTabs.save();
    this.renderRecordTabs();
  },

  addRecordItemRow(item = {}) {
    const list = document.getElementById('recordItemsList');
    const unitPrice = item.unitPrice ?? (item.qty > 1 ? item.price / item.qty : item.price);
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <input type="text" class="item-name" placeholder="Item name" value="${this.escape(item.name || '')}">
      <input type="number" class="item-qty" min="1" value="${item.qty || 1}" title="Quantity">
      <input type="number" class="item-price" step="0.01" min="0" placeholder="0.00" value="${unitPrice ? Number(unitPrice).toFixed(2) : ''}">
      <button type="button" class="btn-remove-item" title="Remove">✕</button>
    `;

    const categorySelect = document.createElement('select');
    categorySelect.className = 'item-category';
    categorySelect.style.gridColumn = '1 / -1';
    categorySelect.style.marginTop = '-0.25rem';
    categorySelect.innerHTML = ReceiptParser.categoryOptionsHtml(item.category || 'other');

    const onChange = () => { if (!this._syncingForm) this.syncFormToDraft(); };
    row.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', onChange);
    });
    categorySelect.addEventListener('change', onChange);

    row.querySelector('.btn-remove-item').addEventListener('click', () => {
      row.remove();
      categorySelect.remove();
      this.syncFormToDraft();
    });

    list.appendChild(row);
    list.appendChild(categorySelect);
  },

  getRecordItemsFromForm() {
    const list = document.getElementById('recordItemsList');
    const rows = list.querySelectorAll('.item-row');
    const items = [];

    rows.forEach((row, i) => {
      const name = row.querySelector('.item-name').value.trim();
      const qty = parseInt(row.querySelector('.item-qty').value, 10) || 1;
      const price = parseFloat(row.querySelector('.item-price').value) || 0;
      const categoryEl = list.querySelectorAll('.item-category')[i];
      const category = categoryEl ? categoryEl.value : 'other';

      if (name || price > 0) {
        items.push({ name: name || 'Item', qty, price: price * qty, category, unitPrice: price });
      }
    });

    return items;
  },

  async saveRecord() {
    this.syncFormToDraft();
    const draft = RecordTabs.getActive();
    if (!draft) return;

    const items = draft.items.filter((i) => i.price > 0);
    const amountInput = parseFloat(draft.amount);
    const itemsTotal = items.reduce((sum, i) => sum + i.price, 0);
    const total = amountInput > 0 ? amountInput : itemsTotal;

    if (!total || total <= 0) {
      this.toast('Enter an amount or add items with prices.', 'error');
      return;
    }

    if (!draft.date) {
      this.toast('Please set a date.', 'error');
      return;
    }

    const source = draft.source || draft.name || (this.isAmountType(draft.type) ? 'Amount' : 'Expense');
    const isAmount = this.isAmountType(draft.type);

    const transaction = {
      type: draft.type,
      recordName: draft.name,
      source,
      merchant: source,
      date: draft.date,
      total,
      amount: total,
      items: items.length > 0 ? items : [{ name: source, qty: 1, price: total, category: isAmount ? 'amount' : 'other' }],
      notes: draft.notes,
      receiptImage: draft.receiptImage,
      category: isAmount ? 'amount' : undefined,
    };

    try {
      await Storage.add(transaction);
      this.toast(`${isAmount ? 'Amount' : 'Expense'} saved!`, 'success');
      RecordTabs.clearActiveAfterSave();
      this.renderRecordTabs();
      this.loadRecordForm();
      await this.refresh();
      this.renderRecentRecords();
    } catch (err) {
      console.error(err);
      this.toast('Failed to save record.', 'error');
    }
  },

  async renderRecentRecords() {
    const all = await Storage.getAll();
    const container = document.getElementById('recentRecordsList');

    if (all.length === 0) {
      container.innerHTML = '<p class="empty-state">No records saved yet.</p>';
      return;
    }

    container.innerHTML = all.slice(0, 8).map((t) => this.activityItemHtml(t)).join('');
    this.bindActivityClicks(container);
  },

  setupCamera() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    const preview = document.getElementById('cameraPreview');
    const previewImg = document.getElementById('previewImage');

    document.getElementById('btnOpenCamera').addEventListener('click', async () => {
      const hasCamera = await Camera.hasCamera();
      if (!hasCamera) {
        this.toast('No camera found. Use upload instead.', 'error');
        return;
      }

      modal.hidden = false;
      video.hidden = false;
      preview.hidden = true;
      document.getElementById('btnCapture').hidden = false;
      document.getElementById('btnRetake').hidden = true;
      document.getElementById('btnUsePhoto').hidden = true;

      try {
        await Camera.start();
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((d) => d.kind === 'videoinput');
        document.getElementById('btnSwitchCamera').hidden = cameras.length < 2;
      } catch {
        this.toast('Camera access denied. Please allow camera permission.', 'error');
        modal.hidden = true;
      }
    });

    document.getElementById('btnSwitchCamera').addEventListener('click', () => Camera.switchCamera());

    document.getElementById('btnCapture').addEventListener('click', () => {
      const dataUrl = Camera.capture();
      previewImg.src = dataUrl;
      this.currentImage = dataUrl;

      video.hidden = true;
      preview.hidden = false;
      document.getElementById('btnCapture').hidden = true;
      document.getElementById('btnRetake').hidden = false;
      document.getElementById('btnUsePhoto').hidden = false;
    });

    document.getElementById('btnRetake').addEventListener('click', () => {
      video.hidden = false;
      preview.hidden = true;
      document.getElementById('btnCapture').hidden = false;
      document.getElementById('btnRetake').hidden = true;
      document.getElementById('btnUsePhoto').hidden = true;
    });

    document.getElementById('btnUsePhoto').addEventListener('click', () => {
      this.closeModal('cameraModal');
      Camera.stop();
      this.processReceiptImage(this.currentImage);
    });

    modal.querySelectorAll('[data-close="cameraModal"]').forEach((el) => {
      el.addEventListener('click', () => {
        this.closeModal('cameraModal');
        Camera.stop();
      });
    });
  },

  setupFileUpload() {
    document.getElementById('fileUpload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        this.toast('Please select an image file.', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        this.processReceiptImage(ev.target.result);
        e.target.value = '';
      };
      reader.readAsDataURL(file);
    });
  },

  async processReceiptImage(dataUrl) {
    this.currentImage = dataUrl;

    const review = document.getElementById('receiptReview');
    review.hidden = false;

    document.getElementById('receiptThumb').src = dataUrl;
    document.getElementById('merchantName').value = '';
    document.getElementById('receiptTotal').value = '';
    document.getElementById('receiptNotes').value = '';
    document.getElementById('receiptDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('itemsList').innerHTML = '';

    const ocrStatus = document.getElementById('ocrStatus');
    ocrStatus.hidden = false;
    ocrStatus.querySelector('span').textContent = 'Reading receipt…';

    this._scanParsed = null;

    try {
      const parsed = await ReceiptParser.scanImage(dataUrl);
      this._scanParsed = { ...parsed, receiptImage: dataUrl };

      if (parsed.merchant) document.getElementById('merchantName').value = parsed.merchant;
      if (parsed.date) document.getElementById('receiptDate').value = parsed.date;
      if (parsed.total) document.getElementById('receiptTotal').value = parsed.total.toFixed(2);
      if (parsed.notes) document.getElementById('receiptNotes').value = parsed.notes;

      if (parsed.items.length > 0) {
        parsed.items.forEach((item) => this.addScanItemRow(item));
      } else {
        this.addScanItemRow();
      }

      const via = parsed.source === 'grok' ? 'Grok AI' : 'basic OCR';
      this.toast(`${via}: found ${parsed.items.length} item(s)`);
    } catch (err) {
      console.error('Receipt scan failed:', err);
      if (err.message === 'GROK_NOT_CONFIGURED') {
        this.toast('Add your Grok API key in Settings for smart receipt reading.', 'error');
        document.getElementById('settingsModal').hidden = false;
        this.updateGrokStatusUI();
      } else {
        this._scanParsed = { merchant: '', date: document.getElementById('receiptDate').value, total: null, items: [], receiptImage: dataUrl };
        this.addScanItemRow();
        this.toast(err.message || 'Could not read receipt. Enter items manually.', 'error');
      }
    } finally {
      ocrStatus.hidden = true;
    }

    review.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  setupReceiptForm() {
    document.getElementById('btnAddItem').addEventListener('click', () => this.addScanItemRow());
    document.getElementById('btnCancelReceipt').addEventListener('click', () => this.resetReceiptForm());
    document.getElementById('btnSaveToRecordTab').addEventListener('click', () => this.sendScanToRecordTab());
  },

  addScanItemRow(item = {}) {
    const list = document.getElementById('itemsList');
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <input type="text" class="item-name" placeholder="Item name" value="${this.escape(item.name || '')}">
      <input type="number" class="item-qty" min="1" value="${item.qty || 1}" title="Quantity">
      <input type="number" class="item-price" step="0.01" min="0" placeholder="0.00" value="${item.price ? (item.unitPrice ?? item.price).toFixed(2) : ''}">
      <button type="button" class="btn-remove-item" title="Remove">✕</button>
    `;

    const categorySelect = document.createElement('select');
    categorySelect.className = 'item-category';
    categorySelect.style.gridColumn = '1 / -1';
    categorySelect.style.marginTop = '-0.25rem';
    categorySelect.innerHTML = ReceiptParser.categoryOptionsHtml(item.category || 'other');

    row.querySelector('.btn-remove-item').addEventListener('click', () => {
      if (list.querySelectorAll('.item-row').length > 1) {
        row.remove();
        categorySelect.remove();
      } else {
        row.querySelector('.item-name').value = '';
        row.querySelector('.item-price').value = '';
        row.querySelector('.item-qty').value = '1';
      }
    });

    list.appendChild(row);
    list.appendChild(categorySelect);
  },

  getScanItemsFromForm() {
    const list = document.getElementById('itemsList');
    const rows = list.querySelectorAll('.item-row');
    const items = [];

    rows.forEach((row, i) => {
      const name = row.querySelector('.item-name').value.trim();
      const qty = parseInt(row.querySelector('.item-qty').value, 10) || 1;
      const price = parseFloat(row.querySelector('.item-price').value) || 0;
      const categoryEl = list.querySelectorAll('.item-category')[i];
      const category = categoryEl ? categoryEl.value : 'other';

      if (name && price > 0) {
        items.push({ name, qty, price: price * qty, category, unitPrice: price });
      }
    });

    return items;
  },

  sendScanToRecordTab() {
    const merchant = document.getElementById('merchantName').value.trim();
    const date = document.getElementById('receiptDate').value;
    const totalInput = parseFloat(document.getElementById('receiptTotal').value);
    const notes = document.getElementById('receiptNotes').value.trim();
    const items = this.getScanItemsFromForm();

    const itemsTotal = items.reduce((sum, i) => sum + i.price, 0);
    const total = totalInput > 0 ? totalInput : itemsTotal;

    this.syncFormToDraft();

    RecordTabs.populateFromReceipt({
      merchant: merchant || 'Scanned Receipt',
      source: merchant,
      date,
      total: total || null,
      items,
      notes,
      receiptImage: this.currentImage,
    });

    this.resetReceiptForm();
    this.renderRecordTabs();
    this.switchTab('records');
    this.toast('Receipt loaded into a new record tab', 'success');
  },

  resetReceiptForm() {
    this.currentImage = null;
    this._scanParsed = null;
    document.getElementById('receiptReview').hidden = true;
    document.getElementById('itemsList').innerHTML = '';
    document.getElementById('merchantName').value = '';
    document.getElementById('receiptTotal').value = '';
    document.getElementById('receiptNotes').value = '';
  },

  setupHistoryFilters() {
    document.getElementById('filterType').addEventListener('change', () => this.renderHistory());
    document.getElementById('searchTransactions').addEventListener('input', () => this.renderHistory());
  },

  setupModals() {
    document.querySelectorAll('[data-close]').forEach((el) => {
      if (el.dataset.close !== 'cameraModal') {
        el.addEventListener('click', () => this.closeModal(el.dataset.close));
      }
    });

    document.getElementById('btnDeleteTransaction').addEventListener('click', () => this.deleteTransaction());
  },

  setupSettings() {
    document.getElementById('btnOpenSettings').addEventListener('click', async () => {
      await GrokVision.checkStatus();
      this.updateGrokStatusUI();
      document.getElementById('settingsModal').hidden = false;
    });

    document.getElementById('btnSaveGrokKey').addEventListener('click', async () => {
      const key = document.getElementById('grokApiKey').value.trim();
      if (!key) {
        this.toast('Please enter your xAI API key.', 'error');
        return;
      }
      try {
        await GrokVision.saveApiKey(key);
        document.getElementById('grokApiKey').value = '';
        this.updateGrokStatusUI();
        this.closeModal('settingsModal');
        this.toast('Grok AI connected!', 'success');
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });
  },

  updateGrokStatusUI() {
    const statusEl = document.getElementById('grokStatus');
    const textEl = document.getElementById('grokStatusText');
    if (!statusEl || !textEl) return;

    statusEl.classList.remove('connected', 'disconnected', 'offline');

    if (GrokVision._status?.offline) {
      statusEl.classList.add('offline');
      textEl.textContent = 'Server offline — run start.bat to enable Grok';
    } else if (GrokVision.isConfigured()) {
      statusEl.classList.add('connected');
      textEl.textContent = `Grok AI connected (${GrokVision._status?.model || 'grok-4'})`;
    } else {
      statusEl.classList.add('disconnected');
      textEl.textContent = 'Grok AI not configured — add your API key below';
    }
  },

  closeModal(id) {
    document.getElementById(id).hidden = true;
  },

  async refresh() {
    const summary = await Storage.getSummary();
    const all = await Storage.getAll();

    this.renderBalance(summary);
    this.renderRecentActivity(all.slice(0, 5));
    this.renderCategoryChart(summary.categories);
  },

  renderBalance(summary) {
    const balanceEl = document.getElementById('balanceAmount');
    balanceEl.textContent = this.formatMoney(summary.balance);
    balanceEl.classList.toggle('negative', summary.balance < 0);

    document.getElementById('totalAmount').textContent = this.formatMoney(summary.totalAmount);
    document.getElementById('totalExpenses').textContent = this.formatMoney(summary.totalExpenses);
  },

  renderCategoryChart(categories) {
    const container = document.getElementById('categoryChart');
    const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
      container.innerHTML = '<p class="empty-state">No expenses yet. Add a record to get started.</p>';
      return;
    }

    const max = entries[0][1];
    container.innerHTML = entries.map(([cat, amount]) => {
      const pct = Math.round((amount / max) * 100);
      const label = ReceiptParser.categories.find((c) => c.value === cat)?.label || cat;
      return `
        <div class="category-bar-row">
          <div class="category-bar-header">
            <span class="category-bar-name">${label}</span>
            <span class="category-bar-amount">${this.formatMoney(amount)}</span>
          </div>
          <div class="category-bar-track">
            <div class="category-bar-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderRecentActivity(transactions) {
    const container = document.getElementById('recentActivity');
    if (transactions.length === 0) {
      container.innerHTML = '<p class="empty-state">No transactions yet.</p>';
      return;
    }
    container.innerHTML = transactions.map((t) => this.activityItemHtml(t)).join('');
    this.bindActivityClicks(container);
  },

  async renderHistory() {
    const all = await Storage.getAll();
    const filterType = document.getElementById('filterType').value;
    const search = document.getElementById('searchTransactions').value.toLowerCase();

    let filtered = all;
    if (filterType === 'amount') {
      filtered = filtered.filter((t) => this.isAmountType(t.type));
    } else if (filterType !== 'all') {
      filtered = filtered.filter((t) => t.type === filterType);
    }
    if (search) {
      filtered = filtered.filter((t) => {
        const name = (t.merchant || t.source || t.recordName || '').toLowerCase();
        const notes = (t.notes || '').toLowerCase();
        return name.includes(search) || notes.includes(search);
      });
    }

    const container = document.getElementById('historyList');
    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty-state">No matching transactions.</p>';
      return;
    }

    container.innerHTML = filtered.map((t) => this.activityItemHtml(t)).join('');
    this.bindActivityClicks(container);
  },

  activityItemHtml(t) {
    const isAmount = this.isAmountType(t.type);
    const typeClass = isAmount ? 'amount' : 'expense';
    const title = t.recordName || t.merchant || t.source || 'Transaction';
    const subtitle = t.recordName && (t.merchant || t.source) && t.recordName !== (t.merchant || t.source)
      ? (t.merchant || t.source)
      : null;
    const amount = t.total ?? t.amount ?? 0;
    const itemCount = t.items?.length || 0;
    const meta = subtitle
      ? `${this.formatDate(t.date)} · ${subtitle}`
      : (isAmount
        ? this.formatDate(t.date)
        : `${this.formatDate(t.date)} · ${itemCount} item${itemCount !== 1 ? 's' : ''}`);

    return `
      <div class="activity-item" data-id="${t.id}">
        <div class="activity-icon ${typeClass}">${isAmount ? '💵' : '🧾'}</div>
        <div class="activity-info">
          <div class="activity-title">${this.escape(title)}</div>
          <div class="activity-meta">${this.escape(meta)}</div>
        </div>
        <div class="activity-amount ${typeClass}">${isAmount ? '+' : '−'}${this.formatMoney(amount)}</div>
      </div>
    `;
  },

  bindActivityClicks(container) {
    container.querySelectorAll('.activity-item').forEach((el) => {
      el.addEventListener('click', () => this.showTransactionDetail(el.dataset.id));
    });
  },

  async showTransactionDetail(id) {
    const t = await Storage.get(id);
    if (!t) return;

    this.selectedTransactionId = id;
    const modal = document.getElementById('detailModal');
    const isAmount = this.isAmountType(t.type);

    document.getElementById('detailTitle').textContent = t.recordName || t.merchant || t.source || 'Transaction';

    let html = '';

    if (t.receiptImage) {
      html += `<img class="detail-receipt-img" src="${t.receiptImage}" alt="Receipt">`;
    }

    html += `
      <dl class="detail-meta">
        <dt>Type</dt><dd>${isAmount ? 'Amount' : 'Expense'}</dd>
        <dt>Date</dt><dd>${this.formatDate(t.date)}</dd>
        <dt>Amount</dt><dd>${this.formatMoney(t.total ?? t.amount)}</dd>
        ${t.source || t.merchant ? `<dt>Source</dt><dd>${this.escape(t.source || t.merchant)}</dd>` : ''}
        ${t.notes ? `<dt>Notes</dt><dd>${this.escape(t.notes)}</dd>` : ''}
      </dl>
    `;

    if (t.items && t.items.length > 0) {
      html += '<div class="detail-items"><strong>Items</strong>';
      for (const item of t.items) {
        const catLabel = ReceiptParser.categories.find((c) => c.value === item.category)?.label || item.category || '';
        html += `
          <div class="detail-item-row">
            <span class="detail-item-name">${this.escape(item.name)} ${item.qty > 1 ? `(×${item.qty})` : ''} ${catLabel && !isAmount ? `<small style="color:var(--text-muted)">${catLabel}</small>` : ''}</span>
            <span class="detail-item-price">${this.formatMoney(item.price)}</span>
          </div>
        `;
      }
      html += '</div>';
    }

    document.getElementById('detailBody').innerHTML = html;
    modal.hidden = false;
  },

  async deleteTransaction() {
    if (!this.selectedTransactionId) return;
    if (!confirm('Delete this transaction?')) return;

    try {
      await Storage.delete(this.selectedTransactionId);
      this.closeModal('detailModal');
      this.selectedTransactionId = null;
      this.toast('Transaction deleted', 'success');
      await this.refresh();
      this.renderHistory();
      this.renderRecentRecords();
    } catch {
      this.toast('Failed to delete.', 'error');
    }
  },

  isAmountType(type) {
    return type === 'amount' || type === 'income';
  },

  formatMoney(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  toast(message, type = '') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = `toast ${type}`;
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());