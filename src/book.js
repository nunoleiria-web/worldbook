/* ===== book.js: motor do livro (paginação automática, colagens, temas, HTML das páginas) ===== */

const BOOK_FORMATS = {
  land: { name: 'Horizontal', ar: 4 / 3, pt: [842, 631] },
  sq: { name: 'Quadrado', ar: 1, pt: [595, 595] },
  port: { name: 'Vertical', ar: 3 / 4, pt: [631, 842] }
};

/* Temas: cores, tipos de letra (ver FONT_FACES) e carácter da página. Medidas em cqw (1 = 1% da largura da página). */
const BOOK_THEMES = {
  revista: {
    name: 'Revista', paper: '#F3EFE6', ink: '#1B1917', mute: '#766F64', accent: '#B4472A', rule: '#CFC8BA',
    sea: '#E4DED0', land: '#FBF9F4', coast: '#B9B1A1', grat: '#D7D0C0',
    ft: '"Instrument Sans", system-ui, "Segoe UI", sans-serif', fd: '"Instrument Serif", "Iowan Old Style", Georgia, serif', fb: '"Instrument Sans", system-ui, "Segoe UI", sans-serif', fm: '"DM Mono", ui-monospace, Menlo, monospace',
    margin: 4.4, gap: 1.0, round: 0, cover: 'bleed', numStyle: 'italic', italicTitles: true,
    faces: ['InstrumentSerif-Regular', 'InstrumentSerif-Italic', 'InstrumentSans-Regular', 'InstrumentSans-Bold', 'DMMono-Regular']
  },
  classico: {
    name: 'Clássico', paper: '#FAF6EC', ink: '#2A2420', mute: '#7C7266', accent: '#2F5D4B', rule: '#D8CFBC',
    sea: '#E7E4D6', land: '#FFFDF7', coast: '#B7B09C', grat: '#DAD5C2',
    ft: '"Lora", "Iowan Old Style", Georgia, serif', fd: '"Lora", "Iowan Old Style", Georgia, serif', fb: '"Instrument Sans", system-ui, "Segoe UI", sans-serif', fm: '"DM Mono", ui-monospace, Menlo, monospace',
    margin: 6.2, gap: 1.5, round: 0.2, cover: 'frame', numStyle: 'normal', italicTitles: true,
    faces: ['Lora-Regular', 'Lora-Italic', 'Lora-Bold', 'InstrumentSans-Regular', 'InstrumentSans-Bold', 'DMMono-Regular']
  },
  galeria: {
    name: 'Galeria', paper: '#FFFFFF', ink: '#0E0E0E', mute: '#6F6F6F', accent: '#0E0E0E', rule: '#DADADA',
    sea: '#EFEFEF', land: '#FFFFFF', coast: '#BDBDBD', grat: '#E3E3E3',
    fd: '"Instrument Sans", system-ui, "Segoe UI", sans-serif', fb: '"Instrument Sans", system-ui, "Segoe UI", sans-serif', fm: '"DM Mono", ui-monospace, Menlo, monospace',
    margin: 7.5, gap: 1.8, round: 0, cover: 'split', numStyle: 'normal', italicTitles: false,
    faces: ['InstrumentSans-Regular', 'InstrumentSans-Bold', 'InstrumentSans-Italic', 'DMMono-Regular']
  },
  noite: {
    name: 'Noite', paper: '#0E0E10', ink: '#EEEBE4', mute: '#9A958B', accent: '#E6B04B', rule: '#2B2B2F',
    sea: '#16171A', land: '#26272C', coast: '#3D3E45', grat: '#1D1E22',
    fd: '"Gloock", "Iowan Old Style", Georgia, serif', fb: '"Instrument Sans", system-ui, "Segoe UI", sans-serif', fm: '"DM Mono", ui-monospace, Menlo, monospace',
    margin: 2.2, gap: 0.6, round: 0, cover: 'center', numStyle: 'normal', italicTitles: false, dark: true,
    faces: ['Gloock-Regular', 'InstrumentSans-Regular', 'InstrumentSans-Bold', 'DMMono-Regular']
  }
};
const BOOK_THEME_KEYS = Object.keys(BOOK_THEMES);

