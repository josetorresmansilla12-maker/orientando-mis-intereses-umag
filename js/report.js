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

// clase "--inicio" cuando esta línea es lo primero de la página (páginas de
// continuación, sin banner encima) — le da más aire arriba para que no quede
// pegada al borde de la hoja.
function construirLineaEstudiante(estudiante, { inicioPagina = false } = {}) {
  return `
    <div class="linea-estudiante${inicioPagina ? " linea-estudiante--inicio" : ""}">
      <span><b>Nombre:</b> ${capitalizarNombre(estudiante.nombre) || "—"}</span>
      <span><b>RUT:</b> ${estudiante.rut || "—"}</span>
    </div>`;
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
  return `
    <div class="id-card-wrap">
      <div class="id-card">
        <div class="id-card-avatar">${ICONO_AVATAR_ANONIMO}</div>
        <div class="id-card-datos">
          <div class="id-card-nombre">${capitalizarNombre(estudiante.nombre) || "—"}</div>
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

function construirEncabezadoResultados(estudiante, areas) {
  return `
    ${construirCajaEstudiante(estudiante)}
    <div class="informe-intro"><p>De acuerdo a tus respuestas, ${areas.length === 1 ? "tu área de interés es" : "tus áreas de interés son"}:</p></div>
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

// carreras "equivalentes" en otras instituciones, en una lista corta (una por área,
// bastante más corta que el listado completo de la UMAG) — solo para el caso especial
// de intereses diversos (ninguna área destacó, o destacaron todas).
function construirOtrasCarrerasCurada() {
  const items = AREAS.map((a) => a.carrerasOtras[0]).filter(Boolean);
  return `
    <div class="otras-curadas">
      <h5>Algunas carreras equivalentes en otras instituciones</h5>
      <ul class="carreras-lista-bullets">${items.map((c) => `<li>${c}</li>`).join("")}</ul>
    </div>`;
}

function construirPaginaCasoEspecial(estudiante) {
  const contenedor = document.createElement("div");
  contenedor.className = "informe-page";
  contenedor.innerHTML = `
    ${construirCajaEstudiante(estudiante)}
    <div class="mensaje-generico"><h3>${MENSAJE_SIN_AREA.titulo}</h3><p>${MENSAJE_SIN_AREA.texto}</p></div>
    <div class="informe-intro"><p>Estas son todas las carreras que imparte la UMAG:</p></div>
    <div class="areas-columna">${AREAS.map(construirFilaAreaPortadaCompacta).join("")}</div>
    ${construirOtrasCarrerasCurada()}
  `;
  return contenedor;
}

function construirPaginasResultados(estudiante) {
  const areas = calcularAreasDeInteres(estudiante.puntajes);
  // caso especial: ninguna área destacó, o destacaron absolutamente todas — en ambos
  // casos no hay un foco claro, así que en vez de tarjetas por área se muestra un
  // resumen compacto con todas las carreras UMAG.
  const esCasoEspecial = areas.length === 0 || areas.length === AREAS.length;

  if (esCasoEspecial) {
    const pagina = construirPaginaCasoEspecial(estudiante);
    const altura = medirAlturaFragmento(pagina.innerHTML);
    if (altura <= ALTO_PAGINA_PX - PADDING_INFERIOR_PX) {
      return [pagina];
    }
    // si no cupo todo en una hoja, se reparte en dos: mensaje en la primera,
    // carreras y pie en la segunda (con encabezado liviano de continuación).
    const paginaUno = document.createElement("div");
    paginaUno.className = "informe-page";
    paginaUno.innerHTML = `
      ${construirCajaEstudiante(estudiante)}
      <div class="mensaje-generico"><h3>${MENSAJE_SIN_AREA.titulo}</h3><p>${MENSAJE_SIN_AREA.texto}</p></div>
      ${construirAvisoContinua()}
    `;
    const paginaDos = document.createElement("div");
    paginaDos.className = "informe-page";
    paginaDos.innerHTML = `
      ${construirLineaEstudiante(estudiante, { inicioPagina: true })}
      <div class="informe-intro"><p>Estas son todas las carreras que imparte la UMAG:</p></div>
      <div class="areas-columna">${AREAS.map(construirFilaAreaPortadaCompacta).join("")}</div>
      ${construirOtrasCarrerasCurada()}
    `;
    return [paginaUno, paginaDos];
  }

  const htmlEncabezado = construirEncabezadoResultados(estudiante, areas);
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

  return grupos.map((indices, idx) => {
    const esPrimera = idx === 0;
    const esUltima = idx === grupos.length - 1;
    const contenedor = document.createElement("div");
    contenedor.className = "informe-page";
    contenedor.innerHTML = `
      ${esPrimera ? htmlEncabezado : htmlEncabezadoCont}
      <div class="informe-areas">${indices.map((i) => htmlTarjetas[i]).join("")}</div>
      ${esUltima ? "" : htmlAviso}
    `;
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

function nombreArchivoInforme(estudiante) {
  const limpiar = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const nombre = limpiar(estudiante.nombre) || "estudiante";
  const curso = limpiar((estudiante.curso || "") + (estudiante.letra || ""));
  return `Informe_${nombre}${curso ? "_" + curso : ""}.pdf`;
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

function nombreArchivoZip(estudiantes) {
  const limpiar = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const colegios = [...new Set(estudiantes.map((e) => e.colegio).filter(Boolean))];
  const cursos = [...new Set(estudiantes.map((e) => (e.curso || "") + (e.letra || "")).filter(Boolean))];
  const colegio = colegios.length === 1 ? limpiar(colegios[0]) : "VariosColegios";
  const curso = cursos.length === 1 ? limpiar(cursos[0]) : "VariosCursos";
  const fecha = new Date().toISOString().slice(0, 10);
  return `Informes_${colegio}_${curso}_${fecha}.zip`;
}

async function descargarInformesMasivo(estudiantes, onProgreso) {
  const zip = new JSZip();
  const usados = new Map();

  for (let i = 0; i < estudiantes.length; i++) {
    const e = estudiantes[i];
    const paginas = [construirPaginaPortada(e), ...construirPaginasResultados(e)];
    const blob = await paginasAPdfBlob(paginas);
    let nombre = nombreArchivoInforme(e);
    const veces = usados.get(nombre) || 0;
    usados.set(nombre, veces + 1);
    if (veces > 0) nombre = nombre.replace(/\.pdf$/, `_${veces + 1}.pdf`);
    zip.file(nombre, blob);
    if (typeof store !== "undefined" && store.registrarInformeGenerado) store.registrarInformeGenerado();
    if (onProgreso) onProgreso(i + 1, estudiantes.length);
  }

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
