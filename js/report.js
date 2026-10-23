// Construcción del informe (HTML) y su exportación a PDF, individual o en lote (ZIP).
// El informe tiene una portada (banner + resumen de las 6 áreas con carreras UMAG) y
// una o más páginas de resultados personales del estudiante (una tarjeta por área de
// interés; si no caben todas en una hoja, se reparten en páginas de continuación sin
// cortar ninguna tarjeta a la mitad).

function fmtFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// deja en mayúscula la primera letra de cada palabra del nombre (formato simple,
// sin reglas especiales para partículas como "de"/"del" — si el nombre viene vacío
// o con formato raro, se devuelve tal cual).
function capitalizarNombre(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(" ")
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(" ");
}

// orden alfabético (sin distinguir mayúsculas ni tildes) usado tanto para numerar
// como para que ese número coincida con el orden en que va a aparecer el archivo
// dentro de la carpeta/ZIP al imprimir (el explorador de archivos ordena por nombre).
function compararNombres(a, b) {
  return (a || "").localeCompare(b || "", "es", { sensitivity: "base" });
}

// número de lista del estudiante (1, 2, 3...) y total de su grupo. Al armar una
// carpeta, cada estudiante trae su número dentro de ESA carpeta (numeroEnCarpeta, ver
// numerarParaCarpeta): así los archivos van del 1 al total sin saltos, y el N° impreso
// en el informe es el mismo del nombre del archivo. Si no, es su número dentro de su
// propio colegio+curso+letra, en orden alfabético (el mismo que tendría al descargar el
// curso completo). Se recalcula siempre (no se guarda en el estudiante).
function numeracionEnGrupo(storeDelTest, estudiante) {
  if (estudiante.numeroEnCarpeta) return { numero: estudiante.numeroEnCarpeta, total: estudiante.totalEnCarpeta || 0 };
  if (!storeDelTest) return { numero: null, total: 0 };
  const grupo = storeDelTest
    .listar()
    .filter(
      (e) =>
        (e.colegio || "") === (estudiante.colegio || "") &&
        (e.curso || "") === (estudiante.curso || "") &&
        (e.letra || "") === (estudiante.letra || "")
    )
    .sort((a, b) => compararNombres(a.nombre, b.nombre));
  const idx = grupo.findIndex((e) => e.id === estudiante.id);
  return { numero: idx === -1 ? null : idx + 1, total: grupo.length };
}

function calcularNumeroEnGrupo(estudiante) {
  return numeracionEnGrupo(typeof store === "undefined" ? null : store, estudiante).numero;
}

// copias de los estudiantes de una carpeta, en orden alfabético y numeradas del 1 al
// total (los informes y los nombres de archivo usan ese número)
function numerarParaCarpeta(estudiantes) {
  const ordenados = [...estudiantes].sort((a, b) => compararNombres(a.nombre, b.nombre));
  return ordenados.map((e, i) => ({ ...e, numeroEnCarpeta: i + 1, totalEnCarpeta: ordenados.length }));
}

// ==================== nombres de carpetas y archivos (los dos tests) ====================
// Carpeta (o ZIP) de un curso: "KUDER_Colegio_Alfa_2do_Medio_C_2026" ("8VO_..." en 8°).
// Archivo de cada informe: "01 - Nombre Alumno - Segundo C - Colegio Alfa.pdf", con el
// número correlativo de la carpeta adelante (con cero a la izquierda, para que el
// explorador de archivos los ordene bien): si al imprimir falta una hoja, se sabe qué
// número falta y de quién es.

