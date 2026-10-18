/* =====================================================================
   Teste automatizado do Editor de equacoes (Playwright para Electron)
   ---------------------------------------------------------------------
   1. digita 1/2 e confere \frac{1}{2}
   2. seleciona 2x, aplica a integral e confere \int 2x\,\mathrm{d}x
   3. cria dois passos com Enter
   4. exporta o LaTeX align da demonstracao e compara com o esperado
   5. copia um PNG e confere que a area de transferencia contem imagem
   6. o botao LaTeX do passo mostra/esconde o LaTeX; a fonte e por passo
   7. o campo de edicao ja usa a fonte do passo (fontes-edicao/)
   8. a fonte padrao (topo) muda todos os passos em "Padrao", e so eles
   9. selecionar um trecho abre a barra da selecao, acima dele
  10. o usuario escolhe o que aparece na barra (e restaura o padrao)
  11. todo item de LaTeX do catalogo da barra age no trecho e exporta
  12. toda chave usada tem traducao em ingles, espanhol e chines
  13. Configuracoes: idioma, tema e fonte padrao valem na hora
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
    // sem a pergunta "Salvar alteracoes?" ao fechar (o teste 14 a confere a parte)
    env: { ...process.env, XDG_CONFIG_HOME: userData, EDITOR_DEBUG: "0", EDITOR_SEM_PERGUNTA: "1" },
  });
  page = await app.firstWindow();
  await page.waitForSelector("math-field", { timeout: ESPERA_MATHLIVE_MS });
  await page.waitForFunction(() => window.MathfieldElement && document.querySelector("math-field").value !== undefined);
  await page.waitForTimeout(500);
  // Os testes 1-11 conferem textos em portugues (o padrao do programa e o ingles)
  await page.evaluate(() => mudarIdioma("pt"));
});

test.afterAll(async () => {
  if (app) await app.close();
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (e) { /* ok */ }
});

test("a pagina abre offline pelo protocolo app:// em contexto seguro", async () => {
  expect(page.url()).toBe("app://editor/index.html");
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  expect(await page.evaluate(() => typeof ClipboardItem)).toBe("function");
  await expect(page.locator("#sobre")).toContainText("Tudo roda no seu computador; nada é enviado a servidor. O histórico fica neste computador.");
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
  await page.locator(".passo").first().locator('[data-acao="copiar-png"]').click();
  // O MathJax e carregado na primeira exportacao (de vendor/, sem rede)
  await expect.poll(() => page.evaluate(() => window.__status.join("\n")), { timeout: 30000 }).toContain("PNG copiado");
  expect(await page.evaluate(() => window.lqtsmNativo.temImagem())).toBe(true);
  expect(await app.evaluate(({ clipboard }) => clipboard.availableFormats())).toContain("image/png");
  // E o SVG: texto com <svg ...> na area de transferencia
  await page.locator(".passo").first().locator('[data-acao="copiar-svg"]').click();
  await expect.poll(() => page.evaluate(() => window.__status.join("\n")), { timeout: 30000 }).toContain("SVG copiado");
  expect(await app.evaluate(({ clipboard }) => clipboard.availableFormats())).toContain("image/svg+xml");
  const svg = await page.evaluate(() => window.lqtsmNativo.lerTexto());
  expect(svg).toMatch(/^<\?xml version="1.0" encoding="UTF-8" standalone="no"\?>\n<svg /);
  expect(svg).toContain('width="');
  expect(svg).toContain("#000000");
});