const bookTheme = b => BOOK_THEMES[b && b.theme] || BOOK_THEMES.revista;
const bookFmt = b => BOOK_FORMATS[b && b.fmt] || BOOK_FORMATS.land;
const bookH = b => 100 / bookFmt(b).ar;

/* ---------- datas em português ---------- */
const BK_WD = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const BK_MO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function bkDayLong(ymd) { const d = parseYmd(ymd); return d ? `${BK_WD[d.getUTCDay()]}, ${d.getUTCDate()} de ${BK_MO[d.getUTCMonth()]}` : ''; }
function bkDayShort(ymd) { const d = parseYmd(ymd); return d ? `${d.getUTCDate()} ${BK_MO[d.getUTCMonth()].slice(0, 3)}` : ''; }
function bkRange(t) {
  const a = parseYmd(t.start), b = parseYmd(t.end);
  if (!a) return '';
  const f = d => `${d.getUTCDate()} ${BK_MO[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!b || t.end === t.start) return f(a);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${b.getUTCDate()} ${BK_MO[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  if (a.getUTCFullYear() === b.getUTCFullYear()) return `${a.getUTCDate()} ${BK_MO[a.getUTCMonth()].slice(0, 3)} – ${b.getUTCDate()} ${BK_MO[b.getUTCMonth()].slice(0, 3)} ${a.getUTCFullYear()}`;
  return `${f(a)} – ${f(b)}`;
}
const bkNum = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* ---------- colagens sem cortes: todas as árvores de cortes em ordem ---------- */
const _treeMemo = new Map();
function bkTrees(n) {
  if (_treeMemo.has(n)) return _treeMemo.get(n);
  const memo = new Map();
  const rec = (i, j) => {
    const key = i * 16 + j;
    if (memo.has(key)) return memo.get(key);
    let out;
    if (i === j) out = [{ leaf: i }];
    else {
      out = [];
      for (let k = i; k < j; k++) for (const a of rec(i, k)) for (const b of rec(k + 1, j)) { out.push({ dir: 'H', a, b }); out.push({ dir: 'V', a, b }); }
    }
    memo.set(key, out); return out;
  };
  const all = rec(0, n - 1);
  _treeMemo.set(n, all);
  return all;
}
function bkNat(node, ars) {
  if (node.leaf != null) return ars[node.leaf];
  const a = bkNat(node.a, ars), b = bkNat(node.b, ars);
  return node.dir === 'H' ? a + b : 1 / (1 / a + 1 / b);
}
function bkPlace(node, ars, x, y, w, h, gap, out) {
  if (node.leaf != null) { out.push({ i: node.leaf, x, y, w, h }); return; }
  const a = bkNat(node.a, ars), b = bkNat(node.b, ars);
  if (node.dir === 'H') {
    const wa = (w - gap) * a / (a + b);
    bkPlace(node.a, ars, x, y, wa, h, gap, out);
    bkPlace(node.b, ars, x + wa + gap, y, w - gap - wa, h, gap, out);
  } else {
    const ia = 1 / a, ib = 1 / b, ha = (h - gap) * ia / (ia + ib);
    bkPlace(node.a, ars, x, y, w, ha, gap, out);
    bkPlace(node.b, ars, x, y + ha + gap, w, h - gap - ha, gap, out);
  }
}
/* devolve as melhores disposições diferentes entre si: [{rects:[{i,x,y,w,h}], score}] */
function bkCollages(ars, wts, box, gap, keep) {
  const n = ars.length;
  if (n === 1) return [{ rects: [{ i: 0, x: box.x, y: box.y, w: box.w, h: box.h }], score: 0 }];
  const hero = wts && wts.some(v => v !== wts[0]);
  const sum = hero ? wts.reduce((s, v) => s + v, 0) : 0;
  const scored = [];
  for (const tr of bkTrees(n)) {
    const rects = [];
    bkPlace(tr, ars, box.x, box.y, box.w, box.h, gap, rects);
    let area = 0; for (const r of rects) area += r.w * r.h;
    let s = 0;
    for (const r of rects) {
      const c = Math.log((r.w / r.h) / ars[r.i]);
      s += c * c;
      const fr = r.w * r.h / area;
      if (fr < 0.07) s += (0.07 - fr) * 30;
      const cell = r.w / r.h;
      if (cell > 3.3 || cell < 0.3) s += 1.5;
      if (hero) s += 6 * Math.pow(fr - wts[r.i] / sum, 2);
    }
    scored.push({ rects, score: s });
  }
  scored.sort((p, q) => p.score - q.score);
  const out = [], seen = [];
  const sig = rs => rs.slice().sort((p, q) => p.i - q.i).map(r => [r.x, r.y, r.w, r.h]);
  for (const c of scored) {
    const sg = sig(c.rects);
    const same = seen.some(o => o.every((q, k) => Math.abs(q[0] - sg[k][0]) < box.w * 0.06 && Math.abs(q[1] - sg[k][1]) < box.h * 0.06 && Math.abs(q[2] - sg[k][2]) < box.w * 0.06 && Math.abs(q[3] - sg[k][3]) < box.h * 0.06));
    if (same) continue;
    seen.push(sg); out.push(c);
    if (out.length >= (keep || 6)) break;
  }
  return out;
}

/* caixa útil da página, em unidades (largura 100) */
function bkBox(theme, side, H, head) {
  const m = theme.margin, sp = m * 0.5;
  const left = m + (side === 'R' ? sp : 0), right = m + (side === 'L' ? sp : 0);
  const top = m + (head ? 4.2 : 0), bottom = m + (m > 0 ? 3.4 : 0);
  return { x: left, y: top, w: 100 - left - right, h: H - top - bottom };
}

/* ---------- construção automática ---------- */
function bkPhotoSort(t) {
  const arr = (t.photos || []).map((p, i) => ({ p, i }));
  arr.sort((a, b) => ((a.p.date || '9999') + ' ' + (a.p.time || '')).localeCompare((b.p.date || '9999') + ' ' + (b.p.time || '')) || a.i - b.i);
  return arr.map(x => x.p);
}
const bkAr = p => (p && p.w > 0 && p.h > 0) ? p.w / p.h : 1.5;

function bkSplitText(text, first, rest) {
  const t = String(text || '').trim();
  if (!t) return [];
  const out = []; let cur = t, lim = first;
  while (cur.length > lim) {
    let cut = cur.lastIndexOf('\n\n', lim);
    if (cut < lim * 0.4) cut = cur.lastIndexOf('\n', lim);
    if (cut < lim * 0.4) { const m = [...cur.slice(0, lim).matchAll(/[.!?…]\s/g)]; cut = m.length ? m[m.length - 1].index + 1 : -1; }
    if (cut < lim * 0.4) cut = cur.lastIndexOf(' ', lim);
    if (cut <= 0) cut = lim;
    out.push(cur.slice(0, cut).trim()); cur = cur.slice(cut).trim(); lim = rest;
  }
  if (cur) out.push(cur);
  return out;
}
function bkPaginate(list) {
  const out = []; let cur = [], pi = 0;
  const pattern = [4, 3, 5, 3, 4, 2, 4];
  const flush = () => { if (cur.length) { out.push({ ids: cur.map(p => p.id), full: false }); cur = []; } };
  for (const p of list) {
    if (p.fav || bkAr(p) > 2.3) { flush(); out.push({ ids: [p.id], full: true }); continue; }
    cur.push(p);
    if (cur.length >= pattern[pi % pattern.length]) { flush(); pi++; }
  }
  flush();
  for (let i = out.length - 1; i > 0; i--) {
    if (out[i].ids.length === 1 && !out[i].full && out[i - 1].ids.length < 5 && !out[i - 1].full) { out[i - 1].ids.push(out[i].ids[0]); out.splice(i, 1); }
  }
  return out;
}
function bkDistance(t) {
  const tr = t.track || [];
  let km = 0;
  for (let i = 3; i + 2 < tr.length; i += 3) km += haversineKm(tr[i - 3], tr[i - 2], tr[i], tr[i + 1]);
  return km;
}

function bookAuto(t, opts) {
  opts = opts || {};
  const photos = bkPhotoSort(t);
  const byId = new Map(photos.map(p => [p.id, p]));
  const days = tripDays(t);
  const cover = (t.cover && byId.has(t.cover)) ? t.cover : (photos.find(p => p.fav) || photos.find(p => bkAr(p) > 1.2) || photos[0] || {}).id || null;
  const pages = [{ t: 'cover', id: cover }];
  pages.push({ t: 'intro' });
  if (tripPoint(t)) pages.push({ t: 'map' });
  const groups = [];
  const dayHas = new Set();
  for (const d of days) {
    const ps = photos.filter(p => p.date === d);
    const text = ((t.days || {})[d] || '').trim();
    if (ps.length || text) groups.push({ date: d, ps, text });
    ps.forEach(p => dayHas.add(p.id));
  }
  const loose = photos.filter(p => !dayHas.has(p.id));
  if (loose.length) groups.push({ date: '', ps: loose, text: '' });
  for (const g of groups) {
    let pool = g.ps.slice();
    const chunks = bkSplitText(g.text, 760, 1250);
    const useOpener = !!g.date && (chunks.length > 0 || pool.length >= 8);
    let openerPhoto = null;
    if (useOpener && pool.length >= 2) {
      openerPhoto = pool.find(p => p.fav) || pool.find(p => bkAr(p) < 1) || pool[0];
      pool = pool.filter(p => p !== openerPhoto);
    }
    if (useOpener) {
      pages.push({ t: 'day', date: g.date, text: chunks[0] || '', ids: openerPhoto ? [openerPhoto.id] : [] });
      for (let k = 1; k < chunks.length; k++) pages.push({ t: 'text', date: g.date, text: chunks[k], cont: true });
    }
    const pieces = bkPaginate(pool);
    pieces.forEach((pc, idx) => {
      const pg = { t: pc.full ? 'full' : 'collage', ids: pc.ids };
      if (!useOpener && idx === 0) { pg.date = g.date; if (g.text) pg.note = g.text.length < 200 ? g.text : ''; }
      if (!g.date && idx === 0) pg.more = true;
      pages.push(pg);
    });
  }
  const inner = pages.length - 1;
  if (inner % 2 === 1) pages.push({ t: 'rest' });
  pages.push({ t: 'end' }, { t: 'colophon' });
  pages.push({ t: 'back' });
  return { v: 1, theme: opts.theme || 'revista', fmt: opts.fmt || 'land', pages, auto: true };
}

/* inclui fotos novas (não usadas) no fim, antes do fecho */
function bookUnused(t, book) {
  const used = new Set();
  for (const p of book.pages) { if (p.id) used.add(p.id); (p.ids || []).forEach(i => used.add(i)); }
  return bkPhotoSort(t).filter(p => !used.has(p.id));
}

function bookPageSide(book, i) {
  if (i <= 0 || i >= book.pages.length - 1) return 'C';
  return i % 2 === 1 ? 'L' : 'R';
}
function bookSpreads(book) {
  const n = book.pages.length, out = [[0]];
  for (let i = 1; i < n - 1; i += 2) out.push(i + 1 < n - 1 ? [i, i + 1] : [i]);
  out.push([n - 1]);
  return out;
}

/* ---------- HTML das páginas ---------- */
const bkPct = (v, tot) => (Math.round(v / tot * 10000) / 100) + '%';
function bkThemeVars(th) {
  return (`--paper:${th.paper};--ink:${th.ink};--mute:${th.mute};--accent:${th.accent};--rule:${th.rule};--fd:${th.fd};--fb:${th.fb};--ft:${th.ft || th.fb};--fm:${th.fm};--round:${th.round}cqw;--m:${th.margin}cqw`).replace(/"/g, "'");
}
function bkCell(ctx, id, r, W, H, page, extra) {
  const f = (page.focus && page.focus[id]) || [50, 50];
  const ph = ctx.photo(id) || {};
  const alt = esc(ph.caption || '');
  return `<div class="ph${extra ? ' ' + extra : ''}" data-id="${esc(id)}" style="left:${bkPct(r.x, W)};top:${bkPct(r.y, H)};width:${bkPct(r.w, W)};height:${bkPct(r.h, H)}"><img src="${esc(ctx.src(id, r))}" alt="${alt}" decoding="async" style="object-position:${f[0]}% ${f[1]}%" draggable="false"></div>`;
}
function bkTextSize(len, big) {
  if (big) return len <= 260 ? 3.0 : len <= 520 ? 2.5 : len <= 900 ? 2.1 : 1.8;
  return len <= 220 ? 2.35 : len <= 420 ? 2.05 : len <= 700 ? 1.8 : 1.55;
}
const bkTx = (field, text, size, cls) => `<div class="tx ${cls || ''}" data-field="${field}" style="font-size:${size}cqw">${esc(text)}</div>`;

function bookPageHTML(page, book, idx, ctx) {
  const th = bookTheme(book), fmt = bookFmt(book), W = 100, H = 100 / fmt.ar;
  const side = bookPageSide(book, idx), t = ctx.trip;
  const sideCls = side === 'L' ? 'sl' : side === 'R' ? 'sr' : '';
  const open = (cls, inner, style) => `<div class="pg ${cls} ${sideCls} t-${book.theme || 'revista'}" data-page="${idx}" style="${bkThemeVars(th)};aspect-ratio:${fmt.ar}${style ? ';' + style : ''}">${inner}</div>`;
  const folio = (!th.dark || true) && side !== 'C' ? `<div class="folio ${side === 'L' ? 'fl' : 'fr'}">${idx}</div>` : '';
  const head = pg => pg.date ? `<div class="hd"><b>${pg.n ? 'Dia ' + pg.n : ''}</b><span>${esc(bkDayLong(pg.date))}</span></div>` : (pg.more ? '<div class="hd"><span>Mais momentos</span></div>' : '');
  const dayN = d => (d && t.start && parseYmd(t.start) && parseYmd(d)) ? diffDays(t.start, d) + 1 : 0;
  const pgx = Object.assign({}, page, { n: dayN(page.date) });
  const ph = ctx.photo;

  switch (page.t) {
    case 'cover': {
      const id = page.id && ctx.photo(page.id) ? page.id : ((t.photos || [])[0] || {}).id;
      const dates = bkRange(t), place = [t.place, t.country].filter(Boolean).join(', ');
      const sub = esc([place, dates].filter(Boolean).join('  ·  '));
      const rawT = page.title || t.title, title = esc(rawT), tsz = rawT.length > 30 ? 5.6 : rawT.length > 20 ? 7 : rawT.length > 12 ? 8.6 : 10.5;
      if (!id) return open('cover nopic', `<div class="ct"><span class="mn">${sub}</span><h1 style="font-size:${tsz}cqw" data-field="title">${title}</h1></div>`);
      const style = th.cover;
      if (style === 'frame') {
        const m = th.margin, bx = { x: m, y: m, w: 100 - 2 * m, h: H * 0.72 - m };
        return open('cover frame', bkCell(ctx, id, bx, W, H, page, 'solo') + `<div class="ct" style="left:${bkPct(m, W)};right:${bkPct(m, W)};top:${bkPct(bx.y + bx.h + 3.2, H)}"><h1 style="font-size:${tsz * 0.62}cqw" data-field="title">${title}</h1><span class="mn">${sub}</span></div>`);
      }
      if (style === 'split') {
        const m = th.margin, bx = { x: m, y: m, w: 100 - 2 * m, h: H * 0.68 };
        return open('cover split', bkCell(ctx, id, bx, W, H, page, 'solo') + `<div class="ct" style="left:${bkPct(m, W)};right:${bkPct(m, W)};top:${bkPct(m + bx.h + 3, H)}"><h1 style="font-size:${tsz * 0.62}cqw" data-field="title">${title}</h1><span class="mn">${sub}</span></div>`);
      }
      return open('cover ' + style, bkCell(ctx, id, { x: 0, y: 0, w: W, h: H }, W, H, page, 'solo') + '<div class="shade"></div>' + `<div class="ct"><span class="mn">${sub}</span><h1 style="font-size:${tsz}cqw" data-field="title">${title}</h1></div>`);
    }
    case 'intro': {
      const m = th.margin || 5, box = bkBox(th, side, H, false);
      const stats = [];
      const dc = tripDayCount(t) || tripDays(t).length;
      if (dc) stats.push([dc, dc === 1 ? 'dia' : 'dias']);
      const np = (t.photos || []).length;
      if (np) stats.push([np, np === 1 ? 'fotografia' : 'fotografias']);
      const km = bkDistance(t);
      if (km >= 1) stats.push([bkNum(km), 'km no percurso']);
      const place = [t.place, t.country].filter(Boolean).join(', ');
      const note = (page.text != null ? page.text : t.note) || '';
      return open('intro', `<div class="in" style="left:${bkPct(box.x, W)};top:${bkPct(box.y, H)};width:${bkPct(box.w, W)};height:${bkPct(box.h, H)}">
        <div class="top"><span class="mn">${esc(bkRange(t))}</span><span class="mn">${esc(place)}</span></div>
        <h2 class="big" data-field="title" style="font-size:${(page.title || t.title).length > 28 ? 5 : (page.title || t.title).length > 16 ? 6.4 : 8}cqw">${esc(page.title || t.title)}</h2>
        ${note || page.editable ? bkTx('text', note, bkTextSize(note.length, true), 'lead') : ''}
        <div class="stats">${stats.map(s => `<div><b>${esc(String(s[0]))}</b><span>${esc(s[1])}</span></div>`).join('')}</div></div>` + folio);
    }
    case 'map': {
      const box = bkBox(th, side, H, false);
      const stops = (ctx.stops || []).slice(0, 12), hasList = stops.length > 1;
      const lw = hasList ? box.w * 0.3 : 0, gp = hasList ? 3 : 0, mw = box.w - lw - gp;
      const outerLeft = side !== 'R';
      const mx = hasList && outerLeft ? box.x + lw + gp : box.x, lx = hasList ? (outerLeft ? box.x : box.x + mw + gp) : 0;
      const place = [t.place, t.country].filter(Boolean).join(', ');
      const list = hasList ? `<div class="stops" style="left:${bkPct(lx, W)};top:${bkPct(box.y, H)};width:${bkPct(lw, W)};height:${bkPct(box.h, H)}"><span class="mn">Percurso</span>${stops.map(s => `<div class="st"><i>${s.n}</i><span><b>${esc(s.name)}</b>${s.d0 ? `<small>${esc(s.d1 && s.d1 !== s.d0 ? bkDayShort(s.d0) + ' – ' + bkDayShort(s.d1) : bkDayShort(s.d0))}</small>` : ''}</span></div>`).join('')}</div>` : '';
      return open('map', `<div class="mapfull" style="left:${bkPct(mx, W)};top:${bkPct(box.y, H)};width:${bkPct(mw, W)};height:${bkPct(box.h, H)}">${ctx.mapSVG(mw / box.h)}${hasList ? '' : `<div class="maplab"><span class="mn">Percurso</span><b>${esc(place || t.title)}</b></div>`}</div>${list}` + folio);
    }
    case 'day': {
      const box = bkBox(th, side, H, false);
      const id = (page.ids || [])[0];
      const hasPh = !!id;
      const pw = hasPh ? box.w * 0.4 : 0, gap = hasPh ? 3.2 : 0;
      const tw = box.w - pw - gap;
      const text = page.text || '';
      const n = pgx.n;
      const cell = hasPh ? bkCell(ctx, id, { x: side === 'L' ? box.x + tw + gap : box.x + pw + gap - pw + 0, y: box.y, w: pw, h: box.h }, W, H, page, 'solo') : '';
      const tx = side === 'L' ? box.x : box.x + (hasPh ? pw + gap : 0);
      const px = side === 'L' ? box.x + tw + gap : box.x;
      const cell2 = hasPh ? bkCell(ctx, id, { x: px, y: box.y, w: pw, h: box.h }, W, H, page, 'solo') : '';
      return open('day', `${cell2}<div class="in" style="left:${bkPct(tx, W)};top:${bkPct(box.y, H)};width:${bkPct(tw, W)};height:${bkPct(box.h, H)}">
        ${n ? `<div class="num">${String(n).padStart(2, '0')}</div>` : ''}
        <div class="mn up">${esc(bkDayLong(page.date))}</div><div class="rule"></div>
        ${bkTx('text', text, bkTextSize(text.length, false), 'body')}</div>` + folio);
    }
    case 'text': {
      const box = bkBox(th, side, H, true);
      const text = page.text || '';
      return open('textpage', `${head(pgx)}<div class="in" style="left:${bkPct(box.x + box.w * 0.08, W)};top:${bkPct(box.y + 2, H)};width:${bkPct(box.w * 0.84, W)};height:${bkPct(box.h - 2, H)}">${bkTx('text', text, bkTextSize(text.length, true) * 0.8, 'body')}</div>` + folio);
    }
    case 'collage': case 'full': {
      const ids = (page.ids || []).filter(i => ph(i));
      const hasHead = !!(page.date || page.more);
      if (!ids.length) return open('rest', '<div class="orn">✦</div>' + folio);
      if (ids.length === 1) {
        const id = ids[0], p = ph(id), ar = bkAr(p), pageAr = fmt.ar;
        const mode = page.mode || (Math.abs(Math.log(pageAr / ar)) < 0.28 ? 'bleed' : 'fit');
        let r;
        if (mode === 'bleed') r = { x: 0, y: 0, w: W, h: H };
        else {
          const box = bkBox(th, side, H, hasHead);
          const m = Math.max(box.w * 0.0, 0);
          let w = box.w - m, h = w / ar;
          if (h > box.h) { h = box.h; w = h * ar; }
          r = { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
        }
        const cap = p.caption ? `<div class="cap ${mode}">${esc(p.caption)}</div>` : '';
        return open('full ' + mode, bkCell(ctx, id, r, W, H, page, 'solo') + (mode === 'bleed' && p.caption ? '<div class="shade low"></div>' : '') + cap + head(pgx) + folio);
      }
      const box = bkBox(th, side, H, hasHead);
      const ars = ids.map(i => bkAr(ph(i))), wts = ids.map(i => ph(i).fav ? 2.2 : 1);
      const alts = bkCollages(ars, wts, box, th.gap, 6);
      const choice = alts[((page.alt || 0) % alts.length + alts.length) % alts.length];
      const cells = choice.rects.map(r => bkCell(ctx, ids[r.i], r, W, H, page)).join('');
      const caps = ids.length === 2 ? choice.rects.map(r => { const p = ph(ids[r.i]); return p.caption ? `<div class="cap2" style="left:${bkPct(r.x, W)};top:${bkPct(r.y + r.h + 0.6, H)};width:${bkPct(r.w, W)}">${esc(p.caption)}</div>` : ''; }).join('') : '';
      return open('collage', cells + caps + head(pgx) + folio);
    }
    case 'end': {
      const box = bkBox(th, side, H, false);
      const dc = tripDayCount(t) || tripDays(t).length, np = (t.photos || []).length, km = bkDistance(t);
      const rows = [];
      if (dc) rows.push([dc, dc === 1 ? 'dia' : 'dias']);
      if (np) rows.push([np, np === 1 ? 'fotografia' : 'fotografias']);
      if (km >= 1) rows.push([bkNum(km), 'quilómetros']);
      return open('end', `<div class="in c" style="left:${bkPct(box.x, W)};top:${bkPct(box.y, H)};width:${bkPct(box.w, W)};height:${bkPct(box.h, H)}"><h2 class="big sm" data-field="title">${esc(page.title || t.title)}</h2><div class="nums">${rows.map(r => `<div><b>${esc(String(r[0]))}</b><span>${esc(r[1])}</span></div>`).join('')}</div></div>` + folio);
    }
    case 'colophon': {
      const box = bkBox(th, side, H, false);
      return open('colophon', `<div class="in c" style="left:${bkPct(box.x, W)};top:${bkPct(box.y, H)};width:${bkPct(box.w, W)};height:${bkPct(box.h, H)}"><div class="orn">✦</div>${bkTx('text', page.text != null ? page.text : (t.title + '\n' + bkRange(t)), 2.1, 'body c')}<span class="mn">Worldbook</span></div>` + folio);
    }
    case 'back': {
      return open('back', `<div class="bk-t"><b>${esc(t.title)}</b><span class="mn">${esc(bkRange(t))}</span></div>`);
    }
    default:
      return open('rest', '<div class="orn">✦</div>' + folio);
  }
}
