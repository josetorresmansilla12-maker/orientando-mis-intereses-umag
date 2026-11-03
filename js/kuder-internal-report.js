// Informe INTERNO del Test Vocacional de Kuder, para la Unidad de Admisión y Marketing
// (no para orientadores ni estudiantes) — a partir de varios archivos Excel/CSV subidos
// de una vez (uno por curso/aplicación). Módulo aparte de js/kuder-report.js: no lo
// modifica ni depende de sus funciones específicas del informe de orientadores, pero SÍ
// reutiliza a propósito las utilidades genéricas que ya trae cargadas esa parte del
// programa (motor de PDF/paginación de js/report.js, banner/id-card/stats-grid de
// css/styles.css, AREAS_KUDER y calcularAreasDeInteresKuder de js/kuder-data.js) porque
// son genéricas y así el informe interno mantiene el mismo formato visual de la app.
//
// Diferencia clave con el informe de orientadores: el cuadro de carreras de cada área
// usa las mismas "Carreras UMAG" (AREAS_KUDER), pero en vez de "Otras carreras" muestra
// "Carreras que UMAG podría incorporar" — una lista corta y editable aparte
// (CARRERAS_POTENCIALES_KUDER, en js/kuder-internal-data.js) pensada para uso
// estratégico interno, no para que la lea un estudiante.
//
// A diferencia del informe de orientadores, este NO tiene límite de páginas (es de uso
// interno, nunca se entrega a otra institución): TODO el contenido (estadísticas,
// rankings, gráfico de áreas, y cada tarjeta de área) se arma como una sola secuencia
// de bloques y se reparte en tantas páginas como haga falta para que cada una quede
// bien ocupada, sin saltos de página fijos entre secciones — ver
// construirTodasLasPaginasInternoKuder().

const ICONO_INTERNO_KUDER = `
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="10" width="34" height="28" rx="3" fill="#5b3b8c"/>
    <rect x="12" y="16" width="10" height="7" rx="1" fill="white"/>
    <rect x="26" y="16" width="10" height="3" rx="1.2" fill="white" opacity="0.85"/>
    <rect x="26" y="21" width="7" height="3" rx="1.2" fill="white" opacity="0.85"/>
    <rect x="12" y="27" width="24" height="3" rx="1.2" fill="white" opacity="0.85"/>
    <rect x="12" y="32" width="16" height="3" rx="1.2" fill="white" opacity="0.6"/>
  </svg>`;

// ==================== período del informe (día/mes/año, todos opcionales) ====================

const MESES_KUDER = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// {dia, mes, anio} — cualquier combinación de los tres, o ninguno. No es una fecha
// (no exige día+mes+año juntos como un <input type="date">): el usuario puede indicar
// solo el año, o mes+año, o los tres, y se arma el texto más natural para lo que haya.
function formatearPeriodoKuder({ dia, mes, anio } = {}) {
  const nombreMes = mes ? MESES_KUDER[Number(mes) - 1] : null;
  if (dia && nombreMes && anio) return `${dia} de ${nombreMes} de ${anio}`;
  if (nombreMes && anio) return `${nombreMes.charAt(0).toUpperCase()}${nombreMes.slice(1)} ${anio}`;
  if (dia && nombreMes) return `${dia} de ${nombreMes}`;
  if (nombreMes) return nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
  if (anio) return String(anio);
  return null;
}

// ==================== cálculo de estadísticas ====================

// se agrupa por versión en minúsculas del texto (colegio/nivel) para que variaciones de
// mayúsculas entre archivos — probado con datos reales: un colegio escribió "4to D" en
// un archivo y "4TO D" en otro — no se cuenten como si fueran dos grupos distintos; para
// mostrar se usa el primer texto tal cual apareció, no la versión en minúsculas.
// los colegios se ordenan por estudiantes evaluados (lo principal); a igual cantidad,
// por cursos evaluados
function agruparConteoTexto(valores, etiquetaVacio) {
  const mapa = new Map();
  valores.forEach(({ texto, nEstudiantes }) => {
    const original = (texto || "").trim() || etiquetaVacio;
    const clave = original.toLowerCase();
    if (!mapa.has(clave)) mapa.set(clave, { texto: original, aplicaciones: 0, estudiantes: 0 });
    const entry = mapa.get(clave);
    entry.aplicaciones++;
    entry.estudiantes += nEstudiantes;
  });
  return [...mapa.values()].sort((a, b) => b.estudiantes - a.estudiantes || b.aplicaciones - a.aplicaciones);
}

