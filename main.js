/* =====================================================================
   EDITOR DE EQUACOES | LQTSM - processo principal do Electron
   ---------------------------------------------------------------------
   Serve app/index.html pelo protocolo app:// (standard + secure), para
   navigator.clipboard, ClipboardItem e localStorage funcionarem como em
   https. Todo o resto e a pagina original, sem alteracoes de comportamento.
   ===================================================================== */
"use strict";

/* ---------------------------------------------------------------------
   CONFIGURACAO
   --------------------------------------------------------------------- */
const NOME_APP = "editor-equacoes-lqtsm";          // ~/.config/editor-equacoes-lqtsm/
// Textos do proprio programa (janela, "Salvar como", menu), no idioma que a
// pagina escolhe (ela avisa por lqtsmNativo.definirIdioma; ver preload.js)
const TEXTOS = {
  en: { abrir: "Open", salvarComo: "Save as", documento: "Equation editor document", latex: "LaTeX",
    pergunta: "Save the changes to “{fmt}”?", detalhe: "If you don't save, the changes stay only in this editor's draft.",
    botaoSalvar: "Save", botaoDescartar: "Don't save", botaoCancelar: "Cancel",
    titulo: "Equation editor - LQTSM", salvar: "Save {fmt}", imagem: "{fmt} image",
    editar: "Edit", desfazer: "Undo", refazer: "Redo", recortar: "Cut", copiar: "Copy", colar: "Paste", selecionarTudo: "Select all",
    ver: "View", aumentar: "Zoom in", diminuir: "Zoom out", normal: "Actual size", telaCheia: "Full screen", devtools: "Developer tools",
    janela: "Window", minimizar: "Minimize", fechar: "Close" },
  pt: { abrir: "Abrir", salvarComo: "Salvar como", documento: "Documento do Editor de equações", latex: "LaTeX",
    pergunta: "Salvar as alterações em “{fmt}”?", detalhe: "Se não salvar, as alterações ficam só no rascunho deste editor.",
    botaoSalvar: "Salvar", botaoDescartar: "Não salvar", botaoCancelar: "Cancelar",
    titulo: "Editor de equações - LQTSM", salvar: "Salvar {fmt}", imagem: "Imagem {fmt}",
    editar: "Editar", desfazer: "Desfazer", refazer: "Refazer", recortar: "Recortar", copiar: "Copiar", colar: "Colar", selecionarTudo: "Selecionar tudo",
    ver: "Ver", aumentar: "Aumentar", diminuir: "Diminuir", normal: "Tamanho normal", telaCheia: "Tela cheia", devtools: "Ferramentas de desenvolvedor",
    janela: "Janela", minimizar: "Minimizar", fechar: "Fechar" },
  es: { abrir: "Abrir", salvarComo: "Guardar como", documento: "Documento del Editor de ecuaciones", latex: "LaTeX",
    pergunta: "¿Guardar los cambios en “{fmt}”?", detalhe: "Si no guardas, los cambios quedan solo en el borrador de este editor.",
    botaoSalvar: "Guardar", botaoDescartar: "No guardar", botaoCancelar: "Cancelar",
    titulo: "Editor de ecuaciones - LQTSM", salvar: "Guardar {fmt}", imagem: "Imagen {fmt}",
    editar: "Editar", desfazer: "Deshacer", refazer: "Rehacer", recortar: "Cortar", copiar: "Copiar", colar: "Pegar", selecionarTudo: "Seleccionar todo",
    ver: "Ver", aumentar: "Ampliar", diminuir: "Reducir", normal: "Tamaño real", telaCheia: "Pantalla completa", devtools: "Herramientas de desarrollo",
    janela: "Ventana", minimizar: "Minimizar", fechar: "Cerrar" },
  zh: { abrir: "打开", salvarComo: "另存为", documento: "公式编辑器文档", latex: "LaTeX",
    pergunta: "是否保存对“{fmt}”的更改？", detalhe: "如果不保存，更改只保留在本编辑器的草稿中。",
    botaoSalvar: "保存", botaoDescartar: "不保存", botaoCancelar: "取消",
    titulo: "公式编辑器 - LQTSM", salvar: "保存 {fmt}", imagem: "{fmt} 图像",
    editar: "编辑", desfazer: "撤销", refazer: "重做", recortar: "剪切", copiar: "复制", colar: "粘贴", selecionarTudo: "全选",
    ver: "视图", aumentar: "放大", diminuir: "缩小", normal: "实际大小", telaCheia: "全屏", devtools: "开发者工具",
    janela: "窗口", minimizar: "最小化", fechar: "关闭" },
};
const IDIOMA_PADRAO = "en";
let idiomaAtual = IDIOMA_PADRAO;                    // lido do estado salvo ao abrir
const texto = (chave, fmt) => (TEXTOS[idiomaAtual] || TEXTOS[IDIOMA_PADRAO])[chave].replace("{fmt}", fmt || "");
const ESQUEMA = "app";                             // app://editor/index.html
const HOST = "editor";
const SITE = "https://lqtsm.com.br/";                // base dos links relativos da pagina (../materiais.html)
const TAMANHO_INICIAL = { width: 1100, height: 900 };
const TAMANHO_MINIMO = { width: 420, height: 600 };
const NOMES_SUGERIDOS = ["equacao.svg", "equacao.png", "demonstracao.svg", "demonstracao.png"];
const ARQUIVO_ESTADO = "janela.json";              // tamanho/posicao e ultima pasta de download
const DEBUG = process.env.EDITOR_DEBUG === "1";

