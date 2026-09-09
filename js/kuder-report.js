// Informe GRUPAL (por curso) del Test Vocacional de Kuder, dirigido a los orientadores
// del colegio — no a los estudiantes (los informes individuales quedan para una etapa
// futura). Reutiliza el motor de paginación/PDF y varias clases CSS ya usadas por el
// informe de 8° básico (js/report.js, css/styles.css) porque son genéricas y así se
// mantiene el mismo formato visual, pero es un módulo aparte: no modifica ni depende
// de datos propios de ese cuestionario (áreas, ids, colores distintos).
//
// Estructura del PDF (informe grupal, por curso): página 1 = estadísticas del curso;
// página 2 = resultados (gráfico de las 10 áreas); página(s) 3 = lista de estudiantes
// evaluados con su(s) área(s) de interés; páginas siguientes = una tarjeta por cada una
// de las 10 áreas de Kuder, con cuántos estudiantes del curso la tienen como interés y
// las carreras UMAG / otras carreras asociadas.
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

// 15 recuadros en total: 10 son cifras simples (una sola línea de texto en la
// etiqueta) y 5 nombran un área específica con su cifra o su puntaje promedio entre
// paréntesis, así que van con el doble de ancho (.kuder-stat-ancho) para que ese
// texto más largo — el caso reportado fue "Servicio Social ... (14, 25%)" — tenga
// espacio de sobra y no necesite cortarse ni cambiar de línea a media palabra.
// La combinación (10 × 1 columna + 5 × 2 columnas = 20 unidades) llena exactamente 5
// filas completas de la grilla de 4 columnas, para que la página de estadísticas
// (que ahora va sola, sin el gráfico de barras al lado) quede bien ocupada.
function construirStatsKuder(estudiantes, conteos, total) {
  const areasPorEstudiante = estudiantes.map((e) => calcularAreasDeInteresKuder(e.puntajes).length);
  const sinArea = areasPorEstudiante.filter((n) => n === 0).length;
  const conArea = total - sinArea;
  const pctConArea = total > 0 ? Math.round((conArea / total) * 100) : 0;
  const con1 = areasPorEstudiante.filter((n) => n === 1).length;
  const pct1 = total > 0 ? Math.round((con1 / total) * 100) : 0;
  const con2 = areasPorEstudiante.filter((n) => n === 2).length;
  const pct2 = total > 0 ? Math.round((con2 / total) * 100) : 0;
  const con3oMas = areasPorEstudiante.filter((n) => n >= 3).length;
  const pct3oMas = total > 0 ? Math.round((con3oMas / total) * 100) : 0;
  const con4oMas = areasPorEstudiante.filter((n) => n >= 4).length;
  const pct4oMas = total > 0 ? Math.round((con4oMas / total) * 100) : 0;
  const promedio = total > 0 ? (areasPorEstudiante.reduce((acc, n) => acc + n, 0) / total).toFixed(1) : "0.0";
  const areasDistintas = AREAS_KUDER.filter((a) => (conteos[a.id] || 0) > 0).length;
  const maximoAreas = areasPorEstudiante.length ? Math.max(...areasPorEstudiante) : 0;

  const areasOrdenadas = [...AREAS_KUDER].sort((a, b) => (conteos[b.id] || 0) - (conteos[a.id] || 0));
  const fmtArea = (area) => {
    const c = area ? conteos[area.id] || 0 : 0;
    const pct = total > 0 ? Math.round((c / total) * 100) : 0;
    return { nombre: area ? area.nombre : "—", c, pct };
  };
  const top1 = fmtArea(areasOrdenadas[0]);
  const top2 = fmtArea(areasOrdenadas[1]);
  const ultima = fmtArea(areasOrdenadas[areasOrdenadas.length - 1]);

  // puntaje promedio bruto por área (no solo si superó el umbral de 7 o más): una
  // segunda mirada a la inclinación general del curso, complementaria a "cuántos
  // estudiantes la eligieron como área de interés".
  const sumaPuntajes = {};
  AREAS_KUDER.forEach((a) => (sumaPuntajes[a.id] = 0));
  estudiantes.forEach((e) => {
    AREAS_KUDER.forEach((a) => {
      const p = Number(e.puntajes[a.id]);
      if (Number.isFinite(p)) sumaPuntajes[a.id] += p;
    });
  });
  const promedioArea = (area) => (total > 0 ? sumaPuntajes[area.id] / total : 0);
  const areasPorPromedio = [...AREAS_KUDER].sort((a, b) => promedioArea(b) - promedioArea(a));
  const mayorPromedio = areasPorPromedio[0];
  const menorPromedio = areasPorPromedio[areasPorPromedio.length - 1];

  return `
    <div class="stats-grid kuder-stats-wrap">
      <div class="stat-card"><div class="num">${total}</div><div class="lbl">Estudiantes evaluados</div></div>
      <div class="stat-card"><div class="num">${conArea}</div><div class="lbl">Con al menos un área de interés (${pctConArea}%)</div></div>
      <div class="stat-card"><div class="num">${sinArea}</div><div class="lbl">Sin área de interés clara</div></div>
      <div class="stat-card"><div class="num">${promedio}</div><div class="lbl">Áreas de interés promedio por estudiante (de ${AREAS_KUDER.length} en total)</div></div>
      <div class="stat-card"><div class="num">${con1}</div><div class="lbl">Estudiantes con exactamente 1 área de interés (${pct1}%)</div></div>
      <div class="stat-card"><div class="num">${con2}</div><div class="lbl">Estudiantes con exactamente 2 áreas de interés (${pct2}%)</div></div>
      <div class="stat-card"><div class="num">${con3oMas}</div><div class="lbl">Estudiantes con 3 o más áreas de interés (${pct3oMas}%)</div></div>
      <div class="stat-card"><div class="num">${con4oMas}</div><div class="lbl">Estudiantes con perfil amplio: 4 o más áreas de interés (${pct4oMas}%)</div></div>
      <div class="stat-card"><div class="num">${areasDistintas}</div><div class="lbl">Áreas de interés distintas representadas (de ${AREAS_KUDER.length})</div></div>
      <div class="stat-card"><div class="num">${maximoAreas}</div><div class="lbl">Máximo de áreas de interés en un mismo estudiante</div></div>
      <div class="stat-card kuder-stat-ancho"><div class="num kuder-stat-num-area">${top1.nombre}</div><div class="lbl">Área más elegida: ${top1.c} de ${total} (${top1.pct}%)</div></div>
      <div class="stat-card kuder-stat-ancho"><div class="num kuder-stat-num-area">${top2.nombre}</div><div class="lbl">Segunda área más elegida: ${top2.c} de ${total} (${top2.pct}%)</div></div>
      <div class="stat-card kuder-stat-ancho"><div class="num kuder-stat-num-area">${ultima.nombre}</div><div class="lbl">Área menos elegida: ${ultima.c} de ${total} (${ultima.pct}%)</div></div>
      <div class="stat-card kuder-stat-ancho"><div class="num kuder-stat-num-area">${mayorPromedio.nombre}</div><div class="lbl">Mayor puntaje promedio del curso (${promedioArea(mayorPromedio).toFixed(1)} pts)</div></div>
      <div class="stat-card kuder-stat-ancho"><div class="num kuder-stat-num-area">${menorPromedio.nombre}</div><div class="lbl">Menor puntaje promedio del curso (${promedioArea(menorPromedio).toFixed(1)} pts)</div></div>
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

// ==================== PÁGINA 1: solo estadísticas del curso ====================
// antes las estadísticas compartían la página 1 con el gráfico de barras; ahora la
// página 1 queda dedicada solo a los recuadros (con más cifras, ver
// construirStatsKuder) y el gráfico se mueve a su propia página de "resultados".

// aclara en una sola línea chica la diferencia entre los recuadros "elegida" (más/
// segunda/menos) y "puntaje promedio": los primeros cuentan estudiantes que
// cruzaron el umbral de interés, el segundo promedia el puntaje bruto de todo el
// curso en esa área — son dos miradas distintas y pueden nombrar áreas distintas.
function construirNotaStatsKuder() {
  return `
    <div class="kuder-stats-nota">
      <b>Elegida</b> = puntaje ≥ 7 en el área. <b>Puntaje promedio</b> = promedio bruto de todo el curso en esa área (sin umbral) — por eso pueden ser distintas.
    </div>`;
}

function construirPaginaStatsKuder(datosCurso, estudiantes, conteos, total) {
  const contenedor = document.createElement("div");
  contenedor.className = "informe-page";
  contenedor.innerHTML = `
    ${construirBanner("Informe Grupal · Test Vocacional de Kuder", "Enseñanza Media · Unidad de Admisión y Marketing")}
    ${construirCajaCursoKuder(datosCurso, total)}
    ${construirIntroKuder()}
    ${construirStatsKuder(estudiantes, conteos, total)}
    ${construirNotaStatsKuder()}
    ${construirFooterKuder()}
  `;
  return contenedor;
}

// ==================== PÁGINA 2: resultados (gráfico de áreas) ====================
// mismo estilo de gráfico "honesto" (barras a escala absoluta de 0 a 100%, con
// grilla y eje) introducido en el informe interno (js/kuder-internal-report.js:
// construirBloqueGraficoAreasInterno) — acá va en una función propia porque ese
// archivo no se puede importar desde este módulo, pero SÍ comparte las mismas
// clases CSS (.kuder-chart-*), reutilizadas tal cual. En su propia página, con más
// espacio disponible, las barras van más altas y con letra más grande
// (.kuder-chart-bloque-grande) para que se vean bien en una sola plana.

function construirIntroResultadosKuder() {
  return `
    <div class="informe-intro-texto kuder-intro-texto">
      A continuación se muestra, de mayor a menor, el porcentaje de estudiantes del curso que tiene cada área como área de interés (puntaje 7 o más). Esto permite identificar de un vistazo las tendencias vocacionales predominantes del curso.
    </div>`;
}

function construirBloqueResultadosKuder(conteos, total) {
  const areasOrdenadas = [...AREAS_KUDER].sort((a, b) => (conteos[b.id] || 0) - (conteos[a.id] || 0));
  const filas = areasOrdenadas.map((a) => {
    const c = conteos[a.id] || 0;
    const pct = total > 0 ? Math.round((c / total) * 100) : 0;
    return { area: a, c, pct };
  });
  const maxPct = Math.max(10, ...filas.map((f) => f.pct));
  const dominioMax = Math.ceil(maxPct / 10) * 10;
  const marcas = [];
  for (let m = 0; m <= dominioMax; m += 10) marcas.push(m);

  return `
    <div class="kuder-chart-bloque kuder-chart-bloque-grande">
      <div class="kuder-resumen-titulo">Resultados: áreas de interés del curso, de mayor a menor</div>
      <div class="kuder-chart-plot">
        <div class="kuder-chart-gridlines">
          ${marcas.map((m) => `<div class="kuder-chart-gridline" style="left:${(m / dominioMax) * 100}%;"><span>${m}%</span></div>`).join("")}
        </div>
        <div class="kuder-chart-filas">
          ${filas
            .map(
              ({ area, c, pct }) => `
            <div class="kuder-chart-fila">
              <div class="kuder-chart-etiqueta">${area.icono} ${area.nombre}</div>
              <div class="kuder-chart-track"><div class="kuder-chart-barra" style="width:${(pct / dominioMax) * 100}%; background:${area.color};"></div></div>
              <div class="kuder-chart-valor">${c} (${pct}%)</div>
            </div>`
            )
            .join("")}
        </div>
      </div>
    </div>`;
}

function construirPaginaResultadosKuder(datosCurso, conteos, total) {
  const contenedor = document.createElement("div");
  contenedor.className = "informe-page";
  contenedor.innerHTML = `
    ${construirLineaCursoKuder(datosCurso)}
    ${construirIntroResultadosKuder()}
    ${construirBloqueResultadosKuder(conteos, total)}
    ${construirFooterKuder()}
  `;
  return contenedor;
}

// ==================== PÁGINA 3: lista de estudiantes ====================
// lista completa del curso (nombre corregido a formato título, RUT si la planilla lo
// trae, y área(s) de interés) condensada en 1 a 4 columnas — según cuántos
// estudiantes tenga el curso — para que quepa en una sola página; esta página NO
// lleva el pie de página (construirFooterKuder), a diferencia de todas las demás,
// para aprovechar el máximo de espacio posible para la lista (ver
// empaquetarListaEstudiantesKuder).

// "juan pérez" / "JUAN PÉREZ" → "Juan Pérez": primera letra de cada palabra en
// mayúscula (también después de guion o apóstrofe), el resto en minúscula. Regla
// simple y pareja para todos los nombres, sin excepciones para conectores ("de",
// "la"), tal como se pidió.
function capitalizarNombreKuder(s) {
  return (s || "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s\-'])(\S)/g, (m, sep, letra) => sep + letra.toUpperCase());
}

// para un estudiante sin ningún área sobre el umbral (7), busca el/los puntaje(s)
// más alto(s) de sus 10 áreas — al ser el puntaje más alto por debajo de 7, es por
// definición el más cercano a convertirse en un área de interés.
function obtenerAreaMasCercanaKuder(puntajes) {
  let maximo = -Infinity;
  AREAS_KUDER.forEach((a) => {
    const p = Number(puntajes[a.id]);
    if (Number.isFinite(p) && p > maximo) maximo = p;
  });
  if (maximo === -Infinity) return null;
  const nombres = AREAS_KUDER.filter((a) => Number(puntajes[a.id]) === maximo).map((a) => a.nombre);
  return { nombres, puntaje: maximo };
}

// el ícono de cada área (mismo set que ya se usa en el gráfico de resultados y en
// las tarjetas de área) va al lado de su nombre para diferenciarlas más rápido en
// una lista larga de estudiantes — son textos fijos de la app (no vienen de la
// planilla), así que no necesitan escaparse.
function celdaAreasEstudianteKuder(estudiante) {
  const areas = calcularAreasDeInteresKuder(estudiante.puntajes);
  if (areas.length > 0) {
    return areas.map((a) => `${a.icono} ${escaparHtmlKuder(a.nombre)}`).join(", ");
  }
  const cercana = obtenerAreaMasCercanaKuder(estudiante.puntajes);
  if (!cercana) return "—";
  return `<span class="kuder-lista-sin-area">No tiene área de interés</span> <span class="kuder-lista-cercana">(más cercana: ${escaparHtmlKuder(cercana.nombres.join(" / "))}, ${cercana.puntaje} pts)</span>`;
}

// da formato estándar al RUT chileno: puntos cada 3 dígitos en el cuerpo y un guion
// antes del dígito verificador (ej. "222676584" → "22.267.658-4"). Si el valor no
// trae al menos 2 caracteres útiles (dígitos o K), se muestra tal cual venía en la
// planilla en vez de forzar un formato que no correspondería.
function formatearRutKuder(rutCrudo) {
  const limpio = (rutCrudo || "").toString().trim().replace(/[^0-9kK]/g, "");
  if (limpio.length < 2) return (rutCrudo || "").toString().trim();
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1).toUpperCase();
  const cuerpoConPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpoConPuntos}-${dv}`;
}

