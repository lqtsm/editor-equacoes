# Editor de equações - LQTSM (programa para Linux)

O editor publicado em <https://lqtsm.com.br/editor-equacoes/> empacotado com Electron,
para rodar offline. A interface é o `index.html` do site, sem alterações além das
trocas de URL (bibliotecas e fontes locais) e da frase do rodapé.

## Instalar

Baixe a versão mais recente em [Releases](https://github.com/lqtsm/editor-equacoes/releases/latest):

- **Ubuntu, Debian, Mint** (`.deb`):
  ```bash
  sudo apt install ./editor-equacoes-lqtsm_amd64.deb
  ```
  O programa aparece no menu de aplicativos como "Editor de equações - LQTSM".
- **Qualquer Linux** (AppImage, sem instalar):
  ```bash
  chmod +x editor-equacoes-lqtsm_x86_64.AppImage
  ./editor-equacoes-lqtsm_x86_64.AppImage
  ```

- **Windows 10 e 11**: `editor-equacoes-lqtsm_setup.exe` (instalador) ou
  `editor-equacoes-lqtsm_portable.exe` (roda sem instalar). Os `.exe` não são assinados:
  na primeira vez o Windows mostra "O Windows protegeu o computador"; clique em
  **Mais informações › Executar assim mesmo**.

Só para x86_64 (64 bits, Intel/AMD). Ou use direto no navegador:
<https://lqtsm.com.br/editor-equacoes/>.

```
main.js                 processo principal: protocolo app://, janela, downloads, links, clipboard
preload.js              contextBridge (reserva de área de transferência)
app/index.html          a página do site, sincronizada por scripts/sincronizar_index.sh
app/fontes-edicao/      fontes do campo de edição (STIX Two, Pagella, Asana), copiadas do site
app/idiomas.js          traduções da interface (inglês, espanhol, chinês), copiada do site
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
npm run dist:win        # Windows (instalador e portátil); precisa de Windows ou Wine
```

Os `.exe` são gerados pelo GitHub Actions (`.github/workflows/windows.yml`), numa máquina
Windows: ao enviar uma tag `vX.Y.Z` ou em Actions › Windows › Run workflow. Eles são anexados
à Release da tag.

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
- **Links externos** (janela Sobre) abrem no navegador padrão; um link relativo da página é
  resolvido contra `https://lqtsm.com.br/`.
- **Janela**: título vindo da página (nome do arquivo aberto), 1100×900 inicial, mínimo
  420×600, tamanho e posição lembrados. A barra de menus é a da página (Arquivo,
  Preferências, Sobre); o menu nativo fica escondido, só com os atalhos Ctrl+C/V/X/Z/A e
  Ctrl+= / Ctrl+− / Ctrl+0. Instância única; DevTools só com `EDITOR_DEBUG=1`.
- **Arquivo `.lqtsm`** (Arquivo > Novo/Abrir/Salvar/Salvar como; Ctrl+N/O/S/Shift+S): a
  página monta e lê o conteúdo (JSON com passos, comentários, fontes e opções); o
  `main.js` só abre os diálogos do sistema e lê/grava o disco (`lqtsmNativo.abrirArquivo`,
  `salvarArquivo`), e só grava arquivos `.lqtsm`. Fechar a janela com alterações não salvas
  pergunta Salvar / Não salvar / Cancelar (o rascunho fica no `localStorage` de todo modo);
  `EDITOR_SEM_PERGUNTA=1` desliga a pergunta (testes). No site, a página usa a File System
  Access API (Chrome/Edge) ou, sem ela, download e `<input type="file">`.

## Idiomas

A interface vem em inglês (padrão), português, espanhol e chinês; o usuário escolhe em
**Preferências** (barra de menus), junto com o tema, a fonte padrão, as convenções de saída
e o que aparece na barra da seleção. Tudo fica guardado no `localStorage`.

- O texto em português do código é a chave: `tr("Passo removido.")` devolve a tradução de
  `idiomas.js` (`window.IDIOMAS_EDITOR.en/.es/.zh`). No HTML, `data-i18n` marca o conteúdo e
  `data-i18n-title`/`-aria-label`/`-placeholder` os atributos.
- Texto novo na página precisa de entrada nos três idiomas de `idiomas.js` (no site, ao lado do
  `index.html`); o **teste 12** falha listando o que falta.
- O programa de desktop traduz o título da janela, o menu e o "Salvar como" (`TEXTOS` em
  `main.js`); a página avisa o idioma por `lqtsmNativo.definirIdioma` (`preload.js`).
