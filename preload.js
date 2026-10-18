/* =====================================================================
   EDITOR DE EQUACOES | LQTSM - preload (contextBridge)
   ---------------------------------------------------------------------
   Conjunto minimo de funcoes nativas: reserva da area de transferencia
   (o main.js injeta um envoltorio em navigator.clipboard que cai aqui) e
   o idioma da interface (a pagina chama definirIdioma ao abrir e ao trocar) e
   o arquivo .lqtsm (dialogos de Abrir/Salvar e aviso ao fechar).
   ===================================================================== */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lqtsmNativo", {
  copiarTexto: (texto) => ipcRenderer.invoke("clipboard:texto", texto),
  copiarSvg: (svg) => ipcRenderer.invoke("clipboard:svg", svg),
  copiarPng: (dataUrl) => ipcRenderer.invoke("clipboard:png", dataUrl),
  // Usadas pelo teste automatizado para conferir a area de transferencia
  temImagem: () => ipcRenderer.invoke("clipboard:temImagem"),
  lerTexto: () => ipcRenderer.invoke("clipboard:lerTexto"),
  // Idioma da interface: o programa traduz o titulo da janela, o menu e o "Salvar como"
  definirIdioma: (id) => ipcRenderer.send("idioma", String(id)),
  // Arquivo .lqtsm: dialogos do sistema e aviso ao fechar com alteracoes
  abrirArquivo: () => ipcRenderer.invoke("arquivo:abrir"),
  salvarArquivo: (dados) => ipcRenderer.invoke("arquivo:salvar", dados),
  perguntarAlteracoes: () => ipcRenderer.invoke("arquivo:perguntar"),
  estadoDoArquivo: (estado) => ipcRenderer.send("arquivo:estado", estado),
  aoPedirSalvarEFechar: (fn) => ipcRenderer.on("arquivo:salvar-e-fechar", () => fn()),
  fecharJanela: () => ipcRenderer.send("arquivo:fechar"),
});
