/* Tonora — IndexedDB store for user projects.
   Falls back to localStorage when IDB is unavailable (private mode, tests). */
'use strict';

const TonoraStore = {
  _db: null,
  _idb: (typeof indexedDB !== 'undefined') ? indexedDB : null,

  open() {
    if (this._db) return Promise.resolve(this._db);
    if (!this._idb) return Promise.resolve(null);
    return new Promise((res) => {
      try {
        const req = this._idb.open('tonora', 1);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'name' });
          }
        };
        req.onsuccess = () => { this._db = req.result; res(this._db); };
        req.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  },

  /* list all project names */
  async list() {
    const db = await this.open();
    if (!db) {
      try { return Object.keys(JSON.parse(localStorage.getItem('tonora-projects')) || {}); }
      catch (e) { return []; }
    }
    return new Promise((res) => {
      const out = [];
      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const cur = store.openCursor();
      cur.onsuccess = e => {
        const c = e.target.result;
        if (c) { out.push(c.key); c.continue(); } else res(out);
      };
      cur.onerror = () => res(out);
    });
  },

  async get(name) {
    const db = await this.open();
    if (!db) {
      try { const all = JSON.parse(localStorage.getItem('tonora-projects')) || {}; return all[name] || null; }
      catch (e) { return null; }
    }
    return new Promise((res) => {
      const tx = db.transaction('projects', 'readonly');
      const req = tx.objectStore('projects').get(name);
      req.onsuccess = () => res(req.result ? req.result.data : null);
      req.onerror = () => res(null);
    });
  },

  async all() {
    const db = await this.open();
    if (!db) {
      try { return JSON.parse(localStorage.getItem('tonora-projects')) || {}; }
      catch (e) { return {}; }
    }
    const names = await this.list();
    const out = {};
    for (const n of names) out[n] = await this.get(n);
    return out;
  },

  async set(name, data) {
    const db = await this.open();
    if (!db) {
      const all = await this.all();
      all[name] = data;
      localStorage.setItem('tonora-projects', JSON.stringify(all));
      return;
    }
    return new Promise((res) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put({ name, data });
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  },

  async del(name) {
    const db = await this.open();
    if (!db) {
      const all = await this.all();
      delete all[name];
      localStorage.setItem('tonora-projects', JSON.stringify(all));
      return;
    }
    return new Promise((res) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').delete(name);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  },

  /* one-shot migration: lift existing localStorage projects into IDB */
  async migrate() {
    const db = await this.open();
    if (!db) return;
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem('tonora-projects')) || null; } catch (e) {}
    if (!legacy || !Object.keys(legacy).length) return;
    const existing = await this.list();
    for (const name of Object.keys(legacy)) {
      if (!existing.includes(name)) await this.set(name, legacy[name]);
    }
  }
};

if (typeof window !== 'undefined') window.TonoraStore = TonoraStore;
if (typeof module !== 'undefined' && module.exports) module.exports = TonoraStore;
