// Lógica de la interfaz: selector de test (8° básico / Kuder), pestañas, formularios,
// tablas, deshacer/rehacer, descargas.
//
// Las pestañas "Ingresar datos", "Estudiantes e informes", "Estadísticas" y
// "Papelera" son las mismas para los dos tests, pero siempre trabajan sobre el test
// elegido arriba: cada test trae su propio guardado, sus áreas, su lector de planillas
// y su informe (ver TESTS), así los datos de uno nunca se mezclan con los del otro.
// Las pestañas "Informes para orientadores" y "Uso interno" son solo de Kuder
// (js/kuder.js y js/kuder-internal.js).

const STORAGE_KEY_TEST_ACTIVO = "orientando_intereses_test_activo";

const TESTS = {
  octavo: {
    id: "octavo",
    nombre: "Test 8vos",
    store: store,
    areas: AREAS,
    calcularAreas: calcularAreasDeInteres,
    puntajeMin: PUNTAJE_MIN,
    puntajeMax: PUNTAJE_MAX,
    storageKeyCurso: "orientando_intereses_curso_actual",
    placeholderCurso: "Ej: 8vo",
    leerPlanilla: leerPlanillaCorreccion,
    errorLectura: "No se pudo leer este archivo. ¿Es un .xlsx válido?",
    numeroEnGrupo: calcularNumeroEnGrupo,
    formatearRut: (rut) => rut || "",
    revisarTraspaso: null, // el cuestionario de 8° no tiene una suma fija que revisar
    describirTraspaso: null,
    huellaTraspaso: null,
    descargarIndividual: descargarInformeIndividual,
    construirBlobIndividual: (e) => paginasAPdfBlob([construirPaginaPortada(e), ...construirPaginasResultados(e)]),
    nombreArchivoIndividual: nombreArchivoInforme,
    descargarMasivo: descargarInformesMasivo,
    agregarInformesACarpeta: agregarInformesACarpeta,
    prefijoCarpetas: "8VO", // carpetas y ZIP: 8VO_Colegio_8vo_A_2026
    configGrupal: CONFIG_GRUPAL_OCTAVO, // informe grupal para orientadores (js/kuder-report.js)
    exportarExcel: exportarExcel,
  },
  kuder: {
    id: "kuder",
    nombre: "Test de Kuder",
    store: storeKuder,
    areas: AREAS_KUDER,
    calcularAreas: calcularAreasDeInteresKuder,
    puntajeMin: PUNTAJE_MIN_KUDER,
    puntajeMax: PUNTAJE_MAX_KUDER,
    storageKeyCurso: "orientando_intereses_kuder_curso_actual",
    placeholderCurso: "Ej: 2do medio",
    leerPlanilla: leerPlanillaKuderParaImportar,
    errorLectura: "No se pudo leer este archivo. ¿Es un .csv/.xlsx de Kuder válido?",
    numeroEnGrupo: calcularNumeroEnGrupoKuder,
    formatearRut: (rut) => (rut ? formatearRutKuder(rut) : ""),
    revisarTraspaso: analizarTraspasoKuder, // las 10 áreas deben sumar 45 (js/kuder-data.js)
    describirTraspaso: describirTraspasoKuder,
    huellaTraspaso: huellaPuntajesKuder, // "✓ Dejar así" (js/kuder-data.js)
    descargarIndividual: descargarInformeIndividualKuder,
    construirBlobIndividual: construirBlobInformeIndividualKuder,
    nombreArchivoIndividual: nombreArchivoInformeIndividualKuder,
    descargarMasivo: descargarInformesMasivoKuder,
    descargarVariosCursos: descargarCarpetasDeCursosKuder,
    agregarInformesACarpeta: agregarInformesACarpetaKuder,
    prefijoCarpetas: "KUDER", // carpetas y ZIP: KUDER_Colegio_2do_Medio_C_2026
    configGrupal: CONFIG_GRUPAL_KUDER,
    exportarExcel: exportarExcelKuder,
  },
};

const TABS_SOLO_KUDER = ["correccion", "kuder-interno"]; // "Informes para orientadores" (panel-kuder) es de los dos tests
// pestañas donde "Editar" abre el panel de edición debajo del estudiante, en la misma lista
const TABS_CON_EDICION_EN_LISTA = ["estudiantes", "correccion"];

const estado = {
  test: "octavo",
  tab: "ingresar",
  editandoId: null,
  filtros: { colegio: "", curso: "", letra: "", nombre: "", soloTraspaso: false },
  // pestaña "Estudiantes e informes": qué colegios/cursos están desplegados o plegados a
  // mano (para que no cambien cada vez que se actualiza la lista) y a quién se está
  // editando ahí mismo
  gruposAbiertos: new Set(),
  gruposCerrados: new Set(),
  edicionEnLista: null,
  filtrosPapelera: { colegio: "", curso: "", nombre: "" },
  filtrosCorreccion: { colegio: "", tipo: "", nombre: "" },
  subCorreccion: "pendientes", // pestaña "Corrección": "pendientes" o "recientes" (Recién corregidos)
};

// configuración del test elegido arriba
function cfg() {
  return TESTS[estado.test];
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY_TEST_ACTIVO);
    if (guardado && TESTS[guardado]) estado.test = guardado;
  } catch (e) {
    console.error("No se pudo leer el test elegido la última vez.", e);
  }
  aplicarTestActivo();
  cablearSelectorTest();
  cablearTabs();
  cablearTopbar();
  cablearCursoHeader();
  cablearFormulario();
  cablearImportacion();
  cablearModal();
  cablearCorreccionPuntajes();
  cablearVistaPdf();
  cablearDatosAlumno();
  cablearRenombrarColegio();
  render();
});

// ---------------- utilidades UI ----------------

function mostrarToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("mostrar");
  clearTimeout(mostrarToast._t);
  mostrarToast._t = setTimeout(() => t.classList.remove("mostrar"), 2200);
}

// modal de confirmación genérico, para acciones destructivas importantes
function cablearModal() {
  document.getElementById("modal-btn-cancelar").addEventListener("click", cerrarModal);
  document.getElementById("modal-confirmacion").addEventListener("click", (ev) => {
    if (ev.target.id === "modal-confirmacion") cerrarModal();
  });
}

// "onCancelar" (opcional): se llama si se cierra sin confirmar
let alCancelarModal = null;

function cerrarModal() {
  document.getElementById("modal-confirmacion").style.display = "none";
  const alCancelar = alCancelarModal;
  alCancelarModal = null;
  if (alCancelar) alCancelar();
}

function confirmarAccion({ titulo, texto, textoBoton = "Confirmar", onConfirmar, onCancelar = null }) {
  document.getElementById("modal-titulo").textContent = titulo;
  document.getElementById("modal-texto").textContent = texto;
  const btn = document.getElementById("modal-btn-confirmar");
  btn.textContent = textoBoton;
  alCancelarModal = onCancelar;
  btn.onclick = () => {
    alCancelarModal = null;
    cerrarModal();
    onConfirmar();
  };
  document.getElementById("modal-confirmacion").style.display = "flex";
}

function render() {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("activo", b.dataset.tab === estado.tab));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("activo", p.id === "panel-" + estado.tab));

  document.getElementById("btn-deshacer").disabled = !cfg().store.puedeDeshacer();
  document.getElementById("btn-rehacer").disabled = !cfg().store.puedeRehacer();
  renderConteosSelector();
  renderConteoCorreccion();

  if (estado.tab === "ingresar") renderDatosRecientes();
  if (estado.tab === "estudiantes") renderEstudiantes();
  if (estado.tab === "correccion") renderCorreccion();
  if (estado.tab === "papelera") renderPapelera();
  if (estado.tab === "estadisticas") renderEstadisticas();
  if (estado.tab === "kuder-interno" && typeof renderCsvInternoKuder === "function") renderCsvInternoKuder();
  // las pestañas de informes vuelven a leer los cursos elegidos de la app (por si se
  // corrigió algo en otra pestaña), y el editor de carpetas se pone al día
  if (estado.tab === "kuder" && typeof refrescarPanelOrientadores === "function") refrescarPanelOrientadores();
  if (estado.tab === "kuder-interno" && typeof refrescarPanelInterno === "function") refrescarPanelInterno();
  if (estado.tab === "estudiantes" && typeof renderEditorCarpetas === "function") renderEditorCarpetas();
  if (estado.tab === "ingresar" && typeof renderResumenMasiva === "function") renderResumenMasiva();
}

function cablearTabs() {
  window.addEventListener("scroll", recortarEspaciadorFinal, { passive: true });
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.addEventListener("click", () => {
      document.getElementById("espaciador-final").style.height = ""; // otra pestaña parte sin espacio extra
      if (estado.tab !== b.dataset.tab) estado.edicionEnLista = null; // el panel de edición no se lleva a la otra pestaña
      estado.tab = b.dataset.tab;
      render();
    });
  });
}

// ---------------- selector de test ----------------

function renderConteosSelector() {
  Object.values(TESTS).forEach((t) => {
    const el = document.getElementById("conteo-test-" + t.id);
    if (!el) return;
    const n = t.store.listar().length;
    el.textContent = n > 0 ? `${n} ${n === 1 ? "estudiante" : "estudiantes"}` : "";
  });
}

// deja la página lista para el test elegido: clase en <body> (que muestra/oculta los
// textos y pestañas propios de cada test, ver css), etiquetas con el nombre del test,
// campos de puntaje del formulario y datos del curso guardados de ese test.
function aplicarTestActivo() {
  const c = cfg();
  document.body.classList.toggle("test-octavo", c.id === "octavo");
  document.body.classList.toggle("test-kuder", c.id === "kuder");
  document.querySelectorAll(".test-btn").forEach((b) => b.classList.toggle("activo", b.dataset.test === c.id));
  document.querySelectorAll("[data-badge-test]").forEach((el) => (el.textContent = c.nombre));
  document.getElementById("curso-curso").placeholder = c.placeholderCurso;
  document.getElementById("puntajes-titulo").textContent = `Puntajes por área (${c.puntajeMin} a ${c.puntajeMax})`;
  renderCamposPuntaje();
  cargarCursoHeaderDesdeLocal();
}

function cablearSelectorTest() {
  document.querySelectorAll(".test-btn").forEach((b) => {
    b.addEventListener("click", () => cambiarTest(b.dataset.test));
  });
}

function cambiarTest(idTest) {
  if (!TESTS[idTest] || idTest === estado.test) return;
  if (estado.editandoId) cancelarEdicion({ volver: false });
  guardarCursoHeaderEnLocal(); // lo escrito en "Datos del curso" queda con el test anterior
  estado.test = idTest;
  try {
    localStorage.setItem(STORAGE_KEY_TEST_ACTIVO, idTest);
  } catch (e) {
    console.error(e);
  }
  // los filtros de un test (colegio, curso...) no tienen sentido en el otro
  estado.filtros = { colegio: "", curso: "", letra: "", nombre: "", soloTraspaso: false };
  estado.gruposAbiertos = new Set();
  estado.gruposCerrados = new Set();
  estado.edicionEnLista = null;
  estado.filtrosPapelera = { colegio: "", curso: "", nombre: "" };
  estado.filtrosCorreccion = { colegio: "", tipo: "", nombre: "" };
  if (idTest !== "kuder" && TABS_SOLO_KUDER.includes(estado.tab)) estado.tab = "ingresar";
  if (typeof reiniciarPanelOrientadores === "function") reiniciarPanelOrientadores();
  // la importación masiva y el editor de carpetas no se llevan al otro test
  if (typeof reiniciarMasiva === "function") reiniciarMasiva();
  if (typeof carpetasEstado !== "undefined") carpetasEstado.marcados.clear();
  aplicarTestActivo();
  render();
  mostrarToast(`Ahora trabajas con: ${cfg().nombre}`);
}

function cablearTopbar() {
  document.getElementById("btn-deshacer").addEventListener("click", () => {
    if (cfg().store.deshacer()) {
      mostrarToast("Se deshizo el último cambio");
      render();
      if (estado.tab === "ingresar") cancelarEdicion({ volver: false });
    }
  });
  document.getElementById("btn-rehacer").addEventListener("click", () => {
    if (cfg().store.rehacer()) {
      mostrarToast("Se rehizo el cambio");
      render();
    }
  });
  document.getElementById("btn-excel").addEventListener("click", () => {
    if (cfg().store.listar({ incluirPapelera: true }).length === 0) {
      mostrarToast(`Todavía no hay estudiantes del ${cfg().nombre} para respaldar`);
      return;
    }
    cfg().exportarExcel();
    mostrarToast("Respaldo en Excel descargado");
  });

  document.getElementById("btn-borrar-todo").addEventListener("click", () => {
    const c = cfg();
    const total = c.store.listar({ incluirPapelera: true }).length;
    if (total === 0) {
      mostrarToast(`No hay datos guardados del ${c.nombre} todavía`);
      return;
    }
    confirmarAccion({
      titulo: `⚠ Borrar todos los datos del ${c.nombre}`,
      texto: `Esto elimina para siempre los ${total} estudiantes guardados del ${c.nombre} (incluida su papelera). Los datos del otro test no se tocan. Esta acción no se puede deshacer una vez que cierres o recargues la página. ¿Seguro que quieres continuar?`,
      textoBoton: "Sí, borrar todo",
      onConfirmar: () => {
        c.store.borrarTodo();
        mostrarToast("Todos los datos del test fueron eliminados");
        render();
      },
    });
  });

  const btnPlanillaKuder = document.getElementById("btn-planilla-kuder");
  if (btnPlanillaKuder) btnPlanillaKuder.addEventListener("click", descargarPlanillaEnBlancoKuder);
}

// ---------------- datos del curso (fijos mientras se ingresa un curso completo) ----------------
// se guardan por separado para cada test, así al cambiar de test no se arrastra el
// colegio/curso que se estaba usando en el otro.

function leerCursoHeader() {
  return {
    colegio: document.getElementById("curso-colegio").value.trim(),
    curso: document.getElementById("curso-curso").value.trim(),
    letra: document.getElementById("curso-letra").value.trim().toUpperCase(),
    fecha: document.getElementById("curso-fecha").value,
  };
}

function guardarCursoHeaderEnLocal() {
  localStorage.setItem(cfg().storageKeyCurso, JSON.stringify(leerCursoHeader()));
}

function cargarCursoHeaderDesdeLocal() {
  let d = {};
  try {
    const raw = localStorage.getItem(cfg().storageKeyCurso);
    if (raw) d = JSON.parse(raw) || {};
  } catch (e) {
    console.error("No se pudo cargar el curso guardado.", e);
  }
  document.getElementById("curso-colegio").value = d.colegio || "";
  document.getElementById("curso-curso").value = d.curso || "";
  document.getElementById("curso-letra").value = d.letra || "";
  document.getElementById("curso-fecha").value = d.fecha || "";
}

function cablearCursoHeader() {
  ["curso-colegio", "curso-curso", "curso-letra", "curso-fecha"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener("change", guardarCursoHeaderEnLocal);
    el.addEventListener("input", renderDatosRecientes);
  });

  document.getElementById("btn-vaciar-curso").addEventListener("click", () => {
    if (!confirm("¿Vaciar los datos del curso (colegio, curso, letra y fecha)?")) return;
    document.getElementById("curso-colegio").value = "";
    document.getElementById("curso-curso").value = "";
    document.getElementById("curso-letra").value = "";
    document.getElementById("curso-fecha").value = "";
    guardarCursoHeaderEnLocal();
    renderDatosRecientes();
    mostrarToast("Datos del curso vaciados");
  });

  document.getElementById("btn-actualizar-recientes").addEventListener("click", renderDatosRecientes);
}

// ---------------- importación masiva desde planilla(s) ----------------

function escaparHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------- revisión de traspaso (solo Kuder: las 10 áreas deben sumar 45) ----------------

// null si el test del estudiante está bien traspasado (o si el test no tiene esta revisión)
function revisionTraspaso(puntajes) {
  const c = cfg();
  if (!c.revisarTraspaso) return null;
  const analisis = c.revisarTraspaso(puntajes);
  return analisis.estado === "ok" ? null : { analisis, texto: c.describirTraspaso(analisis) };
}

// true si el test del estudiante no suma 45 pero se revisó y se dejó así ("✓ Dejar
// así") con los mismos puntajes que tiene ahora
function traspasoDejadoAsi(estudiante) {
  const c = cfg();
  return !!c.huellaTraspaso && !!estudiante.traspasoAceptado && estudiante.traspasoAceptado === c.huellaTraspaso(estudiante.puntajes);
}

// lo mismo que revisionTraspaso, pero de un estudiante guardado: null también si se
// dejó así. Es lo que decide si aparece como "pendiente por revisar".
function pendienteTraspaso(estudiante) {
  return traspasoDejadoAsi(estudiante) ? null : revisionTraspaso(estudiante.puntajes);
}

// aviso para las listas de estudiantes: amarillo si el error podría cambiar sus
// resultados (hay que buscarlo), gris si no. "conDejarAsi" agrega el botón verde.
function avisoTraspasoHtml(estudiante, { compacto = false, conDejarAsi = false } = {}) {
  const r = pendienteTraspaso(estudiante);
  if (!r) return "";
  const t = r.texto;
  return `<div class="traspaso-aviso${t.afecta ? " afecta" : ""}">${t.afecta ? "⚠" : "ℹ️"} <b>Test mal traspasado:</b> ${escaparHtml(t.resumen)}. ${escaparHtml(t.accion)}.${compacto ? "" : " " + escaparHtml(t.detalle)}${
    conDejarAsi ? ` ${botonDejarAsiHtml(estudiante)}` : ""
  }</div>`;
}

