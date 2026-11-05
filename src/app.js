/* ===== app.js: interface ===== */
const $ = (s, r = document) => r.querySelector(s);
const SVGNS = 'http://www.w3.org/2000/svg';
const pl = (n, s, p) => n + ' ' + (n === 1 ? s : p);
const blobUrl = id => (window.__worldbook && window.__worldbook.blobUrl(id)) || ('/_blob/' + encodeURIComponent(id));
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function svgEl(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid) el.append(kid);
  return el;
}

/* ---------- datas ---------- */
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dfmt = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dfmtLong = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
function dateText(t) {
  const a = parseYmd(t.start), b = parseYmd(t.end);
  if (a && b && t.end !== t.start) { try { return dfmt.formatRange(a, b); } catch (e) { return dfmt.format(a) + ' – ' + dfmt.format(b); } }
  return a ? dfmt.format(a) : '';
}
const yearOf = t => (t.start && t.start.slice(0, 4)) || 'Sem data';
const monthKey = s => (s && s.length >= 7) ? s.slice(0, 7) : '';
const monthLabel = ym => ym ? `${MONTHS_LONG[+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}` : 'Sem data';

/* ---------- estado ---------- */
let db = null, assets = null, downloads = null, canWrite = false;
let trips = [], loaded = false, loadError = false, slow = false, noDb = false;
let view = { name: 'home', id: null };
const ui = { tab: 'mapa', q: '', tag: '', fav: false, layout: 'grelha', year: new Date().getFullYear(), pYear: '', pFav: false, route: true, sel: null, discreet: false };
const mapState = { x: 0, y: 0, w: MAP_W };
let lastDatas = [], lastIds = [];
let lb = null, modal = null, bk = null, lastFocus = null;
let statusTimer = null, uploading = false;
const queues = new Map();
const tripById = id => trips.find(t => t.id === id);
const coverId = t => { const ph = t.photos || []; return (t.cover && ph.some(p => p.id === t.cover)) ? t.cover : (ph[0] && ph[0].id) || null; };
const placeText = t => [t.place, t.country].filter(Boolean).join(', ');
function enqueue(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  queues.set(key, next);
  return next;
}
function setStatus(text, ms) {
  const el = $('#status');
  clearTimeout(statusTimer);
  if (!text) { el.hidden = true; return; }
  el.textContent = text; el.hidden = false;
  if (ms) statusTimer = setTimeout(() => { el.hidden = true; }, ms);
}
function lockScroll() { document.body.style.overflow = 'hidden'; }
function unlockScroll() { if (!modal && !lb && !bk) document.body.style.overflow = ''; }

/* ---------- mapa ---------- */
const GRAT_D = (() => {
  let d = '';
  for (let lo = -180; lo <= 180; lo += 30) { const a = project(lo, LAT_TOP), b = project(lo, LAT_BOT); d += `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`; }
  for (let la = -30; la <= 60; la += 30) { const a = project(-180, la), b = project(180, la); d += `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`; }
  return d;
})();
const LAND_D = LAND.map(polyPath).join('');
const SEA_D = SEAS.map(polyPath).join('');
const BOOK_PAL = { sea: '#E1E9E7', land: '#FFFFFF', coast: '#A5B5B1', grat: '#CFDAD7', pin: '#C8341B', dot: '#1F3F9E', route: '#1F3F9E' };

