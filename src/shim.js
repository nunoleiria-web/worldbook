/* ===== shim.js: armazenamento local (IndexedDB) para usar a página fora do Claude ===== */
(() => {
  const DB_NAME = 'worldbook', DOCS = 'docs', BLOBS = 'blobs';
  const urls = new Map();
  window.__worldbook = { blobUrl: id => urls.get(id) || '' };
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(DOCS); r.result.createObjectStore(BLOBS); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = (db, store, mode, fn) => new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store), out = fn(s);
    t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clone = o => JSON.parse(JSON.stringify(o));
  const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) a[k] = merge(a[k] && typeof a[k] === 'object' ? a[k] : {}, b[k]); else a[k] = b[k]; } return a; };

  let ready = null;
  function init() {
    if (ready) return ready;
    ready = (async () => {
      const db = await open();
      const docs = new Map();
      await new Promise((res, rej) => {
        const c = db.transaction(DOCS, 'readonly').objectStore(DOCS).openCursor();
        c.onsuccess = () => { const cur = c.result; if (cur) { docs.set(cur.key, cur.value); cur.continue(); } else res(); };
        c.onerror = () => rej(c.error);
      });
      await new Promise((res, rej) => {
        const c = db.transaction(BLOBS, 'readonly').objectStore(BLOBS).openCursor();
        c.onsuccess = () => { const cur = c.result; if (cur) { urls.set(cur.key, URL.createObjectURL(cur.value)); cur.continue(); } else res(); };
        c.onerror = () => rej(c.error);
      });
      return { db, docs, subs: new Set() };
    })();
    return ready;
  }
  const snapshot = (st, col) => ({ docs: [...st.docs].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ id: k.slice(col.length + 1), data: () => clone(v) })) });
  const notify = st => st.subs.forEach(s => s());

  async function makeDb() {
    const st = await init();
    return {
      collection: col => ({
        onSnapshot(cb) {
          const fire = () => cb(snapshot(st, col));
          st.subs.add(fire); setTimeout(fire, 0);
          return () => st.subs.delete(fire);
        },
        async add(data) {
          const id = rid(), key = col + '/' + id;
          await tx(st.db, DOCS, 'readwrite', s => s.put(clone(data), key));
          st.docs.set(key, clone(data)); notify(st); return { id };
        }
      }),
      doc: path => ({
        async update(data) {
          const cur = st.docs.get(path);
          if (!cur) throw new Error('not_found');
          const next = merge(clone(cur), clone(data));
          await tx(st.db, DOCS, 'readwrite', s => s.put(next, path));
          st.docs.set(path, next); notify(st);
        },
        async delete() {
          await tx(st.db, DOCS, 'readwrite', s => s.delete(path));
          st.docs.delete(path); notify(st);
        }
      })
    };
  }
  async function makeAssets() {
    const st = await init();
    return {
      async upload(blob) {
        if (blob.size > 20 * 1048576) throw { code: 'too_large' };
        const id = rid();
        try { await tx(st.db, BLOBS, 'readwrite', s => s.put(blob, id)); }
        catch (e) { throw { code: 'quota_or_state' }; }
        const url = URL.createObjectURL(blob); urls.set(id, url);
        return { id, url, sizeBytes: blob.size, contentType: blob.type };
      },
      async delete(id) {
        await tx(st.db, BLOBS, 'readwrite', s => s.delete(id));
        const u = urls.get(id); if (u) URL.revokeObjectURL(u); urls.delete(id);
      }
    };
  }
  const downloads = {
    async save({ filename, data }) {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  };
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const user = { canEdit: () => true };
  window.claude = { use: async name => {
    try { if (name === 'db') return await makeDb(); if (name === 'assets') return await makeAssets(); if (name === 'user') return user; if (name === 'downloads') return downloads; } catch (e) { return null; }
    return null;
  } };
})();
