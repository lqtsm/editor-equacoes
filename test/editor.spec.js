/* =====================================================================
   Teste automatizado do Editor de equacoes (Playwright para Electron)
   ---------------------------------------------------------------------
   1. digita 1/2 e confere \frac{1}{2}
   2. seleciona 2x, aplica a integral e confere \int 2x\,\mathrm{d}x
   3. cria dois passos com Enter
   4. exporta o LaTeX align da demonstracao e compara com o esperado
   5. copia um PNG e confere que a area de transferencia contem imagem
   ===================================================================== */
const { test, expect, _electron: electron } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

/* ---------------- CONFIGURACAO ---------------- */
const RAIZ = path.join(__dirname, "..");
const ESPERA_MATHLIVE_MS = 20000;
const ARGS_EXTRA = process.env.CI || process.getuid?.() === 0 ? ["--no-sandbox"] : [];

/* ---------------- APOIO ---------------- */
let app, page, userData;

// LaTeX do passo em foco, como a pagina o ve (textarea sincronizado)
const latexDoPasso = () => page.locator("#latex").inputValue();
const campos = () => page.locator("math-field");

async function limparCampo() {
  await page.evaluate(() => {
    const mf = document.querySelector("math-field");
    mf.value = "";
    mf.dispatchEvent(new Event("input"));
    mf.focus();
  });
}

test.beforeAll(async () => {
  // userData proprio: nao mexe no historico de quem roda o teste
  userData = fs.mkdtempSync(path.join(os.tmpdir(), "editor-lqtsm-teste-"));
  app = await electron.launch({
    cwd: RAIZ,
    args: [".", ...ARGS_EXTRA],
    env: { ...process.env, XDG_CONFIG_HOME: userData, EDITOR_DEBUG: "0" },
  });
  page = await app.firstWindow();
  await page.waitForSelector("math-field", { timeout: ESPERA_MATHLIVE_MS });
  await page.waitForFunction(() => window.MathfieldElement && document.querySelector("math-field").value !== undefined);
  await page.waitForTimeout(500);
});

test.afterAll(async () => {
  if (app) await app.close();
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (e) { /* ok */ }
});

test("a pagina abre offline pelo protocolo app:// em contexto seguro", async () => {
  expect(page.url()).toBe("app://editor/index.html");
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  expect(await page.evaluate(() => typeof ClipboardItem)).toBe("function");
  await expect(page.locator(".rodape")).toContainText("Tudo roda no seu computador; nada é enviado a servidor. O histórico fica neste computador.");
  const fontes = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
  });
  expect(fontes).toContain("IBM Plex Sans");
  expect(fontes).toContain("IBM Plex Mono");
});

test("1. digitar 1/2 produz \\frac{1}{2}", async () => {
  await limparCampo();
  await campos().first().focus();
  await page.keyboard.type("1/2");
  await expect.poll(latexDoPasso).toMatch(/^\\frac(\{1\}\{2\}|12)$/);   // o MathLive serializa \frac12 (forma equivalente)
});

test("2. selecao 2x + integral produz \\int 2x\\,\\mathrm{d}x", async () => {
  await limparCampo();
  const mf = campos().first();
  await mf.focus();
  await page.keyboard.type("2x");
  await expect.poll(latexDoPasso).toBe("2x");
  // Seleciona tudo (Ctrl+A dentro do campo) e aplica a integral indefinida
  // pelo teclado virtual: aba "∫ d", tecla com a dica "Integral indefinida".
  await page.keyboard.press("Control+a");
  expect(await mf.evaluate((el) => el.selectionIsCollapsed)).toBe(false);
  await page.locator("#btn-teclado").click();
  const teclado = page.locator(".ML__keyboard");
  await expect(teclado).toBeVisible();
  await teclado.locator(".MLK__layer-switch, .layer-switch, [data-layer]", { hasText: "∫ d" }).first().click();
  const tecla = teclado.locator('[data-tooltip="Integral indefinida"], .MLK__keycap:has-text("∫")').first();
  await tecla.click();
  // A selecao virou o integrando; o cursor esta na caixinha do diferencial
  // (o MathLive serializa sem o espaco: \int2x\,\mathrm{d}\placeholder{})
  await expect.poll(latexDoPasso).toMatch(/^\\int ?2x\\,\\mathrm\{d\}\\placeholder\{\}$/);
  await page.keyboard.type("x");
  await expect.poll(latexDoPasso).toMatch(/^\\int ?2x\\,\\mathrm\{d\}x$/);
  await page.locator("#btn-teclado").click();            // fecha o teclado
});

