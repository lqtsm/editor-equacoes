/* Copia de node_modules para app/vendor so o que a pagina usa (offline):
     vendor/mathlive/  mathlive.min.js, mathlive-static.css, fonts/
     vendor/mathjax/   es5/tex-svg.js, es5/input/tex/extensions/color.js (+ a11y, output, sre)
     vendor/fontes/    ibm-plex.css + .woff2 (IBM Plex Sans 400/500/600, Mono 400/500)
   Roda no postinstall e em `npm run vendor`. */
"use strict";

/* ---------------- CONFIGURACAO ---------------- */
const PESOS_SANS = [400, 500, 600];
const PESOS_MONO = [400, 500];
const SUBCONJUNTOS = ["latin", "latin-ext"];        // acentos do portugues estao em latin-ext
const ARQUIVOS_MATHJAX = [
  "es5/tex-svg.js",
  "es5/input/tex/extensions/color.js",
  "es5/input/tex/extensions/colorv2.js",
  "es5/input/tex/extensions/boldsymbol.js",
  "es5/input/tex/extensions/mathtools.js",
  "es5/input/tex/extensions/cancel.js",
  "es5/input/tex/extensions/bbox.js",
  "es5/input/tex/extensions/html.js",
  "es5/input/tex/extensions/unicode.js",
  "es5/input/tex/extensions/textmacros.js",
  "es5/input/tex/extensions/upgreek.js",
  "es5/input/tex/extensions/enclose.js",
  "es5/input/tex/extensions/braket.js",
  "es5/input/tex/extensions/physics.js",
  "es5/input/tex/extensions/mhchem.js",
  "es5/input/tex/extensions/bussproofs.js",
  "es5/input/tex/extensions/action.js",
  "es5/input/tex/extensions/centernot.js",
  "es5/input/tex/extensions/gensymb.js",
  "es5/input/tex/extensions/empheq.js",
  "es5/input/tex/extensions/cases.js",
  "es5/input/tex/extensions/setoptions.js",
  "es5/input/tex/extensions/tagformat.js",
  "es5/input/tex/extensions/verb.js",
  "es5/input/tex/extensions/noundefined.js",
  "es5/input/tex/extensions/noerrors.js",
  "es5/input/tex/extensions/require.js",
  "es5/input/tex/extensions/autoload.js",
];

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

// MathJax 3.2.2 (tex-svg + extensoes que o autoload pode pedir)
const MJ = path.join(NM, "mathjax");
for (const arq of ARQUIVOS_MATHJAX) copiar(path.join(MJ, arq), path.join(VENDOR, "mathjax", arq));
copiar(path.join(MJ, "es5", "a11y"), path.join(VENDOR, "mathjax", "es5", "a11y"));
copiar(path.join(MJ, "es5", "sre"), path.join(VENDOR, "mathjax", "es5", "sre"));
copiar(path.join(MJ, "es5", "ui"), path.join(VENDOR, "mathjax", "es5", "ui"));
copiar(path.join(MJ, "es5", "adaptors"), path.join(VENDOR, "mathjax", "es5", "adaptors"));
copiar(path.join(MJ, "es5", "output", "svg"), path.join(VENDOR, "mathjax", "es5", "output", "svg"));
copiar(path.join(MJ, "es5", "output", "svg.js"), path.join(VENDOR, "mathjax", "es5", "output", "svg.js"));
copiar(path.join(MJ, "LICENSE"), path.join(VENDOR, "mathjax", "LICENSE"));
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