// "archivos" = [{ nombre, colegio, curso, estudiantes }, ...] — cada archivo se cuenta
// como una aplicación/taller (así se distingue de "estudiantes evaluados": un colegio
// que solicitó el test a 3 cursos distintos suma 3 aplicaciones, no 1, aunque haya
// subido los 3 archivos juntos en el mismo lote).
function calcularEstadisticasInternasKuder(archivos) {
  const totalTests = archivos.length;
  const totalEstudiantes = archivos.reduce((acc, a) => acc + a.estudiantes.length, 0);
  const promedioPorCurso = totalTests > 0 ? totalEstudiantes / totalTests : 0;

  const rankingColegios = agruparConteoTexto(
    archivos.map((a) => ({ texto: a.colegio, nEstudiantes: a.estudiantes.length })),
    "Sin colegio"
  ).map((r) => ({ colegio: r.texto, aplicaciones: r.aplicaciones, estudiantes: r.estudiantes }));

  // estudiantes por nivel (todos los primeros juntos, todos los segundos juntos...): el
  // nivel de cada estudiante sale de su propio curso (un archivo puede traer varios) y,
  // si no lo tiene, del curso del archivo
  const porNivel = new Map();
  const estudiantesDeNivel = new Map();
  archivos.forEach((a) =>
    a.estudiantes.forEach((e) => {
      const nivel = nivelDeCurso(e.curso || e.cursoFila || a.curso) || { etiqueta: "Nivel no reconocido", orden: 99 };
      if (!porNivel.has(nivel.etiqueta)) {
        porNivel.set(nivel.etiqueta, { nivel: nivel.etiqueta, orden: nivel.orden, estudiantes: 0 });
        estudiantesDeNivel.set(nivel.etiqueta, []);
      }
      porNivel.get(nivel.etiqueta).estudiantes++;
      estudiantesDeNivel.get(nivel.etiqueta).push(e);
    })
  );
  const estudiantesPorNivel = [...porNivel.values()].sort((a, b) => a.orden - b.orden);

  const todosLosEstudiantes = archivos.flatMap((a) => a.estudiantes);
  const conteosAreas = calcularConteosPorAreaKuder(todosLosEstudiantes);

  const areasPorEstudiante = todosLosEstudiantes.map((e) => calcularAreasDeInteresKuder(e.puntajes).length);
  const sinAreaClara = areasPorEstudiante.filter((n) => n === 0).length;
  const promedioAreasInteres = totalEstudiantes > 0 ? areasPorEstudiante.reduce((acc, n) => acc + n, 0) / totalEstudiantes : 0;


  const areasOrdenadas = [...AREAS_KUDER].sort((a, b) => (conteosAreas[b.id] || 0) - (conteosAreas[a.id] || 0));

  // área más frecuente de cada colegio (en el orden del ranking) y de cada nivel
  const estudiantesDeColegio = new Map();
  archivos.forEach((a) => {
    const clave = ((a.colegio || "").trim() || "Sin colegio").toLowerCase();
    if (!estudiantesDeColegio.has(clave)) estudiantesDeColegio.set(clave, []);
    estudiantesDeColegio.get(clave).push(...a.estudiantes);
  });
  const areaPorColegio = rankingColegios.map((c) => ({ grupo: c.colegio, ...areasMasFrecuentesKuder(estudiantesDeColegio.get(c.colegio.toLowerCase()) || []) }));
  const areaPorNivel = estudiantesPorNivel.map((n) => ({ grupo: n.nivel, ...areasMasFrecuentesKuder(estudiantesDeNivel.get(n.nivel) || []) }));

  return {
    totalTests,
    totalEstudiantes,
    colegiosDistintos: rankingColegios.length,
    promedioPorCurso,
    rankingColegios,
    estudiantesPorNivel,
    conteosAreas,
    areasOrdenadas,
    todosLosEstudiantes,
    sinAreaClara,
    pctSinAreaClara: totalEstudiantes > 0 ? Math.round((sinAreaClara / totalEstudiantes) * 100) : 0,
    promedioAreasInteres,
    promedioPorColegio: rankingColegios.length > 0 ? totalEstudiantes / rankingColegios.length : 0,
    promedioCursosPorColegio: rankingColegios.length > 0 ? totalTests / rankingColegios.length : 0,
    conAreaClara: totalEstudiantes - sinAreaClara,
    pctConAreaClara: totalEstudiantes > 0 ? Math.round(((totalEstudiantes - sinAreaClara) / totalEstudiantes) * 100) : 0,
    areaPorColegio,
    areaPorNivel,
    demandaCarreras: calcularDemandaCarrerasKuder(todosLosEstudiantes),
  };
}

