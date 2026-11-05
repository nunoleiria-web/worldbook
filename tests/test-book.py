import sys, json, io, random, colorsys
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
S = '/tmp/claude-0/-home-claude/b39ebeaf-d692-5171-bcf0-8dcd27999322/scratchpad/'
random.seed(7)
ARS = [(3,2),(2,3),(1,1),(16,9),(4,5),(3,2),(3,2),(2,3),(3,1),(4,3),(3,4),(3,2),(16,9),(2,3),(3,2),(1,1),(3,2),(4,5),(3,2),(2,3),(3,2),(16,9),(3,2),(3,4),(3,2),(2,3),(4,3),(3,2),(1,1),(3,2),(16,9),(2,3),(3,2),(3,2)]
DAYS = ['2026-01-22','2026-01-23','2026-01-24','2026-01-25','2026-01-26','2026-01-27','2026-01-28']
# distribuição de fotos por dia
per = [2,7,8,6,5,4,2]
photos=[]; k=0
for di,n in enumerate(per):
    for j in range(n):
        a,b = ARS[k%len(ARS)]
        photos.append({'id':f'p{k}','w':int(1600*a/max(a,b)) if a>=b else int(1600*a/b),'h':int(1600*b/max(a,b)) if b>a else int(1600*b/a),'caption':'' ,'date':DAYS[di],'time':f'{9+j}:{(j*7)%60:02d}:00'.replace('9:','09:'),'fav': (k%11==3)})
        # normalize sizes
        if a>=b: photos[-1]['w']=1600; photos[-1]['h']=round(1600*b/a)
        else: photos[-1]['h']=1600; photos[-1]['w']=round(1600*a/b)
        k+=1
photos[4]['caption']='Pôr do sol sobre o Danúbio'
photos[9]['caption']='Café no bairro judeu'
def img(i):
    p=photos[int(i[1:])]; w,h=p['w']//2,p['h']//2
    im=Image.new('RGB',(w,h)); d=ImageDraw.Draw(im)
    hue=(int(i[1:])*0.083)%1
    c1=tuple(int(x*255) for x in colorsys.hsv_to_rgb(hue,.55,.85)); c2=tuple(int(x*255) for x in colorsys.hsv_to_rgb((hue+.08)%1,.7,.35))
    for y in range(h):
        t=y/h; d.line([(0,y),(w,y)],fill=tuple(int(c1[q]*(1-t)+c2[q]*t) for q in range(3)))
    d.ellipse([w*.55,h*.15,w*.85,h*.15+w*.3],fill=(255,240,200))
    d.polygon([(0,h),(w*.3,h*.55),(w*.55,h*.8),(w*.8,h*.5),(w,h)],fill=(20,25,30))
    d.rectangle([0,0,w-1,h-1],outline=(255,255,255),width=6)
    d.text((w*.05,h*.05),f"{i}  {p['w']}x{p['h']}",fill=(255,255,255))
    b=io.BytesIO(); im.save(b,'JPEG',quality=85); return b.getvalue()
