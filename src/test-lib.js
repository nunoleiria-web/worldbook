const fs = require('fs');
const dir = process.argv[2];
const code = fs.readFileSync(dir + '/world.js', 'utf8') + '\n' + fs.readFileSync(dir + '/lib.js', 'utf8') +
  '\nreturn {project,unproject,MAP_H,haversineKm,parseExif,findCountry,nearestCountry,groupByDate,tripPoint,tripDays,tripDayCount,LAND,SEAS,COUNTRIES,polyPath,slug,addDays,diffDays,parseYmd};';
const L = new Function(code)();
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FALHOU:', m); } else console.log('ok:', m); };

/* projeção ida e volta */
for (const [lo, la] of [[-9.14, 38.7], [139.7, 35.7], [-74, 40.7], [151.2, -33.9], [0, 0], [-170, 65], [178, -17], [28, -26]]) {
  const [x, y] = L.project(lo, la), [lo2, la2] = L.unproject(x, y);
  ok(Math.abs(lo - lo2) < 1e-6 && Math.abs(la - la2) < 1e-6, `projeção ${lo},${la} -> ${lo2.toFixed(3)},${la2.toFixed(3)}`);
}
const [tx, ty] = L.project(0, 84), [bx, by] = L.project(0, -58);
ok(Math.abs(ty) < 1e-6 && Math.abs(by - L.MAP_H) < 1e-6, `altura do mapa ${L.MAP_H.toFixed(1)}`);
const [lx, ly] = L.project(-180, 0), [rx] = L.project(180, 0);
ok(Math.abs(lx) < 1e-6 && Math.abs(rx - 1000) < 1e-6, 'largura do mapa 0..1000');

/* polígonos dentro dos limites e simples (sem NaN) */
let bad = 0;
for (const p of L.LAND.concat(L.SEAS)) {
  for (const pt of p.split(' ')) { const [lo, la] = pt.split(',').map(Number); if (!isFinite(lo) || !isFinite(la) || Math.abs(lo) > 180 || la > 84 || la < -90) { bad++; console.log('ponto mau', pt); } }
  const d = L.polyPath(p); if (/NaN/.test(d)) bad++;
}
ok(bad === 0, `polígonos válidos (${L.LAND.length} de terra, ${L.SEAS.length} mares)`);

