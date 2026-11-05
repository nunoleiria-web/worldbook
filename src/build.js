const fs = require('fs'), path = require('path');
const d = __dirname, out = process.argv[2], standalone = process.argv.includes('--standalone');
const rd = f => fs.readFileSync(path.join(d, f), 'utf8');
const css = rd('style.css');
const m = css.match(/\/\*BOOK-START\*\/([\s\S]*?)\/\*BOOK-END\*\//);
if (!m) throw new Error('BOOK markers');
/* tipos de letra embebidos (WOFF, subconjunto latino) */
const FONT_META = {
  'InstrumentSerif-Regular': ['Instrument Serif', 400, 'normal'], 'InstrumentSerif-Italic': ['Instrument Serif', 400, 'italic'],
  'InstrumentSans-Regular': ['Instrument Sans', 400, 'normal'], 'InstrumentSans-Bold': ['Instrument Sans', 700, 'normal'], 'InstrumentSans-Italic': ['Instrument Sans', 400, 'italic'],
  'Lora-Regular': ['Lora', 400, 'normal'], 'Lora-Italic': ['Lora', 400, 'italic'], 'Lora-Bold': ['Lora', 700, 'normal'],
  'Gloock-Regular': ['Gloock', 400, 'normal'], 'DMMono-Regular': ['DM Mono', 400, 'normal']
};
const fonts = {};
for (const k of Object.keys(FONT_META)) {
  const [fam, w, st] = FONT_META[k];
  fonts[k] = `@font-face{font-family:"${fam}";font-weight:${w};font-style:${st};font-display:swap;src:url(data:font/woff;base64,${fs.readFileSync(path.join(d, 'fonts', k + '.woff')).toString('base64')}) format("woff")}`;
}
const js = (standalone ? rd('shim.js') + '\n' : '') + rd('world.js') + '\n' + rd('lib.js') + '\n' + rd('geodata.js') + '\n' + rd('geomap.js') + '\nconst FONT_FACES = ' + JSON.stringify(fonts) + ';\nconst BOOK_CSS = ' + JSON.stringify(m[1]) + ';\n' + rd('book.js') + '\n' + rd('app.js');
const safe = js.replace(/<\/script/gi, '<\\/script');
fs.writeFileSync(path.join(d, 'bundle.js'), safe);
const html = rd('template.html').replace('/*CSS*/', () => css).replace('/*JS*/', () => safe);
const wrapped = standalone ? '<!doctype html>\n<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n' + html + '\n</body></html>\n' : html;
fs.writeFileSync(out, wrapped);
console.log('ok', html.length);
