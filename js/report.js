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
// Carpeta (o ZIP) de un curso: "KUDER_Colegio_Alfa_SegundoC_2026-10-02" ("8VO_..." en 8°).
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

// fecha de hoy (del computador, no en hora UTC) para los nombres: 2026-10-02
function fechaParaArchivo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nombreColegioParaCarpeta(estudiantes) {
  const colegios = [...new Set(estudiantes.map((e) => e.colegio).filter(Boolean))];
  return colegios.length === 1 ? limpiarParaCarpeta(colegios[0]) || "Colegio" : colegios.length ? "VariosColegios" : "SinColegio";
}

function nombreCarpetaCurso(prefijo, estudiantes) {
  const cursos = [...new Set(estudiantes.map((e) => (e.curso || "") + (e.letra || "")).filter(Boolean))];
  const curso = cursos.length === 1 ? limpiarParaCarpeta(cursos[0]) || "Curso" : cursos.length ? "VariosCursos" : "SinCurso";
  return `${prefijo}_${nombreColegioParaCarpeta(estudiantes)}_${curso}_${fechaParaArchivo()}`;
}

// ZIP con varios cursos (una carpeta por curso adentro)
function nombreZipVariosCursos(prefijo, estudiantes, nCursos) {
  return `${prefijo}_${nombreColegioParaCarpeta(estudiantes)}_${nCursos}cursos_${fechaParaArchivo()}.zip`;
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

function construirListaBulletsCarreras(lista) {
  const { profesionales, tecnicas } = clasificarCarreras(lista);
  return `
    ${
      profesionales.length
        ? `<div class="carreras-subtitulo">Carreras profesionales</div><ul class="carreras-lista-bullets">${profesionales.map((c) => `<li>${c}</li>`).join("")}</ul>`
        : ""
    }
    ${
      tecnicas.length
        ? `<div class="carreras-subtitulo">Carreras técnico profesional</div><ul class="carreras-lista-bullets">${tecnicas.map((c) => `<li>${c}</li>`).join("")}</ul>`
        : ""
    }`;
}

function construirBanner(titulo, subtitulo) {
  return `
    <div class="informe-banner">
      <div class="banner-wave banner-wave-1"></div>
      <div class="banner-wave banner-wave-2"></div>
      <div class="informe-logo-badge"><img src="${LOGO_UMAG_DATAURI}" alt="UMAG" class="informe-logo" /></div>
      <div class="informe-banner-sep"></div>
      <div class="informe-banner-text">
        <div class="informe-banner-sub">Unidad de Admisión y Marketing</div>
        <div class="informe-banner-title">${titulo}</div>
        ${subtitulo ? `<div class="informe-banner-sub2">${subtitulo}</div>` : ""}
      </div>
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
        <div class="area-fila-carreras"><b>Tus Carreras UMAG:</b> ${area.carrerasUMAG.join(", ")}.</div>
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
          <div class="id-card-sub">${(estudiante.curso || "—") + (estudiante.letra || "")} · ${estudiante.colegio || "—"}</div>
          <div class="id-card-sub">RUT: ${estudiante.rut || "—"}</div>
        </div>
        <div class="id-card-logo"><img src="${LOGO_UMAG_DATAURI}" alt="UMAG" /></div>
      </div>
    </div>`;
}

function construirListaCarreras(titulo, carreras, clase) {
  const esUmag = clase === "umag";
  const estiloFondo = esUmag
    ? `style="${ESTILO_MARCA_AGUA_SELLO} background-position:center; background-size:110px;"`
    : "";
  return `
    <div class="carreras-mini ${clase || ""}" ${estiloFondo}>
      <h5>${titulo}</h5>
      ${construirListaBulletsCarreras(carreras)}
    </div>`;
}

function construirTarjetaArea(area) {
  return `
    <div class="area-card" style="border-left-color:${area.color};">
      <div class="area-card-header">
        ${iconoCirculo(area, 42)}
        <h3 style="color:${area.color};">${area.nombre}</h3>
      </div>
      <p class="area-card-desc">${area.descripcion}</p>
      <div class="area-card-carreras-split">
        ${construirListaCarreras("Tus Carreras UMAG", area.carrerasUMAG, "umag")}
        ${construirListaCarreras("Otras carreras", area.carrerasOtras)}
      </div>
    </div>`;
}

// mensaje de la primera página de resultados: en el caso normal dice cuáles son
// las áreas de interés; en los casos especiales (ninguna área destacó, o
// destacaron las 6) se cuenta ese resultado en una frase corta y, sin
// complicarse más, se muestran las 6 áreas igual que si todas hubiesen salido.
function construirEncabezadoResultados(estudiante, areas, casoEspecial) {
  let mensaje;
  if (casoEspecial === "ninguna") {
    mensaje = "Tus puntajes fueron muy diversos en todas las áreas (y eso también dice algo bueno de ti: tienes intereses variados). Aquí te mostramos las 6 áreas, para que sigas conociendo tus opciones:";
  } else if (casoEspecial === "todas") {
    mensaje = "¡Te interesan las 6 áreas! Aquí tienes toda la información:";
  } else {
    mensaje = `De acuerdo a tus respuestas, ${areas.length === 1 ? "tu área de interés es" : "tus áreas de interés son"}:`;
  }
  return `
    ${construirCajaEstudiante(estudiante)}
    <div class="informe-intro"><p>${mensaje}</p></div>
  `;
}

// encabezado liviano para páginas de continuación (3ra hoja en adelante): solo la
// línea de nombre/RUT, sin la credencial completa — así, si una hoja se suelta del
// resto, igual se sabe de quién es, sin ocupar tanto espacio como la credencial.
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
  envoltura.style.paddingBottom = "0";
  envoltura.innerHTML = html;
  host.appendChild(envoltura);
  const alto = envoltura.getBoundingClientRect().height;
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

function construirPaginasResultados(estudiante) {
  const areasInteres = calcularAreasDeInteres(estudiante.puntajes);
  // caso especial: ninguna área destacó, o destacaron absolutamente todas — en ambos
  // casos no hay un foco claro, así que en vez de complicarse con una página distinta,
  // se arma el informe normal mostrando las 6 áreas (como si todas fueran de interés),
  // con una frase corta al principio contando qué pasó.
  let casoEspecial = null;
  if (areasInteres.length === 0) casoEspecial = "ninguna";
  else if (areasInteres.length === AREAS.length) casoEspecial = "todas";
  const areas = casoEspecial ? AREAS : areasInteres;

  const htmlEncabezado = construirEncabezadoResultados(estudiante, areas, casoEspecial);
  const htmlEncabezadoCont = construirEncabezadoContinuacion(estudiante);
  const htmlAviso = construirAvisoContinua();
  const htmlTarjetas = areas.map(construirTarjetaArea);

  const altoEncabezado = medirAlturaFragmento(htmlEncabezado);
  const altoEncabezadoCont = medirAlturaFragmento(htmlEncabezadoCont);
  // la última página no lleva nada al final (ya no hay pie de página); solo las
  // páginas intermedias necesitan espacio reservado para el aviso de "continúa".
  const altoReservaInferior = medirAlturaFragmento(htmlAviso);
  const alturasTarjetas = htmlTarjetas.map((html) =>
    medirAlturaFragmento(`<div class="informe-areas" style="margin:0;">${html}</div>`)
  );

  // margen de seguridad: las alturas se miden por partes por separado (encabezado,
  // tarjetas, pie) y luego se suman, así que pequeñas diferencias de redondeo entre
  // esa medición y el armado final pueden acumularse — este margen evita que eso
  // empuje el contenido a una hoja extra casi vacía.
  const MARGEN_SEGURIDAD_PX = 20;
  const disponiblePrimera = ALTO_PAGINA_PX - PADDING_INFERIOR_PX - altoEncabezado - altoReservaInferior - MARGEN_SEGURIDAD_PX;
  const disponibleCont = ALTO_PAGINA_PX - PADDING_INFERIOR_PX - altoEncabezadoCont - altoReservaInferior - MARGEN_SEGURIDAD_PX;

  const grupos = empaquetarTarjetas(alturasTarjetas, Math.min(disponiblePrimera, disponibleCont));

  // el presupuesto de arriba es una estimación (suma de fragmentos medidos por
  // separado); antes de armar las páginas de verdad, se arma cada grupo tal cual
  // va a quedar y se mide su alto real. Si algún grupo igual quedó más alto que
  // una hoja (la estimación se quedó corta), se le saca la última tarjeta y pasa
  // a la página siguiente, repitiendo hasta que todas las páginas quepan de
  // verdad — así no depende de que la estimación sea perfecta.
  const LIMITE_PAGINA_PX = ALTO_PAGINA_PX - PADDING_INFERIOR_PX;
  function armarHtmlPagina(indices, esPrimera, esUltima) {
    return `
      ${esPrimera ? htmlEncabezado : htmlEncabezadoCont}
      <div class="informe-areas">${indices.map((i) => htmlTarjetas[i]).join("")}</div>
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
    const contenedor = document.createElement("div");
    contenedor.className = "informe-page";
    contenedor.innerHTML = armarHtmlPagina(indices, esPrimera, esUltima);
    return contenedor;
  });
}

// ==================== exportación a PDF ====================

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

// el ZIP de un curso se llama igual que su carpeta: "8VO_Colegio_8voA_2026-10-02.zip"
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