// ícono de advertencia junto al nombre de un estudiante con el test mal traspasado:
// al hacer clic abre la corrección rápida de sus puntajes (ver abrirCorreccionPuntajes).
// Si se dejó así, en vez del ⚠ va un ✓ verde (también se puede abrir para cambiarlo).
function botonTraspasoHtml(estudiante, accion = "abrirCorreccionPuntajes") {
  const r = revisionTraspaso(estudiante.puntajes);
  if (!r) return "";
  if (traspasoDejadoAsi(estudiante)) {
    return `<button type="button" class="btn-traspaso dejado" title="Revisado: se dejó así, con ${r.analisis.total} de ${SUMA_ESPERADA_KUDER} puntos. Haz clic para ver o cambiar sus puntajes" onclick="${accion}('${estudiante.id}')">✓ ${r.analisis.total}/${SUMA_ESPERADA_KUDER}</button>`;
  }
  return `<button type="button" class="btn-traspaso${r.analisis.afecta ? " afecta" : ""}" title="Test mal traspasado: haz clic para corregir sus puntajes" onclick="${accion}('${estudiante.id}')">⚠ ${r.analisis.total}/${SUMA_ESPERADA_KUDER}</button>`;
}

// al guardar los puntajes de un estudiante: qué anotar para "Recién corregidos".
// "dejado" si se deja así sin sumar 45; "corregido" si no sumaba 45 y ahora sí.
// Se llama antes de guardar (con el estudiante todavía con sus puntajes anteriores).
function datosDeCorreccion(estudiante, puntajesNuevos, dejarAsi) {
  const c = cfg();
  if (!c.huellaTraspaso || !estudiante) return {};
  const ahora = new Date().toISOString();
  const malNuevo = !!revisionTraspaso(puntajesNuevos);
  if (dejarAsi && malNuevo) return { traspasoAceptado: c.huellaTraspaso(puntajesNuevos), correccion: { como: "dejado", en: ahora } };
  if (revisionTraspaso(estudiante.puntajes) && !malNuevo) return { correccion: { como: "corregido", en: ahora } };
  return {};
}

// nombre del estudiante en las listas, con un lápiz chico para editar su nombre y RUT
function nombreConLapizHtml(estudiante) {
  return `<strong>${escaparHtml(estudiante.nombre)}</strong><button type="button" class="btn-lapiz" title="Editar nombre y RUT" aria-label="Editar nombre y RUT" onclick="abrirDatosAlumno('${estudiante.id}')">✎</button>`;
}

function botonDejarAsiHtml(estudiante) {
  return `<button type="button" class="chico exito btn-dejar-asi" title="Ya lo revisé: dejar sus puntajes como están, aunque no sumen ${SUMA_ESPERADA_KUDER}. Deja de aparecer como pendiente" onclick="accionDejarAsi('${estudiante.id}')">✓ Dejar así</button>`;
}

// ventana con varias opciones (además de "Cancelar"): [{ texto, clase, accion }]
function elegirOpcion({ titulo, texto, opciones }) {
  const modal = document.getElementById("modal-opciones");
  document.getElementById("mo-titulo").textContent = titulo;
  document.getElementById("mo-texto").innerHTML = texto;
  const cont = document.getElementById("mo-botones");
  cont.innerHTML = "";
  const cerrar = () => (modal.style.display = "none");
  const cancelar = document.createElement("button");
  cancelar.type = "button";
  cancelar.className = "secundario";
  cancelar.textContent = "Cancelar";
  cancelar.onclick = cerrar;
  cont.appendChild(cancelar);
  opciones.forEach((op) => {
    const b = document.createElement("button");
    b.type = "button";
    if (op.clase) b.className = op.clase;
    b.textContent = op.texto;
    b.onclick = () => {
      cerrar();
      op.accion();
    };
    cont.appendChild(b);
  });
  modal.style.display = "flex";
}

// antes de generar informes (solo Kuder): si hay estudiantes pendientes por revisar
// (test mal traspasado), se pregunta si generar igual (quedan marcados con su suma en
// el nombre del archivo) o revisarlos primero
function antesDeGenerarInformes(lista, generar, { individual = false } = {}) {
  const pendientes = lista.filter((e) => pendienteTraspaso(e));
  if (pendientes.length === 0) return generar();
  const nombres =
    pendientes
      .slice(0, 8)
      .map((e) => `${escaparHtml(e.nombre)} (${pendienteTraspaso(e).analisis.total}/${SUMA_ESPERADA_KUDER})`)
      .join(", ") + (pendientes.length > 8 ? ` y ${pendientes.length - 8} más` : "");
  const uno = individual;
  elegirOpcion({
    titulo: "⚠ Hay estudiantes pendientes por revisar",
    texto: uno
      ? `El test de <b>${nombres}</b> está mal traspasado (no suma ${SUMA_ESPERADA_KUDER}). Puedes corregir sus puntajes ahora, o descargar su informe igual (el archivo lleva su puntaje en el nombre).`
      : `${pendientes.length === 1 ? "Este estudiante tiene" : `Estos ${pendientes.length} estudiantes tienen`} el test mal traspasado (no suman ${SUMA_ESPERADA_KUDER}): ${nombres}.<br/><br/>Puedes generar la carpeta igual (sus informes van marcados con su puntaje en el nombre del archivo, y la carpeta trae una nota con la lista), o revisarlos primero con el ícono ⚠.`,
    opciones: uno
      ? [
          { texto: "✏️ Corregir sus puntajes", clase: "secundario", accion: () => abrirEdicionEnLista(lista[0].id) },
          { texto: "📄 Descargar igual", accion: generar },
        ]
      : [
          {
            texto: "🔎 Revisar primero los pendientes",
            clase: "secundario",
            accion: () => {
              estado.filtros.soloTraspaso = true;
              estado.tab = "estudiantes";
              render();
              document.getElementById("resumen-traspaso").scrollIntoView({ behavior: "smooth", block: "start" });
            },
          },
          { texto: "📦 Generar y descargar igual", accion: generar },
        ],
  });
}

// cuántos estudiantes de una lista tienen el test mal traspasado (para los encabezados de colegio/curso)
function chipTraspasoHtml(lista) {
  const n = lista.filter((e) => pendienteTraspaso(e)).length;
  return n ? `<span class="chip chip-traspaso">⚠ ${n} ${n === 1 ? "pendiente" : "pendientes"} por revisar</span>` : "";
}

// sección de la ventana de importación con los estudiantes de un archivo que no suman 45
function htmlRevisionTraspasoArchivo(lectura) {
  const lista = lectura.revisionTraspaso;
  const c = cfg();
  if (!lista || !c.describirTraspaso) return ""; // 8° básico: no aplica
  if (lectura.estudiantes.length === 0) return "";
  if (lista.length === 0) {
    return `<div class="revision-traspaso ok">✓ Todos los estudiantes suman 45: tests bien traspasados.</div>`;
  }
  const conEfecto = lista.filter((r) => r.analisis.afecta);
  const sinEfecto = lista.filter((r) => !r.analisis.afecta);
  const item = (r) => {
    const d = c.describirTraspaso(r.analisis);
    return `<li><b>${escaparHtml(r.nombre)}</b> (fila ${r.fila}): ${escaparHtml(d.resumen)}. ${escaparHtml(d.detalle)}</li>`;
  };
  return `
    <div class="revision-traspaso">
      <div class="revision-traspaso-titulo">🔎 Revisión de traspaso: ${lista.length} ${lista.length === 1 ? "estudiante no suma" : "estudiantes no suman"} 45 puntos</div>
      ${
        conEfecto.length
          ? `<div class="revision-traspaso-grupo afecta">
              <div class="revision-traspaso-sub">⚠ Hay que buscar el error, porque podría cambiar sus resultados (${conEfecto.length}):</div>
              <ul>${conEfecto.map(item).join("")}</ul>
            </div>`
          : ""
      }
      ${
        sinEfecto.length
          ? `<div class="revision-traspaso-grupo">
              <div class="revision-traspaso-sub">ℹ️ No es necesario buscar el error: sus resultados quedan iguales (${sinEfecto.length}):</div>
              <ul>${sinEfecto.map(item).join("")}</ul>
            </div>`
          : ""
      }
      <div class="revision-traspaso-nota">Se importan igual y quedan registrados. Cuando tengas su hoja de respuestas, corrige sus puntajes en "Estudiantes e informes" haciendo clic en el ícono ⚠ junto a su nombre, y el aviso desaparece al llegar a 45.</div>
    </div>`;
}

// muestra el modal con un renglón por archivo (nombre + cuántos estudiantes trae) para
// que el usuario confirme o complete el colegio/curso/letra de cada uno antes de
// importar. Cada campo viene precargado con lo que traiga la propia planilla y, si no,
// con los "Datos del curso" que ya están escritos en la app. Si ese curso ya tiene
// estudiantes cargados, se avisa (para no importar dos veces el mismo archivo).
// Devuelve una promesa que resuelve con { archivos: [{archivo, lectura, datosCurso}, ...],
// descargar } si el usuario confirma (descargar = true si eligió "Cargar y descargar"),
// o con null si cancela.
function pedirDatosPorArchivo(lecturas, cursoHeader) {
  return new Promise((resolve) => {
    const modal = document.getElementById("modal-importar");
    const cont = document.getElementById("lista-importar-archivos");
    const btnContinuar = document.getElementById("modal-imp-btn-continuar");
    const btnDescargar = document.getElementById("modal-imp-btn-descargar");
    const btnCancelar = document.getElementById("modal-imp-btn-cancelar");
    const c = cfg();

    cont.innerHTML = lecturas
      .map(({ archivo, lectura }, i) => {
        const n = lectura.estudiantes.length;
        const nombreArchivo = `<span>📄 ${escaparHtml(archivo.name)}</span>`;
        const quitar = `<button type="button" class="btn-quitar-archivo" title="Quitar este archivo: no se importa" aria-label="Quitar ${escaparHtml(archivo.name)}">✕</button>`;

        // archivo sin estudiantes válidos: no se pide colegio/curso (no bloquea la
        // importación de los demás) y se explica por qué, avisando si parece ser una
        // planilla del otro test
        if (n === 0) {
          const motivo = lectura.otroTest
            ? `Parece ser una planilla del <b>${escaparHtml(lectura.otroTest)}</b>. Elige ese test arriba y vuelve a subirlo.`
            : escaparHtml(lectura.errores[0] || "No se encontraron estudiantes válidos.");
          return `
          <div class="fila-importar-archivo fila-importar-archivo--vacia">
            <div class="fila-importar-archivo-nombre">${nombreArchivo}<span class="fila-importar-archivo-info">no se va a importar</span>${quitar}</div>
            <div class="imp-archivo-error">⚠ ${motivo}</div>
          </div>`;
        }

        const colegioPre = lectura.colegio || cursoHeader.colegio || "";
        const cursoPre = lectura.curso || cursoHeader.curso || "";
        const letraPre = lectura.letra || cursoHeader.letra || "";
        const nErrores = lectura.errores.length;
        const nAdvertencias = (lectura.advertencias || []).length;
        const nTraspaso = (lectura.revisionTraspaso || []).length;
        const info =
          `${n} ${n === 1 ? "estudiante detectado" : "estudiantes detectados"}` +
          (nErrores ? `, ${nErrores} ${nErrores === 1 ? "fila con problemas" : "filas con problemas"}` : "") +
          (nAdvertencias ? `, ${nAdvertencias} ${nAdvertencias === 1 ? "fila para revisar" : "filas para revisar"}` : "") +
          (nTraspaso ? `, ${nTraspaso} ${nTraspaso === 1 ? "test mal traspasado" : "tests mal traspasados"}` : "");
        return `
        <div class="fila-importar-archivo" data-idx="${i}">
          <div class="fila-importar-archivo-nombre">
            ${nombreArchivo}
            <span class="fila-importar-archivo-info">${info}</span>
            ${quitar}
          </div>
          <div class="grid-form">
            <div>
              <label>Colegio *</label>
              <input type="text" class="imp-colegio" value="${escaparHtml(colegioPre)}" />
            </div>
            <div>
              <label>Curso *</label>
              <input type="text" class="imp-curso" value="${escaparHtml(cursoPre)}" placeholder="${escaparHtml(c.placeholderCurso)}" />
            </div>
            <div>
              <label>Letra</label>
              <input type="text" class="imp-letra" maxlength="2" value="${escaparHtml(letraPre)}" placeholder="Ej: A" />
            </div>
          </div>
          <div class="imp-aviso-existente"></div>
          ${htmlRevisionTraspasoArchivo(lectura)}
        </div>`;
      })
      .join("");

    let filasConEstudiantes = [...cont.querySelectorAll(".fila-importar-archivo[data-idx]")];
    const leerFila = (fila) => ({
      colegio: fila.querySelector(".imp-colegio").value.trim(),
      curso: fila.querySelector(".imp-curso").value.trim(),
      letra: fila.querySelector(".imp-letra").value.trim().toUpperCase(),
    });

    // aviso en vivo si el colegio/curso/letra escritos ya tienen estudiantes cargados
    const actualizarAvisosExistentes = () => {
      const activos = c.store.listar();
      filasConEstudiantes.forEach((fila) => {
        const d = leerFila(fila);
        const yaCargados =
          d.colegio && d.curso
            ? activos.filter(
                (e) =>
                  (e.colegio || "").trim().toLowerCase() === d.colegio.toLowerCase() &&
                  (e.curso || "").trim().toLowerCase() === c.store.normalizarCurso(d.curso).toLowerCase() &&
                  (e.letra || "").trim().toLowerCase() === d.letra.toLowerCase()
              ).length
            : 0;
        fila.querySelector(".imp-aviso-existente").textContent = yaCargados
          ? `⚠ Este curso ya tiene ${yaCargados} ${yaCargados === 1 ? "estudiante cargado" : "estudiantes cargados"}. Si importas este archivo aquí, quedarán repetidos: para actualizarlo sin duplicar, usa "📦 Importación masiva", más abajo.`
          : "";
      });
    };
    cont.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", actualizarAvisosExistentes));
    actualizarAvisosExistentes();

    // Kuder: dos maneras de terminar la carga. (a) cargar y descargar altiro la carpeta
    // del curso (los que no suman 45 van marcados con su suma en el nombre del
    // archivo), o (b) solo cargar el curso y dejar a esos estudiantes pendientes por
    // revisar, para corregirlos después con el ícono ⚠ y descargar cuando estén listos.
    // Se vuelve a calcular cada vez que se quita un archivo con su ✕.
    const eleccion = document.getElementById("modal-imp-eleccion");
    const actualizarEleccion = () => {
      const nPendientes = filasConEstudiantes.reduce((acc, fila) => acc + (lecturas[Number(fila.dataset.idx)].lectura.revisionTraspaso || []).length, 0);
      const nCursos = filasConEstudiantes.length;
      if (c.revisarTraspaso) {
        btnContinuar.textContent = nPendientes ? "📥 Solo cargar (dejar pendientes por revisar)" : "📥 Solo cargar en la plataforma";
        btnDescargar.textContent = `📦 Cargar y descargar ${nCursos > 1 ? "las carpetas de los cursos" : "la carpeta del curso"}`;
        eleccion.innerHTML = nPendientes
          ? `<b>⚠ ${nPendientes} ${nPendientes === 1 ? "estudiante tiene" : "estudiantes tienen"} el test mal traspasado (no suman 45).</b> Elige cómo seguir:
             <ul>
               <li><b>Cargar y descargar:</b> se genera ya ${nCursos > 1 ? "la carpeta de cada curso" : "la carpeta del curso"} con todos los informes; los que no suman 45 van marcados con su puntaje en el nombre del archivo, por ejemplo "(44 de 45)", y la carpeta trae una nota con la lista a revisar.</li>
               <li><b>Solo cargar:</b> el curso queda en la plataforma y esos estudiantes quedan pendientes por revisar. Los corriges después con el ícono ⚠ en "Estudiantes e informes" y descargas los informes cuando estén listos.</li>
             </ul>`
          : "";
      } else {
        btnContinuar.textContent = "Importar";
        eleccion.innerHTML = "";
      }
      btnContinuar.disabled = nCursos === 0;
      btnDescargar.disabled = nCursos === 0;
    };
    actualizarEleccion();

    // ✕ de cada archivo: se quita de la lista y no se importa
    cont.querySelectorAll(".btn-quitar-archivo").forEach((b) => {
      b.onclick = () => {
        const fila = b.closest(".fila-importar-archivo");
        fila.remove();
        filasConEstudiantes = filasConEstudiantes.filter((f) => f !== fila);
        if (!cont.querySelector(".fila-importar-archivo")) {
          onCancelar();
          mostrarToast("Se quitaron todos los archivos: no se importó nada");
          return;
        }
        actualizarEleccion();
      };
    });
    modal.style.display = "flex";
    const primerCampo = cont.querySelector(".imp-colegio");
    if (primerCampo) primerCampo.focus();

    function limpiar() {
      modal.style.display = "none";
      btnContinuar.disabled = false;
      btnDescargar.disabled = false;
      btnContinuar.removeEventListener("click", onSoloCargar);
      btnDescargar.removeEventListener("click", onCargarYDescargar);
      btnCancelar.removeEventListener("click", onCancelar);
    }
    function onSoloCargar() {
      onContinuar(false);
    }
    function onCargarYDescargar() {
      onContinuar(true);
    }
    function onContinuar(descargar) {
      let ok = true;
      const resultado = filasConEstudiantes.map((fila) => {
        const item = lecturas[Number(fila.dataset.idx)];
        const d = leerFila(fila);
        fila.querySelector(".imp-colegio").classList.toggle("invalido", !d.colegio);
        fila.querySelector(".imp-curso").classList.toggle("invalido", !d.curso);
        if (!d.colegio || !d.curso) ok = false;
        return {
          archivo: item.archivo,
          lectura: item.lectura,
          datosCurso: { ...d, fecha: cursoHeader.fecha || "" },
        };
      });

      if (!ok) {
        mostrarToast("Completa colegio y curso de cada archivo");
        return;
      }

      limpiar();
      resolve({ archivos: resultado, descargar });
    }
    function onCancelar() {
      limpiar();
      resolve(null);
    }
    btnContinuar.addEventListener("click", onSoloCargar);
    btnDescargar.addEventListener("click", onCargarYDescargar);
    btnCancelar.addEventListener("click", onCancelar);
  });
}

