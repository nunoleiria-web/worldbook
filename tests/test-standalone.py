import io
from playwright.sync_api import sync_playwright
from PIL import Image
S='/tmp/claude-0/-home-claude/b39ebeaf-d692-5171-bcf0-8dcd27999322/scratchpad/'
for n,c in (('f1','#c33'),('f2','#36c')):
    Image.new('RGB',(800,500),c).save(S+n+'.jpg','JPEG')
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1100,'height':800}); pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'TUNNEL' not in m.text else None)
    pg.route('**/*fonts.g*', lambda r: r.abort()); pg.goto('http://localhost:8123/'); pg.wait_for_timeout(500)
    pg.click('text=Nova viagem'); pg.fill('#f-title','Algarve'); pg.fill('#f-country','Portugal'); pg.fill('#f-start','2026-08-01'); pg.fill('#f-end','2026-08-03')
    pg.click('button[type=submit]'); pg.wait_for_timeout(400)
    with pg.expect_file_chooser() as fc: pg.click('text=Adicionar fotos')
    fc.value.set_files([S+'f1.jpg',S+'f2.jpg']); pg.wait_for_timeout(1200)
    print('imgs',pg.evaluate("[...document.querySelectorAll('.wall img')].map(i=>i.naturalWidth)"))
    pg.reload(); pg.wait_for_timeout(800); pg.click('text=Todas as viagens')
    pg.click('#tab-viagens'); pg.wait_for_timeout(300)
    print('after reload cards',pg.locator('.card').count(), pg.evaluate("[...document.querySelectorAll('.card img')].map(i=>i.naturalWidth)"))
    pg.click('.card >> nth=0'); pg.wait_for_timeout(300)
    pg.click('text=Abrir o livro'); pg.wait_for_timeout(600)
    print('book pages', pg.evaluate('bk.book.pages.length'), 'fonts', pg.evaluate("[...document.fonts].filter(f=>f.status=='loaded').length"))
    pg.click('.bk >> text=Editar'); pg.click('.bk >> text=Capa >> nth=0') if False else None
    pg.click('.bk >> text=Fechar'); pg.wait_for_timeout(200)
    # import flow
    pg.click('text=Todas as viagens'); 
    with pg.expect_file_chooser() as fc: pg.click('text=Importar fotos')
    fc.value.set_files([S+'f1.jpg',S+'f2.jpg']); pg.wait_for_timeout(800)
    pg.click('text=/Criar 1 viagem/'); pg.wait_for_timeout(1500)
    print('trips now', pg.evaluate("document.querySelector('h1').textContent"))
    pg.screenshot(path=S+'shot-standalone.png')
    b.close()
print('ERRORS',errs)
