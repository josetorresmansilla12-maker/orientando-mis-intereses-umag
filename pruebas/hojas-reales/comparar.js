// Compara el lector de la app con el de referencia, hoja por hoja (ver LEEME.txt).
// No imprime RUT: del ID solo dice si coincide con el de la referencia.
const args = typeof scriptArgs !== "undefined" ? scriptArgs : arguments;
const TMP = args[0], cual = args[1] || "normal";
load(TMP + "/app/js/paes-plantillas.js");
load(TMP + "/app/js/paes-lector.js");

const VARIANTES = {
  normal: null,
  alreves: { cuartos: 2 },
  girada90: { cuartos: 1 },
  girada270: { cuartos: 3, giro: 1.5 },
  torcida4: { giro: 4, dx: 25, dy: -18 },
  torcida9: { giro: -9, dx: -30, dy: 40 },
  dpi150: { escala: 0.75 },
  dpi300: { escala: 1.5 },
  sombra: { sombra: 0.35, ruido: 6 },
  todo: { giro: 3, cuartos: 2, escala: 0.9, sombra: 0.25, ruido: 5, dx: 20, dy: 15 },
};

// deforma una página: giro, escala, desplazamiento, sombra y ruido
function deformar(gris, w, h, o) {
  const escala = o.escala || 1, cuartos = o.cuartos || 0;
  let ow = Math.round(w * escala), oh = Math.round(h * escala);
  if (cuartos % 2) [ow, oh] = [oh, ow];
  const out = new Uint8Array(ow * oh);
  const ang = (((o.giro || 0) + 90 * cuartos) * Math.PI) / 180;
  const c = Math.cos(ang), s = Math.sin(ang);
  const azar = PaesLector.azarConSemilla(7);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const ux = (x - ow / 2 - (o.dx || 0)) / escala, uy = (y - oh / 2 - (o.dy || 0)) / escala;
      const sx = c * ux + s * uy + w / 2, sy = -s * ux + c * uy + h / 2;
      const ix = Math.floor(sx), iy = Math.floor(sy);
      let v = 255;
      if (ix >= 0 && iy >= 0 && ix < w - 1 && iy < h - 1) {
        const ax = sx - ix, ay = sy - iy, i = iy * w + ix;
        v = (gris[i] * (1 - ax) + gris[i + 1] * ax) * (1 - ay) + (gris[i + w] * (1 - ax) + gris[i + w + 1] * ax) * ay;
      }
      if (o.sombra) v *= 1 - o.sombra * ((x / ow) * 0.6 + (y / oh) * 0.4);
      if (o.ruido) v += (azar() + azar() + azar() - 1.5) * 2 * o.ruido;
      out[y * ow + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return { gris: out, w: ow, h: oh };
}

const pl = PaesLector.prepararPlantilla(PLANTILLAS_PAES["zipgrade-100"]);
const ref = JSON.parse(read(TMP + "/referencia_salida.json"));
const esperado = {};
read(TMP + "/adjuntos/paquete/ejemplos_hojas_reales/resultados_esperados.csv").split(/\r?\n/).slice(1).forEach((l) => {
  const c = l.split(";");
  if (c.length > 2) esperado[c[0] + "-" + c[1]] = Number(c[2]);
});
function clave(prueba) {
  const k = {};
  read(TMP + `/adjuntos/paquete/datos/clave_${prueba}_forma3.csv`).split(/\r?\n/).slice(1).forEach((l) => {
    const c = l.split(",");
    if (c.length > 2) k[Number(c[1])] = c[2].trim().toUpperCase();
  });
  return k;
}
let ok = 0, total = 0, identicas = 0, idIguales = 0, tTotal = 0, maxDif = 0;
for (const prueba of ["CL", "M1"]) {
  const k = clave(prueba);
  for (let p = 1; esperado[`${prueba}-${p}`] !== undefined; p++) {
    const nombre = `${prueba}-${p}`;
    let gris = readFile(TMP + `/paginas/${nombre}.gray`, "binary"), w = 1700, h = 2200;
    if (VARIANTES[cual]) ({ gris, w, h } = deformar(gris, w, h, VARIANTES[cual]));
    const t0 = Date.now();
    const r = PaesLector.leerHoja(gris, w, h, pl);
    const dt = Date.now() - t0;
    tTotal += dt;
    total++;
    if (!r.legible) {
      print(`${nombre}: ILEGIBLE círculos ${r.circulos} pares ${r.pares}`);
      continue;
    }
    let cor = 0;
    for (const q in k) if (r.respuestas[q - 1].estado === "ok" && r.respuestas[q - 1].letras === k[q]) cor++;
    const cadena = r.respuestas.map((a) => (a.estado === "ok" ? a.letras : a.estado === "doble" ? "*" : "-")).join("");
    const R = ref[nombre];
    let difs = 0, dmax = 0;
    for (let i = 0; i < 100; i++) if (cadena[i] !== R.respuestas[i]) difs++;
    for (let q = 1; q <= 100; q++) for (let a = 0; a < 5; a++) dmax = Math.max(dmax, Math.abs(r.respuestas[q - 1].osc[a] - R.osc[q][a]));
    maxDif = Math.max(maxDif, dmax);
    // la referencia junta las columnas del ID sin marcar los huecos: se compara sin "?"
    const idIgual = r.id.replace(/\?/g, "") === R.id.replace(/\?/g, "");
    if (idIgual) idIguales++;
    if (cor === esperado[nombre]) ok++;
    if (difs === 0) identicas++;
    print(`${nombre}: círculos ${r.circulos} pares ${r.pares} giro ${r.giro.toFixed(2)}° | correctas ${cor} (esp ${esperado[nombre]}) ${cor === esperado[nombre] ? "OK" : "DIF"} | difs vs ref ${difs} | máx dif osc ${dmax.toFixed(1)} | ID ${idIgual ? "igual" : "DISTINTO"} | ${dt} ms`);
  }
}
print(`${ok} de ${total} con las correctas esperadas | ${identicas} idénticas a la referencia | ID igual en ${idIguales} | máx dif oscuridad ${maxDif.toFixed(1)} | ${Math.round(tTotal / total)} ms por hoja`);
