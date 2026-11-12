// Ensayos PAES · reglas del módulo, sin interfaz: RUT, lista del curso, clave, tabla de
// conversión, vinculación de hojas con estudiantes, corrección, puntaje y estadísticas.
// No toca la página ni el guardado, así se puede probar solo (ver pruebas/).

(function (global) {
  "use strict";

  const LETRAS_PAES = "ABCDE";

  // Pruebas que trae el módulo. Se pueden agregar otras: la clave y la tabla son por ensayo.
  const PRUEBAS_PAES = {
    CL: { id: "CL", nombre: "Competencia Lectora", preguntas: 65, alternativas: 4 },
    M1: { id: "M1", nombre: "Matemática 1 (M1)", preguntas: 65, alternativas: 4 },
  };

  // Tablas de conversión de la unidad (correctas -> puntaje, de 0 a 60 correctas). Son
  // referenciales, no oficiales. Cada ensayo guarda su propia copia, que se puede editar.
  const TABLAS_PAES = {
    CL: [100, 158, 179, 200, 220, 240, 258, 274, 288, 303, 318, 335, 351, 365, 377, 386, 396, 408, 422, 437, 453, 465, 475, 483, 491, 499, 510, 523, 538, 553, 566, 575, 583, 590, 598, 608, 621, 636, 652, 665, 676, 685, 693, 703, 716, 732, 748, 763, 777, 790, 803, 818, 836, 855, 874, 893, 914, 936, 961, 988, 1000],
    M1: [100, 173, 199, 222, 244, 265, 284, 301, 316, 331, 346, 362, 378, 391, 402, 412, 422, 434, 447, 462, 476, 487, 496, 503, 510, 518, 529, 542, 557, 570, 581, 589, 596, 602, 610, 621, 634, 648, 662, 674, 683, 691, 700, 710, 723, 738, 753, 767, 779, 792, 805, 821, 838, 856, 875, 894, 915, 938, 964, 992, 1000],
  };

  function sinTildes(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function normalizarEncabezadoPaes(s) {
    return sinTildes(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  // ================================================================ RUT

  // dígito verificador (módulo 11) del cuerpo de un RUT
  function dvDeRut(cuerpo) {
    let suma = 0, mult = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
      suma += Number(cuerpo[i]) * mult;
      mult = mult === 7 ? 2 : mult + 1;
    }
    const r = 11 - (suma % 11);
    return r === 11 ? "0" : r === 10 ? "K" : String(r);
  }

  // Lee un RUT escrito de cualquier forma ("22.936.178-3", "229361783", "22936178-3").
  // Devuelve el RUT normalizado (sin puntos, con guion) y si el dígito verificador calza.
  function leerRut(texto, dvAparte) {
    let limpio = String(texto == null ? "" : texto).toUpperCase().replace(/[^0-9K]/g, "");
    if (dvAparte != null && String(dvAparte).trim() !== "") limpio += String(dvAparte).toUpperCase().replace(/[^0-9K]/g, "");
    limpio = limpio.replace(/^0+/, "");
    if (!limpio) return { rut: "", cuerpo: "", dv: "", valido: false, vacio: true };
    const cuerpo = limpio.slice(0, -1), dv = limpio.slice(-1);
    const formaOk = /^\d{6,8}$/.test(cuerpo);
    return { rut: cuerpo + "-" + dv, cuerpo, dv, valido: formaOk && dvDeRut(cuerpo) === dv, vacio: false };
  }

  // "22936178-3" -> "22.936.178-3"
  function formatearRutPaes(rut) {
    const r = leerRut(rut);
    if (r.vacio) return "";
    return r.cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + r.dv;
  }

  // ================================================================ nombres

  const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "da", "di", "do", "dos", "van", "von", "san", "santa", "e"]);

  function tieneLetras(t) {
    return t.toUpperCase() !== t.toLowerCase();
  }
  function esMayusculas(t) {
    return tieneLetras(t) && t === t.toUpperCase();
  }

  function capitalizarPalabra(p) {
    return p.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }

  // "MARÍA DE LOS ÁNGELES" -> "María de los Ángeles"
  function tituloNombre(texto) {
    return String(texto || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((p, i) => (i > 0 && PARTICULAS.has(sinTildes(p).toLowerCase()) ? p.toLowerCase() : capitalizarPalabra(p)))
      .join(" ");
  }

  // Separa "Apellido1 Apellido2 NOMBRES" (convención de las listas de los colegios: apellidos
  // con inicial mayúscula y nombres en MAYÚSCULAS). Si la convención no se reconoce, supone
  // dos apellidos primero y lo marca como "no seguro" para que se revise en la vista previa.
  function separarNombre(texto) {
    const limpio = String(texto == null ? "" : texto).replace(/\s+/g, " ").trim();
    if (!limpio) return { nombres: "", apellidos: "", seguro: false };
    if (limpio.includes(",")) {
      const [ap, ...resto] = limpio.split(",");
      return { apellidos: tituloNombre(ap), nombres: tituloNombre(resto.join(" ")), seguro: true };
    }
    const partes = limpio.split(" ");
    // primer índice desde el que todo está en mayúsculas
    let corte = partes.length;
    while (corte > 0 && esMayusculas(partes[corte - 1])) corte--;
    if (corte > 0 && corte < partes.length) {
      return { apellidos: partes.slice(0, corte).join(" "), nombres: tituloNombre(partes.slice(corte).join(" ")), seguro: true };
    }
    // sin convención: dos apellidos (cada uno con sus partículas: "de la Fuente") y luego los nombres
    const unidades = [];
    let actual = [];
    partes.forEach((p) => {
      actual.push(p);
      if (!PARTICULAS.has(sinTildes(p).toLowerCase())) {
        unidades.push(actual.join(" "));
        actual = [];
      }
    });
    if (actual.length) unidades.push(actual.join(" "));
    if (unidades.length === 1) return { apellidos: "", nombres: tituloNombre(unidades[0]), seguro: false };
    const nAp = unidades.length >= 3 ? 2 : 1;
    return { apellidos: tituloNombre(unidades.slice(0, nAp).join(" ")), nombres: tituloNombre(unidades.slice(nAp).join(" ")), seguro: false };
  }

  function nombreCompletoPaes(e) {
    return [e.nombres, e.apellidos].filter(Boolean).join(" ");
  }

  // ================================================================ lista del curso

  const PATRON_RUT = /^\s*\d{1,2}\.?\d{3}\.?\d{3}\s*-?\s*[\dkK]?\s*$/;

  function celda(v) {
    return v == null ? "" : String(v).trim();
  }

  // filas: matriz de celdas (como la entrega la lectura de Excel/CSV). Encuentra las
  // columnas de RUT, nombre y curso (por encabezado o por contenido) y arma la lista.
  function leerListaCurso(filas) {
    const avisos = [];
    const limpias = (filas || []).map((f) => (f || []).map(celda));
    // encabezado: la fila, entre las primeras, que más palabras conocidas tenga
    let filaEnc = -1, mejor = 0;
    limpias.slice(0, 25).forEach((f, i) => {
      const puntos = f.filter((c) => /^(rut|run|r u t|dv|nombre|nombres|apellido|apellidos|alumno|alumna|estudiante|curso|nombre completo|nombre alumno|nombre estudiante|apellido paterno|apellido materno|n|nro|numero)\b/.test(normalizarEncabezadoPaes(c))).length;
      const tieneClave = f.some((c) => /^(rut|run|nombre|nombres|apellido|alumno|estudiante)/.test(normalizarEncabezadoPaes(c)));
      if (tieneClave && puntos > mejor) {
        mejor = puntos;
        filaEnc = i;
      }
    });
    const col = { rut: -1, dv: -1, nombre: -1, nombres: -1, apPaterno: -1, apMaterno: -1, apellidos: -1, curso: -1 };
    if (filaEnc >= 0) {
      limpias[filaEnc].forEach((c, i) => {
        const e = normalizarEncabezadoPaes(c);
        if (!e) return;
        if (/^(dv|digito|dig verificador|digito verificador|verificador)$/.test(e)) col.dv = i;
        else if (/^(rut|run|r u t)\b/.test(e) && col.rut < 0) col.rut = i;
        else if (/paterno|primer apellido|apellido 1|apellido1/.test(e)) col.apPaterno = i;
        else if (/materno|segundo apellido|apellido 2|apellido2/.test(e)) col.apMaterno = i;
        else if (/^apellidos?$/.test(e)) col.apellidos = i;
        else if (/^nombres?$/.test(e) && col.nombres < 0) col.nombres = i;
        else if (/nombre|alumn|estudiante/.test(e) && col.nombre < 0) col.nombre = i;
        else if (/^curso\b/.test(e) && col.curso < 0) col.curso = i;
      });
    }
    const datos = limpias.slice(filaEnc + 1);
    const nCols = Math.max(0, ...limpias.map((f) => f.length));
    const cuenta = (i, prueba) => datos.filter((f) => f[i] && prueba(f[i])).length;
    if (col.rut < 0) {
      let max = 0;
      for (let i = 0; i < nCols; i++) {
        const n = cuenta(i, (c) => PATRON_RUT.test(c) && c.replace(/\D/g, "").length >= 7);
        if (n > max) {
          max = n;
          col.rut = i;
        }
      }
    }
    const hayPartes = col.apPaterno >= 0 || col.apellidos >= 0;
    // "Nombres" junto a columnas de apellidos es solo el nombre; sola, es el nombre completo
    if (col.nombre < 0 && col.nombres >= 0 && !hayPartes) {
      col.nombre = col.nombres;
      col.nombres = -1;
    }
    if (col.nombre < 0 && !(hayPartes && col.nombres >= 0)) {
      let max = 0;
      for (let i = 0; i < nCols; i++) {
        if (i === col.rut || i === col.curso) continue;
        const n = cuenta(i, (c) => /\p{L}{2,}\s+\p{L}{2,}/u.test(c) && !/\d/.test(c));
        if (n > max) {
          max = n;
          col.nombre = i;
        }
      }
    }
    if (col.nombre < 0 && !(hayPartes && col.nombres >= 0)) {
      return { estudiantes: [], avisos: ["No se encontró una columna con los nombres de los estudiantes."], columnas: col, cursoDetectado: "" };
    }
    if (col.rut < 0) avisos.push("No se encontró una columna de RUT: los estudiantes quedan sin RUT y habrá que vincular sus hojas a mano.");

    const crudos = [];
    datos.forEach((f) => {
      let nombreOriginal, partes;
      if (col.nombre >= 0) {
        nombreOriginal = f[col.nombre] || "";
        partes = separarNombre(nombreOriginal);
      } else {
        const ap = [col.apPaterno >= 0 ? f[col.apPaterno] : "", col.apMaterno >= 0 ? f[col.apMaterno] : "", col.apellidos >= 0 ? f[col.apellidos] : ""].filter(Boolean).join(" ");
        const no = f[col.nombres] || "";
        nombreOriginal = (ap + " " + no).trim();
        partes = { apellidos: tituloNombre(ap), nombres: tituloNombre(no), seguro: true };
      }
      const rutCrudo = col.rut >= 0 ? f[col.rut] || "" : "";
      if (!nombreOriginal && !rutCrudo) return;
      // filas que no son estudiantes (títulos, totales): sin RUT y con una sola palabra o con números
      if (!rutCrudo && (!/\s/.test(nombreOriginal.trim()) || /\d/.test(nombreOriginal))) return;
      crudos.push({ nombreOriginal, partes, rutCrudo, dv: col.dv >= 0 ? f[col.dv] : null, curso: col.curso >= 0 ? f[col.curso] || "" : "" });
    });

    // ¿la lista trae el RUT sin dígito verificador? (casi todos "inválidos" y de 7 u 8 dígitos)
    let sinDv = false;
    if (col.dv < 0 && crudos.length >= 3) {
      const conRut = crudos.filter((c) => c.rutCrudo);
      const soloCuerpo = conRut.filter((c) => /^\d{7,8}$/.test(c.rutCrudo.replace(/[.\s]/g, "")) && !leerRut(c.rutCrudo).valido);
      if (conRut.length && soloCuerpo.length / conRut.length >= 0.8) {
        sinDv = true;
        avisos.push("La lista trae los RUT sin dígito verificador: la app lo calculó para cada estudiante.");
      }
    }

    const estudiantes = [];
    const vistos = new Map();
    let repetidos = 0;
    crudos.forEach((c) => {
      let r;
      if (sinDv && c.rutCrudo) {
        const cuerpo = c.rutCrudo.replace(/\D/g, "").replace(/^0+/, "");
        r = leerRut(cuerpo + dvDeRut(cuerpo));
      } else {
        r = leerRut(c.rutCrudo, c.dv);
      }
      if (r.rut && vistos.has(r.rut)) {
        repetidos++;
        return;
      }
      if (r.rut) vistos.set(r.rut, true);
      estudiantes.push({
        nombres: c.partes.nombres,
        apellidos: c.partes.apellidos,
        rut: r.rut,
        rutValido: r.valido,
        curso: c.curso,
        nombreOriginal: c.nombreOriginal,
        nombreSeguro: c.partes.seguro,
      });
    });
    if (repetidos) avisos.push(`${repetidos} ${repetidos === 1 ? "fila repetía" : "filas repetían"} un RUT que ya estaba en la lista y no se ${repetidos === 1 ? "cargó" : "cargaron"} dos veces.`);
    const invalidos = estudiantes.filter((e) => e.rut && !e.rutValido).length;
    if (invalidos) avisos.push(`${invalidos} RUT ${invalidos === 1 ? "tiene" : "tienen"} el dígito verificador incorrecto: ${invalidos === 1 ? "revísalo" : "revísalos"} antes de confirmar.`);
    const dudosos = estudiantes.filter((e) => !e.nombreSeguro).length;
    if (dudosos) avisos.push(`En ${dudosos} ${dudosos === 1 ? "estudiante" : "estudiantes"} no se pudo distinguir con seguridad nombres de apellidos: ${dudosos === 1 ? "revísalo" : "revísalos"} en la vista previa.`);
    const cursos = Array.from(new Set(estudiantes.map((e) => e.curso).filter(Boolean)));
    if (cursos.length > 1) avisos.push(`El archivo trae ${cursos.length} cursos distintos (${cursos.join(", ")}): elige cuál cargar.`);
    return { estudiantes, avisos, columnas: col, cursoDetectado: cursos.length === 1 ? cursos[0] : "", cursos };
  }

  // ================================================================ clave

  function esNoValida(v) {
    const t = normalizarEncabezadoPaes(v);
    return /^(no|0|false|falso|x|anulada|anulado|piloto|pilotaje|n)$/.test(t);
  }

  // Lee una clave desde filas de Excel/CSV. Acepta el formato de importación de ZipGrade
  // (Key, Question, Response/Mapping, Point Value, Tags) y uno simple (pregunta, respuesta, válida).
  function leerClave(filas) {
    const avisos = [];
    const limpias = (filas || []).map((f) => (f || []).map(celda)).filter((f) => f.some(Boolean));
    if (!limpias.length) return { clave: [], avisos: ["El archivo está vacío."] };
    const enc = limpias[0].map(normalizarEncabezadoPaes);
    const buscar = (re) => enc.findIndex((e) => re.test(e));
    let cPreg = buscar(/^(question|pregunta|preg|n|nro|numero|item)\b/);
    let cResp = buscar(/^(response|respuesta|clave|alternativa|correcta|resp)\b/);
    const cValida = buscar(/^(valida|vale|cuenta)\b/);
    const cPuntos = buscar(/^(point value|puntos|puntaje|valor)\b/);
    const cKey = buscar(/^(key|version|forma)$/);
    let datos = limpias;
    if (cPreg >= 0 && cResp >= 0) {
      datos = limpias.slice(1);
    } else {
      // sin encabezado: [número, letra] o una sola columna de letras
      const f0 = limpias[0];
      if (f0.length >= 2 && /^\d+$/.test(f0[0]) && /^[A-Ea-e]$/.test(f0[1])) {
        cPreg = 0;
        cResp = 1;
      } else if (limpias.every((f) => /^[A-Ea-e]$/.test(f[0]))) {
        cPreg = -1;
        cResp = 0;
      } else if (limpias.length === 1 && /^[A-Ea-e\s]+$/.test(f0.join(""))) {
        return claveDesdeTexto(f0.join(""));
      } else {
        return { clave: [], avisos: ["No se reconoció el formato de la clave. Debe traer el número de pregunta y la respuesta (A a E)."] };
      }
    }
    let versiones = [];
    if (cKey >= 0) {
      versiones = Array.from(new Set(datos.map((f) => f[cKey]).filter(Boolean)));
      if (versiones.length > 1) {
        avisos.push(`El archivo trae ${versiones.length} versiones de clave (${versiones.join(", ")}): se cargó la versión ${versiones[0]}.`);
        datos = datos.filter((f) => f[cKey] === versiones[0]);
      }
    }
    const porNumero = new Map();
    datos.forEach((f, i) => {
      const n = cPreg >= 0 ? Number(f[cPreg]) : i + 1;
      const r = (f[cResp] || "").toUpperCase().trim();
      if (!Number.isInteger(n) || n < 1) return;
      let valida = true;
      if (cValida >= 0 && f[cValida] !== "" && esNoValida(f[cValida])) valida = false;
      if (cPuntos >= 0 && f[cPuntos] !== "" && Number(f[cPuntos].replace(",", ".")) === 0) valida = false;
      if (!/^[A-E]$/.test(r)) {
        if (r === "" && !valida) {
          porNumero.set(n, { n, r: "", valida: false });
          return;
        }
        avisos.push(`Pregunta ${n}: la respuesta «${f[cResp]}» no es una letra de A a E.`);
        return;
      }
      if (porNumero.has(n)) avisos.push(`La pregunta ${n} viene dos veces: se usó la última.`);
      porNumero.set(n, { n, r, valida });
    });
    const clave = Array.from(porNumero.values()).sort((a, b) => a.n - b.n);
    const max = clave.length ? clave[clave.length - 1].n : 0;
    if (clave.length && clave.length !== max) avisos.push(`Faltan preguntas en la clave: hay ${clave.length} respuestas y la última es la ${max}.`);
    return { clave, avisos, versiones };
  }

  // clave escrita o pegada: "ABCDA…" (una letra por pregunta) o "1 A, 2 B, …"
  function claveDesdeTexto(texto) {
    const t = String(texto || "").toUpperCase();
    const avisos = [];
    let clave = [];
    if (/\d/.test(t)) {
      const re = /(\d+)\s*[.):=\-;,\t ]*\s*([A-E])\b/g;
      let m;
      const vistos = new Map();
      while ((m = re.exec(t))) vistos.set(Number(m[1]), m[2]);
      clave = Array.from(vistos.entries()).sort((a, b) => a[0] - b[0]).map(([n, r]) => ({ n, r, valida: true }));
    } else {
      const letras = t.replace(/[^A-E]/g, "");
      const otras = t.replace(/[A-E\s,;.\-|/]/g, "");
      if (otras) avisos.push(`Se ignoraron caracteres que no son letras de A a E: «${otras.slice(0, 12)}».`);
      clave = letras.split("").map((r, i) => ({ n: i + 1, r, valida: true }));
    }
    if (!clave.length) avisos.push("No se encontró ninguna respuesta. Escribe una letra (A a E) por pregunta.");
    return { clave, avisos, versiones: [] };
  }

  // ================================================================ tabla de conversión

  // filas [correctas, puntaje] -> arreglo donde la posición es el número de correctas
  function leerTabla(filas) {
    const avisos = [];
    const pares = new Map();
    (filas || []).forEach((f) => {
      const a = celda((f || [])[0]).replace(",", "."), b = celda((f || [])[1]).replace(",", ".");
      if (!/^\d+$/.test(a) || !/^\d+(\.\d+)?$/.test(b)) return;
      pares.set(Number(a), Math.round(Number(b)));
    });
    if (!pares.size) return { tabla: [], avisos: ["No se encontraron filas con «correctas» y «puntaje»."] };
    const max = Math.max(...pares.keys());
    const tabla = [];
    const faltan = [];
    for (let c = 0; c <= max; c++) {
      if (pares.has(c)) tabla.push(pares.get(c));
      else {
        tabla.push(null);
        faltan.push(c);
      }
    }
    if (faltan.length) avisos.push(`La tabla no trae puntaje para ${faltan.length} ${faltan.length === 1 ? "valor" : "valores"} de correctas (${faltan.slice(0, 8).join(", ")}${faltan.length > 8 ? "…" : ""}).`);
    for (let c = 1; c < tabla.length; c++) {
      if (tabla[c] != null && tabla[c - 1] != null && tabla[c] < tabla[c - 1]) {
        avisos.push(`El puntaje baja entre ${c - 1} y ${c} correctas: revisa la tabla.`);
        break;
      }
    }
    return { tabla, avisos };
  }

  // puntaje según la tabla: búsqueda exacta. Fuera del rango de la tabla no hay puntaje
  // (no se recorta ni se inventa): devuelve null y la hoja queda «sin tabla».
  function puntajeDe(correctas, tabla) {
    if (!tabla || correctas < 0 || correctas >= tabla.length) return null;
    const p = tabla[correctas];
    return p == null ? null : p;
  }

  // ================================================================ vinculación

  // distancia de edición entre dos textos; "?" en el ID leído calza con cualquier dígito
  function distanciaId(leido, real) {
    const n = leido.length, m = real.length;
    let prev = new Array(m + 1), cur = new Array(m + 1);
    for (let j = 0; j <= m; j++) prev[j] = j;
    for (let i = 1; i <= n; i++) {
      cur[0] = i;
      for (let j = 1; j <= m; j++) {
        const igual = leido[i - 1] === real[j - 1] || leido[i - 1] === "?";
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (igual ? 0 : 1));
      }
      [prev, cur] = [cur, prev];
    }
    return prev[m];
  }

  // formas en que un estudiante pudo marcar su RUT en la hoja: con y sin dígito verificador
  function formasDelRut(rut) {
    const r = leerRut(rut);
    if (r.vacio) return [];
    const formas = [{ texto: r.cuerpo, conDv: false }];
    if (/^\d$/.test(r.dv)) formas.unshift({ texto: r.cuerpo + r.dv, conDv: true });
    return formas;
  }

  // ¿el ID leído es un RUT válido? "valido" (cuerpo + dígito calzan), "sin-dv" (solo el
  // cuerpo: no se puede comprobar), "invalido" (el dígito no calza), "incompleto" o "vacio".
  function estadoDelId(id) {
    if (!id) return "vacio";
    if (id.includes("?")) return "ambiguo";
    if (!/^\d+$/.test(id)) return "invalido";
    const sin0 = id.replace(/^0+/, "");
    if (sin0.length < 7) return "incompleto";
    if (sin0.length > 9) return "invalido";
    if (dvDeRut(sin0.slice(0, -1)) === sin0.slice(-1)) return "valido";
    if (sin0.length <= 8) return "sin-dv";
    return "invalido";
  }

  // Busca a quién corresponde una hoja según el ID leído.
  //   estudiantes: los del curso [{ id, rut, ... }]
  //   otros: estudiantes de otros cursos cargados [{ id, rut, cursoId, ... }]
  //   conHoja: ids de estudiantes del curso que ya tienen hoja en este ensayo
  // Devuelve { tipo, estudianteId?, candidatos: [{ estudianteId, distancia, mismoDv, confianza, motivo }] }
  //   tipo: "exacta" (se asigna sola) | "sugerida" (hay candidatos, falta confirmar) |
  //         "otro-curso" | "sin-id" (candidatos por eliminación) | "sin-candidato"
  function vincularHoja(idLeido, estudiantes, otros, conHoja) {
    const id = String(idLeido || "").replace(/^0+/, "");
    const yaTienen = conHoja || new Set();
    const sinHoja = () =>
      estudiantes.filter((e) => !yaTienen.has(e.id)).map((e) => ({ estudianteId: e.id, distancia: null, mismoDv: false, confianza: "baja", motivo: "sin hoja en este ensayo" }));
    if (!id || /^\?+$/.test(id)) return { tipo: "sin-id", candidatos: sinHoja() };
    const ambiguo = id.includes("?");
    if (!ambiguo) {
      const exactos = estudiantes.filter((e) => formasDelRut(e.rut).some((f) => f.texto === id));
      if (exactos.length === 1) return { tipo: "exacta", estudianteId: exactos[0].id, candidatos: [] };
      if (exactos.length > 1) {
        return { tipo: "sugerida", candidatos: exactos.map((e) => ({ estudianteId: e.id, distancia: 0, mismoDv: true, confianza: "media", motivo: "el RUT calza con más de un estudiante" })) };
      }
      const deOtro = (otros || []).filter((e) => formasDelRut(e.rut).some((f) => f.texto === id));
      if (deOtro.length) {
        return { tipo: "otro-curso", candidatos: [], otroCurso: deOtro.map((e) => ({ estudianteId: e.id, cursoId: e.cursoId })) };
      }
    }
    // candidatos cercanos: hasta 2 dígitos de diferencia, con y sin verificador
    const candidatos = [];
    estudiantes.forEach((e) => {
      let mejor = null;
      formasDelRut(e.rut).forEach((f) => {
        const d = distanciaId(id, f.texto);
        if (d > 2) return;
        const r = leerRut(e.rut);
        // "mismo verificador": la hoja se marcó con verificador y es el del estudiante
        const mismoDv = f.conDv && id.length >= 2 && (id.slice(-1) === r.dv || id.slice(-1) === "?");
        if (!mejor || d < mejor.distancia || (d === mejor.distancia && mismoDv && !mejor.mismoDv)) mejor = { distancia: d, mismoDv };
      });
      if (mejor) {
        candidatos.push({
          estudianteId: e.id,
          distancia: mejor.distancia,
          mismoDv: mejor.mismoDv,
          confianza: mejor.distancia <= 1 && mejor.mismoDv ? "media" : "baja",
          motivo: mejor.distancia === 0 ? "calza con las columnas que se pudieron leer" : `${mejor.distancia} ${mejor.distancia === 1 ? "dígito distinto" : "dígitos distintos"}`,
          yaTieneHoja: yaTienen.has(e.id),
        });
      }
    });
    candidatos.sort((a, b) => a.distancia - b.distancia || Number(b.mismoDv) - Number(a.mismoDv) || Number(a.yaTieneHoja) - Number(b.yaTieneHoja));
    if (candidatos.length) return { tipo: "sugerida", candidatos };
    return { tipo: "sin-candidato", candidatos: sinHoja() };
  }

  // ================================================================ corrección

  // respuesta vigente de una pregunta: la edición manual, si existe, pasa sobre lo leído
  // (lo leído nunca se modifica). Devuelve { estado, letras }.
  function respuestaVigente(hoja, n) {
    const ed = hoja.ediciones && hoja.ediciones.respuestas ? hoja.ediciones.respuestas[n] : undefined;
    if (ed !== undefined) return { estado: ed ? "ok" : "blanco", letras: ed || "", editada: true };
    const c = hoja.lectura && hoja.lectura.resp ? hoja.lectura.resp[n - 1] : "-";
    if (c === "*") return { estado: "doble", letras: (hoja.lectura.dobles && hoja.lectura.dobles[n]) || "" };
    if (c === "~") return { estado: "tenue", letras: "" };
    if (c === "-" || c === undefined) return { estado: "blanco", letras: "" };
    return { estado: "ok", letras: c };
  }

  // Corrige una hoja con la clave. Las preguntas no válidas (anuladas o de pilotaje) no
  // cuentan. Las dobles marcas cuentan como incorrectas; las tenues y en blanco, como omitidas.
  function corregirHoja(hoja, clave) {
    let correctas = 0, incorrectas = 0, omitidas = 0, dobles = 0, validas = 0;
    const detalle = [];
    (clave || []).forEach((k) => {
      const r = respuestaVigente(hoja, k.n);
      let res;
      // una pregunta sin respuesta en la clave tampoco se puede corregir: no cuenta
      if (!k.valida || !k.r) res = "no-valida";
      else {
        validas++;
        if (r.estado === "doble") {
          dobles++;
          incorrectas++;
          res = "doble";
        } else if (r.estado !== "ok") {
          omitidas++;
          res = "omitida";
        } else if (r.letras === k.r) {
          correctas++;
          res = "correcta";
        } else {
          incorrectas++;
          res = "incorrecta";
        }
      }
      detalle.push({ n: k.n, clave: k.r, marcada: r.letras, estado: r.estado, resultado: res });
    });
    return { correctas, incorrectas, omitidas, dobles, validas, detalle };
  }

  // cadena de respuestas vigentes de una hoja para las preguntas de la clave ("ABCD-*…")
  function cadenaRespuestas(hoja, nPreguntas) {
    let s = "";
    for (let n = 1; n <= nPreguntas; n++) {
      const r = respuestaVigente(hoja, n);
      s += r.estado === "ok" ? r.letras : r.estado === "doble" ? "*" : "-";
    }
    return s;
  }

  // Advertencias de una hoja (lo que una persona debería mirar). Cada una: { tipo, detalle }.
  function advertenciasDeHoja(hoja, ensayo, opciones) {
    const o = opciones || {};
    const lista = [];
    const agregar = (tipo, detalle, extra) => lista.push(Object.assign({ tipo, detalle }, extra || {}));
    if (hoja.estado === "ilegible") {
      agregar("ilegible", "No se pudo leer la hoja: faltan esquinas o bloques. Vuelve a escanearla o ingresa sus respuestas a mano.");
      return lista;
    }
    if (hoja.repetidaDe) agregar("repetida", "Esta hoja ya está en el ensayo: no se cuenta dos veces.");
    const lec = hoja.lectura || {};
    const estId = estadoDelId(lec.id);
    if (!hoja.estudianteId) {
      if (estId === "vacio") agregar("id-vacio", "El estudiante no marcó su RUT: elige a quién corresponde la hoja.");
      else if (estId === "ambiguo") agregar("id-ilegible", "El RUT tiene columnas con dos marcas o sin marca: elige a quién corresponde la hoja.");
      else if (hoja.vinculo === "otro-curso") agregar("otro-curso", "Este RUT pertenece a un estudiante de otro curso.");
      else agregar("rut-sin-coincidencia", "El RUT marcado no está en la lista del curso.");
    }
    if (estId === "invalido") agregar("rut-invalido", "El RUT marcado en la hoja no es válido (el dígito verificador no calza).");
    if (o.duplicadaDeEstudiante) agregar("dos-hojas", "Hay dos hojas de este estudiante en el ensayo: elige cuál conservar.");
    const clave = (ensayo && ensayo.clave) || [];
    const nAlt = (ensayo && ensayo.alternativas) || 4;
    let blancas = 0;
    const dobles = [], tenues = [], suaves = [], enE = [];
    clave.forEach((k) => {
      const r = respuestaVigente(hoja, k.n);
      if (r.estado === "blanco" || r.estado === "tenue") blancas++;
      if (r.editada) return; // lo que ya corrigió una persona no se vuelve a advertir
      if (r.estado === "doble") dobles.push(k.n);
      if (r.estado === "tenue") tenues.push(k.n);
      if (r.estado === "ok") {
        const idx = LETRAS_PAES.indexOf(r.letras);
        if (idx >= nAlt) enE.push(k.n);
        const osc = lec.osc ? lec.osc[(k.n - 1) * 5 + idx] : null;
        if (osc != null && osc < (o.umbralSuave || 45)) suaves.push(k.n);
      }
    });
    const lista1 = (ns) => ns.join(", ");
    if (clave.length && blancas >= (o.minBlancas || 30)) agregar("casi-en-blanco", `${blancas} preguntas sin marcar: puede ser una mala lectura o un estudiante que no respondió.`);
    if (dobles.length) agregar("doble-marca", `Doble marca en ${dobles.length === 1 ? "la pregunta" : "las preguntas"} ${lista1(dobles)}.`, { preguntas: dobles });
    if (tenues.length) agregar("marca-tenue", `Marca muy tenue (no se contó) en ${tenues.length === 1 ? "la pregunta" : "las preguntas"} ${lista1(tenues)}.`, { preguntas: tenues });
    if (suaves.length) agregar("marca-tenue", `Marca suave (sí se contó) en ${suaves.length === 1 ? "la pregunta" : "las preguntas"} ${lista1(suaves)}: confírmala.`, { preguntas: suaves });
    if (enE.length) agregar("marca-e", `Marca en una alternativa que el ensayo no usa (${LETRAS_PAES.slice(nAlt)}) en ${enE.length === 1 ? "la pregunta" : "las preguntas"} ${lista1(enE)}.`, { preguntas: enE });
    (lec.problemas || []).forEach((p) => {
      if (p.tipo === "bloque") agregar("bloque", p.detalle);
    });
    return lista;
  }

  // ================================================================ resultados

  function redondear(v, dec) {
    const f = Math.pow(10, dec || 0);
    return Math.round(v * f) / f;
  }

  function medianaDe(valores) {
    if (!valores.length) return null;
    const v = valores.slice().sort((a, b) => a - b);
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  // Resultados de un ensayo: una fila por hoja vigente, ordenadas de mayor a menor puntaje
  // (los empates comparten lugar), y las estadísticas del curso.
  //   hojas: las del ensayo; estudiantes: los del curso
  function resultadosEnsayo(ensayo, hojas, estudiantes) {
    const porId = new Map((estudiantes || []).map((e) => [e.id, e]));
    const vigentes = (hojas || []).filter((h) => h.estado !== "ilegible" && !h.excluida && !h.repetidaDe);
    const filas = vigentes.map((h) => {
      const c = corregirHoja(h, ensayo.clave);
      const est = h.estudianteId ? porId.get(h.estudianteId) : null;
      const puntaje = puntajeDe(c.correctas, ensayo.tabla);
      return {
        hojaId: h.id,
        estudianteId: est ? est.id : null,
        nombre: est ? nombreCompletoPaes(est) : "",
        nombres: est ? est.nombres : "",
        apellidos: est ? est.apellidos : "",
        rut: est ? est.rut : "",
        correctas: c.correctas,
        incorrectas: c.incorrectas,
        omitidas: c.omitidas,
        dobles: c.dobles,
        validas: c.validas,
        puntaje,
        sinTabla: puntaje == null,
        logro: c.validas ? (c.correctas / c.validas) * 100 : 0,
        pagina: h.pagina,
        archivo: h.archivo,
        asignacion: h.asignacion || null,
      };
    });
    // se ordena por correctas (el puntaje sale de ellas): así una hoja «sin tabla», con
    // más correctas que el máximo de la tabla, queda arriba y no al final
    // (entre empatados, las hojas sin identificar van al final)
    filas.sort((a, b) => b.correctas - a.correctas || Number(!a.estudianteId) - Number(!b.estudianteId) || a.apellidos.localeCompare(b.apellidos, "es") || a.nombres.localeCompare(b.nombres, "es"));
    filas.forEach((f, i) => {
      const ant = filas[i - 1];
      f.lugar = ant && ant.correctas === f.correctas ? ant.lugar : i + 1;
    });
    const conHoja = new Set(filas.map((f) => f.estudianteId).filter(Boolean));
    const noRindieron = (estudiantes || []).filter((e) => !conHoja.has(e.id));
    const puntajes = filas.filter((f) => f.puntaje != null).map((f) => f.puntaje);
    const n = puntajes.length;
    const promedio = n ? puntajes.reduce((a, b) => a + b, 0) / n : null;
    // desviación estándar poblacional: describe al grupo que rindió, no estima a otro
    const desviacion = n ? Math.sqrt(puntajes.reduce((a, b) => a + (b - promedio) * (b - promedio), 0) / n) : null;
    const tramos = [];
    for (let desde = 100; desde < 1000; desde += 100) {
      const hasta = desde === 900 ? 1000 : desde + 99;
      tramos.push({ desde, hasta, n: puntajes.filter((p) => p >= desde && p <= hasta).length });
    }
    const estadisticas = {
      enLista: (estudiantes || []).length,
      hojas: filas.length,
      rindieron: conHoja.size,
      sinIdentificar: filas.filter((f) => !f.estudianteId).length,
      promedio: promedio == null ? null : redondear(promedio, 1),
      mediana: medianaDe(puntajes),
      maximo: n ? Math.max(...puntajes) : null,
      minimo: n ? Math.min(...puntajes) : null,
      desviacion: desviacion == null ? null : redondear(desviacion, 1),
      logroPromedio: filas.length ? redondear(filas.reduce((a, f) => a + f.logro, 0) / filas.length, 1) : null,
      correctasPromedio: filas.length ? redondear(filas.reduce((a, f) => a + f.correctas, 0) / filas.length, 1) : null,
      tramos,
      sinTabla: filas.filter((f) => f.sinTabla).length,
      preguntasValidas: (ensayo.clave || []).filter((k) => k.valida && k.r).length,
      preguntas: (ensayo.clave || []).length,
      maximoTabla: ensayo.tabla && ensayo.tabla.length ? ensayo.tabla.length - 1 : null,
    };
    return { filas, noRindieron, estadisticas };
  }

  // Análisis por pregunta: % de aciertos, % de omisión y cuántos marcaron cada alternativa.
  function analisisPorPregunta(ensayo, hojas) {
    const vigentes = (hojas || []).filter((h) => h.estado !== "ilegible" && !h.excluida && !h.repetidaDe);
    const total = vigentes.length;
    return (ensayo.clave || []).map((k) => {
      const cuenta = { A: 0, B: 0, C: 0, D: 0, E: 0 };
      let aciertos = 0, omitidas = 0, dobles = 0;
      vigentes.forEach((h) => {
        const r = respuestaVigente(h, k.n);
        if (r.estado === "doble") dobles++;
        else if (r.estado !== "ok") omitidas++;
        else {
          cuenta[r.letras]++;
          if (r.letras === k.r) aciertos++;
        }
      });
      const masMarcada = Object.keys(cuenta).reduce((a, b) => (cuenta[b] > cuenta[a] ? b : a), "A");
      return {
        n: k.n,
        clave: k.r,
        valida: k.valida,
        aciertos,
        omitidas,
        dobles,
        cuenta,
        pctAciertos: total ? redondear((aciertos / total) * 100, 1) : null,
        pctOmision: total ? redondear((omitidas / total) * 100, 1) : null,
        masMarcada: cuenta[masMarcada] ? masMarcada : "",
      };
    });
  }

  // ================================================================ huellas

  // huella corta de un bloque de bytes (para saber si un archivo o una página ya se subió).
  // No es criptográfica: solo detecta repetidos.
  function huellaDeBytes(bytes) {
    let h1 = 0xdeadbeef ^ bytes.length, h2 = 0x41c6ce57 ^ bytes.length;
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0") + "-" + bytes.length.toString(16);
  }

  global.PaesLogica = {
    LETRAS_PAES,
    PRUEBAS_PAES,
    TABLAS_PAES,
    sinTildes,
    normalizarEncabezadoPaes,
    dvDeRut,
    leerRut,
    formatearRutPaes,
    tituloNombre,
    separarNombre,
    nombreCompletoPaes,
    leerListaCurso,
    leerClave,
    claveDesdeTexto,
    leerTabla,
    puntajeDe,
    distanciaId,
    estadoDelId,
    vincularHoja,
    respuestaVigente,
    corregirHoja,
    cadenaRespuestas,
    advertenciasDeHoja,
    resultadosEnsayo,
    analisisPorPregunta,
    huellaDeBytes,
    medianaDe,
  };
})(typeof window !== "undefined" ? window : globalThis);
