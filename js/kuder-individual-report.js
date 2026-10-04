// Informe INDIVIDUAL del Test Vocacional de Kuder (uno por estudiante), con el mismo
// diseño que el informe individual de 8° básico (js/report.js): una hoja informativa
// y luego las hojas de resultados personales. Reutiliza tal cual las piezas genéricas
// de js/report.js (banner, pie de página, credencial, cuadros de carreras, motor de
// paginación y de PDF) y de js/kuder-report.js (íconos de área, formato de nombre y
// RUT), pero con las 10 áreas y los textos propios de Kuder (js/kuder-data.js).
//
// Estructura del PDF:
// - Hoja 1 (informativa): qué es el test y por qué existen los test vocacionales,
//   supuestos básicos y principios del modelo de Kuder, y las 10 áreas con TODAS sus
//   carreras UMAG (solo UMAG) — así, si al estudiante le interesa un área que no le
//   salió destacada, igual puede revisar sus carreras.
// - Hojas 2+: credencial del estudiante y una tarjeta por cada área de interés
//   (puntaje 7 o más), con su descripción, "Tus Carreras UMAG" y "Otras carreras".
//
// Igual que en 8° básico: número de lista del estudiante (discreto) según el orden
// alfabético de su curso, nombre en todas las hojas, sin fecha de aplicación, y las
// tarjetas se reparten en hojas sin cortarse a la mitad.

// ==================== utilidades ====================

// "2do" + "A" → "2do A"
function etiquetaCursoKuder(estudiante) {
  return [estudiante.curso, estudiante.letra]
    .map((s) => (s || "").toString().trim())
    .filter(Boolean)
    .join(" ");
}

// número de lista del estudiante: el de la carpeta que se está armando, o si no, su
// número dentro de su colegio+curso+letra en orden alfabético (mismo criterio que
// calcularNumeroEnGrupo de js/report.js, pero sobre los estudiantes de Kuder).
function numeracionEnGrupoKuder(estudiante) {
  return numeracionEnGrupo(typeof storeKuder === "undefined" ? null : storeKuder, estudiante);
}

function calcularNumeroEnGrupoKuder(estudiante) {
  return numeracionEnGrupoKuder(estudiante).numero;
}

function rutParaInformeKuder(estudiante) {
  const rut = (estudiante.rut || "").toString().trim();
  return rut ? escaparHtmlKuder(formatearRutKuder(rut)) : "—";
}

function nombreParaInformeKuder(estudiante) {
  return escaparHtmlKuder(capitalizarNombreKuder(estudiante.nombre)) || "—";
}

// línea compacta "N° · Nombre · RUT" (misma clase .linea-estudiante que en 8°): va
// bajo el banner de la hoja 1 y al comienzo de cada hoja de continuación, para que
// cada hoja suelta siga identificando a su estudiante.
function construirLineaEstudianteKuder(estudiante, { inicioPagina = false } = {}) {
  const numero = calcularNumeroEnGrupoKuder(estudiante);
  return `
    ${inicioPagina ? '<div class="espaciador-inicio-pagina"></div>' : ""}
    ${envolverLineaEstudiante(`
      ${numero ? `<span>N° ${numero}</span>` : ""}
      <span><b>Nombre:</b> ${nombreParaInformeKuder(estudiante)}</span>
      <span><b>RUT:</b> ${rutParaInformeKuder(estudiante)}</span>
      <span><b>Curso:</b> ${escaparHtmlKuder(etiquetaCursoKuder(estudiante)) || "—"}</span>
      <span class="linea-colegio"><b>Colegio:</b> ${escaparHtmlKuder(estudiante.colegio) || "—"}</span>`)}`;
}

// ==================== HOJA 1: informativa ====================

function construirIntroInformativaKuder() {
  return `
    <div class="informe-intro-texto kuder-inf-intro">
      <p>Este informe presenta tus resultados en el Test de Intereses Vocacionales de Kuder, aplicado por la Universidad de Magallanes. No mide inteligencia ni tiene respuestas correctas o incorrectas: muestra qué actividades te atraen más. Si algo te sorprende, tómalo como una invitación a explorar.</p>
      <p><b>¿Por qué existen los test vocacionales?</b> La orientación vocacional nació en 1908 en Boston (EE.UU.): Frank Parsons abrió una oficina para orientar a jóvenes e inmigrantes que llegaban sin un plan a las nuevas industrias. Los test se masificaron en las guerras mundiales, cuando el ejército de EE.UU. evaluó a millones de reclutas para asignarles la tarea en que rendirían mejor; luego se usaron para orientar a veteranos y llegaron a los colegios.</p>
      <p><b>¿Qué es el Test de Kuder?</b> Lo creó el psicólogo estadounidense G. Frederic Kuder a fines de la década de 1930 y es uno de los inventarios de intereses más usados. Es un test de autoinforme: según tus preferencias entre distintas actividades, arma un perfil de 10 áreas que muestra el interés que tú percibes en cada una (en este informe, 7 puntos o más indica un interés destacado).</p>
    </div>`;
}