function cablearImportacion() {
  const input = document.getElementById("input-planilla");
  const btn = document.getElementById("btn-elegir-planilla");
  const etiquetaArchivo = document.getElementById("nombre-archivo-planilla");

  btn.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const archivos = Array.from(input.files || []);
    if (archivos.length === 0) return;
    const c = cfg();

    etiquetaArchivo.textContent =
      archivos.length === 1 ? archivos[0].name : `${archivos.length} archivos seleccionados`;
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Leyendo…";

    try {
      const cursoHeader = leerCursoHeader();
      const lecturas = [];
      for (const archivo of archivos) {
        let lectura;
        try {
          const arrayBuffer = await archivo.arrayBuffer();
          lectura = c.leerPlanilla(arrayBuffer);
        } catch (err) {
          console.error(err);
          lectura = { estudiantes: [], errores: [c.errorLectura], advertencias: [], colegio: "", curso: "", letra: "" };
        }
        // sin estudiantes: ¿será una planilla del otro test? (error fácil de cometer
        // ahora que la app tiene dos tests)
        if (lectura.estudiantes.length === 0) {
          const otro = Object.values(TESTS).find((t) => t.id !== c.id);
          try {
            const buffer = await archivo.arrayBuffer();
            if (otro.leerPlanilla(buffer).estudiantes.length > 0) lectura.otroTest = otro.nombre;
          } catch (err) {
            // no es del otro test tampoco: queda el error original
          }
        }
        lecturas.push({ archivo, lectura });
      }

      btn.disabled = false;
      btn.textContent = textoOriginal;
      const eleccion = await pedirDatosPorArchivo(lecturas, cursoHeader);
      if (!eleccion) {
        input.value = "";
        return; // el usuario canceló
      }
      const resultado = eleccion.archivos;
      btn.disabled = true;
      btn.textContent = "Importando…";

      const nuevos = [];
      const erroresTotales = [];
      const advertenciasTotales = [];
      let ultimoDatosCurso = null;

      const rangosPorArchivo = []; // qué estudiantes nuevos salen de cada archivo (un curso cada uno)
      for (const { archivo, lectura, datosCurso } of resultado) {
        const desde = nuevos.length;
        lectura.estudiantes.forEach((e) =>
          nuevos.push({
            nombre: e.nombre,
            rut: e.rut,
            contacto: e.contacto,
            nacimiento: e.nacimiento,
            colegio: datosCurso.colegio,
            curso: datosCurso.curso,
            letra: datosCurso.letra,
            fecha: datosCurso.fecha,
            puntajes: e.puntajes,
          })
        );
        if (lectura.errores.length > 0) {
          erroresTotales.push(`Archivo "${archivo.name}":`, ...lectura.errores.map((e) => "  " + e));
        }
        if ((lectura.advertencias || []).length > 0) {
          advertenciasTotales.push(`Archivo "${archivo.name}":`, ...lectura.advertencias.map((e) => "  " + e));
        }
        rangosPorArchivo.push([desde, nuevos.length]);
        ultimoDatosCurso = datosCurso;
      }

      // un solo paso de "Deshacer" para toda la importación
      const creados = c.store.crearVarios(nuevos);
      const totalImportados = nuevos.length;

      if (totalImportados > 0) {
        mostrarToast(
          `${totalImportados} ${totalImportados === 1 ? "estudiante importado" : "estudiantes importados"}` +
            (resultado.length > 1 ? ` de ${resultado.length} archivos` : "") +
            (erroresTotales.length ? ` — algunas filas con problemas` : "")
        );
        // refleja arriba los datos del último archivo importado, como punto de partida
        // para lo próximo que se ingrese a mano
        if (ultimoDatosCurso) {
          document.getElementById("curso-colegio").value = ultimoDatosCurso.colegio;
          document.getElementById("curso-curso").value = ultimoDatosCurso.curso;
          document.getElementById("curso-letra").value = ultimoDatosCurso.letra;
          guardarCursoHeaderEnLocal();
        }
      } else {
        mostrarToast("No se importó ningún estudiante desde estos archivos.");
      }
      const mensajes = [];
      if (erroresTotales.length > 0) mensajes.push("Algunas filas no se pudieron importar:\n\n" + erroresTotales.join("\n"));
      if (advertenciasTotales.length > 0) mensajes.push("Estas filas sí se importaron, pero conviene revisarlas:\n\n" + advertenciasTotales.join("\n"));
      if (mensajes.length > 0) alert(mensajes.join("\n\n"));
      render();

      // opción "Cargar y descargar": la carpeta de cada curso recién cargado
      if (eleccion.descargar && creados.length > 0 && c.descargarVariosCursos) {
        const cursos = rangosPorArchivo.map(([desde, hasta]) => creados.slice(desde, hasta)).filter((g) => g.length > 0);
        btn.disabled = true;
        await c.descargarVariosCursos(cursos, (hecho, total) => {
          btn.textContent = `Generando informes ${hecho}/${total}…`;
        });
        const nPendientes = creados.filter((e) => pendienteTraspaso(e)).length;
        mostrarToast(
          `Carpeta${cursos.length > 1 ? "s" : ""} descargada${cursos.length > 1 ? "s" : ""} (${creados.length} informes)` +
            (nPendientes ? `. ${nPendientes} con el test mal traspasado: marcados con su puntaje y pendientes por revisar.` : "")
        );
      }
    } catch (err) {
      console.error(err);
      mostrarToast("No se pudo leer alguno de los archivos.");
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
      input.value = "";
      // el nombre del archivo no queda pegado junto al botón: ya se importó (o se canceló)
      etiquetaArchivo.textContent = "";
    }
  });
}

// ---------------- pestaña: ingresar / editar ----------------

function renderCamposPuntaje() {
  const c = cfg();
  const cont = document.getElementById("campos-puntajes");
  cont.innerHTML = c.areas
    .map(
      (a) => `
    <div>
      <label>${a.icono} ${a.nombre} (${c.puntajeMin}–${c.puntajeMax})</label>
      <input type="number" min="${c.puntajeMin}" max="${c.puntajeMax}" step="1" name="p_${a.id}" required />
    </div>`
    )
    .join("");
  renderSumaPuntajes();
}

// suma en vivo de los puntajes (solo Kuder), en el formulario y en la corrección
// rápida: avisa al tiro si el test quedó mal traspasado y si ese error podría
// cambiar los resultados. "leerCampo(id)" devuelve lo escrito en el campo de esa área.
function pintarSumaPuntajes(cont, leerCampo) {
  if (!cont) return;
  const c = cfg();
  cont.classList.remove("ok", "afecta", "sin-efecto");
  if (!c.revisarTraspaso) {
    cont.innerHTML = "";
    return;
  }
  const puntajes = {};
  let completos = 0;
  let suma = 0;
  c.areas.forEach((a) => {
    const raw = leerCampo(a.id);
    if (raw !== "" && Number.isFinite(Number(raw))) {
      puntajes[a.id] = Number(raw);
      suma += Number(raw);
      completos++;
    }
  });
  if (completos === 0) {
    cont.innerHTML = `Suma de las 10 áreas: debe dar ${SUMA_ESPERADA_KUDER}.`;
    return;
  }
  if (completos < c.areas.length) {
    cont.innerHTML = `Suma hasta ahora: <b>${suma}</b> de ${SUMA_ESPERADA_KUDER} (faltan áreas por completar).`;
    return;
  }
  const r = revisionTraspaso(puntajes);
  if (!r) {
    cont.classList.add("ok");
    cont.innerHTML = `✓ Suma <b>${suma}</b> de ${SUMA_ESPERADA_KUDER}: test bien traspasado.`;
    return;
  }
  cont.classList.add(r.texto.afecta ? "afecta" : "sin-efecto");
  cont.innerHTML = `${r.texto.afecta ? "⚠" : "ℹ️"} <b>${escaparHtml(r.texto.resumen)}</b>: test mal traspasado. ${escaparHtml(r.texto.accion)}. ${escaparHtml(r.texto.detalle)}`;
}

function renderSumaPuntajes() {
  const form = document.getElementById("form-estudiante");
  pintarSumaPuntajes(document.getElementById("suma-puntajes"), (id) => form.querySelector(`[name="p_${id}"]`).value);
}

function cablearFormulario() {
  const form = document.getElementById("form-estudiante");
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    guardarDesdeFormulario();
  });
  form.addEventListener("input", (ev) => {
    if (ev.target.name && ev.target.name.startsWith("p_")) renderSumaPuntajes();
  });
  form.addEventListener("reset", () => setTimeout(renderSumaPuntajes, 0));
  document.getElementById("btn-cancelar-edicion").addEventListener("click", () => cancelarEdicion());
}

function limpiarValidacion() {
  document.querySelectorAll(".invalido").forEach((el) => el.classList.remove("invalido"));
}

function guardarDesdeFormulario() {
  const form = document.getElementById("form-estudiante");
  const c = cfg();
  limpiarValidacion();

  let ok = true;
  const marcar = (el) => {
    el.classList.add("invalido");
    ok = false;
  };

  const cursoHeader = leerCursoHeader();
  if (!cursoHeader.colegio) marcar(document.getElementById("curso-colegio"));
  if (!cursoHeader.curso) marcar(document.getElementById("curso-curso"));

  const fd = new FormData(form);
  const nombre = (fd.get("nombre") || "").toString().trim();
  if (!nombre) marcar(form.querySelector('[name="nombre"]'));

  const puntajes = {};
  for (const a of c.areas) {
    const campo = form.querySelector(`[name="p_${a.id}"]`);
    const raw = fd.get("p_" + a.id);
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < c.puntajeMin || n > c.puntajeMax || !Number.isInteger(n)) {
      marcar(campo);
    } else {
      puntajes[a.id] = n;
    }
  }

  if (!ok) {
    mostrarToast("Revisa los campos marcados en rojo");
    return;
  }

  guardarCursoHeaderEnLocal();

  const datos = {
    nombre,
    colegio: cursoHeader.colegio,
    curso: cursoHeader.curso,
    letra: cursoHeader.letra,
    fecha: cursoHeader.fecha,
    rut: (fd.get("rut") || "").toString().trim(),
    puntajes,
  };

  const traspaso = revisionTraspaso(puntajes);
  const avisoTraspaso = traspaso ? ` Ojo: ${traspaso.texto.resumen.toLowerCase()}, test mal traspasado.` : "";
  if (estado.editandoId) {
    const id = estado.editandoId;
    c.store.actualizar(id, datos);
    mostrarToast("Estudiante actualizado." + avisoTraspaso);
    cancelarEdicion({ volver: false });
    render();
    volverAFilaEditada(id);
    return;
  } else {
    c.store.crear(datos);
    mostrarToast((traspaso ? "Estudiante guardado." : "Estudiante guardado. Sigue con el próximo.") + avisoTraspaso);
    limpiarFormularioEstudiante();
  }

  render();
}

function limpiarFormularioEstudiante() {
  const form = document.getElementById("form-estudiante");
  form.reset();
  const nombreInput = form.querySelector('[name="nombre"]');
  nombreInput.focus();
}

function chipsAreas(estudiante) {
  const areas = cfg().calcularAreas(estudiante.puntajes);
  return areas.length > 0
    ? areas.map((a) => `<span class="chip">${a.icono} ${a.nombre}</span>`).join("")
    : `<span class="chip generico">Sin área destacada</span>`;
}

// lista en vivo de los estudiantes ya ingresados para el colegio/curso/letra
// que se está cargando ahora mismo, para revisar visualmente que no falte nadie.
function renderDatosRecientes() {
  const cont = document.getElementById("datos-recientes");
  if (!cont) return;

  const cursoHeader = leerCursoHeader();
  if (!cursoHeader.colegio || !cursoHeader.curso) {
    cont.innerHTML = `<div class="vacio">Completa el colegio y el curso para ver aquí los estudiantes que vayas agregando.</div>`;
    return;
  }

  const delCurso = cfg()
    .store.listar()
    .filter(
      (e) =>
        (e.colegio || "").trim().toLowerCase() === cursoHeader.colegio.trim().toLowerCase() &&
        (e.curso || "").trim().toLowerCase() === cursoHeader.curso.trim().toLowerCase() &&
        (e.letra || "").trim().toLowerCase() === cursoHeader.letra.trim().toLowerCase()
    )
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));

  if (delCurso.length === 0) {
    cont.innerHTML = `<div class="vacio">Todavía no has agregado estudiantes de ${escaparHtml(cursoHeader.colegio)} ${escaparHtml(cursoHeader.curso)}${escaparHtml(cursoHeader.letra)} en este test.</div>`;
    return;
  }

  cont.innerHTML = `
    <table class="recientes-lista">
      <thead><tr><th>N°</th><th>Estudiante</th><th>Área(s) de interés</th><th></th></tr></thead>
      <tbody>
        ${delCurso
          .map(
            (e, i) => `
            <tr data-id="${e.id}">
              <td>${i + 1}</td>
              <td>${escaparHtml(e.nombre)} ${botonTraspasoHtml(e)}</td>
              <td>${chipsAreas(e)}${avisoTraspasoHtml(e, { compacto: true })}</td>
              <td><button type="button" class="chico secundario" onclick="accionEditar('${e.id}')">Editar</button></td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p class="ayuda" style="margin-top:10px; margin-bottom:0;">${delCurso.length} ${delCurso.length === 1 ? "estudiante agregado" : "estudiantes agregados"} hasta ahora.</p>
  `;
}

function cargarEnFormulario(estudiante) {
  document.getElementById("curso-colegio").value = estudiante.colegio || "";
  document.getElementById("curso-curso").value = estudiante.curso || "";
  document.getElementById("curso-letra").value = estudiante.letra || "";
  document.getElementById("curso-fecha").value = estudiante.fecha || "";

  const form = document.getElementById("form-estudiante");
  form.nombre.value = estudiante.nombre || "";
  form.rut.value = estudiante.rut || "";
  for (const a of cfg().areas) {
    form.querySelector(`[name="p_${a.id}"]`).value = estudiante.puntajes[a.id];
  }
  renderSumaPuntajes();
  estado.editandoId = estudiante.id;
  document.getElementById("titulo-form").textContent = "Editando a " + (estudiante.nombre || "estudiante");
  document.getElementById("btn-cancelar-edicion").style.display = "inline-block";
  document.getElementById("btn-guardar").textContent = "Guardar cambios";
  estado.tab = "ingresar";
  render();
  document.getElementById("form-estudiante").closest(".tarjeta").scrollIntoView({ block: "start" });
}

// al terminar de editar en "Ingresar datos" (guardar o cancelar) se vuelve a la fila de
// ese estudiante en la lista de abajo, en la misma pestaña: cancelar solo deja de
// editarlo, no saca de donde se estaba trabajando
function volverAFilaEditada(id) {
  const fila = id && document.querySelector(`#datos-recientes tr[data-id="${id}"]`);
  if (fila) fila.scrollIntoView({ block: "center" });
}

function cancelarEdicion({ volver = true } = {}) {
  const id = estado.editandoId;
  estado.editandoId = null;
  limpiarFormularioEstudiante();
  document.getElementById("titulo-form").textContent = "Agregar estudiante";
  document.getElementById("btn-cancelar-edicion").style.display = "none";
  document.getElementById("btn-guardar").textContent = "Guardar y agregar siguiente";
  if (volver) volverAFilaEditada(id);
}

// ---------------- pestaña: estudiantes (agrupado por colegio > curso) ----------------

function opcionesUnicas(lista, campo) {
  return [...new Set(lista.map((e) => e[campo]).filter(Boolean))].sort();
}

function coincideTexto(valor, busqueda) {
  return (valor || "").toLowerCase().includes(busqueda.toLowerCase());
}

function etiquetaCurso(e) {
  return [e.curso || "—", e.letra || ""].join(" ").trim();
}

function agrupar(lista) {
  // colegio -> "curso letra" -> [estudiantes]
  const porColegio = new Map();
  for (const e of lista) {
    if (!porColegio.has(e.colegio)) porColegio.set(e.colegio, new Map());
    const porCurso = porColegio.get(e.colegio);
    const claveCurso = etiquetaCurso(e);
    if (!porCurso.has(claveCurso)) porCurso.set(claveCurso, []);
    porCurso.get(claveCurso).push(e);
  }
  return porColegio;
}

