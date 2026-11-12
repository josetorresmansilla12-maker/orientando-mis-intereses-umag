// Ensayos PAES · hojas sintéticas para las pruebas automáticas.
// Dibuja una hoja de respuestas a partir de una plantilla (sin datos de nadie) y la deforma
// como lo haría un escáner: torcida, girada, a otra resolución, con sombra y con ruido.

(function (global) {
  "use strict";

  // Dibuja la hoja. marcas: { preguntas: { n: [{ alt: 0-4, osc: 0-255 }] }, id: "123456785" }
  // Devuelve { gris, w, h } con la página carta a 200 dpi (1700 x 2200).
  function dibujarHoja(def, marcas, opciones) {
    const o = opciones || {};
    const w = def.ancho, h = def.alto;
    const papel = o.papel || 250;
    const gris = new Uint8Array(w * h).fill(papel);
    const R = def.radioBurbuja || 16;
    const pintar = (cx, cy, radio, valor, cobertura) => {
      const x0 = Math.max(0, Math.floor(cx - radio - 2)), x1 = Math.min(w - 1, Math.ceil(cx + radio + 2));
      const y0 = Math.max(0, Math.floor(cy - radio - 2)), y1 = Math.min(h - 1, Math.ceil(cy + radio + 2));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const a = cobertura(Math.hypot(x - cx, y - cy));
          if (a <= 0) continue;
          const i = y * w + x;
          gris[i] = gris[i] * (1 - a) + valor * a;
        }
      }
    };
    const anillo = (cx, cy) => pintar(cx, cy, R, 130, (d) => Math.max(0, 1 - Math.abs(d - R) / 1.3));
    const relleno = (cx, cy, osc, radio) => pintar(cx, cy, radio, papel - osc, (d) => Math.min(1, Math.max(0, radio - d + 0.5)));
    const cuadrado = (x0, y0, lado) => {
      for (let y = y0; y < y0 + lado; y++) for (let x = x0; x < x0 + lado; x++) if (x >= 0 && y >= 0 && x < w && y < h) gris[y * w + x] = 40;
    };
    // cuadrados de registro en las esquinas y líneas de encabezado, como en la hoja real
    [[250, 420], [1410, 420], [250, 1205], [1410, 1205], [250, 1985], [1410, 1985]].forEach(([x, y]) => cuadrado(x, y, 40));
    for (let x = 440; x < 1390; x++) {
      gris[444 * w + x] = 90;
      gris[500 * w + x] = 90;
    }
    Object.keys(def.preguntas).forEach((q) => def.preguntas[q].forEach(([x, y]) => anillo(x, y)));
    (def.id || []).forEach((col) => col.forEach(([x, y]) => anillo(x, y)));
    (def.key || []).forEach(([x, y]) => anillo(x, y));
    const m = marcas || {};
    Object.keys(m.preguntas || {}).forEach((q) => {
      m.preguntas[q].forEach((marca) => {
        const [x, y] = def.preguntas[q][marca.alt];
        relleno(x + (marca.dx || 0), y + (marca.dy || 0), marca.osc, marca.radio || R - 2);
      });
    });
    String(m.id || "").split("").forEach((digito, col) => {
      if (!/\d/.test(digito) || !def.id[col]) return;
      const [x, y] = def.id[col][Number(digito)];
      relleno(x, y, 150, R - 2);
    });
    (m.idExtra || []).forEach(([col, digito]) => {
      const [x, y] = def.id[col][digito];
      relleno(x, y, 150, R - 2);
    });
    return { gris, w, h };
  }

  // Deforma una página: giro en grados, cuartos de vuelta (90°), escala, desplazamiento,
  // sombra (0 a 1) y ruido. El azar usa una semilla, así cada prueba da siempre lo mismo.
  function deformarHoja(pagina, d, azar) {
    const { gris, w, h } = pagina;
    const giro = d.giro || 0, escala = d.escala || 1, cuartos = d.cuartos || 0;
    let ow = Math.round(w * escala), oh = Math.round(h * escala);
    if (cuartos % 2) [ow, oh] = [oh, ow];
    const out = new Uint8Array(ow * oh);
    const ang = ((giro + 90 * cuartos) * Math.PI) / 180;
    const c = Math.cos(ang), s = Math.sin(ang);
    const dx = d.dx || 0, dy = d.dy || 0, sombra = d.sombra || 0, ruido = d.ruido || 0;
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const ux = (x - ow / 2 - dx) / escala, uy = (y - oh / 2 - dy) / escala;
        const sx = c * ux + s * uy + w / 2, sy = -s * ux + c * uy + h / 2;
        const ix = Math.floor(sx), iy = Math.floor(sy);
        let v = 250;
        if (ix >= 0 && iy >= 0 && ix < w - 1 && iy < h - 1) {
          const ax = sx - ix, ay = sy - iy, i = iy * w + ix;
          v = (gris[i] * (1 - ax) + gris[i + 1] * ax) * (1 - ay) + (gris[i + w] * (1 - ax) + gris[i + w + 1] * ax) * ay;
        }
        if (sombra) v *= 1 - sombra * ((x / ow) * 0.6 + (y / oh) * 0.4);
        if (ruido) v += (azar() + azar() + azar() - 1.5) * 2 * ruido;
        out[y * ow + x] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    return { gris: out, w: ow, h: oh };
  }

  global.PaesSintetica = { dibujarHoja, deformarHoja };
})(typeof window !== "undefined" ? window : globalThis);
