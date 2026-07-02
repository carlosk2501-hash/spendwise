const DB_NAME = 'SpendWiseDB';
const DB_VERSION = 1;
const STORE = 'transactions';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const Storage = {
  async getAll() {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const items = request.result.sort((a, b) => new Date(b.date) - new Date(a.date));
        resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async get(id) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async add(transaction) {
    const database = await openDB();
    const record = {
      ...transaction,
      id: transaction.id || generateId(),
      createdAt: transaction.createdAt || new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, 'readwrite');
      const request = tx.objectStore(STORE).add(record);
      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error);
    });
  },

  async update(transaction) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, 'readwrite');
      const request = tx.objectStore(STORE).put(transaction);
      request.onsuccess = () => resolve(transaction);
      request.onerror = () => reject(request.error);
    });
  },

  async delete(id) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, 'readwrite');
      const request = tx.objectStore(STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getSummary() {
    const all = await this.getAll();
    let totalAmount = 0;
    let totalExpenses = 0;
    const categories = {};

    for (const t of all) {
      if (t.type === 'amount' || t.type === 'income') {
        totalAmount += t.total ?? t.amount ?? 0;
      } else {
        const amount = t.total ?? t.amount ?? 0;
        totalExpenses += amount;
        if (t.items) {
          for (const item of t.items) {
            const cat = item.category || 'other';
            categories[cat] = (categories[cat] || 0) + (item.price || 0);
          }
        } else {
          categories['other'] = (categories['other'] || 0) + amount;
        }
      }
    }

    return {
      totalAmount,
      totalExpenses,
      balance: totalAmount - totalExpenses,
      categories,
      count: all.length,
    };
  },
};