function idSeguro(prefijo, texto) {
  return prefijo + "_" + btoa(unescape(encodeURIComponent(texto))).replace(/[^a-zA-Z0-9]/g, "");
}

function renderEstudiantes() {
  const c = cfg();
  const todos = c.store.listar();

  const selColegio = document.getElementById("f-colegio");
  const selCurso = document.getElementById("f-curso");
  const selLetra = document.getElementById("f-letra");
  const inpNombre = document.getElementById("f-nombre");

  const rellenarSelect = (sel, valores, actual) => {
    sel.innerHTML =
      `<option value="">Todos</option>` + valores.map((v) => `<option value="${escaparHtml(v)}">${escaparHtml(v)}</option>`).join("");
    sel.value = valores.includes(actual) ? actual : "";
  };
  rellenarSelect(selColegio, opcionesUnicas(todos, "colegio"), estado.filtros.colegio);
  rellenarSelect(selCurso, opcionesUnicas(todos, "curso"), estado.filtros.curso);
  rellenarSelect(selLetra, opcionesUnicas(todos, "letra"), estado.filtros.letra);
  inpNombre.value = estado.filtros.nombre;

  selColegio.onchange = () => { estado.filtros.colegio = selColegio.value; renderEstudiantes(); };
  selCurso.onchange = () => { estado.filtros.curso = selCurso.value; renderEstudiantes(); };
  selLetra.onchange = () => { estado.filtros.letra = selLetra.value; renderEstudiantes(); };
  inpNombre.oninput = () => { estado.filtros.nombre = inpNombre.value; renderEstudiantes(); };

  renderResumenTraspaso(todos); // (va antes de filtrar: puede apagar el filtro "solo mal traspasados")

  const filtrados = todos.filter(
    (e) =>
      (!estado.filtros.colegio || e.colegio === estado.filtros.colegio) &&
      (!estado.filtros.curso || e.curso === estado.filtros.curso) &&
      (!estado.filtros.letra || e.letra === estado.filtros.letra) &&
      (!estado.filtros.nombre || coincideTexto(e.nombre, estado.filtros.nombre)) &&
      (!estado.filtros.soloTraspaso || pendienteTraspaso(e))
  );

  const btnMasiva = document.getElementById("btn-descarga-masiva");
  btnMasiva.disabled = !!btnMasiva.dataset.generando || filtrados.length === 0; // (no se reactiva a mitad de una descarga)
  document.getElementById("conteo-filtrados").textContent =
    filtrados.length + (filtrados.length === 1 ? " estudiante" : " estudiantes");
  const hayFiltro = !!(estado.filtros.colegio || estado.filtros.curso || estado.filtros.letra || estado.filtros.nombre || estado.filtros.soloTraspaso);
  if (!btnMasiva.dataset.generando) {
    btnMasiva.textContent = hayFiltro ? "⬇ Descargar los cursos filtrados" : "⬇ Descargar todos los cursos";
  }
  btnMasiva.onclick = () => accionDescargarTodosLosCursos(filtrados, btnMasiva);

  const cont = document.getElementById("grupos-estudiantes");
  if (todos.length === 0) {
    cont.innerHTML = `<div class="vacio">Todavía no hay estudiantes del ${c.nombre}. Cárgalos desde la pestaña "📝 Ingresar datos" (importando la planilla del curso o uno por uno).</div>`;
    return;
  }
  if (filtrados.length === 0) {
    cont.innerHTML = `<div class="vacio">No hay estudiantes que coincidan con el filtro.</div>`;
    return;
  }

  const porColegio = agrupar(filtrados);
  // con el filtro de tests mal traspasados se abre todo, para ver al tiro a quién revisar
  const abrirSoloUno = porColegio.size === 1 || estado.filtros.soloTraspaso;
  if (estado.filtros.soloTraspaso && !estado.soloTraspasoAnterior) estado.gruposCerrados.clear();
  estado.soloTraspasoAnterior = estado.filtros.soloTraspaso;

  // si el estudiante que se estaba editando ya no está en la lista (se filtró, se borró),
  // se cierra su editor; si está, su colegio y su curso quedan desplegados
  const editando = estado.edicionEnLista ? filtrados.find((e) => e.id === estado.edicionEnLista) : null;
  // pendientes por revisar que se ven en la lista (para "Guardar y seguir con el siguiente pendiente")
  estado.pendientesVisibles = filtrados.filter((e) => pendienteTraspaso(e)).map((e) => e.id);
  if (!editando) estado.edicionEnLista = null;
  else {
    for (const clave of [claveGrupoColegio(editando.colegio), claveGrupoCurso(editando.colegio, etiquetaCurso(editando))]) {
      estado.gruposAbiertos.add(clave);
      estado.gruposCerrados.delete(clave);
    }
  }

  let html = "";
  for (const [colegio, porCurso] of porColegio) {
    const totalColegio = [...porCurso.values()].reduce((n, arr) => n + arr.length, 0);
    const soloUnCurso = porCurso.size === 1 || estado.filtros.soloTraspaso;
    const claveCol = claveGrupoColegio(colegio);
    // cursos que quedan desplegados (para saber cómo parte el botón "Minimizar alumnos")
    const cursosAbiertos = [...porCurso.keys()].filter((k) => grupoAbierto(claveGrupoCurso(colegio, k), soloUnCurso)).length;
    html += `<details class="grupo-colegio" data-grupo="${escaparHtml(claveCol)}" ${grupoAbierto(claveCol, abrirSoloUno) ? "open" : ""}>
      <summary>🏫 ${escaparHtml(colegio)}<button type="button" class="btn-lapiz btn-lapiz-colegio" data-colegio="${escaparHtml(colegio)}" title="Cambiar el nombre del colegio" aria-label="Cambiar el nombre del colegio">✎</button> <span class="chip">${porCurso.size} ${porCurso.size === 1 ? "curso" : "cursos"}</span><span class="chip">${totalColegio} ${totalColegio === 1 ? "estudiante" : "estudiantes"}</span>${chipTraspasoHtml([...porCurso.values()].flat())}</summary>
      <div class="grupo-colegio-cont">
        <div class="grupo-colegio-acciones">
          <button type="button" class="chico secundario btn-minimizar-alumnos" ${atributosBotonMinimizar(cursosAbiertos > 0)}>${textoBotonMinimizar(cursosAbiertos > 0)}</button>
          <button class="chico peligro" id="${idSeguro("delcol", colegio)}">🗑 Eliminar colegio completo</button>
        </div>`;

    for (const [claveCurso, estudiantesCurso] of porCurso) {
      const clave = colegio + "|" + claveCurso;
      // mismo orden alfabético y mismo número que lleva cada informe (y su PDF en la carpeta)
      const ordenados = [...estudiantesCurso].sort((a, b) => compararNombres(a.nombre, b.nombre));
      const claveCur = claveGrupoCurso(colegio, claveCurso);
      html += `<details class="grupo-curso" data-grupo="${escaparHtml(claveCur)}" ${grupoAbierto(claveCur, soloUnCurso) ? "open" : ""}>
        <summary>📘 ${escaparHtml(claveCurso)} <span class="chip">${estudiantesCurso.length} ${estudiantesCurso.length === 1 ? "estudiante" : "estudiantes"}</span>${chipTraspasoHtml(estudiantesCurso)}</summary>
        <div class="grupo-curso-cont">
          <div style="margin-bottom:10px; display:flex; gap:8px; flex-wrap:wrap;">
            <button class="chico" id="${idSeguro("grp", clave)}">⬇ Descargar informes de este curso (ZIP)</button>
            ${c.configGrupal ? `<button class="chico secundario" id="${idSeguro("grpori", clave)}">📊 Informe grupal para el orientador (PDF)</button>` : ""}
            <button class="chico peligro" id="${idSeguro("delcurso", clave)}">🗑 Eliminar curso completo</button>
          </div>
          <table class="lista">
            <thead><tr><th style="width:44px;">N°</th><th>Estudiante</th><th>Área(s) de interés</th><th>Acciones</th></tr></thead>
            <tbody>
              ${ordenados
                .map(
                  (e) => `
                  <tr data-id="${e.id}" class="${estado.edicionEnLista === e.id ? "editando" : ""}">
                    <td style="color:#6a6178;">${c.numeroEnGrupo(e) || ""}</td>
                    <td>${nombreConLapizHtml(e)} ${botonTraspasoHtml(e, "abrirEdicionEnLista")}<br/><span style="color:#6a6178;font-size:11px;">${escaparHtml(c.formatearRut(e.rut))}</span></td>
                    <td>${chipsAreas(e)}${avisoTraspasoHtml(e, { conDejarAsi: true })}</td>
                    <td>
                      <div class="fila-acciones">
                        <button class="chico secundario" onclick="abrirEdicionEnLista('${e.id}')">${estado.edicionEnLista === e.id ? "Editando…" : "Editar"}</button>
                        <button class="chico secundario" onclick="accionVerPdf('${e.id}')" title="Ver el informe sin descargarlo">👁 Ver PDF</button>
                        <button class="chico" onclick="accionDescargar('${e.id}', this)">Descargar PDF</button>
                        <button class="chico peligro" onclick="accionEliminar('${e.id}')">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                  ${estado.edicionEnLista === e.id ? `<tr class="fila-edicion"><td colspan="4">${htmlEditorEnLista(e)}</td></tr>` : ""}`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </details>`;
    }
    html += `</div></details>`;
  }
  cont.innerHTML = html;

  // recordar qué colegios/cursos se despliegan o pliegan a mano
  cont.querySelectorAll("details[data-grupo]").forEach((d) =>
    d.addEventListener("toggle", () => {
      if (d.open) {
        estado.gruposAbiertos.add(d.dataset.grupo);
        estado.gruposCerrados.delete(d.dataset.grupo);
      } else {
        estado.gruposAbiertos.delete(d.dataset.grupo);
        estado.gruposCerrados.add(d.dataset.grupo);
      }
      if (d.classList.contains("grupo-curso")) actualizarBotonMinimizar(d.closest("details.grupo-colegio"));
    })
  );
  cont.querySelectorAll(".btn-lapiz-colegio").forEach((b) => {
    b.onclick = (ev) => {
      ev.preventDefault(); // que el clic no abra ni cierre el colegio
      ev.stopPropagation();
      abrirRenombrarColegio(b.dataset.colegio);
    };
  });
  // "Minimizar alumnos": pliega todos los cursos del colegio (quedan solo los cursos y
  // cuántos estudiantes tiene cada uno); el mismo botón los vuelve a desplegar
  cont.querySelectorAll(".btn-minimizar-alumnos").forEach((btn) => {
    btn.onclick = () => {
      const detColegio = btn.closest("details.grupo-colegio");
      const cursos = [...detColegio.querySelectorAll("details.grupo-curso")];
      const abrir = !cursos.some((d) => d.open);
      cursos.forEach((d) => (d.open = abrir));
      actualizarBotonMinimizar(detColegio);
    };
  });
  if (editando) cablearEditorEnLista(editando);

  // botones de descarga y de eliminación grupal (se cablean después de insertar el HTML)
  for (const [colegio, porCurso] of porColegio) {
    const idsColegio = [...porCurso.values()].flat().map((e) => e.id);
    const btnDelColegio = document.getElementById(idSeguro("delcol", colegio));
    if (btnDelColegio) {
      btnDelColegio.onclick = () => accionEliminarGrupo(`el colegio "${colegio}" completo`, idsColegio);
    }

    for (const [claveCurso, estudiantesCurso] of porCurso) {
      const clave = colegio + "|" + claveCurso;
      const btn = document.getElementById(idSeguro("grp", clave));
      if (btn) btn.onclick = () => antesDeGenerarInformes(estudiantesCurso, () => descargarConProgreso(estudiantesCurso, btn));

      // el informe grupal se arma con el curso completo, no solo con los filtrados
      const cursoCompleto = todos.filter((e) => e.colegio === colegio && etiquetaCurso(e) === claveCurso);
      const btnOri = document.getElementById(idSeguro("grpori", clave));
      if (btnOri) btnOri.onclick = () => antesDeGenerarInformes(cursoCompleto, () => accionInformeGrupal(cursoCompleto, btnOri));

      const btnDel = document.getElementById(idSeguro("delcurso", clave));
      if (btnDel) {
        btnDel.onclick = () =>
          accionEliminarGrupo(`el curso "${colegio} - ${claveCurso}"`, estudiantesCurso.map((e) => e.id));
      }
    }
  }
}

// recuadro arriba de la lista (solo Kuder) con cuántos estudiantes cargados tienen el
// test mal traspasado, y un botón para ver solo a esos
function renderResumenTraspaso(todos) {
  const cont = document.getElementById("resumen-traspaso");
  if (!cont) return;
  if (!cfg().revisarTraspaso) {
    cont.innerHTML = "";
    return;
  }
  const conError = todos.map((e) => pendienteTraspaso(e)).filter(Boolean);
  const nDejados = todos.filter((e) => traspasoDejadoAsi(e) && revisionTraspaso(e.puntajes)).length;
  if (conError.length === 0) {
    estado.filtros.soloTraspaso = false;
    cont.innerHTML = todos.length
      ? `<div class="resumen-traspaso ok">✓ Revisión de traspaso: ${
          nDejados
            ? `no quedan pendientes (${nDejados} ${nDejados === 1 ? "se revisó y se dejó así" : "se revisaron y se dejaron así"}).`
            : "todos los estudiantes cargados suman 45 puntos."
        }</div>`
      : "";
    return;
  }
  const nAfecta = conError.filter((r) => r.analisis.afecta).length;
  const nSinEfecto = conError.length - nAfecta;
  cont.innerHTML = `
    <div class="resumen-traspaso${nAfecta ? " afecta" : ""}">
      <div>
        <b>🔎 Pendientes por revisar:</b> ${conError.length} ${conError.length === 1 ? "estudiante tiene" : "estudiantes tienen"} el test mal traspasado (sus 10 áreas no suman 45).
        ${nAfecta ? `<br/>⚠ <b>${nAfecta}</b> ${nAfecta === 1 ? "debe revisarse" : "deben revisarse"}: el error podría cambiar sus resultados.` : ""}
        ${nSinEfecto ? `<br/>ℹ️ <b>${nSinEfecto}</b> no ${nSinEfecto === 1 ? "necesita" : "necesitan"} revisión: sus resultados quedan iguales.` : ""}
        ${nDejados ? `<br/>✓ ${nDejados} ${nDejados === 1 ? "se revisó y se dejó así" : "se revisaron y se dejaron así"}.` : ""}
      </div>
      <div class="resumen-traspaso-botones">
        <button type="button" class="chico secundario" id="btn-solo-traspaso">${estado.filtros.soloTraspaso ? "Ver todos los estudiantes" : "Ver solo estos estudiantes"}</button>
        <button type="button" class="chico" id="btn-ir-correccion">🔎 Ir a la pestaña Corrección</button>
      </div>
    </div>`;
  document.getElementById("btn-solo-traspaso").onclick = () => {
    estado.filtros.soloTraspaso = !estado.filtros.soloTraspaso;
    renderEstudiantes();
  };
  document.getElementById("btn-ir-correccion").onclick = () => irACorreccion();
}

// ---------------- pestaña "Corrección" (solo Kuder) ----------------
// Subpestaña "Pendientes": todos los estudiantes cargados cuyo test no suma 45, por
// colegio y curso, para revisarlos de corrido con sus hojas de respuestas: "✏️ Corregir"
// abre el mismo panel de edición de "Estudiantes e informes" (justo debajo del
// estudiante) y "✓ Dejar así" lo saca de los pendientes sin cambiar sus puntajes.
// Subpestaña "Recién corregidos": los últimos 10 corregidos o dejados así, para arreglar
// al tiro una equivocación sin tener que buscar al estudiante en su curso; abajo, todos
// los que se dejaron así.

function renderConteoCorreccion() {
  const el = document.getElementById("conteo-correccion");
  if (!el) return;
  const c = cfg();
  const n = c.revisarTraspaso ? c.store.listar().filter((e) => pendienteTraspaso(e)).length : 0;
  el.textContent = n ? String(n) : "";
}

function irACorreccion() {
  estado.tab = "correccion";
  estado.subCorreccion = "pendientes";
  render();
  document.querySelector(".tabs").scrollIntoView({ block: "start" });
}

function renderCorreccion() {
  const c = cfg();
  document.querySelectorAll("#panel-correccion .subtab-btn").forEach((b) => {
    b.classList.toggle("activo", b.dataset.sub === estado.subCorreccion);
    b.onclick = () => {
      if (estado.subCorreccion === b.dataset.sub) return;
      estado.subCorreccion = b.dataset.sub;
      estado.edicionEnLista = null; // el panel de edición no se lleva a la otra subpestaña
      renderCorreccion();
    };
  });
  document.getElementById("sub-pendientes").style.display = estado.subCorreccion === "recientes" ? "none" : "";
  document.getElementById("sub-recientes").style.display = estado.subCorreccion === "recientes" ? "" : "none";
  const nPendientes = c.revisarTraspaso ? c.store.listar().filter((e) => pendienteTraspaso(e)).length : 0;
  document.getElementById("conteo-sub-pendientes").textContent = nPendientes ? String(nPendientes) : "";
  if (estado.subCorreccion === "recientes") renderRecientesCorreccion();
  else renderPendientesCorreccion();
}

