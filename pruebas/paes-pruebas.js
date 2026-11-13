// Ensayos PAES · pruebas automáticas del lector y de las reglas del módulo.
// No usan datos de estudiantes: los RUT y nombres son inventados y las hojas son sintéticas.
// Se ejecutan abriendo pruebas/paes-pruebas.html en el navegador.

function ejecutarPruebasPaes(opciones) {
  const o = opciones || {};
  const L = PaesLogica;
  const lineas = [];
  let total = 0, fallas = 0;
  const comprobar = (nombre, condicion, detalle) => {
    total++;
    if (!condicion) fallas++;
    lineas.push({ ok: !!condicion, texto: nombre + (condicion || !detalle ? "" : " → " + detalle) });
  };
  const igual = (nombre, obtenido, esperado) => comprobar(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `se obtuvo ${JSON.stringify(obtenido)} y se esperaba ${JSON.stringify(esperado)}`);
  const titulo = (t) => lineas.push({ titulo: t });

  // ------------------------------------------------------------ RUT
  titulo("RUT");
  igual("dígito verificador de 12.345.678", L.dvDeRut("12345678"), "5");
  igual("dígito verificador K", L.dvDeRut("20000003"), "K");
  igual("RUT con puntos y guion", L.leerRut("12.345.678-5").rut, "12345678-5");
  comprobar("RUT válido", L.leerRut("12.345.678-5").valido);
  comprobar("RUT sin puntos ni guion", L.leerRut("123456785").valido && L.leerRut("123456785").rut === "12345678-5");
  comprobar("RUT con dígito verificador incorrecto", !L.leerRut("12.345.678-9").valido);
  comprobar("RUT terminado en k minúscula", L.leerRut("20.000.003-k").valido);
  comprobar("RUT con el verificador en otra columna", L.leerRut("12345678", "5").valido);
  comprobar("RUT vacío", L.leerRut("  ").vacio);
  igual("RUT con formato chileno", L.formatearRutPaes("12345678-5"), "12.345.678-5");

  // ------------------------------------------------------------ nombres
  titulo("Nombres y apellidos");
  igual("convención «Apellidos NOMBRES»", L.separarNombre("Pérez Soto JUAN PABLO"), { apellidos: "Pérez Soto", nombres: "Juan Pablo", seguro: true });
  igual("apellido con partículas y nombre compuesto", L.separarNombre("De la Fuente Muñoz MARÍA DE LOS ÁNGELES"), { apellidos: "De la Fuente Muñoz", nombres: "María de los Ángeles", seguro: true });
  igual("todo en mayúsculas: dos apellidos primero, sin seguridad", L.separarNombre("GONZALEZ ROJAS ANA MARIA"), { apellidos: "Gonzalez Rojas", nombres: "Ana Maria", seguro: false });
  igual("con coma", L.separarNombre("Soto Vera, Ana"), { apellidos: "Soto Vera", nombres: "Ana", seguro: true });
  igual("se muestra «Nombres Apellidos»", L.nombreCompletoPaes(L.separarNombre("Pérez Soto JUAN PABLO")), "Juan Pablo Pérez Soto");

  // ------------------------------------------------------------ lista del curso
  titulo("Lista oficial del curso");
  const lista = L.leerListaCurso([
    ["Lista de curso 4° A"],
    ["N°", "Curso", "Nombre", "RUT"],
    [1, "4° A", "Pérez Soto JUAN PABLO", "12.345.678-5"],
    [2, "4° A", "Rojas Díaz ANA", "11.111.111-1"],
    [3, "4° A", "Vera Paz LUIS", "22.222.222-9"],
    [4, "4° A", "Rojas Díaz ANA", "11.111.111-1"],
    [],
  ]);
  igual("estudiantes leídos (sin la fila repetida)", lista.estudiantes.length, 3);
  igual("nombres primero", L.nombreCompletoPaes(lista.estudiantes[0]), "Juan Pablo Pérez Soto");
  igual("RUT normalizado", lista.estudiantes[0].rut, "12345678-5");
  comprobar("avisa el RUT con verificador incorrecto", !lista.estudiantes[2].rutValido && lista.avisos.some((a) => /verificador incorrecto/.test(a)));
  comprobar("avisa la fila repetida", lista.avisos.some((a) => /repet/.test(a)));
  igual("curso detectado", lista.cursoDetectado, "4° A");
  const sinEnc = L.leerListaCurso([["Pérez Soto JUAN", "12345678-5"], ["Rojas Díaz ANA", "11111111-1"]]);
  igual("lista sin encabezados", sinEnc.estudiantes.map((e) => e.rut), ["12345678-5", "11111111-1"]);
  const porPartes = L.leerListaCurso([["RUT", "DV", "Apellido Paterno", "Apellido Materno", "Nombres"], ["12345678", "5", "PÉREZ", "SOTO", "JUAN PABLO"]]);
  igual("columnas separadas de apellidos, nombres y verificador", [porPartes.estudiantes[0].rut, L.nombreCompletoPaes(porPartes.estudiantes[0])], ["12345678-5", "Juan Pablo Pérez Soto"]);
  const sinDv = L.leerListaCurso([["Nombre", "RUT"], ["Pérez Soto JUAN", "12345678"], ["Rojas Díaz ANA", "11111111"], ["Vera Paz LUIS", "22222222"]]);
  igual("lista con RUT sin verificador: se calcula", sinDv.estudiantes.map((e) => e.rut), ["12345678-5", "11111111-1", "22222222-2"]);

  // ------------------------------------------------------------ clave y tabla
  titulo("Clave y tabla de conversión");
  const zg = L.leerClave([["Key", "Question", "Response/Mapping", "Point Value", "Tags"], ["A", "1", "D", "1", ""], ["A", "2", "b", "1", ""], ["A", "3", "C", "0", ""]]);
  igual("clave en formato ZipGrade", zg.clave, [{ n: 1, r: "D", valida: true }, { n: 2, r: "B", valida: true }, { n: 3, r: "C", valida: false }]);
  igual("clave simple con preguntas no válidas", L.leerClave([["pregunta", "respuesta", "válida"], [1, "A", "sí"], [2, "B", "no"]]).clave, [{ n: 1, r: "A", valida: true }, { n: 2, r: "B", valida: false }]);
  igual("clave escrita como letras", L.claveDesdeTexto("ABCD a").clave.map((k) => k.r).join(""), "ABCDA");
  igual("clave escrita con números", L.claveDesdeTexto("1.A 2) B\n3 C").clave.map((k) => k.n + k.r).join(" "), "1A 2B 3C");
  igual("tabla CL: 0, 1, 30 y 60 correctas", [0, 1, 30, 60].map((c) => L.puntajeDe(c, L.TABLAS_PAES.CL)), [100, 158, 566, 1000]);
  igual("tabla M1: 0, 1, 30 y 60 correctas", [0, 1, 30, 60].map((c) => L.puntajeDe(c, L.TABLAS_PAES.M1)), [100, 173, 581, 1000]);
  igual("más correctas que la tabla: sin puntaje (no se recorta)", L.puntajeDe(61, L.TABLAS_PAES.CL), null);
  igual("tabla importada", L.leerTabla([["correctas", "puntaje"], ["0", "100"], ["1", "158"]]).tabla, [100, 158]);

  // ------------------------------------------------------------ vinculación
  titulo("Vinculación de hojas con la lista");
  const curso = [
    { id: "A", rut: "12345678-5" },
    { id: "B", rut: "11111111-1" },
    { id: "C", rut: "20000003-K" },
    { id: "D", rut: "22222222-2" },
  ];
  const otros = [{ id: "X", rut: "15555555-" + L.dvDeRut("15555555"), cursoId: "otro" }];
  igual("RUT completo: se asigna sola", L.vincularHoja("123456785", curso, otros).estudianteId, "A");
  igual("RUT sin verificador: se asigna sola", L.vincularHoja("12345678", curso, otros).estudianteId, "A");
  igual("RUT terminado en K, marcado sin verificador", L.vincularHoja("20000003", curso, otros).estudianteId, "C");
  const errado = L.vincularHoja("123456775", curso, otros);
  comprobar("un dígito errado: queda sugerida, no asignada", errado.tipo === "sugerida" && !errado.estudianteId && errado.candidatos[0].estudianteId === "A");
  igual("un dígito errado y mismo verificador: confianza media", [errado.candidatos[0].distancia, errado.candidatos[0].confianza], [1, "media"]);
  const ambigua = L.vincularHoja("1234?6785", curso, otros);
  comprobar("columna con dos marcas: no se adivina", ambigua.tipo === "sugerida" && !ambigua.estudianteId && ambigua.candidatos[0].estudianteId === "A");
  const vacia = L.vincularHoja("", curso, otros, new Set(["A"]));
  igual("hoja sin RUT: estudiantes sin hoja, por eliminación", [vacia.tipo, vacia.candidatos.map((c) => c.estudianteId).join("")], ["sin-id", "BCD"]);
  igual("RUT de otro curso cargado", L.vincularHoja(otros[0].rut.replace("-", ""), curso, otros).tipo, "otro-curso");
  igual("RUT que no se parece a ninguno: no se descarta", L.vincularHoja("999999999", curso, otros).tipo, "sin-candidato");
  igual("estado del RUT marcado", ["123456785", "123456789", "12345678", "", "12?45"].map(L.estadoDelId), ["valido", "invalido", "sin-dv", "vacio", "ambiguo"]);

  // ------------------------------------------------------------ corrección y resultados
  titulo("Corrección, puntaje y resultados");
  const clave5 = "ABCDA".split("").map((r, i) => ({ n: i + 1, r, valida: true }));
  const hoja = (id, resp, extra) => Object.assign({ id, estado: "ok", lectura: { resp, id: "", dobles: {} } }, extra || {});
  const c1 = L.corregirHoja(hoja("h1", "ABCD-"), clave5);
  igual("correctas, incorrectas y omitidas", [c1.correctas, c1.incorrectas, c1.omitidas], [4, 0, 1]);
  const c2 = L.corregirHoja(hoja("h2", "AB*DB", { lectura: { resp: "AB*DB", dobles: { 3: "BC" } } }), clave5);
  igual("la doble marca cuenta como incorrecta", [c2.correctas, c2.incorrectas, c2.dobles], [3, 2, 1]);
  const claveAnulada = clave5.map((k) => (k.n === 5 ? Object.assign({}, k, { valida: false }) : k));
  igual("una pregunta no válida no cuenta", [L.corregirHoja(hoja("h1", "ABCDA"), claveAnulada).correctas, L.corregirHoja(hoja("h1", "ABCDA"), claveAnulada).validas], [4, 4]);
  const editada = hoja("h1", "ABCD-", { ediciones: { respuestas: { 5: "A" } } });
  comprobar("editar una respuesta recalcula y conserva lo leído", L.corregirHoja(editada, clave5).correctas === 5 && editada.lectura.resp === "ABCD-");
  const ensayo = { clave: clave5, tabla: [100, 200, 300, 400, 500], alternativas: 4 };
  const estudiantes = [
    { id: "A", nombres: "Ana", apellidos: "Rojas", rut: "11111111-1" },
    { id: "B", nombres: "Luis", apellidos: "Vera", rut: "22222222-2" },
    { id: "C", nombres: "Eva", apellidos: "Paz", rut: "12345678-5" },
    { id: "D", nombres: "Sin", apellidos: "Hoja", rut: "20000003-K" },
  ];
  const hojas = [hoja("h1", "ABCD-", { estudianteId: "A" }), hoja("h2", "ABCDB", { estudianteId: "B" }), hoja("h3", "AB---", { estudianteId: "C" }), hoja("h4", "ABCDA", { estudianteId: null })];
  const res = L.resultadosEnsayo(ensayo, hojas, estudiantes);
  igual("orden de mayor a menor, los empates comparten lugar", res.filas.map((f) => f.lugar + ":" + (f.nombre || "sin identificar")), ["1:sin identificar", "2:Ana Rojas", "2:Luis Vera", "4:Eva Paz"]);
  igual("más correctas que la tabla: «sin tabla»", [res.filas[0].puntaje, res.filas[0].sinTabla], [null, true]);
  igual("quién no rindió", res.noRindieron.map((e) => e.id), ["D"]);
  igual("promedio, mediana, máximo y mínimo", [res.estadisticas.promedio, res.estadisticas.mediana, res.estadisticas.maximo, res.estadisticas.minimo], [433.3, 500, 500, 300]);
  const res2 = L.resultadosEnsayo(Object.assign({}, ensayo, { tabla: [100, 200, 300, 400, 550, 700] }), hojas, estudiantes);
  igual("cambiar la tabla recalcula los puntajes", res2.filas.map((f) => f.puntaje), [700, 550, 550, 300]);
  const hojasRep = hojas.concat([hoja("h5", "ABCD-", { estudianteId: "A", repetidaDe: "h1" }), hoja("h6", "", { estado: "ilegible" })]);
  igual("la hoja repetida y la ilegible no se cuentan", L.resultadosEnsayo(ensayo, hojasRep, estudiantes).filas.length, 4);
  const an = L.analisisPorPregunta(ensayo, hojas);
  igual("análisis por pregunta: aciertos y omisión de la 5", [an[4].aciertos, an[4].omitidas, an[4].pctAciertos], [1, 2, 25]);

  // ------------------------------------------------------------ advertencias
  titulo("Advertencias");
  // etapa 3: preguntas extremas y vista combinada
  const ext = L.preguntasExtremas(an, 2);
  comprobar("preguntas extremas: hay más difíciles y más fáciles, sin repetir", ext.dificiles.length === 2 && ext.faciles.length === 2 && ext.dificiles[0].pctAciertos <= ext.faciles[0].pctAciertos);
  const comb = L.resultadosCombinados([{ ensayo, hojas }, { ensayo, hojas: hojas.slice(0, 1) }], estudiantes);
  comprobar("vista combinada: una fila por estudiante con hoja y una celda por ensayo", comb.filas.length >= 1 && comb.filas.every((f) => f.celdas.length === 2) && comb.filas.some((f) => f.celdas[1] === null));
  // edición manual: pasa sobre lo leído sin modificarlo, y se puede volver atrás
  const hEd = hoja("ed", "ABCD-");
  hEd.ediciones = { respuestas: { 5: "A" } };
  igual("edición manual: cuenta la respuesta editada", L.corregirHoja(hEd, clave5).correctas, 5);
  igual("edición manual: lo leído queda intacto", hEd.lectura.resp, "ABCD-");
  delete hEd.ediciones.respuestas[5];
  igual("edición manual: al quitarla vuelve lo leído", L.corregirHoja(hEd, clave5).correctas, 4);

  const clave65 = Array.from({ length: 65 }, (_, i) => ({ n: i + 1, r: "ABCD"[i % 4], valida: true }));
  const ens65 = { clave: clave65, tabla: L.TABLAS_PAES.CL, alternativas: 4 };
  const tipos = (h) => L.advertenciasDeHoja(h, ens65).map((a) => a.tipo);
  comprobar("hoja casi en blanco", tipos(hoja("x", "ABCD".repeat(6) + "-".repeat(76), { estudianteId: "A" })).includes("casi-en-blanco"));
  comprobar("doble marca", tipos(hoja("x", "*" + "A".repeat(99), { estudianteId: "A" })).includes("doble-marca"));
  comprobar("marca en la alternativa E", tipos(hoja("x", "E" + "A".repeat(99), { estudianteId: "A" })).includes("marca-e"));
  comprobar("hoja sin RUT", tipos(hoja("x", "A".repeat(100))).includes("id-vacio"));
  comprobar("RUT que no está en la lista", tipos(hoja("x", "A".repeat(100), { lectura: { resp: "A".repeat(100), id: "999999999" } })).includes("rut-sin-coincidencia"));
  comprobar("hoja sin problemas: sin advertencias", tipos(hoja("x", "A".repeat(100), { estudianteId: "A", asignacion: "exacta", lectura: { resp: "A".repeat(100), id: "111111111" } })).length === 0);
  comprobar("huella: mismo contenido, misma huella", L.huellaDeBytes(new Uint8Array([1, 2, 3])) === L.huellaDeBytes(new Uint8Array([1, 2, 3])) && L.huellaDeBytes(new Uint8Array([1, 2, 3])) !== L.huellaDeBytes(new Uint8Array([1, 2, 4])));

  // ------------------------------------------------------------ lector con hojas sintéticas
  titulo("Lector de hojas (hojas sintéticas)");
  const def = PLANTILLAS_PAES["zipgrade-100"];
  const pl = PaesLector.prepararPlantilla(def);
  const azar = PaesLector.azarConSemilla(2026);
  const entero = (a, b) => a + Math.floor(azar() * (b - a + 1));
  // una hoja al azar: marcas normales, suaves, tenues, dobles, borrados y preguntas en blanco
  function hojaAlAzar() {
    const preguntas = {};
    const esperado = [];
    for (let q = 1; q <= 100; q++) {
      const t = azar();
      const alt = entero(0, 4);
      if (t < 0.05) {
        esperado.push("-");
      } else if (t < 0.08) {
        preguntas[q] = [{ alt, osc: 27 }];
        esperado.push("~");
      } else if (t < 0.12) {
        preguntas[q] = [{ alt, osc: 46 }];
        esperado.push("ABCDE"[alt]);
      } else if (t < 0.15) {
        const otra = (alt + entero(1, 4)) % 5;
        preguntas[q] = [{ alt, osc: 150 }, { alt: otra, osc: 130 }];
        esperado.push("*");
      } else if (t < 0.18) {
        const otra = (alt + entero(1, 4)) % 5;
        preguntas[q] = [{ alt, osc: 160 }, { alt: otra, osc: 50 }];
        esperado.push("ABCDE"[alt]); // la más oscura domina: la otra es un borrado
      } else {
        preguntas[q] = [{ alt, osc: entero(70, 200), dx: entero(-2, 2), dy: entero(-2, 2) }];
        esperado.push("ABCDE"[alt]);
      }
    }
    const id = Array.from({ length: 9 }, () => entero(0, 9)).join("");
    return { marcas: { preguntas, id }, esperado: esperado.join(""), id };
  }
  const deformaciones = [
    ["escaneo normal", {}],
    ["torcida 2°", { giro: 2, dx: 12, dy: -9 }],
    ["torcida -6° y corrida", { giro: -6, dx: -30, dy: 35 }],
    ["al revés", { cuartos: 2, giro: 0.8 }],
    ["girada 90°", { cuartos: 1 }],
    ["girada 270°", { cuartos: 3, giro: -1.2 }],
    ["150 dpi", { escala: 0.75 }],
    ["300 dpi", { escala: 1.5 }],
    ["con sombra y ruido", { sombra: 0.3, ruido: 6 }],
    ["torcida, al revés, con sombra y ruido", { giro: 3, cuartos: 2, escala: 0.9, sombra: 0.25, ruido: 5, dx: 20, dy: 15 }],
  ];
  const repeticiones = o.rapido ? 1 : 3;
  let burbujas = 0, errores = 0, idsMal = 0, hojasLeidas = 0, ms = 0;
  deformaciones.forEach(([nombre, d]) => {
    let erroresAqui = 0, idsAqui = 0;
    for (let k = 0; k < repeticiones; k++) {
      const h = hojaAlAzar();
      const pagina = PaesSintetica.deformarHoja(PaesSintetica.dibujarHoja(def, h.marcas), d, azar);
      const t0 = Date.now();
      const r = PaesLector.leerHoja(pagina.gris, pagina.w, pagina.h, pl);
      ms += Date.now() - t0;
      hojasLeidas++;
      burbujas += 100;
      if (!r.legible) {
        erroresAqui += 100;
        idsAqui++;
        continue;
      }
      const leido = r.respuestas.map((a) => (a.estado === "ok" ? a.letras : a.estado === "doble" ? "*" : a.estado === "tenue" ? "~" : "-")).join("");
      for (let i = 0; i < 100; i++) if (leido[i] !== h.esperado[i]) erroresAqui++;
      if (r.id !== h.id) idsAqui++;
    }
    errores += erroresAqui;
    idsMal += idsAqui;
    comprobar(`${nombre}: respuestas e ID leídos sin errores`, erroresAqui === 0 && idsAqui === 0, `${erroresAqui} respuestas y ${idsAqui} ID con error`);
  });
  const acierto = (1 - errores / burbujas) * 100;
  comprobar(`acierto global ≥ 99,9 % (${acierto.toFixed(2)} % en ${hojasLeidas} hojas, ${Math.round(ms / hojasLeidas)} ms por hoja)`, acierto >= 99.9);
  // ID con una columna de dos marcas: queda "?" y no se adivina
  const dosMarcas = PaesSintetica.dibujarHoja(def, { preguntas: {}, id: "123456785", idExtra: [[4, 9]] });
  igual("ID con dos marcas en una columna", PaesLector.leerHoja(dosMarcas.gris, dosMarcas.w, dosMarcas.h, pl).id, "1234?6785");
  const ochoDigitos = PaesSintetica.dibujarHoja(def, { preguntas: {}, id: "20000003" });
  igual("ID de 8 dígitos (RUT terminado en K)", PaesLector.leerHoja(ochoDigitos.gris, ochoDigitos.w, ochoDigitos.h, pl).id, "20000003");
  const blanca = PaesSintetica.dibujarHoja(def, { preguntas: {}, id: "" });
  const rBlanca = PaesLector.leerHoja(blanca.gris, blanca.w, blanca.h, pl);
  comprobar("hoja en blanco: legible, sin ID y sin respuestas", rBlanca.legible && rBlanca.id === "" && rBlanca.respuestas.every((a) => a.estado === "blanco"));
  // media hoja (faltan bloques): ilegible, sin romper el lote
  const media = { gris: blanca.gris.slice(), w: blanca.w, h: blanca.h };
  media.gris.fill(250, 0, media.w * 1300);
  comprobar("hoja incompleta: queda ilegible sin romper el lote", !PaesLector.leerHoja(media.gris, media.w, media.h, pl).legible);
  const vaciaTotal = new Uint8Array(1700 * 2200).fill(250);
  comprobar("página sin hoja: queda ilegible", !PaesLector.leerHoja(vaciaTotal, 1700, 2200, pl).legible);

  return { total, fallas, lineas };
}

if (typeof window === "undefined") globalThis.ejecutarPruebasPaes = ejecutarPruebasPaes;
