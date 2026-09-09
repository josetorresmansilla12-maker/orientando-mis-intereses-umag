// Informe GRUPAL (por curso) del Test Vocacional de Kuder, dirigido a los orientadores
// del colegio — no a los estudiantes (los informes individuales quedan para una etapa
// futura). Reutiliza el motor de paginación/PDF y varias clases CSS ya usadas por el
// informe de 8° básico (js/report.js, css/styles.css) porque son genéricas y así se
// mantiene el mismo formato visual, pero es un módulo aparte: no modifica ni depende
// de datos propios de ese cuestionario (áreas, ids, colores distintos).
//
// Estructura del PDF: página 1 = resumen del curso (datos generales + resumen de las
// 10 áreas en una grilla de barras, todo en una sola hoja); páginas siguientes = una
// tarjeta por cada una de las 10 áreas de Kuder, con cuántos estudiantes del curso la
// tienen como interés y las carreras UMAG / otras carreras asociadas.
//
// Con 2 o más cursos hay dos formas de generar el PDF (ver js/kuder.js):
// - Informe GLOBAL (generarInformeGlobalKuderPdf): un solo PDF que suma los cursos.
// - Informes POR CURSO (generarInformesPorCursoKuderZip): un PDF de informe grupal
//   por cada curso (construirBlobInformeGrupalKuder), entregados juntos en un ZIP.

const ICONO_GRUPO_KUDER = `
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="17" cy="17" r="6" fill="#5b3b8c"/>
    <circle cx="31" cy="17" r="6" fill="#5b3b8c"/>
    <path d="M4 40c0-7 6-12 13-12s13 5 13 12" fill="#5b3b8c"/>
    <path d="M22 40c0-6 5-11 12-11s12 5 12 11" fill="#5b3b8c" opacity="0.5"/>
  </svg>`;

// formatea "YYYY-MM-DD" (lo que entrega un <input type="date">) a "DD-MM-YYYY"
// parseando los componentes a mano, en vez de `new Date(iso)` — así se evita que el
// desfase entre UTC y la zona horaria local corra la fecha un día hacia atrás (le
// pasa a fmtFecha() de js/report.js con zonas horarias negativas, como la de Chile).
function fmtFechaKuder(isoDate) {
  if (!isoDate) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const [, y, mo, d] = m;
  return `${d}-${mo}-${y}`;
}

function iconoCirculoKuder(area, tamano) {
  return `<div class="icon-circle" style="background:${area.color}; width:${tamano}px; height:${tamano}px;">${ICONOS_SVG_KUDER[area.id] || ""}</div>`;
}

// credencial del curso (equivalente grupal a la credencial de un estudiante del
// informe de 8°), con la misma clase .id-card — mismo diseño, otro contenido.
function construirCajaCursoKuder(datosCurso, totalEstudiantes) {
  return `
    <div class="id-card-wrap">
      <div class="id-card">
        <div class="id-card-avatar">${ICONO_GRUPO_KUDER}</div>
        <div class="id-card-datos">
          <div class="id-card-nombre">${datosCurso.colegio || "—"} · ${(datosCurso.curso || "—") + (datosCurso.letra || "")}</div>
          <div class="id-card-sub">${totalEstudiantes} ${totalEstudiantes === 1 ? "estudiante evaluado" : "estudiantes evaluados"}</div>
          ${datosCurso.fecha ? `<div class="id-card-sub">Fecha de aplicación: ${fmtFechaKuder(datosCurso.fecha)}</div>` : ""}
        </div>
        <div class="id-card-logo"><img src="${LOGO_UMAG_DATAURI}" alt="UMAG" /></div>
      </div>
    </div>`;
}

// línea liviana de curso/colegio para el encabezado de las páginas de continuación
// (2da hoja de áreas en adelante) — mismo espíritu que construirLineaEstudiante.
function construirLineaCursoKuder(datosCurso) {
  return `
    <div class="espaciador-inicio-pagina"></div>
    <div class="linea-estudiante">
      <span><b>Colegio:</b> ${datosCurso.colegio || "—"}</span>
      <span><b>Curso:</b> ${(datosCurso.curso || "—") + (datosCurso.letra || "")}</span>
    </div>`;
}