function construirFilaEstudianteKuder(n, estudiante) {
  const nombre = capitalizarNombreKuder(estudiante.nombre);
  const rut = (estudiante.rut || "").toString().trim();
  return `
    <tr>
      <td class="num">${n}</td>
      <td class="nombre">${escaparHtmlKuder(nombre)}</td>
      <td class="rut">${rut ? escaparHtmlKuder(formatearRutKuder(rut)) : "—"}</td>
      <td>${celdaAreasEstudianteKuder(estudiante)}</td>
    </tr>`;
}

function construirTablaEstudiantesColumnaKuder(filas) {
  return `
    <table class="kuder-tabla-estudiantes">
      <thead><tr><th class="num">#</th><th class="nombre">Nombre</th><th class="rut">RUT</th><th>Área(s) de interés</th></tr></thead>
      <tbody>${filas.join("")}</tbody>
    </table>`;
}

// reparte las filas ya renderizadas en 1 a 4 columnas, probando primero con la menor
// cantidad de columnas posible; para cada cantidad de columnas se prueba de mayor a
// menor tamaño de letra y se usa el primero (más grande) que quepa. Así, en vez de
// arrancar siempre achicando la letra al mínimo, un curso con pocos estudiantes cabe
// en 1 columna con letra grande y usa bien el espacio de la página — tal como pide
// que esta página "use toda la página disponible para la lista" — mientras que un
// curso con muchos estudiantes va agregando columnas y, solo si hace falta, achica
// la letra.
// mide el ancho real (con overflow incluido) de un fragmento ya armado al ancho
// fijo de página (794px, igual que .informe-page) — mismo mecanismo offscreen que
// medirAlturaFragmento() de report.js (reutiliza el mismo contenedor
// #render-offscreen), pero devolviendo el ancho en vez del alto; no se toca
// report.js porque esa función es genérica y la usa también el informe de 8°.
function medirAnchoFragmentoKuder(html) {
  const host = document.getElementById("render-offscreen");
  host.innerHTML = "";
  const envoltura = document.createElement("div");
  envoltura.className = "informe-page";
  envoltura.style.paddingBottom = "0";
  envoltura.innerHTML = html;
  host.appendChild(envoltura);
  const ancho = envoltura.scrollWidth;
  host.innerHTML = "";
  return ancho;
}