function limpiarParaCarpeta(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function limpiarParaNombreArchivo(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 .,()&'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// año (del computador) para los nombres de carpetas y ZIP: "2026" (la fecha completa no
// hace falta)
function anioParaArchivo() {
  return String(new Date().getFullYear());
}

function nombreColegioParaCarpeta(estudiantes) {
  const colegios = [...new Set(estudiantes.map((e) => e.colegio).filter(Boolean))];
  return colegios.length === 1 ? limpiarParaCarpeta(colegios[0]) || "Colegio" : colegios.length ? "VariosColegios" : "SinColegio";
}

function nombreCarpetaCurso(prefijo, estudiantes) {
  // curso y letra separados: "2do Medio" + "C" → "2do_Medio_C"
  const cursos = [...new Set(estudiantes.map((e) => [e.curso, e.letra].filter(Boolean).join(" ")).filter(Boolean))];
  const curso = cursos.length === 1 ? limpiarParaCarpeta(cursos[0]) || "Curso" : cursos.length ? "VariosCursos" : "SinCurso";
  return `${prefijo}_${nombreColegioParaCarpeta(estudiantes)}_${curso}_${anioParaArchivo()}`;
}

// ZIP con varios cursos (una carpeta por curso adentro)
function nombreZipVariosCursos(prefijo, estudiantes, nCursos) {
  return `${prefijo}_${nombreColegioParaCarpeta(estudiantes)}_${nCursos}${nCursos === 1 ? "curso" : "cursos"}_${anioParaArchivo()}.zip`;
}

function numeroConCeros(numero, total) {
  return String(numero).padStart(Math.max(2, String(total || 0).length), "0");
}

// "01 - Nombre Alumno - Segundo C - Colegio Alfa.pdf"; "extra" va al final, antes de ".pdf"
function nombreArchivoNumerado(estudiante, { numero, total }, extra = "") {
  const partes = [
    numero ? numeroConCeros(numero, total) : "",
    limpiarParaNombreArchivo(capitalizarNombre(estudiante.nombre)) || "Estudiante",
    limpiarParaNombreArchivo([estudiante.curso, estudiante.letra].filter(Boolean).join(" ")),
    limpiarParaNombreArchivo(estudiante.colegio),
  ].filter(Boolean);
  return `${partes.join(" - ")}${extra}.pdf`;
}

function iconoCirculo(area, tamano) {
  return `<div class="icon-circle" style="background:${area.color}; width:${tamano}px; height:${tamano}px;">${ICONOS_SVG[area.id] || ""}</div>`;
}

function puntosDots(clase) {
  return `<div class="deco-dots ${clase || ""}"></div>`;
}

// separa una lista de carreras en profesionales y técnico-profesional, detectando
// estas últimas porque su nombre incluye "técnico" (todas las carreras técnicas de
// la UMAG en data.js se llaman "Técnico de Nivel Superior en...").
function clasificarCarreras(lista) {
  const tecnicas = lista.filter((c) => /t[eé]cnic/i.test(c));
  const profesionales = lista.filter((c) => !/t[eé]cnic/i.test(c));
  return { profesionales, tecnicas };
}

// ==================== carreras agrupadas por familia ====================
// Cuando una lista trae varias carreras de una misma familia, van juntas bajo un solo
// encabezado en vez de repetir la palabra: "Ingenierías: Construcción, Electricidad,
// Mecánica" en vez de "Ingeniería en Construcción, Ingeniería en Electricidad,
// Ingeniería Mecánica". Ahorra mucho espacio (y hojas). Una carrera sola de su familia
// queda con su nombre completo. El grupo va donde aparece su primera carrera.
// "enLinea": cómo se nombra el grupo dentro de una frase (hoja 1 de Kuder):
// "Ingenierías (Construcción, Electricidad)".
const FAMILIAS_CARRERAS = [
  { re: /^T[eé]cnico de Nivel Superior en\s+/i, etiqueta: "Técnico de Nivel Superior en", enLinea: "Técnico de Nivel Superior" },
  { re: /^T[eé]cnico en\s+/i, etiqueta: "Técnico en", enLinea: "Técnico" },
  { re: /^Ingenier[ií]a Civil(?:\s+en)?\s+/i, etiqueta: "Ingenierías Civiles", enLinea: "Ingenierías Civiles" },
  { re: /^Ingenier[ií]a(?:\s+en)?\s+/i, etiqueta: "Ingenierías", enLinea: "Ingenierías" },
  { re: /^Pedagog[ií]a en\s+/i, etiqueta: "Pedagogías en", enLinea: "Pedagogías" },
  { re: /^Licenciatura en\s+/i, etiqueta: "Licenciaturas en", enLinea: "Licenciaturas" },
  { re: /^Diseño\s+/i, etiqueta: "Diseño", enLinea: "Diseño" },
];

// [{ texto } | { familia, items: [...] }], en el orden de la lista
function agruparCarreras(lista) {
  const familiaDe = (c) => FAMILIAS_CARRERAS.find((f) => f.re.test(c)) || null;
  const cuantas = new Map();
  lista.forEach((c) => {
    const f = familiaDe(c);
    if (f) cuantas.set(f, (cuantas.get(f) || 0) + 1);
  });
  const segmentos = [];
  const grupos = new Map();
  lista.forEach((c) => {
    const f = familiaDe(c);
    if (f && cuantas.get(f) >= 2) {
      if (!grupos.has(f)) {
        const g = { familia: f, items: [] };
        grupos.set(f, g);
        segmentos.push(g);
      }
      grupos.get(f).items.push(c.replace(f.re, ""));
    } else {
      segmentos.push({ texto: c });
    }
  });
  return segmentos;
}

// cada carrera (o grupo) como un punto de la lista
function itemsCarrerasHtml(lista) {
  return agruparCarreras(lista)
    .map((s) => (s.items ? `<li><span class="carrera-familia">${s.familia.etiqueta}:</span> ${s.items.join(", ")}</li>` : `<li>${s.texto}</li>`))
    .join("");
}

// la lista dentro de una frase: "Agronomía, Ingenierías (Construcción, Electricidad), Arquitectura"
function textoCarrerasEnLinea(lista) {
  return agruparCarreras(lista)
    .map((s) => (s.items ? `<span class="carrera-familia">${s.familia.enLinea}</span> (${s.items.join(", ")})` : s.texto))
    .join(", ");
}

// "columnas": la lista va en dos columnas (cuando el cuadro es ancho y trae muchos puntos)
function construirListaBulletsCarreras(lista, { columnas = false } = {}) {
  const { profesionales, tecnicas } = clasificarCarreras(lista);
  const ul = (items) => {
    const n = agruparCarreras(items).length;
    return `<ul class="carreras-lista-bullets${columnas && n >= 6 ? " carreras-lista-2col" : ""}">${itemsCarrerasHtml(items)}</ul>`;
  };
  return `
    ${profesionales.length ? `<div class="carreras-subtitulo">Carreras profesionales</div>${ul(profesionales)}` : ""}
    ${tecnicas.length ? `<div class="carreras-subtitulo">Carreras técnico profesional</div>${ul(tecnicas)}` : ""}`;
}

// ==================== proporción de los dos cuadros de carreras ====================
// En cada tarjeta de área van dos cuadros lado a lado ("Tus Carreras UMAG" y "Otras
// carreras", o en el informe interno "Carreras que UMAG podría incorporar"). Para que
// la tarjeta quede pareja y sin espacio en blanco dentro de los cuadros, el ancho de
// cada uno se elige midiendo: se prueban varias proporciones (y, para listas largas,
// dos columnas) y se usa la que deja la tarjeta más baja y los dos cuadros de alto más
// parecido. Se calcula una sola vez por área y tipo de tarjeta.
const cacheProporcionCarreras = new Map();
const PROPORCIONES_CARRERAS = [1, 1.25, 1.5, 1.75, 2, 2.3, 2.7, 3.2];

// "armarCuadros(flex, columnas)" devuelve el HTML de los dos cuadros (.carreras-mini)
function mejorProporcionCarreras(clave, armarCuadros) {
  if (cacheProporcionCarreras.has(clave)) return cacheProporcionCarreras.get(clave);
  const host = document.getElementById("render-offscreen");
  let mejor = { flex: 1, columnas: false };
  if (host) {
    let mejorPuntaje = null;
    for (const flex of PROPORCIONES_CARRERAS) {
      for (const columnas of flex >= 1.5 ? [false, true] : [false]) {
        host.innerHTML = `<div class="informe-page"><div class="informe-areas" style="margin-top:0;"><div class="area-card"><div class="area-card-carreras-split" style="align-items:flex-start;">${armarCuadros(flex, columnas)}</div></div></div></div>`;
        const cajas = [...host.querySelectorAll(".carreras-mini")].map((c) => c.getBoundingClientRect().height);
        const alto = Math.max(...cajas);
        const diferencia = Math.max(...cajas) - Math.min(...cajas);
        // primero la tarjeta más baja (de a 6 px), después los cuadros más parejos
        const puntaje = [Math.round(alto / 6), diferencia];
        if (!mejorPuntaje || puntaje[0] < mejorPuntaje[0] || (puntaje[0] === mejorPuntaje[0] && puntaje[1] < mejorPuntaje[1])) {
          mejorPuntaje = puntaje;
          mejor = { flex, columnas };
        }
      }
    }
    host.innerHTML = "";
  }
  cacheProporcionCarreras.set(clave, mejor);
  return mejor;
}

// barra morada (pareja, sin degradado) de la primera hoja de todos los informes (de los
// dos tests, individuales, grupales, globales e interno), con los logos 2027 en blanco:
// UMAG arriba a la izquierda y el eslogan "Quédate para llegar más lejos" a la derecha.
// (En los informes grupal, global e interno la credencial de abajo, con el nombre del
// curso o del colegio, ya no lleva el logo: así no se repite en la misma hoja.)
function construirBanner(titulo, subtitulo) {
  const largo = titulo.length > 34;
  return `
    <div class="informe-banner">
      <img src="${LOGO_UMAG_2027_BLANCO}" alt="UMAG · Universidad de Magallanes" class="informe-logo-blanco" />
      <div class="informe-banner-sep"></div>
      <div class="informe-banner-text">
        <div class="informe-banner-sub">Unidad de Admisión y Marketing</div>
        <div class="informe-banner-title${largo ? " informe-banner-title--largo" : ""}">${titulo}</div>
        ${subtitulo ? `<div class="informe-banner-sub2">${subtitulo}</div>` : ""}
      </div>
      <img src="${LOGO_ESLOGAN_2027_BLANCO}" alt="Quédate para llegar más lejos" class="informe-banner-eslogan" />
    </div>`;
}

// cuando esta línea es lo primero de la página (páginas de continuación, sin
// banner encima), se le antepone un espaciador real para que no quede pegada
// al borde de la hoja.
function construirLineaEstudiante(estudiante, { inicioPagina = false } = {}) {
  const numero = calcularNumeroEnGrupo(estudiante);
  const curso = [estudiante.curso, estudiante.letra].filter(Boolean).join(" ");
  return `
    ${inicioPagina ? '<div class="espaciador-inicio-pagina"></div>' : ""}
    ${envolverLineaEstudiante(`
      ${numero ? `<span>N° ${numero}</span>` : ""}
      <span><b>Nombre:</b> ${capitalizarNombre(estudiante.nombre) || "—"}</span>
      <span><b>RUT:</b> ${estudiante.rut || "—"}</span>
      <span><b>Curso:</b> ${curso || "—"}</span>
      <span class="linea-colegio"><b>Colegio:</b> ${estudiante.colegio || "—"}</span>`)}`;
}

// La línea "N° · Nombre · RUT · Curso · Colegio" de arriba de cada hoja va siempre en
// una sola línea, en letra chica. Si con un colegio o nombre largo no cabe, se achica
// un poco la letra (de 11 hasta 9 px); solo si ni así cabe, se corta el final del nombre
// del colegio (que igual aparece completo en la credencial de la hoja de resultados).
const TAMANOS_LINEA_ESTUDIANTE = [
  { letra: 11, separacion: 16 },
  { letra: 10.5, separacion: 14 },
  { letra: 10, separacion: 12 },
  { letra: 9.5, separacion: 10 },
  { letra: 9, separacion: 9 },
];
const cacheEstiloLineaEstudiante = new Map();

function envolverLineaEstudiante(interior) {
  let estilo = cacheEstiloLineaEstudiante.get(interior);
  if (estilo === undefined) {
    estilo = "";
    const host = document.getElementById("render-offscreen");
    if (host) {
      const pagina = document.createElement("div");
      pagina.className = "informe-page";
      const linea = document.createElement("div");
      linea.className = "linea-estudiante";
      linea.innerHTML = interior;
      pagina.appendChild(linea);
      host.appendChild(pagina);
      const colegio = linea.querySelector(".linea-colegio");
      for (const t of TAMANOS_LINEA_ESTUDIANTE) {
        linea.style.fontSize = `${t.letra}px`;
        linea.style.gap = `${t.separacion}px`;
        const cabe = linea.scrollWidth <= linea.clientWidth && (!colegio || colegio.scrollWidth <= colegio.clientWidth);
        estilo = t === TAMANOS_LINEA_ESTUDIANTE[0] ? "" : `font-size:${t.letra}px; gap:${t.separacion}px;`;
        if (cabe) break;
      }
      pagina.remove();
    }
    cacheEstiloLineaEstudiante.set(interior, estilo);
  }
  return `<div class="linea-estudiante"${estilo ? ` style="${estilo}"` : ""}>${interior}</div>`;
}

function construirFooter() {
  return `
    <div class="informe-footer">
      <p>Este resultado es una orientación inicial y no reemplaza un proceso de orientación vocacional completo. Los intereses cambian y se van descubriendo con el tiempo — ¡esto es solo el comienzo!</p>
      <p class="informe-contacto">Unidad de Admisión y Marketing · Ignacio Carrera Pinto 1015, Punta Arenas · Universidad de Magallanes</p>
      <p class="informe-contacto-extra">Contáctanos al <b>+56 9 7499 7771</b> · Más información en <b>admision.umag.cl</b></p>
    </div>`;
}

// ==================== PÁGINA 1: portada ====================

function construirFilaAreaPortadaBullets(area) {
  return `
    <div class="area-fila">
      ${iconoCirculo(area, 42)}
      <div class="area-fila-caja" style="border-left-color:${area.color};">
        <h4 style="color:${area.color};">${area.nombre}</h4>
        <p>${area.descripcionCorta}</p>
        <div class="area-fila-carreras-titulo">Tus Carreras UMAG</div>
        ${construirListaBulletsCarreras(area.carrerasUMAG)}
      </div>
    </div>`;
}

function construirFilaAreaPortadaCompacta(area) {
  return `
    <div class="area-fila">
      ${iconoCirculo(area, 42)}
      <div class="area-fila-caja" style="border-left-color:${area.color};">
        <h4 style="color:${area.color};">${area.nombre}</h4>
        <p>${area.descripcionCorta}</p>
        <div class="area-fila-carreras"><b>Tus Carreras UMAG:</b> ${textoCarrerasEnLinea(area.carrerasUMAG)}.</div>
      </div>
    </div>`;
}

function construirPaginaPortada(estudiante) {
  const contenedor = document.createElement("div");
  contenedor.className = "informe-page";

  const encabezado = `
    ${construirBanner("Informe de Intereses Vocacionales", "Orientando mis Intereses (8° Básico) · UMAG")}
    ${construirLineaEstudiante(estudiante)}

    <div class="informe-intro-texto">
      Este informe presenta los resultados del cuestionario de intereses vocacionales aplicado por personal de la Universidad de Magallanes. A partir de una lista de actividades que podrían ser (o no) de tu interés, exploramos seis grandes áreas vocacionales. No mide inteligencia ni tiene respuestas correctas o incorrectas: es solo un acercamiento a tus posibles intereses. Si el resultado no fue el que esperabas, es normal — pueden aparecer intereses o habilidades en áreas que no sabías que tenías; tómalo como una invitación a explorar, no como un motivo de desánimo. A continuación, todas las carreras que imparte la UMAG en cada una de estas áreas.
    </div>
  `;

  const pie = `
    <div class="callout-siguiente">
      <div class="callout-marker">▽</div>
      <div class="callout-text">Conoce tus resultados<br/>en la página siguiente</div>
      ${puntosDots("callout-dots")}
    </div>
    ${construirFooter()}
  `;

  // se intenta primero el formato con viñetas (profesionales / técnico profesional);
  // si con ese formato la portada no cabe en una sola hoja carta, se usa el formato
  // compacto (carreras en una sola línea separadas por coma).
  const columnaBullets = `<div class="areas-columna">${AREAS.map(construirFilaAreaPortadaBullets).join("")}</div>`;
  const alturaConBullets = medirAlturaFragmento(encabezado + columnaBullets + pie);
  const cabeConBullets = alturaConBullets <= ALTO_PAGINA_PX - PADDING_INFERIOR_PX;

  const columna = cabeConBullets
    ? columnaBullets
    : `<div class="areas-columna">${AREAS.map(construirFilaAreaPortadaCompacta).join("")}</div>`;

  contenedor.innerHTML = `${encabezado}${columna}${pie}`;
  return contenedor;
}

// ==================== PÁGINA(S) 2: resultados personales ====================

// estilo inline con el sello UMAG bien tenue de fondo (html2canvas no resuelve bien
// custom properties CSS dentro de background-image, así que se inyecta directo).
const ESTILO_MARCA_AGUA_SELLO = `background-image:url(${LOGO_SELLO_MARCA_AGUA_DATAURI});background-repeat:no-repeat;`;

// avatar genérico anónimo (silueta simple), mismo estilo a mano que el resto de íconos.
// fill morado porque va sobre un círculo de fondo blanco (ver .id-card-avatar).
const ICONO_AVATAR_ANONIMO = `
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="18" r="8.5" fill="#5b3b8c"/>
    <path d="M7 41c0-9.4 7.6-17 17-17s17 7.6 17 17" fill="#5b3b8c"/>
  </svg>`;

// recuadro tipo "credencial institucional": fondo morado, avatar anónimo genérico,
// y el logo UMAG completo (símbolo + palabra) — ahora que no queda ningún otro
// elemento con la marca UMAG en la página, esta caja hace de encabezado.
function construirCajaEstudiante(estudiante) {
  const numero = calcularNumeroEnGrupo(estudiante);
  return `
    <div class="id-card-wrap">
      <div class="id-card">
        <div class="id-card-avatar">${ICONO_AVATAR_ANONIMO}</div>
        <div class="id-card-datos">
          <div class="id-card-nombre">${numero ? `<span class="id-card-num">N° ${numero}</span>` : ""}${capitalizarNombre(estudiante.nombre) || "—"}</div>
          <div class="id-card-sub">${[estudiante.curso, estudiante.letra].filter(Boolean).join(" ") || "—"} · ${estudiante.colegio || "—"}</div>
          <div class="id-card-sub">RUT: ${estudiante.rut || "—"}</div>
        </div>
        <div class="id-card-logo"><img src="${LOGO_UMAG_DATAURI}" alt="UMAG" /></div>
      </div>
    </div>`;
}

// "flex": cuánto ancho toma el cuadro respecto del otro; "columnas": lista en dos columnas
function construirListaCarreras(titulo, carreras, clase, { flex = 1, columnas = false } = {}) {
  const esUmag = clase === "umag";
  const estilo = [
    esUmag ? `${ESTILO_MARCA_AGUA_SELLO} background-position:center; background-size:110px;` : "",
    flex !== 1 ? `flex:${flex};` : "",
  ].join(" ").trim();
  return `
    <div class="carreras-mini ${clase || ""}" ${estilo ? `style="${estilo}"` : ""}>
      <h5>${titulo}</h5>
      ${construirListaBulletsCarreras(carreras, { columnas })}
    </div>`;
}

// los dos cuadros de carreras de una tarjeta de resultados (los dos tests), con la
// proporción que mejor los empareja
function construirCuadrosCarrerasResultados(clave, area) {
  const armar = (flex, columnas) =>
    construirListaCarreras("Tus Carreras UMAG", area.carrerasUMAG, "umag", { flex, columnas }) + construirListaCarreras("Otras carreras", area.carrerasOtras);
  const { flex, columnas } = mejorProporcionCarreras(clave, armar);
  return armar(flex, columnas);
}

// ==================== informes sin un área destacada (ninguna llegó a 7) ====================
// Se muestran todas las áreas, cada una con "qué es" + una frase sobre su puntaje +
// una invitación. Esa frase del medio se elige con el puntaje REAL del área comparado
// con el de las demás del mismo estudiante (no por el lugar en que aparece la tarjeta):
// - si entre el puntaje más alto y el más bajo hay 1 punto o menos, todas son "media"
//   (puntajes de verdad parejos);
// - si no, las que tienen el puntaje más alto son "alta", las del más bajo "baja" y el
//   resto "media".
// Así nunca se dice que un área quedó pareja o baja cuando estuvo entre las más altas,
// ni al revés. Los sirve a los dos tests (también js/kuder-individual-report.js).
const FRASES_NIVEL_DIVERSO = {
  alta: [
    "En tus respuestas fue una de las áreas con más puntaje, así que podría ser una de las direcciones que más te llaman la atención.",
    "Estuvo entre tus puntajes más altos, por lo que podría ser uno de los caminos que más te interesa explorar.",
  ],
  media: [
    "En tus respuestas quedó en un nivel parecido al de otras áreas, así que podría ser una más entre tus varios intereses.",
    "Su puntaje fue similar al de varias otras áreas, por lo que podría ser parte de tus intereses variados.",
  ],
  baja: [
    "En tus respuestas tuvo menos puntaje que otras áreas, pero eso no la descarta: los intereses cambian y se van descubriendo con el tiempo.",
    "Fue de las áreas con menos puntaje en tus respuestas, aunque eso no significa que no pueda interesarte más adelante.",
  ],
};

function nivelesDiversos(areas, puntajes) {
  const puntaje = (a) => Number(puntajes[a.id]) || 0;
  const valores = areas.map(puntaje);
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const parejo = max - min <= 1;
  const nivel = (a) => (parejo ? "media" : puntaje(a) === max ? "alta" : puntaje(a) === min ? "baja" : "media");
  return { parejo, nivel };
}

// texto de cada área, en el orden en que se muestran (las frases de un mismo nivel se
// van alternando, para que no se repitan tarjeta tras tarjeta)
function descripcionesAreasDiversas(areas, puntajes) {
  const { nivel } = nivelesDiversos(areas, puntajes);
  const usos = { alta: 0, media: 0, baja: 0 };
  return areas.map((a) => {
    const n = nivel(a);
    const frase = FRASES_NIVEL_DIVERSO[n][usos[n]++ % FRASES_NIVEL_DIVERSO[n].length];
    return `${a.diversaQueEs} ${frase} ${a.diversaInvitacion}`;
  });
}

// encabezado de esos informes: "pareja" solo si los puntajes de verdad lo fueron.
// "ordenadas": las tarjetas van de mayor a menor puntaje (en 8° básico; ver
// construirPaginasResultados), y así se le dice al estudiante.
function mensajeSinAreaDestacada(areas, puntajes, { ordenadas = false } = {}) {
  // en positivo: no se le dice que "ninguna área llegó a 7", sino que sus intereses son
  // diversos y que por eso el informe le muestra todas las áreas con sus carreras
  const cuales = ordenadas ? `las ${areas.length} áreas, ordenadas de mayor a menor puntaje,` : `las ${areas.length} áreas`;
  return `Tus puntajes fueron diversos, lo que indica que tienes múltiples áreas de interés. Por eso, en tu informe personal te mostramos en detalle ${cuales} con las carreras que imparte la UMAG y las que imparten otras universidades. Tómalo como una oportunidad para seguir explorando tus intereses:`;
}

// "textoDiverso": sin área destacada, la descripción armada para ese caso
// "espaciosa": más aire interno (misma clase que en Kuder), para las hojas con espacio de sobra
function construirTarjetaArea(area, textoDiverso = null, espaciosa = false) {
  return `
    <div class="area-card${espaciosa ? " kuder-area-card-espaciosa" : ""}" style="border-left-color:${area.color};">
      <div class="area-card-header">
        ${iconoCirculo(area, 42)}
        <h3 style="color:${area.color};">${area.nombre}</h3>
      </div>
      <p class="area-card-desc">${textoDiverso || area.descripcion}</p>
      <div class="area-card-carreras-split">
        ${construirCuadrosCarrerasResultados(`octavo|${area.id}`, area)}
      </div>
    </div>`;
}

// mensaje de la primera página de resultados: en el caso normal dice cuáles son
// las áreas de interés; en los casos especiales (ninguna área destacó, o
// destacaron las 6) se cuenta ese resultado en una frase corta y, sin
// complicarse más, se muestran las 6 áreas igual que si todas hubiesen salido.
function mensajeResultados(estudiante, areas, casoEspecial) {
  if (casoEspecial === "ninguna") return mensajeSinAreaDestacada(areas, estudiante.puntajes, { ordenadas: true });
  if (casoEspecial === "todas") {
    return "¡Tus respuestas destacaron en las 6 áreas! Esto podría indicar que te interesan muchas cosas a la vez. Aquí tienes la información de todas:";
  }
  return `De acuerdo a tus respuestas, ${areas.length === 1 ? "tu área de interés es" : "tus áreas de interés son"}:`;
}

function construirEncabezadoResultados(estudiante, areas, casoEspecial) {
  return `
    ${construirCajaEstudiante(estudiante)}
    <div class="informe-intro"><p>${mensajeResultados(estudiante, areas, casoEspecial)}</p></div>
  `;
}

// encabezado de las páginas de continuación (3ra hoja en adelante): solo la línea de
// nombre/RUT, sin la credencial completa — así, si una hoja se suelta del resto, igual
// se sabe de quién es. La frase de los resultados va solo en la primera hoja de
// resultados (el informe se imprime a doble cara y repetida se vería demasiado).
function construirEncabezadoContinuacion(estudiante) {
  return `
    ${construirLineaEstudiante(estudiante, { inicioPagina: true })}
  `;
}

function construirAvisoContinua() {
  return `<div class="aviso-continua">Continúa en la página siguiente →</div>`;
}

// mide, sin mostrarlo, cuánto espacio vertical (en px CSS, mismo espacio que un
// informe-page de 794px de ancho) ocupa un fragmento de HTML ya renderizado —
// así podemos repartir las tarjetas de área en páginas sin cortar ninguna a la mitad.
function medirAlturaFragmento(html) {
  const host = document.getElementById("render-offscreen");
  host.innerHTML = "";
  const envoltura = document.createElement("div");
  envoltura.className = "informe-page";
  // 1 px de relleno abajo (que después se descuenta): con 0, el margen inferior del
  // último elemento "se escapa" de la medida y la hoja real quedaba unos px más alta
  // de lo calculado
  envoltura.style.paddingBottom = "1px";
  envoltura.innerHTML = html;
  host.appendChild(envoltura);
  const alto = envoltura.getBoundingClientRect().height - 1;
  host.innerHTML = "";
  return alto;
}

// tamaño carta (Letter, 8.5x11in) a 794px de ancho de página: 11/8.5 * 794 ≈ 1027px de alto útil.
const ALTO_PAGINA_PX = 1027;
const PADDING_INFERIOR_PX = 30; // coincide con el padding-bottom de .informe-page
const COSTE_CONTENEDOR_TOP_PX = 10; // margin-top de .informe-areas
const COSTE_GAP_PX = 14; // gap entre tarjetas dentro de .informe-areas

// agrupa los índices de las tarjetas en páginas ("bin packing"), usando un único
// presupuesto de espacio conservador (el más ajustado entre la primera página y
// las de continuación) para que cualquier grupo resultante pueda terminar siendo
// la página 1 sin desbordarse.
//
// Se usa la heurística "first-fit decreasing": se ordenan las áreas de mayor a
// menor altura y cada una se ubica en la primera página donde quepa (si no cabe
// en ninguna, abre una página nueva). Esto es necesario para de verdad encontrar
// parejas: si se recorriera en el orden fijo de las áreas, un área grande al medio
// de dos chicas impediría ver que esas dos chicas sí caben juntas.
//
// Al final se reordenan las páginas para que las que tienen varias tarjetas
// queden primero y las "sueltas" (solas en su página) al final — así el informe
// no se ve desordenado (una sola, y recién después dos juntas). Dentro de cada
// página, y entre páginas de la misma categoría, se respeta el orden original
// de las áreas.
function empaquetarTarjetas(alturas, disponible) {
  const orden = alturas.map((_, i) => i).sort((a, b) => alturas[b] - alturas[a]);
  const costoGrupo = (indices) =>
    indices.reduce((acc, i) => acc + alturas[i], 0) + COSTE_CONTENEDOR_TOP_PX + COSTE_GAP_PX * (indices.length - 1);

  const grupos = [];
  for (const i of orden) {
    const grupo = grupos.find((g) => costoGrupo([...g, i]) <= disponible);
    if (grupo) grupo.push(i);
    else grupos.push([i]);
  }
  grupos.forEach((g) => g.sort((a, b) => a - b));

  const porIndiceInicial = (a, b) => a[0] - b[0];
  const conVarias = grupos.filter((g) => g.length > 1).sort(porIndiceInicial);
  const sueltas = grupos.filter((g) => g.length === 1).sort(porIndiceInicial);
  return [...conVarias, ...sueltas];
}

// Reparte tarjetas en hojas SIN cambiar su orden (para cuando importa el orden, como
// "de mayor a menor puntaje"): la menor cantidad de hojas y, entre los repartos con esa
// cantidad, el que deja menos espacio en blanco en la hoja más vacía (sin contar la
// última). Con pocas tarjetas se pueden revisar todos los cortes posibles.
function cortarEnOrden(alturas, disponiblePrimera, disponibleCont) {
  const costo = (desde, hasta) => {
    let total = COSTE_CONTENEDOR_TOP_PX + COSTE_GAP_PX * (hasta - desde - 1);
    for (let i = desde; i < hasta; i++) total += alturas[i];
    return total;
  };
  const memo = new Map();
  const mejorDesde = (inicio, esPrimera) => {
    if (inicio === alturas.length) return { hojas: 0, peorBlanco: 0, cortes: [] };
    const clave = `${inicio}|${esPrimera}`;
    if (memo.has(clave)) return memo.get(clave);
    const capacidad = esPrimera ? disponiblePrimera : disponibleCont;
    let mejor = null;
    for (let fin = inicio + 1; fin <= alturas.length; fin++) {
      const c = costo(inicio, fin);
      if (c > capacidad && fin > inicio + 1) break; // una tarjeta sola siempre se acepta
      const resto = mejorDesde(fin, false);
      const blanco = fin === alturas.length ? 0 : Math.max(0, capacidad - c);
      const opcion = { hojas: resto.hojas + 1, peorBlanco: Math.max(blanco, resto.peorBlanco), cortes: [fin, ...resto.cortes] };
      if (!mejor || opcion.hojas < mejor.hojas || (opcion.hojas === mejor.hojas && opcion.peorBlanco < mejor.peorBlanco)) mejor = opcion;
    }
    memo.set(clave, mejor);
    return mejor;
  };
  const grupos = [];
  let inicio = 0;
  for (const fin of mejorDesde(0, true).cortes) {
    grupos.push(Array.from({ length: fin - inicio }, (_, k) => inicio + k));
    inicio = fin;
  }
  return grupos;
}

// Reparte las tarjetas de área en hojas probando TODOS los repartos posibles (son
// pocas tarjetas: hasta 7 se revisan todas las combinaciones; con más, ver abajo).
// Se elige, en este orden:
// 1. la menor cantidad de hojas;
// 2. que ninguna hoja que no sea la última quede medio vacía (se minimiza el mayor
//    espacio en blanco de esas hojas): así no queda una hoja con una sola tarjeta y
//    media hoja en blanco seguida de otra llena — si una tarjeta tiene que ir sola, va
//    en la última hoja;
// 3. a igualdad, el reparto que más respeta el orden original (de mayor a menor puntaje).
// La primera hoja de resultados tiene menos espacio (lleva la credencial), y la última
// no lleva el aviso "Continúa en la página siguiente"; cada hoja se calcula con lo suyo.
// "altos": { primera, cont, aviso } = alto del encabezado de la primera hoja, del de
// las siguientes y del aviso del final.
const MARGEN_SEGURIDAD_TARJETAS_PX = 20;
const TRAMO_BLANCO_PX = 60; // dos repartos con blancos parecidos (±60 px) se consideran iguales

function repartirTarjetasEnHojas(alturas, altos, { enOrden = false } = {}) {
  const n = alturas.length;
  if (!n) return [];
  const capacidad = (esPrimera, esUltima) =>
    ALTO_PAGINA_PX - PADDING_INFERIOR_PX - (esPrimera ? altos.primera : altos.cont) - (esUltima ? 0 : altos.aviso) - MARGEN_SEGURIDAD_TARJETAS_PX;
  const costo = (grupo) => grupo.reduce((acc, i) => acc + alturas[i], 0) + COSTE_CONTENEDOR_TOP_PX + COSTE_GAP_PX * (grupo.length - 1);
  // sin cambiar el orden, cuando importa (8° básico sin área destacada: la frase dice
  // que van de mayor a menor puntaje)
  if (enOrden) return cortarEnOrden(alturas, capacidad(true, false), capacidad(false, false));
  // con más de 7 tarjetas (Kuder sin área destacada: las 10 áreas) hay demasiadas
  // combinaciones para revisarlas todas; se usa un cálculo equivalente por grupos
  if (n > 7) return repartirMuchasTarjetas(alturas, capacidad, costo);

  const capMax = Math.max(capacidad(true, true), capacidad(false, true));
  let mejor = null;
  const compara = (a, b) => {
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] - b[k];
    return 0;
  };
  const evaluarOrden = (hojas) => {
    let peorBlanco = 0;
    for (let p = 0; p < hojas.length; p++) {
      const esUltima = p === hojas.length - 1;
      const cap = capacidad(p === 0, esUltima);
      const c = costo(hojas[p]);
      if (hojas[p].length > 1 && c > cap) return; // no cabe (una tarjeta sola siempre se acepta)
      if (!esUltima) peorBlanco = Math.max(peorBlanco, cap - c);
    }
    const lectura = hojas.flat();
    let inversiones = 0;
    for (let i = 0; i < lectura.length; i++) for (let j = i + 1; j < lectura.length; j++) if (lectura[i] > lectura[j]) inversiones++;
    const puntaje = [hojas.length, Math.round(peorBlanco / TRAMO_BLANCO_PX), inversiones, peorBlanco];
    if (!mejor || compara(puntaje, mejor.puntaje) < 0) mejor = { puntaje, hojas: hojas.map((h) => [...h]) };
  };
  // todas las formas de ordenar las hojas de un reparto
  const permutar = (bloques, k = 0) => {
    if (k === bloques.length) return evaluarOrden(bloques);
    for (let i = k; i < bloques.length; i++) {
      [bloques[k], bloques[i]] = [bloques[i], bloques[k]];
      permutar(bloques, k + 1);
      [bloques[k], bloques[i]] = [bloques[i], bloques[k]];
    }
  };
  // todos los repartos de las tarjetas en grupos (cada grupo, en el orden original)
  const asignacion = new Array(n).fill(0);
  const visitar = (i, maxBloque) => {
    if (i === n) {
      const bloques = Array.from({ length: maxBloque + 1 }, () => []);
      asignacion.forEach((b, idx) => bloques[b].push(idx));
      if (bloques.some((b) => b.length > 1 && costo(b) > capMax)) return;
      if (mejor && bloques.length > mejor.puntaje[0]) return;
      permutar(bloques);
      return;
    }
    for (let b = 0; b <= maxBloque + 1; b++) {
      asignacion[i] = b;
      visitar(i + 1, Math.max(maxBloque, b));
    }
  };
  asignacion[0] = 0;
  visitar(1, 0);
  return mejor ? mejor.hojas : alturas.map((_, i) => [i]);
}

// lo mismo que repartirTarjetasEnHojas, para muchas tarjetas: se calcula hoja por hoja
// qué grupo de las tarjetas que faltan conviene poner (menos hojas, sin hojas medio
// vacías al medio y, a igualdad, respetando el orden), recordando lo ya calculado.
function repartirMuchasTarjetas(alturas, capacidad, costo) {
  const n = alturas.length;
  const todas = (1 << n) - 1;
  const indices = (mask) => {
    const r = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) r.push(i);
    return r;
  };
  const costoMask = new Map();
  const costoDe = (mask) => {
    if (!costoMask.has(mask)) costoMask.set(mask, costo(indices(mask)));
    return costoMask.get(mask);
  };
  const compara = (a, b) => {
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] - b[k];
    return 0;
  };
  const memo = new Map();
  const mejorDesde = (resto, esPrimera) => {
    if (resto === 0) return { puntaje: [0, 0, 0, 0], hojas: [] };
    const clave = resto * 2 + (esPrimera ? 1 : 0);
    if (memo.has(clave)) return memo.get(clave);
    let mejor = null;
    // cada grupo posible de las tarjetas que faltan, como la hoja que sigue
    for (let sub = resto; sub > 0; sub = (sub - 1) & resto) {
      const esUltima = sub === resto;
      const cap = capacidad(esPrimera, esUltima);
      const c = costoDe(sub);
      const sola = (sub & (sub - 1)) === 0;
      if (!sola && c > cap) continue;
      const despues = mejorDesde(resto & ~sub, false);
      const blanco = esUltima ? 0 : Math.max(0, cap - c);
      let inversiones = 0;
      for (let i = 0; i < n; i++) {
        if (!(sub & (1 << i))) continue;
        for (let j = 0; j < i; j++) if (resto & ~sub & (1 << j)) inversiones++;
      }
      const peor = Math.max(blanco, despues.puntaje[3]);
      const puntaje = [despues.puntaje[0] + 1, Math.round(peor / TRAMO_BLANCO_PX), despues.puntaje[2] + inversiones, peor];
      if (!mejor || compara(puntaje, mejor.puntaje) < 0) mejor = { puntaje, hojas: [indices(sub), ...despues.hojas] };
    }
    memo.set(clave, mejor);
    return mejor;
  };
  return mejorDesde(todas, true).hojas;
}