test("3. Enter cria dois passos novos", async () => {
  await limparCampo();
  // Garante um passo so antes de comecar
  await page.locator("#btn-demo-limpar").click();
  await expect(campos()).toHaveCount(1);
  const primeiro = campos().first();
  await primeiro.focus();
  await page.keyboard.type("x=y");
  await page.keyboard.press("Enter");
  await expect(campos()).toHaveCount(2);
  await expect(page.locator("#n-passo")).toHaveText("2");   // o foco ja esta no passo novo
  await page.keyboard.type("2x=2y");
  await page.keyboard.press("Enter");
  await expect(campos()).toHaveCount(3);
  await expect(page.locator("#n-passo")).toHaveText("3");
  await page.keyboard.type("x=y");
  // O foco esta no terceiro passo
  await expect(page.locator("#n-passo")).toHaveText("3");
});

test("4. LaTeX align da demonstracao", async () => {
  // Reaproveita os tres passos do teste anterior e poe comentarios
  const comentarios = page.locator(".passo-coment");
  await expect(comentarios).toHaveCount(3);
  await comentarios.nth(0).fill("hipótese");
  await comentarios.nth(1).fill("multiplicando por 2");
  await comentarios.nth(2).fill("dividindo por 2");
  // Abre o <details> e le o LaTeX gerado (alinhar ligado, numerar desligado)
  await page.locator("details.detalhes summary").click();
  const esperado = [
    "\\begin{align}",
    "  x&=y && \\text{hipótese} \\nonumber \\\\",
    "  2x&=2y && \\text{multiplicando por 2} \\nonumber \\\\",
    "  x&=y && \\text{dividindo por 2} \\nonumber",
    "\\end{align}",
  ].join("\n");
  await expect.poll(() => page.locator("#latex-demo").inputValue()).toBe(esperado);

  // Com "Numerar a ultima linha" ligado, a ultima perde o \nonumber
  await page.locator("#op-numerar").check();
  await expect.poll(() => page.locator("#latex-demo").inputValue()).toBe(esperado.replace(" \\nonumber\n\\end", "\n\\end"));
  await page.locator("#op-numerar").uncheck();

  // "Copiar tudo > LaTeX (align)" poe o mesmo texto na area de transferencia
  await page.locator("#btn-demo-align").click();
  await expect(page.locator("#status, #status-demo").filter({ hasText: "align copiado" }).first()).toBeVisible();
  const colado = await page.evaluate(() => window.lqtsmNativo.lerTexto());
  expect(colado).toBe(esperado);
});

test("5. copiar PNG deixa uma imagem na area de transferencia", async () => {
  // Limpa a area de transferencia com texto, para a imagem ser deste teste
  await page.evaluate(() => window.lqtsmNativo.copiarTexto("limpo"));
  expect(await page.evaluate(() => window.lqtsmNativo.temImagem())).toBe(false);
  await campos().first().click();
  await expect(page.locator("#n-passo")).toHaveText("1");
  // Grava toda mensagem de status (ela some sozinha depois de 2,6 s)
  await page.evaluate(() => {
    window.__status = [];
    new MutationObserver(() => { const t = document.getElementById("status").textContent; if (t) window.__status.push(t); })
      .observe(document.getElementById("status"), { childList: true, characterData: true, subtree: true });
  });
  await page.locator("#btn-copiar-png").click();
  // O MathJax e carregado na primeira exportacao (de vendor/, sem rede)
  await expect.poll(() => page.evaluate(() => window.__status.join("\n")), { timeout: 30000 }).toContain("PNG copiado");
  expect(await page.evaluate(() => window.lqtsmNativo.temImagem())).toBe(true);
  expect(await app.evaluate(({ clipboard }) => clipboard.availableFormats())).toContain("image/png");
  // E o SVG: texto com <svg ...> na area de transferencia
  await page.locator("#btn-copiar-svg").click();
  await expect.poll(() => page.evaluate(() => window.__status.join("\n")), { timeout: 30000 }).toContain("SVG copiado");
  expect(await app.evaluate(({ clipboard }) => clipboard.availableFormats())).toContain("image/svg+xml");
  const svg = await page.evaluate(() => window.lqtsmNativo.lerTexto());
  expect(svg).toMatch(/^<\?xml version="1.0" encoding="UTF-8" standalone="no"\?>\n<svg /);
  expect(svg).toContain('width="');
  expect(svg).toContain("#000000");
});
