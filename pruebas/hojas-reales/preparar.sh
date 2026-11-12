#!/bin/sh
# Prepara la carpeta temporal para probar el lector con las hojas reales (ver LEEME.txt).
# Uso: sh preparar.sh /ruta/adjuntos_modulo_ensayos_paes.zip /carpeta/temporal
set -e
ZIP="$1"; TMP="$2"
AQUI="$(cd "$(dirname "$0")" && pwd)"
[ -f "$ZIP" ] && [ -n "$TMP" ] || { echo "Uso: sh preparar.sh adjuntos.zip carpeta_temporal"; exit 1; }
mkdir -p "$TMP"
if [ ! -d "$TMP/adjuntos/paquete" ]; then rm -rf "$TMP/adjuntos"; mkdir "$TMP/adjuntos"; unzip -q "$ZIP" -d "$TMP/adjuntos"; fi
if [ ! -x "$TMP/venv/bin/python" ]; then
  python3 -m venv "$TMP/venv"
  "$TMP/venv/bin/pip" install --quiet --upgrade pip
  "$TMP/venv/bin/pip" install --quiet numpy opencv-python-headless pypdfium2 pillow openpyxl
fi
# enlace a la app con una ruta sin tildes (el intérprete de JavaScript de macOS no las lee bien)
ln -sfn "$(cd "$AQUI/../.." && pwd)" "$TMP/app"
cp "$AQUI/referencia.py" "$TMP/referencia.py"
cd "$TMP" && "$TMP/venv/bin/python" -I referencia.py "$TMP/adjuntos/paquete" "$TMP"