function construirPaginasResultados(estudiante) {
  const areasInteres = calcularAreasDeInteres(estudiante.puntajes);
  // caso especial: ninguna área destacó, o destacaron absolutamente todas — en ambos
  // casos no hay un foco claro, así que en vez de complicarse con una página distinta,
  // se arma el informe normal mostrando las 6 áreas (como si todas fueran de interés),
  // con una frase corta al principio contando qué pasó.
  let casoEspecial = null;
  if (areasInteres.length === 0) casoEspecial = "ninguna";
  else if (areasInteres.length === AREAS.length) casoEspecial = "todas";
  // sin área destacada, las 6 áreas van de mayor a menor puntaje (a igual puntaje, en
  // el orden normal) y se reparten en hojas sin cambiar ese orden (cortarEnOrden):
  // medido con muchas combinaciones de puntajes, así nunca quedan más hojas ni más
  // espacio en blanco que repartiéndolas por tamaño
  const puntaje = (a) => Number(estudiante.puntajes[a.id]) || 0;
  const areas =
    casoEspecial === "ninguna"
      ? [...AREAS].sort((a, b) => puntaje(b) - puntaje(a) || AREAS.indexOf(a) - AREAS.indexOf(b))
      : casoEspecial
        ? AREAS
        : areasInteres;

  const htmlEncabezado = construirEncabezadoResultados(estudiante, areas, casoEspecial);
  const htmlEncabezadoCont = construirEncabezadoContinuacion(estudiante);
  const htmlAviso = construirAvisoContinua();
  const textosDiversos = casoEspecial === "ninguna" ? descripcionesAreasDiversas(areas, estudiante.puntajes) : [];
  const htmlTarjetas = areas.map((a, i) => construirTarjetaArea(a, textosDiversos[i] || null));
  const htmlTarjetasEspaciosas = areas.map((a, i) => construirTarjetaArea(a, textosDiversos[i] || null, true));

  const altoEncabezado = medirAlturaFragmento(htmlEncabezado);
  const altoEncabezadoCont = medirAlturaFragmento(htmlEncabezadoCont);
  // la última página no lleva nada al final (ya no hay pie de página); solo las
  // páginas intermedias necesitan espacio reservado para el aviso de "continúa".
  const altoReservaInferior = medirAlturaFragmento(htmlAviso);
  const alturasTarjetas = htmlTarjetas.map((html) =>
    medirAlturaFragmento(`<div class="informe-areas" style="margin-top:0;">${html}</div>`)
  );

  // reparto de las tarjetas en hojas (ver repartirTarjetasEnHojas): sin área destacada,
  // las 6 áreas van de mayor a menor puntaje (así lo dice la frase de arriba), así que
  // se reparten sin cambiar ese orden
  const grupos = repartirTarjetasEnHojas(
    alturasTarjetas,
    { primera: altoEncabezado, cont: altoEncabezadoCont, aviso: altoReservaInferior },
    { enOrden: casoEspecial === "ninguna" }
  );

  // el presupuesto de arriba es una estimación (suma de fragmentos medidos por
  // separado); antes de armar las páginas de verdad, se arma cada grupo tal cual
  // va a quedar y se mide su alto real. Si algún grupo igual quedó más alto que
  // una hoja (la estimación se quedó corta), se le saca la última tarjeta y pasa
  // a la página siguiente, repitiendo hasta que todas las páginas quepan de
  // verdad — así no depende de que la estimación sea perfecta.
  const LIMITE_PAGINA_PX = ALTO_PAGINA_PX - PADDING_INFERIOR_PX;
  function armarHtmlPagina(indices, esPrimera, esUltima, tarjetas = htmlTarjetas) {
    return `
      ${esPrimera ? htmlEncabezado : htmlEncabezadoCont}
      <div class="informe-areas">${indices.map((i) => tarjetas[i]).join("")}</div>
      ${esUltima ? "" : htmlAviso}
    `;
  }
  for (let i = 0; i < grupos.length; i++) {
    let intentos = 0;
    while (grupos[i].length > 1 && intentos < 10) {
      const esPrimera = i === 0;
      const esUltima = i === grupos.length - 1;
      const alto = medirAlturaFragmento(armarHtmlPagina(grupos[i], esPrimera, esUltima));
      if (alto <= LIMITE_PAGINA_PX) break;
      const sobrante = grupos[i].pop();
      if (i + 1 < grupos.length) {
        grupos[i + 1].unshift(sobrante);
      } else {
        grupos.push([sobrante]);
      }
      intentos++;
    }
  }

  return grupos.map((indices, idx) => {
    const esPrimera = idx === 0;
    const esUltima = idx === grupos.length - 1;
    // en una hoja con espacio de sobra, las tarjetas van en la versión "espaciosa" (más
    // aire interno), para no dejar un espacio en blanco al final; solo si de verdad cabe
    let html = armarHtmlPagina(indices, esPrimera, esUltima);
    const htmlEspacioso = armarHtmlPagina(indices, esPrimera, esUltima, htmlTarjetasEspaciosas);
    if (medirAlturaFragmento(htmlEspacioso) <= LIMITE_PAGINA_PX) html = htmlEspacioso;
    const contenedor = document.createElement("div");
    contenedor.className = "informe-page";
    contenedor.innerHTML = html;
    return contenedor;
  });
}