function construirSupuestosPrincipiosKuder() {
  // Supuestos y principios de la teoría de la elección vocacional de John L. Holland
  // (1959; "Making Vocational Choices", 1973), que las evaluaciones actuales de Kuder
  // integran. El informe de muestra los presentaba como "del test de Kuder": se
  // corrigió la atribución. El que habla del autoinforme sí es propio de Kuder y va en
  // el párrafo "¿Qué es el Test de Kuder?".
  const supuestos = [
    "Las personas se pueden agrupar según sus intereses, que reflejan preferencias y motivaciones (influidas por la herencia y el entorno).",
    "Buscamos entornos donde usar nuestras capacidades, expresar nuestras actitudes y valores y asumir roles satisfactorios.",
    "La conducta de una persona resulta de la interacción entre sus intereses y las características del ambiente.",
  ];
  const principios = [
    "Elegir una carrera es una forma de expresar tu personalidad e intereses.",
    "Quienes ejercen una misma profesión suelen tener intereses y trayectorias parecidas.",
    "La satisfacción, la estabilidad y el logro en el trabajo dependen de qué tanto coinciden tus intereses con el ambiente laboral.",
  ];
  const lista = (items) => `<ol>${items.map((t) => `<li>${t}</li>`).join("")}</ol>`;
  return `
    <div class="kuder-inf-modelo-origen">El modelo detrás del test: la teoría de la elección vocacional de John L. Holland (1959), que hoy integran las evaluaciones de Kuder.</div>
    <div class="kuder-inf-modelo">
      <div class="kuder-inf-modelo-caja">
        <div class="kuder-inf-modelo-titulo">Supuestos básicos</div>
        ${lista(supuestos)}
      </div>
      <div class="kuder-inf-modelo-caja">
        <div class="kuder-inf-modelo-titulo">Principios</div>
        ${lista(principios)}
      </div>
    </div>`;
}

// carreras UMAG de un área en formato compacto para la hoja 1, en dos grupos con su
// rótulo: "Carreras profesionales:" y "Técnico de Nivel Superior en:" (este último
// escrito una sola vez en vez de repetirlo en cada carrera). Las pedagogías se juntan
// en una sola frase ("Pedagogías en A, B y C"), sin omitir ninguna, para que las 10
// áreas quepan en la misma hoja.
function textoCarrerasUmagCompactoKuder(area) {
  const { profesionales, tecnicas } = clasificarCarreras(area.carrerasUMAG);
  const PREFIJO_TNS = /^T[eé]cnico de Nivel Superior en\s+/i;
  const PREFIJO_PED = /^Pedagog[ií]a en\s+/i;
  const pedagogias = profesionales.filter((c) => PREFIJO_PED.test(c)).map((c) => c.replace(PREFIJO_PED, ""));
  const otras = profesionales.filter((c) => !PREFIJO_PED.test(c));
  if (pedagogias.length === 1) otras.push(`Pedagogía en ${pedagogias[0]}`);
  else if (pedagogias.length > 1) otras.push(`Pedagogías en ${unirListaKuder(pedagogias, "y")}`);
  const partes = [];
  if (otras.length) partes.push(`<div><b>Carreras profesionales:</b> ${otras.join(", ")}.</div>`);
  if (tecnicas.length) {
    partes.push(`<div><b>Técnico de Nivel Superior en:</b> ${tecnicas.map((c) => c.replace(PREFIJO_TNS, "")).join(", ")}.</div>`);
  }
  return partes.join("");
}

function construirFilaAreaInformativaKuder(area, conDescripcion) {
  return `
    <div class="kuder-inf-area">
      ${iconoCirculoKuder(area, 30)}
      <div class="kuder-inf-area-caja" style="border-left-color:${area.color};">
        <h4 style="color:${area.color};">${area.nombre}${conDescripcion ? `<span class="kuder-inf-area-desc">${area.descripcionCorta}</span>` : ""}</h4>
        <div class="kuder-inf-area-carreras">${textoCarrerasUmagCompactoKuder(area)}</div>
      </div>
    </div>`;
}