trip=json.load(open(S+'budapeste.json'))
trip['photos']=photos; trip['cover']='p3'
MOCK = """
(() => {
  const docs = new Map(); const subs = new Set();
  const snap = () => ({docs:[...docs].map(([id,d])=>({id,data:()=>JSON.parse(JSON.stringify(d))}))});
  const fire = () => subs.forEach(f=>f(snap()));
  const merge=(a,b)=>{for(const k in b){ if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])) {a[k]=merge(a[k]||{},b[k])} else a[k]=b[k]} return a};
  docs.set('bp', %s);
  const db = { collection: p => ({ onSnapshot: (f)=>{subs.add(f); setTimeout(()=>f(snap()),10); return ()=>subs.delete(f)}, add: async d=>{} }),
    doc: p => { const id=p.split('/')[1]; return {
      update: async d=>{ merge(docs.get(id),JSON.parse(JSON.stringify(d))); window.__upd=(window.__upd||0)+1; fire()}, delete: async()=>{} } } };
  window.__saved=[];
  window.claude = { use: async name => ({db, assets:{upload:async()=>({id:'x'}),delete:async()=>{}}, user:{canEdit:()=>true}, downloads:{save:async x=>{window.__saved.push(x); window.__blob=x.data}}}[name]||null) };
  window.__db = docs;
})();
""" % json.dumps(trip)
errs=[]
mode = sys.argv[1] if len(sys.argv)>1 else 'view'
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width':1440,'height':900}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.route('**/*fonts.g*', lambda r: r.abort())
    import re
    def blob(r):
        m=re.search(r'/_blob/(p\d+)',r.request.url)
        r.fulfill(body=img(m.group(1)),content_type='image/jpeg')
    pg.route('**/_blob/*', blob)
    pg.add_init_script(MOCK)
    pg.goto('http://localhost:8124/t.html')
    pg.wait_for_timeout(500)
    pg.click('#tab-viagens'); pg.click('.card >> nth=0'); pg.wait_for_timeout(300)
    pg.click('text=Abrir o livro'); pg.wait_for_timeout(600)
    n = pg.evaluate('bk.book.pages.length')
    print('pages',n, [x['t'] for x in pg.evaluate('bk.book.pages')])
    if mode=='dbg':
        pg.evaluate("bkGoto(0,true)"); pg.wait_for_timeout(400)
        print(pg.evaluate("(()=>{const s=document.querySelector('.spread');return [s.innerHTML.length,s.children.length,[...s.children].map(c=>c.getBoundingClientRect().width+'x'+c.getBoundingClientRect().height+' '+c.className), getComputedStyle(s).opacity, s.className]})()"))
        print(pg.evaluate("[...document.fonts].map(f=>f.family+' '+f.style+' '+f.status)")); print(pg.evaluate("getComputedStyle(document.querySelector('.pg h1, .pg h2, .pg .num')).fontFamily")); print(errs); sys.exit()
    if mode=='pdf':
        import base64,time
        pg.evaluate("bkSetTheme('revista')"); pg.wait_for_timeout(200)
        t0=time.time(); pg.click('.bk >> text=PDF')
        pg.wait_for_function('window.__saved.length>0',timeout=240000)
        print('pdf secs',time.time()-t0)
        b64=pg.evaluate("new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(window.__saved[0].data)})")
        open(S+'out.pdf','wb').write(base64.b64decode(b64)); print('size',len(base64.b64decode(b64))/1e6)
        pg.click('.bk >> text=HTML'); pg.wait_for_function('window.__saved.length>1',timeout=120000)
        b64=pg.evaluate("new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(window.__saved[1].data)})")
        open(S+'out.html','wb').write(base64.b64decode(b64)); print('html',len(base64.b64decode(b64))/1e6)
        print(errs); sys.exit()
    if mode=='edit':
        pg.click('.bk >> text=Editar'); pg.wait_for_timeout(200)
        pg.evaluate('bkGoto(3,true)'); pg.wait_for_timeout(300)
        pg.screenshot(path=S+'bk/e1.png')
        pg.click('.bk .spread .pg[data-page="6"]'); pg.wait_for_timeout(200)
        pg.click('.bk .tools >> text=Outra disposição'); pg.wait_for_timeout(300)
        pg.screenshot(path=S+'bk/e2.png')
        # editar texto
        pg.evaluate('bkGoto(2,true)'); pg.wait_for_timeout(300)
        t=pg.locator('.bk .spread .tx.body').first
        t.click(); pg.keyboard.press('Control+End'); pg.keyboard.type(' Texto novo adicionado.'); pg.click('.bk .bar h3'); pg.wait_for_timeout(400)
        print('text', pg.evaluate('bk.book.pages[3].text.slice(-30)'))
        # drag foto
        ph=pg.locator('.bk .spread .pg[data-page="4"] .ph').first
        bb=ph.bounding_box(); pg.mouse.move(bb['x']+20,bb['y']+20); pg.mouse.down(); pg.mouse.move(bb['x']+60,bb['y']+50,steps=5); pg.mouse.up(); pg.wait_for_timeout(300)
        print('focus', pg.evaluate('JSON.stringify(bk.book.pages[4].focus||bk.book.pages[3].focus)'), 'upd', pg.evaluate('window.__upd'))
        pg.click('.bk .tools >> text=Tirar'); pg.wait_for_timeout(300)
        print('unused', pg.evaluate("bookUnused(tripById(bk.tid),bk.book).length"))
        pg.click('.bk .tools >> text=Acrescentar todas'); pg.wait_for_timeout(300)
        print('pages', pg.evaluate('bk.book.pages.length'), 'saved', pg.evaluate("!!tripById(bk.tid).book"))
        pg.set_viewport_size({'width':390,'height':800}); pg.wait_for_timeout(500); pg.screenshot(path=S+'bk/e3.png')
        print(errs); sys.exit()
    if mode=='site':
        pg.evaluate('closeBook()'); pg.evaluate("location.hash='mapa'"); pg.wait_for_timeout(300)
        pg.wait_for_timeout(300)
        for tab in ['mapa','viagens','fotos']:
            pg.click('#tab-'+tab); pg.wait_for_timeout(300); pg.screenshot(path=S+f'bk/s-{tab}.png')
        pg.click('#tab-viagens'); pg.click('.card >> nth=0'); pg.wait_for_timeout(400); pg.screenshot(path=S+'bk/s-trip.png',full_page=True)
        pg.wait_for_timeout(2200); pg.evaluate('window.scrollTo(0,420)'); pg.wait_for_timeout(1500); pg.screenshot(path=S+'bk/s-trip-vp.png')
        pg.evaluate('window.scrollTo(0,1500)'); pg.wait_for_timeout(1600); pg.screenshot(path=S+'bk/s-trip-cards.png')
        pg.set_viewport_size({'width':390,'height':844}); pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(900); pg.screenshot(path=S+'bk/s-trip-m1.png')
        pg.evaluate('window.scrollTo(0,1300)'); pg.wait_for_timeout(1200); pg.screenshot(path=S+'bk/s-trip-m2.png')
        pg.set_viewport_size({'width':1440,'height':900}); pg.wait_for_timeout(400)
        pg.click('.tx-tabs button:nth-child(3)'); pg.wait_for_timeout(2000); pg.screenshot(path=S+'bk/s-trip-vp2.png')
        pg.evaluate("location.hash='mapa'"); pg.wait_for_timeout(1800); pg.screenshot(path=S+'bk/s-mapa.png')
        print(errs); sys.exit()
    themes = ['revista','classico','galeria','noite'] if mode=='themes' else ['revista']
    for th in themes:
        pg.evaluate(f"bkSetTheme('{th}')"); pg.wait_for_timeout(200)
        sp = pg.evaluate('bkSpreadList().length')
        for i in range(sp):
            pg.evaluate(f'bkGoto({i},true)'); pg.wait_for_timeout(250)
            pg.screenshot(path=S+f'bk/{th}-{i:02d}.png')
    pg.screenshot(path=S+'bk/last.png')
    print('ERRORS',errs)
    b.close()