function renderPendientesCorreccion() {
  const c = cfg();
  const cont = document.getElementById("lista-correccion");
  const contResumen = document.getElementById("resumen-correccion");
  if (!c.revisarTraspaso) {
    cont.innerHTML = contResumen.innerHTML = "";
    return;
  }
  const todos = c.store.listar();
  const pendientes = todos.filter((e) => pendienteTraspaso(e));
  const dejados = todos.filter((e) => traspasoDejadoAsi(e) && revisionTraspaso(e.puntajes));
  const afecta = (e) => pendienteTraspaso(e).analisis.afecta;
  const f = estado.filtrosCorreccion;

  // filtros
  const selColegio = document.getElementById("c-colegio");
  const selTipo = document.getElementById("c-tipo");
  const inpNombre = document.getElementById("c-nombre");
  const colegios = opcionesUnicas(pendientes, "colegio");
  selColegio.innerHTML =
    `<option value="">Todos</option>` + colegios.map((v) => `<option value="${escaparHtml(v)}">${escaparHtml(v)}</option>`).join("");
  if (!colegios.includes(f.colegio)) f.colegio = "";
  selColegio.value = f.colegio;
  selTipo.value = f.tipo;
  inpNombre.value = f.nombre;
  selColegio.onchange = () => { f.colegio = selColegio.value; renderCorreccion(); };
  selTipo.onchange = () => { f.tipo = selTipo.value; renderCorreccion(); };
  inpNombre.oninput = () => { f.nombre = inpNombre.value; renderCorreccion(); };

  const pasaFiltro = (e) => (!f.colegio || e.colegio === f.colegio) && (!f.nombre || coincideTexto(e.nombre, f.nombre));
  const visibles = pendientes
    .filter(pasaFiltro)
    .filter((e) => !f.tipo || (f.tipo === "afecta") === afecta(e));

  // resumen y "dejar así" a todos los que no necesitan revisión
  const nAfecta = pendientes.filter(afecta).length;
  const nSinEfecto = pendientes.length - nAfecta;
  const sinEfectoVisibles = visibles.filter((e) => !afecta(e));
  if (todos.length === 0) {
    contResumen.innerHTML = `<div class="vacio">Todavía no hay estudiantes del ${c.nombre}. Cárgalos desde la pestaña "📝 Ingresar datos".</div>`;
  } else if (pendientes.length === 0) {
    contResumen.innerHTML = `<div class="resumen-traspaso ok">✓ No hay tests pendientes por revisar: ${
      dejados.length
        ? `los demás suman 45, y ${dejados.length} ${dejados.length === 1 ? "se revisó y se dejó así" : "se revisaron y se dejaron así"} (están en "Recién corregidos").`
        : "todos los estudiantes cargados suman 45 puntos."
    }</div>`;
  } else {
    contResumen.innerHTML = `
      <div class="resumen-traspaso${nAfecta ? " afecta" : ""}">
        <div>
          <b>🔎 ${pendientes.length} ${pendientes.length === 1 ? "estudiante pendiente" : "estudiantes pendientes"} por revisar</b> (sus 10 áreas no suman 45).
          ${nAfecta ? `<br/>⚠ <b>${nAfecta}</b> ${nAfecta === 1 ? "debe revisarse" : "deben revisarse"}: el error podría cambiar sus resultados.` : ""}
          ${nSinEfecto ? `<br/>ℹ️ <b>${nSinEfecto}</b> no ${nSinEfecto === 1 ? "necesita" : "necesitan"} revisión: aunque se corrija, sus resultados quedan iguales.` : ""}
        </div>
        ${
          sinEfectoVisibles.length
            ? `<button type="button" class="chico exito" id="btn-dejar-sin-efecto" title="Dejar así a todos los que no necesitan revisión (con el filtro que tengas puesto)">✓ Dejar así ${
                sinEfectoVisibles.length === 1 ? "al que no necesita revisión" : `a los ${sinEfectoVisibles.length} que no necesitan revisión`
              }</button>`
            : ""
        }
      </div>`;
    const btnVarios = document.getElementById("btn-dejar-sin-efecto");
    if (btnVarios) btnVarios.onclick = () => accionDejarAsiVarios(sinEfectoVisibles);
  }

  // lista de pendientes, por colegio y curso (en el mismo orden y con el mismo número de su informe)
  const porColegio = agrupar(visibles);
  const enOrden = [];
  let html = "";
  for (const [colegio, porCurso] of porColegio) {
    for (const [claveCurso, estudiantesCurso] of porCurso) {
      const ordenados = [...estudiantesCurso].sort((a, b) => compararNombres(a.nombre, b.nombre));
      enOrden.push(...ordenados);
      html += `
        <div class="correccion-grupo">
          <div class="correccion-grupo-titulo">🏫 ${escaparHtml(colegio)} <span class="correccion-sep">·</span> 📘 ${escaparHtml(claveCurso)} ${chipTraspasoHtml(ordenados)}<span class="marcas-conteo">${textoConteoMarcas(ordenados.filter((e) => hojasMarcadas.has(e.id)).length, ordenados.length)}</span></div>
          <table class="lista">
            <thead><tr><th class="celda-marca" title="Ayuda visual: marca las hojas que ya sacaste de la pila (no guarda nada)">☑</th><th style="width:44px;">N°</th><th>Estudiante</th><th>Qué revisar</th><th style="width:210px;">Acciones</th></tr></thead>
            <tbody>
              ${ordenados
                .map((e) => {
                  const r = pendienteTraspaso(e);
                  const t = r.texto;
                  const editandoEste = estado.edicionEnLista === e.id;
                  return `
                  <tr data-id="${e.id}" class="${[editandoEste ? "editando" : "", hojasMarcadas.has(e.id) ? "marcado-visual" : ""].join(" ").trim()}">
                    <td class="celda-marca"><input type="checkbox" class="chk-marca-visual" data-id="${e.id}" ${hojasMarcadas.has(e.id) ? "checked" : ""} title="Marcar como hoja ya sacada (solo ayuda visual: no cambia ni guarda nada)" aria-label="Marcar a ${escaparHtml(e.nombre)} (solo ayuda visual)" /></td>
                    <td style="color:#6a6178;">${c.numeroEnGrupo(e) || ""}</td>
                    <td>${nombreConLapizHtml(e)} ${botonTraspasoHtml(e, "abrirEdicionEnLista")}<br/><span style="color:#6a6178;font-size:11px;">${escaparHtml(c.formatearRut(e.rut))}</span></td>
                    <td><div class="traspaso-aviso${t.afecta ? " afecta" : ""}">${t.afecta ? "⚠" : "ℹ️"} <b>${escaparHtml(t.resumen)}.</b> ${escaparHtml(t.accion)}. ${escaparHtml(t.detalle)}</div></td>
                    <td>
                      <div class="fila-acciones">
                        <button class="chico secundario" onclick="abrirEdicionEnLista('${e.id}')">${editandoEste ? "Corrigiendo…" : "✏️ Corregir"}</button>
                        ${botonDejarAsiHtml(e)}
                      </div>
                    </td>
                  </tr>
                  ${editandoEste ? `<tr class="fila-edicion"><td colspan="5">${htmlEditorEnLista(e)}</td></tr>` : ""}`;
                })
                .join("")}
            </tbody>
          </table>
        </div>`;
    }
  }
  // para "Guardar y seguir con el siguiente pendiente" y para saber si sigue en pantalla quien se editaba
  estado.pendientesVisibles = enOrden.map((e) => e.id);
  const editando = enOrden.find((e) => e.id === estado.edicionEnLista) || null;
  if (!editando) estado.edicionEnLista = null;
  if (todos.length === 0 || pendientes.length === 0) cont.innerHTML = "";
  else if (visibles.length === 0) cont.innerHTML = `<div class="vacio">No hay pendientes que coincidan con el filtro.</div>`;
  else cont.innerHTML = html;
  if (editando) cablearEditorEnLista(editando);
  cont.querySelectorAll(".chk-marca-visual").forEach((chk) => (chk.onchange = () => alternarMarcaVisual(chk)));
}

// Casilla junto a cada pendiente: solo una ayuda visual para ir marcando las hojas que
// ya se sacaron de la pila (la fila queda atenuada). Vive en la memoria de la página:
// no cambia la corrección, no se guarda en ningún lado y se pierde al recargar.
const hojasMarcadas = new Set();

function textoConteoMarcas(marcados, total) {
  return marcados ? `☑ ${marcados} de ${total} ${marcados === 1 ? "marcado" : "marcados"}` : "";
}

function alternarMarcaVisual(chk) {
  if (chk.checked) hojasMarcadas.add(chk.dataset.id);
  else hojasMarcadas.delete(chk.dataset.id);
  const fila = chk.closest("tr");
  if (fila) fila.classList.toggle("marcado-visual", chk.checked);
  const grupo = chk.closest(".correccion-grupo");
  if (grupo) {
    const casillas = [...grupo.querySelectorAll(".chk-marca-visual")];
    grupo.querySelector(".marcas-conteo").textContent = textoConteoMarcas(casillas.filter((x) => x.checked).length, casillas.length);
  }
}

const MAX_RECIEN_CORREGIDOS = 10;

// la última corrección de un estudiante, si sigue valiendo con sus puntajes de ahora
// ("dejado": sigue dejado así; "corregido": sigue sumando 45). Los que se dejaron así
// antes de que existiera este registro usan su última actualización como fecha.
function correccionVigente(e) {
  const corr = e.correccion || (e.traspasoAceptado ? { como: "dejado", en: e.actualizadoEn || "" } : null);
  if (!corr) return null;
  const malTraspasado = !!revisionTraspaso(e.puntajes);
  if (corr.como === "dejado") return malTraspasado && traspasoDejadoAsi(e) ? corr : null;
  return malTraspasado ? null : corr;
}

function fmtCuando(iso) {
  const d = new Date(iso || "");
  if (isNaN(d)) return "";
  const dos = (n) => String(n).padStart(2, "0");
  const hora = `${dos(d.getHours())}:${dos(d.getMinutes())}`;
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === new Date().toDateString()) return `Hoy, ${hora}`;
  if (d.toDateString() === ayer.toDateString()) return `Ayer, ${hora}`;
  return `${dos(d.getDate())}-${dos(d.getMonth() + 1)}-${d.getFullYear()}, ${hora}`;
}