// las 10 áreas en dos columnas independientes (no una grilla de filas parejas): el
// largo de las listas de carreras varía mucho entre áreas (Mecánica tiene 16
// carreras UMAG y Musical 2), y en una grilla cada fila mide lo que la más larga de
// sus dos áreas. Se mide cada área y se prueban todos los repartos posibles entre las
// dos columnas (son solo 2^10), quedándose con el que deja ambas columnas lo más
// parejas posible; dentro de cada columna se respeta el orden normal de las áreas.
function construirGrillaAreasInformativaKuder(conDescripcion, clase = "") {
  const filas = AREAS_KUDER.map((a) => construirFilaAreaInformativaKuder(a, conDescripcion));
  const GAP_PX = 4; // gap de .kuder-inf-col
  const alturas = filas.map((f) =>
    medirAlturaFragmento(`<div class="${clase}"><div class="kuder-inf-areas"><div class="kuder-inf-col">${f}</div><div class="kuder-inf-col"></div></div></div>`)
  );
  const altoColumna = (indices) => indices.reduce((acc, i) => acc + alturas[i], 0) + GAP_PX * Math.max(0, indices.length - 1);

  let mejor = null;
  const n = filas.length;
  for (let mascara = 0; mascara < 1 << n; mascara++) {
    const izq = [];
    const der = [];
    for (let i = 0; i < n; i++) (mascara & (1 << i) ? der : izq).push(i);
    if (!izq.length || !der.length || !izq.includes(0)) continue; // la primera área siempre arriba a la izquierda
    const alto = Math.max(altoColumna(izq), altoColumna(der));
    const desbalance = Math.abs(izq.length - der.length);
    if (!mejor || alto < mejor.alto - 0.5 || (Math.abs(alto - mejor.alto) <= 0.5 && desbalance < mejor.desbalance)) {
      mejor = { alto, desbalance, izq, der };
    }
  }
  return `
    <div class="kuder-inf-areas">
      <div class="kuder-inf-col">${mejor.izq.map((i) => filas[i]).join("")}</div>
      <div class="kuder-inf-col">${mejor.der.map((i) => filas[i]).join("")}</div>
    </div>`;
}

function construirTituloAreasInformativaKuder() {
  return `
    <div class="kuder-inf-areas-titulo">Las 10 áreas de interés y sus carreras en la UMAG<span class="kuder-inf-areas-sub">Revisa también las que no destacaron en tus resultados, si te interesan.</span></div>`;
}

// pie de la hoja 1: la advertencia («Este resultado es una orientación inicial…»), la
// Unidad y el contacto; en la última línea, a la derecha, un aviso corto de que los
// resultados siguen en la página siguiente (en vez de un recuadro grande, para dejar
// más espacio a la letra del resto de la hoja)
function construirPieHoja1Kuder(avisoSiguiente) {
  return `
    <div class="kuder-inf-pie"><div class="informe-footer">
      <p>Este resultado es una orientación inicial y no reemplaza un proceso de orientación vocacional completo. Los intereses cambian y se van descubriendo con el tiempo — ¡esto es solo el comienzo!</p>
      <p class="informe-contacto">Unidad de Admisión y Marketing · Ignacio Carrera Pinto 1015, Punta Arenas · Universidad de Magallanes</p>
      <p class="informe-contacto-extra kuder-inf-pie-ultima"><span>Contáctanos al <b>+56 9 7499 7771</b> · Más información en <b>admision.umag.cl</b></span>${
        avisoSiguiente ? `<span class="kuder-inf-siguiente">${avisoSiguiente}</span>` : ""
      }</p>
    </div></div>`;
}

function construirAvisoSiguienteKuder(texto) {
  return `<div class="kuder-inf-siguiente-solo"><span class="kuder-inf-siguiente">${texto}</span></div>`;
}

// el contenido de la hoja 1 es el mismo para todos los estudiantes (salvo la línea
// con nombre y RUT, que siempre mide una sola línea), así que la variante que cabe se
// calcula una sola vez y se reutiliza en todos los informes de una descarga.
let cacheHojaInformativaKuder = null;

