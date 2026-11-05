/* Gera ../geodata.js a partir do Natural Earth (domínio público): node build-geo.js <pasta com os .geojson> */
const fs = require('fs'), path = require('path');
const src = process.argv[2];
const rd = f => JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'));
const polys = g => { const res = []; for (const f of g.features) { const gm = f.geometry; if (!gm) continue; const c = gm.coordinates; if (gm.type === 'Polygon') res.push({ p: f.properties, rings: c }); else if (gm.type === 'MultiPolygon') for (const pl of c) res.push({ p: f.properties, rings: pl }); } return res; };
const lines = g => { const res = []; for (const f of g.features) { const gm = f.geometry; if (!gm) continue; const c = gm.coordinates; if (gm.type === 'LineString') res.push({ p: f.properties, line: c }); else if (gm.type === 'MultiLineString') for (const l of c) res.push({ p: f.properties, line: l }); } return res; };
function dp(pts, tol) {
  const n = pts.length; if (n <= 3) return pts;
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]], t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop(); let md = -1, mi = -1;
    const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] - ax, py = pts[i][1] - ay; let d;
      if (L === 0) d = px * px + py * py; else { let t = (px * dx + py * dy) / L; t = t < 0 ? 0 : t > 1 ? 1 : t; const qx = px - t * dx, qy = py - t * dy; d = qx * qx + qy * qy; }
      if (d > md) { md = d; mi = i; }
    }
    if (md > t2) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const res = []; for (let i = 0; i < n; i++) if (keep[i]) res.push(pts[i]);
  return res;
}
function bbox(pts) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; }
function ringDP(r, tol, minSize) {
  const b = bbox(r), sz = Math.max(b[2] - b[0], b[3] - b[1]); if (sz < minSize) return null;
  let s = dp(r, tol);
  if (s.length < 4) { if (sz < minSize * 3 || r.length < 4) return null; s = [r[0], r[Math.floor(r.length / 3)], r[Math.floor(2 * r.length / 3)], r[r.length - 1]]; }
  return s;
}
class W { constructor() { this.a = []; }
  v(n) { n = Math.round(n); while (n >= 128) { this.a.push((n % 128) | 128); n = Math.floor(n / 128); } this.a.push(n); }
  z(n) { this.v(n < 0 ? -2 * n - 1 : 2 * n); } b(n) { this.a.push(n & 255); }
  pts(pts) { this.v(pts.length); let px = 0, py = 0; pts.forEach((p, i) => { const x = Math.round((p[0] + 180) * 1000), y = Math.round((p[1] + 90) * 1000); if (i === 0) { this.v(x); this.v(y); } else { this.z(x - px); this.z(y - py); } px = x; py = y; }); } }
function section(w, items) { w.v(items.length); for (const it of items) { if (it.rank != null) w.b(it.rank); w.pts(it.pts); } }
const mkRings = (arr, tol, minSize) => { const res = []; for (const f of arr) f.rings.forEach((r, i) => { const s = ringDP(r, tol, i ? minSize * 2 : minSize); if (s) res.push({ pts: s }); }); return res; };

const land = polys(rd('ne_10m_land.geojson')).concat(polys(rd('ne_10m_minor_islands.geojson')));
const L0 = mkRings(land, 0.03, 0.12), L1 = mkRings(land, 0.006, 0.007);
const lk = polys(rd('ne_10m_lakes.geojson'));
const LK0 = mkRings(lk, 0.03, 0.5), LK1 = mkRings(lk, 0.007, 0.02);
const bl = lines(rd('ne_10m_admin_0_boundary_lines_land.geojson')).map(l => ({ pts: dp(l.line, 0.006) }));
const rv = lines(rd('ne_10m_rivers_lake_centerlines.geojson')).map(l => ({ rank: Math.min(12, Math.max(0, l.p.scalerank == null ? 6 : l.p.scalerank)), pts: dp(l.line, 0.01) })).filter(l => l.pts.length >= 2);
const ctry = rd('ne_10m_admin_0_countries.geojson'); const cw = new W(); const cmeta = [];
for (const f of ctry.features) {
  const P = f.properties, code = P.ISO_A2_EH && P.ISO_A2_EH !== '-99' ? P.ISO_A2_EH : (P.ISO_A2 !== '-99' ? P.ISO_A2 : null);
  if (!code) continue;
  const rings = []; for (const pl of polys({ features: [f] })) pl.rings.forEach((r, i) => { const s = ringDP(r, 0.03, i ? 0.5 : 0.1); if (s) rings.push({ pts: s, hole: i > 0 }); });
  cmeta.push(code); cw.v(rings.length); for (const r of rings) { cw.b(r.hole ? 1 : 0); cw.pts(r.pts); }
}
const w = new W();
for (const s of [L0, L1, LK0, LK1, bl]) section(w, s);
section(w, rv);
const b64 = buf => Buffer.from(buf).toString('base64');
const pp = rd('ne_10m_populated_places.geojson').features.map(f => f.properties).map(p => ({ n: p.NAME_PT || p.NAME_EN || p.NAME, x: +p.LONGITUDE, y: +p.LATITUDE, pop: p.POP_MAX, sr: p.SCALERANK, cap: p.FEATURECLA && /capital/i.test(p.FEATURECLA) ? 1 : 0 }));
const places = pp.map(p => `${p.n.replace(/[|;]/g, ' ')}|${Math.round(p.x * 100)}|${Math.round(p.y * 100)}|${Math.min(9, p.sr)}|${Math.round(Math.log10(Math.max(1000, p.pop)) * 10)}|${p.cap}`).join(';');
const lbl = ctry.features.map(f => f.properties).map(p => ({ c: p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : (p.ISO_A2 !== '-99' ? p.ISO_A2 : null), n: p.NAME_PT || p.NAME, x: +p.LABEL_X, y: +p.LABEL_Y, mz: p.MIN_LABEL })).filter(p => p.c && isFinite(p.x));
const labels = lbl.map(p => `${p.c}|${p.n.replace(/[|;]/g, ' ')}|${Math.round(p.x * 100)}|${Math.round(p.y * 100)}|${Math.round((p.mz || 3) * 10)}`).join(';');
const outTxt = `/* Dados cartográficos: Natural Earth (domínio público), simplificados. Gerado por geo/build-geo.js */\nconst GEO_B64 = ${JSON.stringify(b64(w.a))};\nconst GEO_COUNTRIES_B64 = ${JSON.stringify(b64(cw.a))};\nconst GEO_COUNTRY_CODES = ${JSON.stringify(cmeta)};\nconst GEO_PLACES = ${JSON.stringify(places)};\nconst GEO_LABELS = ${JSON.stringify(labels)};\n`;
fs.writeFileSync(path.join(__dirname, '..', 'geodata.js'), outTxt);
console.log('land', L0.length, L1.length, 'pts', L0.reduce((s, r) => s + r.pts.length, 0), L1.reduce((s, r) => s + r.pts.length, 0), 'lakes', LK0.length, LK1.length, 'borders', bl.length, 'rivers', rv.length, 'bytes', w.a.length, cw.a.length, 'places', pp.length, 'labels', lbl.length, 'out', outTxt.length);