// ==================== exportación a PDF ====================

// hasta 6% más alta que la hoja: se achica para que quepa (no se nota); más que eso,
// se reparte en varias hojas (no debería pasar: el reparto de contenido lo evita)
const TOLERANCIA_AJUSTE_HOJA = 1.06;

async function paginasAPdfBlob(paginas) {
  // se monta cada página temporalmente fuera de la vista, se captura, y se agrega al PDF;
  // si una página igual queda más larga que una hoja carta (caso extremo), se reparte en
  // varias hojas como respaldo — pero el empaquetado por tarjetas ya evita que esto pase
  // en el uso normal.
  const host = document.getElementById("render-offscreen");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  let esPrimeraHoja = true;

  for (const nodo of paginas) {
    host.innerHTML = "";
    host.appendChild(nodo);

    const canvas = await html2canvas(nodo, { scale: 2, backgroundColor: "#ffffff" });
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pageH) {
      if (!esPrimeraHoja) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, imgW, imgH);
      esPrimeraHoja = false;
    } else if (imgH <= pageH * TOLERANCIA_AJUSTE_HOJA) {
      // apenas más alta que la hoja (unos pocos px, por redondeos al medir): se achica
      // un poco para que quepa entera. Si se partiera, el sobrante quedaría solo en una
      // hoja nueva, casi en blanco.
      const factor = pageH / imgH;
      if (!esPrimeraHoja) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", (pageW - imgW * factor) / 2, 0, imgW * factor, pageH);
      esPrimeraHoja = false;
    } else {
      let restante = canvas.height;
      let offsetY = 0;
      const pxPorPagina = (pageH * canvas.width) / imgW;
      while (restante > 0) {
        const trozoAlto = Math.min(pxPorPagina, restante);
        const trozoCanvas = document.createElement("canvas");
        trozoCanvas.width = canvas.width;
        trozoCanvas.height = trozoAlto;
        const ctx = trozoCanvas.getContext("2d");
        ctx.drawImage(canvas, 0, offsetY, canvas.width, trozoAlto, 0, 0, canvas.width, trozoAlto);
        const trozoData = trozoCanvas.toDataURL("image/jpeg", 0.95);
        if (!esPrimeraHoja) pdf.addPage();
        pdf.addImage(trozoData, "JPEG", 0, 0, imgW, (trozoAlto * imgW) / canvas.width);
        esPrimeraHoja = false;
        offsetY += trozoAlto;
        restante -= trozoAlto;
      }
    }
  }

  host.innerHTML = "";
  return pdf.output("blob");
}

