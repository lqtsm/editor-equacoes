/* Copia de node_modules para app/vendor so o que a pagina usa (offline):
     vendor/mathlive/  mathlive.min.js, mathlive-static.css, fonts/
     vendor/mathjax/   MathJax 4.1.3 (tex-svg-nofont.js e extensoes)
     vendor/mathjax-fontes/  fontes TeX, STIX Two, Pagella e Asana (so SVG)
     vendor/fontes/    ibm-plex.css + .woff2 (IBM Plex Sans 400/500/600, Mono 400/500)
   Roda no postinstall e em `npm run vendor`. */
"use strict";

/* ---------------- CONFIGURACAO ---------------- */
const PESOS_SANS = [400, 500, 600];
const PESOS_MONO = [400, 500];
const SUBCONJUNTOS = ["latin", "latin-ext"];        // acentos do portugues estao em latin-ext
const FONTES_MATHJAX = ["tex", "stix2", "pagella", "asana"];   // as do seletor da pagina (FONTES)

/* ---------------- MOTOR ---------------- */
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const NM = path.join(RAIZ, "node_modules");
const VENDOR = path.join(RAIZ, "app", "vendor");

function copiar(origem, destino) {
  if (!fs.existsSync(origem)) { console.warn("  (ausente) " + path.relative(NM, origem)); return; }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.cpSync(origem, destino, { recursive: true });
}

// MathLive 0.110.0
const ML = path.join(NM, "mathlive");
copiar(path.join(ML, "mathlive.min.js"), path.join(VENDOR, "mathlive", "mathlive.min.js"));
copiar(path.join(ML, "mathlive-static.css"), path.join(VENDOR, "mathlive", "mathlive-static.css"));
copiar(path.join(ML, "mathlive-fonts.css"), path.join(VENDOR, "mathlive", "mathlive-fonts.css"));
copiar(path.join(ML, "fonts"), path.join(VENDOR, "mathlive", "fonts"));

// MathJax 4.1.3: o pacote inteiro (tex-svg-nofont + extensoes do autoload), sem os .map
// nem o codigo so de Node; e as fontes do seletor (svg.js + svg/dynamic)
const MJ = path.join(NM, "mathjax");
fs.rmSync(path.join(VENDOR, "mathjax"), { recursive: true, force: true });   // sobras de outra versao
fs.cpSync(MJ, path.join(VENDOR, "mathjax"), {
  recursive: true,
  filter: (o) => !o.endsWith(".map") && !/[\\/]node-main/.test(o) && !o.endsWith("require.mjs"),
});
for (const f of FONTES_MATHJAX) {
  const pacote = `mathjax-${f}-font`;
  const origem = path.join(NM, "@mathjax", pacote);
  const destino = path.join(VENDOR, "mathjax-fontes", pacote);
  copiar(path.join(origem, "svg.js"), path.join(destino, "svg.js"));
  if (fs.existsSync(path.join(origem, "svg"))) copiar(path.join(origem, "svg"), path.join(destino, "svg"));   // a TeX nao tem partes dinamicas
  copiar(path.join(origem, "package.json"), path.join(destino, "package.json"));   // licenca (Apache-2.0)
}
copiar(path.join(ML, "LICENSE.txt"), path.join(VENDOR, "mathlive", "LICENSE.txt"));

// IBM Plex (fontsource): @font-face locais no lugar do Google Fonts
const css = [];
function fonte(pacote, familia, pesos) {
  const base = path.join(NM, pacote);
  for (const peso of pesos) {
    for (const sub of SUBCONJUNTOS) {
      const nome = `${path.basename(pacote)}-${sub}-${peso}-normal.woff2`;
      const origem = path.join(base, "files", nome);
      if (!fs.existsSync(origem)) continue;
      copiar(origem, path.join(VENDOR, "fontes", nome));
      // Faixas unicode iguais as do Google Fonts para latin / latin-ext
      const faixa = sub === "latin"
        ? "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
        : "U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20CF,U+2113,U+2C60-2C7F,U+A720-A7FF";
      css.push(`@font-face {
  font-family: "${familia}";
  font-style: normal;
  font-display: swap;
  font-weight: ${peso};
  src: url("./${nome}") format("woff2");
  unicode-range: ${faixa};
}`);
    }
  }
  copiar(path.join(base, "LICENSE"), path.join(VENDOR, "fontes", `LICENSE-${path.basename(pacote)}`));
}
fonte("@fontsource/ibm-plex-sans", "IBM Plex Sans", PESOS_SANS);
fonte("@fontsource/ibm-plex-mono", "IBM Plex Mono", PESOS_MONO);
fs.mkdirSync(path.join(VENDOR, "fontes"), { recursive: true });
fs.writeFileSync(path.join(VENDOR, "fontes", "ibm-plex.css"),
  "/* IBM Plex Sans 400/500/600 e IBM Plex Mono 400/500 - @fontsource (OFL), no lugar do Google Fonts */\n" + css.join("\n") + "\n");

console.log("vendor pronto em app/vendor");