function fitView(points, minW) {
  if (!points.length) return { x: 0, y: 0, w: MAP_W };
  const xs = points.map(p => project(p.lng, p.lat)[0]), ys = points.map(p => project(p.lng, p.lat)[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = Math.min(MAP_W, Math.max(minW || 220, (x1 - x0) * 1.5, (y1 - y0) * 1.5 * MAP_W / MAP_H));
  const hh = w * MAP_H / MAP_W;
  return { x: Math.max(0, Math.min(MAP_W - w, (x0 + x1) / 2 - w / 2)), y: Math.max(0, Math.min(MAP_H - hh, (y0 + y1) / 2 - hh / 2)), w };
}

function createMap(o) {
  const pal = o.palette || null;
  const col = (k, v) => pal ? pal[k] : `var(--${v})`;
  const svg = svgEl('svg', { viewBox: `0 0 ${MAP_W} ${MAP_H}`, role: 'img', 'aria-label': o.label || 'Mapa-múndi', xmlns: SVGNS });
  svg.append(
    svgEl('rect', { x: 0, y: 0, width: MAP_W, height: MAP_H, fill: col('sea', 'sea') }),
    svgEl('path', { d: GRAT_D, fill: 'none', stroke: col('grat', 'grat'), 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }),
    svgEl('path', { d: LAND_D, fill: col('land', 'land'), stroke: col('coast', 'coast'), 'stroke-width': 1, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }),
    svgEl('path', { d: SEA_D, fill: col('sea', 'sea'), stroke: col('coast', 'coast'), 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
  const gRoute = svgEl('g'), gDots = svgEl('g'), gPins = svgEl('g'), gPick = svgEl('g');
  svg.append(gRoute, gDots, gPins, gPick);

  const pins = o.pins || [];
  if (o.route && pins.length > 1) {
    const d = pins.map((p, i) => { const q = project(p.lng, p.lat); return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('');
    gRoute.append(svgEl('path', { d, fill: 'none', stroke: col('route', 'blue'), 'stroke-width': 1.6, 'stroke-dasharray': '6 5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.85, 'vector-effect': 'non-scaling-stroke' }));
  }
  const scaled = [];
  for (const d of (o.dots || [])) {
    const q = project(d.lng, d.lat);
    const g = svgEl('g', { transform: `translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})` });
    g.append(svgEl('circle', { r: 3.5, fill: col('dot', 'blue'), stroke: pal ? '#fff' : 'var(--surface)', 'stroke-width': 1 }));
    gDots.append(g); scaled.push([g, q]);
  }
  for (const p of pins) {
    const q = project(p.lng, p.lat);
    const g = svgEl('g', { class: 'pin', transform: `translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})`, 'data-id': p.id });
    if (!o.static) { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', p.label || 'Viagem'); }
    if (p.label && !o.static) g.append(svgEl('title', {}, document.createTextNode(p.label)));
    g.append(svgEl('circle', { class: 'ring', r: p.sel ? 13 : 10, fill: 'none', stroke: p.sel ? col('route', 'blue') : 'none', 'stroke-width': 2.5 }));
    g.append(svgEl('circle', { r: 7, fill: col('pin', 'accent'), stroke: pal ? '#fff' : 'var(--surface)', 'stroke-width': 2.5 }));
    if (!o.static) {
      g.addEventListener('pointerdown', e => e.stopPropagation());
      g.addEventListener('click', e => { e.stopPropagation(); o.onPin && o.onPin(p.id); });
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onPin && o.onPin(p.id); } });
    }
    gPins.append(g); scaled.push([g, q]);
  }

  let { x: vx, y: vy, w: vw } = o.view || { x: 0, y: 0, w: MAP_W };
  const box = h('div', { class: 'mapbox' + (o.onPick ? ' pick' : '') });
  const vh = () => vw * MAP_H / MAP_W;
  const clampView = () => { vw = Math.max(50, Math.min(MAP_W, vw)); vx = Math.max(0, Math.min(MAP_W - vw, vx)); vy = Math.max(0, Math.min(MAP_H - vh(), vy)); };
  const widthPx = () => svg.getBoundingClientRect().width || 700;
  function apply(silent) {
    clampView();
    svg.setAttribute('viewBox', `${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh().toFixed(2)}`);
    const k = (o.static ? vw / 900 : vw / widthPx());
    for (const [g, q] of scaled) g.setAttribute('transform', `translate(${q[0].toFixed(1)} ${q[1].toFixed(1)}) scale(${k.toFixed(4)})`);
    box.classList.toggle('zoomed', vw < MAP_W - 1);
    if (!silent && o.onView) o.onView({ x: vx, y: vy, w: vw });
  }
  function drawPick(pk) {
    gPick.replaceChildren();
    if (!pk) return;
    const q = project(pk.lng, pk.lat);
    const g = svgEl('g', { transform: `translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})`, 'data-pick': '1' });
    g.append(svgEl('circle', { r: 10, fill: 'none', stroke: 'var(--blue)', 'stroke-width': 2.5 }), svgEl('circle', { r: 4, fill: 'var(--accent)' }));
    gPick.append(g); scaled.push([g, q]); apply(true);
  }
  box.append(svg);
  if (!o.static) {
    const zoom = (f, cx, cy) => {
      const r = svg.getBoundingClientRect();
      const fx = cx == null ? 0.5 : (cx - r.left) / r.width, fy = cy == null ? 0.5 : (cy - r.top) / r.height;
      const px = vx + fx * vw, py = vy + fy * vh();
      vw = Math.max(50, Math.min(MAP_W, vw * f)); vx = px - fx * vw; vy = py - fy * vh(); apply();
    };
    box.append(h('div', { class: 'mapctl' },
      h('button', { type: 'button', 'aria-label': 'Aproximar', onclick: () => zoom(0.6) }, '+'),
      h('button', { type: 'button', 'aria-label': 'Afastar', onclick: () => zoom(1.67) }, '−'),
      h('button', { type: 'button', 'aria-label': 'Ver o mundo todo', onclick: () => { vx = 0; vy = 0; vw = MAP_W; apply(); } }, '⟲')));
    let drag = null;
    svg.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, vx, vy, moved: false }; });
    svg.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      if (vw >= MAP_W - 1) return;
      try { svg.setPointerCapture(e.pointerId); } catch (er) { /* ignora */ }
      box.classList.add('dragging');
      const k = vw / svg.getBoundingClientRect().width;
      vx = drag.vx - dx * k; vy = drag.vy - dy * k; apply();
    });
    const end = e => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const was = drag; drag = null; box.classList.remove('dragging');
      if (e && e.type === 'pointerup' && !was.moved && o.onPick) {
        const r = svg.getBoundingClientRect();
        const [lo, la] = unproject(vx + (e.clientX - r.left) / r.width * vw, vy + (e.clientY - r.top) / r.height * vh());
        o.onPick(la, lo);
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', () => { drag = null; box.classList.remove('dragging'); });
    svg.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoom(e.deltaY < 0 ? 0.8 : 1.25, e.clientX, e.clientY); }, { passive: false });
    if (window.ResizeObserver) new ResizeObserver(() => apply(true)).observe(box);
  }
  apply(true);
  drawPick(o.pick);
  return { el: box, setPick: drawPick, svg };
}

function mapSVGString(t) {
  const pt = tripPoint(t);
  if (!pt) return '';
  const dots = (t.photos || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const m = createMap({ static: true, palette: BOOK_PAL, pins: [{ id: t.id, lat: pt.lat, lng: pt.lng }], dots, view: fitView([pt].concat(dots), 300) });
  return m.svg.outerHTML;
}

/* ---------- estatísticas ---------- */
function statsLine() {
  const countries = new Set(), conts = new Set();
  for (const t of trips) { const c = findCountry(t.country); if (c) { countries.add(c.code); conts.add(c.cont); } }
  const photos = trips.reduce((n, t) => n + (t.photos || []).length, 0);
  const days = trips.reduce((n, t) => n + tripDayCount(t), 0);
  const parts = [pl(trips.length, 'viagem', 'viagens')];
  if (countries.size) parts.push(pl(countries.size, 'país', 'países'));
  if (conts.size) parts.push(pl(conts.size, 'continente', 'continentes'));
  parts.push(pl(photos, 'foto', 'fotos'));
  if (days) parts.push(pl(days, 'dia fora', 'dias fora'));
  return parts.join('  ·  ');
}

/* ---------- peças de interface ---------- */
function placeholder(t) {
  const a = hueOf(t.title), b = (a + 38) % 360;
  return h('div', { class: 'cover ph', style: `background:linear-gradient(145deg,hsl(${a} 38% 34%),hsl(${b} 42% 26%))` },
    h('span', {}, placeText(t) || 'Sem fotos'));
}
function coverEl(t) {
  const cid = coverId(t);
  const c = cid ? h('div', { class: 'cover' }, h('img', { src: blobUrl(cid), alt: '', loading: 'lazy', decoding: 'async' })) : placeholder(t);
  if (t.fav) c.append(h('span', { class: 'heart', 'aria-label': 'Favorita' }, '♥'));
  return c;
}
function card(t) {
  const n = (t.photos || []).length;
  const meta = [dateText(t), n ? pl(n, 'foto', 'fotos') : ''].filter(Boolean).join('  ·  ');
  return h('button', { class: 'card', type: 'button', 'aria-label': 'Abrir ' + t.title, onclick: () => go(t.id) },
    coverEl(t),
    h('div', {},
      h('h3', {}, t.title),
      placeText(t) ? h('p', { class: 'place' }, placeText(t)) : null,
      meta ? h('p', { class: 'mono' }, meta) : null,
      (t.tags || []).length ? h('div', { class: 'tagline' }, t.tags.map(x => h('span', {}, x))) : null));
}
function newTripBtn() {
  return canWrite ? h('button', { class: 'btn primary', type: 'button', onclick: () => openTripForm(null) }, 'Nova viagem') : null;
}
function importBtn() {
  if (!canWrite || !assets) return null;
  return h('button', { class: 'btn', type: 'button', onclick: () => pickImport() }, 'Importar fotos');
}

/* ---------- início ---------- */
const TABS = [['mapa', 'Mapa'], ['viagens', 'Viagens'], ['ano', 'Ano'], ['fotos', 'Fotos']];
function renderHome() {
  const root = h('div');
  root.append(h('header', { class: 'top' },
    h('div', {}, h('h1', {}, 'Álbum de viagens'),
      (loaded && trips.length) ? h('p', { class: 'mono', style: 'margin:0' }, statsLine()) : null),
    h('div', { class: 'row' }, importBtn(), newTripBtn(),
      h('button', { class: 'btn quiet', type: 'button', 'aria-pressed': ui.discreet ? 'true' : 'false', title: 'Desfoca fotos e textos para mostrares o ecrã a outras pessoas', onclick: toggleDiscreet }, 'Modo discreto'))));
  root.append(h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([k, label]) =>
    h('button', { class: 'tab', type: 'button', role: 'tab', id: 'tab-' + k, 'aria-selected': ui.tab === k ? 'true' : 'false', onclick: () => setTab(k) }, label))));

  if (noDb) root.append(h('div', { class: 'empty' }, h('h2', {}, 'Não foi possível abrir o álbum.'), h('p', {}, 'Para ver e guardar viagens, abre esta página com a tua conta Claude.')));
  else if (loadError) root.append(h('div', { class: 'empty' }, h('h2', {}, 'Não foi possível carregar as viagens.'), h('p', {}, 'Recarrega a página para tentar de novo.')));
  else if (!loaded) root.append(h('p', { class: 'mono' }, slow ? 'Sem resposta ainda. Vou continuar a tentar em segundo plano.' : 'A carregar viagens…'));
  else if (!trips.length) root.append(h('div', { class: 'empty' },
    h('h2', {}, 'O álbum ainda está vazio.'),
    h('p', {}, canWrite ? 'Cria a primeira viagem, ou usa "Importar fotos": agrupo as fotos por datas, leio a localização guardada nelas e proponho as viagens.' : 'Ainda não há viagens neste álbum.'),
    h('div', { class: 'row' }, newTripBtn(), importBtn())));
  else root.append(ui.tab === 'mapa' ? renderMapTab() : ui.tab === 'viagens' ? renderTripsTab() : ui.tab === 'ano' ? renderYearTab() : renderPhotosTab());
  return root;
}
function setTab(k) { if (location.hash === '#' + k) { ui.tab = k; render(); } else location.hash = k; }
function toggleDiscreet() {
  ui.discreet = !ui.discreet;
  document.body.classList.toggle('discreet', ui.discreet);
  try { localStorage.setItem('album-discreto', ui.discreet ? '1' : ''); } catch (e) { /* sem armazenamento */ }
  render();
}

/* separador Mapa */
function renderMapTab() {
  const root = h('div');
  const located = trips.map(t => ({ t, pt: tripPoint(t) })).filter(x => x.pt).sort((a, b) => (a.t.start || a.t.createdAt || '').localeCompare(b.t.start || b.t.createdAt || ''));
  const without = trips.filter(t => !tripPoint(t));
  if (ui.sel && !tripById(ui.sel)) ui.sel = null;
  root.append(h('div', { class: 'bar' },
    h('button', { class: 'chip', type: 'button', 'aria-pressed': ui.route ? 'true' : 'false', onclick: () => { ui.route = !ui.route; render(); } }, 'Percurso entre viagens'),
    h('span', { class: 'mono' }, located.length ? pl(located.length, 'viagem no mapa', 'viagens no mapa') + '. Usa + e − para aproximar.' : 'Ainda nenhuma viagem tem localização.')));
  const m = createMap({
    pins: located.map(x => ({ id: x.t.id, lat: x.pt.lat, lng: x.pt.lng, label: x.t.title + (dateText(x.t) ? ' · ' + dateText(x.t) : ''), sel: ui.sel === x.t.id })),
    route: ui.route, view: mapState, onView: v => Object.assign(mapState, v), label: 'Mapa das viagens',
    onPin: id => { ui.sel = id; render(); }
  });
  root.append(m.el);
  const note = h('div', { class: 'mapnote' });
  const sel = ui.sel && tripById(ui.sel);
  if (sel) note.append(h('div', { class: 'sel' }, coverEl(sel),
    h('div', {}, h('h3', {}, sel.title),
      h('p', { class: 'mono' }, [placeText(sel), dateText(sel)].filter(Boolean).join('  ·  ')),
      h('button', { class: 'btn sm', type: 'button', onclick: () => go(sel.id) }, 'Abrir viagem'))));
  const countries = new Map();
  for (const t of trips) { const c = findCountry(t.country); if (c) countries.set(c.code, (countries.get(c.code) || 0) + 1); }
  if (countries.size) {
    const byCont = {};
    for (const code of countries.keys()) { const c = COUNTRY_BY_CODE[code]; (byCont[c.cont] = byCont[c.cont] || []).push(c); }
    note.append(h('div', {}, h('h2', { class: 'sec' }, 'Países visitados'),
      h('div', { class: 'chips' }, Object.keys(byCont).flatMap(k => byCont[k].sort((a, b) => a.name.localeCompare(b.name, 'pt')).map(c =>
        h('span', { class: 'chip static', title: CONTINENTS[k] }, c.name + (countries.get(c.code) > 1 ? ' ×' + countries.get(c.code) : '')))))));
  }
  if (without.length) note.append(h('p', { class: 'nolocs' }, pl(without.length, 'viagem sem localização', 'viagens sem localização') + ': ',
    without.map((t, i) => [i ? ', ' : '', h('button', { type: 'button', onclick: () => go(t.id) }, t.title)]),
    canWrite ? '. Edita a viagem e indica o país ou marca o sítio no mapa.' : '.'));
  note.append(h('p', { class: 'mono', style: 'margin:0' }, 'Mapa simplificado. Cada pino usa a localização marcada, o GPS das fotos ou o centro do país.'));
  root.append(note);
  return root;
}

/* "Neste dia" */
function memories() {
  const now = new Date(), md = pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()), y = now.getFullYear();
  const out = [];
  for (const t of trips) for (const p of (t.photos || [])) if (p.date && p.date.slice(5) === md && +p.date.slice(0, 4) < y) out.push({ t, p, years: y - +p.date.slice(0, 4) });
  return out;
}

