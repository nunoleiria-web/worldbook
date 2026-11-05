# Worldbook

Álbum de viagens: mapa-múndi com pinos e percurso, diário dia a dia, importação de fotos (data e GPS lidos do EXIF), calendário anual, vista de fotos, "Neste dia", modo discreto e livro de viagem exportável em HTML.

## Estrutura
- `src/` código-fonte (`world.js` mapa e países, `lib.js` funções puras, `app.js` interface, `style.css`, `template.html`, `build.js`)
- `dist/album-de-viagens.html` página já montada
- `tests/` testes (`src/test-lib.js` para as funções puras; `tests/test-page.py` com Playwright e um `window.claude` simulado)

## Montar
```
node src/build.js dist/album-de-viagens.html
```

## Notas
- Foi feita como artefacto Claude: guarda dados e fotos através de `window.claude` (`db`, `assets`, `user`, `downloads`). Fora desse ambiente a página abre, mas não guarda nada; para uso independente é preciso trocar essa camada de armazenamento.
- O mapa é simplificado e desenhado à mão; o país sugerido pelo GPS é aproximado.