function renderRecientesCorreccion() {
  const c = cfg();
  const cont = document.getElementById("lista-recientes");
  const contDejados = document.getElementById("dejados-correccion");
  if (!c.revisarTraspaso) {
    cont.innerHTML = contDejados.innerHTML = "";
    return;
  }
  const todos = c.store.listar();
  const recientes = todos
    .map((e) => ({ e, corr: correccionVigente(e) }))
    .filter((x) => x.corr)
    .sort((a, b) => (a.corr.en < b.corr.en ? 1 : a.corr.en > b.corr.en ? -1 : 0))
    .slice(0, MAX_RECIEN_CORREGIDOS);

  estado.pendientesVisibles = []; // aquí no va "Guardar y seguir con el siguiente pendiente"
  const editando = (recientes.find((x) => x.e.id === estado.edicionEnLista) || {}).e || null;
  if (!editando) estado.edicionEnLista = null;

  cont.innerHTML = recientes.length
    ? `
    <table class="lista">
      <thead><tr><th style="width:120px;">Cuándo</th><th>Estudiante</th><th>Colegio y curso</th><th>Corrección</th><th>Área(s) de interés</th><th style="width:230px;">Acciones</th></tr></thead>
      <tbody>
        ${recientes
          .map(({ e, corr }) => {
            const r = revisionTraspaso(e.puntajes);
            const editandoEste = estado.edicionEnLista === e.id;
            const numero = c.numeroEnGrupo(e);
            return `
            <tr data-id="${e.id}" class="${editandoEste ? "editando" : ""}">
              <td style="color:#6a6178;font-size:12px;">${escaparHtml(fmtCuando(corr.en))}</td>
              <td>${nombreConLapizHtml(e)}<br/><span style="color:#6a6178;font-size:11px;">${escaparHtml(c.formatearRut(e.rut))}</span></td>
              <td>${escaparHtml(e.colegio)}<br/><span style="color:#6a6178;font-size:12px;">${escaparHtml(etiquetaCurso(e))}${numero ? ` · N° ${numero}` : ""}</span></td>
              <td>${
                corr.como === "dejado"
                  ? `<span class="chip chip-dejado">✓ Dejado así · ${r.analisis.total}/${SUMA_ESPERADA_KUDER}</span>`
                  : `<span class="chip chip-corregido">✏️ Corregido · suma ${SUMA_ESPERADA_KUDER}</span>`
              }</td>
              <td>${chipsAreas(e)}</td>
              <td>
                <div class="fila-acciones">
                  <button class="chico secundario" onclick="abrirEdicionEnLista('${e.id}')">${editandoEste ? "Modificando…" : "✏️ Modificar"}</button>
                  ${corr.como === "dejado" ? `<button class="chico secundario" onclick="accionVolverAPendiente('${e.id}')">↩ Volver a pendiente</button>` : ""}
                </div>
              </td>
            </tr>
            ${editandoEste ? `<tr class="fila-edicion"><td colspan="6">${htmlEditorEnLista(e)}</td></tr>` : ""}`;
          })
          .join("")}
      </tbody>
    </table>`
    : `<div class="vacio">Todavía no has corregido ni dejado así a ningún estudiante.</div>`;
  if (editando) cablearEditorEnLista(editando);

  // todos los que se revisaron y se dejaron así, por si hay que volver a marcar alguno como pendiente
  const dejados = todos
    .filter((e) => traspasoDejadoAsi(e) && revisionTraspaso(e.puntajes))
    .sort((a, b) => compararNombres(a.nombre, b.nombre));
  contDejados.innerHTML = dejados.length
    ? `
      <details class="correccion-dejados" ${estado.dejadosAbierto ? "open" : ""}>
        <summary>✓ Todos los dejados así <span class="chip">${dejados.length}</span></summary>
        <p class="ayuda">No suman 45, pero se revisaron y se dejaron así: ya no aparecen como pendientes y su informe sale sin la marca "(44 de 45)". Si alguno se dejó así por error, vuelve a marcarlo como pendiente (o usa "Deshacer" arriba).</p>
        <table class="lista">
          <thead><tr><th>Estudiante</th><th>Colegio y curso</th><th>Suma</th><th style="width:210px;">Acción</th></tr></thead>
          <tbody>
            ${dejados
              .map((e) => {
                const r = revisionTraspaso(e.puntajes);
                return `<tr>
                  <td>${nombreConLapizHtml(e)}</td>
                  <td>${escaparHtml(e.colegio)} · ${escaparHtml(etiquetaCurso(e))}</td>
                  <td>${escaparHtml(r.texto.resumen)}</td>
                  <td><button class="chico secundario" onclick="accionVolverAPendiente('${e.id}')">↩ Volver a pendiente</button></td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </details>`
    : "";
  const det = contDejados.querySelector("details");
  if (det) det.addEventListener("toggle", () => (estado.dejadosAbierto = det.open));
}

// ---------------- nombre de un colegio (lápiz ✎ junto al colegio) ----------------
// Cambia el nombre en todos sus estudiantes (también en la previsualización de
// "Descargar todos los cursos"): sale así en los informes, carpetas y CSV.

let colegioARenombrar = null;

function abrirRenombrarColegio(colegio) {
  colegioARenombrar = colegio;
  const n = cfg().store.listar().filter((e) => e.colegio === colegio).length;
  document.getElementById("mrc-sub").textContent = `Se cambia en ${n === 1 ? "su estudiante" : `sus ${n} estudiantes`}: así saldrá en los informes, las carpetas y los CSV. Si escribes el nombre de otro colegio ya cargado, quedan juntos.`;
  const inp = document.getElementById("mrc-nombre");
  inp.value = colegio;
  inp.classList.remove("invalido");
  document.getElementById("modal-renombrar-colegio").style.display = "flex";
  inp.focus();
  inp.select();
}

function cerrarRenombrarColegio() {
  document.getElementById("modal-renombrar-colegio").style.display = "none";
  colegioARenombrar = null;
}

function guardarRenombrarColegio() {
  const inp = document.getElementById("mrc-nombre");
  const nuevo = inp.value.replace(/\s+/g, " ").trim();
  inp.classList.toggle("invalido", !nuevo);
  if (!nuevo) return mostrarToast("El nombre del colegio no puede quedar vacío");
  const anterior = colegioARenombrar;
  cerrarRenombrarColegio();
  if (anterior === null || nuevo === anterior) return;
  cfg().store.renombrarColegios([[anterior, nuevo]]);
  if (estado.filtros.colegio === anterior) estado.filtros.colegio = nuevo;
  // el colegio sigue abierto (o cerrado) como estaba
  if (estado.gruposAbiertos.delete(claveGrupoColegio(anterior))) estado.gruposAbiertos.add(claveGrupoColegio(nuevo));
  render();
  mostrarToast(`Colegio renombrado: ${nuevo} (puedes deshacerlo arriba)`);
}

function cablearRenombrarColegio() {
  const modal = document.getElementById("modal-renombrar-colegio");
  document.getElementById("mrc-cancelar").addEventListener("click", cerrarRenombrarColegio);
  document.getElementById("mrc-guardar").addEventListener("click", guardarRenombrarColegio);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) cerrarRenombrarColegio();
  });
  modal.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      guardarRenombrarColegio();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      cerrarRenombrarColegio();
    }
  });
}

// ---------------- nombre y RUT de un estudiante (lápiz ✎ junto a su nombre) ----------------

let datosAlumnoId = null;

function abrirDatosAlumno(id) {
  const c = cfg();
  const e = c.store.obtener(id);
  if (!e) return;
  datosAlumnoId = id;
  document.getElementById("mda-sub").textContent = [e.colegio, etiquetaCurso(e)].filter(Boolean).join(" · ");
  const nombre = document.getElementById("mda-nombre");
  nombre.value = e.nombre;
  nombre.classList.remove("invalido");
  document.getElementById("mda-rut").value = e.rut || "";
  document.getElementById("modal-datos-alumno").style.display = "flex";
  nombre.focus();
  nombre.select();
}

function cerrarDatosAlumno() {
  document.getElementById("modal-datos-alumno").style.display = "none";
  datosAlumnoId = null;
}

function guardarDatosAlumno() {
  const c = cfg();
  const id = datosAlumnoId;
  if (!id || !c.store.obtener(id)) return cerrarDatosAlumno();
  const inpNombre = document.getElementById("mda-nombre");
  const nombre = inpNombre.value.trim();
  inpNombre.classList.toggle("invalido", !nombre);
  if (!nombre) {
    mostrarToast("El nombre no puede quedar vacío");
    return;
  }
  const rut = document.getElementById("mda-rut").value.trim();
  c.store.actualizar(id, { nombre, rut });
  cerrarDatosAlumno();
  if (TABS_CON_EDICION_EN_LISTA.includes(estado.tab)) actualizarListaConservandoPosicion(id);
  else render();
  // si su panel de edición estaba abierto, se le pone el nombre y RUT nuevos
  const editor = estado.edicionEnLista === id ? enListaEditable(".editor-en-lista") : null;
  if (editor) {
    editor.querySelector("[name='ed_nombre']").value = nombre;
    editor.querySelector("[name='ed_rut']").value = rut;
  }
  mostrarToast(`Datos actualizados: ${nombre}`);
}

function cablearDatosAlumno() {
  const modal = document.getElementById("modal-datos-alumno");
  document.getElementById("mda-cancelar").addEventListener("click", cerrarDatosAlumno);
  document.getElementById("mda-guardar").addEventListener("click", guardarDatosAlumno);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) cerrarDatosAlumno();
  });
  modal.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      guardarDatosAlumno();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      cerrarDatosAlumno();
    }
  });
}

// "✓ Dejar así" de un estudiante: sus puntajes quedan como están y deja de aparecer
// como pendiente (se puede deshacer, o volver a marcar desde la pestaña "Corrección")
function accionDejarAsi(id) {
  const c = cfg();
  const e = c.store.obtener(id);
  const r = e && pendienteTraspaso(e);
  if (!r || !c.huellaTraspaso) return;
  if (estado.edicionEnLista === id) estado.edicionEnLista = null; // su panel se cierra sin guardar lo escrito
  c.store.marcarTraspasoAceptado([id], c.huellaTraspaso);
  actualizarListaConservandoPosicion(id);
  mostrarToast(`✓ ${e.nombre} queda así, con ${r.analisis.total} de ${SUMA_ESPERADA_KUDER}: ya no aparece como pendiente.`);
}

function accionDejarAsiVarios(lista) {
  const c = cfg();
  if (!lista.length || !c.huellaTraspaso) return;
  const nombres =
    lista
      .slice(0, 8)
      .map((e) => `${escaparHtml(e.nombre)} (${pendienteTraspaso(e).analisis.total}/${SUMA_ESPERADA_KUDER})`)
      .join(", ") + (lista.length > 8 ? ` y ${lista.length - 8} más` : "");
  elegirOpcion({
    titulo: "✓ Dejar así a los que no necesitan revisión",
    texto: `${lista.length === 1 ? "Este estudiante no suma" : `Estos ${lista.length} estudiantes no suman`} ${SUMA_ESPERADA_KUDER}, pero aunque se corrija el error sus resultados quedan iguales: ${nombres}.<br/><br/>${
      lista.length === 1
        ? "Sus puntajes quedan como están, deja de aparecer como pendiente y su informe sale sin la marca."
        : "Sus puntajes quedan como están, dejan de aparecer como pendientes y sus informes salen sin la marca."
    } Se puede deshacer con "Deshacer" arriba, o volver a marcar a cualquiera como pendiente.`,
    opciones: [
      {
        texto: lista.length === 1 ? "✓ Sí, dejarlo así" : `✓ Sí, dejar así a los ${lista.length}`,
        clase: "exito",
        accion: () => {
          if (lista.some((e) => e.id === estado.edicionEnLista)) estado.edicionEnLista = null;
          c.store.marcarTraspasoAceptado(
            lista.map((e) => e.id),
            c.huellaTraspaso
          );
          render();
          mostrarToast(`✓ ${lista.length === 1 ? "1 estudiante quedó así" : `${lista.length} estudiantes quedaron así`}: ya no aparecen como pendientes.`);
        },
      },
    ],
  });
}

function accionVolverAPendiente(id) {
  const c = cfg();
  const e = c.store.obtener(id);
  if (!e) return;
  c.store.marcarTraspasoAceptado([id], null);
  render();
  mostrarToast(`${e.nombre} vuelve a estar pendiente por revisar.`);
}

// ---------------- edición en la misma lista ("Estudiantes e informes") ----------------
// "Editar" (y el ícono ⚠) abren un panel justo debajo del estudiante, sin cambiar de
// pestaña. Al guardar, la lista se actualiza en el lugar: los colegios/cursos abiertos
// siguen abiertos y la pantalla queda en la misma posición, para seguir con el
// siguiente. La edición desde "Ingresar datos" sigue igual que antes.

// un colegio/curso queda desplegado si se abrió a mano, o si se abre solo (colegio o
// curso único, filtro de pendientes) y no se plegó a mano
function grupoAbierto(clave, abiertoPorDefecto) {
  return estado.gruposAbiertos.has(clave) || (abiertoPorDefecto && !estado.gruposCerrados.has(clave));
}

function textoBotonMinimizar(hayCursosAbiertos) {
  return hayCursosAbiertos ? "▴ Minimizar alumnos" : "▾ Mostrar alumnos";
}

function tituloBotonMinimizar(hayCursosAbiertos) {
  return hayCursosAbiertos
    ? "Contraer los cursos: se ven solo los cursos y cuántos estudiantes tiene cada uno"
    : "Desplegar los estudiantes de todos los cursos de este colegio";
}

function atributosBotonMinimizar(hayCursosAbiertos) {
  return `title="${tituloBotonMinimizar(hayCursosAbiertos)}" aria-expanded="${hayCursosAbiertos}"`;
}

function actualizarBotonMinimizar(detColegio) {
  const btn = detColegio && detColegio.querySelector(".btn-minimizar-alumnos");
  if (!btn) return;
  const hayAbiertos = [...detColegio.querySelectorAll("details.grupo-curso")].some((d) => d.open);
  btn.textContent = textoBotonMinimizar(hayAbiertos);
  btn.title = tituloBotonMinimizar(hayAbiertos);
  btn.setAttribute("aria-expanded", String(hayAbiertos));
}

function claveGrupoColegio(colegio) {
  return "col|" + (colegio || "");
}

function claveGrupoCurso(colegio, claveCurso) {
  return "cur|" + (colegio || "") + "|" + claveCurso;
}

// lista donde se edita: "Estudiantes e informes" o "Corrección"
function contenedorListaEditable() {
  if (estado.tab === "correccion") {
    return document.getElementById(estado.subCorreccion === "recientes" ? "lista-recientes" : "lista-correccion");
  }
  return document.getElementById("grupos-estudiantes");
}

// busca dentro de la lista de la pestaña abierta (la otra lista puede seguir en la
// página, oculta, con su propio panel de edición)
function enListaEditable(selector) {
  const cont = contenedorListaEditable();
  return cont ? cont.querySelector(selector) : null;
}

function filaDeEstudiante(id) {
  const cont = contenedorListaEditable();
  return cont ? cont.querySelector(`tr[data-id="${id}"]`) : null;
}

function idsDeFilasEnPantalla() {
  const cont = contenedorListaEditable();
  return cont ? [...cont.querySelectorAll("tr[data-id]")].map((tr) => tr.dataset.id) : [];
}

// vuelve a dibujar la lista dejando la fila de "idAncla" en el mismo lugar de la
// pantalla; si esa fila ya no está (por ejemplo, dejó de estar pendiente con el filtro
// "Ver solo estos estudiantes"), se usa la siguiente que sí esté
// Al cerrarse un panel de edición (o salir un estudiante de la lista) la página se
// acorta; si eso pasa cerca del final, el navegador sube la pantalla solo y parece que
// la app "lleva a otra parte". Para evitarlo, se agrega al final un espacio en blanco
// del mismo alto que se perdió, y ese espacio se va achicando a medida que se sube, sin
// mover nunca lo que se está viendo.
function mantenerAlturaPagina(altoAntes) {
  const espaciador = document.getElementById("espaciador-final");
  if (!espaciador) return;
  const actual = espaciador.offsetHeight;
  const perdido = altoAntes - document.documentElement.scrollHeight;
  if (perdido > 0) espaciador.style.height = `${actual + perdido}px`;
  recortarEspaciadorFinal();
}

// achica el espacio del final en todo lo que ya no se ve (debajo de la pantalla)
function recortarEspaciadorFinal() {
  const espaciador = document.getElementById("espaciador-final");
  if (!espaciador || !espaciador.offsetHeight) return;
  const debajoDeLaPantalla = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
  const nuevo = Math.max(0, espaciador.offsetHeight - Math.max(0, debajoDeLaPantalla));
  espaciador.style.height = nuevo ? `${nuevo}px` : "";
}

function actualizarListaConservandoPosicion(idAncla) {
  const antes = filaDeEstudiante(idAncla);
  const top = antes ? antes.getBoundingClientRect().top : null;
  const altoPagina = document.documentElement.scrollHeight;
  const ids = idsDeFilasEnPantalla();
  const siguientes = ids.slice(ids.indexOf(idAncla) + 1);
  // si queda abierto el panel de otro estudiante (por ejemplo, se dejó así a uno
  // mientras se editaba a otro), lo que estaba escrito y sin guardar no se pierde
  const editor = enListaEditable(".editor-en-lista");
  const escrito =
    editor && editor.dataset.id === estado.edicionEnLista
      ? [...editor.querySelectorAll("input[name]")].map((inp) => [inp.name, inp.value])
      : null;
  render();
  mantenerAlturaPagina(altoPagina);
  if (escrito) {
    const nuevo = enListaEditable(".editor-en-lista");
    if (nuevo && nuevo.dataset.id === estado.edicionEnLista) {
      escrito.forEach(([nombre, valor]) => {
        const inp = nuevo.querySelector(`[name="${nombre}"]`);
        if (inp) inp.value = valor;
      });
      const unPuntaje = nuevo.querySelector("input[name^='ed_p_']");
      if (unPuntaje) unPuntaje.dispatchEvent(new Event("input"));
    }
  }
  if (top === null) return;
  let fila = filaDeEstudiante(idAncla);
  for (let i = 0; !fila && i < siguientes.length; i++) fila = filaDeEstudiante(siguientes[i]);
  if (fila) window.scrollBy(0, fila.getBoundingClientRect().top - top);
}

function abrirEdicionEnLista(id) {
  if (!TABS_CON_EDICION_EN_LISTA.includes(estado.tab)) {
    abrirCorreccionPuntajes(id);
    return;
  }
  estado.edicionEnLista = id;
  actualizarListaConservandoPosicion(id);
  const primero =
    enListaEditable(".editor-en-lista .ed-candidata input") ||
    enListaEditable(".editor-en-lista [name='ed_p_" + cfg().areas[0].id + "']");
  if (primero) {
    primero.focus({ preventScroll: true });
    primero.select();
  }
  const editor = enListaEditable(".fila-edicion");
  if (editor) {
    const r = editor.getBoundingClientRect();
    if (r.bottom > window.innerHeight) window.scrollBy(0, Math.min(r.bottom - window.innerHeight + 16, r.top - 90));
  }
}

function cerrarEdicionEnLista() {
  const id = estado.edicionEnLista;
  estado.edicionEnLista = null;
  actualizarListaConservandoPosicion(id);
}

// próximo estudiante pendiente por revisar (test mal traspasado) después de "id", en el
// mismo orden de la lista (mismo curso primero); si no hay más abajo, se busca desde arriba
function siguientePendienteEnLista(id) {
  const c = cfg();
  const ids = idsDeFilasEnPantalla();
  const idx = ids.indexOf(id);
  const orden = [...ids.slice(idx + 1), ...ids.slice(0, Math.max(0, idx))];
  return orden.find((otro) => {
    const e = c.store.obtener(otro);
    return e && pendienteTraspaso(e);
  }) || null;
}

function htmlEditorEnLista(e) {
  const c = cfg();
  const dejado = traspasoDejadoAsi(e);
  const r = dejado ? null : revisionTraspaso(e.puntajes);
  const candidatas = new Set(r && r.analisis.afecta ? r.analisis.areas.map((v) => v.area.id) : []);
  const hayOtroPendiente = c.revisarTraspaso && (estado.pendientesVisibles || []).some((otro) => otro !== e.id);
  const rDejado = dejado ? revisionTraspaso(e.puntajes) : null;
  return `
    <div class="editor-en-lista" data-id="${e.id}">
      <div class="editor-en-lista-titulo">✏️ Editando a <b>${escaparHtml(e.nombre)}</b></div>
      ${
        r
          ? `<div class="editor-en-lista-aviso${r.texto.afecta ? " afecta" : ""}">${r.texto.afecta ? "⚠" : "ℹ️"} ${escaparHtml(r.texto.resumen)}. ${escaparHtml(r.texto.accion)}. ${escaparHtml(r.texto.detalle)}${
              candidatas.size ? " Las áreas marcadas en amarillo son las primeras que conviene revisar en su hoja de respuestas." : ""
            } Si ya lo revisaste y el puntaje queda como está, usa <b>✓ Dejar así</b>.</div>`
          : ""
      }
      ${
        rDejado
          ? `<div class="editor-en-lista-aviso dejado">✓ ${escaparHtml(rDejado.texto.resumen)}: se revisó y se dejó así. Si cambias sus puntajes, se vuelve a revisar.</div>`
          : ""
      }
      <div class="editor-en-lista-datos">
        <div class="ed-ancho"><label>Nombre *</label><input type="text" name="ed_nombre" value="${escaparHtml(e.nombre)}" /></div>
        <div><label>RUT</label><input type="text" name="ed_rut" value="${escaparHtml(e.rut)}" /></div>
        <div class="ed-ancho"><label>Colegio *</label><input type="text" name="ed_colegio" value="${escaparHtml(e.colegio)}" /></div>
        <div><label>Curso *</label><input type="text" name="ed_curso" value="${escaparHtml(e.curso)}" /></div>
        <div><label>Letra</label><input type="text" name="ed_letra" maxlength="2" value="${escaparHtml(e.letra)}" /></div>
      </div>
      <div class="editor-en-lista-puntajes">
        ${c.areas
          .map(
            (a) => `
          <div class="${candidatas.has(a.id) ? "ed-candidata" : ""}">
            <label>${a.icono} ${a.nombre}${candidatas.has(a.id) ? " · revisar" : ""}</label>
            <input type="number" min="${c.puntajeMin}" max="${c.puntajeMax}" step="1" name="ed_p_${a.id}" value="${escaparHtml(e.puntajes[a.id])}" />
          </div>`
          )
          .join("")}
      </div>
      <div class="suma-puntajes editor-en-lista-suma"></div>
      <div class="editor-en-lista-acciones">
        <button type="button" class="chico" data-ed="guardar">💾 Guardar</button>
        ${hayOtroPendiente ? `<button type="button" class="chico" data-ed="siguiente">💾 Guardar y seguir con el siguiente pendiente</button>` : ""}
        ${r || rDejado ? `<button type="button" class="chico exito" data-ed="dejar" title="Guarda lo escrito y deja sus puntajes así aunque no sumen ${SUMA_ESPERADA_KUDER}: deja de aparecer como pendiente">✓ Dejar así</button>` : ""}
        <button type="button" class="chico secundario" data-ed="descargar">Guardar y descargar su informe</button>
        <button type="button" class="chico secundario" data-ed="cancelar">Cancelar</button>
        <span class="editor-en-lista-ayuda">Enter guarda · Esc cancela</span>
      </div>
    </div>`;
}

function cablearEditorEnLista(e) {
  const editor = enListaEditable(".editor-en-lista");
  if (!editor) return;
  const suma = editor.querySelector(".editor-en-lista-suma");
  const leer = (idArea) => editor.querySelector(`[name="ed_p_${idArea}"]`).value;
  pintarSumaPuntajes(suma, leer);
  editor.querySelectorAll("input[name^='ed_p_']").forEach((inp) => inp.addEventListener("input", () => pintarSumaPuntajes(suma, leer)));
  editor.querySelector("[data-ed='guardar']").onclick = () => guardarEdicionEnLista(e.id);
  const btnSiguiente = editor.querySelector("[data-ed='siguiente']");
  if (btnSiguiente) btnSiguiente.onclick = () => guardarEdicionEnLista(e.id, { seguir: true });
  const btnDejar = editor.querySelector("[data-ed='dejar']");
  if (btnDejar) btnDejar.onclick = () => guardarEdicionEnLista(e.id, { dejarAsi: true });
  editor.querySelector("[data-ed='descargar']").onclick = () => {
    const actualizado = guardarEdicionEnLista(e.id);
    if (actualizado) descargarUnInforme(actualizado, null);
  };
  editor.querySelector("[data-ed='cancelar']").onclick = cerrarEdicionEnLista;
  editor.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      guardarEdicionEnLista(e.id);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      cerrarEdicionEnLista();
    }
  });
}

// guarda lo escrito en el editor de la lista; devuelve el estudiante actualizado, o null
// si algún campo no es válido. "seguir": abre de inmediato al siguiente pendiente.
// "dejarAsi": además deja esos puntajes como revisados aunque no sumen 45.
function guardarEdicionEnLista(id, { seguir = false, dejarAsi = false } = {}) {
  const c = cfg();
  const editor = enListaEditable(".editor-en-lista");
  if (!editor || !c.store.obtener(id)) return null;
  const campo = (nombre) => editor.querySelector(`[name="${nombre}"]`);
  let ok = true;
  const requerido = (nombre) => {
    const inp = campo(nombre);
    const valor = inp.value.trim();
    inp.classList.toggle("invalido", !valor);
    if (!valor) ok = false;
    return valor;
  };
  const nombre = requerido("ed_nombre");
  const colegio = requerido("ed_colegio");
  const curso = requerido("ed_curso");
  const puntajes = {};
  c.areas.forEach((a) => {
    const inp = campo(`ed_p_${a.id}`);
    const n = Number(inp.value);
    const valido = inp.value !== "" && Number.isInteger(n) && n >= c.puntajeMin && n <= c.puntajeMax;
    inp.classList.toggle("invalido", !valido);
    if (valido) puntajes[a.id] = n;
    else ok = false;
  });
  if (!ok) {
    mostrarToast(`Revisa los campos marcados en rojo (los puntajes van de ${c.puntajeMin} a ${c.puntajeMax})`);
    return null;
  }

  const siguiente = seguir ? siguientePendienteEnLista(id) : null;
  const datos = {
    nombre,
    rut: campo("ed_rut").value.trim(),
    colegio,
    curso,
    letra: campo("ed_letra").value.trim().toUpperCase(),
    puntajes,
    ...datosDeCorreccion(c.store.obtener(id), puntajes, dejarAsi),
  };
  const actualizado = c.store.actualizar(id, datos);
  estado.edicionEnLista = siguiente;
  actualizarListaConservandoPosicion(id);

  const r = revisionTraspaso(actualizado.puntajes);
  const areas = c.calcularAreas(actualizado.puntajes).map((a) => a.nombre);
  const resultado = areas.length ? `Áreas de interés: ${areas.join(", ")}.` : "Sin áreas destacadas: su informe mostrará todas las áreas (intereses diversos).";
  mostrarToast(
    c.revisarTraspaso
      ? r
        ? traspasoDejadoAsi(actualizado)
          ? `✓ Queda así, con ${r.analisis.total} de ${SUMA_ESPERADA_KUDER}: ya no aparece como pendiente. ${resultado}`
          : `Guardado. Aún ${r.texto.resumen.toLowerCase()}. ${resultado}`
        : `Guardado: ya suma ${SUMA_ESPERADA_KUDER}. ${resultado}`
      : `Guardado. ${resultado}`
  );

  if (siguiente) {
    const filaSig = filaDeEstudiante(siguiente);
    const editorSig = enListaEditable(".fila-edicion");
    if (filaSig && editorSig) {
      const r1 = filaSig.getBoundingClientRect();
      const r2 = editorSig.getBoundingClientRect();
      if (r1.top < 80 || r2.bottom > window.innerHeight) window.scrollBy(0, r1.top - 120);
    }
    const primero =
      enListaEditable(".editor-en-lista .ed-candidata input") ||
      enListaEditable(".editor-en-lista input[name^='ed_p_']");
    if (primero) {
      primero.focus({ preventScroll: true });
      primero.select();
    }
  }
  return actualizado;
}

function accionEliminarGrupo(descripcion, ids) {
  if (!ids || ids.length === 0) return;
  confirmarAccion({
    titulo: "⚠ Eliminar grupo completo",
    texto: `Esto envía a la papelera a los ${ids.length} estudiantes de ${descripcion}. Podrás recuperarlos después desde la pestaña "Papelera", o deshacer esta acción ahora mismo con el botón "Deshacer" de arriba. ¿Continuar?`,
    textoBoton: "Sí, eliminar",
    onConfirmar: () => {
      cfg().store.moverVariosAPapelera(ids);
      mostrarToast(`${ids.length} estudiantes enviados a la papelera`);
      render();
    },
  });
}

// ---------------- "Descargar todos los cursos" ----------------
// Un archivo ZIP por colegio y, dentro de cada uno, una carpeta por curso con los
// informes de ese curso, numerados del 1 al total (en Kuder, cada carpeta trae además
// su nota de pendientes si los hay). Los ZIP se arman y se descargan de a uno, colegio
// por colegio: así cada colegio queda listo apenas termina, sin juntar todos los
// informes en memoria.

// medido: ~0,4-0,5 s por informe con la pestaña a la vista; en segundo plano el navegador
// la frena y puede tardar 3 o 4 veces más
const SEGUNDOS_POR_INFORME_APROX = 0.6;

function limpiarNombreCarpeta(s) {
  return (s || "")
    .toString()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function descargarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Antes de exportar se muestra qué se va a descargar: cada colegio (un ZIP), sus cursos,
// el nombre de la carpeta de cada curso (se puede corregir ahí mismo) y cuántos
// archivos lleva. Solo se exporta al confirmar.
function accionDescargarTodosLosCursos(lista, btn) {
  if (!lista || lista.length === 0) return;
  const c = cfg();
  const porColegio = agrupar(lista);
  const nColegios = porColegio.size;
  const nCursos = [...porColegio.values()].reduce((acc, porCurso) => acc + porCurso.size, 0);
  const segundos = Math.round(lista.length * SEGUNDOS_POR_INFORME_APROX);
  const tiempo = segundos < 60 ? "menos de un minuto" : `unos ${Math.ceil(segundos / 60)} minutos`;
  const pendientes = lista.filter((e) => pendienteTraspaso(e)).length;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  // cursos en el orden en que se van a exportar, con su carpeta propuesta; el nombre de
  // cada colegio también se puede cambiar aquí (queda cambiado en la app, así también
  // sale con ese nombre en los CSV de "Uso interno")
  const cursos = [];
  const colegios = [];
  let html = "";
  for (const [colegio, porCurso] of porColegio) {
    const delColegio = [...porCurso.values()].flat();
    const k = colegios.length;
    colegios.push({ original: colegio, nCursos: porCurso.size, cursos: [] });
    html += `
      <div class="mx-colegio">
        <div class="mx-colegio-titulo">🏫 <input type="text" class="mx-colegio-nombre" data-k="${k}" value="${escaparHtml(colegio)}" placeholder="Nombre del colegio" spellcheck="false" title="Haz clic para cambiar el nombre del colegio" aria-label="Nombre del colegio" /><span class="mx-lapiz" aria-hidden="true">✎</span>
          <span class="mx-zip">archivo: <span class="mx-zip-nombre">${escaparHtml(nombreZipVariosCursos(c.prefijoCarpetas, delColegio, porCurso.size))}</span></span></div>
        <table class="lista mx-tabla">
          <thead><tr><th style="width:110px;">Curso</th><th>Nombre de la carpeta <span class="mx-editable">(puedes corregirlo)</span></th><th style="width:150px;">Archivos</th></tr></thead>
          <tbody>`;
    for (const [claveCurso, estudiantes] of porCurso) {
      const i = cursos.length;
      const numerados = numerarParaCarpeta(estudiantes);
      const propuesta = nombreCarpetaCurso(c.prefijoCarpetas, estudiantes);
      const nPend = estudiantes.filter((e) => pendienteTraspaso(e)).length;
      cursos.push({ colegio, claveCurso, propuesta, estudiantes, primero: numerados[0] });
      colegios[k].cursos.push(i);
      html += `
            <tr>
              <td><b>📘 ${escaparHtml(claveCurso)}</b></td>
              <td>
                <input type="text" class="mx-carpeta" data-i="${i}" value="${escaparHtml(propuesta)}" spellcheck="false" aria-label="Nombre de la carpeta de ${escaparHtml(claveCurso)}" />
                <div class="mx-ejemplo">1.er archivo: <span class="mx-ejemplo-archivo">${escaparHtml(c.nombreArchivoIndividual(numerados[0]))}</span></div>
              </td>
              <td>${plural(estudiantes.length, "informe", "informes")}<br/><span class="mx-ejemplo">del ${numeroConCeros(1, estudiantes.length)} al ${numeroConCeros(estudiantes.length, estudiantes.length)}${nPend ? ` + nota de ${plural(nPend, "pendiente", "pendientes")}` : ""}</span></td>
            </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  document.getElementById("mx-resumen").innerHTML =
    `Se van a generar <b>${plural(lista.length, "informe", "informes")}</b> de ${plural(nCursos, "curso", "cursos")}: <b>un archivo ZIP por colegio</b> (${plural(nColegios, "colegio", "colegios")}), con una carpeta por curso adentro. ` +
    `Dentro de cada carpeta, los archivos van numerados del 1 al total, en orden alfabético, con el mismo N° que lleva impreso cada informe.`;
  document.getElementById("mx-lista").innerHTML = html;
  document.getElementById("mx-avisos").innerHTML =
    `⏳ Puede demorar <b>${tiempo}</b>. Deja esta pestaña abierta y a la vista mientras tanto: si la dejas en segundo plano, el navegador la frena y demora bastante más.` +
    (nColegios > 1 ? ` Si el navegador pregunta si permites que el sitio descargue varios archivos, elige "Permitir".` : "") +
    (pendientes
      ? `<br/>⚠ ${plural(pendientes, "estudiante tiene", "estudiantes tienen")} el test mal traspasado (pendientes por revisar): sus informes van marcados con su puntaje al final del nombre del archivo y su curso trae una nota con la lista.`
      : "");

  const modal = document.getElementById("modal-exportar");
  const cerrar = () => (modal.style.display = "none");
  const inputs = [...modal.querySelectorAll(".mx-carpeta")];
  const inputsColegio = [...modal.querySelectorAll(".mx-colegio-nombre")];
  const nombreColegioEscrito = (k) => inputsColegio[k].value.replace(/\s+/g, " ").trim() || colegios[k].original;
  [...inputs, ...inputsColegio].forEach((inp) => {
    inp.onkeydown = (ev) => {
      if (ev.key === "Enter") ev.preventDefault(); // Enter no exporta: se confirma solo con el botón
    };
  });
  // una carpeta que ya se corrigió a mano no se vuelve a proponer
  inputs.forEach((inp) => inp.addEventListener("input", () => (inp.dataset.editado = "1")));
  // al cambiar el nombre del colegio se actualizan, en vivo, el nombre de su ZIP, las
  // carpetas de sus cursos (las que no se corrigieron a mano) y el ejemplo de archivo
  inputsColegio.forEach((inp) =>
    inp.addEventListener("input", () => {
      const k = Number(inp.dataset.k);
      const nombre = nombreColegioEscrito(k);
      const conNombre = (e) => ({ ...e, colegio: nombre });
      inp.closest(".mx-colegio").querySelector(".mx-zip-nombre").textContent = nombreZipVariosCursos(c.prefijoCarpetas, [{ colegio: nombre }], colegios[k].nCursos);
      colegios[k].cursos.forEach((i) => {
        const curso = cursos[i];
        curso.propuesta = nombreCarpetaCurso(c.prefijoCarpetas, curso.estudiantes.map(conNombre));
        const inpCarpeta = inputs[i];
        if (!inpCarpeta.dataset.editado) inpCarpeta.value = curso.propuesta;
        inpCarpeta.closest("td").querySelector(".mx-ejemplo-archivo").textContent = c.nombreArchivoIndividual(conNombre(curso.primero));
      });
    })
  );
  document.getElementById("mx-cancelar").onclick = cerrar;
  modal.onclick = (ev) => {
    if (ev.target === modal) cerrar();
  };
  modal.onkeydown = (ev) => {
    if (ev.key === "Escape") cerrar();
  };
  const btnRevisar = document.getElementById("mx-revisar");
  btnRevisar.style.display = pendientes && c.revisarTraspaso ? "" : "none";
  btnRevisar.onclick = () => {
    cerrar();
    irACorreccion();
  };
  const btnExportar = document.getElementById("mx-exportar");
  btnExportar.textContent = `⬇ Exportar ${plural(lista.length, "informe", "informes")}`;
  btnExportar.onclick = () => {
    // nombres de colegio corregidos: se cambian en la app (en todos sus estudiantes)
    const nuevoNombre = new Map(colegios.map((col, k) => [col.original, nombreColegioEscrito(k)]));
    const cambios = [...nuevoNombre].filter(([anterior, nuevo]) => anterior !== nuevo);
    if (cambios.length) {
      c.store.renombrarColegios(cambios);
      cambios.forEach(([anterior, nuevo]) => {
        if (estado.filtros.colegio === anterior) estado.filtros.colegio = nuevo;
      });
    }
    // nombre de carpeta de cada curso: lo escrito (sin caracteres no permitidos) o el propuesto
    const nombres = new Map();
    inputs.forEach((inp) => {
      const curso = cursos[Number(inp.dataset.i)];
      nombres.set(nuevoNombre.get(curso.colegio) + "|" + curso.claveCurso, limpiarNombreCarpeta(inp.value) || curso.propuesta);
    });
    cerrar();
    if (cambios.length) {
      render();
      mostrarToast(`Nombre del colegio actualizado en la app: ${cambios.map(([, nuevo]) => nuevo).join(", ")}`);
    }
    descargarTodosLosCursos(lista, btn, nombres);
  };
  modal.style.display = "flex";
  btnExportar.focus();
}