// "01 - Nombre Alumno - 8vo A - Colegio.pdf" (ver nombreArchivoNumerado)
function nombreArchivoInforme(estudiante) {
  return nombreArchivoNumerado(estudiante, numeracionEnGrupo(typeof store === "undefined" ? null : store, estudiante));
}

async function descargarInformeIndividual(estudiante) {
  const paginas = [construirPaginaPortada(estudiante), ...construirPaginasResultados(estudiante)];
  const blob = await paginasAPdfBlob(paginas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoInforme(estudiante);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  if (typeof store !== "undefined" && store.registrarInformeGenerado) store.registrarInformeGenerado();
}

// el ZIP de un curso se llama igual que su carpeta: "8VO_Colegio_8vo_A_2026.zip"
function nombreArchivoZip(estudiantes) {
  return `${nombreCarpetaCurso("8VO", estudiantes)}.zip`;
}

// agrega a "carpeta" (el ZIP completo o una subcarpeta de él) el informe de cada
// estudiante, numerados del 1 al total; la usan la descarga de un curso y la de
// "todos los cursos" (js/app.js)
async function agregarInformesACarpeta(carpeta, estudiantes, alTerminarUno) {
  const usados = new Map();
  for (const e of numerarParaCarpeta(estudiantes)) {
    const paginas = [construirPaginaPortada(e), ...construirPaginasResultados(e)];
    const blob = await paginasAPdfBlob(paginas);
    let nombre = nombreArchivoInforme(e);
    const veces = usados.get(nombre) || 0;
    usados.set(nombre, veces + 1);
    if (veces > 0) nombre = nombre.replace(/\.pdf$/, `_${veces + 1}.pdf`);
    carpeta.file(nombre, blob);
    if (typeof store !== "undefined" && store.registrarInformeGenerado) store.registrarInformeGenerado();
    if (alTerminarUno) alTerminarUno();
  }
}

async function descargarInformesMasivo(estudiantes, onProgreso) {
  const zip = new JSZip();
  let hechos = 0;
  await agregarInformesACarpeta(zip, estudiantes, () => onProgreso && onProgreso(++hechos, estudiantes.length));

  const contenidoZip = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(contenidoZip);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoZip(estudiantes);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
