import json, io
from playwright.sync_api import sync_playwright
from PIL import Image
S='/tmp/claude-0/-home-claude/b39ebeaf-d692-5171-bcf0-8dcd27999322/scratchpad/'
def exif_img(path, dt, color):
    im=Image.new('RGB',(640,420),color); ex=Image.Exif(); ex[0x8769]={0x9003:dt}
    im.save(path,'JPEG',exif=ex)
exif_img(S+'g1.jpg','2025:05:03 12:30:00','#c33')
exif_img(S+'g2.jpg','2025:05:03 23:30:00','#36c')   # fora do percurso
timeline_ondevice=json.dumps([{
 "startTime":"2025-05-03T12:00:00.000+01:00","endTime":"2025-05-03T13:00:00.000+01:00",
 "activity":{"start":"geo:38.7200,-9.1400","end":"geo:38.7000,-9.1000"},
 "timelinePath":[{"point":"geo:38.7200,-9.1400","durationMinutesOffsetFromStartTime":"0"},{"point":"geo:38.7000,-9.1000","durationMinutesOffsetFromStartTime":"60"}]},
 {"startTime":"2025-04-01T10:00:00.000+01:00","endTime":"2025-04-01T11:00:00.000+01:00","visit":{"topCandidate":{"placeLocation":"geo:41.15,-8.61"}}}])
semantic=json.dumps({"semanticSegments":[{"startTime":"2025-05-03T12:00:00.000+01:00","endTime":"2025-05-03T13:00:00.000+01:00","timelinePath":[{"point":"38.72°, -9.14°","time":"2025-05-03T12:00:00.000+01:00"},{"point":"38.70°, -9.10°","time":"2025-05-03T13:00:00.000+01:00"}]}]})
gpx='<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="38.72" lon="-9.14"><time>2025-05-03T11:00:00Z</time></trkpt><trkpt lat="38.70" lon="-9.10"><time>2025-05-03T12:00:00Z</time></trkpt></trkseg></trk></gpx>'
legacy=json.dumps({"locations":[{"latitudeE7":387200000,"longitudeE7":-91400000,"timestamp":"2025-05-03T11:00:00Z"},{"latitudeE7":387000000,"longitudeE7":-91000000,"timestamp":"2025-05-03T12:00:00Z"}]})
kml='<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><Placemark><gx:Track><when>2025-05-03T11:00:00Z</when><gx:coord>-9.14 38.72 0</gx:coord><when>2025-05-03T12:00:00Z</when><gx:coord>-9.10 38.70 0</gx:coord></gx:Track></Placemark></Document></kml>'
exec(open(S+'test-page.py').read().split('errs=[]')[0].split('MOCK = ')[0].replace('import sys, json, io','').replace('from playwright.sync_api import sync_playwright','').replace('from PIL import Image',''))
MOCK_SRC=open(S+'test-page.py').read().split('MOCK = """')[1].split('"""')[0]
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'TUNNEL' not in m.text and '_blob' not in m.text else None)
    pg.route('**/*fonts.g*', lambda r: r.abort())
    pg.route('**/_blob/*', lambda r: r.fulfill(body=open(S+'g1.jpg','rb').read(), content_type='image/jpeg'))
    pg.add_init_script(MOCK_SRC)
    pg.goto('file://'+S+'album-de-viagens.html'); pg.wait_for_timeout(300)
    for name,txt in (('ondevice',timeline_ondevice),('semantic',semantic),('gpx',gpx),('legacy',legacy),('kml',kml)):
        r=pg.evaluate("""t=>{const pts=parseTrack(t);const b=buildTrack(pts,'2025-05-03','2025-05-03');return {n:pts.length,flat:b.flat,timed:b.timed,inRange:b.inRange}}""", txt)
        print(name, r['n'], r['flat'], r['timed'])
    pg.click('text=Nova viagem'); pg.fill('#f-title','Lisboa'); pg.fill('#f-country','Portugal'); pg.fill('#f-start','2025-05-03'); pg.fill('#f-end','2025-05-03')
    pg.click('button[type=submit]'); pg.wait_for_timeout(300)
    with pg.expect_file_chooser() as fc: pg.click('text=Adicionar fotos')
    fc.value.set_files([S+'g1.jpg',S+'g2.jpg']); pg.wait_for_timeout(1200)
    print('photos', pg.evaluate("[...__db.values()][0].photos.map(p=>[p.time,p.lat,p.lng])"))
    pg.click('text=Importar percurso'); pg.fill('#trk-text', timeline_ondevice); pg.wait_for_timeout(600)
    print('info:', pg.inner_text('.panel .mono').replace('\n',' | ')[:300])
    pg.click('text=Aplicar à viagem'); pg.wait_for_timeout(600)
    print('after', pg.evaluate("(()=>{const t=[...__db.values()][0];return {track:t.track,photos:t.photos.map(p=>[p.time,p.lat,p.lng,p.gt])}})()"))
    pg.screenshot(path=S+'shot-track.png', full_page=True)
    b.close()
print('ERRORS',errs)
