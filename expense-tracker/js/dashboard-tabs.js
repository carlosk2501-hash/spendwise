const DASHBOARDS_KEY = 'spendwise-dashboards';

const DashboardTabs = {
  tabs: [],
  activeId: null,

  monthRange(year, month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate: start, endDate: end };
  },

  resolveRange(tab) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    switch (tab.preset) {
      case 'all':
        return { startDate: null, endDate: null };
      case 'thisMonth':
        return this.monthRange(y, m);
      case 'lastMonth': {
        const d = new Date(y, now.getMonth() - 1, 1);
        return this.monthRange(d.getFullYear(), d.getMonth() + 1);
      }
      case 'thisYear':
        return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
      case 'custom':
        return { startDate: tab.startDate || null, endDate: tab.endDate || null };
      default:
        return { startDate: tab.startDate, endDate: tab.endDate };
    }
  },

  formatRangeLabel(tab) {
    const { startDate, endDate } = this.resolveRange(tab);
    if (!startDate && !endDate) return 'All time';
    if (startDate && endDate) {
      const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${fmt(startDate)} – ${fmt(endDate)}`;
    }
    return '';
  },

  createEmpty(name, preset = 'thisMonth', startDate = null, endDate = null) {
    const count = this.tabs.length + 1;
    return {
      id: `dash-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name || `Period ${count}`,
      preset,
      startDate,
      endDate,
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(DASHBOARDS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.tabs = data.tabs || [];
        this.activeId = data.activeId || null;
      }
    } catch {
      this.tabs = [];
      this.activeId = null;
    }

    if (this.tabs.length === 0) {
      this.tabs = [
        this.createEmpty('All Time', 'all'),
        this.createEmpty('This Month', 'thisMonth'),
      ];
      this.activeId = this.tabs[1].id;
    }

    if (!this.tabs.find((t) => t.id === this.activeId)) {
      this.activeId = this.tabs[0].id;
    }
  },

  save() {
    localStorage.setItem(DASHBOARDS_KEY, JSON.stringify({
      tabs: this.tabs,
      activeId: this.activeId,
    }));
  },

  getActive() {
    return this.tabs.find((t) => t.id === this.activeId) || this.tabs[0];
  },

  setActive(id) {
    this.activeId = id;
    this.save();
  },

  addTab(tab) {
    this.tabs.push(tab);
    this.activeId = tab.id;
    this.save();
    return tab;
  },

  removeTab(id) {
    if (this.tabs.length <= 1) return false;
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.tabs.splice(idx, 1);
    if (this.activeId === id) {
      this.activeId = this.tabs[Math.max(0, idx - 1)].id;
    }
    this.save();
    return true;
  },

  renameTab(id, name) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab || !name.trim()) return;
    tab.name = name.trim();
    this.save();
  },

  updateTab(id, fields) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    Object.assign(tab, fields);
    this.save();
  },
};