/* separador Viagens */
function matchTrip(t, q) {
  if (!q) return true;
  const hay = fold([t.title, t.place, t.country, t.note, (t.tags || []).join(' '), Object.values(t.days || {}).join(' '), (t.photos || []).map(p => p.caption).join(' ')].join(' '));
  return q.split(/\s+/).every(w => hay.includes(w));
}
function renderTripsTab() {
  const root = h('div');
  const mem = memories();
  if (mem.length && !ui.q) {
    const list = mem.slice(0, 8).map(m => ({ tid: m.t.id, pid: m.p.id }));
    const first = mem[0];
    root.append(h('section', { class: 'memory' },
      h('h2', {}, 'Neste dia'),
      h('p', { class: 'mono', style: 'margin:0' }, [...new Set(mem.map(m => `há ${pl(m.years, 'ano', 'anos')} · ${m.t.title}`))].slice(0, 3).join('  ·  ')),
      h('div', { class: 'thumbs' }, mem.slice(0, 8).map((m, i) => h('button', { type: 'button', 'aria-label': 'Abrir foto de ' + m.t.title, onclick: () => openLightbox(list, i) }, h('img', { src: blobUrl(m.p.id), alt: '', loading: 'lazy' }))))));
  }
  const allTags = {};
  for (const t of trips) for (const g of (t.tags || [])) allTags[g] = (allTags[g] || 0) + 1;
  const q = fold(ui.q).trim();
  root.append(h('div', { class: 'bar' },
    h('div', { class: 'search' }, h('input', { class: 'input', id: 'search', type: 'search', placeholder: 'Procurar por título, local, nota ou legenda', value: ui.q, 'aria-label': 'Procurar viagens',
      oninput: e => { ui.q = e.target.value; clearTimeout(ui._t); ui._t = setTimeout(() => { render(); const i = $('#search'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } })),
    h('button', { class: 'chip', type: 'button', 'aria-pressed': ui.fav ? 'true' : 'false', onclick: () => { ui.fav = !ui.fav; render(); } }, '♥ Favoritas'),
    h('div', { class: 'chips' },
      h('button', { class: 'chip', type: 'button', 'aria-pressed': ui.layout === 'grelha' ? 'true' : 'false', onclick: () => { ui.layout = 'grelha'; render(); } }, 'Grelha'),
      h('button', { class: 'chip', type: 'button', 'aria-pressed': ui.layout === 'tempo' ? 'true' : 'false', onclick: () => { ui.layout = 'tempo'; render(); } }, 'Linha do tempo'))));
  if (Object.keys(allTags).length) root.append(h('div', { class: 'chips', style: 'margin:-8px 0 22px' }, Object.keys(allTags).sort().map(g =>
    h('button', { class: 'chip', type: 'button', 'aria-pressed': ui.tag === g ? 'true' : 'false', onclick: () => { ui.tag = ui.tag === g ? '' : g; render(); } }, g + ' · ' + allTags[g]))));

  const sorted = trips.filter(t => matchTrip(t, q) && (!ui.fav || t.fav) && (!ui.tag || (t.tags || []).includes(ui.tag)))
    .sort((a, b) => (b.start || b.createdAt || '').localeCompare(a.start || a.createdAt || ''));
  if (!sorted.length) { root.append(h('p', { class: 'mono' }, 'Nenhuma viagem corresponde ao filtro.')); return root; }
  if (ui.layout === 'tempo') {
    const tl = h('div', { class: 'timeline' });
    for (const t of sorted) {
      const days = tripDayCount(t);
      tl.append(h('div', { class: 'tl-item' },
        h('button', { class: 'card', type: 'button', 'aria-label': 'Abrir ' + t.title, onclick: () => go(t.id) }, coverEl(t)),
        h('div', { class: 'body' },
          h('p', { class: 'mono' }, [dateText(t), days > 1 ? pl(days, 'dia', 'dias') : ''].filter(Boolean).join('  ·  ')),
          h('h3', {}, h('button', { type: 'button', style: 'all:unset;cursor:pointer', onclick: () => go(t.id) }, t.title)),
          placeText(t) ? h('p', {}, placeText(t)) : null,
          t.note ? h('p', { class: 'clamp note' }, t.note) : null,
          (t.tags || []).length ? h('div', { class: 'tagline' }, t.tags.map(x => h('span', {}, x))) : null)));
    }
    root.append(tl);
    return root;
  }
  const groups = new Map();
  for (const t of sorted) { const y = yearOf(t); if (!groups.has(y)) groups.set(y, []); groups.get(y).push(t); }
  const years = h('div', { class: 'years' });
  for (const [y, list] of groups) years.append(h('section', {}, h('h2', { class: 'year' }, y), h('div', { class: 'grid' }, list.map(card))));
  root.append(years);
  return root;
}

/* separador Ano */
function renderYearTab() {
  const root = h('div');
  const yrs = trips.map(t => +(t.start || '').slice(0, 4)).filter(Boolean);
  const minY = yrs.length ? Math.min(...yrs) : ui.year, maxY = Math.max(yrs.length ? Math.max(...yrs) : ui.year, new Date().getFullYear());
  ui.year = Math.max(minY, Math.min(maxY, ui.year));
  const Y = ui.year;
  const dayMap = new Map(), inYear = new Set();
  for (const t of trips) {
    const a = parseYmd(t.start); if (!a) continue;
    let b = parseYmd(t.end) || a; if (b < a) b = a;
    for (let d = new Date(a), n = 0; d <= b && n < 366; d.setUTCDate(d.getUTCDate() + 1), n++) {
      const key = fmtYmd(d);
      if (+key.slice(0, 4) === Y) { dayMap.set(key, t); inYear.add(t.id); }
    }
  }
  root.append(h('div', { class: 'yearbar' },
    h('button', { class: 'btn sm quiet', type: 'button', 'aria-label': 'Ano anterior', disabled: Y <= minY, onclick: () => { ui.year--; render(); } }, '←'),
    h('h2', {}, String(Y)),
    h('button', { class: 'btn sm quiet', type: 'button', 'aria-label': 'Ano seguinte', disabled: Y >= maxY, onclick: () => { ui.year++; render(); } }, '→'),
    h('span', { class: 'mono' }, dayMap.size ? `${pl(dayMap.size, 'dia', 'dias')} fora em ${pl(inYear.size, 'viagem', 'viagens')}` : 'Sem viagens com datas neste ano')));
  const months = h('div', { class: 'months' });
  for (let m = 0; m < 12; m++) {
    const first = new Date(Date.UTC(Y, m, 1)).getUTCDay(), off = (first + 6) % 7, n = new Date(Date.UTC(Y, m + 1, 0)).getUTCDate();
    const cal = h('div', { class: 'cal' }, ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(x => h('span', { class: 'wd' }, x)));
    for (let i = 0; i < off; i++) cal.append(h('span'));
    for (let d = 1; d <= n; d++) {
      const key = `${Y}-${pad2(m + 1)}-${pad2(d)}`, t = dayMap.get(key);
      cal.append(t ? h('button', { class: 'd', type: 'button', title: t.title, 'aria-label': `${d} de ${MONTHS_LONG[m]}: ${t.title}`, style: `background:hsl(${hueOf(t.title)} 55% 38%)`, onclick: () => go(t.id) }, String(d))
        : h('span', { class: 'd' }, String(d)));
    }
    months.append(h('div', { class: 'month' }, h('h3', {}, MONTHS_LONG[m]), cal));
  }
  root.append(months);
  const list = trips.filter(t => inYear.has(t.id)).sort((a, b) => a.start.localeCompare(b.start));
  if (list.length) root.append(h('div', { class: 'legend' }, list.map(t => h('button', { type: 'button', onclick: () => go(t.id) },
    h('i', { style: `background:hsl(${hueOf(t.title)} 55% 38%)` }), h('b', {}, t.title), h('span', { class: 'mono' }, [dateText(t), placeText(t)].filter(Boolean).join('  ·  '))))));
  return root;
}

/* separador Fotos */
function photoFig(t, p, onOpen) {
  return h('figure', {},
    h('button', { class: 'photo', type: 'button', 'aria-label': 'Abrir foto' + (p.caption ? ': ' + p.caption : ''), onclick: onOpen },
      h('img', { src: blobUrl(p.id), alt: p.caption || 'Foto de ' + t.title, loading: 'lazy', decoding: 'async', style: (p.w && p.h) ? `aspect-ratio:${p.w}/${p.h}` : null })),
    p.fav ? h('span', { class: 'heart', 'aria-label': 'Favorita' }, '♥') : null,
    p.caption ? h('figcaption', {}, p.caption) : null);
}
function renderPhotosTab() {
  const root = h('div');
  let all = [];
  for (const t of trips) for (const p of (t.photos || [])) all.push({ t, p, date: p.date || t.start || '' });
  if (!all.length) { root.append(h('div', { class: 'empty' }, h('h2', {}, 'Ainda não há fotos.'), h('p', {}, 'Abre uma viagem e junta as primeiras fotos, ou usa "Importar fotos" no topo.'))); return root; }
  const years = [...new Set(all.map(x => x.date.slice(0, 4)).filter(Boolean))].sort().reverse();
  if (ui.pYear && !years.includes(ui.pYear)) ui.pYear = '';
  root.append(h('div', { class: 'bar' },
    h('button', { class: 'chip', type: 'button', 'aria-pressed': ui.pFav ? 'true' : 'false', onclick: () => { ui.pFav = !ui.pFav; render(); } }, '♥ Favoritas'),
    h('div', { class: 'chips' }, h('button', { class: 'chip', type: 'button', 'aria-pressed': ui.pYear === '' ? 'true' : 'false', onclick: () => { ui.pYear = ''; render(); } }, 'Todos os anos'),
      years.map(y => h('button', { class: 'chip', type: 'button', 'aria-pressed': ui.pYear === y ? 'true' : 'false', onclick: () => { ui.pYear = y; render(); } }, y)))));
  all = all.filter(x => (!ui.pFav || x.p.fav) && (!ui.pYear || x.date.startsWith(ui.pYear))).sort((a, b) => b.date.localeCompare(a.date));
  if (!all.length) { root.append(h('p', { class: 'mono' }, 'Nenhuma foto corresponde ao filtro.')); return root; }
  const list = all.map(x => ({ tid: x.t.id, pid: x.p.id }));
  const idx = new Map(all.map((x, i) => [x.p.id, i]));
  const groups = new Map();
  for (const x of all) { const k = monthKey(x.date); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  for (const [k, items] of groups) {
    root.append(h('h2', { class: 'month-h' }, monthLabel(k)));
    root.append(h('div', { class: 'wall' }, items.map(x => photoFig(x.t, x.p, () => openLightbox(list, idx.get(x.p.id))))));
  }
  return root;
}

/* ---------- viagem ---------- */
function orderedPhotos(t) {
  const days = tripDays(t), photos = t.photos || [];
  const out = [];
  for (const d of days) for (const p of photos) if (p.date === d) out.push(p);
  for (const p of photos) if (!p.date || !days.includes(p.date)) out.push(p);
  return out;
}
function renderTrip() {
  const t = tripById(view.id);
  const root = h('div');
  root.append(h('button', { class: 'back', type: 'button', onclick: () => go(null) }, '← Todas as viagens'));
  if (!t) { root.append(h('p', { class: 'mono' }, loaded ? 'Esta viagem já não existe.' : 'A carregar viagem…')); return root; }
  const photos = t.photos || [];
  const dc = tripDayCount(t);
  const when = [dateText(t), dc > 1 ? pl(dc, 'dia', 'dias') : '', photos.length ? pl(photos.length, 'foto', 'fotos') : ''].filter(Boolean).join('  ·  ');
  const canUpload = canWrite && !!assets;
  root.append(h('header', { class: 'trip-head' },
    when ? h('p', { class: 'mono', style: 'margin:0' }, when) : null,
    h('h1', { style: 'margin:0' }, t.title),
    placeText(t) ? h('p', { class: 'where' }, placeText(t)) : null,
    (t.tags || []).length ? h('div', { class: 'tagline' }, t.tags.map(x => h('span', {}, x))) : null,
    t.note ? h('p', { class: 'note' }, t.note) : null,
    h('div', { class: 'row' },
      canUpload ? h('button', { class: 'btn primary', type: 'button', onclick: () => pickFiles(t.id) }, 'Adicionar fotos') : null,
      canWrite ? h('button', { class: 'btn quiet', type: 'button', onclick: () => openTripForm(t) }, 'Editar viagem') : null,
      canWrite ? h('button', { class: 'btn quiet', type: 'button', 'aria-pressed': t.fav ? 'true' : 'false', onclick: () => saveTrip(t.id, () => ({ fav: !t.fav })) }, '♥ Favorita') : null,
      h('button', { class: 'btn quiet', type: 'button', onclick: () => openBook(t.id) }, 'Ver como livro'),
      downloads ? h('button', { class: 'btn quiet', type: 'button', onclick: () => exportBook(t.id) }, 'Exportar livro') : null)));

  const pt = tripPoint(t);
  if (pt) {
    const dots = photos.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const m = createMap({ pins: [{ id: t.id, lat: pt.lat, lng: pt.lng, label: t.title }], dots, view: fitView([pt].concat(dots), 260), label: 'Mapa da viagem', onPin: () => {} });
    root.append(h('div', { class: 'trip-mini' }, m.el,
      h('p', { class: 'mono', style: 'margin:8px 0 0' }, pt.src === 'manual' ? 'Local marcado por ti.' : pt.src === 'fotos' ? 'Local calculado a partir do GPS das fotos' + (dots.length ? ` (${pl(dots.length, 'foto', 'fotos')} com GPS).` : '.') : 'Centro do país. Marca o sítio exato ao editar a viagem.')));
  }

  const days = tripDays(t);
  const byDay = new Map(), loose = [];
  for (const p of photos) { if (p.date && days.includes(p.date)) { if (!byDay.has(p.date)) byDay.set(p.date, []); byDay.get(p.date).push(p); } else loose.push(p); }
  const order = orderedPhotos(t).map(p => ({ tid: t.id, pid: p.id }));
  const openAt = p => openLightbox(order, order.findIndex(x => x.pid === p.id));
  const showAll = days.length <= 45;
  const blocks = h('div', { class: 'days' });
  for (const d of days) {
    const text = (t.days || {})[d] || '', ps = byDay.get(d) || [];
    if (!showAll && !text && !ps.length) continue;
    if (!canWrite && !text && !ps.length) continue;
    const n = t.start && parseYmd(t.start) ? diffDays(t.start, d) + 1 : null;
    const empty = !text && !ps.length;
    const blk = h('section', { class: 'day' + (empty ? ' empty-day' : '') },
      h('div', { class: 'day-h' }, n && n >= 1 ? h('b', {}, 'Dia ' + n) : null, h('span', { class: 'mono' }, dfmtLong.format(parseYmd(d)))));
    if (canWrite) {
      const ta = h('textarea', { class: 'input', id: 'day-' + d, 'aria-label': 'Nota do dia ' + d, placeholder: 'O que aconteceu neste dia?', style: empty ? 'min-height:44px' : null,
        onchange: e => { const v = e.target.value.trim(); saveTrip(t.id, () => ({ days: { [d]: v } })); } });
      ta.value = text; blk.append(ta);
    } else if (text) blk.append(h('p', { class: 'txt' }, text));
    if (ps.length) blk.append(h('div', { class: 'wall' }, ps.map(p => photoFig(t, p, () => openAt(p)))));
    blocks.append(blk);
  }
  if (loose.length) {
    const wall = h('div', { class: 'wall' }, loose.map(p => photoFig(t, p, () => openAt(p))));
    if (canUpload) wireDrop(wall, t.id);
    blocks.append(h('section', { class: 'day' }, h('div', { class: 'day-h' }, h('b', {}, days.length ? 'Fotos sem dia' : 'Fotos')), wall));
  }
  if (!photos.length) {
    const drop = h('div', { class: 'drop' },
      h('p', {}, canUpload ? 'Ainda sem fotos. Arrasta imagens para aqui ou escolhe-as no dispositivo. Leio a data e o GPS que estiverem guardados nelas.' : 'Esta viagem ainda não tem fotos.'),
      canUpload ? h('button', { class: 'btn primary', type: 'button', onclick: () => pickFiles(t.id) }, 'Escolher fotos') : null);
    if (canUpload) wireDrop(drop, t.id);
    blocks.append(drop);
  }
  root.append(blocks);
  return root;
}
function wireDrop(el, tripId) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('over');
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) addPhotos(tripId, files);
  });
}

