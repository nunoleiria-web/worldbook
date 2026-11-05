# Worldbook

Álbum de viagens: mapa-múndi com pinos e percurso, diário dia a dia, importação de fotos (data e GPS lidos do EXIF), calendário anual, vista de fotos, "Neste dia", modo discreto e livro de viagem exportável em HTML.

## Estrutura
- `src/` código-fonte (`world.js` mapa e países, `lib.js` funções puras, `app.js` interface, `style.css`, `template.html`, `build.js`)
- `dist/album-de-viagens.html` página já montada
- `tests/` testes (`src/test-lib.js` para as funções puras; `tests/test-page.py` com Playwright e um `window.claude` simulado)

## Montar
```
node src/build.js docs/index.html --standalone     # versão pública (GitHub Pages), guarda tudo no navegador
node src/build.js dist/album-de-viagens.html       # versão para artefacto Claude
```

## Versão pública
`docs/index.html` usa `src/shim.js`: viagens e fotos ficam guardadas no próprio navegador (IndexedDB), sem servidor e sem conta. Cada pessoa vê apenas o seu álbum. Limitações: os dados não passam de um dispositivo para outro e apagam-se se limpares os dados do site.

## Notas
- O mapa é simplificado e desenhado à mão; o país sugerido pelo GPS é aproximado.