/* ---------------------------------------------------------------------
   MOTOR
   --------------------------------------------------------------------- */
const { app, BrowserWindow, protocol, net, session, dialog, shell, ipcMain,
  clipboard, nativeImage, Menu, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

app.setName(NOME_APP);
app.setPath("userData", path.join(app.getPath("appData"), NOME_APP));

const PASTA_APP = path.join(__dirname, "app");
const ARQUIVO_ESTADO_COMPLETO = () => path.join(app.getPath("userData"), ARQUIVO_ESTADO);

// Protocolo privilegiado: precisa ser registrado antes do app ficar pronto
protocol.registerSchemesAsPrivileged([{
  scheme: ESQUEMA,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: true },
}]);

// Uma unica instancia: abrir de novo traz a janela existente para frente
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.show();
      janela.focus();
    }
  });
}

let janela = null;

/* ---- Estado persistente (tamanho, posicao, ultima pasta) ---- */
function lerEstado() {
  try { return JSON.parse(fs.readFileSync(ARQUIVO_ESTADO_COMPLETO(), "utf8")); } catch (e) { return {}; }
}
function gravarEstado(parcial) {
  const estado = Object.assign(lerEstado(), parcial);
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(ARQUIVO_ESTADO_COMPLETO(), JSON.stringify(estado, null, 2));
  } catch (e) { /* sem estado: usa os padroes na proxima vez */ }
}
function limitesVisiveis(b) {
  // Garante que a janela lembrada ainda cabe em algum monitor
  if (!b || typeof b.x !== "number" || typeof b.y !== "number") return null;
  const dentro = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 50 < a.x + a.width && b.y + 50 < a.y + a.height && b.x + b.width > a.x + 50 && b.y + b.height > a.y + 50;
  });
  return dentro ? b : null;
}

/* ---- Protocolo app:// -> arquivos de app/ ---- */
function tratarProtocolo(pedido) {
  const url = new URL(pedido.url);
  let caminho = decodeURIComponent(url.pathname);
  if (caminho === "/" || caminho === "") caminho = "/index.html";
  const alvo = path.normalize(path.join(PASTA_APP, caminho));
  if (!alvo.startsWith(PASTA_APP + path.sep) && alvo !== PASTA_APP) {
    return new Response("Proibido", { status: 403 });
  }
  return net.fetch(pathToFileURL(alvo).toString());
}

/* ---- Downloads: <a download> da pagina -> dialogo "Salvar como" ---- */
function ligarDownloads(sessao) {
  sessao.on("will-download", (evento, item) => {
    const nome = item.getFilename() || "equacao.svg";
    const estado = lerEstado();
    const pasta = (estado.pastaDownload && fs.existsSync(estado.pastaDownload))
      ? estado.pastaDownload
      : app.getPath("pictures");
    const ehSvg = /\.svg$/i.test(nome);
    const formato = ehSvg ? "SVG" : "PNG";
    const resultado = dialog.showSaveDialogSync(janela, {
      title: texto("salvar", formato),
      defaultPath: path.join(pasta, NOMES_SUGERIDOS.includes(nome) ? nome : nome),
      filters: [{ name: texto("imagem", formato), extensions: [ehSvg ? "svg" : "png"] }],
    });
    if (!resultado) { item.cancel(); return; }
    item.setSavePath(resultado);
    gravarEstado({ pastaDownload: path.dirname(resultado) });
  });
}