// el área (o las áreas, si empatan) que más estudiantes del grupo tienen como interés
// (7 o más), con cuántos estudiantes la tienen
function areasMasFrecuentesKuder(estudiantes) {
  const conteos = {};
  estudiantes.forEach((e) => calcularAreasDeInteresKuder(e.puntajes).forEach((a) => (conteos[a.id] = (conteos[a.id] || 0) + 1)));
  const max = Math.max(0, ...Object.values(conteos));
  return { total: estudiantes.length, areas: max > 0 ? AREAS_KUDER.filter((a) => conteos[a.id] === max) : [], conArea: max };
}

// ==================== demanda potencial por carrera UMAG (estimación) ====================
// Solo con los resultados del test: cuántos estudiantes tienen su área predominante (la
// de mayor puntaje entre sus áreas de 7 o más; si empatan, todas) en alguna de las áreas
// a las que está vinculada cada carrera UMAG (AREAS_KUDER, js/kuder-data.js). No usa
// matrícula ni datos de mercado. Las carreras vinculadas a las mismas áreas dan la misma
// estimación, así que van juntas en una fila. Un estudiante puede contar para varias.
const CARRERAS_UMAG_KUDER = (() => {
  const carreras = new Map();
  AREAS_KUDER.forEach((area) =>
    area.carrerasUMAG.forEach((c) => {
      if (!carreras.has(c)) carreras.set(c, []);
      carreras.get(c).push(area);
    })
  );
  return carreras;
})();

function areasPredominantesKuder(puntajes) {
  const areas = calcularAreasDeInteresKuder(puntajes);
  const max = Math.max(...areas.map((a) => Number(puntajes[a.id])));
  return areas.filter((a) => Number(puntajes[a.id]) === max);
}

function calcularDemandaCarrerasKuder(estudiantes) {
  const predominantes = estudiantes.map((e) => new Set(areasPredominantesKuder(e.puntajes).map((a) => a.id)));
  const grupos = new Map();
  for (const [carrera, areas] of CARRERAS_UMAG_KUDER) {
    const clave = areas.map((a) => a.id).sort().join("|");
    if (!grupos.has(clave)) grupos.set(clave, { carreras: [], areas });
    grupos.get(clave).carreras.push(carrera);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, estudiantes: predominantes.filter((ids) => g.areas.some((a) => ids.has(a.id))).length }))
    .sort((a, b) => b.estudiantes - a.estudiantes || a.carreras[0].localeCompare(b.carreras[0], "es"));
}

// ==================== encabezado (banner + credencial + intro) ====================

function construirCajaResumenInternoKuder(stats, periodo) {
  const textoPeriodo = formatearPeriodoKuder(periodo);
  return `
    <div class="id-card-wrap">
      <div class="id-card">
        <div class="id-card-avatar">${ICONO_INTERNO_KUDER}</div>
        <div class="id-card-datos">
          <div class="id-card-nombre">Resumen ejecutivo${textoPeriodo ? ` · ${textoPeriodo}` : ""}</div>
          <div class="id-card-sub">${pluralInterno(stats.totalEstudiantes, "estudiante evaluado", "estudiantes evaluados")} · ${pluralInterno(stats.totalTests, "curso", "cursos")} · ${pluralInterno(stats.colegiosDistintos, "colegio", "colegios")}</div>
        </div>
      </div>
    </div>`;
}

// ==================== hoja 1: resumen ejecutivo (para gerencia) ====================
// Breve y con cifras grandes: los 4 totales (con sus promedios debajo), los 5 colegios
// que más solicitan el test (por estudiantes evaluados; sus cursos van como dato aparte,
// sin cambiar el orden), las 5 áreas de interés más frecuentes y las 5 carreras UMAG con
// más demanda potencial (estimación). No se comparan colegios por curso: uno con un solo
// curso no podría competir con los demás. El detalle completo va en las hojas siguientes.