/* ---------- render e navegação ---------- */
function render() {
  const y = window.scrollY;
  $('#app').replaceChildren(view.name === 'trip' ? renderTrip() : renderHome());
  window.scrollTo(0, y);
}
const SAFE = /^[A-Za-z0-9-]+$/;
function go(id) {
  if (id && SAFE.test(id)) location.hash = 'viagem-' + id;
  else if (id) { view = { name: 'trip', id }; render(); window.scrollTo(0, 0); }
  else location.hash = ui.tab;
}
function applyHash() {
  const hs = location.hash.slice(1);
  const m = hs.match(/^viagem-([A-Za-z0-9-]+)$/);
  let nv = view;
  if (m) nv = { name: 'trip', id: m[1] };
  else { if (TABS.some(([k]) => k === hs)) ui.tab = hs; nv = { name: 'home', id: null }; }
  const changed = nv.name !== view.name || nv.id !== view.id;
  view = nv;
  if (changed) { closeLightbox(); closeModal(); closeBook(); window.scrollTo(0, 0); }
  render();
}
window.addEventListener('hashchange', applyHash);

/* ---------- gravação ---------- */
function saveTrip(tripId, build) {
  return enqueue(tripId, async () => {
    const t = tripById(tripId);
    if (!t) return false;
    const patch = build(t);
    if (!patch) return false;
    try { await db.doc('trips/' + tripId).update(patch); return true; }
    catch (e) { setStatus('Não foi possível guardar. Tenta outra vez.', 4000); return false; }
  });
}