async function descargarTodosLosCursos(lista, btn, nombresCarpeta = new Map()) {
  const c = cfg();
  const porColegio = agrupar(lista);
  const total = lista.length;
  const original = btn.textContent;
  let hechos = 0;
  let zips = 0;
  btn.disabled = true;
  btn.dataset.generando = "1";
  const t0 = Date.now();
  try {
    for (const [colegio, porCurso] of porColegio) {
      const zip = new JSZip();
      const carpetasUsadas = new Map();
      for (const [claveCurso, estudiantes] of porCurso) {
        let carpeta = nombresCarpeta.get(colegio + "|" + claveCurso) || nombreCarpetaCurso(c.prefijoCarpetas, estudiantes);
        const veces = carpetasUsadas.get(carpeta.toLowerCase()) || 0;
        carpetasUsadas.set(carpeta.toLowerCase(), veces + 1);
        if (veces > 0) carpeta += ` (${veces + 1})`;
        await c.agregarInformesACarpeta(zip.folder(carpeta), estudiantes, () => {
          hechos++;
          btn.textContent = `Generando ${hechos}/${total}… (${colegio || "Sin colegio"})`;
        });
      }
      const contenido = await zip.generateAsync({ type: "blob" });
      descargarArchivo(contenido, nombreZipVariosCursos(c.prefijoCarpetas, [...porCurso.values()].flat(), porCurso.size));
      zips++;
      // una pausa corta entre descargas, para que el navegador no las junte ni bloquee
      await new Promise((r) => setTimeout(r, 600));
    }
    const seg = Math.round((Date.now() - t0) / 1000);
    const duracion = seg < 60 ? `${seg} segundos` : `${Math.floor(seg / 60)} min ${seg % 60} s`;
    mostrarToast(`Listo: ${total} informes en ${zips} ${zips === 1 ? "archivo ZIP" : "archivos ZIP (uno por colegio)"}, en ${duracion}.`);
  } catch (err) {
    console.error(err);
    mostrarToast(`Se interrumpió la descarga (${zips} de ${porColegio.size} colegios listos). Revisa el mensaje en la consola.`);
  } finally {
    delete btn.dataset.generando;
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function descargarConProgreso(lista, btn) {
  if (!lista || lista.length === 0) return;
  const c = cfg();
  const original = btn.textContent;
  btn.disabled = true;
  try {
    await c.descargarMasivo(lista, (hecho, total) => {
      btn.textContent = `Generando ${hecho}/${total}…`;
    });
    const nError = lista.filter((e) => pendienteTraspaso(e)).length;
    mostrarToast(
      "Descarga lista (" + lista.length + (lista.length === 1 ? " informe)" : " informes)") +
        (nError ? `. ${nError} con el test mal traspasado: van marcados con su puntaje en el nombre del archivo y listados en la nota dentro de la carpeta.` : "")
    );
  } catch (err) {
    console.error(err);
    mostrarToast("No se pudieron generar los informes. Revisa el mensaje en la consola.");
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

async function accionInformeGrupal(estudiantes, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generando…";
  try {
    await descargarInformeGrupalDesdeCurso(estudiantes, cfg().configGrupal);
    mostrarToast("Informe grupal descargado");
  } catch (err) {
    console.error(err);
    mostrarToast("No se pudo generar el informe grupal. Revisa el mensaje en la consola.");
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

function accionEditar(id) {
  const e = cfg().store.obtener(id);
  if (e) cargarEnFormulario(e);
}

function accionDescargar(id, btn) {
  const e = cfg().store.obtener(id);
  if (!e) return;
  antesDeGenerarInformes([e], () => descargarUnInforme(e, btn), { individual: true });
}

async function descargarUnInforme(e, btn) {
  const c = cfg();
  const original = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Generando…";
  }
  mostrarToast("Generando informe…");
  try {
    await c.descargarIndividual(e);
    mostrarToast("Informe descargado");
  } catch (err) {
    console.error(err);
    mostrarToast("No se pudo generar el informe. Revisa el mensaje en la consola.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = original;
    }
  }
}

function accionEliminar(id) {
  const c = cfg();
  const e = c.store.obtener(id);
  if (!e) return;
  if (!confirm(`¿Enviar a la papelera a ${e.nombre}? Podrás recuperarlo después.`)) return;
  c.store.moverAPapelera(id);
  mostrarToast("Estudiante enviado a la papelera");
  render();
}

// ---------------- "Ver PDF": vista previa del informe de un estudiante ----------------
// Genera el informe y lo muestra en una ventana dentro de la app (con el visor de PDF
// del navegador), sin descargarlo. Desde ahí se puede descargar (se usa el mismo PDF
// ya generado, sin volver a armarlo) o abrir en una pestaña nueva. Ver no cuenta como
// "informe generado" en Estadísticas; descargar desde la vista, sí.

const vistaPdf = { url: null, blob: null, estudiante: null, turno: 0 };

async function accionVerPdf(id) {
  const c = cfg();
  const e = c.store.obtener(id);
  if (!e) return;
  const turno = ++vistaPdf.turno;
  liberarVistaPdf();
  vistaPdf.estudiante = e;

  document.getElementById("vp-titulo").textContent = `Informe de ${e.nombre}`;
  const r = pendienteTraspaso(e);
  document.getElementById("vp-aviso").innerHTML = r
    ? `⚠ Test mal traspasado (${escaparHtml(r.texto.resumen)}): este informe puede cambiar cuando se corrijan sus puntajes.`
    : "";
  document.getElementById("vp-contenido").innerHTML = `<div class="vista-pdf-cargando">Generando el informe…</div>`;
  document.getElementById("vp-descargar").disabled = true;
  document.getElementById("vp-pestana").disabled = true;
  document.getElementById("modal-vista-pdf").style.display = "flex";

  try {
    const blob = await c.construirBlobIndividual(e);
    if (turno !== vistaPdf.turno) return; // se cerró o se pidió otro mientras se generaba
    vistaPdf.blob = blob;
    vistaPdf.url = URL.createObjectURL(blob);
    document.getElementById("vp-contenido").innerHTML = `<iframe class="vista-pdf-marco" title="Informe de ${escaparHtml(e.nombre)}" src="${vistaPdf.url}#navpanes=0&view=FitH"></iframe>`;
    document.getElementById("vp-descargar").disabled = false;
    document.getElementById("vp-pestana").disabled = false;
  } catch (err) {
    console.error(err);
    if (turno === vistaPdf.turno) {
      document.getElementById("vp-contenido").innerHTML = `<div class="vista-pdf-cargando">No se pudo generar el informe. Revisa el mensaje en la consola.</div>`;
    }
  }
}

function liberarVistaPdf() {
  if (vistaPdf.url) URL.revokeObjectURL(vistaPdf.url);
  vistaPdf.url = null;
  vistaPdf.blob = null;
}

function cerrarVistaPdf() {
  vistaPdf.turno++;
  document.getElementById("modal-vista-pdf").style.display = "none";
  document.getElementById("vp-contenido").innerHTML = "";
  liberarVistaPdf();
  vistaPdf.estudiante = null;
}

function cablearVistaPdf() {
  const modal = document.getElementById("modal-vista-pdf");
  document.getElementById("vp-cerrar").addEventListener("click", cerrarVistaPdf);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) cerrarVistaPdf();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modal.style.display === "flex") cerrarVistaPdf();
  });
  document.getElementById("vp-descargar").addEventListener("click", () => {
    if (!vistaPdf.blob || !vistaPdf.estudiante) return;
    const c = cfg();
    descargarArchivo(vistaPdf.blob, c.nombreArchivoIndividual(vistaPdf.estudiante));
    c.store.registrarInformeGenerado();
    mostrarToast("Informe descargado");
  });
  document.getElementById("vp-pestana").addEventListener("click", () => {
    if (vistaPdf.url) window.open(vistaPdf.url, "_blank");
  });
}

// ---------------- corrección rápida de puntajes (ícono ⚠) ----------------
// Para no tener que corregir el Excel y volver a subirlo: se corrigen los puntajes de
// un estudiante ahí mismo. Al guardar se recalculan sus áreas de interés (los
// informes siempre se generan con los puntajes guardados, así que su informe sale
// ya corregido) y, si la suma llega a 45, desaparece la advertencia.

let correccionPuntajesId = null;

function leerCampoCorreccion(idArea) {
  const inp = document.querySelector(`#mp-campos [name="mp_${idArea}"]`);
  return inp ? inp.value : "";
}

function abrirCorreccionPuntajes(id) {
  const c = cfg();
  const e = c.store.obtener(id);
  if (!e) return;
  correccionPuntajesId = id;

  // las áreas que podrían cambiar de lado del 7 van marcadas: son las columnas que
  // conviene revisar primero en la hoja de respuestas
  const dejado = traspasoDejadoAsi(e);
  const rActual = revisionTraspaso(e.puntajes);
  const r = dejado ? null : rActual;
  const candidatas = new Set(r && r.analisis.afecta ? r.analisis.areas.map((v) => v.area.id) : []);

  document.getElementById("mp-titulo").textContent = `Corregir puntajes: ${e.nombre}`;
  document.getElementById("mp-sub").innerHTML = r
    ? `${escaparHtml(r.texto.resumen)}. ${escaparHtml(r.texto.accion)}. ${escaparHtml(r.texto.detalle)}` +
      (candidatas.size ? " <b>Las áreas marcadas en amarillo son las primeras que conviene revisar en su hoja de respuestas.</b>" : "") +
      ` Si ya lo revisaste y el puntaje queda como está, usa <b>✓ Dejar así</b>.`
    : dejado
      ? `✓ ${escaparHtml(rActual.texto.resumen)}: se revisó y se dejó así. Si cambias sus puntajes, se vuelve a revisar.`
      : `Sus ${c.areas.length} áreas suman ${SUMA_ESPERADA_KUDER}: el test está bien traspasado.`;
  document.getElementById("mp-dejar").style.display = r ? "" : "none";

  document.getElementById("mp-campos").innerHTML = c.areas
    .map(
      (a) => `
      <div class="${candidatas.has(a.id) ? "mp-candidata" : ""}">
        <label>${a.icono} ${a.nombre}${candidatas.has(a.id) ? " · revisar" : ""}</label>
        <input type="number" min="${c.puntajeMin}" max="${c.puntajeMax}" step="1" name="mp_${a.id}" value="${escaparHtml(e.puntajes[a.id])}" />
      </div>`
    )
    .join("");
  document.querySelectorAll("#mp-campos input").forEach((inp) =>
    inp.addEventListener("input", () => pintarSumaPuntajes(document.getElementById("mp-suma"), leerCampoCorreccion))
  );
  pintarSumaPuntajes(document.getElementById("mp-suma"), leerCampoCorreccion);

  document.getElementById("modal-puntajes").style.display = "flex";
  const primero = document.querySelector("#mp-campos .mp-candidata input") || document.querySelector("#mp-campos input");
  if (primero) {
    primero.focus();
    primero.select();
  }
}

function cerrarCorreccionPuntajes() {
  document.getElementById("modal-puntajes").style.display = "none";
  correccionPuntajesId = null;
}

// guarda la corrección; devuelve el estudiante actualizado, o null si algún campo no es
// válido. "dejarAsi": además deja esos puntajes como revisados aunque no sumen 45.
function guardarCorreccionPuntajes({ dejarAsi = false } = {}) {
  const c = cfg();
  const e = c.store.obtener(correccionPuntajesId);
  if (!e) return null;
  const puntajes = {};
  let ok = true;
  c.areas.forEach((a) => {
    const inp = document.querySelector(`#mp-campos [name="mp_${a.id}"]`);
    const n = Number(inp.value);
    const valido = inp.value !== "" && Number.isInteger(n) && n >= c.puntajeMin && n <= c.puntajeMax;
    inp.classList.toggle("invalido", !valido);
    if (valido) puntajes[a.id] = n;
    else ok = false;
  });
  if (!ok) {
    mostrarToast(`Cada puntaje debe ser un número entero de ${c.puntajeMin} a ${c.puntajeMax}`);
    return null;
  }
  const datos = { puntajes, ...datosDeCorreccion(e, puntajes, dejarAsi) };
  const actualizado = c.store.actualizar(e.id, datos);
  cerrarCorreccionPuntajes();

  const r = revisionTraspaso(actualizado.puntajes);
  const areas = c.calcularAreas(actualizado.puntajes).map((a) => a.nombre);
  const resultado = areas.length ? `Áreas de interés: ${areas.join(", ")}.` : "Sin áreas sobre 7: su informe mostrará todas las áreas (intereses diversos).";
  mostrarToast(
    r
      ? traspasoDejadoAsi(actualizado)
        ? `✓ Queda así, con ${r.analisis.total} de ${SUMA_ESPERADA_KUDER}: ya no aparece como pendiente. ${resultado}`
        : `Guardado. Aún ${r.texto.resumen.toLowerCase()}. ${resultado}`
      : `Corregido: ya suma ${SUMA_ESPERADA_KUDER}. ${resultado}`
  );
  render();
  return actualizado;
}

function cablearCorreccionPuntajes() {
  document.getElementById("mp-cancelar").addEventListener("click", cerrarCorreccionPuntajes);
  document.getElementById("mp-guardar").addEventListener("click", () => guardarCorreccionPuntajes());
  document.getElementById("mp-dejar").addEventListener("click", () => guardarCorreccionPuntajes({ dejarAsi: true }));
  document.getElementById("mp-guardar-descargar").addEventListener("click", () => {
    const actualizado = guardarCorreccionPuntajes();
    if (actualizado) descargarUnInforme(actualizado, null);
  });
  document.getElementById("mp-campos").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      guardarCorreccionPuntajes();
    }
  });
}