function construirIntroKuder() {
  return `
    <div class="informe-intro-texto kuder-intro-texto">
      Este informe resume los resultados del Test Vocacional de Kuder aplicado a este curso. Por cada una de las 10 áreas se indica cuántos estudiantes la tienen como área de interés (puntaje 7 o más) y las carreras UMAG y de otras instituciones asociadas a ese perfil — como apoyo para el proceso de orientación vocacional y para la elección del electivo o diferenciado de 3° medio.
    </div>`;
}

// 8 recuadros en total: los primeros 4 son cifras simples (una sola línea de texto en
// la etiqueta); los otros 4 nombran un área específica y su cifra entre paréntesis, así
// que van con el doble de ancho (.kuder-stat-ancho) para que ese texto más largo — el
// caso reportado fue "Servicio Social ... (14, 25%)" — tenga espacio de sobra y no
// necesite cortarse ni cambiar de línea a media palabra.
function construirStatsKuder(estudiantes, conteos, total) {
  const areasPorEstudiante = estudiantes.map((e) => calcularAreasDeInteresKuder(e.puntajes).length);
  const sinArea = areasPorEstudiante.filter((n) => n === 0).length;
  const conArea = total - sinArea;
  const pctConArea = total > 0 ? Math.round((conArea / total) * 100) : 0;
  const con3oMas = areasPorEstudiante.filter((n) => n >= 3).length;
  const pct3oMas = total > 0 ? Math.round((con3oMas / total) * 100) : 0;
  const promedio = total > 0 ? (areasPorEstudiante.reduce((acc, n) => acc + n, 0) / total).toFixed(1) : "0.0";

  const areasOrdenadas = [...AREAS_KUDER].sort((a, b) => (conteos[b.id] || 0) - (conteos[a.id] || 0));
  const fmtArea = (area) => {
    const c = area ? conteos[area.id] || 0 : 0;
    const pct = total > 0 ? Math.round((c / total) * 100) : 0;
    return { nombre: area ? area.nombre : "—", c, pct };
  };
  const top1 = fmtArea(areasOrdenadas[0]);
  const top2 = fmtArea(areasOrdenadas[1]);
  const ultima = fmtArea(areasOrdenadas[areasOrdenadas.length - 1]);

  return `
    <div class="stats-grid kuder-stats-wrap">
      <div class="stat-card"><div class="num">${total}</div><div class="lbl">Estudiantes evaluados</div></div>
      <div class="stat-card"><div class="num">${sinArea}</div><div class="lbl">Sin área de interés clara</div></div>
      <div class="stat-card"><div class="num">${conArea}</div><div class="lbl">Con al menos un área de interés (${pctConArea}%)</div></div>
      <div class="stat-card"><div class="num">${promedio}</div><div class="lbl">Áreas de interés promedio por estudiante (de ${AREAS_KUDER.length} en total)</div></div>
      <div class="stat-card kuder-stat-ancho"><div class="num kuder-stat-num-area">${top1.nombre}</div><div class="lbl">Área más elegida (${top1.c}, ${top1.pct}%)</div></div>
      <div class="stat-card kuder-stat-ancho"><div class="num kuder-stat-num-area">${top2.nombre}</div><div class="lbl">Segunda área más elegida (${top2.c}, ${top2.pct}%)</div></div>
      <div class="stat-card kuder-stat-ancho"><div class="num kuder-stat-num-area">${ultima.nombre}</div><div class="lbl">Área menos elegida (${ultima.c}, ${ultima.pct}%)</div></div>
      <div class="stat-card kuder-stat-ancho"><div class="num">${con3oMas}</div><div class="lbl">Estudiantes con 3 o más áreas de interés (${pct3oMas}%)</div></div>
    </div>`;
}

