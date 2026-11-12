"""Ejecuta el lector de referencia sobre los PDF de ejemplo, compara con resultados_esperados.csv y deja:
  - referencia_salida.json: lo leído por la referencia (queda solo en la carpeta temporal)
  - paginas/*.gray: cada página en gris crudo (1700 x 2200), para probar el lector de la app sin navegador
  - formulario_en_blanco.png: compuesto de todas las hojas, sin letra manuscrita ni marcas
No imprime RUT ni nombres: del ID solo dice cuántos dígitos se leyeron."""
import csv, json, os, sys
import cv2, numpy as np

paquete, salida = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(paquete, "referencia_lector_zipgrade"))
import lector_zipgrade_referencia as R

esperado = {}
with open(os.path.join(paquete, "ejemplos_hojas_reales", "resultados_esperados.csv"), encoding="utf-8-sig") as f:
    for r in csv.DictReader(f, delimiter=";"):
        esperado[(r["prueba"], int(r["pagina"]))] = int(r["correctas_zipgrade"])

os.makedirs(os.path.join(salida, "paginas"), exist_ok=True)
pts, etq = R.cargar_plantilla()
datos, alineadas, total, ok = {}, [], 0, 0
for prueba in ("CL", "M1"):
    clave = R.cargar_clave(os.path.join(paquete, "datos", f"clave_{prueba}_forma3.csv"))
    for n, gris in enumerate(R.cargar_paginas(os.path.join(paquete, "ejemplos_hojas_reales", f"4to_A_CPA_{prueba}.pdf")), 1):
        gris.tofile(os.path.join(salida, "paginas", f"{prueba}-{n}.gray"))
        r = R.leer_hoja(gris)
        c = R.corregir(r, clave)
        esp = esperado[(prueba, n)]
        total += 1
        ok += c["correctas"] == esp
        print(f"{prueba} pág {n:02d} | pares {r.get('pares')} | correctas {c['correctas']:2d} (esperado {esp:2d}) {'OK ' if c['correctas'] == esp else 'DIF'} | ID: {len(r['id'])} díg")
        datos[f"{prueba}-{n}"] = {"respuestas": R.cadena_respuestas(r, 100), "correctas": c["correctas"], "id": r["id"], "key": r["key"],
                                  "osc": {str(q): [round(v, 1) for v in d["oscuridad"]] for q, d in r["respuestas"].items()}}
        M, _ = R.alinear(pts, R.circulos(gris))
        alineadas.append(cv2.warpAffine(gris, cv2.invertAffineTransform(M), (1700, 2200), flags=cv2.INTER_LINEAR, borderValue=255))
json.dump(datos, open(os.path.join(salida, "referencia_salida.json"), "w"))
cv2.imwrite(os.path.join(salida, "formulario_en_blanco.png"), np.percentile(np.stack(alineadas), 85, axis=0).astype(np.uint8))
print(f"\n{ok} de {total} hojas con las correctas esperadas (lector de referencia)")