/* ---------- fotos: leitura, envio ---------- */
const fileInput = $('#file-input');
const importInput = $('#import-input');
let pickTarget = null;
function pickFiles(tripId) { pickTarget = tripId; fileInput.click(); }
function pickImport() { importInput.click(); }
fileInput.addEventListener('change', () => {
  const files = [...fileInput.files].filter(f => f.type.startsWith('image/'));
  fileInput.value = '';
  if (files.length && pickTarget) addPhotos(pickTarget, files);
});
importInput.addEventListener('change', () => {
  const files = [...importInput.files].filter(f => f.type.startsWith('image/'));
  importInput.value = '';
  if (files.length) openImport(files);
});

async function readExif(file) {
  try { return parseExif(await file.slice(0, 262144).arrayBuffer()); } catch (e) { return null; }
}
async function prepare(file) {
  if (file.type === 'image/gif') return { blob: file, w: 0, h: 0 };
  try {
    const bmp = await createImageBitmap(file);
    const max = 2400, w0 = bmp.width, h0 = bmp.height;
    const s = Math.min(1, max / Math.max(w0, h0));
    if (s === 1 && file.type === 'image/jpeg' && file.size < 3e6) { bmp.close && bmp.close(); return { blob: file, w: w0, h: h0 }; }
    const w = Math.round(w0 * s), hh = Math.round(h0 * s);
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
    ctx.drawImage(bmp, 0, 0, w, hh);
    bmp.close && bmp.close();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
    if (blob) return { blob, w, h: hh };
  } catch (e) { /* tenta o original */ }
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return { blob: file, w: 0, h: 0 };
  throw { code: 'unsupported_type' };
}
const upMsg = {
  too_large: 'Uma foto é demasiado grande.',
  quota_or_state: 'O espaço do álbum está cheio.',
  rate_limited: 'Demasiados envios seguidos. Espera um momento.',
  unsupported_type: 'Formato de imagem não suportado.'
};

/* envia ficheiros e junta-os a uma viagem; entries: [{file, date, lat, lng}] */
async function addEntries(tripId, entries, label) {
  const added = []; let failMsg = '';
  for (let i = 0; i < entries.length; i++) {
    setStatus(`${label || 'A enviar'} foto ${i + 1} de ${entries.length}…`);
    try {
      const { blob, w, h: hh } = await prepare(entries[i].file);
      const r = await assets.upload(blob);
      const rec = { id: r.id, w, h: hh, caption: '' };
      if (entries[i].date) rec.date = entries[i].date;
      if (Number.isFinite(entries[i].lat) && Number.isFinite(entries[i].lng)) { rec.lat = Math.round(entries[i].lat * 1e5) / 1e5; rec.lng = Math.round(entries[i].lng * 1e5) / 1e5; }
      added.push(rec);
    } catch (e) {
      failMsg = upMsg[e && e.code] || 'Não foi possível enviar uma das fotos.';
      if (e && (e.code === 'quota_or_state' || e.code === 'rate_limited')) break;
    }
  }
  let ok = true, filled = false;
  if (added.length) {
    ok = await saveTrip(tripId, t => {
      const patch = { photos: (t.photos || []).concat(added), cover: coverId(t) || added[0].id };
      const ds = added.map(p => p.date).filter(Boolean).sort();
      if (ds.length && !parseYmd(t.start)) { patch.start = ds[0]; patch.end = ds[ds.length - 1]; filled = true; }
      return patch;
    });
  }
  return { added: added.length, ok, failMsg, filled };
}
async function addPhotos(tripId, files) {
  if (!assets || uploading) return;
  uploading = true;
  try {
    const entries = [];
    for (const f of files) { const ex = await readExif(f); entries.push({ file: f, date: ex && ex.date || '', lat: ex ? ex.lat : null, lng: ex ? ex.lng : null }); }
    const r = await addEntries(tripId, entries);
    if (r.added) setStatus((r.ok ? pl(r.added, 'foto guardada', 'fotos guardadas') + '.' : 'Fotos enviadas, mas não ficaram associadas à viagem.') + (r.failMsg ? ' ' + r.failMsg : '') + (r.filled ? ' Preenchi as datas da viagem.' : ''), 5000);
    else setStatus(r.failMsg || 'Nenhuma foto enviada.', 4500);
  } finally { uploading = false; }
}

