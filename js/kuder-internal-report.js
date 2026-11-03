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

// ==================== agrupar curso -> nivel (2do, 4to, 8vo...), sin la letra ====================

// a la unidad no le interesa "4to A" vs "4to B", sino cuánta demanda hay por "4to medio"
// en general. Se reconoce el número + el sufijo ordinal (do/to/vo/ro/er/mo) al inicio del
// texto y se descarta el resto (letra de sección, "medio", etc.); si no hay "medio" ni
// "básico" explícito se infiere uno razonable para el contexto de este test (Enseñanza
// Media): 8° siempre es básico (no existe "8° medio" en Chile), el resto se asume medio.
// Si el texto no calza con el patrón esperado, se deja tal cual como respaldo.
const NIVEL_CURSO_REGEX = /^(\d{1,2})\s*[°º]?\s*(?:er|ro|do|to|vo|mo)?\.?\s*(medio|b[aá]sico)?/i;

function extraerNivelCurso(cursoTexto) {
  const t = (cursoTexto || "").trim();
  if (!t) return "Sin curso";
  const m = NIVEL_CURSO_REGEX.exec(t);
  if (!m || !m[1]) return t;
  const numero = m[1];
  const nivelExplicito = m[2] ? (m[2].toLowerCase().startsWith("b") ? "Básico" : "Medio") : null;
  const nivel = nivelExplicito || (numero === "8" ? "Básico" : "Medio");
  return `${numero}° ${nivel}`;
}

// ==================== cálculo de estadísticas ====================

// se agrupa por versión en minúsculas del texto (colegio/nivel) para que variaciones de
// mayúsculas entre archivos — probado con datos reales: un colegio escribió "4to D" en
// un archivo y "4TO D" en otro — no se cuenten como si fueran dos grupos distintos; para
// mostrar se usa el primer texto tal cual apareció, no la versión en minúsculas.
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
  return [...mapa.values()].sort((a, b) => b.aplicaciones - a.aplicaciones || b.estudiantes - a.estudiantes);
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

  const rankingNiveles = agruparConteoTexto(
    archivos.map((a) => ({ texto: extraerNivelCurso(a.curso), nEstudiantes: a.estudiantes.length })),
    "Sin nivel"
  ).map((r) => ({ nivel: r.texto, aplicaciones: r.aplicaciones, estudiantes: r.estudiantes }));

  const todosLosEstudiantes = archivos.flatMap((a) => a.estudiantes);
  const conteosAreas = calcularConteosPorAreaKuder(todosLosEstudiantes);

  const areasPorEstudiante = todosLosEstudiantes.map((e) => calcularAreasDeInteresKuder(e.puntajes).length);
  const sinAreaClara = areasPorEstudiante.filter((n) => n === 0).length;
  const promedioAreasInteres = totalEstudiantes > 0 ? areasPorEstudiante.reduce((acc, n) => acc + n, 0) / totalEstudiantes : 0;

  const top3AplicacionesColegios = rankingColegios.slice(0, 3).reduce((acc, r) => acc + r.aplicaciones, 0);
  const pctTop3Colegios = totalTests > 0 ? Math.round((top3AplicacionesColegios / totalTests) * 100) : 0;

  // los colegios con más estudiantes evaluados (a igual cantidad, el que tiene más cursos)
  const colegiosPorEstudiantes = [...rankingColegios].sort((a, b) => b.estudiantes - a.estudiantes || b.aplicaciones - a.aplicaciones);
  const top3Estudiantes = colegiosPorEstudiantes.slice(0, 3).reduce((acc, r) => acc + r.estudiantes, 0);
  const pctTop3Estudiantes = totalEstudiantes > 0 ? Math.round((top3Estudiantes / totalEstudiantes) * 100) : 0;

  const areasOrdenadas = [...AREAS_KUDER].sort((a, b) => (conteosAreas[b.id] || 0) - (conteosAreas[a.id] || 0));

  return {
    totalTests,
    totalEstudiantes,
    colegiosDistintos: rankingColegios.length,
    nivelesDistintos: rankingNiveles.length,
    promedioPorCurso,
    rankingColegios,
    rankingNiveles,
    conteosAreas,
    areasOrdenadas,
    todosLosEstudiantes,
    sinAreaClara,
    pctSinAreaClara: totalEstudiantes > 0 ? Math.round((sinAreaClara / totalEstudiantes) * 100) : 0,
    promedioAreasInteres,
    pctTop3Colegios,
    colegiosPorEstudiantes,
    pctTop3Estudiantes,
    promedioPorColegio: rankingColegios.length > 0 ? totalEstudiantes / rankingColegios.length : 0,
    promedioCursosPorColegio: rankingColegios.length > 0 ? totalTests / rankingColegios.length : 0,
    conAreaClara: totalEstudiantes - sinAreaClara,
    pctConAreaClara: totalEstudiantes > 0 ? Math.round(((totalEstudiantes - sinAreaClara) / totalEstudiantes) * 100) : 0,
  };
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
// Cifras grandes y fáciles de leer: totales, promedios, los 3 colegios que más solicitan
// el test (N° de cursos evaluados) y los 3 con más estudiantes evaluados, los niveles
// y las 5 áreas de interés más frecuentes. El detalle completo va en las hojas siguientes.

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