/* ---- Area de transferencia nativa (reserva do navigator.clipboard) ---- */
function ligarClipboard() {
  ipcMain.handle("clipboard:texto", (_e, texto) => {
    clipboard.writeText(String(texto));
    return true;
  });
  ipcMain.handle("clipboard:svg", (_e, svg) => {
    // Caminho normal: navigator.clipboard.write ja grava text/plain E
    // image/svg+xml de uma vez (Chromium). Esta reserva so entra se aquele
    // falhar. O modulo clipboard do Electron grava um conjunto por chamada
    // (cada chamada substitui a anterior): text/plain e o formato que o
    // Inkscape cola como desenho editavel e o editor de texto aceita; o
    // image/svg+xml so entra quando o ambiente o mantem junto do texto.
    const texto = String(svg);
    clipboard.write({ text: texto });
    try {
      const antes = clipboard.readText();
      clipboard.writeBuffer("image/svg+xml", Buffer.from(texto, "utf8"));
      if (clipboard.readText() !== antes) clipboard.write({ text: texto });   // perdeu o texto: volta
    } catch (e) { clipboard.write({ text: texto }); }
    return true;
  });
  ipcMain.handle("clipboard:png", (_e, dataUrl) => {
    const imagem = nativeImage.createFromDataURL(String(dataUrl));
    if (imagem.isEmpty()) return false;
    clipboard.writeImage(imagem);
    return true;
  });
  ipcMain.handle("clipboard:temImagem", () => !clipboard.readImage().isEmpty());
  // Idioma escolhido na pagina: titulo, menu e "Salvar como"; guardado para a proxima abertura
  ipcMain.on("idioma", (_e, id) => {
    if (!TEXTOS[id] || id === idiomaAtual) return;
    idiomaAtual = id;
    gravarEstado({ idioma: id });
    instalarAtalhos();
  });
  ipcMain.handle("clipboard:lerTexto", () => clipboard.readText());
}

/* ---- Arquivo .lqtsm: dialogos do sistema e aviso ao fechar ----
   A pagina monta e le o conteudo; aqui so os dialogos e o disco. Salvar
   so escreve arquivos .lqtsm. */
let estadoArquivo = { nome: "", alterado: false };   // a pagina avisa a cada mudanca
let podeFechar = false;
function pastaDocumentos() {
  const pasta = lerEstado().pastaDocumentos;
  return pasta && fs.existsSync(pasta) ? pasta : app.getPath("documents");
}
function perguntarAlteracoes() {
  const i = dialog.showMessageBoxSync(janela, {
    type: "warning",
    buttons: [texto("botaoSalvar"), texto("botaoDescartar"), texto("botaoCancelar")],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    message: texto("pergunta", estadoArquivo.nome),
    detail: texto("detalhe"),
  });
  return ["salvar", "descartar", "cancelar"][i];
}
function ligarArquivo() {
  ipcMain.handle("arquivo:abrir", () => {
    const r = dialog.showOpenDialogSync(janela, {
      title: texto("abrir"),
      defaultPath: pastaDocumentos(),
      properties: ["openFile"],
      filters: [{ name: texto("documento"), extensions: ["lqtsm"] }, { name: texto("latex"), extensions: ["tex"] }],
    });
    if (!r || !r[0]) return null;
    const caminho = r[0];
    gravarEstado({ pastaDocumentos: path.dirname(caminho) });
    return { caminho, nome: path.basename(caminho), conteudo: fs.readFileSync(caminho, "utf8") };
  });
  ipcMain.handle("arquivo:salvar", (_e, dados) => {
    let caminho = String((dados && dados.caminho) || "");
    if (!/\.lqtsm$/i.test(caminho)) {
      const r = dialog.showSaveDialogSync(janela, {
        title: texto("salvarComo"),
        defaultPath: path.join(pastaDocumentos(), path.basename(String((dados && dados.nome) || "documento.lqtsm"))),
        filters: [{ name: texto("documento"), extensions: ["lqtsm"] }],
      });
      if (!r) return null;
      caminho = /\.lqtsm$/i.test(r) ? r : r + ".lqtsm";
      gravarEstado({ pastaDocumentos: path.dirname(caminho) });
    }
    fs.writeFileSync(caminho, String(dados.conteudo));
    return { caminho, nome: path.basename(caminho) };
  });
  ipcMain.handle("arquivo:perguntar", () => perguntarAlteracoes());
  ipcMain.on("arquivo:estado", (_e, estado) => {
    estadoArquivo = { nome: String((estado && estado.nome) || ""), alterado: !!(estado && estado.alterado) };
  });
  ipcMain.on("arquivo:fechar", () => { podeFechar = true; if (janela) janela.close(); });
}

