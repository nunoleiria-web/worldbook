/* ===== lib.js: funções puras (projeção, datas, EXIF, países, agrupamento) ===== */
const DEG = Math.PI / 180;
const MAP_W = 1000, LAT_TOP = 84, LAT_BOT = -58;

/* Projeção Natural Earth 1 */
function neX(lat, lon) {
  const p = lat * DEG, p2 = p * p, p4 = p2 * p2;
  return lon * DEG * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
}
function neY(lat) {
  const p = lat * DEG, p2 = p * p, p4 = p2 * p2;
  return p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
}
const MAP_K = MAP_W / (2 * neX(0, 180));
const MAP_YTOP = MAP_K * neY(LAT_TOP);
const MAP_H = MAP_K * (neY(LAT_TOP) - neY(LAT_BOT));
function project(lon, lat) {
  return [MAP_W / 2 + MAP_K * neX(lat, lon), MAP_YTOP - MAP_K * neY(lat)];
}
function unproject(px, py) {
  const y = (MAP_YTOP - py) / MAP_K, x = (px - MAP_W / 2) / MAP_K;
  let p = y;
  for (let i = 0; i < 40; i++) {
    const p2 = p * p, p6 = p2 * p2 * p2, p8 = p6 * p2, p10 = p8 * p2, p11 = p10 * p;
    const f = 1.007226 * p + 0.015085 * p2 * p - 0.044475 * p6 * p + 0.028874 * p8 * p - 0.005916 * p11 - y;
    const d = 1.007226 + 0.045255 * p2 - 0.311325 * p6 + 0.259866 * p8 - 0.065076 * p10;
    const step = f / d; p -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  const p2 = p * p, p4 = p2 * p2;
  const fx = 0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4));
  const lat = Math.max(-90, Math.min(90, p / DEG));
  const lon = Math.max(-180, Math.min(180, x / fx / DEG));
  return [lon, lat];
}
function haversineKm(la1, lo1, la2, lo2) {
  const dLa = (la2 - la1) * DEG, dLo = (lo2 - lo1) * DEG;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * DEG) * Math.cos(la2 * DEG) * Math.sin(dLo / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* Datas (sempre 'YYYY-MM-DD', sem fuso) */
const pad2 = n => String(n).padStart(2, '0');
function parseYmd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) ? dt : null;
}
const fmtYmd = dt => `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
function addDays(s, n) { const d = parseYmd(s); d.setUTCDate(d.getUTCDate() + n); return fmtYmd(d); }
function diffDays(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 864e5); }
function localYmd(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }

/* EXIF (JPEG): data e GPS */
function parseExif(buf) {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 12 || v.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o + 4 < v.byteLength) {
      const mk = v.getUint16(o);
      if ((mk & 0xFF00) !== 0xFF00 || mk === 0xFFDA) break;
      const len = v.getUint16(o + 2);
      if (mk === 0xFFE1 && v.getUint32(o + 4) === 0x45786966 && v.getUint16(o + 8) === 0) {
        return readTiff(v, o + 10, Math.min(o + 2 + len, v.byteLength));
      }
      o += 2 + len;
    }
  } catch (e) { /* sem EXIF legível */ }
  return null;
}
function readTiff(v, base, end) {
  const bo = v.getUint16(base);
  if (bo !== 0x4949 && bo !== 0x4D4D) return null;
  const le = bo === 0x4949;
  const u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
  const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  function ifd(off) {
    const out = {};
    if (off < base || off + 2 > end) return out;
    const n = u16(off);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (e + 12 > end) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const size = (SZ[type] || 1) * count;
      const at = size > 4 ? base + u32(e + 8) : e + 8;
      if (at + size > end) continue;
      out[tag] = { type, count, at };
    }
    return out;
  }
  const ascii = t => { if (!t) return ''; let s = ''; for (let i = 0; i < t.count; i++) { const c = v.getUint8(t.at + i); if (!c) break; s += String.fromCharCode(c); } return s; };
  const rats = t => { const r = []; if (!t) return r; for (let i = 0; i < t.count; i++) { const d = u32(t.at + i * 8 + 4); r.push(d ? u32(t.at + i * 8) / d : 0); } return r; };
  const i0 = ifd(base + u32(base + 4));
  const exif = i0[0x8769] ? ifd(base + u32(i0[0x8769].at)) : {};
  const gps = i0[0x8825] ? ifd(base + u32(i0[0x8825].at)) : {};
  const res = { date: '', time: '', lat: null, lng: null };
  const raw = ascii(exif[0x9003]) || ascii(exif[0x9004]) || ascii(i0[0x0132]);
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m && m[1] !== '0000') { res.date = `${m[1]}-${m[2]}-${m[3]}`; res.time = `${m[4]}:${m[5]}:${m[6]}`; if (!parseYmd(res.date)) { res.date = ''; res.time = ''; } }
  const la = rats(gps[2]), lo = rats(gps[4]);
  if (la.length === 3 && lo.length === 3) {
    let lat = la[0] + la[1] / 60 + la[2] / 3600, lng = lo[0] + lo[1] / 60 + lo[2] / 3600;
    if (ascii(gps[1]).toUpperCase().startsWith('S')) lat = -lat;
    if (ascii(gps[3]).toUpperCase().startsWith('W')) lng = -lng;
    if (isFinite(lat) && isFinite(lng) && (lat !== 0 || lng !== 0) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) { res.lat = lat; res.lng = lng; }
  }
  return res;
}

/* Países */
const COUNTRIES = COUNTRY_ROWS.split('\n').map(r => {
  const [code, name, lat, lng, c] = r.split('|');
  return { code, name, lat: +lat, lng: +lng, cont: c };
});
const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map(c => [c.code, c]));
const normKey = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const COUNTRY_BY_KEY = {};
for (const c of COUNTRIES) COUNTRY_BY_KEY[normKey(c.name)] = c.code;
for (const [k, code] of Object.entries(COUNTRY_ALIASES)) if (!COUNTRY_BY_KEY[k]) COUNTRY_BY_KEY[k] = code;
function findCountry(text) {
  const k = normKey(text);
  if (!k) return null;
  const code = COUNTRY_BY_KEY[k];
  return code ? COUNTRY_BY_CODE[code] : null;
}
const MICRO = new Set(['VA', 'SM', 'MC', 'LI', 'AD']);
function nearestCountry(lat, lng) {
  let best = null, bd = Infinity;
  for (const c of COUNTRIES) {
    if (MICRO.has(c.code)) continue; const d = haversineKm(lat, lng, c.lat, c.lng); if (d < bd) { bd = d; best = c; } }
  return best;
}
function median(a) { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }

/* Localização de uma viagem: coordenadas guardadas, GPS das fotos ou centro do país */
function tripPoint(t) {
  if (Number.isFinite(t.lat) && Number.isFinite(t.lng)) return { lat: t.lat, lng: t.lng, src: 'manual' };
  const g = (t.photos || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (g.length) return { lat: median(g.map(p => p.lat)), lng: median(g.map(p => p.lng)), src: 'fotos' };
  const c = findCountry(t.country);
  return c ? { lat: c.lat, lng: c.lng, src: 'pais' } : null;
}
function tripDays(t) {
  const set = new Set();
  const a = parseYmd(t.start), b = parseYmd(t.end || t.start);
  if (a && b && b >= a && (b - a) / 864e5 <= 120) for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) set.add(fmtYmd(d));
  for (const p of (t.photos || [])) if (p.date && parseYmd(p.date)) set.add(p.date);
  for (const k of Object.keys(t.days || {})) if ((t.days[k] || '').trim() && parseYmd(k)) set.add(k);
  return [...set].sort();
}
function tripDayCount(t) {
  const a = parseYmd(t.start), b = parseYmd(t.end);
  if (!a) return 0;
  if (!b || b < a) return 1;
  return Math.round((b - a) / 864e5) + 1;
}

/* Agrupa fotos em viagens: nova viagem quando há mais de gapDays dias entre fotos seguidas */
function groupByDate(items, gapDays) {
  const s = items.slice().sort((a, b) => (a.date + ' ' + (a.time || '')).localeCompare(b.date + ' ' + (b.time || '')));
  const groups = [];
  for (const it of s) {
    const g = groups[groups.length - 1];
    if (g && diffDays(g.end, it.date) <= gapDays) { g.items.push(it); if (it.date > g.end) g.end = it.date; }
    else groups.push({ start: it.date, end: it.date, items: [it] });
  }
  return groups;
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s || 'viagem').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'viagem';
const chunk = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
function hueOf(s) { let n = 0; for (const c of String(s || 'x')) n = (n * 31 + c.charCodeAt(0)) % 360; return n; }

/* Polígonos para pontos de SVG */
function polyPath(str) {
  const pts = str.split(' ').map(p => { const [lo, la] = p.split(',').map(Number); return project(lo, la); });
  return 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
}
