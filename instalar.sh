#!/usr/bin/env bash
# =====================================================================
# instalar.sh - Editor de equações - LQTSM (Linux x86_64)
#   1. npm ci                 (dependências com versão fixa + app/vendor)
#   2. build                  (AppImage e .deb em dist/)
#   3. instalação:            .deb via apt/dpkg (com sudo) ou, sem sudo,
#                             AppImage copiado para ~/.local/bin
#   4. entrada .desktop do usuário + ícone em ~/.local/share
# Uso:  ./instalar.sh            (pergunta .deb ou AppImage)
#       ./instalar.sh deb        (.deb, pede sudo)
#       ./instalar.sh appimage   (sem sudo)
# =====================================================================
set -euo pipefail

# ---------------- CONFIGURACAO ----------------
NOME="editor-equacoes-lqtsm"
TITULO="Editor de equações - LQTSM"
MODO="${1:-}"                                   # deb | appimage | vazio (pergunta)
DIR_BIN="$HOME/.local/bin"
DIR_APPS="$HOME/.local/share/applications"
DIR_ICONES="$HOME/.local/share/icons/hicolor/512x512/apps"
RAIZ="$(cd "$(dirname "$0")" && pwd)"

# ---------------- MOTOR ----------------
cd "$RAIZ"

command -v node >/dev/null || { echo "ERRO: node não encontrado (Node.js 20+)." >&2; exit 1; }
command -v npm  >/dev/null || { echo "ERRO: npm não encontrado." >&2; exit 1; }

if [[ -z "$MODO" ]]; then
  if command -v dpkg >/dev/null && command -v sudo >/dev/null; then
    read -r -p "Instalar como .deb (sistema, pede sudo) ou AppImage (só este usuário)? [deb/appimage] " MODO
  else
    MODO="appimage"
  fi
fi
case "$MODO" in deb|appimage) ;; *) echo "ERRO: modo inválido: $MODO" >&2; exit 1 ;; esac

echo "== 1/4 npm ci"
npm ci                                            # roda o postinstall: app/vendor
bash scripts/sincronizar_index.sh >/dev/null      # garante as trocas de URL

echo "== 2/4 build ($MODO)"
if [[ "$MODO" == "deb" ]]; then npm run dist:deb; else npm run dist:appimage; fi

echo "== 3/4 instalação"
if [[ "$MODO" == "deb" ]]; then
  DEB="$(ls -t dist/${NOME}-*-amd64.deb dist/${NOME}-*-x64.deb 2>/dev/null | head -n1 || true)"
  [[ -n "$DEB" ]] || { echo "ERRO: .deb não encontrado em dist/." >&2; exit 1; }
  if command -v apt >/dev/null; then sudo apt install -y "./$DEB"; else sudo dpkg -i "$DEB"; fi
  EXEC="/opt/${TITULO}/${NOME}"
  [[ -x "$EXEC" ]] || EXEC="$(command -v "$NOME" || echo "/opt/${TITULO}/${NOME}")"
else
  APPIMAGE="$(ls -t dist/${NOME}-*-x86_64.AppImage dist/${NOME}-*-x64.AppImage 2>/dev/null | head -n1 || true)"
  [[ -n "$APPIMAGE" ]] || { echo "ERRO: AppImage não encontrado em dist/." >&2; exit 1; }
  mkdir -p "$DIR_BIN"
  cp -f "$APPIMAGE" "$DIR_BIN/$NOME.AppImage"
  chmod +x "$DIR_BIN/$NOME.AppImage"
  EXEC="$DIR_BIN/$NOME.AppImage"
  # Sem libfuse2, o AppImage ainda roda com --appimage-extract-and-run
  if ! ldconfig -p 2>/dev/null | grep -q libfuse.so.2; then
    printf '#!/usr/bin/env bash\nexec "%s" --appimage-extract-and-run "$@"\n' "$DIR_BIN/$NOME.AppImage" > "$DIR_BIN/$NOME"
    chmod +x "$DIR_BIN/$NOME"
    EXEC="$DIR_BIN/$NOME"
  fi
fi

echo "== 4/4 entrada .desktop do usuário"
mkdir -p "$DIR_APPS" "$DIR_ICONES"
cp -f build/icon.png "$DIR_ICONES/$NOME.png"
cat > "$DIR_APPS/$NOME.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$TITULO
Comment=Editor visual de equações e demonstrações (LaTeX, MathML, SVG, PNG)
Exec="$EXEC" %U
Icon=$NOME
Terminal=false
Categories=Education;Science;Math;
Keywords=LaTeX;equação;matemática;química;
StartupWMClass=$NOME
EOF
chmod +x "$DIR_APPS/$NOME.desktop"
command -v update-desktop-database >/dev/null && update-desktop-database "$DIR_APPS" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo
echo "Pronto. Execute: $EXEC"
echo "Ou procure \"$TITULO\" no menu de aplicativos."
echo "Dados do programa (histórico, tema, janela): ~/.config/$NOME/"