/* ---- Script injetado na pagina: reserva do navigator.clipboard ----
   Envolve navigator.clipboard.write/writeText: se a API do Chromium falhar
   (janela sem foco, tipo nao suportado), repassa ao preload (window.lqtsmNativo),
   que grava pelo modulo clipboard do Electron. A pagina nao muda. */
const PONTE_CLIPBOARD = String.raw`
(() => {
  if (!window.lqtsmNativo || !navigator.clipboard || navigator.clipboard.__lqtsm) return;
  const N = window.lqtsmNativo;
  const original = { write: navigator.clipboard.write.bind(navigator.clipboard),
                     writeText: navigator.clipboard.writeText.bind(navigator.clipboard) };
  const lerBlob = (b) => new Promise((ok, falha) => {
    const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => falha(new Error("blob")); r.readAsText(b); });
  const lerDataUrl = (b) => new Promise((ok, falha) => {
    const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => falha(new Error("blob")); r.readAsDataURL(b); });
  async function reservaItens(itens) {
    for (const item of itens) {
      const tipos = item.types || [];
      if (tipos.includes("image/png")) {
        const blob = await item.getType("image/png");
        if (!(await N.copiarPng(await lerDataUrl(blob)))) throw new Error("png");
        continue;
      }
      if (tipos.includes("image/svg+xml") || tipos.includes("text/plain")) {
        const tipo = tipos.includes("image/svg+xml") ? "image/svg+xml" : "text/plain";
        const texto = await lerBlob(await item.getType(tipo));
        if (/^\s*(<\?xml|<svg)/.test(texto)) await N.copiarSvg(texto); else await N.copiarTexto(texto);
        continue;
      }
      throw new Error("tipo");
    }
  }
  const clip = navigator.clipboard;
  Object.defineProperty(clip, "write", { configurable: true, value: async function (itens) {
    try { return await original.write(itens); } catch (e) { return reservaItens(itens); }
  }});
  Object.defineProperty(clip, "writeText", { configurable: true, value: async function (texto) {
    try { return await original.writeText(texto); } catch (e) { await N.copiarTexto(String(texto)); }
  }});
  Object.defineProperty(clip, "__lqtsm", { value: true });
})();
`;

