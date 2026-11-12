// Ensayos PAES · lector de hojas de respuesta (OMR), sin IA y sin enviar nada a internet.
//
// Lee una página escaneada (imagen en gris) usando una PLANTILLA con la posición teórica de
// cada burbuja de la hoja (ver js/paes-plantillas.js). Método, tomado del lector de
// referencia que ya se validó con hojas reales:
//   1. Detectar círculos (transformada de Hough por gradiente). Sirven SOLO para alinear.
//   2. Alinear la plantilla con la página: primero una estimación global (giro, escala y
//      desplazamiento, por votación; resuelve hojas torcidas, giradas o al revés) y luego
//      un ajuste afín con ICP + RANSAC. Después cada bloque se corre por separado, para
//      absorber deformaciones locales del escáner.
//   3. Medir la oscuridad de cada burbuja en su posición teórica (255 - mediana del gris
//      en un disco interior) y decidir por pregunta con umbrales configurables.
// No se exige detectar todos los círculos: basta con emparejar suficientes burbujas.
//
// Este archivo no toca la página (DOM): recibe píxeles y devuelve datos, así se puede
// probar solo. La lectura de PDF e imágenes está en js/paes-pdf.js.

(function (global) {
  "use strict";

  const LETRAS = "ABCDE";

  // Umbrales calibrados con hojas reales de la UMAG a 200 dpi: burbujas vacías 4-7,
  // marcas reales 37-150, borrados parciales cerca de 30.
  const CONFIG_LECTOR = {
    umbralMarca: 35, // oscuridad mínima para considerar marcada una burbuja
    dominancia: 1.5, // la más oscura gana si es al menos 1,5 veces la segunda (como ZipGrade)
    umbralTenue: 20, // entre umbralTenue y umbralMarca: marca tenue, se advierte y no cuenta
    umbralSuave: 45, // marca que cuenta, pero tan suave que conviene confirmarla
    radioMedicion: 9, // radio del disco interior que se mide, en px de la plantilla
    minPares: 300, // mínimo de burbujas emparejadas para confiar en la alineación
    minParesBloque: 0.4, // fracción mínima de burbujas emparejadas en un bloque
    umbralBorde: 56, // Hough: fuerza mínima del borde (|gx| + |gy|)
    umbralVotos: 40, // Hough: votos mínimos (suma 3x3) para aceptar un centro
  };

  // ---------------------------------------------------------------- utilidades

  // generador de números al azar con semilla: la lectura de una hoja da siempre lo mismo
  function azarConSemilla(semilla) {
    let a = semilla >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mediana(valores) {
    if (!valores.length) return 0;
    const v = Array.from(valores).sort((a, b) => a - b);
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  // ---------------------------------------------------------------- plantilla

  // Deja la plantilla lista para leer: lista plana de puntos, a qué corresponde cada uno
  // y en qué grupo (bloque) está. Formato de entrada: ver js/paes-plantillas.js.
  function prepararPlantilla(def) {
    const xs = [];
    const ys = [];
    const etiquetas = [];
    const grupos = new Map();
    const agregar = (x, y, etq, grupo) => {
      const i = xs.length;
      xs.push(x);
      ys.push(y);
      etiquetas.push(etq);
      if (!grupos.has(grupo)) grupos.set(grupo, []);
      grupos.get(grupo).push(i);
    };
    const filasPorBloque = def.filasPorBloque || 10;
    Object.keys(def.preguntas)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((q) => {
        def.preguntas[q].forEach(([x, y], k) => agregar(x, y, { t: "q", a: q, b: k }, "q" + Math.floor((q - 1) / filasPorBloque)));
      });
    (def.id || []).forEach((columna, col) => columna.forEach(([x, y], d) => agregar(x, y, { t: "id", a: col, b: d }, "id")));
    (def.key || []).forEach(([x, y], fila) => agregar(x, y, { t: "key", a: fila, b: 0 }, "key"));
    const n = xs.length;
    const X = Float64Array.from(xs);
    const Y = Float64Array.from(ys);
    const vecinos = vecinosMasCercanos(X, Y, n);
    const reja = direccionYPasoDeLaReja(vecinos);
    return {
      def,
      n,
      X,
      Y,
      etiquetas,
      grupos: Array.from(grupos.entries()).map(([nombre, indices]) => ({ nombre, indices })),
      reja,
      ancho: def.ancho,
      alto: def.alto,
      radio: def.radioBurbuja || 16,
      nPreguntas: Object.keys(def.preguntas).length,
      nAlternativas: def.preguntas[Object.keys(def.preguntas)[0]].length,
      columnasId: (def.id || []).length,
    };
  }

  // ---------------------------------------------------------------- círculos (Hough)

  // suavizado gaussiano 5x5 (sigma 1,5), separable
  function suavizar(gris, w, h) {
    const k0 = 0.2921, k1 = 0.2339, k2 = 0.1201;
    const tmp = new Float32Array(w * h);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const f = y * w;
      for (let x = 2; x < w - 2; x++) {
        const i = f + x;
        tmp[i] = k0 * gris[i] + k1 * (gris[i - 1] + gris[i + 1]) + k2 * (gris[i - 2] + gris[i + 2]);
      }
      tmp[f] = tmp[f + 1] = tmp[f + 2];
      tmp[f + w - 1] = tmp[f + w - 2] = tmp[f + w - 3];
    }
    for (let y = 2; y < h - 2; y++) {
      const f = y * w;
      for (let x = 0; x < w; x++) {
        const i = f + x;
        out[i] = k0 * tmp[i] + k1 * (tmp[i - w] + tmp[i + w]) + k2 * (tmp[i - 2 * w] + tmp[i + 2 * w]) + 0.5;
      }
    }
    for (let x = 0; x < w; x++) {
      out[x] = out[w + x] = out[2 * w + x];
      out[(h - 1) * w + x] = out[(h - 2) * w + x] = out[(h - 3) * w + x];
    }
    return out;
  }

  // Centros de círculos de radio entre rMin y rMax. Cada píxel de borde vota, a lo largo
  // de la dirección de su gradiente, por los posibles centros; los máximos del acumulador
  // son los centros. Devuelve {x, y, votos} ordenados de más a menos votos.
  function detectarCirculos(gris, w, h, opciones) {
    const o = opciones || {};
    const rMin = o.rMin || 13;
    const rMax = o.rMax || 19;
    const minDist = o.minDist || 28;
    const umbralBorde = o.umbralBorde || CONFIG_LECTOR.umbralBorde;
    const umbralVotos = o.umbralVotos || CONFIG_LECTOR.umbralVotos;
    const s = suavizar(gris, w, h);
    const acc = new Uint16Array(w * h);
    const margen = 2;
    for (let y = margen; y < h - margen; y++) {
      const f = y * w;
      for (let x = margen; x < w - margen; x++) {
        const i = f + x;
        const a = s[i - w - 1], b = s[i - w], c = s[i - w + 1];
        const d = s[i - 1], e = s[i + 1];
        const g = s[i + w - 1], hh = s[i + w], k = s[i + w + 1];
        const gx = c + 2 * e + k - a - 2 * d - g;
        const gy = g + 2 * hh + k - a - 2 * b - c;
        const mag = (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);
        if (mag < umbralBorde) continue;
        const norma = Math.sqrt(gx * gx + gy * gy);
        const dx = gx / norma;
        const dy = gy / norma;
        for (let r = rMin; r <= rMax; r++) {
          let cx = (x + r * dx + 0.5) | 0;
          let cy = (y + r * dy + 0.5) | 0;
          if (cx >= 0 && cx < w && cy >= 0 && cy < h) acc[cy * w + cx]++;
          cx = (x - r * dx + 0.5) | 0;
          cy = (y - r * dy + 0.5) | 0;
          if (cx >= 0 && cx < w && cy >= 0 && cy < h) acc[cy * w + cx]++;
        }
      }
    }
    // suma 3x3 del acumulador y máximos locales
    const candidatos = [];
    for (let y = 2; y < h - 2; y++) {
      const f = y * w;
      for (let x = 2; x < w - 2; x++) {
        const i = f + x;
        if (acc[i] < 3) continue;
        const suma =
          acc[i - w - 1] + acc[i - w] + acc[i - w + 1] + acc[i - 1] + acc[i] + acc[i + 1] + acc[i + w - 1] + acc[i + w] + acc[i + w + 1];
        if (suma < umbralVotos) continue;
        // máximo dentro de su vecindad de 5x5 (comparando el valor central)
        const v = acc[i];
        let esMaximo = true;
        for (let yy = -2; yy <= 2 && esMaximo; yy++) {
          const ff = i + yy * w;
          for (let xx = -2; xx <= 2; xx++) {
            if (acc[ff + xx] > v) {
              esMaximo = false;
              break;
            }
          }
        }
        if (esMaximo) candidatos.push({ i, suma });
      }
    }
    candidatos.sort((p, q) => q.suma - p.suma || p.i - q.i);
    // se quedan los de más votos, separados al menos minDist entre sí
    const celda = minDist;
    const cw = Math.ceil(w / celda);
    const ch = Math.ceil(h / celda);
    const rejilla = new Array(cw * ch);
    const salida = [];
    const d2min = minDist * minDist;
    for (const cand of candidatos) {
      const px = cand.i % w;
      const py = (cand.i / w) | 0;
      // centro fino: centroide del acumulador en 5x5
      let sx = 0, sy = 0, sw = 0;
      for (let yy = -2; yy <= 2; yy++) {
        for (let xx = -2; xx <= 2; xx++) {
          const v = acc[(py + yy) * w + px + xx];
          sx += v * xx;
          sy += v * yy;
          sw += v;
        }
      }
      const x = px + sx / sw;
      const y = py + sy / sw;
      const gx = (x / celda) | 0;
      const gy = (y / celda) | 0;
      let libre = true;
      for (let yy = Math.max(0, gy - 1); yy <= Math.min(ch - 1, gy + 1) && libre; yy++) {
        for (let xx = Math.max(0, gx - 1); xx <= Math.min(cw - 1, gx + 1) && libre; xx++) {
          const lista = rejilla[yy * cw + xx];
          if (!lista) continue;
          for (const q of lista) {
            const ddx = q.x - x, ddy = q.y - y;
            if (ddx * ddx + ddy * ddy < d2min) {
              libre = false;
              break;
            }
          }
        }
      }
      if (!libre) continue;
      const punto = { x, y, votos: cand.suma };
      (rejilla[gy * cw + gx] || (rejilla[gy * cw + gx] = [])).push(punto);
      salida.push(punto);
    }
    // Entre burbujas vecinas aparecen "centros fantasma" con pocos votos. Se descartan
    // comparando con una burbuja segura de la hoja: la que está a media tabla entre las
    // que se esperan (nEsperado). Las burbujas reales, llenas o vacías, quedan muy arriba.
    if (o.nEsperado && salida.length > o.nEsperado * 0.5) {
      const referencia = salida[Math.floor(o.nEsperado * 0.5)].votos;
      const minimo = referencia * (o.fraccionVotos || 0.35);
      return salida.filter((c) => c.votos >= minimo);
    }
    return salida;
  }

  // ---------------------------------------------------------------- reja de burbujas

  // para cada punto, el vector a su vecino más cercano
  function vecinosMasCercanos(X, Y, n) {
    const vecinos = [];
    for (let i = 0; i < n; i++) {
      let mejor = Infinity, mj = -1;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = X[j] - X[i], dy = Y[j] - Y[i];
        const d = dx * dx + dy * dy;
        if (d < mejor) {
          mejor = d;
          mj = j;
        }
      }
      if (mj >= 0) vecinos.push({ dx: X[mj] - X[i], dy: Y[mj] - Y[i], d: Math.sqrt(mejor) });
    }
    return vecinos;
  }

  // Dirección de las filas de burbujas (ángulo entre 0 y 180°) y distancia entre burbujas
  // vecinas. Las burbujas de una fila están más juntas que las filas entre sí, así que el
  // vecino más cercano casi siempre está en la misma fila.
  function direccionYPasoDeLaReja(vecinos) {
    if (vecinos.length < 20) return null;
    const dMed = mediana(vecinos.map((v) => v.d));
    const buenos = vecinos.filter((v) => v.d > dMed * 0.75 && v.d < dMed * 1.3);
    const histo = new Float64Array(180);
    const angulos = buenos.map((v) => {
      let a = (Math.atan2(v.dy, v.dx) * 180) / Math.PI;
      a = ((a % 180) + 180) % 180;
      histo[Math.min(179, Math.floor(a))]++;
      return a;
    });
    let mejor = -1, pico = 0;
    for (let i = 0; i < 180; i++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) sum += histo[(i + k + 180) % 180];
      if (sum > mejor) {
        mejor = sum;
        pico = i + 0.5;
      }
    }
    // promedio circular (con período de 180°) de los ángulos cercanos al pico
    let sc = 0, ss = 0;
    const dists = [];
    buenos.forEach((v, i) => {
      let dif = Math.abs(angulos[i] - pico);
      if (dif > 90) dif = 180 - dif;
      if (dif > 6) return;
      const dobl = (angulos[i] * 2 * Math.PI) / 180;
      sc += Math.cos(dobl);
      ss += Math.sin(dobl);
      dists.push(v.d);
    });
    if (dists.length < 12) return null;
    let ang = (Math.atan2(ss, sc) * 90) / Math.PI;
    ang = ((ang % 180) + 180) % 180;
    return { angulo: ang, paso: mediana(dists), apoyo: dists.length };
  }

  // ---------------------------------------------------------------- transformaciones afines
  // M = [a, b, tx, c, d, ty]:  x' = a·x + b·y + tx ;  y' = c·x + d·y + ty

  function aplicar(M, x, y) {
    return [M[0] * x + M[1] * y + M[2], M[3] * x + M[4] * y + M[5]];
  }

  function escalaDe(M) {
    return Math.sqrt(Math.abs(M[0] * M[4] - M[1] * M[3]));
  }

  function invertirAfin(M) {
    const det = M[0] * M[4] - M[1] * M[3];
    const a = M[4] / det, b = -M[1] / det, c = -M[3] / det, d = M[0] / det;
    return [a, b, -(a * M[2] + b * M[5]), c, d, -(c * M[2] + d * M[5])];
  }

  // afín por mínimos cuadrados a partir de pares (sx, sy) -> (dx, dy)
  function afinMinimosCuadrados(sx, sy, dx, dy, indices) {
    let Sxx = 0, Sxy = 0, Sx = 0, Syy = 0, Sy = 0, n = 0;
    let Bx0 = 0, Bx1 = 0, Bx2 = 0, By0 = 0, By1 = 0, By2 = 0;
    for (const i of indices) {
      const x = sx[i], y = sy[i], u = dx[i], v = dy[i];
      Sxx += x * x; Sxy += x * y; Sx += x; Syy += y * y; Sy += y; n++;
      Bx0 += x * u; Bx1 += y * u; Bx2 += u;
      By0 += x * v; By1 += y * v; By2 += v;
    }
    // matriz normal simétrica [[Sxx,Sxy,Sx],[Sxy,Syy,Sy],[Sx,Sy,n]]
    const det = Sxx * (Syy * n - Sy * Sy) - Sxy * (Sxy * n - Sy * Sx) + Sx * (Sxy * Sy - Syy * Sx);
    if (Math.abs(det) < 1e-9) return null;
    const i00 = (Syy * n - Sy * Sy) / det, i01 = (Sx * Sy - Sxy * n) / det, i02 = (Sxy * Sy - Syy * Sx) / det;
    const i11 = (Sxx * n - Sx * Sx) / det, i12 = (Sxy * Sx - Sxx * Sy) / det;
    const i22 = (Sxx * Syy - Sxy * Sxy) / det;
    return [
      i00 * Bx0 + i01 * Bx1 + i02 * Bx2, i01 * Bx0 + i11 * Bx1 + i12 * Bx2, i02 * Bx0 + i12 * Bx1 + i22 * Bx2,
      i00 * By0 + i01 * By1 + i02 * By2, i01 * By0 + i11 * By1 + i12 * By2, i02 * By0 + i12 * By1 + i22 * By2,
    ];
  }

  // afín robusto (RANSAC): prueba tríos al azar y se queda con el que más pares explica
  function afinRansac(sx, sy, dx, dy, n, umbral, azar) {
    if (n < 6) return null;
    const u2 = umbral * umbral;
    let mejorCuenta = 0, mejorM = null;
    const todos = Array.from({ length: n }, (_, i) => i);
    for (let it = 0; it < 250; it++) {
      const i = (azar() * n) | 0, j = (azar() * n) | 0, k = (azar() * n) | 0;
      if (i === j || j === k || i === k) continue;
      const area = (sx[j] - sx[i]) * (sy[k] - sy[i]) - (sx[k] - sx[i]) * (sy[j] - sy[i]);
      if (Math.abs(area) < 2000) continue; // trío casi alineado: mala base
      const M = afinMinimosCuadrados(sx, sy, dx, dy, [i, j, k]);
      if (!M) continue;
      let cuenta = 0;
      for (let p = 0; p < n; p++) {
        const ex = M[0] * sx[p] + M[1] * sy[p] + M[2] - dx[p];
        const ey = M[3] * sx[p] + M[4] * sy[p] + M[5] - dy[p];
        if (ex * ex + ey * ey < u2) cuenta++;
      }
      if (cuenta > mejorCuenta) {
        mejorCuenta = cuenta;
        mejorM = M;
        if (cuenta > n * 0.97) break;
      }
    }
    if (!mejorM) return afinMinimosCuadrados(sx, sy, dx, dy, todos);
    // se afina dos veces con todos los pares que calzan
    let M = mejorM;
    for (let v = 0; v < 2; v++) {
      const dentro = [];
      for (let p = 0; p < n; p++) {
        const ex = M[0] * sx[p] + M[1] * sy[p] + M[2] - dx[p];
        const ey = M[3] * sx[p] + M[4] * sy[p] + M[5] - dy[p];
        if (ex * ex + ey * ey < u2) dentro.push(p);
      }
      if (dentro.length < 6) break;
      const N = afinMinimosCuadrados(sx, sy, dx, dy, dentro);
      if (!N) break;
      M = N;
    }
    return M;
  }

  // ---------------------------------------------------------------- alineación

  // índice espacial simple de los círculos, para buscar el más cercano a un punto
  function indexar(C, celda) {
    const mapa = new Map();
    C.forEach((c, j) => {
      const k = ((c.x / celda) | 0) + "," + ((c.y / celda) | 0);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(j);
    });
    return { mapa, celda };
  }

  function masCercano(indice, C, x, y, radio) {
    const { mapa, celda } = indice;
    const gx = (x / celda) | 0, gy = (y / celda) | 0;
    const alcance = Math.ceil(radio / celda);
    let mejor = radio * radio, mj = -1;
    for (let yy = gy - alcance; yy <= gy + alcance; yy++) {
      for (let xx = gx - alcance; xx <= gx + alcance; xx++) {
        const lista = mapa.get(xx + "," + yy);
        if (!lista) continue;
        for (const j of lista) {
          const dx = C[j].x - x, dy = C[j].y - y;
          const d = dx * dx + dy * dy;
          if (d < mejor) {
            mejor = d;
            mj = j;
          }
        }
      }
    }
    return mj;
  }

  // Estimación global: giro y escala a partir de la reja de burbujas, y desplazamiento por
  // votación (cada par plantilla-círculo vota por el desplazamiento que lo haría calzar).
  // Devuelve candidatos ordenados por votos; contempla la hoja al derecho y al revés.
  function candidatosIniciales(pl, C) {
    const n = C.length;
    const X = new Float64Array(n), Y = new Float64Array(n);
    C.forEach((c, i) => {
      X[i] = c.x;
      Y[i] = c.y;
    });
    // C viene ordenado por votos: la reja se mide con los círculos más claros
    const nReja = Math.min(n, Math.round(pl.n * 1.05));
    const reja = direccionYPasoDeLaReja(vecinosMasCercanos(X, Y, nReja));
    if (!reja || !pl.reja) return [];
    const escala = reja.paso / pl.reja.paso;
    const giroBase = reja.angulo - pl.reja.angulo;
    const candidatos = [];
    for (const extra of [0, 180]) {
      const giro = ((giroBase + extra) * Math.PI) / 180;
      const a = escala * Math.cos(giro), b = -escala * Math.sin(giro);
      const c = escala * Math.sin(giro), d = escala * Math.cos(giro);
      const px = new Float64Array(pl.n), py = new Float64Array(pl.n);
      let minPx = Infinity, maxPx = -Infinity, minPy = Infinity, maxPy = -Infinity;
      for (let i = 0; i < pl.n; i++) {
        px[i] = a * pl.X[i] + b * pl.Y[i];
        py[i] = c * pl.X[i] + d * pl.Y[i];
        if (px[i] < minPx) minPx = px[i];
        if (px[i] > maxPx) maxPx = px[i];
        if (py[i] < minPy) minPy = py[i];
        if (py[i] > maxPy) maxPy = py[i];
      }
      let minCx = Infinity, maxCx = -Infinity, minCy = Infinity, maxCy = -Infinity;
      for (let j = 0; j < n; j++) {
        if (X[j] < minCx) minCx = X[j];
        if (X[j] > maxCx) maxCx = X[j];
        if (Y[j] < minCy) minCy = Y[j];
        if (Y[j] > maxCy) maxCy = Y[j];
      }
      const bin = Math.max(6, reja.paso * 0.3);
      const tx0 = minCx - maxPx - bin, ty0 = minCy - maxPy - bin;
      const bw = Math.ceil((maxCx - minPx - tx0) / bin) + 2;
      const bh = Math.ceil((maxCy - minPy - ty0) / bin) + 2;
      const votos = new Uint16Array(bw * bh);
      for (let i = 0; i < pl.n; i++) {
        for (let j = 0; j < n; j++) {
          const bx = ((X[j] - px[i] - tx0) / bin) | 0;
          const by = ((Y[j] - py[i] - ty0) / bin) | 0;
          votos[by * bw + bx]++;
        }
      }
      // los 3 mejores picos (suma 3x3), separados entre sí
      const picos = [];
      for (let by = 1; by < bh - 1; by++) {
        for (let bx = 1; bx < bw - 1; bx++) {
          const i = by * bw + bx;
          if (votos[i] < 8) continue;
          const suma =
            votos[i - bw - 1] + votos[i - bw] + votos[i - bw + 1] + votos[i - 1] + votos[i] + votos[i + 1] + votos[i + bw - 1] + votos[i + bw] + votos[i + bw + 1];
          picos.push({ bx, by, suma });
        }
      }
      picos.sort((p, q) => q.suma - p.suma);
      const elegidos = [];
      for (const p of picos) {
        if (elegidos.length >= 3) break;
        if (elegidos.some((e) => Math.abs(e.bx - p.bx) <= 2 && Math.abs(e.by - p.by) <= 2)) continue;
        elegidos.push(p);
      }
      for (const p of elegidos) {
        // desplazamiento fino: mediana de los pares que votaron cerca del pico
        const cx = tx0 + (p.bx + 0.5) * bin, cy = ty0 + (p.by + 0.5) * bin;
        const dxs = [], dys = [];
        const lim = bin * 1.5;
        for (let i = 0; i < pl.n; i++) {
          for (let j = 0; j < n; j++) {
            const ex = X[j] - px[i] - cx, ey = Y[j] - py[i] - cy;
            if (ex > -lim && ex < lim && ey > -lim && ey < lim) {
              dxs.push(ex);
              dys.push(ey);
            }
          }
        }
        candidatos.push({ M: [a, b, cx + mediana(dxs), c, d, cy + mediana(dys)], votos: p.suma });
      }
    }
    candidatos.sort((p, q) => q.votos - p.votos);
    return candidatos;
  }

  // ICP: empareja cada burbuja de la plantilla con el círculo más cercano y vuelve a
  // estimar la transformación afín, cada vez con un radio de búsqueda más chico.
  function afinarConIcp(pl, C, indice, M0, azar) {
    let M = M0.slice();
    let pares = 0;
    const s0 = escalaDe(M0);
    for (const radioBase of [40, 25, 16, 10, 8]) {
      const radio = radioBase * s0;
      const sx = [], sy = [], dx = [], dy = [];
      for (let i = 0; i < pl.n; i++) {
        const x = M[0] * pl.X[i] + M[1] * pl.Y[i] + M[2];
        const y = M[3] * pl.X[i] + M[4] * pl.Y[i] + M[5];
        const j = masCercano(indice, C, x, y, radio);
        if (j < 0) continue;
        sx.push(pl.X[i]);
        sy.push(pl.Y[i]);
        dx.push(C[j].x);
        dy.push(C[j].y);
      }
      if (sx.length < 20) continue;
      const N = afinRansac(sx, sy, dx, dy, sx.length, 4 * s0, azar);
      if (N) {
        M = N;
        pares = sx.length;
      }
    }
    // pares finales: burbujas con un círculo a menos de 8 px (de plantilla)
    let finales = 0;
    for (let i = 0; i < pl.n; i++) {
      const x = M[0] * pl.X[i] + M[1] * pl.Y[i] + M[2];
      const y = M[3] * pl.X[i] + M[4] * pl.Y[i] + M[5];
      if (masCercano(indice, C, x, y, 8 * s0) >= 0) finales++;
    }
    return { M, pares: finales, paresIcp: pares };
  }

  // Ajuste fino: cada bloque se corre por separado hasta calzar con los círculos cercanos.
  // Corrige deformaciones locales del escáner que una sola transformación no absorbe.
  function refinarPorGrupo(pl, C, indice, px, py, escala) {
    const deltas = [];
    const radio = 14 * escala;
    for (const grupo of pl.grupos) {
      let ax = 0, ay = 0, emparejadas = 0;
      for (let vuelta = 0; vuelta < 3; vuelta++) {
        const ex = [], ey = [];
        for (const i of grupo.indices) {
          const j = masCercano(indice, C, px[i] + ax, py[i] + ay, radio);
          if (j < 0) continue;
          ex.push(C[j].x - px[i] - ax);
          ey.push(C[j].y - py[i] - ay);
        }
        emparejadas = ex.length;
        if (ex.length < Math.min(8, grupo.indices.length * 0.6)) break;
        const mx = mediana(ex), my = mediana(ey);
        ax += mx;
        ay += my;
        if (Math.hypot(mx, my) < 0.5) break;
      }
      for (const i of grupo.indices) {
        px[i] += ax;
        py[i] += ay;
      }
      deltas.push({ grupo: grupo.nombre, dx: ax, dy: ay, emparejadas, total: grupo.indices.length });
    }
    return deltas;
  }

  // ---------------------------------------------------------------- medición y decisión

  // desplazamientos de los píxeles de un disco, ya calculados por radio
  const discos = new Map();
  function disco(r) {
    if (!discos.has(r)) {
      const offs = [];
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) offs.push([x, y]);
      discos.set(r, offs);
    }
    return discos.get(r);
  }

  // oscuridad de una burbuja: 255 - mediana del gris en un disco interior (el borde de la
  // burbuja queda afuera). blanco: nivel del papel en esa zona, para normalizar la luz.
  function oscuridad(gris, w, h, x, y, r, blanco) {
    const cx = Math.round(x), cy = Math.round(y);
    if (cx - r < 0 || cy - r < 0 || cx + r >= w || cy + r >= h) return 0;
    const histo = new Uint16Array(256);
    const offs = disco(r);
    for (let k = 0; k < offs.length; k++) histo[gris[(cy + offs[k][1]) * w + cx + offs[k][0]]]++;
    // mediana como en numpy: promedio de los dos centrales si la cantidad es par
    const n = offs.length;
    const k1 = (n - 1) >> 1, k2 = n >> 1;
    let acum = 0, m1 = -1, m2 = -1;
    for (let v = 0; v < 256; v++) {
      acum += histo[v];
      if (m1 < 0 && acum > k1) m1 = v;
      if (acum > k2) {
        m2 = v;
        break;
      }
    }
    let med = (m1 + m2) / 2;
    // los umbrales se calibraron con papel en ~250: si esta zona de la hoja es más oscura
    // (sombra) o más clara (blanco saturado), el gris se lleva a esa referencia
    if (blanco && Math.abs(blanco - PAPEL_REFERENCIA) > 4) med = Math.min(255, (med * PAPEL_REFERENCIA) / blanco);
    return 255 - med;
  }

  // gris del papel en las hojas con que se calibraron los umbrales
  const PAPEL_REFERENCIA = 250;

  // Nivel del papel (blanco) por zonas, para compensar sombras o escaneos oscuros: en cada
  // casilla de 64 px, el gris más frecuente (la moda), que es el del papel y no se sesga
  // con el ruido del escáner. Con un escaneo normal queda en ~250 y no cambia nada.
  function mapaDeBlanco(gris, w, h) {
    const T = 64;
    const tw = Math.ceil(w / T), th = Math.ceil(h / T);
    const mapa = new Float32Array(tw * th);
    const histo = new Uint32Array(256);
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        histo.fill(0);
        let n = 0;
        const y1 = Math.min(h, (ty + 1) * T), x1 = Math.min(w, (tx + 1) * T);
        for (let y = ty * T; y < y1; y += 2) {
          const f = y * w;
          for (let x = tx * T; x < x1; x += 2) {
            histo[gris[f + x]]++;
            n++;
          }
        }
        // moda del histograma suavizado (ventana de ±3 niveles de gris)
        let mejor = -1, moda = 255, ventana = 0;
        for (let v = 0; v <= 3; v++) ventana += histo[v];
        for (let v = 0; v < 256; v++) {
          if (ventana > mejor || (ventana === mejor && v > moda)) {
            mejor = ventana;
            moda = v;
          }
          if (v + 4 < 256) ventana += histo[v + 4];
          if (v - 3 >= 0) ventana -= histo[v - 3];
        }
        mapa[ty * tw + tx] = n ? moda : 0;
      }
    }
    // el blanco global (mediana de las casillas) reemplaza a las casillas dominadas por tinta
    const global = mediana(mapa);
    for (let i = 0; i < mapa.length; i++) if (mapa[i] < Math.max(90, global * 0.6)) mapa[i] = global;
    return {
      global,
      en(x, y) {
        const fx = Math.min(tw - 1, Math.max(0, x / T - 0.5)), fy = Math.min(th - 1, Math.max(0, y / T - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const x1 = Math.min(tw - 1, x0 + 1), y1 = Math.min(th - 1, y0 + 1);
        const ax = fx - x0, ay = fy - y0;
        return (
          (mapa[y0 * tw + x0] * (1 - ax) + mapa[y0 * tw + x1] * ax) * (1 - ay) + (mapa[y1 * tw + x0] * (1 - ax) + mapa[y1 * tw + x1] * ax) * ay
        );
      },
    };
  }

  // d = oscuridad de cada alternativa -> { estado: "ok"|"blanco"|"doble"|"tenue", indices }
  function decidir(d, config) {
    const cfg = config || CONFIG_LECTOR;
    const marcadas = [];
    let max = 0;
    for (let i = 0; i < d.length; i++) {
      if (d[i] >= cfg.umbralMarca) marcadas.push(i);
      if (d[i] > max) max = d[i];
    }
    if (marcadas.length === 1) return { estado: "ok", indices: marcadas };
    if (marcadas.length > 1) {
      const orden = marcadas.slice().sort((a, b) => d[b] - d[a]);
      // una marca domina: la otra es un borrado parcial
      if (d[orden[0]] >= cfg.dominancia * d[orden[1]]) return { estado: "ok", indices: [orden[0]] };
      return { estado: "doble", indices: marcadas };
    }
    return { estado: max >= cfg.umbralTenue ? "tenue" : "blanco", indices: [] };
  }

  // ---------------------------------------------------------------- lectura de una hoja

  // gris: Uint8Array de w x h (0 = negro, 255 = blanco). pl: plantilla ya preparada.
  // Devuelve la lectura; si la hoja no se pudo alinear, { legible: false, problemas }.
  function leerHoja(gris, w, h, pl, config) {
    const cfg = Object.assign({}, CONFIG_LECTOR, config || {});
    const res = { legible: false, problemas: [], respuestas: [], idColumnas: [], id: "", key: "", pares: 0, total: pl.n };
    // la página puede venir a otra resolución: el radio de las burbujas se estima con el ancho
    const escalaPagina = Math.min(w, h) / Math.min(pl.ancho, pl.alto);
    const r0 = pl.radio * escalaPagina;
    const C = detectarCirculos(gris, w, h, {
      rMin: Math.max(4, Math.round(r0 * 0.8)),
      rMax: Math.round(r0 * 1.2),
      minDist: r0 * 1.75,
      umbralBorde: cfg.umbralBorde,
      umbralVotos: cfg.umbralVotos,
      nEsperado: pl.n,
    });
    res.circulos = C.length;
    if (C.length < cfg.minPares) {
      res.problemas.push({ tipo: "ilegible", detalle: `Solo se detectaron ${C.length} burbujas: la hoja está incompleta, muy torcida o mal escaneada.` });
      return res;
    }
    const indice = indexar(C, 24);
    const azar = azarConSemilla(12345);
    // puntos de partida: la página tal cual (escaneo normal) y la estimación global
    const partidas = [{ M: [escalaPagina, 0, 0, 0, escalaPagina, 0], votos: 0 }].concat(candidatosIniciales(pl, C).slice(0, 4));
    let mejor = null;
    for (const p of partidas) {
      const r = afinarConIcp(pl, C, indice, p.M, azar);
      if (!mejor || r.pares > mejor.pares) mejor = r;
      if (r.pares > pl.n * 0.93) break; // ya calza casi todo: no hace falta probar más
    }
    res.pares = mejor.pares;
    const M = mejor.M;
    const escala = escalaDe(M);
    res.M = M;
    res.escala = escala;
    res.giro = (Math.atan2(M[3], M[0]) * 180) / Math.PI;
    if (mejor.pares < cfg.minPares) {
      res.problemas.push({ tipo: "ilegible", detalle: `Alineación dudosa: solo calzaron ${mejor.pares} de ${pl.n} burbujas.` });
      return res;
    }
    const px = new Float64Array(pl.n), py = new Float64Array(pl.n);
    for (let i = 0; i < pl.n; i++) {
      px[i] = M[0] * pl.X[i] + M[1] * pl.Y[i] + M[2];
      py[i] = M[3] * pl.X[i] + M[4] * pl.Y[i] + M[5];
    }
    res.deltas = refinarPorGrupo(pl, C, indice, px, py, escala);
    let bloquesMalos = 0, idMalo = false;
    res.deltas.forEach((d) => {
      if (d.emparejadas >= d.total * cfg.minParesBloque) return;
      if (d.grupo === "id") idMalo = true;
      else if (d.grupo !== "key") bloquesMalos++;
    });
    if (bloquesMalos) {
      // faltan bloques de preguntas (hoja cortada o tapada): no se inventan respuestas
      res.problemas.push({ tipo: "ilegible", detalle: `${bloquesMalos === 1 ? "Falta o no calza un bloque" : `Faltan o no calzan ${bloquesMalos} bloques`} de preguntas: la hoja está cortada, tapada o muy deformada.` });
      return res;
    }
    if (idMalo) res.problemas.push({ tipo: "bloque", detalle: "La cuadrícula del RUT no calzó bien: revisa a quién corresponde la hoja." });
    const blanco = mapaDeBlanco(gris, w, h);
    res.blanco = blanco.global;
    const r = Math.max(3, Math.round(cfg.radioMedicion * escala));
    const porPregunta = new Map(), porId = new Map(), porKey = [];
    for (let i = 0; i < pl.n; i++) {
      const v = oscuridad(gris, w, h, px[i], py[i], r, blanco.en(px[i], py[i]));
      const e = pl.etiquetas[i];
      if (e.t === "q") {
        if (!porPregunta.has(e.a)) porPregunta.set(e.a, new Array(pl.nAlternativas).fill(0));
        porPregunta.get(e.a)[e.b] = v;
      } else if (e.t === "id") {
        if (!porId.has(e.a)) porId.set(e.a, new Array(10).fill(0));
        porId.get(e.a)[e.b] = v;
      } else {
        porKey[e.a] = v;
      }
    }
    for (let q = 1; q <= pl.nPreguntas; q++) {
      const d = porPregunta.get(q) || [];
      const dec = decidir(d, cfg);
      res.respuestas.push({
        n: q,
        estado: dec.estado,
        letras: dec.indices.map((k) => LETRAS[k]).join(""),
        osc: d.map((v) => Math.round(v * 10) / 10),
      });
    }
    // ID: una columna con dos marcas queda ambigua ("?"), no se adivina
    for (let col = 0; col < pl.columnasId; col++) {
      if (idMalo) {
        res.idColumnas.push("?");
        continue;
      }
      const dec = decidir(porId.get(col) || [], cfg);
      res.idColumnas.push(dec.estado === "ok" ? String(dec.indices[0]) : dec.estado === "doble" ? "?" : dec.estado === "tenue" ? "~" : "");
    }
    res.id = textoDelId(res.idColumnas);
    if (porKey.length) {
      const dec = decidir(porKey, cfg);
      res.key = dec.estado === "ok" ? LETRAS[dec.indices[0]] : "";
    }
    res.legible = true;
    res.px = px;
    res.py = py;
    return res;
  }

  // Texto del ID a partir de sus columnas: dígitos, "?" donde la columna quedó ambigua o hay
  // un hueco entre dígitos. Las columnas vacías del final se descartan.
  function textoDelId(columnas) {
    let fin = columnas.length;
    while (fin > 0 && columnas[fin - 1] === "") fin--;
    return columnas
      .slice(0, fin)
      .map((c) => (c === "" || c === "~" ? "?" : c))
      .join("");
  }

  // Página enderezada: la imagen llevada a las coordenadas de la plantilla (al derecho, sin
  // giro), a una fracción del tamaño. Sirve para guardar la hoja y recortar el nombre.
  // zona = [x0, y0, x1, y1] en coordenadas de la plantilla.
  function enderezar(gris, w, h, M, zona, factor) {
    const [x0, y0, x1, y1] = zona;
    const ow = Math.max(1, Math.round((x1 - x0) * factor)), oh = Math.max(1, Math.round((y1 - y0) * factor));
    const out = new Uint8Array(ow * oh);
    for (let oy = 0; oy < oh; oy++) {
      const ty = y0 + (oy + 0.5) / factor;
      for (let ox = 0; ox < ow; ox++) {
        const tx = x0 + (ox + 0.5) / factor;
        const sx = M[0] * tx + M[1] * ty + M[2], sy = M[3] * tx + M[4] * ty + M[5];
        const ix = Math.floor(sx), iy = Math.floor(sy);
        if (ix < 0 || iy < 0 || ix >= w - 1 || iy >= h - 1) {
          out[oy * ow + ox] = 255;
          continue;
        }
        const ax = sx - ix, ay = sy - iy;
        const i = iy * w + ix;
        out[oy * ow + ox] = (gris[i] * (1 - ax) + gris[i + 1] * ax) * (1 - ay) + (gris[i + w] * (1 - ax) + gris[i + w + 1] * ax) * ay + 0.5;
      }
    }
    return { datos: out, ancho: ow, alto: oh };
  }

  // Lectura compacta, para guardar: una letra por pregunta ("-" en blanco, "*" doble marca,
  // "~" tenue), las letras de cada doble marca, la oscuridad de cada burbuja (0-255) y los
  // datos de la alineación (para dibujar lo leído sobre la imagen enderezada de la hoja).
  function compactarLectura(r) {
    const n = r.respuestas.length;
    const dobles = {};
    const osc = new Uint8Array(n * 5);
    let resp = "";
    r.respuestas.forEach((a, i) => {
      resp += a.estado === "ok" ? a.letras : a.estado === "doble" ? "*" : a.estado === "tenue" ? "~" : "-";
      if (a.estado === "doble") dobles[a.n] = a.letras;
      a.osc.forEach((v, k) => (osc[i * 5 + k] = Math.max(0, Math.min(255, Math.round(v)))));
    });
    // corrimiento de cada bloque, llevado a coordenadas de la plantilla
    let deltas = [];
    if (r.M && r.deltas) {
      const inv = invertirAfin(r.M);
      deltas = r.deltas.map((d) => [d.grupo, Math.round((inv[0] * d.dx + inv[1] * d.dy) * 10) / 10, Math.round((inv[3] * d.dx + inv[4] * d.dy) * 10) / 10]);
    }
    return {
      id: r.id || "",
      idColumnas: r.idColumnas || [],
      key: r.key || "",
      resp,
      dobles,
      osc,
      pares: r.pares || 0,
      total: r.total || 0,
      giro: r.giro == null ? null : Math.round(r.giro * 100) / 100,
      escala: r.escala == null ? null : Math.round(r.escala * 10000) / 10000,
      deltas,
      problemas: r.problemas || [],
    };
  }

  global.PaesLector = {
    compactarLectura,
    LETRAS,
    CONFIG_LECTOR,
    prepararPlantilla,
    detectarCirculos,
    candidatosIniciales,
    leerHoja,
    decidir,
    textoDelId,
    enderezar,
    invertirAfin,
    aplicar,
    escalaDe,
    azarConSemilla,
    mediana,
  };
})(typeof window !== "undefined" ? window : globalThis);
