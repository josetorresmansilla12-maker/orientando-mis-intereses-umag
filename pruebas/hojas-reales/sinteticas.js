// Ejecuta pruebas/paes-pruebas.js sin navegador. Uso: jsc sinteticas.js -- /carpeta/temporal [hojas por caso]
const args = typeof scriptArgs !== "undefined" ? scriptArgs : arguments;
["js/paes-plantillas.js", "js/paes-lector.js", "js/paes-logica.js", "pruebas/paes-pruebas.js"].forEach((f) => load(args[0] + "/app/" + f));
const t0 = Date.now();
const r = PaesPruebas.ejecutar({ hojasPorCaso: Number(args[1] || 2) });
r.resultados.forEach((p) => print((p.fallos.length ? "FALLA  " : "ok     ") + p.nombre + " (" + p.n + ")" + p.fallos.map((f) => "\n         - " + f).join("")));
print(`${r.total - r.fallidas} de ${r.total} pruebas correctas · ${r.comprobaciones} comprobaciones · marcas sintéticas ${r.sinteticas.aciertos}/${r.sinteticas.totalMarcas} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