// las barras van en 2 columnas (en vez de una sola columna de 10 filas) para que el
// resumen completo quepa cómodamente en una sola página — el orden de mayor a menor
// se sigue leyendo con naturalidad porque la grilla llena primero la fila (área 1 y 2
// arriba, 3 y 4 debajo, etc.), no una columna entera antes de pasar a la otra.
function construirResumenBarrasKuder(conteos, total) {
  const areasOrdenadas = [...AREAS_KUDER].sort((a, b) => (conteos[b.id] || 0) - (conteos[a.id] || 0));
  const maxConteo = Math.max(1, ...areasOrdenadas.map((a) => conteos[a.id] || 0));
  return `
    <div class="kuder-resumen-wrap">
      <div class="kuder-resumen-titulo">Áreas de interés del curso, de mayor a menor</div>
      <div class="kuder-barras-grid">
        ${areasOrdenadas
          .map((a) => {
            const c = conteos[a.id] || 0;
            const pct = total > 0 ? Math.round((c / total) * 100) : 0;
            const anchoBarra = Math.round((c / maxConteo) * 100);
            return `
            <div class="barra-area">
              <div class="etiqueta-area"><span>${a.icono} ${a.nombre}</span><span>${c} (${pct}%)</span></div>
              <div class="barra-fondo"><div class="barra-rellena" style="width:${anchoBarra}%; background:${a.color};"></div></div>
            </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function construirFooterKuder() {
  return `
    <div class="informe-footer">
      <p>Este informe es un apoyo para el proceso de orientación vocacional del establecimiento y no reemplaza una evaluación individual de cada estudiante. Está dirigido al equipo de orientación — no está pensado para entregarse directamente a los estudiantes.</p>
      <p class="informe-contacto">Unidad de Admisión y Marketing · Ignacio Carrera Pinto 1015, Punta Arenas · Universidad de Magallanes</p>
      <p class="informe-contacto-extra">Contáctanos al <b>+56 9 7499 7771</b> · Más información en <b>admision.umag.cl</b></p>
    </div>`;
}

// ==================== PÁGINA 1: resumen del curso ====================

function construirPaginaResumenKuder(datosCurso, estudiantes, conteos, total) {
  const contenedor = document.createElement("div");
  contenedor.className = "informe-page";
  contenedor.innerHTML = `
    ${construirBanner("Informe Grupal · Test Vocacional de Kuder", "Enseñanza Media · Unidad de Admisión y Marketing")}
    ${construirCajaCursoKuder(datosCurso, total)}
    ${construirIntroKuder()}
    ${construirStatsKuder(estudiantes, conteos, total)}
    ${construirResumenBarrasKuder(conteos, total)}
    ${construirFooterKuder()}
  `;
  return contenedor;
}

// ==================== informe GLOBAL (2 a 6 cursos a la vez) ====================

// lista compacta (chips, no tabla) de los cursos que se sumaron en el informe
// global — se prioriza que sea angosta en altura, porque la página 1 ya
// tiene bastante contenido y con una tabla completa se puede pasar de una hoja.
function construirCursosIncluidosKuder(resumenPorCurso) {
  return `
    <div class="kuder-cursos-incluidos">
      <div class="kuder-resumen-titulo">Cursos incluidos en este informe (${resumenPorCurso.length})</div>
      <div class="kuder-cursos-chips">
        ${resumenPorCurso
          .map((r) => `<span class="kuder-curso-chip">${r.colegio || "—"} · ${r.curso || "—"} <b>(${r.total})</b></span>`)
          .join("")}
      </div>
    </div>`;
}

function construirIntroGlobalKuder(nCursos) {
  return `
    <div class="informe-intro-texto">
      Este informe global reúne los resultados del Test Vocacional de Kuder de ${nCursos} cursos en un solo resumen. Por cada una de las 10 áreas se indica cuántos estudiantes del total combinado la tienen como área de interés (puntaje 7 o más) y las carreras UMAG y de otras instituciones asociadas a ese perfil — para comparar tendencias entre varios cursos sin tener que calcularlo a mano.
    </div>`;
}

function construirCajaGlobalKuder(resumenPorCurso, totalEstudiantes, fecha) {
  const colegios = [...new Set(resumenPorCurso.map((r) => r.colegio).filter(Boolean))];
  const tituloColegio = colegios.length === 1 ? colegios[0] : `${colegios.length} colegios`;
  return `
    <div class="id-card-wrap">
      <div class="id-card">
        <div class="id-card-avatar">${ICONO_GRUPO_KUDER}</div>
        <div class="id-card-datos">
          <div class="id-card-nombre">Informe global · ${tituloColegio}</div>
          <div class="id-card-sub">${totalEstudiantes} ${totalEstudiantes === 1 ? "estudiante evaluado" : "estudiantes evaluados"} en ${resumenPorCurso.length} cursos</div>
          ${fecha ? `<div class="id-card-sub">Fecha de aplicación: ${fmtFechaKuder(fecha)}</div>` : ""}
        </div>
        <div class="id-card-logo"><img src="${LOGO_UMAG_DATAURI}" alt="UMAG" /></div>
      </div>
    </div>`;
}

// a diferencia del informe de un solo curso (donde la página 1 siempre cabe holgada),
// el informe global suma una lista de cursos (1 a 6) de largo variable — con varios
// cursos, los chips de "cursos incluidos" pueden ocupar 2 líneas. Las barras en 2
// columnas (ver construirResumenBarrasKuder) dejan margen de sobra para que esto
// siga cabiendo en una sola página en el uso normal; igual se mide el contenido real
// antes de decidir, y si de verdad no cupiera (nombres de colegio muy largos, por
// ejemplo), el resumen de las 10 áreas pasa a una segunda página en vez de cortarse
// a la mitad — es un resguardo, no el camino esperado.
function construirPaginasResumenGlobalKuder(resumenPorCurso, estudiantes, conteos, total, fecha) {
  const htmlBanner = construirBanner("Informe Global · Test Vocacional de Kuder", "Enseñanza Media · Unidad de Admisión y Marketing");
  const htmlCaja = construirCajaGlobalKuder(resumenPorCurso, total, fecha);
  const htmlCursos = construirCursosIncluidosKuder(resumenPorCurso);
  const htmlIntro = construirIntroGlobalKuder(resumenPorCurso.length);
  const htmlStats = construirStatsKuder(estudiantes, conteos, total);
  const htmlBarras = construirResumenBarrasKuder(conteos, total);
  const htmlFooter = construirFooterKuder();

  const crearPagina = (html) => {
    const contenedor = document.createElement("div");
    contenedor.className = "informe-page";
    contenedor.innerHTML = html;
    return contenedor;
  };

  const LIMITE_PAGINA_PX = ALTO_PAGINA_PX - PADDING_INFERIOR_PX;
  const htmlCompleto = htmlBanner + htmlCaja + htmlCursos + htmlIntro + htmlStats + htmlBarras + htmlFooter;
  if (medirAlturaFragmento(htmlCompleto) <= LIMITE_PAGINA_PX) {
    return [crearPagina(htmlCompleto)];
  }

  const htmlAviso = construirAvisoContinua();
  const pagina1 = crearPagina(htmlBanner + htmlCaja + htmlCursos + htmlIntro + htmlStats + htmlAviso);
  const pagina2 = crearPagina(`<div class="espaciador-inicio-pagina"></div>${htmlBarras}${htmlFooter}`);
  return [pagina1, pagina2];
}

function nombreArchivoGlobalKuder(resumenPorCurso) {
  const limpiar = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const colegios = [...new Set(resumenPorCurso.map((r) => r.colegio).filter(Boolean))];
  const colegio = colegios.length === 1 ? limpiar(colegios[0]) : "VariosColegios";
  const fecha = new Date().toISOString().slice(0, 10);
  return `Informe_Global_Kuder_${colegio}_${resumenPorCurso.length}cursos_${fecha}.pdf`;
}

// el "datosCurso" que necesitan las páginas de área (js/kuder-report.js:
// construirPaginasAreasKuder) es solo para la línea de encabezado liviana de las
// páginas de continuación — en el informe global se identifica por cuántos cursos
// se sumaron, no por un colegio/curso puntual.
async function construirBlobInformeGlobalKuder(resumenPorCurso, estudiantes, fecha) {
  const total = estudiantes.length;
  const conteos = calcularConteosPorAreaKuder(estudiantes);
  const datosCursoContinuacion = { colegio: `${resumenPorCurso.length} cursos (informe global)`, curso: "" };

  const paginas = [
    ...construirPaginasResumenGlobalKuder(resumenPorCurso, estudiantes, conteos, total, fecha),
    ...construirPaginasAreasKuder(datosCursoContinuacion, conteos, total),
  ];
  return paginasAPdfBlob(paginas);
}

async function generarInformeGlobalKuderPdf(resumenPorCurso, estudiantes, fecha) {
  const blob = await construirBlobInformeGlobalKuder(resumenPorCurso, estudiantes, fecha);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoGlobalKuder(resumenPorCurso);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ==================== PÁGINA(S) 2+: una tarjeta por área ====================

function construirListaCarrerasKuder(titulo, carreras, clase) {
  const esUmag = clase === "umag";
  const estiloFondo = esUmag ? `style="${ESTILO_MARCA_AGUA_SELLO} background-position:center; background-size:110px;"` : "";
  return `
    <div class="carreras-mini ${clase || ""}" ${estiloFondo}>
      <h5>${titulo}</h5>
      <ul class="carreras-lista-bullets">${carreras.map((c) => `<li>${c}</li>`).join("")}</ul>
    </div>`;
}

function construirTarjetaAreaKuder(area, conteo, total) {
  const pct = total > 0 ? Math.round((conteo / total) * 100) : 0;
  return `
    <div class="area-card" style="border-left-color:${area.color};">
      <div class="area-card-header">
        ${iconoCirculoKuder(area, 42)}
        <h3 style="color:${area.color};">${area.nombre}</h3>
        <span class="area-card-conteo" style="background:${area.color};">${conteo} de ${total} (${pct}%)</span>
      </div>
      <p class="area-card-desc">${area.descripcion}</p>
      <div class="area-card-carreras-split">
        ${construirListaCarrerasKuder("Carreras UMAG", area.carrerasUMAG, "umag")}
        ${construirListaCarrerasKuder("Otras carreras", area.carrerasOtras)}
      </div>
    </div>`;
}

// empaqueta tarjetas en páginas SIN reordenarlas — a diferencia de empaquetarTarjetas()
// de js/report.js (que reordena por altura para aprovechar mejor el espacio, algo que
// no importa en el informe de 8° porque ahí el orden de las áreas no es significativo),
// acá el orden SÍ importa: las áreas van de mayor a menor según cuántos estudiantes las
// tienen como interés, y ese orden se tiene que respetar en la secuencia de páginas.
function empaquetarTarjetasEnOrdenKuder(alturas, disponible) {
  const grupos = [];
  let actual = [];
  let alturaActual = 0;
  for (let i = 0; i < alturas.length; i++) {
    const costoConEsta = actual.length === 0 ? alturas[i] + COSTE_CONTENEDOR_TOP_PX : alturaActual + COSTE_GAP_PX + alturas[i];
    if (actual.length > 0 && costoConEsta > disponible) {
      grupos.push(actual);
      actual = [i];
      alturaActual = alturas[i] + COSTE_CONTENEDOR_TOP_PX;
    } else {
      actual.push(i);
      alturaActual = costoConEsta;
    }
  }
  if (actual.length) grupos.push(actual);
  return grupos;
}

// mismo motor de medición/PDF que usa el informe de 8° (js/report.js: medirAlturaFragmento
// / ALTO_PAGINA_PX / PADDING_INFERIOR_PX / COSTE_CONTENEDOR_TOP_PX / COSTE_GAP_PX),
// reutilizado tal cual por ser genérico — así ninguna tarjeta de área queda cortada a la
// mitad entre páginas. Las áreas se muestran de mayor a menor según cuántos estudiantes
// las tienen como interés, igual que el resumen de la página 1 — por eso el empaquetado
// usa empaquetarTarjetasEnOrdenKuder() y no empaquetarTarjetas() de report.js: esa última
// reordena las tarjetas para aprovechar mejor el espacio, lo que rompería el orden.
function construirPaginasAreasKuder(datosCurso, conteos, total) {
  const areasOrdenadas = [...AREAS_KUDER].sort((a, b) => (conteos[b.id] || 0) - (conteos[a.id] || 0));
  const htmlTarjetas = areasOrdenadas.map((area) => construirTarjetaAreaKuder(area, conteos[area.id] || 0, total));
  const htmlEncabezadoCont = construirLineaCursoKuder(datosCurso);
  const htmlAviso = construirAvisoContinua();

  const altoEncabezadoCont = medirAlturaFragmento(htmlEncabezadoCont);
  const altoReservaInferior = medirAlturaFragmento(htmlAviso);
  const alturasTarjetas = htmlTarjetas.map((html) => medirAlturaFragmento(`<div class="informe-areas" style="margin:0;">${html}</div>`));

  const MARGEN_SEGURIDAD_PX = 20;
  const disponible = ALTO_PAGINA_PX - PADDING_INFERIOR_PX - altoEncabezadoCont - altoReservaInferior - MARGEN_SEGURIDAD_PX;

  const grupos = empaquetarTarjetasEnOrdenKuder(alturasTarjetas, disponible);

  const LIMITE_PAGINA_PX = ALTO_PAGINA_PX - PADDING_INFERIOR_PX;
  function armarHtmlPagina(indices, esUltima) {
    return `
      ${htmlEncabezadoCont}
      <div class="informe-areas">${indices.map((i) => htmlTarjetas[i]).join("")}</div>
      ${esUltima ? "" : htmlAviso}
    `;
  }
  for (let i = 0; i < grupos.length; i++) {
    let intentos = 0;
    while (grupos[i].length > 1 && intentos < 10) {
      const esUltima = i === grupos.length - 1;
      const alto = medirAlturaFragmento(armarHtmlPagina(grupos[i], esUltima));
      if (alto <= LIMITE_PAGINA_PX) break;
      const sobrante = grupos[i].pop();
      if (i + 1 < grupos.length) grupos[i + 1].unshift(sobrante);
      else grupos.push([sobrante]);
      intentos++;
    }
  }

  return grupos.map((indices, idx) => {
    const esUltima = idx === grupos.length - 1;
    const contenedor = document.createElement("div");
    contenedor.className = "informe-page";
    contenedor.innerHTML = armarHtmlPagina(indices, esUltima);
    return contenedor;
  });
}

// ==================== armado + descarga del PDF ====================

function nombreArchivoInformeKuder(datosCurso) {
  const limpiar = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const colegio = limpiar(datosCurso.colegio) || "Colegio";
  const curso = limpiar((datosCurso.curso || "") + (datosCurso.letra || "")) || "Curso";
  const fecha = new Date().toISOString().slice(0, 10);
  return `Informe_Grupal_Kuder_${colegio}_${curso}_${fecha}.pdf`;
}

// calcula cuántos estudiantes del curso tienen cada área como interés.
function calcularConteosPorAreaKuder(estudiantes) {
  const conteos = {};
  AREAS_KUDER.forEach((a) => (conteos[a.id] = 0));
  estudiantes.forEach((e) => {
    calcularAreasDeInteresKuder(e.puntajes).forEach((a) => conteos[a.id]++);
  });
  return conteos;
}

async function construirBlobInformeGrupalKuder(datosCurso, estudiantes) {
  const total = estudiantes.length;
  const conteos = calcularConteosPorAreaKuder(estudiantes);

  const paginas = [
    construirPaginaResumenKuder(datosCurso, estudiantes, conteos, total),
    ...construirPaginasAreasKuder(datosCurso, conteos, total),
  ];
  return paginasAPdfBlob(paginas);
}

async function generarInformeGrupalKuderPdf(datosCurso, estudiantes) {
  const blob = await construirBlobInformeGrupalKuder(datosCurso, estudiantes);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoInformeKuder(datosCurso);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// botón "informes por curso": genera un PDF de informe grupal por CADA curso marcado
// (a diferencia del informe global, que suma todos los cursos en un solo PDF) y los
// entrega juntos en un único ZIP — así no se disparan N descargas sueltas del
// navegador de una vez. Reutiliza JSZip, ya cargado por vendor/jszip.min.js para el
// ZIP de informes del cuestionario de 8° (js/report.js: descargarInformesMasivo).
function nombreZipPorCursoKuder(porArchivo) {
  const limpiar = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const colegios = [...new Set(porArchivo.map((r) => r.colegio).filter(Boolean))];
  const colegio = colegios.length === 1 ? limpiar(colegios[0]) : "VariosColegios";
  const fecha = new Date().toISOString().slice(0, 10);
  return `Informes_Kuder_por_curso_${colegio}_${porArchivo.length}cursos_${fecha}.zip`;
}

async function generarInformesPorCursoKuderZip(porArchivo, fecha) {
  const zip = new JSZip();
  const usados = new Map();

  for (const { colegio, curso, estudiantes } of porArchivo) {
    const blob = await construirBlobInformeGrupalKuder({ colegio, curso, fecha }, estudiantes);
    let nombre = nombreArchivoInformeKuder({ colegio, curso });
    const veces = usados.get(nombre) || 0;
    usados.set(nombre, veces + 1);
    if (veces > 0) nombre = nombre.replace(/\.pdf$/, `_${veces + 1}.pdf`);
    zip.file(nombre, blob);
  }

  const contenidoZip = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(contenidoZip);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreZipPorCursoKuder(porArchivo);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
