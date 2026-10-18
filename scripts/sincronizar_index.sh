#!/usr/bin/env bash
# =====================================================================
# sincronizar_index.sh - aplica ao app/index.html as UNICAS trocas que o
# programa de desktop exige sobre o index.html publicado no site:
#   1. <link> do Google Fonts (preconnect x2 + stylesheet) -> @font-face local
#   2. <link> do mathlive-static.css (CDN)                 -> vendor/
#   3. <script> do mathlive.min.js (CDN)                   -> vendor/
#   4. const URL_MATHJAX                                   -> vendor/
#   5. const URL_FONTES_MATHLIVE                           -> vendor/
#   6. const URL_FONTE_MATHJAX (fontes do SVG/PNG)         -> vendor/
#   7. frase do rodape ("no seu navegador" -> "no seu computador")
# Uso:  scripts/sincronizar_index.sh [index.html do site]
#       sem argumento, reaplica sobre app/index.html (idempotente).
#       Com argumento, copia tambem a pasta fontes-edicao/ que esta ao lado.
# Falha (exit 1) se qualquer trecho esperado nao for encontrado.
# =====================================================================
set -euo pipefail

# ---------------- CONFIGURACAO ----------------
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="$RAIZ/app/index.html"
ORIGEM="${1:-}"
VENDOR="vendor"            # relativo a app/

# ---------------- MOTOR ----------------
if [[ -n "$ORIGEM" ]]; then
  [[ -f "$ORIGEM" ]] || { echo "ERRO: arquivo nao encontrado: $ORIGEM" >&2; exit 1; }
  cp -f "$ORIGEM" "$DESTINO"
  echo "copiado: $ORIGEM -> app/index.html"
  # Fontes do campo de edicao: ficam ao lado da pagina, no site e no programa
  FONTES_EDICAO="$(dirname "$ORIGEM")/fontes-edicao"
  if [[ -d "$FONTES_EDICAO" ]]; then
    rm -rf "$RAIZ/app/fontes-edicao"
    cp -r "$FONTES_EDICAO" "$RAIZ/app/fontes-edicao"
    echo "copiado: fontes-edicao/ ($(ls "$FONTES_EDICAO" | wc -l) arquivos)"
  fi
fi
[[ -f "$DESTINO" ]] || { echo "ERRO: app/index.html nao existe" >&2; exit 1; }

falhas=0

# trocar NOME 'padrao (ERE)' 'substituicao'   - exige exatamente 1 ocorrencia do
# padrao OU 1 ocorrencia do resultado (quando ja foi aplicado antes)
trocar() {
  local nome="$1" padrao="$2" novo="$3"
  local n_antes n_depois
  n_antes=$(grep -cE -- "$padrao" "$DESTINO" || true)
  n_depois=$(grep -cF -- "$novo" "$DESTINO" || true)
  if [[ "$n_antes" == "1" ]]; then
    sed -i -E "s|$padrao|$novo|" "$DESTINO"
    echo "ok      : $nome"
  elif [[ "$n_depois" == "1" ]]; then
    echo "ja feito: $nome"
  else
    echo "ERRO    : $nome - padrao encontrado $n_antes vez(es) (esperado 1)" >&2
    falhas=$((falhas + 1))
  fi
}

# 1. Google Fonts (bloco de 5 linhas) -> uma linha com a folha local.
#    sed -z trata o arquivo inteiro como uma linha, para casar o bloco.
GF_PADRAO='  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link\n    href="https://fonts.googleapis.com/css2\?family=IBM\+Plex\+Mono:wght@400;500&family=IBM\+Plex\+Sans:wght@400;500;600&display=swap"\n    rel="stylesheet">\n'
GF_NOVO="  <link rel=\"stylesheet\" href=\"$VENDOR/fontes/ibm-plex.css\">\n"
if grep -qzP -- "$GF_PADRAO" "$DESTINO"; then
  sed -i -zE "s|$GF_PADRAO|$GF_NOVO|" "$DESTINO"
  echo "ok      : Google Fonts -> @font-face local"
elif grep -qF -- "href=\"$VENDOR/fontes/ibm-plex.css\"" "$DESTINO"; then
  echo "ja feito: Google Fonts -> @font-face local"
else
  echo "ERRO    : bloco do Google Fonts nao encontrado" >&2
  falhas=$((falhas + 1))
fi

# 2-3. MathLive
trocar "mathlive-static.css" \
  'href="https://cdn\.jsdelivr\.net/npm/mathlive@0\.110\.0/mathlive-static\.css"' \
  "href=\"$VENDOR/mathlive/mathlive-static.css\""
trocar "mathlive.min.js" \
  'src="https://cdn\.jsdelivr\.net/npm/mathlive@0\.110\.0/mathlive\.min\.js"' \
  "src=\"$VENDOR/mathlive/mathlive.min.js\""

# 4-5. Constantes do script
trocar "URL_MATHJAX" \
  'const URL_MATHJAX = "https://cdn\.jsdelivr\.net/npm/mathjax@4\.1\.3/tex-svg-nofont\.js";' \
  "const URL_MATHJAX = \"$VENDOR/mathjax/tex-svg-nofont.js\";"
trocar "URL_FONTES_MATHLIVE" \
  'const URL_FONTES_MATHLIVE = "https://cdn\.jsdelivr\.net/npm/mathlive@0\.110\.0/fonts";' \
  "const URL_FONTES_MATHLIVE = \"$VENDOR/mathlive/fonts\";"

trocar "URL_FONTE_MATHJAX" \
  'const URL_FONTE_MATHJAX = "https://cdn\.jsdelivr\.net/npm/@mathjax/mathjax-\{fonte\}-font@4\.1\.3";' \
  "const URL_FONTE_MATHJAX = \"$VENDOR/mathjax-fontes/mathjax-{fonte}-font\";"

# 7. Rodape
trocar "frase do rodape" \
  'Tudo roda no seu navegador; nada é enviado a servidor\. O histórico fica só neste navegador\.' \
  'Tudo roda no seu computador; nada é enviado a servidor. O histórico fica neste computador.'

if [[ "$falhas" -gt 0 ]]; then
  echo "FALHOU: $falhas troca(s) nao encontrada(s). Confira o index.html novo." >&2
  exit 1
fi

# Garantia final: nenhuma URL externa de biblioteca sobrou
if grep -nE 'cdn\.jsdelivr\.net/npm/(mathlive|@?mathjax)|fonts\.googleapis\.com/css' "$DESTINO"; then
  echo "ERRO: ainda ha URL de CDN no app/index.html" >&2
  exit 1
fi
echo "app/index.html sincronizado."
