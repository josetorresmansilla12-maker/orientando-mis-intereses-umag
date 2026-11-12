#!/bin/sh
# Compara el lector de la app con el de referencia, con las hojas reales y sus variantes.
# Uso: sh probar.sh /carpeta/temporal [variante]      (antes hay que ejecutar preparar.sh)
TMP="$1"
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
[ -d "$TMP/paginas" ] || { echo "Falta preparar la carpeta: sh preparar.sh adjuntos.zip $TMP"; exit 1; }
cd "$TMP/app/pruebas/hojas-reales" || exit 1
if [ -n "$2" ]; then "$JSC" comparar.js -- "$TMP" "$2"; exit; fi
for v in normal alreves girada90 girada270 torcida4 torcida9 dpi150 dpi300 sombra todo; do
  echo "$v: $("$JSC" comparar.js -- "$TMP" "$v" 2>&1 | tail -1)"
done