/* pontos de referência caem dentro da terra desenhada: teste por ray casting em lon/lat */
function inside(poly, lo, la) {
  const pts = poly.split(' ').map(s => s.split(',').map(Number));
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > la) !== (yj > la) && lo < (xj - xi) * (la - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const onLand = (lo, la) => L.LAND.some(p => inside(p, lo, la)) && !L.SEAS.some(p => inside(p, lo, la));
const refs = { Lisboa: [-9.14, 38.72], Madrid: [-3.7, 40.4], Paris: [2.35, 48.85], Roma: [12.5, 41.9], Berlim: [13.4, 52.5], Londres: [-0.12, 51.5],
  Moscovo: [37.6, 55.75], Istambul: [28.98, 41.0], Cairo: [31.2, 30], Nairobi: [36.8, -1.3], Joanesburgo: [28, -26.2], Lagos: [3.4, 6.5],
  Dubai: [55.3, 25.3], Delhi: [77.2, 28.6], Banguecoque: [100.5, 13.75], Pequim: [116.4, 39.9], Toquio: [139.7, 35.7], Sydney: [151.2, -33.9],
  NovaIorque: [-74, 40.7], LosAngeles: [-118.2, 34], Mexico: [-99.1, 19.4], Bogota: [-74.1, 4.7], Lima: [-77, -12], SaoPaulo: [-46.6, -23.5],
  BuenosAires: [-58.4, -34.6], Reiquiavique: [-21.9, 64.1], Dublin: [-6.3, 53.3], Havana: [-82.4, 23.1], Singapura: [103.8, 1.3], Auckland: [174.8, -36.9],
  Faro: [-7.9, 37.0], Porto: [-8.6, 41.15], Marraquexe: [-8, 31.6], CidadeDoCabo: [18.4, -33.9], Vancouver: [-123.1, 49.3], Chicago: [-87.6, 41.9],
  Atenas: [23.7, 38], Sofia: [23.3, 42.7], Helsinquia: [24.9, 60.2], Oslo: [10.7, 59.9], Copenhaga: [12.6, 55.7], Taipei: [121.5, 25] };
let missing = [];
for (const [n, [lo, la]] of Object.entries(refs)) if (!onLand(lo, la)) missing.push(n);
console.log('cidades fora da terra desenhada:', missing.join(', ') || 'nenhuma');
ok(missing.length <= 6, `cidades dentro da terra (${Object.keys(refs).length - missing.length}/${Object.keys(refs).length})`);

/* oceano onde deve ser oceano */
const sea = { Atlantico: [-30, 30], Pacifico: [-150, 0], Indico: [75, -20], Mediterraneo: [18, 35], GolfoMexico: [-90, 25], Caspio: [51, 41], MarNegro: [34, 43], MarNorte: [3, 56] };
let wet = [];
for (const [n, [lo, la]] of Object.entries(sea)) if (onLand(lo, la)) wet.push(n);
ok(wet.length === 0, 'mares sem terra por cima: ' + (wet.join(', ') || 'ok'));

/* EXIF sintético (little-endian, com GPS sul/oeste) */
function buildJpeg(le, date, lat, latRef, lng, lngRef) {
  const w16 = (a, o, v) => { a[o] = le ? v & 255 : v >> 8; a[o + 1] = le ? v >> 8 : v & 255; };
  const w32 = (a, o, v) => { if (le) { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; a[o + 2] = (v >> 16) & 255; a[o + 3] = (v >>> 24) & 255; } else { a[o] = (v >>> 24) & 255; a[o + 1] = (v >> 16) & 255; a[o + 2] = (v >> 8) & 255; a[o + 3] = v & 255; } };
  const t = new Uint8Array(400);
  t[0] = le ? 0x49 : 0x4D; t[1] = t[0]; w16(t, 2, 42); w32(t, 4, 8);
  // IFD0 em 8: 2 entradas (ExifIFD ptr, GPS ptr)
  w16(t, 8, 2);
  w16(t, 10, 0x8769); w16(t, 12, 4); w32(t, 14, 1); w32(t, 18, 38);
  w16(t, 22, 0x8825); w16(t, 24, 4); w32(t, 26, 1); w32(t, 30, 100);
  w32(t, 34, 0);
  // ExifIFD em 38: 1 entrada DateTimeOriginal -> dados em 200
  w16(t, 38, 1); w16(t, 40, 0x9003); w16(t, 42, 2); w32(t, 44, 20); w32(t, 48, 200); w32(t, 52, 0);
  for (let i = 0; i < date.length; i++) t[200 + i] = date.charCodeAt(i);
  // GPS IFD em 100: 4 entradas
  w16(t, 100, 4);
  w16(t, 102, 1); w16(t, 104, 2); w32(t, 106, 2); t[110] = latRef.charCodeAt(0);
  w16(t, 114, 2); w16(t, 116, 5); w32(t, 118, 3); w32(t, 122, 230);
  w16(t, 126, 3); w16(t, 128, 2); w32(t, 130, 2); t[134] = lngRef.charCodeAt(0);
  w16(t, 138, 4); w16(t, 140, 5); w32(t, 142, 3); w32(t, 146, 260);
  const dms = (v, off) => { const d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 60 * 100); w32(t, off, d); w32(t, off + 4, 1); w32(t, off + 8, m); w32(t, off + 12, 1); w32(t, off + 16, s); w32(t, off + 20, 100); };
  dms(lat, 230); dms(lng, 260);
  const body = new Uint8Array(6 + 400); body.set([0x45, 0x78, 0x69, 0x66, 0, 0]); body.set(t, 6);
  const out = new Uint8Array(2 + 2 + 2 + body.length + 2);
  out[0] = 0xFF; out[1] = 0xD8; out[2] = 0xFF; out[3] = 0xE1; const len = body.length + 2; out[4] = len >> 8; out[5] = len & 255; out.set(body, 6); out[out.length - 2] = 0xFF; out[out.length - 1] = 0xD9;
  return out.buffer;
}
for (const le of [true, false]) {
  const r = L.parseExif(buildJpeg(le, '2024:07:15 18:30:05\0', 38.7223, 'N', 9.1393, 'W'));
  ok(r && r.date === '2024-07-15' && r.time === '18:30:05', `EXIF data (${le ? 'LE' : 'BE'}): ${r && r.date} ${r && r.time}`);
  ok(r && Math.abs(r.lat - 38.7223) < 0.001 && Math.abs(r.lng + 9.1393) < 0.001, `EXIF GPS (${le ? 'LE' : 'BE'}): ${r && r.lat.toFixed(4)}, ${r && r.lng.toFixed(4)}`);
}
const s = L.parseExif(buildJpeg(true, '2023:01:02 03:04:05\0', 33.8688, 'S', 151.2093, 'E'));
ok(s && s.lat < 0 && s.lng > 0, `EXIF hemisférios S/E: ${s && s.lat.toFixed(3)}, ${s && s.lng.toFixed(3)}`);
ok(L.parseExif(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer) === null, 'EXIF devolve null para lixo');
ok(L.parseExif(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0, 8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer) === null, 'EXIF devolve null para APP1 truncado');