test("6. LaTeX escondido por passo e fonte por passo", async () => {
  const passo = (i) => page.locator(".passo").nth(i);
  const painel = page.locator("#painel-latex");
  // Comeca escondido; o botao do passo 2 abre o LaTeX logo abaixo dele
  await expect(painel).toBeHidden();
  await passo(1).locator('[data-acao="ver-latex"]').click();
  await expect(passo(1).locator("#painel-latex")).toBeVisible();
  await expect(page.locator("#n-passo")).toHaveText("2");
  expect(await latexDoPasso()).toBe("2x=2y");
  // O mesmo botao fecha
  await passo(1).locator('[data-acao="ver-latex"]').click();
  await expect(painel).toBeHidden();
  // A fonte e de cada passo: muda so a do passo 2
  await passo(1).locator(".passo-barra select").selectOption("stix2");
  await expect(passo(0).locator(".passo-barra select")).toHaveValue("");   // segue o padrao
  const svg = await page.evaluate(() => latexParaSvg("x", fonteDoPasso(passos[1])));
  const svgTex = await page.evaluate(() => latexParaSvg("x", fonteDoPasso(passos[0])));
  expect(svg.texto).not.toBe(svgTex.texto);   // desenhos diferentes
  // O botao de copiar LaTeX copia o passo da barra, mesmo sem estar em foco
  await passo(2).locator('[data-acao="latex"]').click();
  await expect.poll(() => page.evaluate(() => window.lqtsmNativo.lerTexto())).toBe("x=y");
});