function resolverHojaInformativaKuder() {
  if (cacheHojaInformativaKuder) return cacheHojaInformativaKuder;
  const LIMITE_PAGINA_PX = ALTO_PAGINA_PX - PADDING_INFERIOR_PX;
  const lineaMuestra = `<div class="linea-estudiante"><span>N° 1</span><span><b>Nombre:</b> Nombre de Prueba</span><span><b>RUT:</b> 11.111.111-1</span><span><b>Curso:</b> 2do A</span><span class="linea-colegio"><b>Colegio:</b> Colegio de Prueba</span></div>`;
  const banner = construirBanner("Informe de Intereses Vocacionales", "Test de Intereses Vocacionales de Kuder · Enseñanza Media · UMAG");
  const pie = construirPieHoja1Kuder("Tus resultados están en la página siguiente →");

  // variantes de más holgada a más compacta; se usa la primera que quepa en una hoja
  // la definición de cada área va siempre (no se sacrifica para que quepa): si no
  // cabe, se achica la letra en pasos pequeños
  const variantes = [
    { conDescripcion: true, clase: "" },
    { conDescripcion: true, clase: "kuder-inf-ajustada" },
    { conDescripcion: true, clase: "kuder-inf-compacta" },
    { conDescripcion: true, clase: "kuder-inf-compacta kuder-inf-mini" },
  ];
  for (const v of variantes) {
    const cuerpo = `
      ${construirIntroInformativaKuder()}
      ${construirSupuestosPrincipiosKuder()}
      ${construirTituloAreasInformativaKuder()}
      ${construirGrillaAreasInformativaKuder(v.conDescripcion, v.clase)}`;
    const html = `<div class="kuder-hoja1">${banner}${lineaMuestra}<div class="${v.clase}">${cuerpo}</div>${pie}</div>`;
    if (medirAlturaFragmento(html) <= LIMITE_PAGINA_PX) {
      cacheHojaInformativaKuder = { unaHoja: true, banner, cuerpo, clase: v.clase, pie };
      return cacheHojaInformativaKuder;
    }
  }

  // resguardo (no debería ocurrir con los textos actuales): la explicación en una hoja
  // y las 10 áreas con sus carreras en otra, en vez de cortar contenido.
  cacheHojaInformativaKuder = {
    unaHoja: false,
    banner,
    cuerpo1: `${construirIntroInformativaKuder()}${construirSupuestosPrincipiosKuder()}`,
    pie1: construirPieHoja1Kuder("Las 10 áreas y sus carreras UMAG, en la página siguiente →"),
    cuerpo2: `${construirTituloAreasInformativaKuder()}${construirGrillaAreasInformativaKuder(true)}`,
    pie2: construirAvisoSiguienteKuder("Tus resultados están en la página siguiente →"),
  };
  return cacheHojaInformativaKuder;
}

function construirPaginasInformativasKuder(estudiante) {
  const h = resolverHojaInformativaKuder();
  const crear = (html) => {
    const contenedor = document.createElement("div");
    contenedor.className = "informe-page kuder-hoja1";
    contenedor.innerHTML = html;
    return contenedor;
  };
  if (h.unaHoja) {
    return [crear(`${h.banner}${construirLineaEstudianteKuder(estudiante)}<div class="${h.clase}">${h.cuerpo}</div>${h.pie}`)];
  }
  return [
    crear(`${h.banner}${construirLineaEstudianteKuder(estudiante)}${h.cuerpo1}${h.pie1}`),
    crear(`${construirLineaEstudianteKuder(estudiante, { inicioPagina: true })}${h.cuerpo2}${h.pie2}`),
  ];
}

// ==================== HOJAS 2+: resultados personales ====================

// credencial institucional del estudiante (mismas clases .id-card que en 8°)
function construirCajaEstudianteKuder(estudiante) {
  const numero = calcularNumeroEnGrupoKuder(estudiante);
  const curso = escaparHtmlKuder(etiquetaCursoKuder(estudiante)) || "—";
  const colegio = escaparHtmlKuder(estudiante.colegio) || "—";
  return `
    <div class="id-card-wrap">
      <div class="id-card">
        <div class="id-card-avatar">${ICONO_AVATAR_ANONIMO}</div>
        <div class="id-card-datos">
          <div class="id-card-nombre">${numero ? `<span class="id-card-num">N° ${numero}</span>` : ""}${nombreParaInformeKuder(estudiante)}</div>
          <div class="id-card-sub">${curso} · ${colegio}</div>
          <div class="id-card-sub">RUT: ${rutParaInformeKuder(estudiante)}</div>
        </div>
        <div class="id-card-logo"><img src="${LOGO_UMAG_DATAURI}" alt="UMAG" /></div>
      </div>
    </div>`;
}