/* países */
const eq = (a, b, m) => ok(a === b, `${m}: ${a}`);
eq(L.findCountry('Itália').code, 'IT', 'Itália');
eq(L.findCountry('italia').code, 'IT', 'italia sem acento');
eq(L.findCountry('EUA').code, 'US', 'EUA');
eq(L.findCountry('Açores').code, 'PT', 'Açores');
eq(L.findCountry('Holanda').code, 'NL', 'Holanda');
eq(L.findCountry('  Reino  Unido ').code, 'GB', 'Reino Unido com espaços');
eq(L.findCountry('Tailândia').code, 'TH', 'Tailândia');
eq(L.findCountry('Narnia'), null, 'país desconhecido');
eq(L.nearestCountry(38.72, -9.14).code, 'PT', 'GPS Lisboa -> Portugal');
eq(L.nearestCountry(41.9, 12.5).code, 'IT', 'GPS Roma -> Itália');
eq(L.nearestCountry(35.7, 139.7).code, 'JP', 'GPS Tóquio -> Japão');
const dup = L.COUNTRIES.map(c => c.code).filter((c, i, a) => a.indexOf(c) !== i);
ok(dup.length === 0, 'códigos de país únicos');

/* agrupamento por datas */
const items = [['2024-03-01'], ['2024-03-02'], ['2024-03-04'], ['2024-03-20'], ['2024-03-21'], ['2024-08-01']].map(([date]) => ({ date, time: '10:00:00' }));
const g = L.groupByDate(items.reverse(), 2);
ok(g.length === 3 && g[0].items.length === 3 && g[0].end === '2024-03-04' && g[1].start === '2024-03-20', `agrupamento por datas: ${g.map(x => x.start + '..' + x.end).join(' | ')}`);

/* viagem */
const trip = { start: '2025-05-10', end: '2025-05-13', country: 'França', photos: [{ date: '2025-05-15' }, { date: '2025-05-11', lat: 48.85, lng: 2.35 }], days: { '2025-05-12': 'Museu', '2025-05-09': '  ' } };
eq(L.tripDays(trip).join(','), '2025-05-10,2025-05-11,2025-05-12,2025-05-13,2025-05-15', 'dias da viagem');
eq(L.tripDayCount(trip), 4, 'contagem de dias');
eq(L.tripPoint(trip).src, 'fotos', 'localização vem das fotos');
eq(L.tripPoint({ country: 'França' }).src, 'pais', 'localização vem do país');
eq(L.tripPoint({ country: 'xx' }), null, 'sem localização');
eq(L.tripPoint({ lat: 1, lng: 2, country: 'França' }).src, 'manual', 'localização manual tem prioridade');
eq(L.addDays('2024-02-28', 2), '2024-03-01', 'addDays ano bissexto');
eq(L.diffDays('2024-12-30', '2025-01-02'), 3, 'diffDays');
eq(L.parseYmd('2025-02-30'), null, 'data inválida');
eq(L.slug('Dolomitas & Veneza!'), 'dolomitas-veneza', 'slug');

console.log(fails ? `\n${fails} testes falharam` : '\ntodos os testes passaram');
process.exit(fails ? 1 : 0);