/* ---------- importar fotos e propor viagens ---------- */
async function openImport(files) {
  if (!canWrite || !assets || uploading) return;
  const items = [];
  for (let i = 0; i < files.length; i++) {
    if (i % 8 === 0) setStatus(`A ler as fotos ${i + 1} a ${Math.min(files.length, i + 8)} de ${files.length}…`);
    const f = files[i], ex = await readExif(f);
    items.push({ file: f, date: (ex && ex.date) || localYmd(new Date(f.lastModified || Date.now())), time: (ex && ex.time) || '', lat: ex ? ex.lat : null, lng: ex ? ex.lng : null, exif: !!(ex && ex.date) });
  }
  setStatus(null);
  const urls = [];
  const props = groupByDate(items, 2).map(g => {
    const gps = g.items.filter(x => x.lat != null);
    const lat = gps.length ? median(gps.map(x => x.lat)) : null, lng = gps.length ? median(gps.map(x => x.lng)) : null;
    const c = lat != null ? nearestCountry(lat, lng) : null;
    const a = parseYmd(g.start);
    return { on: true, start: g.start, end: g.end, items: g.items, country: c ? c.name : '', gps: gps.length, title: `${c ? c.name : 'Viagem'} · ${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}` };
  });
  lastFocus = document.activeElement;
  const err = h('p', { class: 'err', role: 'alert', hidden: true });
  const list = h('div');
  const createBtn = h('button', { class: 'btn primary', type: 'button' });
  const dl = h('datalist', { id: 'countries-dl' }, COUNTRIES.map(c => h('option', { value: c.name })));
  const refresh = () => { const n = props.filter(p => p.on).length; createBtn.textContent = n ? `Criar ${pl(n, 'viagem', 'viagens')}` : 'Nada selecionado'; createBtn.disabled = !n; };
  props.forEach((p, i) => {
    const thumbs = p.items.slice(0, 8).map(x => { const u = URL.createObjectURL(x.file); urls.push(u); return h('img', { src: u, alt: '' }); });
    const row = h('div', { class: 'proposal' },
      h('div', { class: 'head' },
        h('input', { type: 'checkbox', checked: true, 'aria-label': 'Incluir esta viagem', onchange: e => { p.on = e.target.checked; row.classList.toggle('off', !p.on); refresh(); } }),
        h('input', { class: 'input', type: 'text', maxlength: '80', value: p.title, 'aria-label': 'Título', oninput: e => { p.title = e.target.value; } })),
      h('div', { class: 'two' },
        h('div', { class: 'f' }, h('label', {}, 'PAÍS'), h('input', { class: 'input', type: 'text', list: 'countries-dl', maxlength: '60', value: p.country, oninput: e => { p.country = e.target.value; } })),
        h('div', { class: 'f' }, h('label', {}, 'DATAS'), h('div', { class: 'mono', style: 'min-height:44px;display:flex;align-items:center' }, dateText({ start: p.start, end: p.end })))),
      h('p', { class: 'mono', style: 'margin:0' }, pl(p.items.length, 'foto', 'fotos') + (p.gps ? ` · ${pl(p.gps, 'foto', 'fotos')} com GPS` : ' · sem GPS') + (p.items.some(x => !x.exif) ? ' · algumas sem data própria (uso a data do ficheiro)' : '')),
      h('div', { class: 'thumbs' }, thumbs));
    list.append(row);
  });
  refresh();
  const close = () => { urls.forEach(u => URL.revokeObjectURL(u)); closeModal(); };
  createBtn.addEventListener('click', async () => {
    const chosen = props.filter(p => p.on);
    if (!chosen.length) return;
    createBtn.disabled = true; uploading = true; err.hidden = true;
    let firstId = null, made = 0, lost = 0;
    try {
      for (let i = 0; i < chosen.length; i++) {
        const p = chosen[i];
        const ref = await db.collection('trips').add({ title: p.title.trim() || 'Viagem', place: '', country: p.country.trim(), start: p.start, end: p.end, note: '', tags: [], photos: [], cover: null, days: {}, createdAt: new Date().toISOString() });
        if (!firstId) firstId = ref.id;
        made++;
        await new Promise(r => setTimeout(r, 0));
        const r = await addEntries(ref.id, p.items.map(x => ({ file: x.file, date: x.date, lat: x.lat, lng: x.lng })), `Viagem ${i + 1} de ${chosen.length}: a enviar`);
        lost += p.items.length - r.added;
        if (r.failMsg && /espaço|Demasiados/.test(r.failMsg)) { err.textContent = r.failMsg; err.hidden = false; break; }
      }
    } catch (e) { err.textContent = 'Não foi possível criar as viagens. Tenta outra vez.'; err.hidden = false; }
    uploading = false; setStatus(null);
    if (made) { setStatus(`${pl(made, 'viagem criada', 'viagens criadas')}.` + (lost ? ` ${pl(lost, 'foto não foi enviada', 'fotos não foram enviadas')}.` : ''), 5000); close(); ui.tab = 'viagens'; if (made === 1 && firstId) go(firstId); else location.hash = 'viagens'; }
    else createBtn.disabled = false;
  });
  modal = h('div', { class: 'backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Importar fotos', onmousedown: e => { if (e.target === modal && !uploading) close(); } },
    h('div', { class: 'panel wide' }, h('h2', {}, 'Importar fotos'),
      h('p', { class: 'help' }, `Li ${pl(items.length, 'foto', 'fotos')} e agrupei-as em ${pl(props.length, 'viagem', 'viagens')} possíveis: fotos com mais de 2 dias de intervalo ficam em viagens diferentes. O país é uma sugestão a partir do GPS, confirma-o.`),
      dl, list, err,
      h('div', { class: 'actions' }, createBtn, h('button', { class: 'btn quiet', type: 'button', onclick: () => { if (!uploading) close(); } }, 'Cancelar'))));
  lockScroll(); document.body.append(modal);
}

/* ---------- visualizador de fotos ---------- */
function lbItem(i) {
  const it = lb.list[i]; if (!it) return null;
  const t = tripById(it.tid); const p = t && (t.photos || []).find(x => x.id === it.pid);
  return p ? { t, p } : null;
}
function openLightbox(list, i) {
  if (!list.length) return;
  lastFocus = document.activeElement;
  lb = { list: list.slice(), i: Math.max(0, i), confirm: false, el: null };
  lockScroll(); drawLightbox();
}
function closeLightbox() {
  if (!lb) return;
  lb.el && lb.el.remove(); lb = null; unlockScroll();
  lastFocus && lastFocus.focus && lastFocus.focus();
}
function lbStep(d) { if (!lb || lb.list.length < 2) return; lb.i = (lb.i + d + lb.list.length) % lb.list.length; lb.confirm = false; drawLightbox(); }
function drawLightbox() {
  if (!lb) return;
  lb.list = lb.list.filter((_, i) => { const keep = !!lbItem(i); return keep; });
  if (!lb.list.length) { closeLightbox(); return; }
  lb.i = Math.min(lb.i, lb.list.length - 1);
  const { t, p } = lbItem(lb.i);
  if (lb.el && document.activeElement && ['cap-input', 'date-input'].includes(document.activeElement.id)) return;
  const isCover = coverId(t) === p.id;
  const n = lb.list.length;
  const metaBits = [p.date ? dfmt.format(parseYmd(p.date)) : '', (Number.isFinite(p.lat) && Number.isFinite(p.lng)) ? 'com GPS' : ''].filter(Boolean).join('  ·  ');
  const el = h('div', { class: 'lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Foto ' + (lb.i + 1) + ' de ' + n },
    h('div', { class: 'bar' },
      h('span', { class: 'mono' }, `${lb.i + 1} / ${n}  ·  ${t.title}`),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', type: 'button', onclick: () => { const id = t.id; closeLightbox(); go(id); } }, 'Abrir viagem'),
        h('button', { class: 'btn sm', type: 'button', id: 'lb-close', onclick: closeLightbox }, 'Fechar'))),
    h('div', { class: 'stage' },
      h('img', { src: blobUrl(p.id), alt: p.caption || 'Foto de ' + t.title }),
      n > 1 ? h('button', { class: 'btn nav prev', type: 'button', 'aria-label': 'Foto anterior', onclick: () => lbStep(-1) }, '←') : null,
      n > 1 ? h('button', { class: 'btn nav next', type: 'button', 'aria-label': 'Foto seguinte', onclick: () => lbStep(1) }, '→') : null),
    h('div', { class: 'foot' },
      canWrite
        ? h('input', { class: 'input', id: 'cap-input', type: 'text', maxlength: '160', placeholder: 'Escreve uma legenda', value: p.caption || '', 'aria-label': 'Legenda da foto',
            onchange: e => { const v = e.target.value.trim(); saveTrip(t.id, cur => ({ photos: (cur.photos || []).map(x => x.id === p.id ? { ...x, caption: v } : x) })); } })
        : h('p', { class: 'cap' }, p.caption || ''),
      !canWrite && metaBits ? h('p', { class: 'mono meta' }, metaBits) : null,
      canWrite ? h('div', { class: 'row', style: 'justify-content:center' },
        h('button', { class: 'btn sm', type: 'button', 'aria-pressed': p.fav ? 'true' : 'false', onclick: () => saveTrip(t.id, cur => ({ photos: (cur.photos || []).map(x => x.id === p.id ? { ...x, fav: !x.fav } : x) })) }, '♥ Favorita'),
        h('label', { class: 'mono', for: 'date-input', style: 'color:inherit' }, 'Dia'),
        h('input', { class: 'input', id: 'date-input', type: 'date', style: 'width:auto;min-height:36px', value: p.date || '', 'aria-label': 'Dia da foto',
          onchange: e => { const v = e.target.value; saveTrip(t.id, cur => ({ photos: (cur.photos || []).map(x => { if (x.id !== p.id) return x; const y = { ...x }; if (v) y.date = v; else delete y.date; return y; }) })); } }),
        h('button', { class: 'btn sm', type: 'button', disabled: isCover, onclick: async () => { const ok = await saveTrip(t.id, () => ({ cover: p.id })); if (ok) setStatus('Capa atualizada.', 2500); } }, isCover ? 'É a capa' : 'Definir como capa'),
        h('button', { class: 'btn sm danger', type: 'button', onclick: () => deletePhoto(t, p) }, lb.confirm ? 'Confirmar: apagar para sempre' : 'Apagar foto')) : null));
  lb.el && lb.el.remove();
  lb.el = el; document.body.append(el);
  const focusId = lb.refocus; lb.refocus = null;
  (focusId && $('#' + focusId, el) || $('#lb-close', el)).focus();
}
async function deletePhoto(t, p) {
  if (!lb.confirm) { lb.confirm = true; drawLightbox(); return; }
  const ok = await saveTrip(t.id, cur => {
    const rest = (cur.photos || []).filter(x => x.id !== p.id);
    return { photos: rest, cover: coverId({ ...cur, photos: rest }) };
  });
  if (!ok) { if (lb) { lb.confirm = false; drawLightbox(); } return; }
  if (assets) { try { await assets.delete(p.id); } catch (e) { /* o ficheiro fica órfão, sem impacto */ } }
  if (lb) { lb.confirm = false; drawLightbox(); }
  setStatus('Foto apagada.', 2500);
}