// tarjeta de un área: mismo diseño que en 8° (.area-card con "Tus Carreras UMAG" con
// el sello de fondo y "Otras carreras" al lado). Cuando la lista UMAG es muy larga
// (Mecánica, Servicio Social, etc.), ese cuadro toma dos tercios del ancho y reparte
// sus carreras en dos columnas, para que la tarjeta no quede tan alta (y quepan más
// tarjetas por hoja). "espaciosa" = más aire interno, solo para una tarjeta que quedó
// sola en su hoja (misma clase que usan los informes grupales de Kuder). "textoDiverso":
// sin área destacada (ninguna llegó a 7), la descripción armada para ese caso
// (descripcionesAreasDiversas, js/report.js).
function construirTarjetaAreaIndividualKuder(area, espaciosa, textoDiverso = null) {
  const umagAncho = area.carrerasUMAG.length >= 9;
  return `
    <div class="area-card${espaciosa ? " kuder-area-card-espaciosa" : ""}" style="border-left-color:${area.color};">
      <div class="area-card-header">
        ${iconoCirculoKuder(area, 42)}
        <h3 style="color:${area.color};">${area.nombre}</h3>
      </div>
      <p class="area-card-desc">${textoDiverso || area.descripcionEstudiante}</p>
      <div class="area-card-carreras-split${umagAncho ? " kuder-split-umag-ancho" : ""}">
        ${construirListaCarreras("Tus Carreras UMAG", area.carrerasUMAG, "umag")}
        ${construirListaCarreras("Otras carreras", area.carrerasOtras)}
      </div>
    </div>`;
}

// qué áreas lleva el informe (mismo criterio que en 8° básico): TODAS las de puntaje
// 7 o más, sin límite, de mayor a menor puntaje (a igual puntaje, en el orden normal
// de las áreas). Si ninguna llegó a 7, se muestran las 10 áreas y el mensaje le dice
// al estudiante que tiene intereses diversos (no que "no tiene intereses").
function seleccionarAreasInformeKuder(puntajes) {
  const puntaje = (a) => {
    const p = Number(puntajes[a.id]);
    return Number.isFinite(p) ? p : -Infinity;
  };
  const porPuntaje = (a, b) => puntaje(b) - puntaje(a) || AREAS_KUDER.indexOf(a) - AREAS_KUDER.indexOf(b);
  const deInteres = calcularAreasDeInteresKuder(puntajes).sort(porPuntaje);
  if (deInteres.length > 0) return { areas: deInteres, caso: "normal" };
  return { areas: [...AREAS_KUDER].sort(porPuntaje), caso: "ninguna" };
}

function construirEncabezadoResultadosKuder(estudiante, areas, caso) {
  let mensaje;
  if (caso === "ninguna") {
    mensaje = mensajeSinAreaDestacada(areas, estudiante.puntajes);
  } else {
    mensaje = `De acuerdo a tus respuestas, ${areas.length === 1 ? "tu área de interés es" : "tus áreas de interés son"}:`;
  }
  return `
    ${construirCajaEstudianteKuder(estudiante)}
    <div class="informe-intro"><p>${mensaje}</p></div>
  `;
}

