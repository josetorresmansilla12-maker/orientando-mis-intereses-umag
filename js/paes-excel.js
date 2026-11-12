// Ensayos PAES · Excel de resultados de un ensayo, con colores (verde y rojo en las
// respuestas). Se arma a mano el archivo .xlsx (un ZIP con XML, usando JSZip) porque la
// librería de Excel que trae la app no escribe colores.

(function (global) {
  "use strict";
  const L = PaesLogica;

  // estilos de celda disponibles (el número es su posición en cellXfs de styles.xml)
  const ESTILO = { normal: 0, encabezado: 1, negrita: 2, verde: 3, rojo: 4, amarillo: 5, gris: 6, centro: 7, azul: 8, naranja: 9, titulo: 10, texto: 11, decimal: 12, nota: 13 };

  const XML_ESTILOS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>' +
    '<fonts count="5">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="14"/><color rgb="FF402A63"/><name val="Calibri"/></font>' +
    '<font><i/><sz val="10"/><color rgb="FF6A6178"/><name val="Calibri"/></font>' +
    "</fonts>" +
    '<fills count="9">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    ["FF5B3B8C", "FFC6EFCE", "FFFFC7CE", "FFFFEB9C", "FFEDEDED", "FFDDEBF7", "FFFCE4D6"].map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="${c}"/><bgColor indexed="64"/></patternFill></fill>`).join("") +
    "</fills>" +
    '<borders count="2">' +
    "<border><left/><right/><top/><bottom/><diagonal/></border>" +
    '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>' +
    "</borders>" +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="14">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    [3, 4, 5, 6].map((f) => `<xf numFmtId="0" fontId="0" fillId="${f}" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`).join("") +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    [7, 8].map((f) => `<xf numFmtId="0" fontId="0" fillId="${f}" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`).join("") +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" wrapText="1"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>";

  function escXml(s) {
    return String(s)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function letraColumna(i) {
    let s = "";
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  // hoja: { nombre, anchos: [..], congelar: nº de filas fijas, filas: [[celda]] }
  // celda: valor (texto o número) o { v, s: nombre del estilo }
  function xmlHoja(hoja) {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    if (hoja.congelar) {
      xml += `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${hoja.congelar}" topLeftCell="A${hoja.congelar + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
    }
    if (hoja.anchos && hoja.anchos.length) {
      xml += "<cols>" + hoja.anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join("") + "</cols>";
    }
    xml += "<sheetData>";
    hoja.filas.forEach((fila, r) => {
      xml += `<row r="${r + 1}">`;
      fila.forEach((celda, c) => {
        if (celda == null || celda === "") return;
        const obj = typeof celda === "object" ? celda : { v: celda };
        if (obj.v == null || obj.v === "") {
          if (obj.s) xml += `<c r="${letraColumna(c)}${r + 1}" s="${ESTILO[obj.s] || 0}"/>`;
          return;
        }
        const ref = `${letraColumna(c)}${r + 1}`;
        const s = obj.s ? ` s="${ESTILO[obj.s] || 0}"` : "";
        if (typeof obj.v === "number" && isFinite(obj.v)) xml += `<c r="${ref}"${s}><v>${obj.v}</v></c>`;
        else xml += `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escXml(obj.v)}</t></is></c>`;
      });
      xml += "</row>";
    });
    return xml + "</sheetData></worksheet>";
  }

  // arma el .xlsx y devuelve un Blob
  function crearXlsx(hojas) {
    const zip = new JSZip();
    const nombres = hojas.map((h) => h.nombre.replace(/[\[\]:*?/\\]/g, " ").slice(0, 31));
    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map((h, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        "</Types>"
    );
    zip.file(
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    );
    zip.file(
      "xl/workbook.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        nombres.map((n, i) => `<sheet name="${escXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        "</sheets></workbook>"
    );
    zip.file(
      "xl/_rels/workbook.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    );
    zip.file("xl/styles.xml", XML_ESTILOS);
    hojas.forEach((h, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, xmlHoja(h)));
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE" });
  }

  function fechaCorta(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  }

  // Excel de un ensayo: Resultados, Respuestas (verde y rojo), Análisis por pregunta y Por revisar.
  //   datos: { ensayo, curso, hojas, nombrePrueba, etiquetaCurso, advertencias: Map hojaId -> [{detalle}] }
  function excelDeEnsayo(datos) {
    const { ensayo, curso, hojas } = datos;
    const res = L.resultadosEnsayo(ensayo, hojas, curso.estudiantes);
    const st = res.estadisticas;
    const E = (v, s) => ({ v, s });
    const porHoja = new Map(hojas.map((h) => [h.id, h]));
    const cabecera = [
      [E(`Resultados del ensayo PAES · ${datos.nombrePrueba}`, "titulo")],
      [E(`${curso.colegio} · ${datos.etiquetaCurso}${ensayo.forma ? " · Forma " + ensayo.forma : ""}${ensayo.fecha ? " · " + fechaCorta(ensayo.fecha) : ""}`, "negrita")],
      [E(`Ensayo de preparación tipo PAES. Puntaje referencial, no oficial, según la tabla de conversión de la unidad (tabla de 0 a ${st.maximoTabla} correctas, versión ${ensayo.tablaVersion || 1}). ${st.preguntasValidas} preguntas válidas de ${st.preguntas} (clave versión ${ensayo.claveVersion || 1}).`, "nota")],
      [],
    ];

    // --- Resultados
    const filasRes = cabecera.slice();
    filasRes.push(["Lugar", "Nombres", "Apellidos", "RUT", "Correctas", "Incorrectas", "Omitidas", "% de logro", "Puntaje", "Observación"].map((t) => E(t, "encabezado")));
    const filaEncabezado = filasRes.length;
    res.filas.forEach((f) => {
      const obs = [];
      if (!f.estudianteId) obs.push(`Sin identificar (${f.archivo}, pág. ${f.pagina})`);
      if (f.sinTabla) obs.push("Sin tabla: más correctas que el máximo de la tabla");
      if (f.dobles) obs.push(`${f.dobles} doble${f.dobles === 1 ? "" : "s"} marca${f.dobles === 1 ? "" : "s"}`);
      const sinId = !f.estudianteId;
      filasRes.push([
        E(f.lugar, "centro"),
        E(f.nombres || "(sin identificar)", sinId ? "amarillo" : "texto"),
        E(f.apellidos, "texto"),
        E(L.formatearRutPaes(f.rut), "centro"),
        E(f.correctas, "centro"),
        E(f.incorrectas, "centro"),
        E(f.omitidas, "centro"),
        E(Math.round(f.logro * 10) / 10, "decimal"),
        f.sinTabla ? E("sin tabla", "amarillo") : E(f.puntaje, "centro"),
        E(obs.join(" · "), "texto"),
      ]);
    });
    filasRes.push([]);
    filasRes.push([E("Estadísticas del curso", "negrita")]);
    [
      ["Rindieron", `${st.rindieron} de ${st.enLista} de la lista${st.sinIdentificar ? ` (más ${st.sinIdentificar} hoja${st.sinIdentificar === 1 ? "" : "s"} sin identificar)` : ""}`],
      ["Promedio", st.promedio],
      ["Mediana", st.mediana],
      ["Máximo", st.maximo],
      ["Mínimo", st.minimo],
      ["Desviación estándar (poblacional)", st.desviacion],
      ["% de logro promedio", st.logroPromedio],
      ["Correctas promedio", st.correctasPromedio],
    ].forEach(([k, v]) => filasRes.push([k, null, null, null, E(v == null ? "—" : v, "centro")]));
    filasRes.push([]);
    filasRes.push([E("Distribución de puntajes", "negrita")]);
    st.tramos.forEach((t) => filasRes.push([`${t.desde} a ${t.hasta} puntos`, null, null, null, E(t.n, "centro")]));
    if (res.noRindieron.length) {
      filasRes.push([]);
      filasRes.push([E(`No rindieron (${res.noRindieron.length})`, "negrita")]);
      res.noRindieron.forEach((e) => filasRes.push([null, E(e.nombres, "texto"), E(e.apellidos, "texto"), E(L.formatearRutPaes(e.rut), "centro")]));
    }

    // --- Respuestas
    const clave = ensayo.clave || [];
    const filasResp = [
      [E("Estudiante", "encabezado"), E("RUT", "encabezado")].concat(clave.map((k) => E(k.n, "encabezado")), [E("Correctas", "encabezado")]),
      [E("Clave", "negrita"), null].concat(clave.map((k) => E(k.r, k.valida ? "azul" : "gris"))),
    ];
    res.filas.forEach((f) => {
      const c = L.corregirHoja(porHoja.get(f.hojaId), clave);
      filasResp.push(
        [E(f.nombre || `(sin identificar, pág. ${f.pagina})`, "texto"), E(L.formatearRutPaes(f.rut), "centro")].concat(
          c.detalle.map((d) => {
            if (d.resultado === "no-valida") return E(d.marcada, "gris");
            if (d.resultado === "correcta") return E(d.marcada, "verde");
            if (d.resultado === "doble") return E(d.marcada || "**", "naranja");
            if (d.resultado === "omitida") return E("", "centro");
            return E(d.marcada, "rojo");
          }),
          [E(c.correctas, "centro")]
        )
      );
    });
    filasResp.push([]);
    filasResp.push([E("Verde: correcta · Rojo: incorrecta · Naranja: doble marca (cuenta como incorrecta) · En blanco: omitida · Gris: pregunta no válida (no cuenta)", "nota")]);

    // --- Análisis por pregunta
    const an = L.analisisPorPregunta(ensayo, hojas);
    const letras = L.LETRAS_PAES.slice(0, Math.max(4, ensayo.alternativas || 4)).split("");
    const hayE = an.some((a) => a.cuenta.E > 0);
    const letrasAn = hayE && !letras.includes("E") ? letras.concat(["E"]) : letras;
    const filasAn = [["Pregunta", "Clave", "Válida", "% de aciertos", "% de omisión"].concat(letrasAn.map((l) => "Marcaron " + l), ["Dobles", "Más marcada"]).map((t) => E(t, "encabezado"))];
    an.forEach((a) => {
      filasAn.push(
        [E(a.n, "centro"), E(a.clave, "centro"), E(a.valida ? "sí" : "no", a.valida ? "centro" : "gris"), E(a.pctAciertos, "decimal"), E(a.pctOmision, "decimal")].concat(
          letrasAn.map((l) => E(a.cuenta[l], l === a.clave ? "verde" : "centro")),
          [E(a.dobles, "centro"), E(a.masMarcada, a.masMarcada && a.masMarcada !== a.clave ? "amarillo" : "centro")]
        )
      );
    });

    // --- Por revisar
    const filasRev = [["Archivo", "Página", "Estudiante", "RUT marcado en la hoja", "Advertencia"].map((t) => E(t, "encabezado"))];
    const porEst = new Map(curso.estudiantes.map((e) => [e.id, e]));
    hojas.forEach((h) => {
      const adv = (datos.advertencias && datos.advertencias.get(h.id)) || [];
      if (!adv.length || h.revisada) return;
      const est = h.estudianteId ? porEst.get(h.estudianteId) : null;
      adv.forEach((a) => filasRev.push([E(h.archivo, "texto"), E(h.pagina, "centro"), E(est ? L.nombreCompletoPaes(est) : "(sin identificar)", "texto"), E((h.lectura && h.lectura.id) || "", "centro"), E(a.detalle, "texto")]));
    });
    if (filasRev.length === 1) filasRev.push([E("No hay advertencias pendientes.", "nota")]);

    return crearXlsx([
      { nombre: "Resultados", anchos: [9, 24, 26, 14, 11, 12, 10, 11, 10, 46], congelar: filaEncabezado, filas: filasRes },
      { nombre: "Respuestas", anchos: [34, 14].concat(clave.map(() => 4.2), [10]), congelar: 2, filas: filasResp },
      { nombre: "Análisis por pregunta", anchos: [10, 8, 8, 13, 13].concat(letrasAn.map(() => 11), [9, 12]), congelar: 1, filas: filasAn },
      { nombre: "Por revisar", anchos: [30, 8, 32, 20, 80], congelar: 1, filas: filasRev },
    ]);
  }

  global.PaesExcel = { crearXlsx, excelDeEnsayo, fechaCorta };
})(window);