// el nombre y el RUT van con white-space:nowrap (ver css/styles.css) para que no
// se corte un apellido o un RUT a mitad de palabra — pero un nombre genuinamente
// largo en una columna angosta (curso numeroso, forzado a 4 columnas) podría
// entonces desbordar el ancho de la página en vez de solo su alto. Por eso, junto
// con medirAlturaFragmento (alto) se verifica también medirAnchoFragmentoKuder
// (ancho de 794px): si una combinación de columnas/letra no cabe en cualquiera de
// los dos sentidos, se descarta igual, prefiriendo menos columnas (nombres con más
// espacio) o letra más chica antes que aceptar un desborde horizontal.
function empaquetarListaEstudiantesKuder(filas, htmlEncabezado, disponible) {
  const TAMANOS_FUENTE_PX = [15, 14, 13, 12, 11, 10, 9.5, 9, 8.5];
  const ANCHO_PAGINA_PX = 794;
  const armar = (cols, tamano) => {
    const porColumna = Math.ceil(filas.length / cols);
    const columnas = [];
    for (let i = 0; i < cols; i++) {
      const parte = filas.slice(i * porColumna, (i + 1) * porColumna);
      if (parte.length) columnas.push(parte);
    }
    const htmlGrid = `<div class="kuder-lista-estudiantes-grid" style="grid-template-columns:repeat(${columnas.length},1fr); font-size:${tamano}px;">${columnas
      .map((c) => construirTablaEstudiantesColumnaKuder(c))
      .join("")}</div>`;
    return htmlEncabezado + htmlGrid;
  };

  for (let cols = 1; cols <= 4; cols++) {
    for (const tamano of TAMANOS_FUENTE_PX) {
      const html = armar(cols, tamano);
      if (medirAlturaFragmento(html) <= disponible && medirAnchoFragmentoKuder(html) <= ANCHO_PAGINA_PX) {
        return { html, cabe: true };
      }
    }
  }
  // resguardo: con nombres de largo normal no debería ocurrir (4 columnas al
  // tamaño de letra más chico alcanza para bastante más de 45 estudiantes), pero
  // por si acaso nunca se corta contenido — se entrega igual y el llamador decide
  // si reparte la lista en más de una página.
  return { html: armar(4, TAMANOS_FUENTE_PX[TAMANOS_FUENTE_PX.length - 1]), cabe: false };
}