// mismo reparto de tarjetas en hojas que el informe de 8° (js/report.js:
// construirPaginasResultados): se miden las tarjetas, se agrupan con
// empaquetarTarjetas (que busca las combinaciones que mejor llenan cada hoja) y se
// verifica el alto real de cada hoja antes de armarla. Además, a una tarjeta que
// queda sola en su hoja se le da la versión "espaciosa" si cabe, para que no quede
// tanto espacio en blanco debajo.
function construirPaginasResultadosKuder(estudiante) {
  const { areas, caso } = seleccionarAreasInformeKuder(estudiante.puntajes);

  const htmlEncabezado = construirEncabezadoResultadosKuder(estudiante, areas, caso);
  const htmlEncabezadoCont = construirLineaEstudianteKuder(estudiante, { inicioPagina: true });
  const htmlAviso = construirAvisoContinua();
  const textosDiversos = caso === "ninguna" ? descripcionesAreasDiversas(areas, estudiante.puntajes) : [];
  const htmlTarjetas = areas.map((a, i) => construirTarjetaAreaIndividualKuder(a, false, textosDiversos[i] || null));
  const htmlTarjetasEspaciosas = areas.map((a, i) => construirTarjetaAreaIndividualKuder(a, true, textosDiversos[i] || null));

  const altoEncabezado = medirAlturaFragmento(htmlEncabezado);
  const altoEncabezadoCont = medirAlturaFragmento(htmlEncabezadoCont);
  const altoReservaInferior = medirAlturaFragmento(htmlAviso);
  const alturasTarjetas = htmlTarjetas.map((html) => medirAlturaFragmento(`<div class="informe-areas" style="margin:0;">${html}</div>`));

  const MARGEN_SEGURIDAD_PX = 20;
  const disponiblePrimera = ALTO_PAGINA_PX - PADDING_INFERIOR_PX - altoEncabezado - altoReservaInferior - MARGEN_SEGURIDAD_PX;
  const disponibleCont = ALTO_PAGINA_PX - PADDING_INFERIOR_PX - altoEncabezadoCont - altoReservaInferior - MARGEN_SEGURIDAD_PX;
  const grupos = empaquetarTarjetas(alturasTarjetas, Math.min(disponiblePrimera, disponibleCont));

  const LIMITE_PAGINA_PX = ALTO_PAGINA_PX - PADDING_INFERIOR_PX;
  function armarHtmlPagina(indices, esPrimera, esUltima, tarjetas = htmlTarjetas) {
    return `
      ${esPrimera ? htmlEncabezado : htmlEncabezadoCont}
      <div class="informe-areas">${indices.map((i) => tarjetas[i]).join("")}</div>
      ${esUltima ? "" : htmlAviso}
    `;
  }

  // la primera hoja de resultados tiene menos espacio (lleva la credencial), así que
  // antes de ajustar se elige para ella el primer grupo de tarjetas que de verdad cabe
  // ahí (medido tal cual va a quedar); si ninguno cabe, sigue el ajuste de abajo. Así
  // se evita que la primera hoja termine con una sola tarjeta y mucho espacio libre
  // cuando otra pareja de tarjetas sí cabía en ella.
  if (grupos.length > 1) {
    const idxQueCabe = grupos.findIndex(
      (g) => medirAlturaFragmento(armarHtmlPagina(g, true, false)) <= LIMITE_PAGINA_PX
    );
    if (idxQueCabe > 0) grupos.unshift(grupos.splice(idxQueCabe, 1)[0]);
  }

  for (let i = 0; i < grupos.length; i++) {
    let intentos = 0;
    while (grupos[i].length > 1 && intentos < 10) {
      const alto = medirAlturaFragmento(armarHtmlPagina(grupos[i], i === 0, i === grupos.length - 1));
      if (alto <= LIMITE_PAGINA_PX) break;
      const sobrante = grupos[i].pop();
      if (i + 1 < grupos.length) grupos[i + 1].unshift(sobrante);
      else grupos.push([sobrante]);
      intentos++;
    }
  }

  return grupos.map((indices, idx) => {
    const esPrimera = idx === 0;
    const esUltima = idx === grupos.length - 1;
    let html = armarHtmlPagina(indices, esPrimera, esUltima);
    if (indices.length === 1) {
      const htmlEspacioso = armarHtmlPagina(indices, esPrimera, esUltima, htmlTarjetasEspaciosas);
      if (medirAlturaFragmento(htmlEspacioso) <= LIMITE_PAGINA_PX) html = htmlEspacioso;
    }
    const contenedor = document.createElement("div");
    contenedor.className = "informe-page";
    contenedor.innerHTML = html;
    return contenedor;
  });
}

// ==================== armado + descarga ====================

// "01 - Nombre Alumno - Segundo C - Colegio.pdf" (ver nombreArchivoNumerado en
// js/report.js). Si el test quedó mal traspasado, lleva su suma entre paréntesis al
// final, por ejemplo "... - Colegio (44 de 45).pdf" (no se puede usar "44/45": la barra
// no está permitida en nombres de archivo).
function nombreArchivoInformeIndividualKuder(estudiante) {
  const traspaso = analizarTraspasoKuder(estudiante.puntajes);
  // los revisados y dejados así ("✓ Dejar así") ya no llevan la marca
  const marca = traspaso.estado === "ok" || traspasoDejadoAsiKuder(estudiante) ? "" : ` (${traspaso.total} de ${SUMA_ESPERADA_KUDER})`;
  return nombreArchivoNumerado(estudiante, numeracionEnGrupoKuder(estudiante), marca);
}