function pluralInterno(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

// "20,8" (con coma decimal, como se escribe en Chile)
function decimalInterno(n) {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function porcentajeInterno(parte, total) {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

function construirTopColegiosInterno(colegios, total) {
  const max = Math.max(1, ...colegios.map((f) => f.estudiantes));
  const suma = colegios.reduce((acc, f) => acc + f.estudiantes, 0);
  return `
    <div class="ejec-caja ejec-ranking">
      <div class="ejec-caja-titulo">Los ${colegios.length} colegios que más solicitan el test</div>
      <div class="ejec-caja-sub">ordenados por estudiantes evaluados · a la derecha, cuántos cursos se evaluaron en cada uno</div>
      ${colegios
        .map(
          (f, i) => `
        <div class="ejec-rank-fila">
          <span class="ejec-pos">${i + 1}</span>
          <span class="ejec-nombre">${escaparHtmlKuder(f.colegio)}</span>
          <span class="ejec-rank-barra"><span style="width:${(f.estudiantes / max) * 100}%;"></span></span>
          <span class="ejec-dato"><b>${f.estudiantes}</b> est. · ${porcentajeInterno(f.estudiantes, total)}%</span>
          <span class="ejec-cursos">${pluralInterno(f.aplicaciones, "curso", "cursos")}</span>
        </div>`
        )
        .join("")}
      <div class="ejec-caja-pie">Estos ${colegios.length} colegios suman <b>${suma}</b> de los ${total} estudiantes evaluados (<b>${porcentajeInterno(suma, total)}%</b>).</div>
    </div>`;
}

const AREAS_EN_RESUMEN = 5;
const CARRERAS_EN_RESUMEN = 5;

const NOTA_DEMANDA_KUDER =
  "Estimación basada solo en los resultados del Test de Kuder: estudiantes cuya área predominante (la de mayor puntaje, con 7 o más) está vinculada a la carrera. No considera datos de matrícula ni de mercado, y un estudiante puede contar para varias carreras.";

// "compacto": menos aire, para cuando los nombres de colegio son largos y no cabe la hoja.
// "nColegios": cuántos colegios lleva el ranking (5 si caben; si no, 3)
function construirResumenEjecutivoInternoKuder(stats, { compacto = false, nColegios = 5 } = {}) {
  const total = stats.totalEstudiantes;
  const topAreas = stats.areasOrdenadas.slice(0, AREAS_EN_RESUMEN).map((area) => ({ area, c: stats.conteosAreas[area.id] || 0 }));
  const topCarreras = stats.demandaCarreras.slice(0, CARRERAS_EN_RESUMEN);
  const kpi = (num, lbl, sub) => `<div class="ejec-kpi"><div class="ejec-num">${num}</div><div class="ejec-lbl">${lbl}</div><div class="ejec-sub">${sub}</div></div>`;

  return `
    <div class="ejec${compacto ? " ejec-compacto" : ""}">
      <div class="ejec-kpis">
        ${kpi(total, "Estudiantes evaluados", `${decimalInterno(stats.promedioPorCurso)} por curso, en promedio`)}
        ${kpi(stats.colegiosDistintos, "Colegios atendidos", `${decimalInterno(stats.promedioPorColegio)} estudiantes por colegio`)}
        ${kpi(stats.totalTests, "Cursos evaluados", `${decimalInterno(stats.promedioCursosPorColegio)} cursos por colegio`)}
        ${kpi(`${stats.pctConAreaClara}%`, "Con al menos un área de interés clara", `${decimalInterno(stats.promedioAreasInteres)} áreas por estudiante`)}
      </div>

      ${construirTopColegiosInterno(stats.rankingColegios.slice(0, nColegios), total)}

      <div class="ejec-dos">
        <div class="ejec-caja">
          <div class="ejec-caja-titulo">Las ${AREAS_EN_RESUMEN} áreas de interés más frecuentes</div>
          <div class="ejec-caja-sub">% de estudiantes con puntaje 7 o más en el área</div>
          ${topAreas
            .map(
              ({ area, c }) => `
            <div class="ejec-barra-fila">
              <div class="ejec-barra-texto"><b>${area.icono} ${area.nombre}</b><span>${porcentajeInterno(c, total)}% · ${c} est.</span></div>
              <div class="ejec-barra"><div style="width:${porcentajeInterno(c, total)}%; background:${area.color};"></div></div>
            </div>`
            )
            .join("")}
        </div>
        <div class="ejec-caja">
          <div class="ejec-caja-titulo">Carreras UMAG con más demanda potencial*</div>
          <div class="ejec-caja-sub">estudiantes con su área predominante vinculada a la carrera</div>
          ${topCarreras
            .map(
              (c) => `
            <div class="ejec-barra-fila">
              <div class="ejec-barra-texto"><b class="ejec-carreras">${escaparHtmlKuder(c.carreras[0])}${c.carreras.length > 1 ? ` <span class="ejec-afines">y ${pluralInterno(c.carreras.length - 1, "carrera afín", "carreras afines")}</span>` : ""}</b><span>${porcentajeInterno(c.estudiantes, total)}% · ${c.estudiantes} est.</span></div>
              <div class="ejec-barra"><div style="width:${porcentajeInterno(c.estudiantes, total)}%;"></div></div>
            </div>`
            )
            .join("")}
        </div>
      </div>

      <div class="ejec-nota">
        <b>Curso evaluado</b> = una aplicación del Test de Kuder a un curso. <b>Área de interés clara</b> = puntaje 7 o más en esa área. "est." = estudiantes.
        <b>*</b> ${NOTA_DEMANDA_KUDER} El detalle por colegio, nivel, área y carrera está en las hojas siguientes.
      </div>
    </div>`;
}

// ==================== rankings: colegios y niveles ====================

// "intro": un párrafo corto entre el título y la tabla
function construirTablaRankingKuder(titulo, filas, columnas, intro = "") {
  return `
    <div class="kuder-ranking-bloque">
      <div class="kuder-resumen-titulo">${titulo}</div>
      ${intro ? `<div class="kuder-tabla-intro">${intro}</div>` : ""}
      <table class="kuder-tabla-ranking">
        <thead>
          <tr>${columnas.map((c) => `<th class="${c.align === "right" ? "cant" : ""}">${c.label}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${filas
            .map(
              (fila) =>
                `<tr>${columnas.map((c) => `<td class="${c.align === "right" ? "cant" : ""}">${fila[c.key]}</td>`).join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

// las tablas del detalle van como datos ({ tabla }), no como HTML ya armado: así la
// paginación puede cortarlas entre filas para llenar cada hoja (lo que no cabe sigue en
// la hoja siguiente, con "(continuación)" en el título). "intro": un párrafo corto que va
// entre el título y la tabla, solo en el primer tramo.
function tablaInterno(titulo, filas, columnas, { intro = "" } = {}) {
  return { tabla: { titulo, filas, columnas, intro, continuacion: false } };
}

function htmlTablaInterno(t, nFilas) {
  return t.continuacion
    ? construirTablaRankingKuder(`${t.titulo} (continuación)`, t.filas.slice(0, nFilas), t.columnas)
    : construirTablaRankingKuder(t.titulo, t.filas.slice(0, nFilas), t.columnas, t.intro);
}

function tablaRankingColegiosInterno(stats) {
  const titulo = "Colegios que más solicitan el test (por N° de estudiantes evaluados)";
  const columnas = [
    { key: "posicion", label: "N°", align: "right" },
    { key: "colegio", label: "Colegio" },
    { key: "estudiantes", label: "Estudiantes", align: "right" },
    { key: "pct", label: "% del total", align: "right" },
    { key: "cursos", label: "Cursos evaluados", align: "right" },
  ];
  const filas = stats.rankingColegios.map((f, i) => ({
    ...f,
    posicion: i + 1,
    colegio: escaparHtmlKuder(f.colegio),
    pct: `${porcentajeInterno(f.estudiantes, stats.totalEstudiantes)}%`,
    cursos: `<span class="kuder-tabla-secundario">${f.aplicaciones}</span>`,
  }));
  return tablaInterno(titulo, filas, columnas);
}

// área más frecuente de cada colegio o de cada nivel (si dos o más empatan, van todas)
function tablaAreaFrecuenteInterno(titulo, etiquetaGrupo, grupos) {
  const filas = grupos.map((g) => ({
    grupo: escaparHtmlKuder(g.grupo),
    total: g.total,
    area: g.areas.length ? g.areas.map((a) => `${a.icono} ${a.nombre}`).join(" / ") : "—",
    pct: g.areas.length ? `${g.conArea} (${porcentajeInterno(g.conArea, g.total)}%)` : "—",
  }));
  return tablaInterno(titulo, filas, [
    { key: "grupo", label: etiquetaGrupo },
    { key: "total", label: "Estudiantes", align: "right" },
    { key: "area", label: "Área más frecuente" },
    { key: "pct", label: "Estudiantes con esa área", align: "right" },
  ]);
}

function tablaDemandaCarrerasInterno(stats) {
  const filas = stats.demandaCarreras.map((c, i) => ({
    posicion: i + 1,
    carrera: c.carreras.map(escaparHtmlKuder).join("<br/>"),
    areas: c.areas.map((a) => a.nombre).join(", "),
    estudiantes: c.estudiantes,
    pct: `${porcentajeInterno(c.estudiantes, stats.totalEstudiantes)}%`,
  }));
  return tablaInterno(
    "Demanda potencial por carrera UMAG (estimación)",
    filas,
    [
      { key: "posicion", label: "N°", align: "right" },
      { key: "carrera", label: "Carreras UMAG" },
      { key: "areas", label: "Áreas vinculadas" },
      { key: "estudiantes", label: "Estudiantes", align: "right" },
      { key: "pct", label: "% del total", align: "right" },
    ],
    { intro: `${NOTA_DEMANDA_KUDER} Las carreras vinculadas a las mismas áreas tienen la misma estimación y van juntas en una fila; las vinculadas a más áreas tienden a sumar más estudiantes.` }
  );
}

function tablaNivelesInterno(stats) {
  const filas = stats.estudiantesPorNivel.map((f) => ({
    nivel: escaparHtmlKuder(f.nivel),
    estudiantes: f.estudiantes,
    pct: `${porcentajeInterno(f.estudiantes, stats.totalEstudiantes)}%`,
  }));
  return tablaInterno("Estudiantes evaluados por nivel (todos los cursos de un mismo nivel juntos)", filas, [
    { key: "nivel", label: "Nivel" },
    { key: "estudiantes", label: "Estudiantes", align: "right" },
    { key: "pct", label: "% del total", align: "right" },
  ]);
}

// ==================== gráfico de áreas de interés (barras con eje y grilla) ====================

// a diferencia de una barra "relativa al máximo" (donde el ancho de cada barra depende
// de cuál es la más alta, y por lo tanto dos informes con datos distintos no se pueden
// comparar a simple vista), acá el ancho de cada barra es directamente su % real sobre
// una escala fija de 0 a un máximo "redondo" (el siguiente múltiplo de 10 sobre el
// porcentaje más alto) — así la barra ES el dato, con grilla vertical de apoyo cada 10
// puntos para comparar entre áreas de un vistazo, igual que un gráfico de barras
// estadístico convencional.
// "compacto": barras un poco más bajas, para que quepa en una hoja que ya trae las tablas
function construirBloqueGraficoAreasInterno(stats, { compacto = false } = {}) {
  const total = stats.totalEstudiantes;
  const filas = stats.areasOrdenadas.map((a) => {
    const c = stats.conteosAreas[a.id] || 0;
    const pct = total > 0 ? Math.round((c / total) * 100) : 0;
    return { area: a, c, pct };
  });
  const maxPct = Math.max(10, ...filas.map((f) => f.pct));
  const dominioMax = Math.ceil(maxPct / 10) * 10;
  const marcas = [];
  for (let m = 0; m <= dominioMax; m += 10) marcas.push(m);

  return `
    <div class="kuder-chart-bloque${compacto ? " kuder-chart-interno-compacto" : ""}">
      <div class="kuder-resumen-titulo">Áreas de interés más solicitadas (los ${total} estudiantes evaluados)</div>
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

// ==================== resumen ejecutivo: reparto en 1 o más páginas, sin dejar huecos ====================

// a diferencia del informe de orientadores (que sí tiene que caber en pocas hojas), este
// informe no tiene límite de páginas: en vez de forzar una página fija por sección
// (estadísticas / rankings / gráfico), se miden como bloques independientes y se
// reparten en orden (sin reordenar) llenando cada página todo lo que entre antes de
// pasar a la siguiente — mismo criterio de "no reordenar" que
// empaquetarTarjetasEnOrdenKuder, pero acá además la primera página tiene un
// encabezado más alto (banner + credencial + texto introductorio) que las siguientes
// (una línea liviana), así que se calcula el espacio disponible por separado para la
// primera página y para las de continuación.
// ==================== carreras UMAG vs. carreras potenciales por área ====================

// mismas listas agrupadas por familia y misma proporción medida que el informe grupal
// (construirListaCarrerasKuder, js/kuder-report.js)
function construirListaCarrerasInternaKuder(titulo, carreras, clase, opciones = {}) {
  return construirListaCarrerasKuder(titulo, carreras, clase, opciones);
}

function construirTarjetaAreaInternaKuder(area, conteo, total) {
  const pct = total > 0 ? Math.round((conteo / total) * 100) : 0;
  const potenciales = CARRERAS_POTENCIALES_KUDER[area.id] || [];
  return `
    <div class="area-card" style="border-left-color:${area.color};">
      <div class="area-card-header">
        ${iconoCirculoKuder(area, 42)}
        <h3 style="color:${area.color};">${area.nombre}</h3>
        <span class="area-card-conteo" style="background:${area.color};">${conteo} de ${total} (${pct}%)</span>
      </div>
      <div class="area-card-carreras-split">
        ${(() => {
          const armar = (flex, columnas) =>
            construirListaCarrerasInternaKuder("Carreras UMAG", area.carrerasUMAG, "umag", { flex, columnas }) +
            construirListaCarrerasInternaKuder("Carreras que UMAG podría incorporar", potenciales);
          const { flex, columnas } = mejorProporcionCarreras(`interno|${area.id}`, armar);
          return armar(flex, columnas);
        })()}
      </div>
    </div>`;
}

// ==================== todo el informe en una sola secuencia de bloques ====================

// El informe interno no tiene límite de páginas (es de uso interno, nunca se entrega a
// otra institución) — pero eso no significa "una página por sección": se arma TODO el
// contenido (estadísticas, rankings, gráfico, y cada tarjeta de área) como una única
// secuencia de bloques, en orden, y se reparte llenando cada página todo lo que entre
// antes de pasar a la siguiente. Es clave que sea una sola pasada de principio a fin
// (y no, como en una primera versión, el resumen ejecutivo por un lado y las tarjetas
// de área por otro con un salto de página fijo entre ambos): así, si al resumen
// ejecutivo le queda espacio libre en su última hoja, la primera tarjeta de área lo
// aprovecha en vez de empezar sí o sí en una página nueva — es lo que evita que una
// hoja quede con un cuarto o más de espacio en blanco.
// el título deja claro para quién es el informe
const TITULO_INFORME_GLOBAL_KUDER = "Informe Global para la Unidad de Admisión y Marketing";

function construirTodasLasPaginasInternoKuder(stats, periodo) {
  // hoja 1: solo el resumen ejecutivo, para gerencia (ver construirResumenEjecutivoInternoKuder)
  const hojaResumen = document.createElement("div");
  hojaResumen.className = "informe-page";
  const armarResumen = (opciones) => `
    ${construirBanner(TITULO_INFORME_GLOBAL_KUDER, "Test Vocacional de Kuder · Enseñanza Media · documento de uso interno", { antetitulo: "Universidad de Magallanes" })}
    ${construirCajaResumenInternoKuder(stats, periodo)}
    ${construirResumenEjecutivoInternoKuder(stats, opciones)}
  `;
  const intentos = [{ compacto: false, nColegios: 5 }, { compacto: true, nColegios: 5 }, { compacto: true, nColegios: 3 }];
  const opcionQueCabe = intentos.find((o) => medirAlturaFragmento(armarResumen(o)) <= ALTO_PAGINA_PX - PADDING_INFERIOR_PX);
  hojaResumen.innerHTML = armarResumen(opcionQueCabe || intentos[intentos.length - 1]);

  // el detalle parte en la hoja 2, todas con el mismo encabezado liviano
  const htmlEncabezadoCont = `
    <div class="espaciador-inicio-pagina"></div>
    <div class="linea-estudiante"><span><b>${TITULO_INFORME_GLOBAL_KUDER}</b> — Test Vocacional de Kuder (uso interno)</span></div>`;
  const htmlAviso = construirAvisoContinua();

  const areasOrdenadas = stats.areasOrdenadas;
  const htmlTarjetasArea = areasOrdenadas.map((area) =>
    // cada tarjeta se envuelve en su propio .informe-areas (con su margen real, no
    // recortado a 0) porque acá cada tarjeta es su propio bloque independiente, no un
    // grupo de varias compartiendo un solo contenedor flex como en el informe de
    // orientadores — así lo medido coincide exactamente con lo que se renderiza.
    `<div class="informe-areas">${construirTarjetaAreaInternaKuder(area, stats.conteosAreas[area.id] || 0, stats.totalEstudiantes)}</div>`
  );

  // contenido del detalle, en orden: bloques de HTML (no se cortan) y tablas (se cortan
  // entre filas)
  const contenido = [
    tablaRankingColegiosInterno(stats),
    tablaNivelesInterno(stats),
    { html: construirBloqueGraficoAreasInterno(stats), compacto: construirBloqueGraficoAreasInterno(stats, { compacto: true }) },
    tablaAreaFrecuenteInterno("Área de interés más frecuente por colegio", "Colegio", stats.areaPorColegio),
    tablaAreaFrecuenteInterno("Área de interés más frecuente por nivel", "Nivel", stats.areaPorNivel),
    tablaDemandaCarrerasInterno(stats),
    ...htmlTarjetasArea.map((html) => ({ html })),
  ];

  const LIMITE_PAGINA_PX = ALTO_PAGINA_PX - PADDING_INFERIOR_PX;
  // una tabla que se corta deja al menos estas filas en cada hoja (para que no quede un
  // título con una sola fila al pie, ni una fila suelta arriba de la hoja siguiente)
  const MIN_FILAS_TRAMO = 3;
  const htmlPie = construirFooterInternoKuder();
  const armarHtmlPagina = (piezas, esUltima) => `${htmlEncabezadoCont}${piezas.join("")}${esUltima ? htmlPie : htmlAviso}`;
  const cabe = (piezas, esUltima = false) => medirAlturaFragmento(armarHtmlPagina(piezas, esUltima)) <= LIMITE_PAGINA_PX;

  // se llena cada hoja midiendo la hoja de verdad (no sumando alturas sueltas): un bloque
  // que no cabe pasa a la hoja siguiente (el gráfico, si cabe en su versión más baja, se
  // queda); una tabla que no cabe entera se corta en la última fila que cabe
  const hojas = [];
  let actual = [];
  const cola = [...contenido];
  while (cola.length) {
    const item = cola.shift();
    if (item.html) {
      if (!actual.length || cabe([...actual, item.html])) actual.push(item.html);
      else if (item.compacto && cabe([...actual, item.compacto])) actual.push(item.compacto);
      else {
        hojas.push(actual);
        actual = [item.html];
      }
      continue;
    }
    const t = item.tabla;
    const total = t.filas.length;
    if (cabe([...actual, htmlTablaInterno(t, total)])) {
      actual.push(htmlTablaInterno(t, total));
      continue;
    }
    // la mayor cantidad de filas que caben en esta hoja (búsqueda binaria)
    let bajo = 0;
    let alto = total;
    while (bajo < alto) {
      const medio = Math.ceil((bajo + alto) / 2);
      if (cabe([...actual, htmlTablaInterno(t, medio)])) bajo = medio;
      else alto = medio - 1;
    }
    const n = Math.min(bajo, total - MIN_FILAS_TRAMO);
    if (n >= MIN_FILAS_TRAMO || !actual.length) {
      // en una hoja vacía siempre se pone algo (al menos una fila), para avanzar
      const corte = n >= MIN_FILAS_TRAMO ? n : Math.max(1, bajo);
      actual.push(htmlTablaInterno(t, corte));
      cola.unshift({ tabla: { ...t, filas: t.filas.slice(corte), continuacion: true } });
    } else {
      cola.unshift(item);
    }
    hojas.push(actual);
    actual = [];
  }
  if (actual.length) hojas.push(actual);

  // la última hoja lleva el pie de página en vez del aviso de "continúa": si con el pie
  // no cabe, su último bloque pasa a una hoja nueva
  const ultima = hojas[hojas.length - 1];
  if (ultima.length > 1 && !cabe(ultima, true)) hojas.push([ultima.pop()]);

  // si la última hoja quedó con muy poco, se le pasan bloques de la anterior mientras
  // quepan y la anterior no quede a medio llenar (mismo total de hojas, mejor repartidas)
  const UMBRAL_LLENADO_MINIMO = 0.65;
  const altoHoja = (piezas, esUltima) => medirAlturaFragmento(armarHtmlPagina(piezas, esUltima));
  if (hojas.length > 1) {
    const fin = hojas[hojas.length - 1];
    const anterior = hojas[hojas.length - 2];
    while (anterior.length > 1 && altoHoja(fin, true) < LIMITE_PAGINA_PX * UMBRAL_LLENADO_MINIMO) {
      const candidato = anterior[anterior.length - 1];
      if (!cabe([candidato, ...fin], true)) break;
      if (altoHoja(anterior.slice(0, -1), false) < LIMITE_PAGINA_PX * UMBRAL_LLENADO_MINIMO) break;
      fin.unshift(anterior.pop());
    }
  }

  return [
    hojaResumen,
    ...hojas.map((piezas, i) => {
      const contenedor = document.createElement("div");
      contenedor.className = "informe-page";
      contenedor.innerHTML = armarHtmlPagina(piezas, i === hojas.length - 1);
      return contenedor;
    }),
  ];
}

function construirFooterInternoKuder() {
  return `
    <div class="informe-footer">
      <p>Informe de uso interno para la Unidad de Admisión y Marketing — no está diseñado para entregarse a orientadores ni estudiantes. Las "carreras que UMAG podría incorporar" son una selección editorial preliminar, no una decisión institucional.</p>
    </div>`;
}

// ==================== armado + descarga del PDF ====================

function nombreArchivoInternoKuder() {
  const fecha = new Date().toISOString().slice(0, 10);
  return `Informe_Global_Admision_y_Marketing_UMAG_Kuder_${fecha}.pdf`;
}

async function generarInformeInternoKuderPdf(archivos, periodo) {
  const stats = calcularEstadisticasInternasKuder(archivos);

  const paginas = construirTodasLasPaginasInternoKuder(stats, periodo); // (la última ya trae el pie de página)

  const blob = await paginasAPdfBlob(paginas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoInternoKuder();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
