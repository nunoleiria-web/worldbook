# Worldbook

Álbum de viagens: mapa-múndi com pinos e percurso, diário dia a dia, importação de fotos (data e GPS lidos do EXIF), calendário anual, vista de fotos, "Neste dia", modo discreto e livro de fotografias paginado automaticamente (4 temas, editor, PDF).

## Funcionalidades
- Mapa-múndi com pinos, percurso entre viagens e países visitados
- Diário dia a dia, calendário do ano, vista de fotos, pesquisa e "Neste dia"
- Importar fotos: agrupa por data, lê data/hora e GPS (EXIF) e propõe viagens
- Importar percurso GPS (JSON da Linha cronológica do Google Maps, GPX, KML, GeoJSON) e associar às fotos pela hora
- Livro de fotografias: paginação automática com colagens sem cortes (por proporção de cada foto), capa, mapa com o percurso, abertura de cada dia, páginas inteiras para destaques e panorâmicas, fecho com estatísticas; 4 temas (Revista, Clássico, Galeria, Noite), 3 formatos, editor de páginas (disposição, mover, texto, enquadramento, legendas) e exportação para PDF (~170 ppp, tipos de letra embebidos) e HTML
- Cópia de segurança e restauro (versão pública)
- Modo discreto (desfoca fotos e textos)

## Estrutura
- `src/` código-fonte (`world.js` mapa e países, `lib.js` funções puras, `geodata.js`/`geomap.js` mapa cartográfico real (Natural Earth 1:10M, gerado por `src/geo/build-geo.js`), `book.js` motor do livro, `fonts/` tipos de letra (OFL) embebidos, `app.js` interface, `style.css`, `template.html`, `build.js`)
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

## Testes
`node src/test-lib.js src` corre os testes das funções puras. Os scripts em `tests/` (Playwright) foram escritos para o ambiente de desenvolvimento: têm caminhos fixos para ficheiros temporários e, no caso dos `standalone`, esperam um servidor local na porta 8123 com `docs/index.html`. É preciso ajustá-los para correr noutra máquina.

## Mapa

O mapa usa dados do [Natural Earth](https://www.naturalearthdata.com/) (domínio público), simplificados e embebidos em `src/geodata.js` (sem pedidos externos). Para regenerar: `node src/geo/build-geo.js <pasta com os geojson do Natural Earth>`. Escala 1:10M: nomes de cidades e fronteiras, sem ruas.