// nota de texto que va dentro del ZIP cuando hay tests mal traspasados: quiénes son,
// cuánto suman y si hay que buscar el error (con qué área revisar primero)
function notaTestsMalTraspasadosKuder(estudiantes) {
  const conError = estudiantes
    .map((e) => ({ e, analisis: analizarTraspasoKuder(e.puntajes) }))
    .filter((x) => x.analisis.estado !== "ok" && !traspasoDejadoAsiKuder(x.e))
    .sort((a, b) => compararNombres(a.e.nombre, b.e.nombre));
  if (conError.length === 0) return null;

  const linea = ({ e, analisis }) => {
    const d = describirTraspasoKuder(analisis);
    const numero = calcularNumeroEnGrupoKuder(e);
    const curso = [e.colegio, etiquetaCursoKuder(e)].filter(Boolean).join(", ");
    return `- ${numero ? `N° ${numero}  ` : ""}${e.nombre} (${curso}): ${d.resumen}. ${d.detalle}`;
  };
  const buscar = conError.filter((x) => x.analisis.afecta);
  const noBuscar = conError.filter((x) => !x.analisis.afecta);
  const hoy = new Date();
  const fecha = `${String(hoy.getDate()).padStart(2, "0")}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${hoy.getFullYear()}`;

  const partes = [
    "TESTS MAL TRASPASADOS (Test de Kuder)",
    `Generado el ${fecha}`,
    "",
    `En el Test de Kuder las 10 áreas de cada estudiante deben sumar ${SUMA_ESPERADA_KUDER} puntos. Estos ${conError.length === 1 ? "estudiante no suma" : `${conError.length} estudiantes no suman`} ${SUMA_ESPERADA_KUDER}: su informe está en esta carpeta igual, con la suma en el nombre del archivo, por ejemplo "(44 de 45)".`,
    `Cuando tengas su hoja de respuestas, corrige sus puntajes en la aplicación (pestaña "Corrección", o el ícono ⚠ junto a su nombre en "Estudiantes e informes") y vuelve a descargar su informe. Si lo revisas y el puntaje queda como está, usa "✓ Dejar así": deja de aparecer como pendiente y su informe sale sin la marca.`,
    "",
  ];
  if (buscar.length) {
    partes.push(`HAY QUE BUSCAR EL ERROR, porque podría cambiar sus resultados (${buscar.length}):`, ...buscar.map(linea), "");
  }
  if (noBuscar.length) {
    partes.push(`NO ES NECESARIO BUSCARLO, sus resultados quedan iguales (${noBuscar.length}):`, ...noBuscar.map(linea), "");
  }
  // BOM + saltos de línea de Windows, para que el Bloc de notas muestre bien las tildes
  return "\ufeff" + partes.join("\r\n");
}

async function construirBlobInformeIndividualKuder(estudiante) {
  const paginas = [...construirPaginasInformativasKuder(estudiante), ...construirPaginasResultadosKuder(estudiante)];
  return paginasAPdfBlob(paginas);
}