/* ---- Janela ---- */
function criarJanela() {
  const estado = lerEstado();
  if (TEXTOS[estado.idioma]) idiomaAtual = estado.idioma;
  const limites = limitesVisiveis(estado.janela) || {};
  janela = new BrowserWindow({
    title: texto("titulo"),
    width: limites.width || TAMANHO_INICIAL.width,
    height: limites.height || TAMANHO_INICIAL.height,
    x: limites.x,
    y: limites.y,
    minWidth: TAMANHO_MINIMO.width,
    minHeight: TAMANHO_MINIMO.height,
    autoHideMenuBar: false,                       // a barra de menus e a da pagina
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: "#fbfbfa",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: DEBUG,
    },
  });
  janela.setMenuBarVisibility(false);           // menu nativo so pelos atalhos (Alt nao o mostra)
  if (estado.janela && estado.janela.maximizada) janela.maximize();

  // O titulo vem da pagina (nome do arquivo aberto, no idioma escolhido)

  // Links externos: navegador padrao, nunca dentro da janela
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  janela.webContents.on("will-navigate", (e, url) => {
    const propria = ESQUEMA + "://" + HOST + "/index.html";
    if (url === propria || url.startsWith(propria + "#")) return;      // a propria pagina
    e.preventDefault();
    if (/^https?:/i.test(url)) { shell.openExternal(url); return; }
    // Link relativo da pagina (ex.: "../materiais.html#ferramentas", a trilha
    // "LQTSM · Materiais › Ferramentas"): resolve contra o site publicado
    if (url.startsWith(ESQUEMA + "://")) {
      const u = new URL(url);
      shell.openExternal(SITE + u.pathname.replace(/^\/+/, "") + u.search + u.hash);
    }
  });

  // Reserva de area de transferencia, injetada quando o DOM existe
  janela.webContents.on("dom-ready", () => {
    janela.webContents.executeJavaScript(PONTE_CLIPBOARD).catch(() => { /* segue com a API do Chromium */ });
  });

  // Lembra tamanho e posicao
  const guardarJanela = () => {
    if (!janela || janela.isDestroyed()) return;
    const maximizada = janela.isMaximized();
    const b = maximizada ? (lerEstado().janela || janela.getNormalBounds()) : janela.getNormalBounds();
    gravarEstado({ janela: { x: b.x, y: b.y, width: b.width, height: b.height, maximizada } });
  };
  let temporizador = null;
  const agendar = () => { clearTimeout(temporizador); temporizador = setTimeout(guardarJanela, 400); };
  janela.on("resize", agendar);
  janela.on("move", agendar);
  janela.on("maximize", agendar);
  janela.on("unmaximize", agendar);
  janela.on("close", (e) => {
    // Alteracoes nao salvas: Salvar (a pagina salva e pede para fechar),
    // Nao salvar (fecha; o rascunho fica) ou Cancelar
    if (!podeFechar && estadoArquivo.alterado && process.env.EDITOR_SEM_PERGUNTA !== "1") {
      const resposta = perguntarAlteracoes();
      if (resposta !== "descartar") {
        e.preventDefault();
        if (resposta === "salvar") janela.webContents.send("arquivo:salvar-e-fechar");
        return;
      }
    }
    guardarJanela();
  });
  janela.on("closed", () => { janela = null; });

  janela.once("ready-to-show", () => janela.show());
  if (DEBUG) janela.webContents.openDevTools({ mode: "detach" });
  janela.loadURL(ESQUEMA + "://" + HOST + "/index.html");
}

/* ---- Menu: sem barra, mas com os atalhos padrao de edicao e zoom ---- */
function instalarAtalhos() {
  const modelo = [
    {
      label: texto("editar"),
      submenu: [
        { role: "undo", label: texto("desfazer") },
        { role: "redo", label: texto("refazer") },
        { type: "separator" },
        { role: "cut", label: texto("recortar") },
        { role: "copy", label: texto("copiar") },
        { role: "paste", label: texto("colar") },
        { role: "selectAll", label: texto("selecionarTudo") },
      ],
    },
    {
      label: texto("ver"),
      submenu: [
        { role: "zoomIn", label: texto("aumentar"), accelerator: "CommandOrControl+=" },
        { role: "zoomIn", accelerator: "CommandOrControl+Plus", visible: false },
        { role: "zoomIn", accelerator: "CommandOrControl+numadd", visible: false },
        { role: "zoomOut", label: texto("diminuir"), accelerator: "CommandOrControl+-" },
        { role: "zoomOut", accelerator: "CommandOrControl+numsub", visible: false },
        { role: "resetZoom", label: texto("normal"), accelerator: "CommandOrControl+0" },
        { role: "resetZoom", accelerator: "CommandOrControl+num0", visible: false },
        { type: "separator" },
        { role: "togglefullscreen", label: texto("telaCheia") },
        ...(DEBUG ? [{ role: "toggleDevTools", label: texto("devtools") }] : []),
      ],
    },
    { label: texto("janela"), submenu: [{ role: "minimize", label: texto("minimizar") }, { role: "close", label: texto("fechar") }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modelo));
}

app.whenReady().then(() => {
  if (TEXTOS[lerEstado().idioma]) idiomaAtual = lerEstado().idioma;   // menu ja no idioma salvo
  protocol.handle(ESQUEMA, tratarProtocolo);
  ligarDownloads(session.defaultSession);
  ligarClipboard();
  ligarArquivo();
  instalarAtalhos();
  criarJanela();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});

app.on("window-all-closed", () => app.quit());
