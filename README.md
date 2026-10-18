# Editor de equações - LQTSM (programa para Linux)

O editor publicado em <https://lqtsm.com.br/editor-equacoes/> empacotado com Electron,
para rodar offline. A interface é o `index.html` do site, sem alterações além das
trocas de URL (bibliotecas e fontes locais) e da frase do rodapé.

```
main.js                 processo principal: protocolo app://, janela, downloads, links, clipboard
preload.js              contextBridge (reserva de área de transferência)
app/index.html          a página do site, sincronizada por scripts/sincronizar_index.sh
app/fontes-edicao/      fontes do campo de edição (STIX Two, Pagella, Asana), copiadas do site
app/vendor/             MathLive 0.110.0, MathJax 4.1.3 + fontes (TeX, STIX Two, Pagella, Asana),
                        IBM Plex (gerado no npm install)
scripts/copiar_vendor.js   copia de node_modules para app/vendor (postinstall)
scripts/sincronizar_index.sh  reaplica as trocas de URL num index.html novo
build/icon.svg, icon.png   ícone (Σ nas cores do LQTSM)
test/editor.spec.js     teste Playwright para Electron
instalar.sh             npm ci + build + instalação (.deb ou AppImage) + .desktop
```

## Desenvolvimento

Requer Node.js 20+ e npm.

```bash
npm ci            # instala com versões fixas e gera app/vendor
npm start         # abre o programa
npm run debug     # idem, com DevTools (EDITOR_DEBUG=1)
npm test          # teste Playwright (num servidor sem tela: xvfb-run -a npm test)
```

Dados do usuário (histórico, recentes, tema, rascunho da demonstração, tamanho e
posição da janela, última pasta de download) ficam em `~/.config/editor-equacoes-lqtsm/`.

## Pacotes

```bash
npm run dist            # AppImage e .deb (x86_64) em dist/
npm run dist:appimage   # só AppImage
npm run dist:deb        # só .deb
```

Ou, de uma vez, `./instalar.sh` (`./instalar.sh deb` ou `./instalar.sh appimage`):
roda `npm ci`, gera o pacote, instala (o `.deb` com `sudo apt install`; o AppImage em
`~/.local/bin`) e cria a entrada `.desktop` do usuário com o ícone.

## Atualizar a partir de um `index.html` novo do site

```bash
scripts/sincronizar_index.sh /caminho/do/index.html   # copia para app/index.html e troca as URLs
npm test
npm run dist
```

O script faz sete substituições com `sed` e **falha** (exit 1) se qualquer uma não for
encontrada exatamente uma vez - sinal de que o site mudou a tag e o script precisa ser revisto:

1. os três `<link>` do Google Fonts → `vendor/fontes/ibm-plex.css` (`@font-face` locais);
2. `<link>` do `mathlive-static.css` → `vendor/mathlive/mathlive-static.css`;
3. `<script>` do `mathlive.min.js` → `vendor/mathlive/mathlive.min.js`;
4. `const URL_MATHJAX` → `vendor/mathjax/tex-svg-nofont.js`;
5. `const URL_FONTES_MATHLIVE` → `vendor/mathlive/fonts`;
6. `const URL_FONTE_MATHJAX` → `vendor/mathjax-fontes/mathjax-{fonte}-font` (fontes do SVG/PNG);
7. rodapé: "Tudo roda no seu navegador; nada é enviado a servidor. O histórico fica só neste
   navegador." → "Tudo roda no seu computador; nada é enviado a servidor. O histórico fica neste
   computador."

Se o site passar a outra versão do MathLive ou do MathJax, mude a versão em `package.json`
e os padrões correspondentes em `scripts/sincronizar_index.sh`. Se a lista `FONTES` da página
mudar, acrescente o pacote `@mathjax/mathjax-<fonte>-font` em `package.json` e o nome em
`FONTES_MATHJAX` de `scripts/copiar_vendor.js`.

## Como o programa adapta a página (e só isso)

- **Protocolo `app://`** registrado como `standard` + `secure`: `navigator.clipboard`,
  `ClipboardItem` e `localStorage` funcionam como em https. `contextIsolation`, `sandbox`
  e `nodeIntegration: false`.
- **Área de transferência**: o código da página roda igual. O `main.js` injeta um envoltório
  em `navigator.clipboard.write/writeText` que, só se a API do Chromium falhar, repassa ao
  preload (`window.lqtsmNativo`) e ao módulo `clipboard` do Electron (texto; SVG como texto
  e `image/svg+xml`; PNG com `nativeImage`).
- **Baixar SVG/PNG**: `session.on('will-download')` abre "Salvar como" com o nome sugerido
  pela página, na pasta Imagens (lembra a última pasta usada).
- **Links externos** (trilha "LQTSM · Materiais › Ferramentas", créditos do rodapé) abrem
  no navegador padrão; o link relativo `../materiais.html` é resolvido contra
  `https://lqtsm.com.br/`.
- **Janela**: título "Editor de equações - LQTSM", 1100×900 inicial, mínimo 420×600,
  tamanho e posição lembrados, sem barra de menu mas com Ctrl+C/V/X/Z/A e Ctrl+= / Ctrl+− /
  Ctrl+0; instância única; DevTools só com `EDITOR_DEBUG=1`.