// Familia de fonte que o campo do passo i usa para as variaveis (italico),
// e se essa fonte ja carregou de fontes-edicao/
async function fonteDoCampo(i) {
  return page.evaluate(async (i) => {
    await document.fonts.ready;
    const el = passos[i].mf.shadowRoot.querySelector(".ML__mathit");
    const familia = el ? getComputedStyle(el).fontFamily : "";
    const primeira = familia.split(",")[0].trim().replace(/"/g, "");
    const carregada = [...document.fonts].some((f) => f.family.replace(/"/g, "") === primeira && f.status === "loaded");
    return { familia, primeira, carregada };
  }, i);
}

test("7. o campo de edicao ja usa a fonte do passo", async () => {
  // Estado do teste 6: passo 2 fixo em STIX Two, passos 1 e 3 no padrao (TeX)
  expect((await fonteDoCampo(0)).primeira).toBe("KaTeX_Math");          // TeX: a fonte do MathLive
  const stix = await fonteDoCampo(1);
  expect(stix.primeira).toBe("Edicao STIX");
  expect(stix.carregada).toBe(true);                                     // o arquivo veio de fontes-edicao/
  await page.locator(".passo").nth(0).locator(".passo-barra select").selectOption("pagella");
  await expect.poll(async () => (await fonteDoCampo(0)).primeira).toBe("Edicao Pagella");
  expect((await fonteDoCampo(0)).carregada).toBe(true);
  // Digitar continua funcionando com a fonte trocada
  await campos().nth(0).focus();
  await page.keyboard.type("+z");
  await expect.poll(latexDoPasso).toBe("x=y+z");
});

test("8. fonte padrao muda os passos em Padrao, e so eles", async () => {
  // Passo 1 fixo em Pagella, passo 2 fixo em STIX Two, passo 3 no padrao
  await page.locator("#fonte-padrao").selectOption("asana");
  await expect.poll(async () => (await fonteDoCampo(2)).primeira).toBe("Edicao Pagella");   // Asana: italico da Pagella
  await expect.poll(() => page.evaluate(() => passos[2].mf.shadowRoot.querySelector("style[data-fonte-edicao]").textContent)).toContain("Edicao Asana");
  expect((await fonteDoCampo(0)).primeira).toBe("Edicao Pagella");       // fixo: nao mudou
  expect((await fonteDoCampo(1)).primeira).toBe("Edicao STIX");          // fixo: nao mudou
  await expect(page.locator(".passo").nth(2).locator(".passo-barra select option").first()).toHaveText("Padrão: Asana");
  await page.locator("#fonte-padrao").selectOption("tex");
  await expect.poll(async () => (await fonteDoCampo(2)).primeira).toBe("KaTeX_Math");
});

test("9. barra da selecao: aparece sobre o trecho e age nele", async () => {
  const barra = page.locator("#barra-selecao");
  await page.locator("#btn-demo-limpar").click();
  const mf = campos().first();
  await mf.focus();
  await page.keyboard.type("a+b=c");
  await expect(barra).toBeHidden();                          // sem selecao, sem barra
  // Seleciona "a+b" (Home e Shift+Direita x3)
  await page.keyboard.press("Home");
  for (let k = 0; k < 3; k++) await page.keyboard.press("Shift+ArrowRight");
  await expect(barra).toBeVisible();
  // A barra fica acima do trecho, sem cobri-lo
  const pos = await page.evaluate(() => {
    const b = document.getElementById("barra-selecao").getBoundingClientRect();
    const sel = [...passos[0].mf.shadowRoot.querySelectorAll(".ML__selection")].map((r) => r.getBoundingClientRect());
    return { baseBarra: b.bottom, topoSelecao: Math.min(...sel.map((r) => r.top)) };
  });
  expect(pos.baseBarra).toBeLessThanOrEqual(pos.topoSelecao);
  // Parenteses: o trecho vira o argumento
  await barra.getByRole("button", { name: "Parênteses" }).click();
  await expect.poll(latexDoPasso).toBe("\\left(a+b\\right)=c");
  // Cor: seleciona tudo e pinta de vermelho
  await page.keyboard.press("Control+a");
  await expect(barra).toBeVisible();
  await barra.getByRole("button", { name: "Cor: vermelho" }).click();
  await expect.poll(latexDoPasso).toContain("red");
  // O foco continua no campo; sair do campo esconde a barra
  expect(await mf.evaluate((el) => document.activeElement === el)).toBe(true);
  await page.locator(".passo-coment").first().click();
  await expect(barra).toBeHidden();
});

test("10. escolher o que aparece na barra da selecao", async () => {
  const barra = page.locator("#barra-selecao");
  const janela = page.locator("#escolha-barra");
  const mf = campos().first();
  await mf.focus();
  await page.keyboard.press("Control+a");
  await expect(barra).toBeVisible();
  await expect(barra.getByRole("button", { name: "Vetor" })).toHaveCount(0);   // fora do padrao
  // A engrenagem abre a janela de escolha
  await barra.getByRole("button", { name: "Escolher o que aparece nesta barra" }).click();
  await expect(janela).toBeVisible();
  await janela.getByLabel("Parênteses", { exact: true }).uncheck();
  await janela.getByLabel("Vetor", { exact: true }).check();
  await janela.getByRole("button", { name: "Fechar" }).click();
  await expect(janela).toBeHidden();
  // A barra ja vem com a escolha nova (e ela fica guardada)
  await mf.focus();
  await page.keyboard.press("Control+a");
  await expect(barra.getByRole("button", { name: "Vetor" })).toHaveCount(1);
  await expect(barra.getByRole("button", { name: "Parênteses" })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(CHAVE_BARRA)))).toContain("vetor");
  // Marcar tudo: a barra traz o catalogo inteiro (todos os grupos)
  await page.locator("#menu-preferencias").click();
  await page.locator("#btn-config-barra").click();
  await janela.getByRole("button", { name: "Marcar tudo" }).click();
  await janela.getByRole("button", { name: "Fechar" }).click();
  await mf.focus();
  await page.keyboard.press("Control+a");
  const total = await page.evaluate(() => CATALOGO_BARRA.flatMap((g) => g.itens).length - 1 + CORES.length + 1 + 1);   // cores viram 8 botoes; + engrenagem
  await expect(barra.locator("button")).toHaveCount(total);
  await expect(barra.getByRole("button", { name: "Apagar o trecho" })).toHaveCount(1);
  await expect(barra.getByRole("button", { name: "Marca-texto (fundo amarelo)" })).toHaveCount(1);
  // Restaurar o padrao (por Preferencias)
  await page.locator("#menu-preferencias").click();
  await page.locator("#btn-config-barra").click();
  await janela.getByRole("button", { name: "Restaurar o padrão" }).click();
  await janela.getByRole("button", { name: "Fechar" }).click();
  await mf.focus();
  await page.keyboard.press("Control+a");
  await expect(barra.getByRole("button", { name: "Parênteses" })).toHaveCount(1);
  await expect(barra.getByRole("button", { name: "Vetor" })).toHaveCount(0);
});

test("11. todo item de LaTeX do catalogo age no trecho e exporta", async () => {
  const falhas = await page.evaluate(async () => {
    const mf = passos[0].mf;
    const erros = [];
    for (const grupo of CATALOGO_BARRA) for (const item of grupo.itens) {
      if (!item.latex) continue;
      mf.focus();
      mf.setValue("ab", { silenceNotifications: true });
      mf.executeCommand("selectAll");
      campoDaBarra = mf;
      usarItemDaBarra(item);
      const resultado = removerCaixinhas(limparLatexDoCampo(mf.getValue("latex")));
      if (!/ab|a\s*b/.test(resultado.replace(/[{}]/g, ""))) { erros.push(item.id + ": trecho sumiu -> " + resultado); continue; }
      try { await latexParaSvg(coresParaRender(aplicarConvencoes(resultado, opcoesAtuais())), "tex"); }
      catch (e) { erros.push(item.id + ": MathJax -> " + e.message + " em " + resultado); }
    }
    // Marca-texto: vira \colorbox, que o MathJax tambem exporta
    mf.setValue("ab", { silenceNotifications: true });
    mf.executeCommand("selectAll");
    campoDaBarra = mf;
    usarItemDaBarra(ITENS_BARRA.get("realce"));
    const comRealce = limparLatexDoCampo(mf.getValue("latex"));
    if (!comRealce.includes("colorbox")) erros.push("realce: sem colorbox -> " + comRealce);
    try { await latexParaSvg(coresParaRender(comRealce), "tex"); } catch (e) { erros.push("realce: MathJax -> " + e.message); }
    mf.setValue("", { silenceNotifications: true });
    return erros;
  });
  expect(falhas).toEqual([]);
});

// Todas as chaves de traducao que a pagina usa (texto em portugues)
async function chavesDaPagina() {
  const html = fs.readFileSync(path.join(RAIZ, "app", "index.html"), "utf8");
  const codigo = html.slice(html.lastIndexOf("<script>"));
  const LIT = String.raw`"(?:[^"\\]|\\.)*"`;
  const juntar = (bloco) => [...bloco.matchAll(new RegExp(LIT, "g"))].map((m) => JSON.parse(m[0])).join("");
  const doCodigo = [
    new RegExp(String.raw`\btr\(\s*((?:${LIT}\s*\+?\s*)+)`, "g"),
    new RegExp(String.raw`botaoPasso\(\s*${LIT}\s*,\s*${LIT}\s*,\s*(${LIT})`, "g"),
    new RegExp(String.raw`seletorDeFonte\([^,]+,\s*(${LIT})`, "g"),
    new RegExp(String.raw`setAttribute\("data-i18n-[a-z-]+",\s*(${LIT})`, "g"),
  ].flatMap((re) => [...codigo.matchAll(re)].map((m) => juntar(m[1])))
    .filter((c) => !["Passo removido.", "Passo {n} criado."].includes(c) || codigo.includes('tr("' + c + '"' + ")"));
  const daPagina = await page.evaluate(() => {
    const r = [];
    document.querySelectorAll("[data-i18n]").forEach((el) => r.push(el.dataset.i18n));
    ["title", "aria-label", "placeholder"].forEach((a) => document.querySelectorAll("[data-i18n-" + a + "]").forEach((el) => r.push(el.getAttribute("data-i18n-" + a))));
    const visitar = (k) => {
      if (!k || typeof k !== "object") return;
      if (k.tooltip) r.push(k.tooltip);
      if (k.label && !/[<\\]/.test(k.label)) r.push(k.label);
      if (k.shift) visitar(k.shift);
      if (Array.isArray(k.variants)) k.variants.forEach(visitar);
    };
    ABAS_TECLADO.forEach((aba) => { if (typeof aba !== "string") { r.push(aba.tooltip); aba.rows.forEach((l) => l.forEach(visitar)); } });
    CATALOGO_BARRA.forEach((g) => { r.push(g.grupo); g.itens.forEach((it) => r.push(it.rotulo)); });
    BARRA_PASSO.forEach((it) => r.push(it.rotulo));
    FONTES.forEach((f) => r.push(f.rotulo));
    CORES.forEach((c) => r.push(c.rotulo));
    return r;
  });
  const norm = (t) => String(t).replace(/\s+/g, " ").trim();
  return [...new Set([...doCodigo, ...daPagina].map(norm))].filter((c) => /\p{L}/u.test(c));
}

test("12. toda chave usada tem traducao em ingles, espanhol e chines", async () => {
  const chaves = await chavesDaPagina();
  expect(chaves.length).toBeGreaterThan(300);
  const dic = await page.evaluate(() => window.IDIOMAS_EDITOR);
  for (const lingua of ["en", "es", "zh"]) {
    const faltam = chaves.filter((c) => !(c in dic[lingua]));
    expect(faltam, "faltam em " + lingua).toEqual([]);
  }
});

test("13. Preferencias: idioma, tema e fonte padrao valem na hora", async () => {
  const janela = page.locator("#configuracoes");
  await page.locator("#menu-preferencias").click();
  await expect(janela).toBeVisible();
  // Ingles: pagina, botoes montados pelo script, teclado, mensagens, <html lang>
  await page.locator("#config-idioma").selectOption("en");
  await expect(page.locator("#menu-arquivo")).toHaveText("File");
  await expect(page.locator("#btn-passo-vazio")).toHaveText(await page.evaluate(() => IDIOMAS_EDITOR.en["Novo passo"]));
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  expect(await page.locator(".passo-barra button[data-acao='latex']").first().getAttribute("title"))
    .toBe(await page.evaluate(() => IDIOMAS_EDITOR.en["Copiar LaTeX (Ctrl+Enter)"]));
  const dicaTecla = await page.evaluate(() => mathVirtualKeyboard.layouts[0].rows.flat().find((k) => k && k.latex === "\\sqrt{#0}").tooltip);
  expect(dicaTecla).toBe(await page.evaluate(() => IDIOMAS_EDITOR.en["Raiz quadrada"]));
  // Chines
  await page.locator("#config-idioma").selectOption("zh");
  await expect(page.locator("#menu-arquivo")).toHaveText(await page.evaluate(() => IDIOMAS_EDITOR.zh["Arquivo"]));
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("zh-CN");
  // A escolha fica guardada
  expect(await page.evaluate(() => localStorage.getItem(CHAVE_IDIOMA))).toBe("zh");
  // Tema escuro e fonte padrao pela janela (o seletor do topo acompanha)
  await page.locator("#config-tema").selectOption("escuro");
  expect(await page.evaluate(() => document.documentElement.dataset.tema)).toBe("escuro");
  await page.locator("#config-fonte").selectOption("stix2");
  await expect(page.locator("#fonte-padrao")).toHaveValue("stix2");
  // Volta ao portugues, tema automatico e fonte TeX
  await page.locator("#config-idioma").selectOption("pt");
  await page.locator("#config-tema").selectOption("automático");
  await page.locator("#config-fonte").selectOption("tex");
  await expect(page.locator("#menu-arquivo")).toHaveText("Arquivo");
  await page.locator("#btn-config-fechar").click();
  await expect(janela).toBeHidden();
});

test("14. Arquivo: salvar, abrir e Salvar como pelo menu e pelos atalhos", async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "editor-lqtsm-arquivo-"));
  const destino = path.join(pasta, "prova");                 // sem extensao: o programa poe .lqtsm
  // Dialogos do sistema substituidos por respostas fixas
  await app.evaluate(({ dialog }, alvo) => {
    dialog.showSaveDialogSync = () => alvo;
    dialog.showOpenDialogSync = () => [alvo + ".lqtsm"];
  }, destino);
  await page.evaluate(() => importarAlign(String.raw`{}^{14}_{6}\mathrm{C} &= x && \text{nuclídeo} \\ y &= 2`));
  await expect(page.locator("#arquivo-atual .alterado")).toHaveCount(1);
  // Arquivo > Salvar (sem nome ainda: pede o caminho)
  await page.locator("#menu-arquivo").click();
  await page.locator("#arq-salvar").click();
  await expect(page.locator("#arquivo-atual")).toHaveText("prova.lqtsm");
  const dados = JSON.parse(fs.readFileSync(destino + ".lqtsm", "utf8"));
  expect(dados.formato).toBe("editor-equacoes-lqtsm");
  expect(dados.passos.map((p) => p.comentario)).toContain("nuclídeo");
  expect(await page.title()).toContain("prova.lqtsm");
  // Novo documento (Ctrl+N) e Abrir (Ctrl+O) traz os passos de volta
  const n = dados.passos.length;
  await campos().first().focus();
  await page.keyboard.press("Control+n");
  await expect(campos()).toHaveCount(1);
  await expect(page.locator("#arquivo-atual")).not.toHaveText("prova.lqtsm");
  await page.keyboard.press("Control+o");
  await expect(campos()).toHaveCount(n);
  await expect(page.locator("#arquivo-atual")).toHaveText("prova.lqtsm");
  expect((await page.evaluate(() => passos.map((p) => p.latex))).join(" ")).toContain(String.raw`{}^{14}_{6}\mathrm{C}`);
  // Ctrl+S com nome: grava no mesmo arquivo, sem perguntar
  await page.evaluate(() => { passos[0].comentario = "mudado"; demonstracaoMudou(); });
  await expect(page.locator("#arquivo-atual .alterado")).toHaveCount(1);
  await app.evaluate(({ dialog }) => { dialog.showSaveDialogSync = () => { throw new Error("nao devia perguntar"); }; });
  await page.keyboard.press("Control+s");
  await expect(page.locator("#arquivo-atual .alterado")).toHaveCount(0);
  expect(JSON.parse(fs.readFileSync(destino + ".lqtsm", "utf8")).passos[0].comentario).toBe("mudado");
  // Fechar com alteracoes pergunta (aqui: Cancelar, a janela fica)
  await page.evaluate(() => { passos[0].comentario = "de novo"; demonstracaoMudou(); });
  const perguntou = await app.evaluate(async ({ dialog, BrowserWindow }) => {
    let vezes = 0;
    dialog.showMessageBoxSync = () => { vezes++; return 2; };
    const antes = process.env.EDITOR_SEM_PERGUNTA;
    process.env.EDITOR_SEM_PERGUNTA = "0";
    BrowserWindow.getAllWindows()[0].close();             // o evento "close" chega depois
    await new Promise((ok) => setTimeout(ok, 800));
    process.env.EDITOR_SEM_PERGUNTA = antes;
    return vezes;
  });
  expect(perguntou).toBe(1);
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  // A janela Sobre abre pelo menu
  await page.locator("#menu-sobre").click();
  await expect(page.locator("#sobre")).toBeVisible();
  await page.locator("#btn-sobre-fechar").click();
  fs.rmSync(pasta, { recursive: true, force: true });
});

test("15. indices a esquerda: teclado e barra da selecao", async () => {
  const teclas = await page.evaluate(() => ABAS_TECLADO.flatMap((a) => a.rows ? a.rows.flat() : []).map((k) => k && k.latex));
  expect(teclas).toContain("{}^{#?}_{#?}#0");
  expect(teclas).toContain("{}^{#?}_{#?}\\mathrm{#0}");
  await page.evaluate(() => carregarPassos([{ latex: "C" }]));
  const mf = campos().first();
  await mf.focus();
  await page.keyboard.press("Control+a");
  const barra = page.locator("#barra-selecao");
  await barra.getByRole("button", { name: "Índices à esquerda (número de massa e número atômico)" }).click();
  await page.keyboard.type("14");
  await page.keyboard.press("Tab");
  await page.keyboard.type("6");
  // O MathLive guarda o indice antes da potencia e comeca pela caixinha de baixo
  await expect.poll(() => page.evaluate(() => passos[0].latex)).toBe("{}_{14}^6C");
});