/* ---------- formulário de viagem ---------- */
function closeModal() {
  if (!modal) return;
  modal.remove(); modal = null; unlockScroll();
  lastFocus && lastFocus.focus && lastFocus.focus();
}
function field(id, label, input) { return h('div', { class: 'f' }, h('label', { for: id }, label), input); }

function openTripForm(t) {
  if (!canWrite || !db) return;
  lastFocus = document.activeElement;
  const editing = !!t;
  const err = h('p', { class: 'err', role: 'alert', hidden: true });
  const f = {
    title: h('input', { class: 'input', id: 'f-title', type: 'text', maxlength: '80', value: editing ? t.title : '', placeholder: 'Ex.: Dolomitas' }),
    place: h('input', { class: 'input', id: 'f-place', type: 'text', maxlength: '80', value: editing ? (t.place || '') : '', placeholder: 'Cidade ou região' }),
    country: h('input', { class: 'input', id: 'f-country', type: 'text', list: 'countries-dl', maxlength: '60', value: editing ? (t.country || '') : '', placeholder: 'País' }),
    start: h('input', { class: 'input', id: 'f-start', type: 'date', value: editing ? (t.start || '') : '' }),
    end: h('input', { class: 'input', id: 'f-end', type: 'date', value: editing ? (t.end || '') : '' }),
    tags: h('input', { class: 'input', id: 'f-tags', type: 'text', maxlength: '120', value: editing ? (t.tags || []).join(', ') : '', placeholder: 'praia, cidade, família' }),
    note: h('textarea', { class: 'input', id: 'f-note', maxlength: '2000', placeholder: 'O que queres lembrar desta viagem?' })
  };
  f.note.value = editing ? (t.note || '') : '';
  let pick = editing && Number.isFinite(t.lat) && Number.isFinite(t.lng) ? { lat: t.lat, lng: t.lng } : null;
  const locInfo = h('span', { class: 'mono' });
  const showLoc = () => {
    const c = findCountry(f.country.value);
    locInfo.textContent = pick ? `Marcado: ${pick.lat.toFixed(2)}, ${pick.lng.toFixed(2)}` : c ? `Sem marca: uso o centro de ${c.name}. Toca no mapa para marcar o sítio.` : 'Toca no mapa para marcar o sítio, ou indica o país.';
  };
  const picker = createMap({ pins: [], view: pick ? fitView([pick], 300) : { x: 0, y: 0, w: MAP_W }, pick, label: 'Escolher o local no mapa', onPick: (la, lo) => { pick = { lat: la, lng: lo }; picker.setPick(pick); showLoc(); } });
  f.country.addEventListener('input', showLoc);
  showLoc();
  const clearLoc = h('button', { class: 'btn sm quiet', type: 'button', onclick: () => { pick = null; picker.setPick(null); showLoc(); } }, 'Limpar marca');
  const dl = h('datalist', { id: 'countries-dl' }, COUNTRIES.map(c => h('option', { value: c.name })));

  const delBox = h('div', { class: 'row' });
  let confirmDel = false;
  const delBtn = h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (!confirmDel) { confirmDel = true; delBtn.textContent = `Confirmar: apagar viagem e ${pl((t.photos || []).length, 'foto', 'fotos')}`; return; }
    delBtn.disabled = true; delBtn.textContent = 'A apagar…';
    try {
      await enqueue(t.id, async () => {
        await db.doc('trips/' + t.id).delete();
        if (assets) for (const p of (t.photos || [])) { try { await assets.delete(p.id); } catch (e) { /* ignora */ } }
      });
      closeModal(); go(null); setStatus('Viagem apagada.', 2500);
    } catch (e) { delBtn.disabled = false; delBtn.textContent = 'Apagar viagem'; confirmDel = false; err.textContent = 'Não foi possível apagar. Tenta outra vez.'; err.hidden = false; }
  } }, 'Apagar viagem');
  if (editing) delBox.append(delBtn);

  const saveBtn = h('button', { class: 'btn primary', type: 'submit' }, editing ? 'Guardar' : 'Criar viagem');
  const form = h('form', { novalidate: true,
    onsubmit: async e => {
      e.preventDefault();
      const data = {
        title: f.title.value.trim(), place: f.place.value.trim(), country: f.country.value.trim(),
        start: f.start.value, end: f.end.value, note: f.note.value.trim(),
        tags: [...new Set(f.tags.value.split(',').map(x => x.trim()).filter(Boolean))].slice(0, 12)
      };
      if (!data.title) { err.textContent = 'Dá um título à viagem.'; err.hidden = false; f.title.focus(); return; }
      if (data.start && data.end && data.end < data.start) { err.textContent = 'A data de regresso é anterior à de partida.'; err.hidden = false; f.end.focus(); return; }
      err.hidden = true; saveBtn.disabled = true;
      try {
        if (editing) {
          const patch = { ...data, lat: pick ? pick.lat : null, lng: pick ? pick.lng : null };
          await enqueue(t.id, () => db.doc('trips/' + t.id).update(patch));
          closeModal();
        } else {
          const doc = { ...data, photos: [], cover: null, days: {}, createdAt: new Date().toISOString() };
          if (pick) { doc.lat = pick.lat; doc.lng = pick.lng; }
          const ref = await db.collection('trips').add(doc);
          closeModal(); go(ref.id);
        }
      } catch (e2) {
        saveBtn.disabled = false;
        err.textContent = 'Não foi possível guardar. Tenta outra vez.'; err.hidden = false;
      }
    } },
    field('f-title', 'TÍTULO', f.title),
    h('div', { class: 'two' }, field('f-place', 'LOCAL', f.place), field('f-country', 'PAÍS', f.country)),
    h('div', { class: 'two' }, field('f-start', 'PARTIDA', f.start), field('f-end', 'REGRESSO', f.end)),
    h('div', { class: 'f' }, h('label', {}, 'LOCALIZAÇÃO NO MAPA'), picker.el, h('div', { class: 'locrow' }, locInfo, clearLoc)),
    field('f-tags', 'ETIQUETAS (SEPARADAS POR VÍRGULAS)', f.tags),
    field('f-note', 'NOTA', f.note),
    dl, err,
    h('div', { class: 'actions' },
      h('div', { class: 'row' }, saveBtn, h('button', { class: 'btn quiet', type: 'button', onclick: closeModal }, 'Cancelar')),
      delBox));
  modal = h('div', { class: 'backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': editing ? 'Editar viagem' : 'Nova viagem',
    onmousedown: e => { if (e.target === modal) closeModal(); } },
    h('div', { class: 'panel' }, h('h2', {}, editing ? 'Editar viagem' : 'Nova viagem'), form));
  lockScroll();
  document.body.append(modal);
  f.title.focus();
}

