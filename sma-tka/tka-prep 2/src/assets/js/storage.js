/* storage.js - helper localStorage bernamespace, dipakai di semua halaman interaktif */
const TKAStorage = {
  _key(ns) { return "tka:" + ns; },
  get(ns, fallback) {
    try {
      const raw = window.localStorage.getItem(this._key(ns));
      return raw ? JSON.parse(raw) : (fallback !== undefined ? fallback : null);
    } catch (e) { return fallback !== undefined ? fallback : null; }
  },
  set(ns, value) {
    try { window.localStorage.setItem(this._key(ns), JSON.stringify(value)); }
    catch (e) { /* localStorage penuh/diblokir - abaikan */ }
  },
  pushHistory(ns, entry) {
    const list = this.get(ns, []);
    list.push(entry);
    this.set(ns, list);
    return list;
  }
};
