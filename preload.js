/* =====================================================================
   EDITOR DE EQUACOES | LQTSM - preload (contextBridge)
   ---------------------------------------------------------------------
   Conjunto minimo de funcoes nativas, usado SO como reserva quando
   navigator.clipboard falha. A pagina nao chama nada daqui diretamente:
   o main.js injeta um envoltorio em navigator.clipboard que cai aqui.
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
});