function construirTopColegiosInterno(titulo, sub, filas, dato, pie) {
  return `
    <div class="ejec-caja">
      <div class="ejec-caja-titulo">${titulo}</div>
      <div class="ejec-caja-sub">${sub}</div>
      <div class="ejec-top">
        ${filas
          .map(
            (f, i) => `
          <div class="ejec-top-fila">
            <span class="ejec-pos">${i + 1}</span>
            <span class="ejec-nombre">${escaparHtmlKuder(f.colegio)}</span>
            <span class="ejec-dato">${dato(f)}</span>
          </div>`
          )
          .join("")}
      </div>
      <div class="ejec-caja-pie">${pie}</div>
    </div>`;
}

const NIVELES_EN_RESUMEN = 5;
const AREAS_EN_RESUMEN = 5;

// "compacto": menos aire, para cuando los nombres de colegio son largos y no cabe la hoja
function construirResumenEjecutivoInternoKuder(stats, { compacto = false } = {}) {
  const total = stats.totalEstudiantes;
  const top3Cursos = stats.rankingColegios.slice(0, 3);
  const top3Estudiantes = stats.colegiosPorEstudiantes.slice(0, 3);
  const niveles = stats.rankingNiveles.slice(0, NIVELES_EN_RESUMEN);
  const nivelesRestantes = stats.rankingNiveles.length - niveles.length;
  const maxNivel = Math.max(1, ...niveles.map((n) => n.estudiantes));
  const topAreas = stats.areasOrdenadas.slice(0, AREAS_EN_RESUMEN).map((area) => ({ area, c: stats.conteosAreas[area.id] || 0 }));

  return `
    <div class="ejec${compacto ? " ejec-compacto" : ""}">
      <div class="ejec-kpis">
        <div class="ejec-kpi"><div class="ejec-num">${total}</div><div class="ejec-lbl">Estudiantes evaluados</div></div>
        <div class="ejec-kpi"><div class="ejec-num">${stats.colegiosDistintos}</div><div class="ejec-lbl">Colegios atendidos</div></div>
        <div class="ejec-kpi"><div class="ejec-num">${stats.totalTests}</div><div class="ejec-lbl">Cursos evaluados</div></div>
        <div class="ejec-kpi"><div class="ejec-num">${stats.pctConAreaClara}%</div><div class="ejec-lbl">Con al menos un área de interés clara</div></div>
      </div>

      <div class="ejec-promedios">
        <div class="ejec-prom"><b>${decimalInterno(stats.promedioPorCurso)}</b><span>estudiantes por curso, en promedio</span></div>
        <div class="ejec-prom"><b>${decimalInterno(stats.promedioPorColegio)}</b><span>estudiantes por colegio, en promedio</span></div>
        <div class="ejec-prom"><b>${decimalInterno(stats.promedioCursosPorColegio)}</b><span>cursos por colegio, en promedio</span></div>
        <div class="ejec-prom"><b>${decimalInterno(stats.promedioAreasInteres)}</b><span>áreas de interés por estudiante, en promedio</span></div>
      </div>

      <div class="ejec-dos">
        ${construirTopColegiosInterno(
          "Colegios que más nos solicitan el test",
          "según el N° de cursos evaluados",
          top3Cursos,
          (f) => `<b>${f.aplicaciones}</b> ${f.aplicaciones === 1 ? "curso" : "cursos"} · ${f.estudiantes} est.`,
          `Estos ${top3Cursos.length} colegios concentran el <b>${stats.pctTop3Colegios}%</b> de los cursos evaluados.`
        )}
        ${construirTopColegiosInterno(
          "Colegios con más estudiantes evaluados",
          "según el N° de estudiantes",
          top3Estudiantes,
          (f) => `<b>${f.estudiantes}</b> est. · ${porcentajeInterno(f.estudiantes, total)}%`,
          `Estos ${top3Estudiantes.length} colegios concentran el <b>${stats.pctTop3Estudiantes}%</b> de los estudiantes evaluados.`
        )}
      </div>

      <div class="ejec-dos">
        <div class="ejec-caja">
          <div class="ejec-caja-titulo">Niveles evaluados</div>
          <div class="ejec-caja-sub">sin distinguir la letra del curso</div>
          ${niveles
            .map(
              (n) => `
            <div class="ejec-barra-fila">
              <div class="ejec-barra-texto"><b>${escaparHtmlKuder(n.nivel)}</b><span>${pluralInterno(n.aplicaciones, "curso", "cursos")} · ${n.estudiantes} est.</span></div>
              <div class="ejec-barra"><div style="width:${(n.estudiantes / maxNivel) * 100}%;"></div></div>
            </div>`
            )
            .join("")}
          ${nivelesRestantes > 0 ? `<div class="ejec-caja-pie">Y ${pluralInterno(nivelesRestantes, "nivel más", "niveles más")} (detalle en las hojas siguientes).</div>` : ""}
        </div>
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
      </div>

      <div class="ejec-nota">
        <b>Curso evaluado</b> = una aplicación del Test de Kuder a un curso. <b>Área de interés clara</b> = puntaje 7 o más en esa área. "est." = estudiantes.
        El detalle por colegio, por nivel y por área está en las hojas siguientes.
      </div>
    </div>`;
}

