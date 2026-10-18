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
const TITULO = "Editor de equações - LQTSM";
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
    const resultado = dialog.showSaveDialogSync(janela, {
      title: "Salvar " + (ehSvg ? "SVG" : "PNG"),
      defaultPath: path.join(pasta, NOMES_SUGERIDOS.includes(nome) ? nome : nome),
      filters: ehSvg
        ? [{ name: "Imagem SVG", extensions: ["svg"] }]
        : [{ name: "Imagem PNG", extensions: ["png"] }],
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
  ipcMain.handle("clipboard:lerTexto", () => clipboard.readText());
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
  const limites = limitesVisiveis(estado.janela) || {};
  janela = new BrowserWindow({
    title: TITULO,
    width: limites.width || TAMANHO_INICIAL.width,
    height: limites.height || TAMANHO_INICIAL.height,
    x: limites.x,
    y: limites.y,
    minWidth: TAMANHO_MINIMO.width,
    minHeight: TAMANHO_MINIMO.height,
    autoHideMenuBar: true,
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
  if (estado.janela && estado.janela.maximizada) janela.maximize();

  // Titulo fixo (a pagina tem o seu proprio <title>)
  janela.on("page-title-updated", (e) => { e.preventDefault(); janela.setTitle(TITULO); });

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
  janela.on("close", guardarJanela);
  janela.on("closed", () => { janela = null; });

  janela.once("ready-to-show", () => janela.show());
  if (DEBUG) janela.webContents.openDevTools({ mode: "detach" });
  janela.loadURL(ESQUEMA + "://" + HOST + "/index.html");
}

/* ---- Menu: sem barra, mas com os atalhos padrao de edicao e zoom ---- */
function instalarAtalhos() {
  const modelo = [
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Desfazer" },
        { role: "redo", label: "Refazer" },
        { type: "separator" },
        { role: "cut", label: "Recortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Colar" },
        { role: "selectAll", label: "Selecionar tudo" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        { role: "zoomIn", label: "Aumentar", accelerator: "CommandOrControl+=" },
        { role: "zoomIn", accelerator: "CommandOrControl+Plus", visible: false },
        { role: "zoomIn", accelerator: "CommandOrControl+numadd", visible: false },
        { role: "zoomOut", label: "Diminuir", accelerator: "CommandOrControl+-" },
        { role: "zoomOut", accelerator: "CommandOrControl+numsub", visible: false },
        { role: "resetZoom", label: "Tamanho normal", accelerator: "CommandOrControl+0" },
        { role: "resetZoom", accelerator: "CommandOrControl+num0", visible: false },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tela cheia" },
        ...(DEBUG ? [{ role: "toggleDevTools", label: "Ferramentas de desenvolvedor" }] : []),
      ],
    },
    { label: "Janela", submenu: [{ role: "minimize", label: "Minimizar" }, { role: "close", label: "Fechar" }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modelo));
}

app.whenReady().then(() => {
  protocol.handle(ESQUEMA, tratarProtocolo);
  ligarDownloads(session.defaultSession);
  ligarClipboard();
  instalarAtalhos();
  criarJanela();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});

app.on("window-all-closed", () => app.quit());
