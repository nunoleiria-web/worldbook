import sys, json, io
from playwright.sync_api import sync_playwright
from PIL import Image
S = '/tmp/claude-0/-home-claude/b39ebeaf-d692-5171-bcf0-8dcd27999322/scratchpad/'
def jpg(c):
    b = io.BytesIO(); Image.new('RGB',(640,420),c).save(b,'JPEG'); return b.getvalue()
MOCK = """
(() => {
  const docs = new Map(); const subs = new Set(); let n = 0;
  const snap = () => ({docs:[...docs].map(([id,d])=>({id,data:()=>JSON.parse(JSON.stringify(d))}))});
  const fire = () => subs.forEach(f=>f(snap()));
  const merge=(a,b)=>{for(const k in b){ if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])) {a[k]=merge(a[k]||{},b[k])} else a[k]=b[k]} return a};
  const db = { collection: p => ({
      onSnapshot: (f)=>{subs.add(f); setTimeout(()=>f(snap()),10); return ()=>subs.delete(f)},
      add: async d=>{const id='t'+(++n); docs.set(id,JSON.parse(JSON.stringify(d))); fire(); return {id}} }),
    doc: p => { const id=p.split('/')[1]; return {
      update: async d=>{ if(!docs.has(id)) throw new Error('x'); merge(docs.get(id),JSON.parse(JSON.stringify(d))); fire()},
      delete: async()=>{docs.delete(id); fire()} } } };
  const assets = { upload: async b => ({id:'a'+(++n), url:'/_blob/a'+n}), delete: async()=>{} };
  window.__saved=[];
  window.claude = { use: async name => ({db, assets, user:{canEdit:()=>true}, downloads:{save:async x=>{window.__saved.push(x.filename)}}}[name]||null) };
  window.__db = docs;
})();
"""
errs=[]
with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme, vp in (('light',{'width':1200,'height':900}),('dark',{'width':390,'height':800})):
        ctx = b.new_context(viewport=vp, color_scheme=scheme, device_scale_factor=1)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'fonts' not in m.text else None)
        pg.route('**/*fonts.g*', lambda r: r.abort())
        pg.route('**/_blob/*', lambda r: r.fulfill(body=jpg('#3a7'), content_type='image/jpeg'))
        pg.add_init_script(MOCK)
        pg.goto('file://'+S+'album-de-viagens.html')
        pg.wait_for_timeout(300)
        # create trip via form
        pg.click('text=Nova viagem'); pg.fill('#f-title','Lisboa e Porto'); pg.fill('#f-country','Portugal')
        pg.fill('#f-start','2025-05-03'); pg.fill('#f-end','2025-05-06'); pg.fill('#f-tags','cidade, família')
        pg.click('button[type=submit]'); pg.wait_for_timeout(300)
        # add photos
        open(S+'f1.jpg','wb').write(jpg('#c33')); open(S+'f2.jpg','wb').write(jpg('#36c'))
        with pg.expect_file_chooser() as fc: pg.click('text=Adicionar fotos')
        fc.value.set_files([S+'f1.jpg',S+'f2.jpg']); pg.wait_for_timeout(1000)
        pg.fill('#day-2025-05-03','Chegámos e fomos ver o rio.'); pg.dispatch_event('#day-2025-05-03','change'); pg.wait_for_timeout(200)
        pg.screenshot(path=S+f'shot-trip-{scheme}.png', full_page=True)
        # second trip & tabs
        pg.click('text=Todas as viagens'); pg.wait_for_timeout(200)
        pg.click('text=Nova viagem'); pg.fill('#f-title','Japão'); pg.fill('#f-country','Japão'); pg.fill('#f-start','2024-10-01'); pg.fill('#f-end','2024-10-12')
        pg.click('button[type=submit]'); pg.wait_for_timeout(300)
        pg.click('text=Todas as viagens'); pg.wait_for_timeout(200)
        for tab in ('mapa','viagens','ano','fotos'):
            pg.click(f'#tab-{tab}'); pg.wait_for_timeout(250)
            pg.screenshot(path=S+f'shot-{tab}-{scheme}.png', full_page=True)
        # book + export
        pg.click('#tab-viagens'); pg.click('.card >> nth=0'); pg.wait_for_timeout(200)
        pg.click('text=Ver como livro'); pg.wait_for_timeout(300)
        pg.screenshot(path=S+f'shot-book-{scheme}.png')
        pg.click('.bk >> text=Exportar'); pg.wait_for_timeout(1200)
        print(scheme,'saved',pg.evaluate('window.__saved'), 'overflowX', pg.evaluate('document.documentElement.scrollWidth>innerWidth'))
        ctx.close()
    b.close()
print('ERRORS',errs)