// ---------------- pestaña: papelera ----------------

function renderPapelera() {
  const c = cfg();
  const enPapelera = c.store.listar({ incluirPapelera: true }).filter((e) => e.eliminado);

  const selColegio = document.getElementById("p-colegio");
  const selCurso = document.getElementById("p-curso");
  const inpNombre = document.getElementById("p-nombre");

  const rellenarSelect = (sel, valores, actual) => {
    sel.innerHTML =
      `<option value="">Todos</option>` + valores.map((v) => `<option value="${escaparHtml(v)}">${escaparHtml(v)}</option>`).join("");
    sel.value = valores.includes(actual) ? actual : "";
  };
  rellenarSelect(selColegio, opcionesUnicas(enPapelera, "colegio"), estado.filtrosPapelera.colegio);
  rellenarSelect(selCurso, opcionesUnicas(enPapelera, "curso"), estado.filtrosPapelera.curso);
  inpNombre.value = estado.filtrosPapelera.nombre;

  selColegio.onchange = () => { estado.filtrosPapelera.colegio = selColegio.value; renderPapelera(); };
  selCurso.onchange = () => { estado.filtrosPapelera.curso = selCurso.value; renderPapelera(); };
  inpNombre.oninput = () => { estado.filtrosPapelera.nombre = inpNombre.value; renderPapelera(); };

  const filtrados = enPapelera.filter(
    (e) =>
      (!estado.filtrosPapelera.colegio || e.colegio === estado.filtrosPapelera.colegio) &&
      (!estado.filtrosPapelera.curso || e.curso === estado.filtrosPapelera.curso) &&
      (!estado.filtrosPapelera.nombre || coincideTexto(e.nombre, estado.filtrosPapelera.nombre))
  );

  document.getElementById("btn-vaciar-papelera").disabled = enPapelera.length === 0;

  const cont = document.getElementById("lista-papelera");
  if (filtrados.length === 0) {
    cont.innerHTML = `<div class="vacio">${enPapelera.length === 0 ? "La papelera está vacía." : "Ningún estudiante en la papelera coincide con el filtro."}</div>`;
  } else {
    cont.innerHTML = `
      <table class="lista">
        <thead><tr><th>Nombre</th><th>Colegio</th><th>Curso</th><th>Acciones</th></tr></thead>
        <tbody>
          ${filtrados
            .map(
              (e) => `
            <tr>
              <td>${escaparHtml(e.nombre)}</td>
              <td>${escaparHtml(e.colegio)}</td>
              <td>${escaparHtml(etiquetaCurso(e))}</td>
              <td class="fila-acciones">
                <button class="chico" onclick="accionRestaurar('${e.id}')">Restaurar</button>
                <button class="chico peligro" onclick="accionEliminarDefinitivo('${e.id}')">Eliminar para siempre</button>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  document.getElementById("btn-vaciar-papelera").onclick = () => {
    if (!confirm("Esto elimina para siempre a todos los estudiantes en la papelera de este test (aunque estén filtrados). ¿Continuar?")) return;
    c.store.vaciarPapelera();
    mostrarToast("Papelera vaciada");
    render();
  };
}

function accionRestaurar(id) {
  cfg().store.restaurar(id);
  mostrarToast("Estudiante restaurado");
  render();
}

function accionEliminarDefinitivo(id) {
  if (!confirm("Esto elimina al estudiante para siempre, sin poder recuperarlo. ¿Continuar?")) return;
  cfg().store.eliminarDefinitivo(id);
  mostrarToast("Estudiante eliminado definitivamente");
  render();
}

// ---------------- pestaña: estadísticas ----------------

function renderEstadisticas() {
  const c = cfg();
  const todos = c.store.listar();
  document.getElementById("stat-total").textContent = todos.length;
  document.getElementById("stat-informes").textContent = c.store.contadorInformes;

  const conArea = todos.filter((e) => c.calcularAreas(e.puntajes).length > 0).length;
  const sinArea = todos.length - conArea;
  document.getElementById("stat-con-area").textContent = conArea;
  document.getElementById("stat-sin-area").textContent = sinArea;

  const colegios = opcionesUnicas(todos, "colegio").length;
  document.getElementById("stat-colegios").textContent = colegios;

  if (c.revisarTraspaso) {
    const conError = todos.map((e) => pendienteTraspaso(e)).filter(Boolean);
    const nAfecta = conError.filter((r) => r.analisis.afecta).length;
    const nDejados = todos.filter((e) => traspasoDejadoAsi(e) && revisionTraspaso(e.puntajes)).length;
    document.getElementById("stat-traspaso").textContent = conError.length;
    document.getElementById("stat-traspaso-lbl").textContent =
      `Tests mal traspasados pendientes (no suman 45)${conError.length ? `: ${nAfecta} ${nAfecta === 1 ? "debe" : "deben"} revisarse` : ""}${nDejados ? ` · ${nDejados} ${nDejados === 1 ? "dejado" : "dejados"} así` : ""}`;
  }

  const conteoPorArea = {};
  c.areas.forEach((a) => (conteoPorArea[a.id] = 0));
  todos.forEach((e) => {
    c.calcularAreas(e.puntajes).forEach((a) => conteoPorArea[a.id]++);
  });
  const maxConteo = Math.max(1, ...Object.values(conteoPorArea));

  document.getElementById("barras-areas").innerHTML = c.areas
    .map((a) => {
      const n = conteoPorArea[a.id];
      const pct = Math.round((n / maxConteo) * 100);
      return `
      <div class="barra-area">
        <div class="etiqueta-area"><span>${a.icono} ${a.nombre}</span><span>${n}</span></div>
        <div class="barra-fondo"><div class="barra-rellena" style="width:${pct}%"></div></div>
      </div>`;
    })
    .join("");

  renderDesglose("desglose-colegio", contarPorCampo(todos, "colegio"), "colegio");
  renderDesglose("desglose-fecha", contarPorCampo(todos, "fecha", fmtFechaSimple), "fecha de aplicación");
}

// "2026-09-01" → "01/09/2026", leyendo los componentes a mano: con new Date(iso), la
// zona horaria de Chile corre la fecha un día hacia atrás.
function fmtFechaSimple(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// cuenta estudiantes agrupados por un campo (ej: colegio, fecha), ordenado de mayor a menor
function contarPorCampo(lista, campo, formatear) {
  const conteo = new Map();
  lista.forEach((e) => {
    const clave = e[campo] || "Sin dato";
    conteo.set(clave, (conteo.get(clave) || 0) + 1);
  });
  return [...conteo.entries()]
    .map(([clave, cantidad]) => ({ etiqueta: formatear && clave !== "Sin dato" ? formatear(clave) : clave, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

function renderDesglose(idContenedor, filas, nombreCampo) {
  const cont = document.getElementById(idContenedor);
  if (filas.length === 0) {
    cont.innerHTML = `<div class="vacio">Todavía no hay datos de ${nombreCampo}.</div>`;
    return;
  }
  cont.innerHTML = `
    <table class="desglose-tabla">
      <tbody>
        ${filas.map((f) => `<tr><td>${escaparHtml(f.etiqueta)}</td><td class="cant">${f.cantidad}</td></tr>`).join("")}
      </tbody>
    </table>`;
}
