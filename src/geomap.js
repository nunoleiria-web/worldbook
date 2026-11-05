/* ===== geomap.js: mapa cartográfico em canvas (Mercator) com dados Natural Earth ===== */
const GM = { ready: false };
const GM_D2R = Math.PI / 180;
const gmX = lng => (lng + 180) / 360;
const gmY = lat => { const s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * GM_D2R); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const gmLng = x => x * 360 - 180;
const gmLat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / GM_D2R;

function gmDecode() {
  if (GM.ready) return GM;
  const rdr = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); let p = 0; return { eof: () => p >= u.length, b: () => u[p++], v: () => { let r = 0, m = 1, c; do { c = u[p++]; r += (c & 127) * m; m *= 128; } while (c & 128); return r; }, z() { const n = this.v(); return n % 2 ? -(n + 1) / 2 : n / 2; } }; };
  const pts = (r) => {
    const n = r.v(), a = new Float64Array(n * 2); let x = 0, y = 0, x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (let i = 0; i < n; i++) { if (i === 0) { x = r.v(); y = r.v(); } else { x += r.z(); y += r.z(); } const px = x / 1000 / 360, py = gmY(y / 1000 - 90); a[2 * i] = px; a[2 * i + 1] = py; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    return { a, n, b: [x0, y0, x1, y1] };
  };
  const section = (r, rank) => { const k = r.v(), out = []; for (let i = 0; i < k; i++) { const rk = rank ? r.b() : 0; const p = pts(r); p.rank = rk; out.push(p); } return out; };
  const r = rdr(GEO_B64);
  GM.land0 = section(r); GM.land1 = section(r); GM.lake0 = section(r); GM.lake1 = section(r); GM.borders = section(r); GM.rivers = section(r, true);
  const cr = rdr(GEO_COUNTRIES_B64); GM.countries = {};
  for (const code of GEO_COUNTRY_CODES) { const k = cr.v(), rings = []; for (let i = 0; i < k; i++) { const hole = cr.b(); const p = pts(cr); p.hole = !!hole; rings.push(p); } (GM.countries[code] = GM.countries[code] || []).push(...rings); }
  GM.places = GEO_PLACES.split(';').map(s => { const q = s.split('|'); const lng = +q[1] / 100, lat = +q[2] / 100; return { n: q[0], lng, lat, x: gmX(lng), y: gmY(lat), sr: +q[3], pop: +q[4], cap: +q[5] }; }).sort((a, b) => b.pop - a.pop);
  GM.labels = GEO_LABELS.split(';').map(s => { const q = s.split('|'); const lng = +q[2] / 100, lat = +q[3] / 100; return { c: q[0], n: q[1], x: gmX(lng), y: gmY(lat), mz: +q[4] / 10 }; });
  GM.ready = true; return GM;
}
function gmRingHas(ring, x, y) {
  const a = ring.a; let inside = false;
  for (let i = 0, j = ring.n - 1; i < ring.n; j = i++) { const xi = a[2 * i], yi = a[2 * i + 1], xj = a[2 * j], yj = a[2 * j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
  return inside;
}
function gmCountryAt(lat, lng) {
  gmDecode(); const x = gmX(lng), y = gmY(lat);
  for (const code in GM.countries) {
    const rings = GM.countries[code]; let inside = false;
    for (const r of rings) { if (x < r.b[0] || x > r.b[2] || y < r.b[1] || y > r.b[3]) continue; if (gmRingHas(r, x, y)) inside = !r.hole ? true : false; }
    if (inside) return code;
  }
  return null;
}
/* lugar mais relevante perto de um ponto (nome em português) */
function gmPlaceNear(lat, lng) {
  gmDecode(); let best = null, bs = Infinity;
  const dl = 0.6;
  for (const p of GM.places) {
    if (Math.abs(p.lat - lat) > dl || Math.abs(p.lng - lng) > dl * 1.6) continue;
    const d = haversineKm(lat, lng, p.lat, p.lng);
    if (d > 45) continue;
    const s = d / (0.6 + p.pop / 30 - 0.2) - (p.cap ? 3 : 0);
    if (s < bs) { bs = s; best = p; }
  }
  return best ? Object.assign({ d: gmDistKm(lat, lng, best) }, best) : null;
}
const gmDistKm = (lat, lng, p) => haversineKm(lat, lng, p.lat, p.lng);

/* ---------- paleta ---------- */
function gmPalette(el) {
  const cs = getComputedStyle(el || document.documentElement), g = k => cs.getPropertyValue(k).trim();
  const dark = (g('color-scheme') || '').includes('dark');
  return { sea: g('--sea') || '#D5E2E6', land: g('--land') || '#FBF9F4', coast: g('--coast') || '#B9B3A4', grat: g('--grat') || '#C9D8DD', accent: g('--accent') || '#B4472A', ink: g('--ink') || '#1B1917', mute: g('--ink-2') || '#6B655B', paper: g('--surface') || '#FBF9F4', dark };
}
function gmMix(a, b, t) { const pa = gmRgb(a), pb = gmRgb(b); return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`; }
function gmRgb(c) { c = String(c).trim(); let m; if ((m = c.match(/^#([0-9a-f]{3})$/i))) return [...m[1]].map(x => parseInt(x + x, 16)); if ((m = c.match(/^#([0-9a-f]{6})$/i))) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)); if ((m = c.match(/rgba?\(([^)]+)\)/))) return m[1].split(',').slice(0, 3).map(Number); return [128, 128, 128]; }

/* ---------- geometria de rotas ---------- */
function gmArc(la1, lo1, la2, lo2, n) {
  const p1 = la1 * GM_D2R, l1 = lo1 * GM_D2R, p2 = la2 * GM_D2R, l2 = lo2 * GM_D2R;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-6 || Math.abs(lo2 - lo1) > 180) return [[la1, lo1], [la2, lo2]];
  const out = [];
  for (let i = 0; i <= n; i++) { const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2), y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2), z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / GM_D2R, Math.atan2(y, x) / GM_D2R]); }
  return out;
}
/* converte uma lista [{lat,lng}] em segmentos (linha contínua e arcos de voo) em coordenadas de mundo */
function gmRouteGeom(points, flightKm) {
  const segs = []; let cur = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i && haversineKm(points[i - 1].lat, points[i - 1].lng, p.lat, p.lng) > (flightKm || 450)) {
      const arc = gmArc(points[i - 1].lat, points[i - 1].lng, p.lat, p.lng, 48);
      segs.push({ fly: true, w: arc.map(a => [gmX(a[1]), gmY(a[0])]) }); cur = null;
    }
    if (!cur) { cur = { fly: false, w: [] }; segs.push(cur); }
    cur.w.push([gmX(p.lng), gmY(p.lat)]);
  }
  return segs;
}

/* ---------- desenho ---------- */
function gmNiceKm(maxKm) { const p = Math.pow(10, Math.floor(Math.log10(maxKm))); for (const m of [5, 2, 1]) if (m * p <= maxKm) return m * p; return p; }
function gmDraw(ctx, W, H, v, o, pal, hit) {
  const D = gmDecode(), wp = 256 * Math.pow(2, v.z), z = v.z;
  const sx = x => (x - v.cx) * wp + W / 2, sy = y => (y - v.cy) * wp + H / 2;
  const vx0 = v.cx - W / 2 / wp, vx1 = v.cx + W / 2 / wp, vy0 = v.cy - H / 2 / wp, vy1 = v.cy + H / 2 / wp;
  const vis = r => !(r.b[2] < vx0 || r.b[0] > vx1 || r.b[3] < vy0 || r.b[1] > vy1);
  const dark = pal.dark;
  ctx.save(); ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = pal.sea; ctx.fillRect(0, 0, W, H);
  /* graticule */
  if (z < 3.6 && !o.noGrid) {
    ctx.strokeStyle = pal.grat; ctx.lineWidth = 1; ctx.beginPath();
    const step = z < 2.2 ? 30 : 15;
    for (let lo = -180; lo <= 180; lo += step) { const x = sx(gmX(lo)); ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let la = -75; la <= 75; la += step) { const y = sy(gmY(la)); ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }
  const fine = z >= 4.4;
  const land = fine ? D.land1 : D.land0, lakes = fine ? D.lake1 : D.lake0;
  const trace = (path, rings) => { for (const r of rings) { if (!vis(r)) continue; const a = r.a; path.moveTo(sx(a[0]), sy(a[1])); let lx = sx(a[0]), ly = sy(a[1]); for (let i = 1; i < r.n; i++) { const x = sx(a[2 * i]), y = sy(a[2 * i + 1]); if (Math.abs(x - lx) + Math.abs(y - ly) < 0.6 && i < r.n - 1) continue; path.lineTo(x, y); lx = x; ly = y; } path.closePath(); } };
  const landPath = new Path2D(); trace(landPath, land);
  /* halo da costa */
  ctx.lineJoin = 'round';
  const glow = dark ? gmMix(pal.sea, '#ffffff', 0.07) : gmMix(pal.sea, '#ffffff', 0.45);
  ctx.strokeStyle = glow; ctx.globalAlpha = 0.55; ctx.lineWidth = 9; ctx.stroke(landPath);
  ctx.globalAlpha = 0.8; ctx.lineWidth = 4.5; ctx.stroke(landPath); ctx.globalAlpha = 1;
  ctx.fillStyle = pal.land; ctx.fill(landPath);
  /* países visitados */
  if (o.visited && o.visited.size) {
    ctx.save(); ctx.clip(landPath); ctx.fillStyle = pal.accent; ctx.globalAlpha = (dark ? 0.22 : 0.15) * (z < 5.5 ? 1 : z > 7.5 ? 0.3 : 1 - (z - 5.5) * 0.35);
    for (const code of o.visited) { const rings = D.countries[code]; if (!rings) continue; const cp = new Path2D(); trace(cp, rings.filter(r => !r.hole)); ctx.fill(cp); }
    ctx.globalAlpha = 1; ctx.restore();
  }
  /* lagos */
  const lp = new Path2D(); trace(lp, lakes); ctx.fillStyle = pal.sea; ctx.fill(lp); ctx.strokeStyle = pal.coast; ctx.globalAlpha = 0.6; ctx.lineWidth = 0.7; ctx.stroke(lp); ctx.globalAlpha = 1;
  /* rios */
  if (z >= 4.2) {
    const maxRank = z < 5 ? 3 : z < 6 ? 5 : z < 7 ? 7 : 12;
    ctx.strokeStyle = gmMix(pal.sea, pal.land, dark ? 0.0 : 0.0); ctx.lineCap = 'round';
    for (const r of D.rivers) { if (r.rank > maxRank || !vis(r)) continue; ctx.lineWidth = r.rank <= 2 ? 1.6 : r.rank <= 5 ? 1.1 : 0.8; ctx.beginPath(); ctx.moveTo(sx(r.a[0]), sy(r.a[1])); for (let i = 1; i < r.n; i++) ctx.lineTo(sx(r.a[2 * i]), sy(r.a[2 * i + 1])); ctx.stroke(); }
  }
  /* costa */
  ctx.strokeStyle = pal.coast; ctx.lineWidth = 0.9; ctx.stroke(landPath);
  /* fronteiras */
  if (z >= 2.4) {
    ctx.strokeStyle = gmMix(pal.coast, pal.land, 0.1); ctx.globalAlpha = 0.95; ctx.lineWidth = z > 5 ? 1.1 : 0.8;
    if (z > 4.8) ctx.setLineDash([5, 3]);
    ctx.beginPath();
    for (const r of D.borders) { if (!vis(r)) continue; ctx.moveTo(sx(r.a[0]), sy(r.a[1])); for (let i = 1; i < r.n; i++) ctx.lineTo(sx(r.a[2 * i]), sy(r.a[2 * i + 1])); }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  const rects = [];
  const clash = (x, y, w, h) => { for (const q of rects) if (x < q[2] && x + w > q[0] && y < q[3] && y + h > q[1]) return true; return false; };
  const font = (w, s) => `${w} ${s}px "Instrument Sans", system-ui, "Segoe UI", sans-serif`;
  const halo = pal.dark ? 'rgba(15,22,26,0.85)' : 'rgba(251,249,244,0.9)';
  const text = (s, x, y, col, hw) => { ctx.lineJoin = 'round'; ctx.lineWidth = hw || 3.2; ctx.strokeStyle = halo; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); };
  /* rótulos de países */
  if (z >= 2 && z < 7.2 && !o.noCountryLabels) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font(600, 10); try { ctx.letterSpacing = '2px'; } catch (e) { /* sem suporte */ }
    for (const l of D.labels) {
      if (z < l.mz - 0.6) continue;
      const x = sx(l.x), y = sy(l.y); if (x < 0 || x > W || y < 0 || y > H) continue;
      const s = l.n.toUpperCase(), w = ctx.measureText(s).width;
      if (clash(x - w / 2, y - 7, w, 14)) continue;
      rects.push([x - w / 2, y - 7, x + w / 2, y + 7]);
      ctx.fillStyle = gmMix(pal.mute, pal.land, 0.2); ctx.fillText(s, x, y);
    }
    try { ctx.letterSpacing = '0px'; } catch (e) { /* */ }
  }
  /* rota */
  const R = o._route || [];
  const prog = o.progress == null ? 1 : o.progress;
  if (R.length) {
    let total = 0; const proj = R.map(seg => ({ fly: seg.fly, p: seg.w.map(q => [sx(q[0]), sy(q[1])]) }));
    for (const s of proj) for (let i = 1; i < s.p.length; i++) total += Math.hypot(s.p[i][0] - s.p[i - 1][0], s.p[i][1] - s.p[i - 1][1]);
    const limit = total * prog;
    for (const pass of [0, 1]) {
      let drawn = 0;
      for (const s of proj) {
        if (!s.p.length) continue;
        let acc = 0; ctx.beginPath(); ctx.moveTo(s.p[0][0], s.p[0][1]); let lx = s.p[0][0], ly = s.p[0][1];
        for (let i = 1; i < s.p.length; i++) {
          const x = s.p[i][0], y = s.p[i][1], L = Math.hypot(x - lx, y - ly);
          if (L < 1.2 && i < s.p.length - 1) continue;
          const left = limit - (drawn + acc);
          if (left <= 0) break;
          if (L > left) { const f = left / L; ctx.lineTo(lx + (x - lx) * f, ly + (y - ly) * f); acc += left; break; }
          ctx.lineTo(x, y); acc += L; lx = x; ly = y;
        }
        drawn += acc;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (pass === 0) { ctx.setLineDash([]); ctx.strokeStyle = pal.land; ctx.globalAlpha = 0.95; ctx.lineWidth = s.fly ? 5 : 6; ctx.stroke(); ctx.globalAlpha = 1; }
        else { ctx.strokeStyle = pal.accent; ctx.lineWidth = s.fly ? 2 : 3.2; ctx.setLineDash(s.fly ? [2, 6] : []); ctx.stroke(); ctx.setLineDash([]); }
      }
    }
  }
  /* pontos das fotos */
  if (o._dots && z >= 7) { ctx.fillStyle = pal.accent; ctx.globalAlpha = 0.85; for (const d of o._dots) { const x = sx(d[0]), y = sy(d[1]); if (x < -5 || y < -5 || x > W + 5 || y > H + 5) continue; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.2832); ctx.fill(); } ctx.globalAlpha = 1; }
  /* marcadores (paragens e pinos) com agrupamento */
  const marks = o._marks || [];
  const placed = [];
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const pxs = marks.map(m => ({ m, x: sx(m.x), y: sy(m.y) })).filter(q => q.x > -40 && q.y > -40 && q.x < W + 40 && q.y < H + 60);
  const order = pxs.slice().sort((a, b) => (b.m.sel ? 1 : 0) - (a.m.sel ? 1 : 0));
  const cl = [];
  for (const q of order) {
    const rr = q.m.r || 13;
    const near = cl.find(c => !c.m.sel && Math.hypot(c.x - q.x, c.y - q.y) < (c.m.r || 13) + rr - 4);
    if (near && !q.m.sel) { near.n = (near.n || 1) + 1; continue; }
    q.n = 1; cl.push(q);
  }
  for (const q of cl) {
    const m = q.m, r = m.r || 13, x = q.x, y = q.y, sel = !!m.sel;
    if (hit) hit.push({ id: m.id, x, y, r: r + 4 });
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    const rad = sel ? r + 3 : r;
    if (m.img && m.img.complete && m.img.naturalWidth) {
      ctx.beginPath(); ctx.arc(x, y, rad + 2.5, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.clip();
      const iw = m.img.naturalWidth, ih = m.img.naturalHeight, s = Math.max(2 * rad / iw, 2 * rad / ih);
      ctx.drawImage(m.img, x - iw * s / 2, y - ih * s / 2, iw * s, ih * s); ctx.restore();
      if (sel) { ctx.beginPath(); ctx.arc(x, y, rad + 2.5, 0, 6.2832); ctx.strokeStyle = pal.accent; ctx.lineWidth = 3; ctx.stroke(); }
      if (m.n != null) { ctx.shadowColor = 'transparent'; ctx.beginPath(); ctx.arc(x + rad * 0.72, y - rad * 0.72, 8.5, 0, 6.2832); ctx.fillStyle = pal.accent; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = font(700, 10); ctx.textAlign = 'center'; ctx.fillText(String(m.n), x + rad * 0.72, y - rad * 0.72 + 0.5); ctx.textAlign = 'left'; }
    } else {
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.fillStyle = pal.accent; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (m.n != null) { ctx.fillStyle = '#fff'; ctx.font = font(700, rad > 12 ? 12 : 10); ctx.textAlign = 'center'; ctx.fillText(String(m.n), x, y + 0.5); ctx.textAlign = 'left'; }
      else { ctx.beginPath(); ctx.arc(x, y, rad * 0.32, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill(); }
    }
    ctx.restore();
    if (q.n > 1) { ctx.beginPath(); ctx.arc(x + r * 0.8, y + r * 0.8, 8, 0, 6.2832); ctx.fillStyle = pal.ink; ctx.fill(); ctx.fillStyle = pal.land; ctx.font = font(700, 10); ctx.textAlign = 'center'; ctx.fillText('+' + (q.n - 1), x + r * 0.8, y + r * 0.8 + 0.5); ctx.textAlign = 'left'; }
    rects.push([x - r - 2, y - r - 2, x + r + 2, y + r + 2]);
    placed.push(q);
  }
  /* nomes das paragens */
  if (!o.noStopLabels) {
    ctx.font = font(600, 12.5);
    for (const q of placed) {
      const m = q.m; if (!m.label || q.n > 1 && !m.sel) continue;
      const w = ctx.measureText(m.label).width, r = (m.r || 13) + (m.sel ? 3 : 0) + 4;
      for (const side of [1, -1]) {
        const x = side > 0 ? q.x + r : q.x - r - w, y = q.y - 8;
        if (clash(x - 2, y - 2, w + 4, 20)) continue;
        rects.push([x - 2, y - 2, x + w + 2, y + 18]); ctx.textAlign = 'left'; text(m.label, x, q.y, pal.ink, 3.6); break;
      }
    }
  }
  /* cidades */
  if (z >= 2.6 && !o.noCities) {
    const maxSr = z < 3.4 ? 1 : z < 4.2 ? 2 : z < 5.2 ? 3 : z < 6.2 ? 4 : z < 7.2 ? 6 : z < 8.6 ? 7 : 9;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; let cnt = 0;
    for (const p of D.places) {
      if (p.sr > maxSr) continue;
      const x = sx(p.x), y = sy(p.y); if (x < 4 || x > W - 4 || y < 4 || y > H - 4) continue;
      const big = p.sr <= 2 || p.cap, size = big ? 12 : p.sr <= 4 ? 11 : 10.5;
      ctx.font = font(big ? 600 : 500, size);
      const w = ctx.measureText(p.n).width;
      let px = x + 6, ok = !clash(px - 1, y - 7, w + 2, 14);
      if (!ok) { px = x - 6 - w; ok = !clash(px - 1, y - 7, w + 2, 14); }
      if (!ok) continue;
      rects.push([px - 1, y - 7, px + w + 1, y + 7]);
      ctx.beginPath(); ctx.arc(x, y, p.cap ? 3 : 2.2, 0, 6.2832); ctx.fillStyle = pal.mute; ctx.fill();
      text(p.n, px, y, big ? pal.ink : gmMix(pal.ink, pal.land, 0.25), 3);
      if (++cnt > 160) break;
    }
  }
  /* pick */
  if (o.pick) { const x = sx(gmX(o.pick.lng)), y = sy(gmY(o.pick.lat)); ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.2832); ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.5; ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.2832); ctx.fillStyle = pal.accent; ctx.fill(); }
  /* escala e atribuição */
  if (!o.noScale) {
    const lat = gmLat(v.cy), mpp = 156543.03392 * Math.cos(lat * GM_D2R) / Math.pow(2, z);
    const km = gmNiceKm(mpp * 96 / 1000), len = km * 1000 / mpp, bx = 14, by = H - 16;
    ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by); ctx.lineTo(bx + len, by); ctx.lineTo(bx + len, by - 4); ctx.stroke();
    ctx.font = font(500, 10.5); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; text(km >= 1 ? km + ' km' : km * 1000 + ' m', bx + 2, by - 5, pal.ink, 3);
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 0.6; ctx.fillStyle = pal.mute; ctx.font = font(400, 9); ctx.fillText('Natural Earth', W - 8, H - 7); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ---------- preparação dos dados do mapa ---------- */
function gmPrep(o) {
  const pts = o.routePoints && o.routePoints.length > 1 ? o.routePoints : null;
  o._route = pts ? gmRouteGeom(pts) : [];
  o._dots = (o.dots || []).filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lng)).map(d => [gmX(d.lng), gmY(d.lat)]);
  o._marks = (o.marks || []).map(m => Object.assign({}, m, { x: gmX(m.lng), y: gmY(m.lat) }));
  return o;
}
function gmFit(points, W, H, pad, maxZ) {
  const pp = points.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!pp.length) return { cx: 0.5, cy: 0.42, z: Math.max(1, Math.log2(W / 256)) };
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of pp) { const x = gmX(p.lng), y = gmY(p.lat); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const bw = Math.max(x1 - x0, 1e-7), bh = Math.max(y1 - y0, 1e-7), p2 = pad == null ? 40 : pad;
  const z = Math.min(maxZ || 12, Math.log2(Math.max(40, W - 2 * p2) / (256 * bw)), Math.log2(Math.max(40, H - 2 * p2) / (256 * bh)));
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, z: Math.max(1, z) };
}
/* imagem estática (livro, PDF): devolve data URL */
function gmRenderImage(o, cssW, cssH, scale, palette) {
  gmPrep(o);
  const c = document.createElement('canvas'); c.width = Math.round(cssW * scale); c.height = Math.round(cssH * scale);
  const ctx = c.getContext('2d'); ctx.scale(scale, scale);
  const v = gmFit(o.fitPoints || [], cssW, cssH, o.pad == null ? 60 : o.pad, o.maxZ || 11);
  o.noGrid = true;
  gmDraw(ctx, cssW, cssH, v, o, palette, null);
  return c.toDataURL('image/jpeg', 0.9);
}

/* ---------- mapa interativo ---------- */
function createGeoMap(o) {
  gmDecode();
  const box = document.createElement('div'); box.className = 'gmap'; box.setAttribute('role', 'application'); box.setAttribute('aria-label', o.label || 'Mapa');
  const cv = document.createElement('canvas'); cv.tabIndex = 0; box.append(cv);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, v = { cx: 0.5, cy: 0.42, z: 1.5 }, raf = 0, hits = [], moved = false, pendingFit = null, anim = null;
  const imgs = new Map();
  const state = gmPrep(Object.assign({ progress: o.animate ? 0 : 1 }, o));
  const wp = () => 256 * Math.pow(2, v.z);
  const minZ = () => Math.max(0.6, Math.log2(Math.max(W, 200) / 256) - 0.05);
  const clampV = () => { v.z = Math.max(minZ(), Math.min(9.5, v.z)); const hx = W / 2 / wp(), hy = H / 2 / wp(); v.cx = hx >= 0.5 ? 0.5 : Math.max(hx, Math.min(1 - hx, v.cx)); v.cy = hy >= 0.5 ? 0.5 : Math.max(hy, Math.min(1 - hy, v.cy)); };
  const draw = () => { raf = 0; if (!W) return; clampV(); o.onView && o.onView(v); hits = []; gmDraw(ctx, W, H, v, state, gmPalette(box), hits); };
  const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const size = () => {
    const r = box.getBoundingClientRect(); const w = Math.round(r.width), h = Math.round(r.height); if (!w || !h) return;
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (w === W && h === H) return;
    const first = !W; W = w; H = h; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (first && pendingFit) { v = gmFit(pendingFit.pts, W, H, pendingFit.pad, pendingFit.maxZ); pendingFit = null; if (o.animate) runProgress(); }
    redraw();
  };
  function runProgress() { const t0 = performance.now(); const step = t => { const k = Math.min(1, (t - t0) / 1500); state.progress = 1 - Math.pow(1 - k, 3); redraw(); if (k < 1) requestAnimationFrame(step); }; state.progress = 0; requestAnimationFrame(step); }
  function fly(to, ms) {
    const from = { cx: v.cx, cy: v.cy, z: v.z }, t0 = performance.now(); ms = ms || 700; if (anim) cancelAnimationFrame(anim);
    const zMid = Math.min(from.z, to.z) - Math.min(2.2, Math.hypot(to.cx - from.cx, to.cy - from.cy) * wpAt(Math.min(from.z, to.z)) / Math.max(W, 300) * 1.2);
    const step = t => { const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      v.cx = from.cx + (to.cx - from.cx) * e; v.cy = from.cy + (to.cy - from.cy) * e;
      v.z = k < 0.5 ? from.z + (zMid - from.z) * Math.sin(k * Math.PI) * 0.5 + (to.z - from.z) * e : from.z + (to.z - from.z) * e + (zMid - Math.min(from.z, to.z)) * Math.sin(k * Math.PI) * 0.5;
      redraw(); if (k < 1) anim = requestAnimationFrame(step); else anim = null; };
    anim = requestAnimationFrame(step);
  }
  const wpAt = z => 256 * Math.pow(2, z);
  const setView = (nv, animate) => { if (animate) fly(nv); else { v = nv; redraw(); } };
  const fit = (pts, pad, maxZ, animate) => { if (!W) { pendingFit = { pts, pad, maxZ }; return; } setView(gmFit(pts, W, H, pad, maxZ), animate); };
  function zoomAt(f, px, py) { const x = v.cx + (px - W / 2) / wp(), y = v.cy + (py - H / 2) / wp(); v.z = Math.max(minZ(), Math.min(17, v.z + Math.log2(f))); v.cx = x - (px - W / 2) / wp(); v.cy = y - (py - H / 2) / wp(); redraw(); }
  /* interação */
  const ptrs = new Map(); let pinch = null, vel = { x: 0, y: 0 }, lastMove = 0, down = null;
  cv.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); if (anim) { cancelAnimationFrame(anim); anim = null; } moved = false; down = { x: e.offsetX, y: e.offsetY }; vel = { x: 0, y: 0 };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: v.z }; } });
  cv.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) { const h = hitAt(e.offsetX, e.offsetY); cv.style.cursor = h ? 'pointer' : (o.onPick ? 'crosshair' : 'grab'); return; }
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y; p.x = e.offsetX; p.y = e.offsetY;
    if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const nz = pinch.z + Math.log2(d / pinch.d); zoomAt(Math.pow(2, nz - v.z), (a.x + b.x) / 2, (a.y + b.y) / 2); moved = true; return; }
    if (!moved && Math.hypot(e.offsetX - down.x, e.offsetY - down.y) < 4) return;
    moved = true; cv.style.cursor = 'grabbing'; v.cx -= dx / wp(); v.cy -= dy / wp(); vel = { x: dx, y: dy }; lastMove = performance.now(); redraw(); o.onMove && o.onMove();
  });
  const hitAt = (x, y) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (Math.hypot(h.x - x, h.y - y) <= h.r) return h; } return null; };
  const up = e => {
    const had = ptrs.delete(e.pointerId); if (!had) return; if (ptrs.size < 2) pinch = null;
    if (!moved) { const h = hitAt(e.offsetX, e.offsetY); if (h && o.onPin) o.onPin(h.id); else if (!h && o.onPick) { const x = v.cx + (e.offsetX - W / 2) / wp(), y = v.cy + (e.offsetY - H / 2) / wp(); o.onPick(gmLat(y), gmLng(x)); } return; }
    if (performance.now() - lastMove < 60 && Math.hypot(vel.x, vel.y) > 2 && ptrs.size === 0) { let vx = vel.x, vy = vel.y; const step = () => { vx *= 0.92; vy *= 0.92; if (Math.hypot(vx, vy) < 0.4) return; v.cx -= vx / wp(); v.cy -= vy / wp(); redraw(); anim = requestAnimationFrame(step); }; anim = requestAnimationFrame(step); }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', e => { zoomAt(2, e.offsetX, e.offsetY); });
  cv.addEventListener('wheel', e => { if (o.wheel === 'ctrl' && !(e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoomAt(Math.pow(2, -e.deltaY * (e.ctrlKey ? 0.012 : 0.0016)), e.offsetX, e.offsetY); }, { passive: false });
  cv.addEventListener('keydown', e => { const k = e.key, s = 60 / wp(); if (k === '+' || k === '=') zoomAt(1.5, W / 2, H / 2); else if (k === '-') zoomAt(1 / 1.5, W / 2, H / 2); else if (k === 'ArrowLeft') v.cx -= s; else if (k === 'ArrowRight') v.cx += s; else if (k === 'ArrowUp') v.cy -= s; else if (k === 'ArrowDown') v.cy += s; else return; e.preventDefault(); redraw(); });
  const mkBtn = (t, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };
  const ctl = document.createElement('div'); ctl.className = 'mapctl';
  if (o.animate) ctl.append(mkBtn('▶', 'Repetir o percurso', () => { resetView(true); setTimeout(runProgress, 600); }));
  ctl.append(mkBtn('+', 'Aproximar', () => zoomAt(1.6, W / 2, H / 2)), mkBtn('−', 'Afastar', () => zoomAt(1 / 1.6, W / 2, H / 2)), mkBtn('⟲', 'Ver tudo', () => resetView(true)));
  box.append(ctl);
  const resetView = animate => fit(o.fitPoints && o.fitPoints.length ? o.fitPoints : [], o.pad == null ? 60 : o.pad, o.maxZ || 12, animate);
  if (o.view) { v = Object.assign(v, o.view); } else resetView(false);
  if (window.ResizeObserver) new ResizeObserver(size).observe(box); else setTimeout(size, 50);
  matchMedia('(prefers-color-scheme: dark)').addEventListener && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
  /* fotos nos marcadores */
  const loadImgs = () => { for (const m of state._marks) { if (m.photo && !imgs.has(m.photo)) { const im = new Image(); im.onload = redraw; im.src = m.photo; imgs.set(m.photo, im); } if (m.photo) m.img = imgs.get(m.photo); } };
  loadImgs();
  const api = {
    el: box, redraw, fit, setView, flyTo: (lat, lng, z) => { setView({ cx: gmX(lng), cy: gmY(lat), z: z == null ? Math.max(v.z, 9) : z }, true); },
    setMarks: marks => { state.marks = marks; gmPrep(state); loadImgs(); redraw(); },
    setPick: p => { state.pick = p; redraw(); },
    setRoute: pts => { state.routePoints = pts; gmPrep(state); redraw(); },
    setSel: id => { for (const m of state._marks) m.sel = m.id === id; redraw(); },
    replay: runProgress, resize: size, view: () => v
  };
  return api;
}

/* ---------- paragens, percurso e estatísticas de uma viagem ---------- */
const _stopMemo = new Map();
function tripVisits(t) {
  const v = [];
  for (const p of (t.photos || [])) if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) { const s = photoSecs(p); v.push({ lat: p.lat, lng: p.lng, s: s == null ? (parseYmd(p.date) ? parseYmd(p.date).getTime() / 1000 + 43200 : 0) : s, date: p.date || '', pid: p.id }); }
  const tr = t.track || [];
  for (let i = 0; i + 2 < tr.length; i += 3) { const d = new Date(tr[i + 2] * 1000); v.push({ lat: tr[i], lng: tr[i + 1], s: tr[i + 2], date: d.toISOString().slice(0, 10), pid: null, tr: true }); }
  return v.sort((a, b) => a.s - b.s);
}
function tripStops(t) {
  const sig = [t.id, (t.photos || []).length, (t.track || []).length, t.lat, t.lng, (t.photos || []).filter(p => p.lat != null).length].join('|');
  const hit = _stopMemo.get(sig); if (hit) return hit;
  const vis = tripVisits(t), cl = [];
  for (const x of vis) {
    const c = cl[cl.length - 1];
    if (c && haversineKm(c.lat, c.lng, x.lat, x.lng) <= 9) { c.items.push(x); c.lat = c.items.reduce((s, q) => s + q.lat, 0) / c.items.length; c.lng = c.items.reduce((s, q) => s + q.lng, 0) / c.items.length; }
    else cl.push({ lat: x.lat, lng: x.lng, items: [x] });
  }
  let keep = cl.filter((c, i) => i === 0 || i === cl.length - 1 || c.items.some(q => q.pid) || (c.items[c.items.length - 1].s - c.items[0].s) >= 40 * 60);
  const merged = [];
  for (const c of keep) { const m = merged[merged.length - 1]; if (m && haversineKm(m.lat, m.lng, c.lat, c.lng) <= 9) { m.items.push(...c.items); m.lat = m.items.reduce((s, q) => s + q.lat, 0) / m.items.length; m.lng = m.items.reduce((s, q) => s + q.lng, 0) / m.items.length; } else merged.push(c); }
  const stops = merged.map((c, i) => {
    const pl = gmPlaceNear(c.lat, c.lng), code = gmCountryAt(c.lat, c.lng) || (nearestCountry(c.lat, c.lng) || {}).code || '';
    const name = pl ? (pl.d <= 15 ? pl.n : 'Perto de ' + pl.n) : (COUNTRY_BY_CODE[code] ? COUNTRY_BY_CODE[code].name : 'Local');
    const dates = c.items.map(q => q.date).filter(Boolean).sort();
    return { id: 's' + (i + 1), n: i + 1, lat: c.lat, lng: c.lng, name, code, d0: dates[0] || '', d1: dates[dates.length - 1] || '', photos: [...new Set(c.items.map(q => q.pid).filter(Boolean))], days: [...new Set(dates)], dc: dates.reduce((m, d) => (m[d] = (m[d] || 0) + 1, m), {}) };
  });
  const dayStop = {};
  for (const st of stops) for (const d of st.days) { const cur = stops.find(q => q.id === dayStop[d]); if (!cur || st.dc[d] >= cur.dc[d]) dayStop[d] = st.id; }
  /* dias sem registo herdam a paragem anterior */
  const days = tripDays(t); let last = null;
  for (const d of days) { if (dayStop[d]) last = dayStop[d]; else if (last) dayStop[d] = last; }
  let nxt = null; for (let i = days.length - 1; i >= 0; i--) { if (dayStop[days[i]]) nxt = dayStop[days[i]]; else if (nxt) dayStop[days[i]] = nxt; }
  const tr = t.track || []; let km = 0;
  if (tr.length >= 6) for (let i = 3; i + 2 < tr.length; i += 3) km += haversineKm(tr[i - 3], tr[i - 2], tr[i], tr[i + 1]);
  else for (let i = 1; i < stops.length; i++) km += haversineKm(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng);
  const codes = new Set(stops.map(s => s.code).filter(Boolean)); const fc = findCountry(t.country); if (fc) codes.add(fc.code);
  let routePts = [];
  if (tr.length >= 6) { const step = Math.max(1, Math.ceil((tr.length / 3) / 900)); for (let i = 0; i + 2 < tr.length; i += 3 * step) routePts.push({ lat: tr[i], lng: tr[i + 1] }); }
  else routePts = stops.map(s => ({ lat: s.lat, lng: s.lng }));
  const res = { stops, dayStop, km, countries: [...codes], routePts };
  if (_stopMemo.size > 40) _stopMemo.clear();
  _stopMemo.set(sig, res); return res;
}