/* ---------- livro ---------- */
function bookPages(t) {
  const pages = [{ k: 'cover' }];
  if (tripPoint(t)) pages.push({ k: 'map' });
  const photos = t.photos || [], days = tripDays(t), byDay = new Map(), loose = [];
  for (const p of photos) { if (p.date && days.includes(p.date)) { if (!byDay.has(p.date)) byDay.set(p.date, []); byDay.get(p.date).push(p); } else loose.push(p); }
  for (const d of days) {
    const ps = byDay.get(d) || [], text = ((t.days || {})[d] || '').trim();
    if (!ps.length && !text) continue;
    const n = t.start && parseYmd(t.start) ? diffDays(t.start, d) + 1 : null;
    if (text.length > 650 || !ps.length) { pages.push({ k: 'day', date: d, n, text, photos: [], solo: true }); chunk(ps, 4).forEach(c => pages.push({ k: 'day', date: d, n, text: '', photos: c })); }
    else chunk(ps, 4).forEach((c, i) => pages.push({ k: 'day', date: d, n, text: i === 0 ? text : '', photos: c }));
  }
  chunk(loose, 4).forEach(c => pages.push({ k: 'day', date: '', n: null, text: '', photos: c, more: true }));
  pages.push({ k: 'end' });
  return pages;
}
function layoutOf(ps) {
  if (ps.length === 1) return 'l1';
  if (ps.length === 2) { const portrait = ps.filter(p => p.h > p.w).length; return portrait === 2 ? 'l2h' : portrait === 0 ? 'l2v' : 'l2h'; }
  return ps.length === 3 ? 'l3' : 'l4';
}
function pageHTML(pg, t, ctx) {
  const dc = tripDayCount(t), n = (t.photos || []).length;
  if (pg.k === 'cover') {
    const cid = coverId(t);
    const bg = cid ? `<img class="bg" src="${esc(ctx.src(cid))}" alt="">` : `<div style="position:absolute;inset:0;background:linear-gradient(145deg,hsl(${hueOf(t.title)} 38% 34%),hsl(${(hueOf(t.title) + 38) % 360} 42% 26%))"></div>`;
    return `<div class="pg cover">${bg}<div class="shade"></div><div class="t"><span class="mn">${esc([dateText(t), dc > 1 ? pl(dc, 'dia', 'dias') : ''].filter(Boolean).join('  ·  '))}</span><h2>${esc(t.title)}</h2>${placeText(t) ? `<p class="sub">${esc(placeText(t))}</p>` : ''}</div></div>`;
  }
  if (pg.k === 'map') return `<div class="pg mp"><div><h2>Onde</h2><span class="mn">${esc(placeText(t) || t.title)}</span>${(t.tags || []).length ? `<p class="mn" style="margin-top:1.4cqw">${esc(t.tags.join(' · '))}</p>` : ''}${t.note ? `<p style="margin-top:1.6cqw;white-space:pre-wrap;overflow:hidden;max-height:34cqw">${esc(t.note)}</p>` : ''}</div><div class="mapw">${ctx.mapSVG}</div></div>`;
  if (pg.k === 'end') return `<div class="pg end"><div class="inner"><h2>${esc(t.title)}</h2><div class="nums"><div><b>${dc || tripDays(t).length || 1}</b><span>${dc === 1 ? 'dia' : 'dias'}</span></div><div><b>${n}</b><span>${n === 1 ? 'foto' : 'fotos'}</span></div></div><span class="mn" style="color:#9bada8">${esc(dateText(t))}</span></div></div>`;
  const label = pg.date ? `${pg.n && pg.n >= 1 ? `<b>Dia ${pg.n}</b>` : ''}<span class="mn">${esc(dfmtLong.format(parseYmd(pg.date)))}</span>` : `<b>${pg.more ? 'Mais fotos' : ''}</b>`;
  const hasTxt = !!pg.text, solo = pg.solo;
  const ph = pg.photos.length ? `<div class="ph ${layoutOf(pg.photos)}">${pg.photos.map(p => `<img src="${esc(ctx.src(p.id))}" alt="${esc(p.caption || '')}">`).join('')}</div>` : '';
  return `<div class="pg day${hasTxt && !solo ? ' has-txt' : ''}${solo ? ' only-txt' : ''}"><div class="hd">${label}</div><div class="bd">${hasTxt ? `<div class="tx">${esc(pg.text)}</div>` : ''}${ph}</div></div>`;
}
function openBook(tid) {
  const t = tripById(tid); if (!t) return;
  lastFocus = document.activeElement;
  bk = { tid, i: 0, pages: bookPages(t), map: mapSVGString(t), el: null };
  lockScroll(); drawBook();
}
function closeBook() {
  if (!bk) return;
  bk.el && bk.el.remove(); bk = null; unlockScroll();
  lastFocus && lastFocus.focus && lastFocus.focus();
}
function bkStep(d) { if (!bk) return; bk.i = Math.max(0, Math.min(bk.pages.length - 1, bk.i + d)); drawBook(); }
function drawBook() {
  if (!bk) return;
  const t = tripById(bk.tid);
  if (!t) { closeBook(); return; }
  const stage = h('div', { class: 'stagebox' });
  stage.innerHTML = pageHTML(bk.pages[bk.i], t, { src: blobUrl, mapSVG: bk.map });
  const el = h('div', { class: 'bk', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Livro: ' + t.title },
    h('div', { class: 'bar' }, h('span', { class: 'mono' }, `${t.title}  ·  página ${bk.i + 1} de ${bk.pages.length}`),
      h('div', { class: 'row' },
        downloads ? h('button', { class: 'btn sm', type: 'button', onclick: () => exportBook(t.id) }, 'Exportar') : null,
        h('button', { class: 'btn sm', type: 'button', id: 'bk-close', onclick: closeBook }, 'Fechar'))),
    stage,
    h('div', { class: 'foot' },
      h('button', { class: 'btn', type: 'button', disabled: bk.i === 0, onclick: () => bkStep(-1) }, '← Anterior'),
      h('button', { class: 'btn', type: 'button', disabled: bk.i === bk.pages.length - 1, onclick: () => bkStep(1) }, 'Seguinte →')));
  bk.el && bk.el.remove();
  bk.el = el; document.body.append(el);
  $('#bk-close', el).focus();
}
async function toDataUrl(id, max) {
  const r = await fetch(blobUrl(id));
  if (!r.ok) throw new Error('foto');
  const bmp = await createImageBitmap(await r.blob());
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  return c.toDataURL('image/jpeg', 0.82);
}
let exporting = false;
async function exportBook(tid) {
  const t = tripById(tid);
  if (!t || !downloads || exporting) return;
  exporting = true;
  try {
    const pages = bookPages(t), ids = [...new Set(pages.flatMap(p => p.k === 'cover' ? [coverId(t)].filter(Boolean) : (p.photos || []).map(x => x.id)))];
    const cache = new Map();
    for (let i = 0; i < ids.length; i++) {
      setStatus(`A preparar o livro: foto ${i + 1} de ${ids.length}…`);
      try { cache.set(ids[i], await toDataUrl(ids[i], 1600)); } catch (e) { cache.set(ids[i], ''); }
    }
    const ctx = { src: id => cache.get(id) || '', mapSVG: mapSVGString(t) };
    const css = '@page{size:297mm 210mm;margin:0}*{box-sizing:border-box}body{margin:0;background:#cfd6d3;font-family:"Source Sans 3",system-ui,sans-serif;padding:24px 0}.note{max-width:880px;margin:0 auto 20px;padding:0 16px;font-size:14px;color:#33413d}.pg{width:min(100%,1100px);margin:0 auto 24px}@media print{body{background:#fff;padding:0}.note{display:none}.pg{width:297mm;height:210mm;margin:0;box-shadow:none;break-after:page;page-break-after:always}}';
    const html = `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Source+Sans+3:wght@400;600&family=DM+Mono:wght@400;500&display=swap"><style>${BOOK_CSS}${css}</style></head><body><p class="note">Livro de viagem: ${esc(t.title)}. Para obter um PDF ou imprimir, usa Imprimir no navegador e escolhe "Guardar como PDF" com margens a zero e gráficos de fundo ativos.</p>${pages.map(p => pageHTML(p, t, ctx)).join('\n')}</body></html>`;
    setStatus('A preparar o ficheiro…');
    await downloads.save({ filename: slug(t.title) + '-livro.html', data: new Blob([html], { type: 'text/html' }) });
    setStatus('Livro guardado.', 3000);
  } catch (e) {
    setStatus(e && e.code === 'declined' ? null : 'Não foi possível guardar o livro.', 4000);
  } finally { exporting = false; }
}

/* ---------- teclado ---------- */
document.addEventListener('keydown', e => {
  const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (e.key === 'Escape') { if (modal) { if (!uploading) closeModal(); } else if (bk) closeBook(); else if (lb) closeLightbox(); }
  else if (!modal && !typing) {
    if (lb) { if (e.key === 'ArrowLeft') lbStep(-1); else if (e.key === 'ArrowRight') lbStep(1); }
    else if (bk) { if (e.key === 'ArrowLeft') bkStep(-1); else if (e.key === 'ArrowRight') bkStep(1); }
  }
});

/* ---------- arranque ---------- */
async function init() {
  try { ui.discreet = !!localStorage.getItem('album-discreto'); } catch (e) { /* sem armazenamento */ }
  document.body.classList.toggle('discreet', ui.discreet);
  applyHash();
  const api = window.claude;
  const slowTimer = setTimeout(() => { if (!loaded) { slow = true; render(); } }, 10000);
  try { db = api && api.use ? await api.use('db') : null; } catch (e) { db = null; }
  if (!db) { clearTimeout(slowTimer); noDb = true; loaded = true; render(); return; }

  Promise.all([
    api.use('user').catch(() => null),
    api.use('assets').catch(() => null),
    api.use('downloads').catch(() => null)
  ]).then(([user, a, d]) => {
    assets = a || null; downloads = d || null;
    canWrite = user ? !!user.canEdit() : !!assets;
    render();
  });

  db.collection('trips').onSnapshot(snap => {
    clearTimeout(slowTimer); slow = false; loadError = false;
    const datas = snap.docs.map(d => d.data()), ids = snap.docs.map(d => d.id);
    const same = loaded && datas.length === lastDatas.length && datas.every((x, i) => x === lastDatas[i]) && ids.every((x, i) => x === lastIds[i]);
    lastDatas = datas; lastIds = ids;
    trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const first = !loaded; loaded = true;
    if (first) { const ys = trips.map(t => +(t.start || '').slice(0, 4)).filter(Boolean); if (ys.length) ui.year = Math.max(...ys); }
    if (!same || first) { render(); if (lb) drawLightbox(); if (bk) drawBook(); }
  }, () => { clearTimeout(slowTimer); loadError = true; loaded = true; render(); });
}
init();