// ==================== rankings: colegios y niveles ====================

function construirTablaRankingKuder(titulo, filas, columnas) {
  return `
    <div class="kuder-ranking-bloque">
      <div class="kuder-resumen-titulo">${titulo}</div>
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

// con muchos colegios la tabla no cabe en una hoja: se parte en tramos que sí caben en
// una hoja (se mide fila por fila, porque un nombre largo ocupa dos líneas), cada uno su
// propio bloque (los siguientes con "(continuación)"), y la paginación los reparte
const ALTO_MAXIMO_TRAMO_RANKING = ALTO_PAGINA_PX - PADDING_INFERIOR_PX - 130;

function construirBloquesRankingColegiosInterno(stats) {
  const titulo = "Colegios que más solicitan el test (por N° de cursos evaluados)";
  const columnas = [
    { key: "posicion", label: "N°", align: "right" },
    { key: "colegio", label: "Colegio" },
    { key: "aplicaciones", label: "Cursos", align: "right" },
    { key: "estudiantes", label: "Estudiantes", align: "right" },
    { key: "promedio", label: "Promedio por curso", align: "right" },
    { key: "pct", label: "% de estudiantes", align: "right" },
  ];
  const filas = stats.rankingColegios.map((f, i) => ({
    ...f,
    posicion: i + 1,
    colegio: escaparHtmlKuder(f.colegio),
    promedio: decimalInterno(f.estudiantes / f.aplicaciones),
    pct: `${porcentajeInterno(f.estudiantes, stats.totalEstudiantes)}%`,
  }));
  const bloques = [];
  let tramo = [];
  const armar = (filasTramo) => construirTablaRankingKuder(bloques.length === 0 ? titulo : `${titulo} (continuación)`, filasTramo, columnas);
  for (const fila of filas) {
    if (tramo.length && medirAlturaFragmento(armar([...tramo, fila])) > ALTO_MAXIMO_TRAMO_RANKING) {
      bloques.push(armar(tramo));
      tramo = [];
    }
    tramo.push(fila);
  }
  bloques.push(armar(tramo));
  return bloques;
}

function construirBloqueRankingNivelesInterno(stats) {
  const filas = stats.rankingNiveles.map((f) => ({
    ...f,
    nivel: escaparHtmlKuder(f.nivel),
    promedio: decimalInterno(f.estudiantes / f.aplicaciones),
    pct: `${porcentajeInterno(f.estudiantes, stats.totalEstudiantes)}%`,
  }));
  return construirTablaRankingKuder("Niveles evaluados (sin distinguir la letra del curso)", filas, [
    { key: "nivel", label: "Nivel" },
    { key: "aplicaciones", label: "Cursos", align: "right" },
    { key: "estudiantes", label: "Estudiantes", align: "right" },
    { key: "promedio", label: "Promedio por curso", align: "right" },
    { key: "pct", label: "% de estudiantes", align: "right" },
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
function construirBloqueGraficoAreasInterno(stats) {
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
    <div class="kuder-chart-bloque">
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
function construirTodasLasPaginasInternoKuder(stats, periodo) {
  // hoja 1: solo el resumen ejecutivo, para gerencia (ver construirResumenEjecutivoInternoKuder)
  const hojaResumen = document.createElement("div");
  hojaResumen.className = "informe-page";
  const armarResumen = (compacto) => `
    ${construirBanner("Informe Interno · Test Vocacional de Kuder", "Enseñanza Media · documento de uso interno")}
    ${construirCajaResumenInternoKuder(stats, periodo)}
    ${construirResumenEjecutivoInternoKuder(stats, { compacto })}
  `;
  hojaResumen.innerHTML = medirAlturaFragmento(armarResumen(false)) <= ALTO_PAGINA_PX - PADDING_INFERIOR_PX ? armarResumen(false) : armarResumen(true);

  // el detalle parte en la hoja 2, todas con el mismo encabezado liviano
  const htmlEncabezadoCont = `
    <div class="espaciador-inicio-pagina"></div>
    <div class="linea-estudiante"><span><b>Informe interno</b> — Test Vocacional de Kuder (Admisión y Marketing)</span></div>`;
  const htmlEncabezadoPrimera = htmlEncabezadoCont;
  const htmlAviso = construirAvisoContinua();

  const areasOrdenadas = stats.areasOrdenadas;
  const htmlTarjetasArea = areasOrdenadas.map((area) =>
    // cada tarjeta se envuelve en su propio .informe-areas (con su margen real, no
    // recortado a 0) porque acá cada tarjeta es su propio bloque independiente, no un
    // grupo de varias compartiendo un solo contenedor flex como en el informe de
    // orientadores — así lo medido coincide exactamente con lo que se renderiza.
    `<div class="informe-areas">${construirTarjetaAreaInternaKuder(area, stats.conteosAreas[area.id] || 0, stats.totalEstudiantes)}</div>`
  );

  const bloques = [
    ...construirBloquesRankingColegiosInterno(stats),
    construirBloqueRankingNivelesInterno(stats),
    construirBloqueGraficoAreasInterno(stats),
    ...htmlTarjetasArea,
  ];

  const alturaPrimera = medirAlturaFragmento(htmlEncabezadoPrimera);
  const alturaCont = medirAlturaFragmento(htmlEncabezadoCont);
  const alturaAviso = medirAlturaFragmento(htmlAviso);
  const alturasBloques = bloques.map((html) => medirAlturaFragmento(html));

  const LIMITE_PAGINA_PX = ALTO_PAGINA_PX - PADDING_INFERIOR_PX;
  const MARGEN_SEGURIDAD_PX = 20;

  const paginasArmadas = [];
  let i = 0;
  let esPrimera = true;
  while (i < bloques.length) {
    const altoEncabezado = esPrimera ? alturaPrimera : alturaCont;
    let disponible = LIMITE_PAGINA_PX - altoEncabezado - alturaAviso - MARGEN_SEGURIDAD_PX;
    const indices = [];
    while (i < bloques.length && alturasBloques[i] <= disponible) {
      indices.push(i);
      disponible -= alturasBloques[i];
      i++;
    }
    if (indices.length === 0) {
      // un solo bloque ya es más alto que el espacio disponible: se deja solo en su
      // página de todas formas (mejor que quedar en un loop infinito).
      indices.push(i);
      i++;
    }
    paginasArmadas.push({ esPrimera, indices });
    esPrimera = false;
  }

  // el presupuesto de arriba suma alturas medidas por separado, y ese margen entre
  // bloques puede colapsar distinto al medirlos sueltos que al concatenarlos de
  // verdad en una misma página — con hasta 14 bloques (4 del resumen + 10 tarjetas de
  // área) ese desajuste se nota más que en el resto del informe. Por eso, igual que la
  // paginación de tarjetas de área del informe de orientadores, cada página ya armada
  // se mide de verdad; si se pasa del límite, se saca su último bloque y pasa a la
  // página siguiente (o abre una nueva si era la última), repitiendo hasta que todas
  // quepan de verdad.
  // la última hoja lleva el pie de página institucional; se cuenta al armarla (antes se
  // agregaba después, y si esa hoja venía llena, el pie la hacía pasarse de la hoja)
  const htmlPie = construirFooterInternoKuder();
  function armarHtmlPagina(indices, esPrimeraPagina, esUltimaPagina) {
    const encabezado = esPrimeraPagina ? htmlEncabezadoPrimera : htmlEncabezadoCont;
    const contenido = indices.map((idx) => bloques[idx]).join("");
    return `${encabezado}${contenido}${esUltimaPagina ? htmlPie : htmlAviso}`;
  }
  for (let pIdx = 0; pIdx < paginasArmadas.length; pIdx++) {
    let intentos = 0;
    while (paginasArmadas[pIdx].indices.length > 1 && intentos < 10) {
      const esUltima = pIdx === paginasArmadas.length - 1;
      const alto = medirAlturaFragmento(armarHtmlPagina(paginasArmadas[pIdx].indices, paginasArmadas[pIdx].esPrimera, esUltima));
      if (alto <= LIMITE_PAGINA_PX) break;
      const sobrante = paginasArmadas[pIdx].indices.pop();
      if (pIdx + 1 < paginasArmadas.length) {
        paginasArmadas[pIdx + 1].indices.unshift(sobrante);
      } else {
        paginasArmadas.push({ esPrimera: false, indices: [sobrante] });
      }
      intentos++;
    }
  }

  // el reparto "primero llena esta página, después la siguiente" puede dejar la
  // ÚLTIMA página de un tramo con muy poco contenido si lo que sobra no alcanza a
  // llenar una hoja completa (acá, 10 tarjetas de área de a 3 por página dejan una
  // sola suelta al final) — se le "pide prestado" un bloque a la vez a la página
  // anterior mientras la última quede notoriamente vacía y el préstamo no haga
  // desbordar a la que lo recibe; mismo total de páginas, mejor repartidas.
  const UMBRAL_LLENADO_MINIMO = 0.65;
  for (let pIdx = paginasArmadas.length - 1; pIdx > 0; pIdx--) {
    const actual = paginasArmadas[pIdx];
    const anterior = paginasArmadas[pIdx - 1];
    let alturaActual = medirAlturaFragmento(armarHtmlPagina(actual.indices, actual.esPrimera, pIdx === paginasArmadas.length - 1));
    while (anterior.indices.length > 1 && alturaActual < LIMITE_PAGINA_PX * UMBRAL_LLENADO_MINIMO) {
      const candidato = anterior.indices[anterior.indices.length - 1];
      const nuevosIndices = [candidato, ...actual.indices];
      const nuevaAltura = medirAlturaFragmento(armarHtmlPagina(nuevosIndices, actual.esPrimera, pIdx === paginasArmadas.length - 1));
      if (nuevaAltura > LIMITE_PAGINA_PX) break; // no cabe entero: se deja como está
      anterior.indices.pop();
      actual.indices.unshift(candidato);
      alturaActual = nuevaAltura;
    }
  }

  return [
    hojaResumen,
    ...paginasArmadas.map((p, pageIdx) => {
      const esUltima = pageIdx === paginasArmadas.length - 1;
      const contenedor = document.createElement("div");
      contenedor.className = "informe-page";
      contenedor.innerHTML = armarHtmlPagina(p.indices, p.esPrimera, esUltima);
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
  return `Informe_Interno_Kuder_AdmisionMarketing_${fecha}.pdf`;
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