function construirPaginasListaEstudiantesKuder(datosCurso, estudiantes) {
  const ordenados = [...estudiantes].sort((a, b) =>
    capitalizarNombreKuder(a.nombre).localeCompare(capitalizarNombreKuder(b.nombre), "es")
  );
  const filas = ordenados.map((e, i) => construirFilaEstudianteKuder(i + 1, e));
  const htmlEncabezado =
    construirLineaCursoKuder(datosCurso) +
    `<div class="kuder-lista-estudiantes-titulo">Lista de estudiantes evaluados (${estudiantes.length})</div>`;

  const LIMITE_PAGINA_PX = ALTO_PAGINA_PX - PADDING_INFERIOR_PX;
  const MARGEN_SEGURIDAD_PX = 10;
  const disponible = LIMITE_PAGINA_PX - MARGEN_SEGURIDAD_PX;

  const crearPagina = (html) => {
    const contenedor = document.createElement("div");
    contenedor.className = "informe-page";
    contenedor.innerHTML = html;
    return contenedor;
  };

  const intento = empaquetarListaEstudiantesKuder(filas, htmlEncabezado, disponible);
  if (intento.cabe) return [crearPagina(intento.html)];

  // curso excepcionalmente numeroso: se reparte en 2 páginas en vez de cortar
  // contenido, mismo criterio de resguardo que usa
  // construirPaginasResumenGlobalKuder para el informe global.
  const htmlAviso = construirAvisoContinua();
  const mitad = Math.ceil(filas.length / 2);
  const parte1 = empaquetarListaEstudiantesKuder(filas.slice(0, mitad), htmlEncabezado, disponible - medirAlturaFragmento(htmlAviso));
  const parte2 = empaquetarListaEstudiantesKuder(filas.slice(mitad), htmlEncabezado, disponible);
  return [crearPagina(parte1.html + htmlAviso), crearPagina(parte2.html)];
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

// "espaciosa" (opcional): agrega la clase "kuder-area-card-espaciosa", que en
// css/styles.css agranda el padding y el interlineado SOLO dentro de esa tarjeta,
// sin tocar las reglas base (.area-card, compartidas con el informe de 8°). Se usa
// nada más para la tarjeta que termina sola en su página (ver
// construirPaginasAreasKuder) — agrandar también las que comparten página con otra
// arriesgaría que dejen de caber juntas, así que esas se arman con el tamaño
// compacto de siempre.
function construirTarjetaAreaKuder(area, conteo, total, espaciosa) {
  const pct = total > 0 ? Math.round((conteo / total) * 100) : 0;
  return `
    <div class="area-card${espaciosa ? " kuder-area-card-espaciosa" : ""}" style="border-left-color:${area.color};">
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
//
// El pie de página (construirFooterKuder) va en TODAS estas páginas, no solo en la
// última — se reserva su altura completa (más el aviso de continuación) al calcular
// cuántas tarjetas caben, así ninguna tarjeta termina empujando al pie fuera de la hoja.
function construirPaginasAreasKuder(datosCurso, conteos, total) {
  const areasOrdenadas = [...AREAS_KUDER].sort((a, b) => (conteos[b.id] || 0) - (conteos[a.id] || 0));
  const htmlTarjetas = areasOrdenadas.map((area) => construirTarjetaAreaKuder(area, conteos[area.id] || 0, total, false));
  const htmlTarjetasEspaciosas = areasOrdenadas.map((area) => construirTarjetaAreaKuder(area, conteos[area.id] || 0, total, true));
  const htmlEncabezadoCont = construirLineaCursoKuder(datosCurso);
  const htmlAviso = construirAvisoContinua();
  const htmlFooter = construirFooterKuder();

  const altoEncabezadoCont = medirAlturaFragmento(htmlEncabezadoCont);
  const altoReservaInferior = medirAlturaFragmento(htmlAviso + htmlFooter);
  const alturasTarjetas = htmlTarjetas.map((html) => medirAlturaFragmento(`<div class="informe-areas" style="margin:0;">${html}</div>`));

  const MARGEN_SEGURIDAD_PX = 20;
  const disponible = ALTO_PAGINA_PX - PADDING_INFERIOR_PX - altoEncabezadoCont - altoReservaInferior - MARGEN_SEGURIDAD_PX;

  const grupos = empaquetarTarjetasEnOrdenKuder(alturasTarjetas, disponible);

  const LIMITE_PAGINA_PX = ALTO_PAGINA_PX - PADDING_INFERIOR_PX;
  // arma la página siempre con las tarjetas compactas: el cálculo de cuáles caben
  // juntas (arriba y en el ciclo de abajo) se hizo midiendo esas alturas, así que
  // usar acá la versión espaciosa podría invalidarlo.
  function armarHtmlPagina(indices, esUltima) {
    return `
      ${htmlEncabezadoCont}
      <div class="informe-areas">${indices.map((i) => htmlTarjetas[i]).join("")}</div>
      ${esUltima ? "" : htmlAviso}
      ${htmlFooter}
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

  // recién con los grupos ya definitivos: a la tarjeta que quedó sola en su
  // página (sin pareja, por orden y por espacio) se le da la versión "espaciosa"
  // — más aire interno — para que la página no se vea tan vacía debajo del pie.
  // Las tarjetas que comparten página con otra se dejan compactas, tal como se
  // calculó que cabían. Se verifica igual que la versión espaciosa quepa bajo el
  // límite antes de usarla; si por algún motivo no cupiera, se deja la compacta.
  return grupos.map((indices, idx) => {
    const esUltima = idx === grupos.length - 1;
    let html = armarHtmlPagina(indices, esUltima);
    if (indices.length === 1) {
      const htmlEspacioso = `
        ${htmlEncabezadoCont}
        <div class="informe-areas">${htmlTarjetasEspaciosas[indices[0]]}</div>
        ${esUltima ? "" : htmlAviso}
        ${htmlFooter}
      `;
      if (medirAlturaFragmento(htmlEspacioso) <= LIMITE_PAGINA_PX) html = htmlEspacioso;
    }
    const contenedor = document.createElement("div");
    contenedor.className = "informe-page";
    contenedor.innerHTML = html;
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

// orden del PDF: 1) estadísticas del curso, 2) resultados (gráfico de áreas),
// 3) lista de estudiantes (1 o 2 páginas, sin pie de página), 4) en adelante, una
// tarjeta por área con sus carreras (igual que antes).
async function construirBlobInformeGrupalKuder(datosCurso, estudiantes) {
  const total = estudiantes.length;
  const conteos = calcularConteosPorAreaKuder(estudiantes);

  const paginas = [
    construirPaginaStatsKuder(datosCurso, estudiantes, conteos, total),
    construirPaginaResultadosKuder(datosCurso, conteos, total),
    ...construirPaginasListaEstudiantesKuder(datosCurso, estudiantes),
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
