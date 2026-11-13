// Ensayos PAES · informe del curso para el colegio, en PDF y en Word.
//
// El informe para el colegio cabe en una página (más, solo si la lista del curso es larga):
// resumen, cifras, distribución y resultados por estudiante. El análisis por pregunta y la
// desviación estándar quedan para el informe interno de Admisión (datos.interno = true),
// que todavía no tiene botón en la app.
//
// El PDF usa el mismo motor y el mismo estilo de los informes de Kuder (js/report.js:
// páginas carta de 794 px que se capturan como imagen). El Word se arma como .docx con
// las mismas secciones, para que el orientador pueda editarlo.
// Todo se genera en este computador: nada se envía a internet.

(function (global) {
  "use strict";
  const L = PaesLogica;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, dec) => (v == null ? "—" : Number(v).toLocaleString("es-CL", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }));
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  // ------------------------------------------------------------ contenido común

  // Todo lo que dicen el PDF y el Word, ya en texto: así los dos informes coinciden.
  function contenido(d) {
    const e = d.ensayo, c = d.curso, st = d.resultados.estadisticas;
    // sin fecha: el informe no la necesita (sigue en la app y en el nombre del archivo)
    const partes = [d.nombrePrueba + (e.forma ? " (Forma " + e.forma + ")" : ""), d.etiquetaCurso, c.colegio].filter(Boolean);
    const quien = (f) => {
      if (!f.estudianteId) return "Sin identificar (hoja pág. " + f.pagina + ")";
      return d.sinNombres ? L.formatearRutPaes(f.rut) || "Sin RUT" : f.nombre;
    };
    const resumen =
      `Rindieron el ensayo ${st.rindieron} de los ${plural(st.enLista, "estudiante", "estudiantes")} de la lista del curso` +
      (st.sinIdentificar ? ` (además hay ${plural(st.sinIdentificar, "hoja sin identificar", "hojas sin identificar")})` : "") +
      `. El puntaje promedio fue de ${num(st.promedio, 1)} puntos y la mediana, de ${num(st.mediana, st.mediana % 1 ? 1 : 0)}; ` +
      `el más alto fue ${num(st.maximo)} y el más bajo, ${num(st.minimo)}. ` +
      `En promedio, los estudiantes respondieron bien ${num(st.correctasPromedio, 1)} de las ${st.preguntasValidas} preguntas válidas (${num(st.logroPromedio, 1)} % de logro).` +
      (st.sinTabla ? ` ${st.sinTabla === 1 ? "Una hoja tiene" : st.sinTabla + " hojas tienen"} más correctas que el máximo de la tabla de conversión: no ${st.sinTabla === 1 ? "tiene" : "tienen"} puntaje y no ${st.sinTabla === 1 ? "entra" : "entran"} en el promedio de puntaje.` : "");
    const resumenCorto =
      `Rindieron el ensayo ${st.rindieron} de los ${plural(st.enLista, "estudiante", "estudiantes")} de la lista del curso` +
      (st.sinIdentificar ? ` (además hay ${plural(st.sinIdentificar, "hoja sin identificar", "hojas sin identificar")})` : "") +
      `. En promedio respondieron bien ${num(st.correctasPromedio, 1)} de las ${st.preguntasValidas} preguntas válidas (${num(st.logroPromedio, 1)} % de logro).` +
      (st.sinTabla ? ` ${st.sinTabla === 1 ? "Una hoja tiene" : st.sinTabla + " hojas tienen"} más correctas que el máximo de la tabla de conversión y no ${st.sinTabla === 1 ? "entra" : "entran"} en el promedio de puntaje.` : "");
    const extremos = L.preguntasExtremas(d.analisis, 5);
    const nota =
      `Ensayo de preparación tipo PAES elaborado por la Universidad de Magallanes; no es una prueba oficial. El puntaje (100 a 1000) se obtiene con la tabla de conversión de la unidad ` +
      `(de 0 a ${st.maximoTabla} correctas, versión ${e.tablaVersion || 1}) y es referencial: no equivale a un puntaje oficial PAES ni permite predecirlo. ` +
      `Se contaron ${plural(st.preguntasValidas, "pregunta válida", "preguntas válidas")} de ${st.preguntas}` +
      (st.preguntas - st.preguntasValidas ? ` (${plural(st.preguntas - st.preguntasValidas, "anulada o de pilotaje", "anuladas o de pilotaje")})` : "") +
      `; las dobles marcas cuentan como incorrectas y las preguntas sin marcar, como omitidas (clave versión ${e.claveVersion || 1}). ` +
      `El logro es el porcentaje de preguntas válidas respondidas correctamente, sin descuento por respuestas incorrectas.` +
      (d.interno ? ` La desviación estándar es poblacional: describe al grupo que rindió. Con grupos pequeños, un solo estudiante cambia varios puntos los porcentajes por pregunta.` : "");
    const notaCorta =
      `Ensayo de preparación tipo PAES elaborado por la Universidad de Magallanes; no es una prueba oficial. El puntaje (100 a 1000) se obtiene con la tabla de conversión de la unidad ` +
      `y es referencial: no equivale a un puntaje oficial PAES ni permite predecirlo. Se contaron ${plural(st.preguntasValidas, "pregunta válida", "preguntas válidas")} de ${st.preguntas}; ` +
      `las dobles marcas cuentan como incorrectas. El logro es el porcentaje de preguntas válidas respondidas correctamente.`;
    return {
      titulo: "Resultados del ensayo PAES",
      subtitulo: partes.join(" · "),
      resumen: d.interno ? resumen : resumenCorto,
      nota: d.interno ? nota : notaCorta,
      pendientes: d.pendientes ? `Este informe se generó con ${plural(d.pendientes, "hoja con advertencias sin revisar", "hojas con advertencias sin revisar")}: los resultados podrían cambiar.` : "",
      stats: [
        ["Rindieron", `${st.rindieron} de ${st.enLista}`],
        ["Promedio", num(st.promedio, 1)],
        ["Mediana", num(st.mediana, st.mediana % 1 ? 1 : 0)],
        ["Máximo", num(st.maximo)],
        ["Mínimo", num(st.minimo)],
        ["Logro promedio", num(st.logroPromedio, 1) + " %"],
      ].concat(d.interno ? [["Desv. estándar", num(st.desviacion, 1)]] : []),
      interno: !!d.interno,
      tramos: st.tramos,
      mejores: d.resultados.filas.filter((f) => f.puntaje != null && f.lugar <= 5).map((f) => ({ lugar: f.lugar, quien: quien(f), puntaje: f.puntaje, correctas: f.correctas })),
      colQuien: d.sinNombres ? "RUT" : "Estudiante",
      filas: d.resultados.filas.map((f) => ({
        lugar: f.lugar,
        quien: quien(f),
        rut: d.sinNombres ? "" : L.formatearRutPaes(f.rut),
        correctas: f.correctas,
        incorrectas: f.incorrectas,
        omitidas: f.omitidas,
        logro: num(f.logro) + " %",
        puntaje: f.sinTabla ? "sin tabla" : String(f.puntaje),
      })),
      noRindieron: d.resultados.noRindieron
        .slice()
        .sort((a, b) => (a.apellidos || "").localeCompare(b.apellidos || "", "es"))
        .map((s) => (d.sinNombres ? L.formatearRutPaes(s.rut) || "Sin RUT" : L.nombreCompletoPaes(s))),
      dificiles: extremos.dificiles,
      faciles: extremos.faciles,
      analisis: d.analisis,
      letras: L.LETRAS_PAES.slice(0, e.alternativas || 4).split(""),
      hojasContadas: st.hojas,
    };
  }

  // ------------------------------------------------------------ PDF

  const LIMITE_PX = typeof ALTO_PAGINA_PX !== "undefined" ? ALTO_PAGINA_PX - PADDING_INFERIOR_PX : 997;

  function htmlTabla(t, filas, continua) {
    return `<div class="pinf-bloque"><h3>${esc(t.titulo)}${continua ? " <small>(continuación)</small>" : ""}</h3>${t.intro && !continua ? `<p class="pinf-intro">${esc(t.intro)}</p>` : ""}
      <table class="pinf-tabla ${t.clase || ""}"><thead><tr>${t.columnas.map((c) => `<th class="${c.clase || ""}">${esc(c.titulo)}</th>`).join("")}</tr></thead>
      <tbody>${filas.map((f) => `<tr class="${f.clase || ""}">${f.celdas.map((v, i) => `<td class="${t.columnas[i].clase || ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function bloquesPdf(k) {
    const maxTramo = Math.max(1, ...k.tramos.map((t) => t.n));
    const bloques = [];
    const htmlResumen = `<p class="pinf-resumen">${esc(k.resumen)}</p>${k.pendientes ? `<p class="pinf-aviso">⚠ ${esc(k.pendientes)}</p>` : ""}`;
    const htmlStats = (columnas) => `<div class="pinf-stats" style="grid-template-columns:repeat(${columnas}, 1fr)">${k.stats.map(([a, b]) => `<div class="pinf-stat"><b>${esc(b)}</b><span>${esc(a)}</span></div>`).join("")}</div>`;
    if (k.interno) {
      bloques.push({ html: `<div class="pinf-bloque">${htmlResumen}${htmlStats(k.stats.length)}</div>` });
      bloques.push({ html: `<div class="pinf-bloque pinf-dos">
        <div><h3>Distribución de puntajes</h3>${k.tramos.map((t) => `<div class="pinf-tramo"><span>${t.desde}–${t.hasta}</span><div class="pinf-barra"><div style="width:${(t.n / maxTramo) * 100}%"></div></div><b>${t.n}</b></div>`).join("")}</div>
        <div><h3>Los cinco mejores puntajes</h3>${k.mejores.length ? `<table class="pinf-tabla"><tbody>${k.mejores.map((m) => `<tr><td class="num">${m.lugar}.°</td><td>${esc(m.quien)}</td><td class="num"><b>${m.puntaje}</b></td></tr>`).join("")}</tbody></table>` : `<p class="pinf-intro">Sin puntajes.</p>`}</div></div>` });
    } else {
      // para el colegio: cifras y distribución lado a lado; los mejores puntajes son las primeras filas de la tabla
      bloques.push({ html: `<div class="pinf-bloque">${htmlResumen}<div class="pinf-dos pinf-arriba">
        <div><h3>Cifras del curso</h3>${htmlStats(3)}</div>
        <div><h3>Distribución de puntajes <small>· estudiantes por tramo</small></h3>
        <div class="pinf-histo">${k.tramos.map((t) => `<div class="pinf-col"><b>${t.n || ""}</b><div class="pinf-colbarra"><div style="height:${(t.n / maxTramo) * 100}%"></div></div><span>${t.desde}</span></div>`).join("")}</div>
        <p class="pinf-eje">Cada columna es un tramo de 100 puntos (100 a 199, 200 a 299… 900 a 1000).</p></div></div></div>` });
    }
    const cols = [{ titulo: "Lugar", clase: "num" }, { titulo: k.colQuien }];
    if (k.colQuien === "Estudiante") cols.push({ titulo: "RUT", clase: "rut" });
    cols.push({ titulo: "Correctas", clase: "num" }, { titulo: "Incorrectas", clase: "num" }, { titulo: "Omitidas", clase: "num" }, { titulo: "Logro", clase: "num" }, { titulo: "Puntaje", clase: "num fuerte" });
    bloques.push({
      tabla: {
        titulo: "Resultados del curso, de mayor a menor puntaje",
        columnas: cols,
        filas: k.filas.map((f) => ({ celdas: [f.lugar, f.quien].concat(k.colQuien === "Estudiante" ? [f.rut] : [], [f.correctas, f.incorrectas, f.omitidas, f.logro, f.puntaje]) })),
      },
    });
    if (k.noRindieron.length) bloques.push({ html: `<div class="pinf-bloque"><h3>No rindieron (${k.noRindieron.length}) <small>· están en la lista del curso, pero no tienen hoja en este ensayo</small></h3><p class="pinf-lista">${k.noRindieron.map(esc).join(" · ")}</p></div>` });
    if (k.interno && k.analisis.some((a) => a.clave)) {
      const lista = (ps) => ps.map((a) => `${a.n} (${num(a.pctAciertos)} %)`).join(", ");
      const dif = new Set(k.dificiles.map((a) => a.n)), fac = new Set(k.faciles.map((a) => a.n));
      bloques.push({
        tabla: {
          titulo: "Análisis por pregunta",
          intro: `Porcentajes sobre ${plural(k.hojasContadas, "hoja", "hojas")}. Más difíciles: ${lista(k.dificiles) || "—"}. Más fáciles: ${lista(k.faciles) || "—"}.`,
          clase: "compacta",
          columnas: [{ titulo: "Pregunta", clase: "num" }, { titulo: "Clave", clase: "num" }, { titulo: "% aciertos", clase: "num" }, { titulo: "% omisión", clase: "num" }].concat(k.letras.map((l) => ({ titulo: l, clase: "num" })), [{ titulo: "Más marcada", clase: "num" }]),
          filas: k.analisis.map((a) => ({
            clase: !a.valida ? "novalida" : dif.has(a.n) ? "dificil" : fac.has(a.n) ? "facil" : "",
            celdas: [a.n, (a.clave || "—") + (a.valida ? "" : " (no válida)"), a.clave ? num(a.pctAciertos) + " %" : "—", num(a.pctOmision) + " %"].concat(k.letras.map((l) => a.cuenta[l]), [a.masMarcada || "—"]),
          })),
        },
      });
    }
    bloques.push({ html: `<div class="informe-footer pinf-pie"><p><b>Nota metodológica.</b> ${esc(k.nota)}</p><p class="informe-contacto">Unidad de Admisión y Marketing · Ignacio Carrera Pinto 1015, Punta Arenas · Universidad de Magallanes</p></div>` });
    return bloques;
  }

  // reparte los bloques en páginas carta midiendo cada página real; las tablas se cortan entre filas
  // El informe para el colegio prueba primero el tamaño normal y, si no cabe en una página,
  // dos tamaños más apretados; si aun así no cabe (lista larga), usa las páginas que hagan falta.
  function paginar(k) {
    if (k.interno) return paginarCon(k, "");
    let primera = null;
    for (const densidad of ["", "densa", "muy-densa"]) {
      const paginas = paginarCon(k, densidad);
      if (paginas.length === 1) return paginas;
      if (!primera) primera = paginas;
    }
    return primera;
  }

  function paginarCon(k, densidad) {
    const cuerpo = (piezas) => `<div class="pinf-cuerpo ${densidad}">${piezas.join("")}</div>`;
    const cabecera = (i) =>
      i === 0
        ? construirBanner(k.titulo, k.subtitulo)
        : `<div class="pinf-continua"><b>${esc(k.titulo)}</b> · ${esc(k.subtitulo)}</div>`;
    const paginas = [];
    let actual = [];
    const alto = (piezas) => medirAlturaFragmento(cabecera(paginas.length) + cuerpo(piezas));
    const cerrar = () => {
      paginas.push(actual);
      actual = [];
    };
    bloquesPdf(k).forEach((b) => {
      if (b.html) {
        if (actual.length && alto(actual.concat(b.html)) > LIMITE_PX) cerrar();
        actual.push(b.html);
        return;
      }
      let resto = b.tabla.filas.slice(), continua = false;
      while (resto.length) {
        // cuántas filas caben en lo que queda de la página (búsqueda binaria)
        let lo = 0, hi = resto.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (alto(actual.concat(htmlTabla(b.tabla, resto.slice(0, mid), continua))) <= LIMITE_PX) lo = mid;
          else hi = mid - 1;
        }
        if (lo < Math.min(4, resto.length) && actual.length) {
          cerrar();
          continue;
        }
        const n = Math.max(lo, 1);
        actual.push(htmlTabla(b.tabla, resto.slice(0, n), continua));
        resto = resto.slice(n);
        continua = true;
        if (resto.length) cerrar();
      }
    });
    if (actual.length) cerrar();
    return paginas.map((piezas, i) => {
      const nodo = document.createElement("div");
      nodo.className = "informe-page pinf";
      nodo.innerHTML = cabecera(i) + cuerpo(piezas) + (paginas.length > 1 ? `<div class="pinf-numero">Página ${i + 1} de ${paginas.length}</div>` : "");
      return nodo;
    });
  }

  async function pdf(datos) {
    return paginasAPdfBlob(paginar(contenido(datos)));
  }

  // ------------------------------------------------------------ Word (.docx)

  const X = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const MORADO = "5B3B8C";

  function parrafo(texto, o) {
    o = o || {};
    const rpr = `<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${o.negrita ? "<w:b/>" : ""}${o.cursiva ? "<w:i/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}<w:sz w:val="${(o.tam || 11) * 2}"/></w:rPr>`;
    const ppr = `<w:pPr>${o.titulo ? "<w:keepNext/>" : ""}<w:spacing w:before="${o.antes || 0}" w:after="${o.despues == null ? 120 : o.despues}"/>${o.centro ? '<w:jc w:val="center"/>' : o.derecha ? '<w:jc w:val="right"/>' : ""}</w:pPr>`;
    return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${X(texto)}</w:t></w:r></w:p>`;
  }

  // filas: matriz de textos; la primera es el encabezado. anchos en twips (suman ~9360).
  function tabla(filas, anchos, o) {
    o = o || {};
    const borde = '<w:top w:val="single" w:sz="4" w:color="D0C7E3"/><w:left w:val="single" w:sz="4" w:color="D0C7E3"/><w:bottom w:val="single" w:sz="4" w:color="D0C7E3"/><w:right w:val="single" w:sz="4" w:color="D0C7E3"/><w:insideH w:val="single" w:sz="4" w:color="D0C7E3"/><w:insideV w:val="single" w:sz="4" w:color="D0C7E3"/>';
    const total = anchos.reduce((a, b) => a + b, 0);
    let x = `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${borde}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${a}"/>`).join("")}</w:tblGrid>`;
    filas.forEach((f, i) => {
      const enc = i === 0 && !o.sinEncabezado;
      x += `<w:tr>${enc ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${f
        .map((v, j) => {
          const texto = parrafo(v, { negrita: enc || (o.negritas || []).includes(j), color: enc ? "FFFFFF" : null, tam: o.tam || 9.5, despues: 0, centro: (o.centradas || []).includes(j) });
          return `<w:tc><w:tcPr><w:tcW w:w="${anchos[j]}" w:type="dxa"/>${enc ? `<w:shd w:val="clear" w:color="auto" w:fill="${MORADO}"/>` : i % 2 === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F5F2FB"/>' : ""}</w:tcPr>${texto}</w:tc>`;
        })
        .join("")}</w:tr>`;
    });
    return x + "</w:tbl>" + parrafo("", { despues: 60, tam: 4 });
  }

  function imagenDocx(anchoEmu, altoEmu) {
    return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${anchoEmu}" cy="${altoEmu}"/><wp:docPr id="1" name="Logo UMAG" descr="Universidad de Magallanes"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${anchoEmu}" cy="${altoEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  // logo de la UMAG en color (viene dentro de la app, js/logo.js): bytes y proporción
  function logoPng() {
    return new Promise((ok) => {
      if (typeof LOGO_UMAG_2027_COLOR === "undefined") return ok(null);
      const img = new Image();
      img.onload = () => {
        try {
          const bin = atob(LOGO_UMAG_2027_COLOR.split(",")[1]);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          ok({ bytes, razon: img.naturalHeight / img.naturalWidth });
        } catch (e) {
          ok(null);
        }
      };
      img.onerror = () => ok(null);
      img.src = LOGO_UMAG_2027_COLOR;
    });
  }

  async function word(datos) {
    const k = contenido(datos);
    const logo = await logoPng();
    let c = "";
    if (logo) c += imagenDocx(1700000, Math.round(1700000 * logo.razon));
    c += parrafo("Unidad de Admisión y Marketing · Universidad de Magallanes", { tam: 9, color: "6A6178", despues: 60 });
    c += parrafo(k.titulo, { negrita: true, tam: 20, color: MORADO, despues: 40 });
    c += parrafo(k.subtitulo, { negrita: true, tam: 12, despues: 200 });
    c += parrafo("Resumen", { negrita: true, tam: 13, color: MORADO, titulo: true, antes: 120 });
    c += parrafo(k.resumen);
    if (k.pendientes) c += parrafo("⚠ " + k.pendientes, { cursiva: true, color: "8A5A00" });
    c += tabla([k.stats.map((s) => s[0]), k.stats.map((s) => s[1])], k.stats.map(() => Math.floor(9360 / k.stats.length)), { centradas: k.stats.map((_, i) => i), negritas: k.stats.map((_, i) => i), tam: 9 });
    c += parrafo("Resultados del curso, de mayor a menor puntaje", { negrita: true, tam: 13, color: MORADO, titulo: true, antes: 200 });
    const conRut = k.colQuien === "Estudiante";
    c += tabla(
      [["Lugar", k.colQuien].concat(conRut ? ["RUT"] : [], ["Correctas", "Incorrectas", "Omitidas", "Logro", "Puntaje"])].concat(k.filas.map((f) => [f.lugar, f.quien].concat(conRut ? [f.rut] : [], [f.correctas, f.incorrectas, f.omitidas, f.logro, f.puntaje]))),
      conRut ? [620, 2900, 1340, 900, 980, 880, 820, 920] : [700, 3400, 1000, 1100, 1000, 1000, 1160],
      { centradas: conRut ? [0, 3, 4, 5, 6, 7] : [0, 2, 3, 4, 5, 6], negritas: [conRut ? 7 : 6] }
    );
    c += parrafo("Distribución de puntajes", { negrita: true, tam: 13, color: MORADO, titulo: true, antes: 200 });
    c += tabla([["Tramo de puntaje", "Estudiantes"]].concat(k.tramos.map((t) => [`${t.desde} a ${t.hasta}`, t.n])), [3000, 1800], { centradas: [1] });
    if (k.interno && k.mejores.length) {
      c += parrafo("Los cinco mejores puntajes", { negrita: true, tam: 13, color: MORADO, titulo: true, antes: 200 });
      c += tabla([["Lugar", k.colQuien, "Correctas", "Puntaje"]].concat(k.mejores.map((m) => [m.lugar, m.quien, m.correctas, m.puntaje])), [800, 4400, 1300, 1300], { centradas: [0, 2, 3], negritas: [3] });
    }
    if (k.noRindieron.length) {
      c += parrafo(`No rindieron (${k.noRindieron.length})`, { negrita: true, tam: 13, color: MORADO, titulo: true, antes: 200 });
      c += parrafo("Están en la lista del curso, pero no tienen hoja en este ensayo: " + k.noRindieron.join(" · ") + ".");
    }
    if (k.interno && k.analisis.some((a) => a.clave)) {
      const lista = (ps) => ps.map((a) => `${a.n} (${num(a.pctAciertos)} %)`).join(", ");
      c += parrafo("Análisis por pregunta", { negrita: true, tam: 13, color: MORADO, titulo: true, antes: 200 });
      c += parrafo(`Porcentajes sobre ${plural(k.hojasContadas, "hoja", "hojas")}. Más difíciles: ${lista(k.dificiles) || "—"}. Más fáciles: ${lista(k.faciles) || "—"}.`);
      const nL = k.letras.length;
      const anchoL = 560;
      c += tabla(
        [["Pregunta", "Clave", "% aciertos", "% omisión"].concat(k.letras, ["Más marcada"])].concat(k.analisis.map((a) => [a.n, (a.clave || "—") + (a.valida ? "" : " (no válida)"), a.clave ? num(a.pctAciertos) + " %" : "—", num(a.pctOmision) + " %"].concat(k.letras.map((l) => a.cuenta[l]), [a.masMarcada || "—"]))),
        [1100, 1300, 1400, 1400].concat(k.letras.map(() => anchoL), [1500]),
        { centradas: Array.from({ length: 5 + nL }, (_, i) => i), tam: 9 }
      );
    }
    c += parrafo("Nota metodológica", { negrita: true, tam: 13, color: MORADO, titulo: true, antes: 200 });
    c += parrafo(k.nota, { tam: 10 });
    c += parrafo("Unidad de Admisión y Marketing · Ignacio Carrera Pinto 1015, Punta Arenas · Universidad de Magallanes", { tam: 9, color: "6A6178", centro: true, antes: 200 });

    const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${c}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1440" w:bottom="1134" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const zip = new JSZip();
    const original = zip.file.bind(zip);
    zip.file = (nombre, dato) => original(nombre, dato, { createFolders: false }); // sin entradas de carpeta: Word las prefiere así
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file("word/document.xml", documento);
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${logo ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>' : ""}</Relationships>`);
    if (logo) zip.file("word/media/logo.png", logo.bytes);
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
  }

  global.PaesInforme = { contenido, paginar, pdf, word };
})(window);