function descargarBlobKuder(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function descargarInformeIndividualKuder(estudiante) {
  const blob = await construirBlobInformeIndividualKuder(estudiante);
  descargarBlobKuder(blob, nombreArchivoInformeIndividualKuder(estudiante));
  storeKuder.registrarInformeGenerado();
}

// el ZIP de un curso se llama igual que su carpeta: "KUDER_Colegio_2do_Medio_C_2026.zip"
function nombreZipInformesIndividualesKuder(estudiantes) {
  return `${nombreCarpetaCurso("KUDER", estudiantes)}.zip`;
}

// agrega a "carpeta" (el ZIP completo o una subcarpeta de él) el informe de cada
// estudiante, numerados del 1 al total, y la nota con los tests mal traspasados si los hay
async function agregarInformesACarpetaKuder(carpeta, estudiantes, alTerminarUno) {
  const usados = new Map();
  const numerados = numerarParaCarpeta(estudiantes);
  for (const e of numerados) {
    const blob = await construirBlobInformeIndividualKuder(e);
    let nombre = nombreArchivoInformeIndividualKuder(e);
    const veces = usados.get(nombre) || 0;
    usados.set(nombre, veces + 1);
    if (veces > 0) nombre = nombre.replace(/\.pdf$/, `_${veces + 1}.pdf`);
    carpeta.file(nombre, blob);
    storeKuder.registrarInformeGenerado();
    if (alTerminarUno) alTerminarUno();
  }
  // el guion bajo al inicio la deja primera en la carpeta, antes de los informes
  const nota = notaTestsMalTraspasadosKuder(numerados);
  if (nota) carpeta.file("_Revisar_tests_mal_traspasados.txt", nota);
}

async function descargarInformesMasivoKuder(estudiantes, onProgreso) {
  const zip = new JSZip();
  let hechos = 0;
  await agregarInformesACarpetaKuder(zip, estudiantes, () => onProgreso && onProgreso(++hechos, estudiantes.length));
  const contenidoZip = await zip.generateAsync({ type: "blob" });
  descargarBlobKuder(contenidoZip, nombreZipInformesIndividualesKuder(estudiantes));
}

// "Cargar y descargar" con varios cursos a la vez: un solo ZIP con una subcarpeta por
// curso (así el navegador no dispara varias descargas seguidas); con un solo curso,
// es la misma carpeta de siempre.
async function descargarCarpetasDeCursosKuder(cursos, onProgreso) {
  if (cursos.length === 1) return descargarInformesMasivoKuder(cursos[0], onProgreso);
  const zip = new JSZip();
  const total = cursos.reduce((acc, c) => acc + c.length, 0);
  let hechos = 0;
  const nombresCarpeta = new Map();
  for (const estudiantes of cursos) {
    let nombre = nombreCarpetaCurso("KUDER", estudiantes);
    const veces = nombresCarpeta.get(nombre) || 0;
    nombresCarpeta.set(nombre, veces + 1);
    if (veces > 0) nombre += `_${veces + 1}`;
    await agregarInformesACarpetaKuder(zip.folder(nombre), estudiantes, () => onProgreso && onProgreso(++hechos, total));
  }
  const contenidoZip = await zip.generateAsync({ type: "blob" });
  descargarBlobKuder(contenidoZip, nombreZipVariosCursos("KUDER", cursos.flat(), cursos.length));
}

// informe GRUPAL (para orientadores, js/kuder-report.js) de un curso ya cargado en la
// app — el mismo que se genera en la pestaña "Informes para orientadores" subiendo
// el archivo, pero sin tener que volver a subirlo. Sirve para los dos tests: "config"
// es CONFIG_GRUPAL_KUDER o CONFIG_GRUPAL_OCTAVO.
async function descargarInformeGrupalDesdeCurso(estudiantes, config) {
  const primero = estudiantes[0] || {};
  const fechas = [...new Set(estudiantes.map((e) => e.fecha).filter(Boolean))];
  const datosCurso = { colegio: primero.colegio || "", curso: etiquetaCursoKuder(primero), letra: "", fecha: fechas.length === 1 ? fechas[0] : "" };
  await generarInformeGrupalKuderPdf(datosCurso, estudiantes, config);
}

// ==================== respaldo en Excel y planilla en blanco ====================

function exportarExcelKuder() {
  const todos = storeKuder.listar({ incluirPapelera: true });
  const filas = todos.map((e) => {
    const areas = calcularAreasDeInteresKuder(e.puntajes);
    const fila = {
      Colegio: e.colegio,
      Curso: e.curso,
      Letra: e.letra,
      Nombre: e.nombre,
      RUT: e.rut,
      "Fecha de aplicación": e.fecha,
    };
    AREAS_KUDER.forEach((a) => (fila[a.nombre] = e.puntajes[a.id]));
    const traspaso = analizarTraspasoKuder(e.puntajes);
    const d = describirTraspasoKuder(traspaso);
    fila[`Suma (debe ser ${SUMA_ESPERADA_KUDER})`] = traspaso.total;
    fila["Revisión de traspaso"] =
      traspaso.estado === "ok"
        ? "Bien traspasado"
        : traspasoDejadoAsiKuder(e)
          ? `${d.resumen}. Revisado y dejado así`
          : `${d.resumen}. ${d.accion}. ${d.detalle}`;
    fila["Área(s) de interés"] = areas.length ? areas.map((a) => a.nombre).join(", ") : "Ninguna destacada";
    fila["Estado"] = e.eliminado ? "En papelera" : "Activo";
    fila["Última actualización"] = e.actualizadoEn ? new Date(e.actualizadoEn).toLocaleString("es-CL") : "";
    return fila;
  });
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Estudiantes Kuder");
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `Respaldo_Test_Kuder_${fecha}.xlsx`);
}

// misma estructura de columnas que exporta el sistema de Kuder (rut, las 10 áreas,
// nombre, colegio, curso), por si hace falta armar una planilla a mano.
function descargarPlanillaEnBlancoKuder() {
  const encabezados = ["rut", "nombre", ...AREAS_KUDER.map((a) => a.id), "colegio", "curso"];
  const hoja = XLSX.utils.aoa_to_sheet([encabezados]);
  hoja["!cols"] = encabezados.map((h) => ({ wch: h === "nombre" ? 28 : h === "colegio" ? 22 : 11 }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Kuder");
  XLSX.writeFile(libro, "Planilla_Kuder_en_blanco.xlsx");
}
