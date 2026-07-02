const DRAFTS_KEY = 'spendwise-drafts';

const RecordTabs = {
  drafts: [],
  activeId: null,

  createEmpty(name) {
    const count = this.drafts.length + 1;
    return {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name || `Record ${count}`,
      type: 'expense',
      source: '',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      items: [],
      notes: '',
      receiptImage: null,
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.drafts = data.drafts || [];
        this.activeId = data.activeId || null;
      }
    } catch {
      this.drafts = [];
      this.activeId = null;
    }

    if (this.drafts.length === 0) {
      const first = this.createEmpty('Record 1');
      this.drafts.push(first);
      this.activeId = first.id;
    }

    for (const draft of this.drafts) {
      if (draft.type === 'income') draft.type = 'amount';
    }

    if (!this.drafts.find((d) => d.id === this.activeId)) {
      this.activeId = this.drafts[0].id;
    }
  },

  save() {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify({
      drafts: this.drafts,
      activeId: this.activeId,
    }));
  },

  getActive() {
    return this.drafts.find((d) => d.id === this.activeId) || this.drafts[0];
  },

  setActive(id) {
    this.activeId = id;
    this.save();
  },

  addTab(name) {
    const draft = this.createEmpty(name);
    this.drafts.push(draft);
    this.activeId = draft.id;
    this.save();
    return draft;
  },

  removeTab(id) {
    if (this.drafts.length <= 1) return false;
    const idx = this.drafts.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    this.drafts.splice(idx, 1);
    if (this.activeId === id) {
      this.activeId = this.drafts[Math.max(0, idx - 1)].id;
    }
    this.save();
    return true;
  },

  renameTab(id, name) {
    const draft = this.drafts.find((d) => d.id === id);
    if (!draft || !name.trim()) return;
    draft.name = name.trim();
    this.save();
  },

  updateActive(fields) {
    const draft = this.getActive();
    if (!draft) return;
    Object.assign(draft, fields);
    this.save();
  },

  clearActiveAfterSave() {
    const draft = this.getActive();
    if (!draft) return;

    if (this.drafts.length > 1) {
      this.removeTab(draft.id);
    } else {
      const fresh = this.createEmpty(draft.name);
      const idx = this.drafts.findIndex((d) => d.id === draft.id);
      this.drafts[idx] = fresh;
      this.activeId = fresh.id;
      this.save();
    }
  },

  populateFromReceipt(data) {
    const name = data.merchant || data.source || `Receipt ${this.drafts.length + 1}`;
    const draft = this.addTab(name);
    draft.type = 'expense';
    draft.source = data.merchant || data.source || '';
    draft.date = data.date || draft.date;
    draft.amount = data.total ? String(data.total) : '';
    draft.items = data.items || [];
    draft.receiptImage = data.receiptImage || null;
    draft.notes = data.notes || '';
    this.save();
    return draft;
  },
};