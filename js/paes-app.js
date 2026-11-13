// Ensayos PAES · pantalla del módulo.
//
// Flujo: Curso y lista → Ensayo, clave y tabla → Subir hojas → Revisión → Resultados.
// La persona solo decide en la revisión; lo demás lo hace la app. Los datos se guardan en
// este computador (js/paes-db.js); la lectura de hojas está en js/paes-lector.js y las
// reglas (RUT, vinculación, corrección, puntaje) en js/paes-logica.js.
//
// El módulo se abre con el botón «Ensayos PAES» del selector de arriba y no comparte datos
// con los test vocacionales.

(function (global) {
  "use strict";
  const L = PaesLogica;

  const CLAVE_MODULO = "orientando_intereses_modulo_activo";
  const CLAVE_SELECCION = "orientando_intereses_paes_seleccion";
  const NIVELES = ["4° Medio", "3° Medio", "2° Medio", "1° Medio", "Egresados", "Otro"];
  const PASOS = [
    { id: "curso", titulo: "Curso y lista" },
    { id: "ensayo", titulo: "Ensayo, clave y tabla" },
    { id: "hojas", titulo: "Subir hojas" },
    { id: "revision", titulo: "Revisión" },
    { id: "resultados", titulo: "Resultados" },
  ];

  const est = {
    activo: false,
    listo: false,
    error: null,
    cursos: [],
    ensayos: [],
    hojas: [],
    cursoId: null,
    ensayoId: null,
    paso: "curso",
    formCurso: null, // { modo: "nuevo" | "editar" }
    formEnsayo: false,
    previa: null, // vista previa de una lista recién leída
    editEst: null, // id del estudiante que se edita en la tabla, o "nuevo"
    pegarClave: false,
    lectura: null, // progreso de la lectura de hojas
    resumenLectura: null,
    soloPorRevisar: false,
    urls: new Map(), // imágenes ya cargadas: "hojaId:tipo" -> URL
    visor: null, // hoja abierta en el visor (revisión con la imagen)
    deshacer: [], // cambios de la revisión que se pueden deshacer (por sesión)
    sinNombres: false, // informe sin nombres (uso interno)
    generando: false, // se está creando un informe
    vista: "curso", // "curso" (los cinco pasos), "resultados", "clavijeros" o "carpetas"
    clavijeros: [], // claves de respuestas guardadas, que se aplican a los ensayos
    clvAbierto: null, // clavijero desplegado en «Clavijeros subidos»
    clvForm: false, // formulario «Subir un clavijero nuevo»
    importar: null, // selección de cursos de Kuder por importar: Set de claves
    verSinHoja: false, // revisión: lista de estudiantes sin hoja desplegada
    agregarEn: null, // revisión: hoja en la que se agrega a mano un estudiante
    enBlanco: false, // paso 1 vacío, listo para ingresar cursos nuevos aunque ya existan otros
    tanda: [], // cursos que se están trabajando juntos (ids)
    listas: null, // listas recién leídas, cada una va a crear un curso nuevo
    avisosListas: [], // archivos de lista que no se pudieron leer
    revisarListas: false, // ya se intentó crear: se muestran los problemas de cada lista
  };
  let raiz = null;
  let plantillas = new Map();
  let guardadoPendiente = null;

  // ------------------------------------------------------------ utilidades

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const numero = (v, dec) => (v == null ? "—" : Number(v).toLocaleString("es-CL", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }));

  function toast(msg) {
    if (typeof mostrarToast === "function") mostrarToast(msg);
  }
  function confirmar(opciones) {
    if (typeof confirmarAccion === "function") confirmarAccion(opciones);
    else if (global.confirm(opciones.texto)) opciones.onConfirmar();
  }
  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function nombreSeguro(s) {
    return L.sinTildes(s).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  // cede el turno a la pantalla entre hoja y hoja (sin los frenos que el navegador le pone
  // a los temporizadores cuando la pestaña no está a la vista)
  function ceder() {
    return new Promise((ok) => {
      const canal = new MessageChannel();
      canal.port1.onmessage = () => ok();
      canal.port2.postMessage(0);
    });
  }
  function hoyIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const cursoActual = () => est.cursos.find((c) => c.id === est.cursoId) || null;
  const ensayoActual = () => est.ensayos.find((e) => e.id === est.ensayoId && e.cursoId === est.cursoId) || null;
  const ensayosDelCurso = (cursoId) => est.ensayos.filter((e) => e.cursoId === cursoId).sort((a, b) => (a.creado || "").localeCompare(b.creado || ""));
  const hojasDelEnsayo = (ensayoId) =>
    est.hojas.filter((h) => h.ensayoId === ensayoId).sort((a, b) => (a.creada || "").localeCompare(b.creada || "") || a.archivo.localeCompare(b.archivo) || a.pagina - b.pagina);
  const etiquetaCurso = (c) => `${c.nivel}${c.letra ? " " + c.letra : ""}`;
  const nombrePrueba = (e) => (e.prueba !== "OTRA" && L.PRUEBAS_PAES[e.prueba] ? L.PRUEBAS_PAES[e.prueba].nombre : e.pruebaNombre || "Otra prueba");
  const etiquetaEnsayo = (e) => `${nombrePrueba(e)}${e.forma ? " · Forma " + e.forma : ""}${e.fecha ? " · " + PaesExcel.fechaCorta(e.fecha) : ""}`;
  const estudiantesOrdenados = (c) => c.estudiantes.slice().sort((a, b) => (a.apellidos || "").localeCompare(b.apellidos || "", "es") || (a.nombres || "").localeCompare(b.nombres || "", "es"));
  const vigente = (h) => h.estado !== "ilegible" && !h.excluida && !h.repetidaDe;

  // ensayos «hermanos»: el mismo ensayo creado a la vez en varios cursos, para corregirlos juntos
  const hermanos = (e) => (e && e.grupoId ? est.ensayos.filter((x) => x !== e && x.grupoId === e.grupoId) : []);
  const nombreCurso = (c) => `${c.colegio} · ${etiquetaCurso(c)}`;

  function plantillaDe(ensayo) {
    const id = (ensayo && ensayo.plantilla) || PLANTILLA_PAES_POR_DEFECTO;
    if (!plantillas.has(id)) plantillas.set(id, PaesLector.prepararPlantilla(PLANTILLAS_PAES[id]));
    return plantillas.get(id);
  }

  function auditar(ensayoId, hojaId, campo, antes, despues) {
    PaesDB.registrarAuditoria({ ensayoId, hojaId: hojaId || null, campo, antes, despues }).catch((e) => console.error("No se pudo registrar la auditoría.", e));
  }

  async function guardar(almacen, valor) {
    try {
      await PaesDB.poner(almacen, valor);
    } catch (e) {
      console.error(e);
      toast("No se pudo guardar el cambio: " + (e && e.message ? e.message : "error del guardado local"));
    }
  }

  // guardado con una pequeña espera, para los campos que se escriben letra a letra
  function guardarLuego(almacen, valor) {
    clearTimeout(guardadoPendiente);
    guardadoPendiente = setTimeout(() => guardar(almacen, valor), 350);
  }

  // ------------------------------------------------------------ entrar y salir del módulo

  function activar() {
    est.activo = true;
    document.body.classList.add("modulo-paes");
    document.querySelectorAll(".test-btn[data-test]").forEach((b) => b.classList.remove("activo"));
    document.querySelectorAll('.test-btn[data-modulo="paes"]').forEach((b) => b.classList.add("activo"));
    try {
      localStorage.setItem(CLAVE_MODULO, "paes");
    } catch (e) {
      console.error(e);
    }
    pintar();
  }

  function desactivar() {
    if (!est.activo) return;
    est.activo = false;
    document.body.classList.remove("modulo-paes");
    document.querySelectorAll('.test-btn[data-modulo="paes"]').forEach((b) => b.classList.remove("activo"));
    // el test que estaba elegido vuelve a verse elegido
    const testActual = typeof estado !== "undefined" ? estado.test : null;
    document.querySelectorAll(".test-btn[data-test]").forEach((b) => b.classList.toggle("activo", b.dataset.test === testActual));
    try {
      localStorage.removeItem(CLAVE_MODULO);
    } catch (e) {
      console.error(e);
    }
  }

  async function iniciar() {
    raiz = document.getElementById("modulo-paes");
    if (!raiz) return;
    document.querySelectorAll('.test-btn[data-modulo="paes"]').forEach((b) => b.addEventListener("click", activar));
    document.querySelectorAll(".test-btn[data-test]").forEach((b) => b.addEventListener("click", desactivar, true));
    raiz.addEventListener("click", alClic);
    raiz.addEventListener("change", alCambiar);
    raiz.addEventListener("input", alEscribir);
    raiz.addEventListener("dragover", (ev) => {
      if (ev.target.closest(".paes-zona-subir")) ev.preventDefault();
    });
    raiz.addEventListener("drop", (ev) => {
      if (!ev.target.closest(".paes-zona-subir")) return;
      ev.preventDefault();
      if (!ev.dataTransfer || !ev.dataTransfer.files.length) return;
      if (ev.target.closest('[data-zona="listas"]')) leerListasNuevas(Array.from(ev.dataTransfer.files));
      else subirHojas(Array.from(ev.dataTransfer.files));
    });
    let guardado = null;
    try {
      guardado = localStorage.getItem(CLAVE_MODULO);
    } catch (e) {
      console.error(e);
    }
    if (guardado === "paes") activar();
    await cargarDatos();
    pintar();
  }

  async function cargarDatos() {
    try {
      const [cursos, ensayos, hojas] = await Promise.all([PaesDB.todos("cursos"), PaesDB.todos("ensayos"), PaesDB.todos("hojas")]);
      est.cursos = cursos;
      est.ensayos = ensayos;
      est.hojas = hojas;
      const guardados = await PaesDB.obtener("ajustes", "clavijeros");
      est.clavijeros = guardados && Array.isArray(guardados.valor) ? guardados.valor : [];
      await registrarClavesSueltas();
      est.listo = true;
      try {
        const s = JSON.parse(localStorage.getItem(CLAVE_SELECCION) || "{}");
        est.cursoId = s.cursoId || null;
        est.enBlanco = !!s.enBlanco;
        est.tanda = Array.isArray(s.tanda) ? s.tanda : [];
        est.ensayoId = s.ensayoId || null;
        if (PASOS.some((p) => p.id === s.paso)) est.paso = s.paso;
      } catch (e) {
        console.error(e);
      }
    } catch (e) {
      console.error(e);
      est.error = e && e.message ? e.message : "No se pudo abrir el guardado del módulo.";
    }
    actualizarConteo();
  }

  function actualizarConteo() {
    const el = document.getElementById("conteo-modulo-paes");
    if (el) el.textContent = est.cursos.length ? plural(est.cursos.length, "curso", "cursos") : "";
  }

  // deja la selección coherente: un curso que existe, un ensayo de ese curso y un paso posible
  function normalizarSeleccion() {
    est.tanda = est.tanda.filter((id) => est.cursos.some((c) => c.id === id));
    if (est.tanda.length < 2) est.tanda = [];
    if (est.enBlanco && est.cursos.length) {
      // inicio en blanco: ningún curso elegido, para ingresar cursos nuevos
      est.cursoId = null;
      est.ensayoId = null;
    } else {
      est.enBlanco = false;
      if (!cursoActual()) est.cursoId = est.cursos.length ? ordenarCursos(est.cursos)[0].id : null;
    }
    if (!ensayoActual()) {
      const lista = est.cursoId ? ensayosDelCurso(est.cursoId) : [];
      est.ensayoId = lista.length ? lista[lista.length - 1].id : null;
    }
    if (!est.cursoId) est.paso = "curso";
    else if (!est.ensayoId && ["hojas", "revision", "resultados"].includes(est.paso)) est.paso = "ensayo";
    try {
      localStorage.setItem(CLAVE_SELECCION, JSON.stringify({ cursoId: est.cursoId, ensayoId: est.ensayoId, paso: est.paso, enBlanco: est.enBlanco, tanda: est.tanda }));
    } catch (e) {
      console.error(e);
    }
  }

  function ordenarCursos(cursos) {
    return cursos.slice().sort((a, b) => a.colegio.localeCompare(b.colegio, "es") || (b.anio || 0) - (a.anio || 0) || etiquetaCurso(a).localeCompare(etiquetaCurso(b), "es"));
  }

  // ------------------------------------------------------------ advertencias de un ensayo

  // por cada hoja del ensayo, sus advertencias (incluye «dos hojas del mismo estudiante»)
  function advertenciasDelEnsayo(ensayo) {
    const hojas = hojasDelEnsayo(ensayo.id);
    const porEstudiante = new Map();
    hojas.filter(vigente).forEach((h) => {
      if (h.estudianteId) porEstudiante.set(h.estudianteId, (porEstudiante.get(h.estudianteId) || 0) + 1);
    });
    const mapa = new Map();
    hojas.forEach((h) => {
      if (h.excluida) {
        mapa.set(h.id, []);
        return;
      }
      mapa.set(h.id, L.advertenciasDeHoja(h, ensayo, { duplicadaDeEstudiante: vigente(h) && h.estudianteId && porEstudiante.get(h.estudianteId) > 1 }));
    });
    return mapa;
  }

  // estado de una hoja para mostrarla: "ok", "revisar", "ilegible", "repetida" o "excluida"
  function estadoDeHoja(h, advertencias) {
    if (h.excluida) return "excluida";
    if (h.repetidaDe) return "repetida";
    if (h.estado === "ilegible") return h.revisada ? "ilegible-vista" : "ilegible";
    return advertencias.length && !h.revisada ? "revisar" : "ok";
  }

  function contarEstados(ensayo) {
    const adv = advertenciasDelEnsayo(ensayo);
    const cuenta = { total: 0, ok: 0, revisar: 0, ilegible: 0, repetida: 0, excluida: 0 };
    hojasDelEnsayo(ensayo.id).forEach((h) => {
      const e = estadoDeHoja(h, adv.get(h.id) || []);
      cuenta.total++;
      if (e === "ilegible-vista") cuenta.ilegible++;
      else cuenta[e]++;
      if (e === "ilegible") cuenta.revisar++;
    });
    return cuenta;
  }

  // ------------------------------------------------------------ vinculación

  function otrosEstudiantes(cursoId) {
    const otros = [];
    est.cursos.forEach((c) => {
      if (c.id === cursoId) return;
      c.estudiantes.forEach((e) => otros.push({ id: e.id, rut: e.rut, cursoId: c.id }));
    });
    return otros;
  }

  // busca a quién corresponde una hoja; si el RUT calza exacto con uno del curso, la asigna
  function vincular(hoja, curso) {
    const conHoja = new Set(est.hojas.filter((h) => h.ensayoId === hoja.ensayoId && h.id !== hoja.id && vigente(h) && h.estudianteId).map((h) => h.estudianteId));
    const v = L.vincularHoja(hoja.lectura.id, curso.estudiantes, otrosEstudiantes(curso.id), conHoja);
    hoja.vinculo = v.tipo;
    if (v.tipo === "exacta") {
      hoja.estudianteId = v.estudianteId;
      hoja.asignacion = "exacta";
    }
    return v;
  }

  // Tras cambiar la lista: las hojas sin estudiante vuelven a buscar su RUT, y las que
  // apuntaban a un estudiante eliminado quedan sin asignar.
  async function revincularCurso(curso) {
    const ids = new Set(curso.estudiantes.map((e) => e.id));
    const cambiadas = [];
    ensayosDelCurso(curso.id).forEach((ensayo) => {
      hojasDelEnsayo(ensayo.id).forEach((h) => {
        if (h.estado === "ilegible") return;
        if (h.estudianteId && !ids.has(h.estudianteId)) {
          h.estudianteId = null;
          h.asignacion = null;
          cambiadas.push(h);
        }
        if (!h.estudianteId && !h.repetidaDe) {
          const antes = h.vinculo;
          vincular(h, curso);
          if (h.estudianteId || h.vinculo !== antes) cambiadas.push(h);
        }
      });
    });
    if (cambiadas.length) await PaesDB.ponerVarios(Array.from(new Set(cambiadas)).map((h) => ["hojas", h]));
    return cambiadas.filter((h) => h.estudianteId).length;
  }

  // ============================================================ PINTAR

  function pintar() {
    if (!raiz || !est.activo) return;
    if (est.error) {
      raiz.innerHTML = `<div class="tarjeta"><h2>Ensayos PAES</h2><p class="paes-error">⚠ ${esc(est.error)}</p></div>`;
      return;
    }
    if (!est.listo) {
      raiz.innerHTML = `<div class="tarjeta"><p class="ayuda" style="margin:0;">Abriendo el guardado del módulo…</p></div>`;
      return;
    }
    normalizarSeleccion();
    const y = global.scrollY;
    raiz.innerHTML =
      `<div class="paes-aviso">Estás trabajando con los <b>Ensayos PAES</b> (ensayos de preparación tipo PAES, no oficiales). Las listas, las hojas y los resultados se guardan <b>solo en este computador</b> y aparte de los test vocacionales.</div>` +
      htmlVistas() +
      (est.vista === "curso"
        ? (est.importar ? htmlImportarKuder() : "") + htmlContexto() + htmlPasos() + `<div id="paes-panel">${htmlPanel()}</div>`
        : `<div id="paes-panel">${est.vista === "resultados" ? htmlVistaResultados() : est.vista === "clavijeros" ? htmlVistaClavijeros() : htmlVistaCarpetas()}</div>`) +
      `<div id="paes-visor" class="modal-overlay" style="display:none;"></div>`;
    global.scrollTo(0, y);
    cargarImagenes();
    actualizarConteo();
    if (est.visor) pintarVisor();
  }

  function htmlContexto() {
    const cursos = ordenarCursos(est.cursos);
    const c = cursoActual();
    const ensayos = c ? ensayosDelCurso(c.id) : [];
    return `<div class="tarjeta paes-contexto">
      <div class="paes-ctx-campo">
        <label for="paes-sel-curso">Curso</label>
        <select id="paes-sel-curso" data-cambio="curso" ${cursos.length ? "" : "disabled"}>
          ${cursos.length ? (c ? "" : `<option value="">— Elige un curso guardado —</option>`) : `<option value="">Aún no hay cursos</option>`}
          ${cursos.map((k) => `<option value="${esc(k.id)}" ${k.id === est.cursoId ? "selected" : ""}>${esc(k.colegio)} · ${esc(etiquetaCurso(k))} · ${esc(k.anio)}</option>`).join("")}
        </select>
        <button type="button" class="secundario chico" data-accion="nuevo-curso">➕ Ingresar nuevo curso</button>
        <button type="button" class="secundario chico" data-accion="abrir-importar-kuder" title="Crea cursos nuevos con los estudiantes que ya están cargados en el Test de Kuder">⬇ Importar cursos de datos de Kuder</button>
      </div>
      <div class="paes-ctx-campo">
        <label for="paes-sel-ensayo">Ensayo</label>
        <select id="paes-sel-ensayo" data-cambio="ensayo" ${ensayos.length ? "" : "disabled"}>
          ${ensayos.length ? "" : `<option value="">${c ? "Este curso aún no tiene ensayos" : "Primero crea un curso"}</option>`}
          ${ensayos.map((e) => `<option value="${esc(e.id)}" ${e.id === est.ensayoId ? "selected" : ""}>${esc(etiquetaEnsayo(e))}</option>`).join("")}
        </select>
        <button type="button" class="secundario chico" data-accion="nuevo-ensayo" ${c ? "" : "disabled"}>➕ Nuevo ensayo</button>
      </div>
      ${est.tanda.length > 1 ? `<div class="paes-tanda"><span>Cursos que estás trabajando juntos:</span>${est.tanda.map((id) => est.cursos.find((k) => k.id === id)).filter(Boolean).map((k) => `<button type="button" class="paes-tanda-chip${k.id === est.cursoId ? " activo" : ""}" data-accion="ir-curso" data-id="${esc(k.id)}">${esc(nombreCurso(k))}</button>`).join("")}</div>` : ""}
    </div>`;
  }

  function htmlPasos() {
    const c = cursoActual();
    const e = ensayoActual();
    const cuenta = e ? contarEstados(e) : null;
    const detalle = {
      curso: c ? plural(c.estudiantes.length, "estudiante", "estudiantes") : "sin curso",
      ensayo: e ? `${e.clave.filter((k) => k.r).length} de ${e.clave.length} respuestas` : "sin ensayo",
      hojas: cuenta ? plural(cuenta.total, "hoja", "hojas") : "",
      revision: cuenta ? (cuenta.revisar ? `${cuenta.revisar} por revisar` : cuenta.total ? "todo revisado" : "") : "",
      resultados: "",
    };
    return `<div class="paes-pasos">${PASOS.map((p, i) => {
      const bloqueado = (p.id !== "curso" && !c) || (["hojas", "revision", "resultados"].includes(p.id) && !e);
      const alerta = p.id === "revision" && cuenta && cuenta.revisar;
      return `<button type="button" class="paes-paso${est.paso === p.id ? " activo" : ""}${alerta ? " con-alerta" : ""}" data-paso="${p.id}" ${bloqueado ? "disabled" : ""}>
        <span class="paes-paso-num">${i + 1}</span><span class="paes-paso-txt"><b>${p.titulo}</b><small>${esc(detalle[p.id])}</small></span></button>`;
    }).join("")}</div>`;
  }

  function htmlPanel() {
    if (est.paso === "curso") return htmlPasoCurso();
    if (est.paso === "ensayo") return htmlPasoEnsayo();
    if (est.paso === "hojas") return htmlPasoHojas();
    if (est.paso === "revision") return htmlPasoRevision();
    return htmlPasoResultados();
  }

  const htmlAvisos = (avisos, clase) => (avisos && avisos.length ? `<ul class="paes-avisos ${clase || ""}">${avisos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : "");

  // ============================================================ PASO 1 · curso y lista

  function colegiosConocidos() {
    const nombres = new Set(est.cursos.map((c) => c.colegio));
    try {
      if (typeof storeKuder !== "undefined") storeKuder.listar().forEach((e) => e.colegio && nombres.add(e.colegio));
    } catch (e) {
      console.error(e);
    }
    return Array.from(nombres).sort((a, b) => a.localeCompare(b, "es"));
  }

  function htmlFormCurso() {
    const editando = est.formCurso && est.formCurso.modo === "editar" ? cursoActual() : null;
    const v = editando || { colegio: "", nivel: "4° Medio", letra: "", anio: new Date().getFullYear() };
    return `<div class="tarjeta">
      <h2${editando ? "" : ' style="font-size:16px;"'}>${editando ? "Editar datos del curso" : "O crea un curso a mano"}</h2>
      <p class="ayuda">${editando ? "Cambia los datos y guarda. Esto modifica ESTE curso: para agregar otro curso usa «Ingresar nuevo curso»." : "Escribe el colegio y el curso. Después subes su lista oficial."}</p>
      <div class="grid-form">
        <div class="campo-ancho"><label>Colegio *</label><input type="text" id="paes-curso-colegio" list="paes-colegios" value="${esc(v.colegio)}" autocomplete="off" />
          <datalist id="paes-colegios">${colegiosConocidos().map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist></div>
        <div><label>Nivel *</label><select id="paes-curso-nivel">${NIVELES.map((n) => `<option ${n === v.nivel ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div><label>Letra</label><input type="text" id="paes-curso-letra" maxlength="3" value="${esc(v.letra)}" placeholder="Ej: A" /></div>
        <div><label>Año *</label><input type="number" id="paes-curso-anio" min="2020" max="2100" value="${esc(v.anio)}" /></div>
      </div>
      <div class="acciones-form">
        <button type="button" data-accion="guardar-curso">${editando ? "Guardar cambios" : "Crear curso"}</button>
        ${editando ? `<button type="button" class="secundario" data-accion="cancelar-curso">Cancelar</button>` : ""}
      </div>
    </div>`;
  }

  // inicio en blanco: ingresar uno o varios cursos nuevos
  function htmlInicio() {
    if (est.listas) return htmlListasNuevas();
    return `<div class="tarjeta">
      <h2>Ingresar cursos nuevos</h2>
      <p class="ayuda">Sube la lista oficial de cada curso (.xls, .xlsx o .csv). Puedes subir <b>varias listas a la vez</b>: cada archivo crea un curso aparte y después los corriges juntos. Los cursos que ya tienes guardados no se tocan.</p>
      ${htmlAvisos(est.avisosListas, "amarillo")}
      <div class="paes-zona-subir" data-zona="listas">
        <input type="file" data-archivo="listas" accept=".xls,.xlsx,.csv" multiple style="display:none;" />
        <button type="button" data-accion="elegir-listas">📤 Subir una o varias listas…</button>
        <span class="ayuda" style="margin:0;">o arrastra los archivos hasta aquí</span>
      </div>
      ${cursoActual() ? `<div class="acciones-form"><button type="button" class="secundario" data-accion="cancelar-curso">← Volver a ${esc(nombreCurso(cursoActual()))}</button></div>` : ""}
    </div>` + htmlFormCurso();
  }

  // propone nivel, letra y colegio a partir del nombre del archivo (y del curso que traiga la lista)
  function adivinarCurso(nombreArchivo, textoCurso) {
    const limpio = (t) => String(t || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
    const plano = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const NUM = { primero: 1, primer: 1, "1ro": 1, "1ero": 1, i: 1, segundo: 2, "2do": 2, ii: 2, tercero: 3, tercer: 3, "3ro": 3, "3ero": 3, iii: 3, cuarto: 4, "4to": 4, iv: 4, 1: 1, 2: 2, 3: 3, 4: 4 };
    const largo = /(?:^|\s)(primero|primer|segundo|tercero|tercer|cuarto|1ro|1ero|2do|3ro|3ero|4to|iv|iii|ii|i|[1-4])\s*[°º]?\s*(?:medios?|m)(?=\s|$)(?:\s+([a-zñ])(?=\s|$))?/;
    const corto = /(?:^|\s)(iv|iii|ii|i|[1-4])\s*[°º]?\s*([a-zñ])(?=\s|$)/;
    const buscar = (texto) => {
      const t = plano(texto);
      const m = t.match(largo) || t.match(corto);
      if (!m) return null;
      const desde = m.index + (m[0].startsWith(" ") ? 1 : 0);
      return { nivel: NUM[m[1]] + "° Medio", letra: (m[2] || "").toUpperCase(), resto: (texto.slice(0, desde) + " " + texto.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim() };
    };
    const archivo = limpio(nombreArchivo);
    const delArchivo = buscar(archivo);
    const delTexto = buscar(limpio(textoCurso));
    const elegido = delTexto || delArchivo;
    const colegio = (delArchivo ? delArchivo.resto : archivo)
      .replace(/\b(listas?|listado|n[oó]mina|oficial|cursos?|alumnos|estudiantes|20\d\d)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { nivel: elegido ? elegido.nivel : "4° Medio", letra: elegido ? elegido.letra || (delArchivo ? delArchivo.letra : "") : "", colegio };
  }

  // una lista leída que va a crear un curso: datos propuestos y estudiantes sin RUT repetidos
  function tarjetaDeLista(nombreArchivo, textoCurso, filas, avisos) {
    const a = adivinarCurso(nombreArchivo, textoCurso);
    const vistos = new Set();
    const estudiantes = [];
    let repetidos = 0;
    filas.forEach((f) => {
      const rut = L.leerRut(f.rut).rut;
      if (!(String(f.nombres || "") + String(f.apellidos || "") + String(rut || "")).trim()) return;
      if (rut && vistos.has(rut)) {
        repetidos++;
        return;
      }
      if (rut) vistos.add(rut);
      estudiantes.push({ nombres: String(f.nombres || "").trim(), apellidos: String(f.apellidos || "").trim(), rut });
    });
    return { uid: PaesDB.nuevoId("l"), archivo: nombreArchivo, colegio: a.colegio, nivel: a.nivel, letra: a.letra, anio: new Date().getFullYear(), estudiantes, repetidos, avisos: avisos || [], origenCursoId: null };
  }

  async function leerListasNuevas(archivos) {
    const tarjetas = est.listas ? est.listas.slice() : [];
    const fallas = [];
    for (const archivo of archivos) {
      try {
        const r = L.leerListaCurso(await filasDeArchivo(archivo));
        if (!r.estudiantes.length) {
          fallas.push(`«${archivo.name}»: ${r.avisos[0] || "no se encontraron estudiantes."}`);
          continue;
        }
        const filas = r.estudiantes.map((e) => ({ nombres: e.nombres, apellidos: e.apellidos, rut: L.formatearRutPaes(e.rut), curso: e.curso || "" }));
        const cursos = Array.from(new Set(filas.map((f) => f.curso)));
        // un archivo con varios cursos en una columna: un curso nuevo por cada uno
        if (cursos.length > 1) cursos.forEach((k) => tarjetas.push(tarjetaDeLista(archivo.name, k, filas.filter((f) => f.curso === k), r.avisos)));
        else tarjetas.push(tarjetaDeLista(archivo.name, r.cursoDetectado || cursos[0] || "", filas, r.avisos));
      } catch (e) {
        console.error(e);
        fallas.push(`«${archivo.name}» no se pudo leer. ¿Es un Excel (.xls, .xlsx) o un CSV?`);
      }
    }
    est.listas = tarjetas.length ? tarjetas : null;
    est.avisosListas = fallas;
    if (!cursoActual()) est.enBlanco = est.cursos.length > 0;
    else est.formCurso = { modo: "nuevo" };
    pintar();
  }

  // qué impide crear cada curso (por uid de la lista)
  function problemasDeListas() {
    const problemas = new Map();
    const firma = (o) => [String(o.colegio || "").replace(/\s+/g, " ").trim().toLowerCase(), o.nivel, String(o.letra || "").trim().toUpperCase(), Number(o.anio)].join("|");
    const existentes = new Set(est.cursos.map(firma));
    const cuenta = new Map();
    est.listas.forEach((t) => cuenta.set(firma(t), (cuenta.get(firma(t)) || 0) + 1));
    est.listas.forEach((t) => {
      if (!String(t.colegio || "").trim()) problemas.set(t.uid, "Falta escribir el colegio.");
      else if (existentes.has(firma(t))) problemas.set(t.uid, "Ya tienes guardado un curso con ese colegio, nivel, letra y año. Cambia la letra; si lo que quieres es actualizar la lista de ese curso, ábrelo y súbela ahí.");
      else if (cuenta.get(firma(t)) > 1) problemas.set(t.uid, "Hay otra lista con el mismo colegio, nivel, letra y año: cambia la letra de una de las dos.");
    });
    return problemas;
  }

  function htmlListasNuevas() {
    const problemas = est.revisarListas ? problemasDeListas() : new Map();
    let h = `<div class="tarjeta">
      <h2>Cursos que se van a crear (${est.listas.length})</h2>
      <p class="ayuda">Cada lista crea <b>un curso aparte</b>. Revisa el colegio, el nivel y la letra: la app los propone a partir del nombre del archivo. Nada se guarda hasta que presiones «Crear».</p>
      ${htmlAvisos(est.avisosListas, "amarillo")}
      <datalist id="paes-colegios">${colegiosConocidos().map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>`;
    est.listas.forEach((t, i) => {
      const sinRut = t.estudiantes.filter((e) => !e.rut).length;
      const invalidos = t.estudiantes.filter((e) => e.rut && !L.leerRut(e.rut).valido).length;
      const detalle = [plural(t.estudiantes.length, "estudiante", "estudiantes")];
      if (sinRut) detalle.push(`${sinRut} sin RUT`);
      if (invalidos) detalle.push(`${invalidos} con RUT inválido`);
      if (t.repetidos) detalle.push(`${plural(t.repetidos, "repetido omitido", "repetidos omitidos")}`);
      const origen = t.origenCursoId ? est.cursos.find((k) => k.id === t.origenCursoId) : null;
      h += `<div class="paes-lista-nueva${problemas.has(t.uid) ? " con-problema" : ""}">
        <div class="paes-lista-nueva-cab"><b>📄 ${esc(t.archivo)}</b><span>${esc(detalle.join(" · "))}</span>
          <button type="button" class="chico peligro" data-accion="quitar-lista-nueva" data-i="${i}" title="No crear este curso">✕</button></div>
        <div class="grid-form">
          <div class="campo-ancho"><label>Colegio *</label><input type="text" data-lista="colegio" data-i="${i}" list="paes-colegios" value="${esc(t.colegio)}" autocomplete="off" /></div>
          <div><label>Nivel *</label><select data-lista="nivel" data-i="${i}">${NIVELES.map((n) => `<option ${n === t.nivel ? "selected" : ""}>${n}</option>`).join("")}</select></div>
          <div><label>Letra</label><input type="text" data-lista="letra" data-i="${i}" maxlength="3" value="${esc(t.letra)}" placeholder="Ej: A" /></div>
          <div><label>Año *</label><input type="number" data-lista="anio" data-i="${i}" min="2020" max="2100" value="${esc(t.anio)}" /></div>
        </div>
        ${problemas.has(t.uid) ? `<p class="paes-error" style="margin:8px 0 0;">⚠ ${esc(problemas.get(t.uid))}</p>` : ""}
        ${origen ? `<p class="paes-nota" style="margin:8px 0 0;">Al crear este curso, los estudiantes de esta lista que estén en ${esc(nombreCurso(origen))} y no tengan hoja allí se sacan de ese curso.</p>` : ""}
        <details class="paes-lista-nueva-det"><summary>Ver los ${plural(t.estudiantes.length, "estudiante", "estudiantes")}</summary>
          <div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>N°</th><th>Nombres</th><th>Apellidos</th><th>RUT</th><th></th></tr></thead><tbody>
          ${t.estudiantes.map((e, n) => `<tr><td class="num">${n + 1}</td><td>${esc(e.nombres)}</td><td>${esc(e.apellidos)}</td><td class="rut">${esc(L.formatearRutPaes(e.rut))}</td><td>${insigniaRut(e.rut)}</td></tr>`).join("")}
          </tbody></table></div>
          <p class="ayuda" style="margin:6px 0 0;">Los nombres y los RUT se pueden corregir después, en la lista de cada curso.</p></details>
      </div>`;
    });
    h += `<div class="acciones-form">
        <input type="file" data-archivo="listas" accept=".xls,.xlsx,.csv" multiple style="display:none;" />
        <button type="button" data-accion="crear-cursos-listas">✓ Crear ${plural(est.listas.length, "curso", "cursos")}</button>
        <button type="button" class="secundario" data-accion="elegir-listas">➕ Agregar más listas…</button>
        <button type="button" class="secundario" data-accion="cancelar-listas">Cancelar</button>
      </div></div>`;
    return h;
  }

  async function crearCursosDeListas() {
    if (!est.listas || !est.listas.length) return;
    const problemas = problemasDeListas();
    if (problemas.size) {
      est.revisarListas = true;
      pintar();
      toast(problemas.values().next().value);
      return;
    }
    const nuevos = est.listas.map((t) => ({
      id: PaesDB.nuevoId("c"),
      colegio: String(t.colegio).replace(/\s+/g, " ").trim(),
      nivel: t.nivel,
      letra: String(t.letra || "").trim().toUpperCase(),
      anio: Number(t.anio) || new Date().getFullYear(),
      estudiantes: t.estudiantes.map((e) => ({ id: PaesDB.nuevoId("e"), rut: e.rut, nombres: e.nombres, apellidos: e.apellidos })),
      listaArchivo: t.archivo,
      creado: new Date().toISOString(),
    }));
    // listas que se habían mezclado en otro curso: se sacan de allí quienes no tienen hoja
    const tocados = new Set();
    let sacados = 0;
    est.listas.forEach((t) => {
      const o = t.origenCursoId ? est.cursos.find((k) => k.id === t.origenCursoId) : null;
      if (!o) return;
      const ruts = new Set(t.estudiantes.map((e) => e.rut).filter(Boolean));
      const ensayos = new Set(ensayosDelCurso(o.id).map((e) => e.id));
      const conHoja = new Set(est.hojas.filter((h) => ensayos.has(h.ensayoId) && h.estudianteId).map((h) => h.estudianteId));
      const antes = o.estudiantes.length;
      o.estudiantes = o.estudiantes.filter((e) => !(e.rut && ruts.has(e.rut) && !conHoja.has(e.id)));
      if (o.estudiantes.length !== antes) {
        sacados += antes - o.estudiantes.length;
        tocados.add(o);
      }
    });
    try {
      await PaesDB.ponerVarios(nuevos.concat(Array.from(tocados)).map((c) => ["cursos", c]));
    } catch (e) {
      console.error(e);
      toast("No se pudieron guardar los cursos: " + (e && e.message ? e.message : "error del guardado local"));
      return;
    }
    est.cursos.push(...nuevos);
    for (const o of tocados) await revincularCurso(o);
    Object.assign(est, { listas: null, avisosListas: [], revisarListas: false, enBlanco: false, formCurso: null, previa: null, editEst: null, cursoId: nuevos[0].id, ensayoId: null, paso: "curso", tanda: nuevos.length > 1 ? nuevos.map((c) => c.id) : [] });
    pintar();
    global.scrollTo({ top: 0 });
    toast(`${plural(nuevos.length, "curso creado", "cursos creados")}${sacados ? ` · ${plural(sacados, "estudiante sacado", "estudiantes sacados")} del curso anterior` : ""}${nuevos.length > 1 ? " · ahora crea el ensayo para todos (paso 2)" : ""}`);
  }

  // la lista que se estaba por cargar en un curso pasa a crear un curso nuevo
  function previaACursoNuevo() {
    const c = cursoActual();
    const p = est.previa;
    if (!c || !p) return;
    const filas = p.cursoElegido ? p.estudiantes.filter((e) => e.curso === p.cursoElegido) : p.estudiantes;
    const t = tarjetaDeLista(p.archivo, p.cursoElegido || "", filas, []);
    t.colegio = c.colegio;
    t.anio = c.anio;
    if (t.nivel === c.nivel && t.letra === (c.letra || "")) t.letra = "";
    t.origenCursoId = c.id;
    Object.assign(est, { listas: [t], avisosListas: [], revisarListas: false, previa: null, formCurso: { modo: "nuevo" } });
    pintar();
    global.scrollTo({ top: 0 });
    toast("Escribe la letra del curso nuevo y presiona «Crear»");
  }

  function htmlPasoCurso() {
    const c = cursoActual();
    if (c && est.formCurso && est.formCurso.modo === "editar") return htmlFormCurso();
    if (est.formCurso || !c) return htmlInicio();
    const nEnsayos = ensayosDelCurso(c.id).length;
    let h = `<div class="tarjeta">
      <div class="paes-cabecera">
        <div><h2 style="margin:0;">${esc(c.colegio)} · ${esc(etiquetaCurso(c))}</h2>
        <p class="ayuda" style="margin:4px 0 0;">Año ${esc(c.anio)} · ${plural(c.estudiantes.length, "estudiante", "estudiantes")} en la lista · ${plural(nEnsayos, "ensayo", "ensayos")}</p></div>
        <div class="paes-cabecera-acciones">
          <button type="button" class="chico" data-accion="nuevo-curso">➕ Ingresar nuevo curso</button>
          <button type="button" class="secundario chico" data-accion="editar-curso" title="Cambia el colegio, el nivel, la letra o el año de ESTE curso">✏ Editar datos de este curso</button>
          <button type="button" class="chico peligro" data-accion="eliminar-curso">🗑 Eliminar curso</button>
        </div>
      </div>
    </div>`;
    h += est.previa ? htmlPreviaLista(c) : htmlLista(c);
    if (c.estudiantes.length && !est.previa) {
      h += `<div class="paes-siguiente"><button type="button" data-paso="ensayo">Seguir: ensayo, clave y tabla →</button></div>`;
    }
    return h;
  }

  function insigniaRut(rutTexto) {
    const r = L.leerRut(rutTexto);
    if (r.vacio) return `<span class="paes-chip gris">sin RUT</span>`;
    if (!r.valido) return `<span class="paes-chip amarillo" title="El dígito verificador no corresponde a ese RUT">⚠ RUT inválido</span>`;
    return `<span class="paes-chip verde">✓</span>`;
  }

  function htmlLista(c) {
    const lista = estudiantesOrdenados(c);
    const invalidos = lista.filter((e) => e.rut && !L.leerRut(e.rut).valido).length;
    const sinRut = lista.filter((e) => !e.rut).length;
    let h = `<div class="tarjeta">
      <h2 style="font-size:16px;">Lista oficial del curso</h2>
      <p class="ayuda">${lista.length ? "Con esta lista se vinculan las hojas por RUT. Puedes corregir un nombre o un RUT, agregar a alguien o subir una lista actualizada de este mismo curso. Si la lista es de otro curso, usa «Ingresar nuevo curso»." : "Sube el Excel de la lista (.xls, .xlsx o .csv) con el nombre completo y el RUT de cada estudiante. Vas a ver una vista previa para corregir antes de confirmar."}</p>
      <div class="acciones-form" style="margin-top:0;">
        <input type="file" data-archivo="lista" accept=".xls,.xlsx,.csv" style="display:none;" />
        <button type="button" data-accion="elegir-lista">📤 ${lista.length ? "Actualizar la lista de este curso…" : "Subir la lista del curso…"}</button>
        <button type="button" class="secundario" data-accion="agregar-estudiante">➕ Agregar estudiante a mano</button>
      </div>`;
    const avisos = [];
    if (invalidos) avisos.push(`${plural(invalidos, "estudiante tiene", "estudiantes tienen")} el RUT con el dígito verificador incorrecto: sus hojas no se van a vincular solas.`);
    if (sinRut) avisos.push(`${plural(sinRut, "estudiante no tiene", "estudiantes no tienen")} RUT: sus hojas habrá que asignarlas a mano.`);
    h += htmlAvisos(avisos, "amarillo");
    if (lista.length || est.editEst === "nuevo") {
      h += `<div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>N°</th><th>Nombres</th><th>Apellidos</th><th>RUT</th><th></th><th></th></tr></thead><tbody>`;
      lista.forEach((e, i) => {
        if (est.editEst === e.id) h += htmlFilaEdicion(e, i + 1);
        else {
          h += `<tr><td class="num">${i + 1}</td><td>${esc(e.nombres)}</td><td>${esc(e.apellidos)}</td><td class="rut">${esc(L.formatearRutPaes(e.rut))}</td><td>${insigniaRut(e.rut)}</td>
            <td class="acciones"><button type="button" class="secundario chico" data-accion="editar-estudiante" data-id="${esc(e.id)}">✏</button>
            <button type="button" class="chico peligro" data-accion="eliminar-estudiante" data-id="${esc(e.id)}" title="Quitar de la lista">🗑</button></td></tr>`;
        }
      });
      if (est.editEst === "nuevo") h += htmlFilaEdicion({ id: "nuevo", nombres: "", apellidos: "", rut: "" }, lista.length + 1);
      h += `</tbody></table></div>`;
    }
    return h + `</div>`;
  }

  function htmlFilaEdicion(e, n) {
    return `<tr class="paes-fila-edicion"><td class="num">${n}</td>
      <td><input type="text" data-edit="nombres" value="${esc(e.nombres)}" placeholder="Nombres" /></td>
      <td><input type="text" data-edit="apellidos" value="${esc(e.apellidos)}" placeholder="Apellidos" /></td>
      <td><input type="text" data-edit="rut" value="${esc(L.formatearRutPaes(e.rut))}" placeholder="12.345.678-9" /></td>
      <td></td>
      <td class="acciones"><button type="button" class="chico" data-accion="guardar-estudiante" data-id="${esc(e.id)}">Guardar</button>
      <button type="button" class="secundario chico" data-accion="cancelar-estudiante">Cancelar</button></td></tr>`;
  }

  function htmlPreviaLista(c) {
    const p = est.previa;
    const filas = p.cursoElegido ? p.estudiantes.filter((e) => e.curso === p.cursoElegido) : p.estudiantes;
    let h = `<div class="tarjeta paes-previa">
      <h2 style="font-size:16px;">Vista previa de la lista · ${esc(p.archivo)}</h2>
      <p class="ayuda">Revisa que los nombres y los RUT hayan quedado bien. Puedes corregir cualquier celda o quitar una fila. Nada se guarda hasta que confirmes.</p>
      ${htmlAvisos(p.avisos, "amarillo")}`;
    if (p.cursos && p.cursos.length > 1) {
      h += `<div class="paes-ctx-campo" style="margin-bottom:10px;"><label>Curso del archivo que quieres cargar</label>
        <select data-cambio="previa-curso"><option value="">Todos (${p.estudiantes.length})</option>${p.cursos.map((k) => `<option value="${esc(k)}" ${k === p.cursoElegido ? "selected" : ""}>${esc(k)} (${p.estudiantes.filter((e) => e.curso === k).length})</option>`).join("")}</select></div>`;
    }
    if (c.estudiantes.length) {
      const delCurso = new Set(c.estudiantes.map((e) => e.rut).filter(Boolean));
      const conRut = filas.map((f) => L.leerRut(f.rut).rut).filter(Boolean);
      const coinciden = conRut.filter((r) => delCurso.has(r)).length;
      if (conRut.length >= 5 && coinciden < conRut.length / 2) {
        h += `<div class="paes-alerta-lista"><p>⚠ <b>Esta lista parece ser de otro curso.</b> Solo ${coinciden} de sus ${conRut.length} RUT están en ${esc(nombreCurso(c))}. Si la confirmas aquí, los dos cursos van a quedar mezclados en uno.</p>
          <button type="button" data-accion="previa-a-nuevo">➕ Crear un curso nuevo con esta lista</button></div>`;
      } else {
        h += `<p class="paes-nota">Este curso ya tiene ${plural(c.estudiantes.length, "estudiante", "estudiantes")}: quienes vengan con el mismo RUT se actualizan, los nuevos se agregan y nadie se elimina.</p>`;
      }
    }
    h += `<div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>N°</th><th>Nombres</th><th>Apellidos</th><th>RUT</th><th></th><th>Como venía en el archivo</th><th></th></tr></thead><tbody>`;
    filas.forEach((e, i) => {
      h += `<tr class="${!e.nombreSeguro && e.nombreRaro ? "paes-fila-duda" : ""}"><td class="num">${i + 1}</td>
        <td><input type="text" data-previa="nombres" data-i="${e.i}" value="${esc(e.nombres)}" /></td>
        <td><input type="text" data-previa="apellidos" data-i="${e.i}" value="${esc(e.apellidos)}" /></td>
        <td><input type="text" data-previa="rut" data-i="${e.i}" value="${esc(e.rut)}" /></td>
        <td data-insignia="${e.i}">${insigniaRut(e.rut)}</td>
        <td class="paes-original">${esc(e.nombreOriginal)}</td>
        <td class="acciones"><button type="button" class="chico peligro" data-accion="quitar-previa" data-i="${e.i}" title="No cargar esta fila">✕</button></td></tr>`;
    });
    h += `</tbody></table></div>
      <div class="acciones-form">
        <button type="button" data-accion="confirmar-lista">✓ Confirmar la lista (${plural(filas.length, "estudiante", "estudiantes")})</button>
        ${c.estudiantes.length ? `<button type="button" class="secundario" data-accion="previa-a-nuevo" title="Crea un curso aparte con esta lista; si estos estudiantes quedaron mezclados en este curso y no tienen hoja aquí, se sacan">➕ Es de otro curso: crear un curso nuevo</button>` : ""}
        <button type="button" class="secundario" data-accion="cancelar-lista">Cancelar</button>
      </div></div>`;
    return h;
  }

  // lee un Excel o CSV y devuelve sus filas como matriz de textos
  async function filasDeArchivo(archivo) {
    const datos = new Uint8Array(await archivo.arrayBuffer());
    const libro = XLSX.read(datos, { type: "array", raw: false, cellDates: false });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: "", blankrows: false });
  }

  async function leerArchivoLista(archivo) {
    try {
      const r = L.leerListaCurso(await filasDeArchivo(archivo));
      if (!r.estudiantes.length) {
        toast(r.avisos[0] || "No se encontraron estudiantes en el archivo.");
        return;
      }
      est.previa = {
        archivo: archivo.name,
        avisos: r.avisos,
        cursos: r.cursos || [],
        cursoElegido: "",
        estudiantes: r.estudiantes.map((e, i) => ({ i, nombres: e.nombres, apellidos: e.apellidos, rut: L.formatearRutPaes(e.rut), curso: e.curso, nombreOriginal: e.nombreOriginal, nombreSeguro: e.nombreSeguro, nombreRaro: e.nombreRaro })),
      };
      est.editEst = null;
      pintar();
    } catch (e) {
      console.error(e);
      toast("No se pudo leer el archivo. ¿Es un Excel (.xls, .xlsx) o un CSV?");
    }
  }

  async function confirmarLista() {
    const c = cursoActual();
    const p = est.previa;
    if (!c || !p) return;
    const filas = (p.cursoElegido ? p.estudiantes.filter((e) => e.curso === p.cursoElegido) : p.estudiantes).filter((e) => (e.nombres + e.apellidos + e.rut).trim());
    const porRut = new Map(c.estudiantes.filter((e) => e.rut).map((e) => [e.rut, e]));
    let nuevos = 0, actualizados = 0, repetidos = 0;
    const vistos = new Set();
    filas.forEach((f) => {
      const rut = L.leerRut(f.rut).rut;
      if (rut && vistos.has(rut)) {
        repetidos++;
        return;
      }
      if (rut) vistos.add(rut);
      const existente = rut ? porRut.get(rut) : null;
      if (existente) {
        existente.nombres = f.nombres.trim();
        existente.apellidos = f.apellidos.trim();
        actualizados++;
      } else {
        c.estudiantes.push({ id: PaesDB.nuevoId("e"), rut, nombres: f.nombres.trim(), apellidos: f.apellidos.trim() });
        nuevos++;
      }
    });
    c.listaArchivo = p.archivo;
    est.previa = null;
    await guardar("cursos", c);
    const vinculadas = await revincularCurso(c);
    pintar();
    toast(`Lista guardada: ${plural(nuevos, "estudiante nuevo", "estudiantes nuevos")}${actualizados ? `, ${plural(actualizados, "actualizado", "actualizados")}` : ""}${repetidos ? `, ${plural(repetidos, "repetido omitido", "repetidos omitidos")}` : ""}${vinculadas ? ` · ${plural(vinculadas, "hoja vinculada", "hojas vinculadas")}` : ""}`);
  }

  async function guardarCurso() {
    const colegio = raiz.querySelector("#paes-curso-colegio").value.replace(/\s+/g, " ").trim();
    const nivel = raiz.querySelector("#paes-curso-nivel").value;
    const letra = raiz.querySelector("#paes-curso-letra").value.trim().toUpperCase();
    const anio = Number(raiz.querySelector("#paes-curso-anio").value) || new Date().getFullYear();
    if (!colegio) {
      toast("Escribe el nombre del colegio.");
      return;
    }
    const editando = est.formCurso && est.formCurso.modo === "editar" ? cursoActual() : null;
    const igual = est.cursos.find((k) => k !== editando && k.colegio.toLowerCase() === colegio.toLowerCase() && k.nivel === nivel && (k.letra || "") === letra && k.anio === anio);
    if (igual) {
      toast("Ese curso ya existe: lo puedes elegir en la lista de cursos.");
      return;
    }
    let c = editando;
    if (c) Object.assign(c, { colegio, nivel, letra, anio });
    else {
      c = { id: PaesDB.nuevoId("c"), colegio, nivel, letra, anio, estudiantes: [], creado: new Date().toISOString() };
      est.cursos.push(c);
    }
    await guardar("cursos", c);
    est.cursoId = c.id;
    est.enBlanco = false;
    if (!editando) {
      est.ensayoId = null;
      est.tanda = [];
      est.listas = null;
    }
    est.formCurso = null;
    est.previa = null;
    pintar();
    toast(editando ? "Datos del curso guardados" : "Curso creado: ahora sube su lista");
  }

  function eliminarCurso() {
    const c = cursoActual();
    if (!c) return;
    const ensayos = ensayosDelCurso(c.id);
    const nHojas = ensayos.reduce((a, e) => a + hojasDelEnsayo(e.id).length, 0);
    confirmar({
      titulo: "Eliminar el curso",
      texto: `Se va a eliminar ${c.colegio} · ${etiquetaCurso(c)} con su lista (${plural(c.estudiantes.length, "estudiante", "estudiantes")}), ${plural(ensayos.length, "ensayo", "ensayos")} y ${plural(nHojas, "hoja leída", "hojas leídas")}. Esto no se puede deshacer.`,
      textoBoton: "Eliminar el curso y todo lo suyo",
      onConfirmar: async () => {
        for (const e of ensayos) await PaesDB.borrarEnsayo(e.id);
        await PaesDB.borrar("cursos", c.id);
        const idsEnsayos = new Set(ensayos.map((e) => e.id));
        est.hojas = est.hojas.filter((h) => !idsEnsayos.has(h.ensayoId));
        est.ensayos = est.ensayos.filter((e) => e.cursoId !== c.id);
        est.cursos = est.cursos.filter((k) => k.id !== c.id);
        est.cursoId = null;
        pintar();
        toast("Curso eliminado");
      },
    });
  }

  async function guardarEstudiante(id) {
    const c = cursoActual();
    const fila = raiz.querySelector(".paes-fila-edicion");
    if (!c || !fila) return;
    const nombres = fila.querySelector('[data-edit="nombres"]').value.replace(/\s+/g, " ").trim();
    const apellidos = fila.querySelector('[data-edit="apellidos"]').value.replace(/\s+/g, " ").trim();
    const r = L.leerRut(fila.querySelector('[data-edit="rut"]').value);
    if (!nombres && !apellidos) {
      toast("Escribe al menos el nombre del estudiante.");
      return;
    }
    if (r.rut && c.estudiantes.some((e) => e.id !== id && e.rut === r.rut)) {
      toast("Ya hay un estudiante con ese RUT en el curso.");
      return;
    }
    if (id === "nuevo") c.estudiantes.push({ id: PaesDB.nuevoId("e"), rut: r.rut, nombres, apellidos });
    else {
      const e = c.estudiantes.find((k) => k.id === id);
      if (!e) return;
      Object.assign(e, { rut: r.rut, nombres, apellidos });
    }
    est.editEst = null;
    await guardar("cursos", c);
    const vinculadas = await revincularCurso(c);
    pintar();
    toast(r.rut && !r.valido ? "Guardado. Ojo: ese RUT tiene el dígito verificador incorrecto." : `Estudiante guardado${vinculadas ? ` · ${plural(vinculadas, "hoja vinculada", "hojas vinculadas")}` : ""}`);
  }

  function eliminarEstudiante(id) {
    const c = cursoActual();
    const e = c && c.estudiantes.find((k) => k.id === id);
    if (!e) return;
    const nHojas = est.hojas.filter((h) => h.estudianteId === id).length;
    confirmar({
      titulo: "Quitar de la lista",
      texto: `Se va a quitar a ${L.nombreCompletoPaes(e)} de la lista del curso.${nHojas ? ` ${plural(nHojas, "hoja suya quedará", "hojas suyas quedarán")} sin identificar (no se borran).` : ""}`,
      textoBoton: "Quitar de la lista",
      onConfirmar: async () => {
        c.estudiantes = c.estudiantes.filter((k) => k.id !== id);
        await guardar("cursos", c);
        await revincularCurso(c);
        pintar();
        toast("Estudiante quitado de la lista");
      },
    });
  }

  // ============================================================ PASO 2 · ensayo, clave y tabla

  function htmlFormEnsayo() {
    const otrosTanda = est.tanda.includes(est.cursoId) ? est.tanda.filter((id) => id !== est.cursoId).map((id) => est.cursos.find((k) => k.id === id)).filter(Boolean) : [];
    return `<div class="tarjeta">
      <h2>Nuevo ensayo</h2>
      <p class="ayuda">Elige la prueba y, si quieres, la forma y la fecha en que se aplicó. La tabla de conversión de la unidad se carga sola; la clave la importas o la escribes en el paso siguiente.</p>
      <div class="grid-form">
        <div class="campo-ancho"><label>Prueba *</label><select id="paes-ens-prueba">
          ${Object.values(L.PRUEBAS_PAES).map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("")}
          <option value="OTRA">Otra prueba…</option></select></div>
        <div class="campo-ancho" id="paes-ens-otra" style="display:none;"><label>Nombre de la prueba *</label><input type="text" id="paes-ens-nombre" placeholder="Ej: Ciencias" /></div>
        <div><label>Forma</label><input type="text" id="paes-ens-forma" maxlength="12" placeholder="Ej: 3" /></div>
        <div><label>Fecha de aplicación</label><input type="date" id="paes-ens-fecha" value="${hoyIso()}" /></div>
        <div class="campo-ancho"><label>Clavijero que se aplica a este curso</label><select id="paes-ens-clavijero">
          <option value="">— Lo cargo después —</option>
          ${est.clavijeros.map((k) => `<option value="${esc(k.id)}">${esc(k.nombre)} · ${esc(nombrePruebaDe(k))}</option>`).join("")}</select></div>
        ${otrosTanda.length ? `<div class="campo-ancho"><label>Crear este mismo ensayo también en</label>
          <div class="paes-checks">${otrosTanda.map((k) => `<label><input type="checkbox" data-ens-curso="${esc(k.id)}" checked /> ${esc(nombreCurso(k))}</label>`).join("")}</div>
          <p class="ayuda" style="margin:4px 0 0;">Así subes las hojas de todos los cursos juntas y cada hoja se va sola a su curso por el RUT. La clave se comparte entre ellos.</p></div>` : ""}
      </div>
      <div class="acciones-form">
        <button type="button" data-accion="guardar-ensayo">${otrosTanda.length ? "Crear el ensayo" : "Crear ensayo"}</button>
        ${ensayosDelCurso(est.cursoId).length ? `<button type="button" class="secundario" data-accion="cancelar-ensayo">Cancelar</button>` : ""}
      </div>
    </div>`;
  }

  function resumenClave(e) {
    const con = e.clave.filter((k) => k.r).length;
    const validas = e.clave.filter((k) => k.r && k.valida).length;
    const faltan = e.clave.length - con;
    return `${faltan ? `<b class="paes-falta">⚠ Faltan ${plural(faltan, "respuesta", "respuestas")}</b> · ` : ""}${con} de ${e.clave.length} respuestas · <b>${plural(validas, "pregunta válida", "preguntas válidas")}</b> · versión ${e.claveVersion || 0}`;
  }

  function resumenTabla(e) {
    if (!e.tabla.length) return `<b class="paes-falta">⚠ Sin tabla de conversión</b>`;
    const vacios = e.tabla.filter((p) => p == null).length;
    return `<b>Tabla de 0 a ${e.tabla.length - 1} correctas</b> · ${e.tabla[0] == null ? "—" : e.tabla[0]} a ${e.tabla[e.tabla.length - 1] == null ? "—" : e.tabla[e.tabla.length - 1]} puntos · versión ${e.tablaVersion || 1}${vacios ? ` · <b class="paes-falta">⚠ ${plural(vacios, "fila sin puntaje", "filas sin puntaje")}</b>` : ""}`;
  }

  function htmlPasoEnsayo() {
    const c = cursoActual();
    const e = ensayoActual();
    if (est.formEnsayo || !e) return htmlFormEnsayo();
    const letras = L.LETRAS_PAES.slice(0, e.alternativas || 4).split("");
    const nHojas = hojasDelEnsayo(e.id).length;
    const validas = e.clave.filter((k) => k.r && k.valida).length;
    const maxTabla = e.tabla.length - 1;
    let h = `<div class="tarjeta">
      <div class="paes-cabecera">
        <div><h2 style="margin:0;">${esc(nombrePrueba(e))}</h2>
        <p class="ayuda" style="margin:4px 0 0;">${esc(c.colegio)} · ${esc(etiquetaCurso(c))} · ${plural(nHojas, "hoja leída", "hojas leídas")}</p></div>
        <div class="paes-cabecera-acciones"><button type="button" class="chico peligro" data-accion="eliminar-ensayo">🗑 Eliminar ensayo</button></div>
      </div>
      <div class="grid-form" style="margin-top:14px;">
        <div><label>Forma</label><input type="text" data-ensayo="forma" maxlength="12" value="${esc(e.forma || "")}" /></div>
        <div><label>Fecha de aplicación</label><input type="date" data-ensayo="fecha" value="${esc(e.fecha || "")}" /></div>
        <div><label>N° de preguntas</label><input type="number" data-ensayo="nPreguntas" min="1" max="100" value="${e.clave.length}" /></div>
        <div><label>Alternativas</label><select data-ensayo="alternativas"><option value="4" ${(e.alternativas || 4) === 4 ? "selected" : ""}>A a D</option><option value="5" ${e.alternativas === 5 ? "selected" : ""}>A a E</option></select></div>
      </div>
    </div>`;

    // ---- clave
    h += `<div class="tarjeta">
      <h2 style="font-size:16px;">Clave de respuestas</h2>
      <p class="paes-resumen" id="paes-resumen-clave">${resumenClave(e)}</p>
      ${htmlClavijeroAplicado(e)}
      <div class="acciones-form" style="margin-top:0;">
        <input type="file" data-archivo="clave" accept=".csv,.xls,.xlsx" style="display:none;" />
        <button type="button" data-accion="elegir-clave">📤 Importar clave (CSV o Excel)…</button>
        <button type="button" class="secundario" data-accion="pegar-clave">⌨ Escribir o pegar la clave</button>
      </div>`;
    if (est.pegarClave) {
      h += `<div class="paes-pegar">
        <label>Escribe una letra por pregunta, en orden (por ejemplo <code>DDBCA…</code>), o pega una lista como <code>1 D, 2 D, 3 B</code>.</label>
        <textarea id="paes-clave-texto" rows="3" placeholder="DDBCA…"></textarea>
        <div class="acciones-form"><button type="button" class="chico" data-accion="aplicar-clave">Usar esta clave</button><button type="button" class="secundario chico" data-accion="cancelar-pegar">Cancelar</button></div>
      </div>`;
    }
    h += `<p class="paes-nota">Desmarca la casilla de una pregunta para dejarla como <b>no válida</b> (anulada o de pilotaje): no cuenta para nadie y todo se recalcula.</p>
      <div class="paes-clave-grilla">`;
    e.clave.forEach((k) => {
      h += `<div class="paes-clave-celda${k.valida ? "" : " no-valida"}${k.r ? "" : " sin-clave"}" data-celda-clave="${k.n}">
        <span class="n">${k.n}</span>
        <select data-clave="${k.n}" aria-label="Respuesta de la pregunta ${k.n}"><option value="">–</option>${letras.concat(k.r && !letras.includes(k.r) ? [k.r] : []).map((l) => `<option ${l === k.r ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input type="checkbox" data-valida="${k.n}" ${k.valida ? "checked" : ""} title="Pregunta válida (cuenta para el puntaje)" aria-label="Pregunta ${k.n} válida" />
      </div>`;
    });
    h += `</div></div>`;

    // ---- tabla
    const defecto = L.TABLAS_PAES[e.prueba];
    h += `<div class="tarjeta">
      <h2 style="font-size:16px;">Tabla de conversión (correctas → puntaje)</h2>
      <p class="paes-resumen" id="paes-resumen-tabla">${resumenTabla(e)}</p>
      ${validas > maxTabla && e.tabla.length ? `<p class="paes-nota amarillo">El ensayo tiene ${plural(validas, "pregunta válida", "preguntas válidas")} y la tabla llega a ${maxTabla} correctas. Mientras no marques las preguntas de pilotaje como no válidas se cuentan todas, y una hoja con más de ${maxTabla} correctas queda «sin tabla» (no se recorta ni se inventa un puntaje).</p>` : ""}
      <div class="acciones-form" style="margin-top:0;">
        <input type="file" data-archivo="tabla" accept=".csv,.xls,.xlsx" style="display:none;" />
        <button type="button" class="secundario" data-accion="elegir-tabla">📤 Importar tabla (CSV o Excel)…</button>
        ${defecto ? `<button type="button" class="secundario" data-accion="restaurar-tabla">↺ Volver a la tabla de la unidad</button>` : ""}
        <button type="button" class="secundario chico" data-accion="tabla-mas">➕ Agregar fila</button>
        <button type="button" class="secundario chico" data-accion="tabla-menos" ${e.tabla.length > 1 ? "" : "disabled"}>➖ Quitar la última</button>
      </div>
      <div class="paes-tabla-grilla">`;
    e.tabla.forEach((p, i) => {
      h += `<label class="paes-tabla-celda"><span>${i}</span><input type="number" data-tabla="${i}" min="0" max="1000" value="${p == null ? "" : p}" /></label>`;
    });
    h += `</div><p class="paes-nota">Puntaje referencial, no oficial. Esta tabla es una copia propia de este ensayo: cambiarla aquí no afecta a los demás.</p></div>`;
    h += `<div class="paes-siguiente"><button type="button" data-paso="hojas">Seguir: subir las hojas →</button></div>`;
    return h;
  }

  async function guardarEnsayoNuevo() {
    const c = cursoActual();
    if (!c) return;
    const prueba = raiz.querySelector("#paes-ens-prueba").value;
    const pruebaNombre = prueba === "OTRA" ? raiz.querySelector("#paes-ens-nombre").value.replace(/\s+/g, " ").trim() : "";
    if (prueba === "OTRA" && !pruebaNombre) {
      toast("Escribe el nombre de la prueba.");
      return;
    }
    const def = L.PRUEBAS_PAES[prueba] || { preguntas: 65, alternativas: 4 };
    const e = {
      id: PaesDB.nuevoId("en"),
      cursoId: c.id,
      prueba,
      pruebaNombre,
      forma: raiz.querySelector("#paes-ens-forma").value.trim(),
      fecha: raiz.querySelector("#paes-ens-fecha").value || "",
      alternativas: def.alternativas,
      plantilla: PLANTILLA_PAES_POR_DEFECTO,
      clave: Array.from({ length: def.preguntas }, (_, i) => ({ n: i + 1, r: "", valida: true })),
      claveVersion: 0,
      tabla: (L.TABLAS_PAES[prueba] || []).slice(),
      tablaVersion: 1,
      archivos: [],
      creado: new Date().toISOString(),
    };
    const elegido = est.clavijeros.find((k) => k.id === raiz.querySelector("#paes-ens-clavijero").value);
    let avisoClavijero = "";
    if (elegido && elegido.prueba === e.prueba && (elegido.pruebaNombre || "") === (e.pruebaNombre || "")) {
      e.clave = copiaClave(elegido.clave);
      e.alternativas = elegido.alternativas || e.alternativas;
      e.clavijeroId = elegido.id;
      e.claveVersion = 1;
      if (!e.forma && elegido.forma) e.forma = elegido.forma;
    } else if (elegido) avisoClavijero = ` Ese clavijero es de ${nombrePruebaDe(elegido)}: no se aplicó.`;
    // el mismo ensayo en los otros cursos que se trabajan juntos
    const tambien = Array.from(raiz.querySelectorAll("[data-ens-curso]:checked")).map((x) => est.cursos.find((k) => k.id === x.dataset.ensCurso)).filter(Boolean);
    if (tambien.length) e.grupoId = PaesDB.nuevoId("g");
    const gemelos = tambien.map((k) => Object.assign({}, e, { id: PaesDB.nuevoId("en"), cursoId: k.id, clave: copiaClave(e.clave), tabla: e.tabla.slice(), archivos: [] }));
    est.ensayos.push(e, ...gemelos);
    try {
      await PaesDB.ponerVarios([e].concat(gemelos).map((x) => ["ensayos", x]));
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar el ensayo: " + (err && err.message ? err.message : "error del guardado local"));
    }
    if (gemelos.length) avisoClavijero += ` Se creó también en ${plural(gemelos.length, "curso más", "cursos más")}.`;
    est.ensayoId = e.id;
    est.formEnsayo = false;
    if (e.clavijeroId || avisoClavijero) {
      est.resumenLectura = null;
      pintar();
      toast(e.clavijeroId ? `Ensayo creado con el clavijero «${elegido.nombre}».` + avisoClavijero : "Ensayo creado." + avisoClavijero);
      return;
    }
    est.resumenLectura = null;
    pintar();
    toast("Ensayo creado: ahora carga su clave");
  }

  function eliminarEnsayo() {
    const e = ensayoActual();
    if (!e) return;
    const n = hojasDelEnsayo(e.id).length;
    confirmar({
      titulo: "Eliminar el ensayo",
      texto: `Se va a eliminar el ensayo «${etiquetaEnsayo(e)}» con su clave, su tabla y ${plural(n, "hoja leída", "hojas leídas")} (incluidas sus imágenes). Esto no se puede deshacer.`,
      textoBoton: "Eliminar el ensayo",
      onConfirmar: async () => {
        await PaesDB.borrarEnsayo(e.id);
        est.hojas = est.hojas.filter((h) => h.ensayoId !== e.id);
        est.ensayos = est.ensayos.filter((k) => k.id !== e.id);
        est.ensayoId = null;
        pintar();
        toast("Ensayo eliminado");
      },
    });
  }

  // cambia la clave completa (importada o escrita) y deja registro
  async function reemplazarClave(e, nueva, origen) {
    const max = nueva.reduce((a, k) => Math.max(a, k.n), 0);
    const porN = new Map(nueva.map((k) => [k.n, k]));
    const antes = e.clave.map((k) => (k.r || "-") + (k.valida ? "" : "*")).join("");
    e.clave = Array.from({ length: Math.min(100, Math.max(max, 1)) }, (_, i) => {
      const k = porN.get(i + 1);
      return { n: i + 1, r: k ? k.r : "", valida: k ? k.valida : true };
    });
    if (e.clave.some((k) => k.r === "E")) e.alternativas = 5;
    e.claveVersion = (e.claveVersion || 0) + 1;
    await guardar("ensayos", e);
    auditar(e.id, null, "clave (" + origen + ")", antes, e.clave.map((k) => (k.r || "-") + (k.valida ? "" : "*")).join(""));
    await propagarClave(e);
  }

  async function importarClave(archivo) {
    const e = ensayoActual();
    if (!e) return;
    try {
      const r = L.leerClave(await filasDeArchivo(archivo));
      if (!r.clave.length) {
        toast(r.avisos[0] || "No se encontró una clave en el archivo.");
        return;
      }
      await reemplazarClave(e, r.clave, "archivo " + archivo.name);
      est.pegarClave = false;
      pintar();
      toast(`Clave cargada: ${plural(r.clave.length, "respuesta", "respuestas")}${r.avisos.length ? " · " + r.avisos[0] : ""}`);
    } catch (err) {
      console.error(err);
      toast("No se pudo leer la clave. ¿Es un CSV o un Excel?");
    }
  }

  async function aplicarClaveEscrita() {
    const e = ensayoActual();
    const r = L.claveDesdeTexto(raiz.querySelector("#paes-clave-texto").value);
    if (!r.clave.length) {
      toast(r.avisos[0] || "Escribe una letra por pregunta.");
      return;
    }
    await reemplazarClave(e, r.clave, "escrita a mano");
    est.pegarClave = false;
    pintar();
    toast(`Clave cargada: ${plural(r.clave.length, "respuesta", "respuestas")}`);
  }

  async function importarTabla(archivo) {
    const e = ensayoActual();
    if (!e) return;
    try {
      const r = L.leerTabla(await filasDeArchivo(archivo));
      if (!r.tabla.length) {
        toast(r.avisos[0] || "No se encontró una tabla en el archivo.");
        return;
      }
      await cambiarTabla(e, r.tabla, "archivo " + archivo.name);
      pintar();
      toast(`Tabla cargada: de 0 a ${r.tabla.length - 1} correctas${r.avisos.length ? " · " + r.avisos[0] : ""}`);
    } catch (err) {
      console.error(err);
      toast("No se pudo leer la tabla. ¿Es un CSV o un Excel?");
    }
  }

  async function cambiarTabla(e, tabla, origen) {
    const antes = e.tabla.join(",");
    e.tabla = tabla;
    e.tablaVersion = (e.tablaVersion || 1) + 1;
    await guardar("ensayos", e);
    auditar(e.id, null, "tabla de conversión (" + origen + ")", antes, tabla.join(","));
    // los ensayos creados junto con este, si tenían la misma tabla (o ninguna), reciben la nueva
    const iguales = hermanos(e).filter((x) => !x.tabla.length || x.tabla.join(",") === antes);
    iguales.forEach((x) => {
      x.tabla = tabla.slice();
      x.tablaVersion = (x.tablaVersion || 1) + 1;
      auditar(x.id, null, "tabla de conversión (" + origen + ", del ensayo que se corrige junto)", antes, tabla.join(","));
    });
    if (iguales.length) await PaesDB.ponerVarios(iguales.map((x) => ["ensayos", x]));
  }

  // ============================================================ PASO 3 · subir hojas

  function htmlProgreso() {
    const p = est.lectura;
    if (!p) return "";
    const pct = p.total ? Math.round((p.hecho / p.total) * 100) : 0;
    return `<div class="paes-progreso">
      <div class="paes-progreso-texto"><b>${p.cancelar ? "Deteniendo…" : `Leyendo hoja ${Math.min(p.hecho + 1, p.total || 1)} de ${p.total || "…"}`}</b> <span>${esc(p.archivo || "")}</span></div>
      <div class="paes-barra"><div style="width:${pct}%"></div></div>
      <div class="paes-progreso-pie"><span>Puedes seguir usando la app mientras tanto.</span><button type="button" class="secundario chico" data-accion="cancelar-lectura" ${p.cancelar ? "disabled" : ""}>Detener</button></div>
    </div>`;
  }

  function htmlResumenLectura() {
    const r = est.resumenLectura;
    if (!r || r.ensayoId !== est.ensayoId) return "";
    const partes = [];
    if (r.leidas) partes.push(`<b>${plural(r.leidas, "hoja leída", "hojas leídas")}</b> en ${numero(r.segundos, 1)} s`);
    if (r.exactas) partes.push(`${plural(r.exactas, "vinculada sola", "vinculadas solas")} por RUT`);
    if (r.pendientes) partes.push(`<span class="paes-falta">${plural(r.pendientes, "por vincular a mano", "por vincular a mano")}</span>`);
    if (r.ilegibles) partes.push(`<span class="paes-falta">${plural(r.ilegibles, "ilegible", "ilegibles")}</span>`);
    if (r.repetidas) partes.push(`${plural(r.repetidas, "repetida que no se contó", "repetidas que no se contaron")}`);
    Object.keys(r.aOtros || {}).forEach((id) => {
      const k = est.cursos.find((x) => x.id === id);
      if (k) partes.push(`<b>${plural(r.aOtros[id], "hoja era", "hojas eran")} de ${esc(etiquetaCurso(k))}</b> y ${r.aOtros[id] === 1 ? "quedó" : "quedaron"} en ese curso`);
    });
    return `<div class="paes-resumen-lectura">${partes.length ? `<p>${partes.join(" · ")}</p>` : ""}${htmlAvisos(r.avisos, "amarillo")}
      ${r.leidas ? `<div class="acciones-form" style="margin-top:8px;"><button type="button" data-paso="revision">Ir a la revisión →</button></div>` : ""}</div>`;
  }

  function htmlPasoHojas() {
    const c = cursoActual();
    const e = ensayoActual();
    const hojas = hojasDelEnsayo(e.id);
    const avisos = [];
    if (!c.estudiantes.length) avisos.push("El curso aún no tiene lista: las hojas se leerán igual, pero quedarán sin vincular hasta que subas la lista (paso 1).");
    if (!e.clave.some((k) => k.r)) avisos.push("El ensayo aún no tiene clave: las hojas se leerán igual, y los puntajes aparecerán cuando la cargues (paso 2).");
    let h = `<div class="tarjeta">
      <h2>Subir las hojas de respuesta</h2>
      <p class="ayuda">Sube los PDF del escáner (una hoja por página) o imágenes sueltas. La app endereza cada hoja, lee el RUT y las respuestas, la vincula con la lista y la corrige. Si subes dos veces el mismo archivo o la misma hoja, no se cuenta dos veces.</p>
      ${hermanos(e).length ? `<p class="paes-nota">Este ensayo se corrige junto con ${esc(hermanos(e).map((x) => est.cursos.find((k) => k.id === x.cursoId)).filter(Boolean).map(etiquetaCurso).join(", "))}: puedes subir aquí las hojas de todos esos cursos, en uno o varios archivos. Cada hoja se va sola a su curso por el RUT.</p>` : ""}
      ${htmlAvisos(avisos, "amarillo")}
      <div class="paes-zona-subir">
        <input type="file" data-archivo="hojas" accept=".pdf,image/*" multiple style="display:none;" />
        <button type="button" data-accion="elegir-hojas" ${est.lectura ? "disabled" : ""}>📤 Elegir PDF o imágenes…</button>
        <span class="ayuda" style="margin:0;">o arrastra los archivos hasta aquí</span>
      </div>
      <div id="paes-progreso">${htmlProgreso()}</div>
      ${est.lectura ? "" : htmlResumenLectura()}
    </div>`;
    // archivos subidos
    const grupos = new Map();
    hojas.forEach((x) => {
      const k = x.huellaArchivo || x.archivo;
      if (!grupos.has(k)) grupos.set(k, { clave: k, nombre: x.archivo, hojas: [] });
      grupos.get(k).hojas.push(x);
    });
    if (grupos.size) {
      const adv = advertenciasDelEnsayo(e);
      h += `<div class="tarjeta"><h2 style="font-size:16px;">Archivos de este ensayo</h2>
        <div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>Archivo</th><th>Hojas</th><th>Listas</th><th>Por revisar</th><th>Subido</th><th></th></tr></thead><tbody>`;
      grupos.forEach((g) => {
        const estados = g.hojas.map((x) => estadoDeHoja(x, adv.get(x.id) || []));
        const registro = [e].concat(hermanos(e)).reduce((a, x) => a.concat(x.archivos || []), []).find((a) => a.huella === g.clave);
        h += `<tr><td>${esc(g.nombre)}</td><td class="num">${g.hojas.length}</td><td class="num">${estados.filter((s) => s === "ok").length}</td>
          <td class="num">${estados.filter((s) => s === "revisar" || s === "ilegible").length || "—"}</td>
          <td>${registro ? esc(PaesExcel.fechaCorta(registro.fecha)) : "incompleto"}</td>
          <td class="acciones"><button type="button" class="chico peligro" data-accion="quitar-archivo" data-clave="${esc(g.clave)}" ${est.lectura ? "disabled" : ""}>🗑 Quitar</button></td></tr>`;
      });
      h += `</tbody></table></div></div>`;
    }
    return h;
  }

  function pintarProgreso() {
    const el = raiz && raiz.querySelector("#paes-progreso");
    if (el) el.innerHTML = htmlProgreso();
  }

  // Lee los archivos y guarda cada hoja apenas se lee. Corre de a una página, cediendo el
  // turno a la pantalla entre hoja y hoja: la app sigue respondiendo mientras tanto.
  async function subirHojas(archivos) {
    const ensayo = ensayoActual();
    const curso = cursoActual();
    if (!ensayo || !curso || est.lectura) return;
    const validos = archivos.filter((a) => /\.pdf$/i.test(a.name) || /^image\//.test(a.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(a.name));
    const resumen = { ensayoId: ensayo.id, leidas: 0, exactas: 0, pendientes: 0, ilegibles: 0, repetidas: 0, avisos: [], segundos: 0, aOtros: {} };
    const idsGrupo = new Set([ensayo.id].concat(hermanos(ensayo).map((x) => x.id)));
    if (validos.length < archivos.length) resumen.avisos.push(`${plural(archivos.length - validos.length, "archivo no es", "archivos no son")} PDF ni imagen y no se ${archivos.length - validos.length === 1 ? "leyó" : "leyeron"}.`);
    if (!validos.length) {
      est.resumenLectura = resumen;
      pintar();
      return;
    }
    const progreso = (est.lectura = { hecho: 0, total: 0, archivo: "", cancelar: false });
    est.resumenLectura = null;
    pintar();
    const t0 = performance.now();
    const plantilla = plantillaDe(ensayo);
    const nPreg = ensayo.clave.length;
    try {
      for (const archivo of validos) {
        if (progreso.cancelar) break;
        progreso.archivo = archivo.name;
        pintarProgreso();
        let abierto;
        try {
          abierto = await PaesPdf.abrirArchivo(archivo);
        } catch (err) {
          console.error(err);
          resumen.avisos.push(`«${archivo.name}» no se pudo abrir: ${err && err.message ? err.message : "archivo dañado o protegido"}`);
          continue;
        }
        if ((ensayo.archivos || []).some((a) => a.huella === abierto.huella)) {
          resumen.avisos.push(`«${archivo.name}» ya se había subido a este ensayo: no se cargó de nuevo.`);
          await abierto.cerrar();
          continue;
        }
        progreso.total += abierto.paginas;
        let completo = true;
        for (let p = 1; p <= abierto.paginas; p++) {
          if (progreso.cancelar) {
            completo = false;
            break;
          }
          progreso.archivo = `${archivo.name} · página ${p} de ${abierto.paginas}`;
          pintarProgreso();
          await ceder();
          const delEnsayo = est.hojas.filter((h) => idsGrupo.has(h.ensayoId)); // incluye los cursos que se corrigen juntos
          let leida, huella;
          try {
            const pagina = await abierto.pagina(p);
            huella = PaesPdf.huellaDePagina(pagina);
            if (delEnsayo.some((h) => h.huella === huella)) {
              resumen.repetidas++; // la misma imagen ya está en el ensayo: no se vuelve a leer
              progreso.hecho++;
              continue;
            }
            leida = PaesPdf.leerPagina(pagina, plantilla);
          } catch (err) {
            console.error(err);
            resumen.avisos.push(`«${archivo.name}», página ${p}: no se pudo leer (${err && err.message ? err.message : "error"}).`);
            progreso.hecho++;
            continue;
          }
          progreso.hecho++;
          const hoja = {
            id: PaesDB.nuevoId("h"),
            ensayoId: ensayo.id,
            cursoId: curso.id,
            archivo: archivo.name,
            huellaArchivo: abierto.huella,
            pagina: p,
            huella,
            creada: new Date().toISOString(),
            estado: leida.legible ? "ok" : "ilegible",
            excluida: false,
            repetidaDe: null,
            revisada: false,
            lectura: leida.lectura,
            ediciones: { respuestas: {} },
            estudianteId: null,
            asignacion: null,
            vinculo: null,
          };
          if (leida.legible) {
            // misma hoja escaneada dos veces: mismo RUT y mismas respuestas
            const id = hoja.lectura.id;
            const gemela = id && !id.includes("?") ? delEnsayo.find((h) => vigente(h) && h.lectura.id === id && h.lectura.resp.slice(0, nPreg) === hoja.lectura.resp.slice(0, nPreg)) : null;
            if (gemela) {
              hoja.repetidaDe = gemela.id;
              resumen.repetidas++;
            } else {
              const v = vincular(hoja, curso);
              if (!hoja.estudianteId && v.tipo === "otro-curso") {
                // el RUT es de un curso que se corrige junto con este: la hoja se va sola a ese curso
                const destino = hermanos(ensayo).find((x) => v.otroCurso.some((o) => o.cursoId === x.cursoId));
                const cursoDestino = destino ? est.cursos.find((k) => k.id === destino.cursoId) : null;
                if (cursoDestino) {
                  hoja.ensayoId = destino.id;
                  hoja.cursoId = cursoDestino.id;
                  vincular(hoja, cursoDestino);
                  resumen.aOtros[cursoDestino.id] = (resumen.aOtros[cursoDestino.id] || 0) + 1;
                }
              }
              if (hoja.estudianteId) resumen.exactas++;
              else resumen.pendientes++;
            }
          } else {
            resumen.ilegibles++;
          }
          await PaesDB.ponerVarios([
            ["hojas", hoja],
            ["imagenes", { hojaId: hoja.id, ensayoId: hoja.ensayoId, pagina: leida.imagenes.pagina, nombre: leida.imagenes.nombre }],
          ]);
          est.hojas.push(hoja);
          resumen.leidas++;
        }
        await abierto.cerrar();
        if (completo) {
          ensayo.archivos = (ensayo.archivos || []).concat([{ nombre: archivo.name, huella: abierto.huella, paginas: abierto.paginas, fecha: new Date().toISOString() }]);
          await PaesDB.poner("ensayos", ensayo);
        }
      }
    } catch (err) {
      console.error(err);
      resumen.avisos.push("La lectura se interrumpió: " + (err && err.message ? err.message : "error inesperado") + ". Lo ya leído quedó guardado.");
    }
    if (progreso.cancelar) resumen.avisos.push("Detuviste la lectura: lo ya leído quedó guardado. Puedes volver a subir el archivo y la app solo leerá las hojas que faltan.");
    resumen.segundos = (performance.now() - t0) / 1000;
    est.lectura = null;
    est.resumenLectura = resumen;
    pintar();
  }

  function quitarArchivo(clave) {
    const e = ensayoActual();
    if (!e) return;
    const hojas = hojasDelEnsayo(e.id).filter((h) => (h.huellaArchivo || h.archivo) === clave);
    if (!hojas.length) return;
    confirmar({
      titulo: "Quitar el archivo",
      texto: `Se van a eliminar las ${plural(hojas.length, "hoja", "hojas")} de «${hojas[0].archivo}» de este ensayo, con sus imágenes y las correcciones hechas a mano. Esto no se puede deshacer.`,
      textoBoton: "Quitar el archivo y sus hojas",
      onConfirmar: async () => {
        const ids = new Set(hojas.map((h) => h.id));
        await PaesDB.borrarHojas(Array.from(ids));
        est.hojas = est.hojas.filter((h) => !ids.has(h.id));
        // una hoja que era «repetida» de otra eliminada deja de serlo
        const huerfanas = est.hojas.filter((h) => h.repetidaDe && ids.has(h.repetidaDe));
        huerfanas.forEach((h) => (h.repetidaDe = null));
        e.archivos = (e.archivos || []).filter((a) => a.huella !== clave);
        await PaesDB.ponerVarios([["ensayos", e]].concat(huerfanas.map((h) => ["hojas", h])));
        auditar(e.id, null, "archivo quitado", `${hojas[0].archivo} (${hojas.length} hojas)`, "");
        est.resumenLectura = null;
        pintar();
        toast("Archivo quitado del ensayo");
      },
    });
  }

  // ============================================================ PASO 4 · revisión

  const ETIQUETA_ESTADO = {
    ok: "✓ Lista",
    revisar: "⚠ Por revisar",
    ilegible: "✖ Ilegible",
    "ilegible-vista": "✖ Ilegible (vista)",
    repetida: "⧉ Repetida",
    excluida: "🚫 Excluida",
  };

  // cómo se muestra el RUT que el estudiante marcó en la hoja
  function htmlIdLeido(id) {
    const estado = L.estadoDelId(id);
    if (estado === "vacio") return `<span class="paes-chip amarillo">no marcó su RUT</span>`;
    const texto = estado === "valido" ? L.formatearRutPaes(id) : id;
    const chip = {
      valido: `<span class="paes-chip verde">válido</span>`,
      "sin-dv": `<span class="paes-chip gris">sin dígito verificador</span>`,
      invalido: `<span class="paes-chip amarillo">no es un RUT válido</span>`,
      incompleto: `<span class="paes-chip amarillo">incompleto</span>`,
      ambiguo: `<span class="paes-chip amarillo">«?» = columna con dos marcas o sin marca</span>`,
    }[estado];
    return `<code class="paes-id">${esc(texto)}</code> ${chip || ""}`;
  }

  function htmlPasoRevision() {
    const c = cursoActual();
    const e = ensayoActual();
    const hojas = hojasDelEnsayo(e.id);
    if (!hojas.length) {
      return `<div class="tarjeta"><h2>Revisión</h2><p class="ayuda">Aún no hay hojas en este ensayo.</p><div class="acciones-form"><button type="button" data-paso="hojas">← Subir las hojas</button></div></div>`;
    }
    const adv = advertenciasDelEnsayo(e);
    const cuenta = contarEstados(e);
    const porId = new Map(c.estudiantes.map((x) => [x.id, x]));
    const conHoja = new Map();
    hojas.filter(vigente).forEach((x) => x.estudianteId && conHoja.set(x.estudianteId, (conHoja.get(x.estudianteId) || 0) + 1));
    const hayClave = e.clave.some((k) => k.r);
    const opcionesEstudiantes = estudiantesOrdenados(c);
    const otros = otrosEstudiantes(c.id);
    let h = `<div class="tarjeta">
      <h2>Revisión de las hojas</h2>
      <p class="ayuda">La app ya leyó, vinculó y corrigió. Aquí decides solo lo que quedó en duda: a quién corresponde una hoja, si se cuenta o no. Lo pendiente está en amarillo; cuando lo resuelvas, márcalo como revisado.</p>
      <div class="paes-cuenta">
        <span class="paes-chip">${plural(cuenta.total, "hoja", "hojas")}</span>
        <span class="paes-chip verde">${cuenta.ok} ${cuenta.ok === 1 ? "lista" : "listas"}</span>
        ${cuenta.revisar ? `<span class="paes-chip amarillo">${cuenta.revisar} por revisar</span>` : ""}
        ${cuenta.ilegible ? `<span class="paes-chip rojo">${plural(cuenta.ilegible, "ilegible", "ilegibles")}</span>` : ""}
        ${cuenta.repetida ? `<span class="paes-chip gris">${plural(cuenta.repetida, "repetida", "repetidas")}</span>` : ""}
        ${cuenta.excluida ? `<span class="paes-chip gris">${plural(cuenta.excluida, "excluida", "excluidas")}</span>` : ""}
        <label class="paes-filtro"><input type="checkbox" data-cambio="solo-revisar" ${est.soloPorRevisar ? "checked" : ""} /> Solo por revisar</label>
      </div>
      <div class="acciones-form" style="margin-top:12px;">
        <button type="button" class="secundario chico" data-accion="deshacer" ${est.deshacer.length ? "" : "disabled"}>↩ Deshacer el último cambio</button>
        <button type="button" class="secundario chico" data-accion="historial">🕓 Historial de cambios</button>
        <button type="button" class="${est.verSinHoja ? "" : "secundario "}chico" data-accion="ver-sin-hoja">👥 Estudiantes que aún no tienen hoja (${opcionesEstudiantes.filter((s) => !conHoja.get(s.id)).length})</button>
      </div>
      ${est.verSinHoja ? htmlSinHoja(opcionesEstudiantes.filter((s) => !conHoja.get(s.id))) : ""}
      <datalist id="paes-dl-estudiantes">${opcionesEstudiantes.map((s) => `<option value="${esc(textoEstudiante(s))}">${conHoja.get(s.id) ? "ya tiene hoja" : "sin hoja"}</option>`).join("")}</datalist>
    </div>`;
    let mostradas = 0;
    hojas.forEach((x, i) => {
      const avisos = adv.get(x.id) || [];
      const estado = estadoDeHoja(x, avisos);
      if (est.soloPorRevisar && estado !== "revisar" && estado !== "ilegible") return;
      mostradas++;
      const alumno = x.estudianteId ? porId.get(x.estudianteId) : null;
      let puntaje = "";
      if (vigente(x) && hayClave) {
        const cor = L.corregirHoja(x, e.clave);
        const p = L.puntajeDe(cor.correctas, e.tabla);
        puntaje = `<span class="paes-hoja-puntaje"><b>${cor.correctas}</b> correctas · ${p == null ? `<span class="paes-falta">sin tabla</span>` : `<b>${p}</b> puntos`}</span>`;
      }
      h += `<div class="paes-hoja estado-${estado}" id="paes-hoja-${esc(x.id)}">
        <div class="paes-hoja-cab">
          <span class="paes-estado">${ETIQUETA_ESTADO[estado]}</span>
          <b>Hoja ${i + 1}</b><small>${esc(x.archivo)} · pág. ${x.pagina}</small>${puntaje}
        </div>
        <div class="paes-hoja-cuerpo">
          <button type="button" class="paes-recorte" data-accion="ver-hoja" data-id="${esc(x.id)}" title="Ver la hoja completa">
            <img data-imagen="${esc(x.id)}:${x.estado === "ilegible" ? "pagina" : "nombre"}" alt="Lo que el estudiante escribió a mano en la hoja" /></button>
          <div class="paes-hoja-datos">`;
      if (x.estado !== "ilegible") {
        h += `<div class="paes-linea"><span class="paes-etq">RUT marcado</span> ${htmlIdLeido(x.lectura.id)}</div>`;
        if (!x.repetidaDe) {
          h += `<div class="paes-linea"><span class="paes-etq">Estudiante</span>
            <input type="search" class="paes-buscar" data-buscar="${esc(x.id)}" list="paes-dl-estudiantes" placeholder="Buscar por nombre o RUT…" autocomplete="off" ${x.excluida ? "disabled" : ""} />
            <select data-asignar="${esc(x.id)}" ${x.excluida ? "disabled" : ""}>
              <option value="">— Sin identificar —</option>
              ${opcionesEstudiantes.map((s) => `<option value="${esc(s.id)}" ${s.id === x.estudianteId ? "selected" : ""}>${esc(s.apellidos)}${s.apellidos ? ", " : ""}${esc(s.nombres)}${s.rut ? " · " + esc(L.formatearRutPaes(s.rut)) : ""}${conHoja.get(s.id) && s.id !== x.estudianteId ? " · ya tiene hoja" : ""}</option>`).join("")}
            </select>
            ${alumno ? `<span class="paes-chip ${x.asignacion === "exacta" ? "verde" : "azul"}">${x.asignacion === "exacta" ? "RUT exacto" : x.asignacion === "sugerida" ? "sugerencia confirmada" : "asignada a mano"}</span>` : ""}
          </div>`;
          if (!alumno && !x.excluida && hermanos(e).length) {
            h += `<div class="paes-candidatos"><span>¿La hoja es de otro de los cursos que corriges juntos?</span>${hermanos(e).map((y) => est.cursos.find((k) => k.id === y.cursoId)).filter(Boolean).map((k) => `<button type="button" class="secundario chico" data-accion="mover-hoja" data-id="${esc(x.id)}" data-curso="${esc(k.id)}">Pasarla a ${esc(etiquetaCurso(k))}</button>`).join("")}</div>`;
          }
          if (!alumno && !x.excluida) {
            const v = L.vincularHoja(x.lectura.id, c.estudiantes, otros, new Set(conHoja.keys()));
            if (v.tipo === "otro-curso") {
              const destino = est.cursos.find((k) => k.id === v.otroCurso[0].cursoId);
              const quien = destino ? destino.estudiantes.find((s) => s.id === v.otroCurso[0].estudianteId) : null;
              if (destino && quien) {
                h += `<div class="paes-candidatos"><span>Este RUT es de <b>${esc(L.nombreCompletoPaes(quien))}</b>, de ${esc(destino.colegio)} · ${esc(etiquetaCurso(destino))}.</span>
                  <button type="button" class="secundario chico" data-accion="mover-hoja" data-id="${esc(x.id)}" data-curso="${esc(destino.id)}">Mover la hoja a ese curso</button></div>`;
              }
            } else if (v.candidatos.length) {
              const titulo = v.tipo === "sugerida" ? "Parecidos al RUT marcado:" : "Estudiantes del curso que aún no tienen hoja:";
              h += `<div class="paes-candidatos"><span>${titulo}</span>${v.candidatos.slice(0, v.tipo === "sugerida" ? 4 : 8).map((k) => {
                const s = porId.get(k.estudianteId);
                return s ? `<button type="button" class="secundario chico" data-accion="asignar" data-id="${esc(x.id)}" data-est="${esc(s.id)}" data-modo="${v.tipo === "sugerida" ? "sugerida" : "manual"}" title="${esc(L.formatearRutPaes(s.rut))}">${esc(L.nombreCompletoPaes(s))}${k.distancia != null ? ` <small>(${esc(k.motivo)}${k.confianza === "media" ? ", confianza media" : ""})</small>` : ""}</button>` : "";
              }).join("")}${v.tipo !== "sugerida" && v.candidatos.length > 8 ? `<small>y ${v.candidatos.length - 8} más en la lista de arriba</small>` : ""}</div>`;
            }
          }
          if (!alumno && !x.excluida) h += htmlAgregarManual(x);
        } else {
          const n = hojas.findIndex((k) => k.id === x.repetidaDe) + 1;
          h += `<div class="paes-linea">Es la misma hoja que la <b>Hoja ${n || "?"}</b> (mismo RUT y mismas respuestas): no se cuenta dos veces.</div>`;
        }
      }
      if (avisos.length) h += `<ul class="paes-advertencias">${avisos.map((a) => `<li>${esc(a.detalle)}</li>`).join("")}</ul>`;
      h += `<div class="paes-hoja-acciones">
            <button type="button" class="secundario chico" data-accion="ver-hoja" data-id="${esc(x.id)}">${x.estado === "ilegible" ? "👁 Ver la hoja" : "👁 Ver y corregir respuestas"}</button>`;
      if (x.estado === "ilegible" && !x.excluida) h += `<button type="button" class="secundario chico" data-accion="ingresar-a-mano" data-id="${esc(x.id)}">✍ Ingresar respuestas a mano</button>`;
      if (x.repetidaDe) h += `<button type="button" class="secundario chico" data-accion="no-repetida" data-id="${esc(x.id)}">No es repetida: contarla</button>`;
      else if (x.excluida) h += `<button type="button" class="secundario chico" data-accion="incluir" data-id="${esc(x.id)}">↩ Volver a incluir</button>`;
      else {
        if (avisos.length || x.estado === "ilegible") h += `<button type="button" class="${x.revisada ? "secundario " : ""}chico" data-accion="revisada" data-id="${esc(x.id)}">${x.revisada ? "↩ Quitar «revisada»" : "✓ Marcar como revisada"}</button>`;
        if (x.estado !== "ilegible") h += `<button type="button" class="secundario chico" data-accion="excluir" data-id="${esc(x.id)}">🚫 No contar esta hoja</button>`;
      }
      h += `</div></div></div></div>`;
    });
    if (!mostradas) h += `<div class="tarjeta"><p class="ayuda" style="margin:0;">No queda nada por revisar. 🎉</p></div>`;
    h += `<div class="paes-siguiente"><button type="button" data-paso="resultados">Seguir: resultados →</button></div>`;
    return h;
  }

  async function asignarHoja(hojaId, estudianteId, modo) {
    const h = est.hojas.find((x) => x.id === hojaId);
    if (!h) return;
    const antes = h.estudianteId;
    if ((antes || null) === (estudianteId || null)) return;
    est.deshacer.push({ tipo: "hoja", hojaId, campo: "estudiante asignado", antes: { estudianteId: h.estudianteId, asignacion: h.asignacion } });
    h.estudianteId = estudianteId || null;
    h.asignacion = estudianteId ? modo || "manual" : null;
    await guardar("hojas", h);
    const c = cursoActual();
    const nombre = (id) => {
      const s = c && c.estudiantes.find((k) => k.id === id);
      return s ? L.nombreCompletoPaes(s) + (s.rut ? " (" + s.rut + ")" : "") : "";
    };
    auditar(h.ensayoId, h.id, "estudiante asignado", nombre(antes), nombre(estudianteId));
    pintar();
    toast(estudianteId ? "Hoja asignada" : "La hoja quedó sin identificar");
  }

  async function cambiarHoja(hojaId, cambios, campo, mensaje) {
    const h = est.hojas.find((x) => x.id === hojaId);
    if (!h) return;
    const antes = {};
    Object.keys(cambios).forEach((k) => (antes[k] = h[k]));
    Object.assign(h, cambios);
    await guardar("hojas", h);
    auditar(h.ensayoId, h.id, campo, JSON.stringify(antes), JSON.stringify(cambios));
    est.deshacer.push({ tipo: "hoja", hojaId, campo, antes });
    if (est.visor) pintarVisor();
    else pintar();
    if (mensaje) toast(mensaje);
  }

  // mueve una hoja al ensayo equivalente (misma prueba y forma) de otro curso
  async function moverHoja(hojaId, cursoId) {
    const h = est.hojas.find((x) => x.id === hojaId);
    const origen = ensayoActual();
    const destinoCurso = est.cursos.find((k) => k.id === cursoId);
    if (!h || !origen || !destinoCurso) return;
    const candidatos = ensayosDelCurso(cursoId).filter((e) => e.prueba === origen.prueba && (e.pruebaNombre || "") === (origen.pruebaNombre || ""));
    const destino = hermanos(origen).find((e) => e.cursoId === cursoId) || candidatos.find((e) => (e.forma || "") === (origen.forma || "")) || (candidatos.length === 1 ? candidatos[0] : null);
    if (!destino) {
      toast(`Primero crea en ${destinoCurso.colegio} · ${etiquetaCurso(destinoCurso)} un ensayo de ${nombrePrueba(origen)}: después podrás mover la hoja.`);
      return;
    }
    const img = await PaesDB.obtener("imagenes", h.id);
    h.ensayoId = destino.id;
    h.cursoId = cursoId;
    h.estudianteId = null;
    h.asignacion = null;
    vincular(h, destinoCurso);
    const pares = [["hojas", h]];
    if (img) pares.push(["imagenes", Object.assign(img, { ensayoId: destino.id })]);
    await PaesDB.ponerVarios(pares);
    auditar(origen.id, h.id, "hoja movida a otro curso", `${cursoActual().colegio} · ${etiquetaCurso(cursoActual())}`, `${destinoCurso.colegio} · ${etiquetaCurso(destinoCurso)}`);
    auditar(destino.id, h.id, "hoja recibida de otro curso", `${cursoActual().colegio} · ${etiquetaCurso(cursoActual())}`, "");
    pintar();
    toast(`Hoja movida a ${destinoCurso.colegio} · ${etiquetaCurso(destinoCurso)}`);
  }

  // ---- imágenes: se piden al guardado solo las que están en pantalla

  async function urlDeImagen(clave) {
    if (est.urls.has(clave)) return est.urls.get(clave);
    const [hojaId, tipo] = clave.split(":");
    const reg = await PaesDB.obtener("imagenes", hojaId);
    const blob = reg ? reg[tipo] || reg.pagina : null;
    const url = blob ? URL.createObjectURL(blob) : "";
    est.urls.set(clave, url);
    return url;
  }

  function cargarImagenes() {
    const imgs = Array.from(raiz.querySelectorAll("img[data-imagen]"));
    if (!imgs.length) return;
    const cargar = (img) =>
      urlDeImagen(img.dataset.imagen).then((url) => {
        if (url) img.src = url;
        else img.closest(".paes-recorte") && img.closest(".paes-recorte").classList.add("sin-imagen");
      });
    if (!("IntersectionObserver" in global)) {
      imgs.forEach(cargar);
      return;
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((en) => {
          if (!en.isIntersecting) return;
          obs.unobserve(en.target);
          cargar(en.target);
        });
      },
      { rootMargin: "600px" }
    );
    imgs.forEach((img) => obs.observe(img));
  }

  // ---- visor: la hoja con lo que la app leyó encima, para corregir mirando la imagen

  const COLOR_MARCA = { correcta: "#1f9d55", incorrecta: "#d93025", falto: "#1a73e8", doble: "#f29900", marcada: "#5b3b8c", novalida: "#888888" };

  function verHoja(hojaId) {
    est.visor = hojaId;
    pintarVisor();
  }

  function cerrarVisor() {
    est.visor = null;
    pintar();
  }

  // resultado de una pregunta de la hoja frente a la clave
  function estadoPregunta(h, k) {
    const r = L.respuestaVigente(h, k.n);
    let res;
    if (!k.r) res = r.estado === "ok" ? "marcada" : r.estado === "doble" ? "doble" : "omitida";
    else if (!k.valida) res = "novalida";
    else if (r.estado === "doble") res = "doble";
    else if (r.estado !== "ok") res = "omitida";
    else res = r.letras === k.r ? "correcta" : "incorrecta";
    return { r, res };
  }

  // círculos sobre la imagen: verde correcta, rojo incorrecta, azul la correcta que faltó,
  // naranja doble marca. Cada burbuja se puede pulsar para corregir la respuesta.
  function svgDeHoja(h, e) {
    const pl = plantillaDe(e);
    const def = pl.def;
    const f = 0.5;
    const corr = new Map((h.lectura.deltas || []).map((d) => [d[0], d]));
    const nAlt = Math.max(e.alternativas || 4, 4);
    let s = "";
    e.clave.forEach((k) => {
      const pos = def.preguntas[k.n];
      if (!pos) return;
      const d = corr.get("q" + Math.floor((k.n - 1) / (def.filasPorBloque || 10)));
      const { r, res } = estadoPregunta(h, k);
      pos.forEach(([x, y], i) => {
        const letra = L.LETRAS_PAES[i];
        const marcada = r.letras.includes(letra);
        let color = null, grosor = 3;
        if (marcada) color = COLOR_MARCA[res === "omitida" ? "marcada" : res];
        else if (k.valida && k.r === letra && (res === "incorrecta" || res === "omitida" || res === "doble")) color = COLOR_MARCA.falto;
        if (i >= nAlt && !marcada) return;
        const cx = ((x + (d ? d[1] : 0)) * f).toFixed(1), cy = ((y + (d ? d[2] : 0)) * f).toFixed(1);
        s += `<circle class="paes-burbuja${color ? " con-marca" : ""}" cx="${cx}" cy="${cy}" r="9.5" ${color ? `stroke="${color}" stroke-width="${grosor}" fill="${color}" fill-opacity="${marcada ? 0.18 : 0}"` : `fill="transparent"`} data-accion="resp" data-id="${esc(h.id)}" data-n="${k.n}" data-l="${letra}"><title>Pregunta ${k.n}, alternativa ${letra}${k.r ? ` · clave ${k.r}` : ""}</title></circle>`;
      });
    });
    return `<svg class="paes-capa" viewBox="0 0 ${def.ancho * f} ${def.alto * f}" preserveAspectRatio="none">${s}</svg>`;
  }

  function htmlPreguntas(h, e) {
    const nAlt = e.alternativas || 4;
    const letras = L.LETRAS_PAES.slice(0, nAlt).split("");
    return e.clave
      .map((k) => {
        const { r, res } = estadoPregunta(h, k);
        const extra = r.letras && !letras.includes(r.letras) && r.letras.length === 1 ? [r.letras] : [];
        const leida = h.lectura.resp ? h.lectura.resp[k.n - 1] : "-";
        return `<div class="paes-preg res-${res}${r.editada ? " editada" : ""}">
          <span class="paes-preg-n">${k.n}</span>
          ${letras.concat(extra).map((l) => `<button type="button" class="paes-alt${r.letras.includes(l) ? " sel" : ""}${k.r === l ? " es-clave" : ""}" data-accion="resp" data-id="${esc(h.id)}" data-n="${k.n}" data-l="${l}">${l}</button>`).join("")}
          <button type="button" class="paes-alt blanco${r.estado !== "ok" && r.estado !== "doble" ? " sel" : ""}" data-accion="resp" data-id="${esc(h.id)}" data-n="${k.n}" data-l="" title="Sin respuesta (omitida)">–</button>
          ${r.editada ? `<button type="button" class="paes-alt restaurar" data-accion="resp-leida" data-id="${esc(h.id)}" data-n="${k.n}" title="Volver a lo que leyó la app (${leida === "*" ? "doble marca" : leida === "-" || leida === "~" || !leida ? "sin marca" : leida})">↺</button>` : ""}
        </div>`;
      })
      .join("");
  }

  async function pintarVisor() {
    const visor = raiz.querySelector("#paes-visor");
    const h = est.hojas.find((x) => x.id === est.visor);
    const e = ensayoActual();
    const c = cursoActual();
    if (!visor || !h || !e || !c) return;
    const caja = visor.querySelector(".paes-visor-cuerpo");
    const scroll = { visor: visor.scrollTop, lista: caja ? caja.querySelector(".paes-pregs").scrollTop : 0 };
    const url = await urlDeImagen(h.id + ":pagina");
    if (est.visor !== h.id) return;
    const alumno = h.estudianteId ? c.estudiantes.find((s) => s.id === h.estudianteId) : null;
    const hayClave = e.clave.some((k) => k.r);
    const cor = L.corregirHoja(h, e.clave);
    const p = L.puntajeDe(cor.correctas, e.tabla);
    const editadas = Object.keys((h.ediciones && h.ediciones.respuestas) || {}).length;
    const legible = h.estado !== "ilegible";
    const avisos = (advertenciasDelEnsayo(e).get(h.id) || []).filter((a) => a.preguntas);
    const lista = hojasDelEnsayo(e.id);
    const pos = lista.findIndex((x) => x.id === h.id);
    visor.innerHTML = `<div class="modal-caja paes-visor-caja">
      <div class="paes-visor-cab">
        <div><b>Hoja ${pos + 1} de ${lista.length}</b> · ${alumno ? esc(L.nombreCompletoPaes(alumno)) : "<i>Sin identificar</i>"}<br><small>${esc(h.archivo)} · página ${h.pagina}${h.manual ? " · respuestas ingresadas a mano" : ""}</small></div>
        <div class="paes-visor-botones">
          ${legible && hayClave ? `<span class="paes-visor-puntaje"><b>${cor.correctas}</b> correctas · ${p == null ? "sin tabla" : `<b>${p}</b> puntos`}</span>` : ""}
          <button type="button" class="secundario chico" data-accion="visor-ir" data-id="${pos > 0 ? esc(lista[pos - 1].id) : ""}" ${pos > 0 ? "" : "disabled"}>← Anterior</button>
          <button type="button" class="secundario chico" data-accion="visor-ir" data-id="${pos < lista.length - 1 ? esc(lista[pos + 1].id) : ""}" ${pos < lista.length - 1 ? "" : "disabled"}>Siguiente →</button>
          <button type="button" class="secundario chico" data-accion="deshacer" ${est.deshacer.length ? "" : "disabled"}>↩ Deshacer</button>
          <button type="button" class="chico" data-accion="cerrar-visor">Cerrar ✕</button>
        </div>
      </div>
      ${legible ? `<div class="paes-leyenda"><span><i style="background:${COLOR_MARCA.correcta}"></i>Correcta</span><span><i style="background:${COLOR_MARCA.incorrecta}"></i>Incorrecta</span><span><i style="background:${COLOR_MARCA.falto}"></i>La correcta que faltó</span><span><i style="background:${COLOR_MARCA.doble}"></i>Doble marca</span><span class="paes-leyenda-nota">Pulsa una burbuja o una letra para corregir. Lo que leyó la app se conserva${editadas ? ` · <b>${plural(editadas, "respuesta editada", "respuestas editadas")}</b>` : ""}.</span></div>` : `<p class="paes-nota" style="margin:0 0 10px;">La app no pudo leer esta hoja. Puedes volver a escanearla o <button type="button" class="chico" data-accion="ingresar-a-mano" data-id="${esc(h.id)}">✍ ingresar sus respuestas a mano</button></p>`}
      ${avisos.length ? `<ul class="paes-advertencias">${avisos.map((a) => `<li>${esc(a.detalle)}</li>`).join("")}</ul>` : ""}
      <div class="paes-visor-cuerpo">
        <div class="paes-visor-imagen">${url ? `<img src="${url}" alt="Hoja de respuestas escaneada" />${legible && !h.manual ? svgDeHoja(h, e) : ""}` : `<p class="ayuda">La imagen de esta hoja ya no está guardada.</p>`}</div>
        <div class="paes-pregs">${legible ? htmlPreguntas(h, e) : ""}</div>
      </div>
    </div>`;
    visor.style.display = "flex";
    visor.scrollTop = scroll.visor;
    const nueva = visor.querySelector(".paes-pregs");
    if (nueva) nueva.scrollTop = scroll.lista;
  }

  // Edición manual de una respuesta. letra: "A".."E", "" (sin respuesta) o null (volver a
  // lo que leyó la app). Lo leído nunca se toca: la edición se guarda aparte.
  async function editarRespuesta(hojaId, n, letra, opciones) {
    const h = est.hojas.find((x) => x.id === hojaId);
    if (!h) return;
    if (!h.ediciones) h.ediciones = { respuestas: {} };
    const eds = h.ediciones.respuestas;
    const antes = eds[n];
    const vigenteAntes = L.respuestaVigente(h, n);
    // pulsar la alternativa que ya está elegida la deja sin respuesta
    if (letra !== null && !(opciones && opciones.exacto) && vigenteAntes.estado === "ok" && vigenteAntes.letras === letra && letra !== "") letra = "";
    if (letra === null) delete eds[n];
    else eds[n] = letra;
    const vigenteDespues = L.respuestaVigente(h, n);
    if (vigenteAntes.estado === vigenteDespues.estado && vigenteAntes.letras === vigenteDespues.letras && antes === eds[n]) return;
    if (!(opciones && opciones.sinHistorial)) est.deshacer.push({ tipo: "respuesta", hojaId, n, antes });
    const texto = (r) => (r.estado === "ok" ? r.letras : r.estado === "doble" ? "doble marca (" + r.letras + ")" : "sin respuesta");
    await guardar("hojas", h);
    auditar(h.ensayoId, h.id, `respuesta de la pregunta ${n}${opciones && opciones.sinHistorial ? " (deshacer)" : ""}`, texto(vigenteAntes), texto(vigenteDespues));
    if (est.visor) pintarVisor();
    else pintar();
  }

  async function deshacerUltimo() {
    const u = est.deshacer.pop();
    if (!u) return;
    if (u.tipo === "respuesta") {
      await editarRespuesta(u.hojaId, u.n, u.antes === undefined ? null : u.antes, { sinHistorial: true, exacto: true });
    } else if (u.tipo === "hoja") {
      const h = est.hojas.find((x) => x.id === u.hojaId);
      if (h) {
        const ahora = {};
        Object.keys(u.antes).forEach((k) => (ahora[k] = h[k]));
        Object.assign(h, u.antes);
        await guardar("hojas", h);
        auditar(h.ensayoId, h.id, u.campo + " (deshacer)", JSON.stringify(ahora), JSON.stringify(u.antes));
      }
      if (est.visor) pintarVisor();
      else pintar();
    }
    toast("Se deshizo el último cambio");
  }

  // historial de cambios del ensayo (auditoría): qué cambió, cuándo, de qué valor a cuál
  async function verHistorial() {
    const visor = raiz.querySelector("#paes-visor");
    const e = ensayoActual();
    if (!visor || !e) return;
    let filas = [];
    try {
      filas = await PaesDB.porIndice("auditoria", "ensayoId", e.id);
    } catch (err) {
      console.error(err);
    }
    filas.sort((a, b) => (b.cuando || "").localeCompare(a.cuando || ""));
    const hojas = hojasDelEnsayo(e.id);
    const nHoja = (id) => {
      const i = hojas.findIndex((x) => x.id === id);
      return i >= 0 ? "Hoja " + (i + 1) : id ? "Hoja quitada" : "Ensayo";
    };
    const fecha = (iso) => {
      const d = new Date(iso);
      return isNaN(d) ? "" : d.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };
    const corto = (v) => {
      const s = v == null ? "" : String(v);
      return s.length > 90 ? s.slice(0, 90) + "…" : s;
    };
    est.visor = null;
    visor.innerHTML = `<div class="modal-caja paes-visor-caja">
      <div class="paes-visor-cab"><div><b>Historial de cambios</b><br><small>${esc(etiquetaEnsayo(e))} · ${plural(filas.length, "cambio registrado", "cambios registrados")}. Lo que leyó la app nunca se borra: aquí queda cada edición con su valor anterior.</small></div>
        <button type="button" class="chico" data-accion="cerrar-visor">Cerrar ✕</button></div>
      ${filas.length ? `<div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>Cuándo</th><th>Dónde</th><th>Qué cambió</th><th>Antes</th><th>Después</th></tr></thead><tbody>${filas.map((f) => `<tr><td style="white-space:nowrap;">${esc(fecha(f.cuando))}</td><td style="white-space:nowrap;">${esc(nHoja(f.hojaId))}</td><td>${esc(f.campo)}</td><td>${esc(corto(f.antes))}</td><td>${esc(corto(f.despues))}</td></tr>`).join("")}</tbody></table></div>` : `<p class="ayuda">Aún no hay cambios registrados en este ensayo.</p>`}
    </div>`;
    visor.style.display = "flex";
    visor.scrollTop = 0;
  }

  // ============================================================ PASO 5 · resultados

  function htmlPasoResultados() {
    const c = cursoActual();
    const e = ensayoActual();
    const hojas = hojasDelEnsayo(e.id);
    if (!hojas.some(vigente)) {
      return `<div class="tarjeta"><h2>Resultados</h2><p class="ayuda">Aún no hay hojas leídas en este ensayo.</p><div class="acciones-form"><button type="button" data-paso="hojas">← Subir las hojas</button></div></div>`;
    }
    const res = L.resultadosEnsayo(e, hojas, c.estudiantes);
    const st = res.estadisticas;
    const cuenta = contarEstados(e);
    const faltaClave = e.clave.filter((k) => !k.r).length;
    const avisos = [];
    if (faltaClave === e.clave.length) avisos.push("El ensayo no tiene clave: carga la clave (paso 2) para ver correctas y puntajes.");
    else if (faltaClave) avisos.push(`A la clave le faltan ${plural(faltaClave, "respuesta", "respuestas")}: esas preguntas no se están contando.`);
    if (cuenta.revisar) avisos.push(`Hay ${plural(cuenta.revisar, "hoja con advertencias pendientes", "hojas con advertencias pendientes")} en la revisión (paso 4). Puedes descargar los resultados igual.`);
    if (st.sinIdentificar) avisos.push(`${plural(st.sinIdentificar, "hoja está sin identificar", "hojas están sin identificar")}: ${st.sinIdentificar === 1 ? "aparece" : "aparecen"} en la tabla sin nombre.`);
    if (st.sinTabla) avisos.push(`${plural(st.sinTabla, "hoja tiene", "hojas tienen")} más correctas que el máximo de la tabla (${st.maximoTabla}) y ${st.sinTabla === 1 ? "queda" : "quedan"} «sin tabla».`);
    const dato = (etq, valor, sub) => `<div class="paes-dato"><span>${etq}</span><b>${valor}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const maxTramo = Math.max(1, ...st.tramos.map((t) => t.n));
    let h = `<div class="tarjeta">
      <div class="paes-cabecera">
        <div><h2 style="margin:0;">Resultados · ${esc(nombrePrueba(e))}</h2>
        <p class="ayuda" style="margin:4px 0 0;">${esc(c.colegio)} · ${esc(etiquetaCurso(c))}${e.forma ? " · Forma " + esc(e.forma) : ""}${e.fecha ? " · " + esc(PaesExcel.fechaCorta(e.fecha)) : ""}</p></div>
        <div class="paes-cabecera-acciones">
          <button type="button" data-accion="informe-pdf" title="Informe para el colegio, en una página" ${est.generando ? "disabled" : ""}>📄 Informe PDF</button>
          <button type="button" data-accion="informe-word" title="Informe para el colegio, editable" ${est.generando ? "disabled" : ""}>📝 Informe Word</button>
          <button type="button" class="secundario" data-accion="descargar-excel">⬇ Excel</button>
          <label class="paes-filtro" title="Para uso interno: el informe muestra solo el RUT, sin nombres"><input type="checkbox" data-cambio="sin-nombres" ${est.sinNombres ? "checked" : ""} /> Informe sin nombres</label>
        </div>
      </div>
      ${htmlAvisos(avisos, "amarillo")}
      <div class="paes-datos">
        ${dato("Rindieron", `${st.rindieron} de ${st.enLista}`, st.enLista ? `${numero((st.rindieron / st.enLista) * 100)} % de la lista` : "")}
        ${dato("Promedio", numero(st.promedio, 1), "puntos")}
        ${dato("Mediana", numero(st.mediana, st.mediana != null && st.mediana % 1 ? 1 : 0), "puntos")}
        ${dato("Máximo", numero(st.maximo), "puntos")}
        ${dato("Mínimo", numero(st.minimo), "puntos")}
        ${dato("Desviación estándar", numero(st.desviacion, 1), "poblacional")}
        ${dato("Logro promedio", st.logroPromedio == null ? "—" : numero(st.logroPromedio, 1) + " %", `${numero(st.correctasPromedio, 1)} correctas de ${st.preguntasValidas}`)}
      </div>
      <p class="paes-nota">Ensayo de preparación tipo PAES. Puntaje <b>referencial, no oficial</b>, según la tabla de conversión de la unidad: <b>tabla de 0 a ${st.maximoTabla == null ? "—" : st.maximoTabla} correctas</b> (versión ${e.tablaVersion || 1}) · <b>${plural(st.preguntasValidas, "pregunta válida", "preguntas válidas")}</b> de ${st.preguntas} (clave versión ${e.claveVersion || 0}).</p>
    </div>`;
    h += `<div class="tarjeta"><h2 style="font-size:16px;">Tabla del curso, de mayor a menor puntaje</h2>
      <div class="paes-tabla-scroll"><table class="paes-tabla paes-resultados"><thead><tr><th>Lugar</th><th>Estudiante</th><th>RUT</th><th>Correctas</th><th>Incorrectas</th><th>Omitidas</th><th>Logro</th><th>Puntaje</th></tr></thead><tbody>`;
    res.filas.forEach((f) => {
      h += `<tr class="${f.estudianteId ? "" : "paes-fila-duda"}"><td class="num">${f.lugar}</td>
        <td>${f.estudianteId ? esc(f.nombre) : `<i>Sin identificar</i> <small>(${esc(f.archivo)}, pág. ${f.pagina})</small>`}</td>
        <td class="rut">${esc(L.formatearRutPaes(f.rut))}</td>
        <td class="num">${f.correctas}</td><td class="num">${f.incorrectas}${f.dobles ? ` <small title="Dobles marcas, que cuentan como incorrectas">(${f.dobles} dobles)</small>` : ""}</td><td class="num">${f.omitidas}</td>
        <td class="num">${numero(f.logro)} %</td>
        <td class="num puntaje">${f.sinTabla ? `<span class="paes-falta">sin tabla</span>` : f.puntaje}</td></tr>`;
    });
    h += `</tbody></table></div></div>`;
    h += `<div class="paes-dos">
      <div class="tarjeta"><h2 style="font-size:16px;">Distribución de puntajes</h2>
        <div class="paes-tramos">${st.tramos.map((t) => `<div class="paes-tramo"><span>${t.desde}–${t.hasta}</span><div class="paes-tramo-barra"><div style="width:${(t.n / maxTramo) * 100}%"></div></div><b>${t.n}</b></div>`).join("")}</div>
      </div>
      <div class="tarjeta"><h2 style="font-size:16px;">No rindieron (${res.noRindieron.length})</h2>
        ${res.noRindieron.length ? `<p class="ayuda">Están en la lista, pero no tienen hoja en este ensayo. No es un error y no se incluyen en los resultados.</p><ul class="paes-no-rindieron">${estudiantesOrdenados({ estudiantes: res.noRindieron }).map((s) => `<li>${esc(L.nombreCompletoPaes(s))} <small>${esc(L.formatearRutPaes(s.rut))}</small></li>`).join("")}</ul>` : `<p class="ayuda" style="margin:0;">Todos los estudiantes de la lista tienen hoja.</p>`}
      </div>
    </div>`;
    h += htmlMejores(res) + htmlAnalisis(e, hojas) + htmlCombinada(c) + htmlCierre(e);
    return h;
  }

  // fin del trabajo con un curso: pasar a los otros de la tanda o volver al inicio en blanco
  function htmlCierre(e) {
    const otros = hermanos(e).map((x) => est.cursos.find((k) => k.id === x.cursoId)).filter(Boolean);
    return `<div class="tarjeta paes-cierre">
      <div><b>¿Terminaste con este curso?</b>
      <p class="ayuda" style="margin:3px 0 0;">Todo queda guardado en este computador, en «Resultados guardados», ordenado por colegio y curso. Al volver al inicio, la pantalla queda en blanco para ingresar más cursos.</p></div>
      <div class="paes-cabecera-acciones">
        ${otros.map((k) => `<button type="button" class="secundario" data-accion="ir-curso" data-id="${esc(k.id)}">Ver resultados de ${esc(etiquetaCurso(k))} →</button>`).join("")}
        <button type="button" data-accion="guardar-inicio">✔ Guardar y volver al inicio</button>
      </div>
    </div>`;
  }

  async function guardarYVolverAlInicio() {
    clearTimeout(guardadoPendiente);
    const pares = [];
    const c = cursoActual();
    const e = ensayoActual();
    if (c) pares.push(["cursos", c]);
    if (e) pares.push(["ensayos", e]);
    try {
      if (pares.length) await PaesDB.ponerVarios(pares);
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar: " + (err && err.message ? err.message : "error del guardado local"));
      return;
    }
    Object.assign(est, { enBlanco: true, tanda: [], cursoId: null, ensayoId: null, paso: "curso", vista: "curso", formCurso: null, formEnsayo: false, previa: null, listas: null, avisosListas: [], revisarListas: false, editEst: null, resumenLectura: null, importar: null });
    pintar();
    global.scrollTo({ top: 0 });
    toast("Guardado. Puedes ingresar más cursos; los anteriores están en «Resultados guardados»");
  }

  // los cinco mejores puntajes (con empates en el quinto lugar)
  function htmlMejores(res) {
    const mejores = res.filas.filter((f) => f.puntaje != null && f.lugar <= 5);
    if (!mejores.length) return "";
    return `<div class="tarjeta"><h2 style="font-size:16px;">Los cinco mejores puntajes</h2>
      <ol class="paes-mejores">${mejores.map((f) => `<li value="${f.lugar}"><b>${f.estudianteId ? esc(f.nombre) : "Sin identificar"}</b> <span>${f.puntaje} puntos · ${f.correctas} correctas</span></li>`).join("")}</ol></div>`;
  }

  // análisis por pregunta: % de aciertos, % de omisión y qué alternativa se marcó más
  function htmlAnalisis(e, hojas) {
    if (!e.clave.some((k) => k.r)) return "";
    const an = L.analisisPorPregunta(e, hojas);
    const extremos = L.preguntasExtremas(an, 5);
    const dificiles = new Set(extremos.dificiles.map((a) => a.n)), faciles = new Set(extremos.faciles.map((a) => a.n));
    const nAlt = e.alternativas || 4;
    const letras = L.LETRAS_PAES.slice(0, nAlt).split("");
    const lista = (ps) => ps.map((a) => `<b>${a.n}</b> (${numero(a.pctAciertos)} %)`).join(", ");
    return `<div class="tarjeta"><h2 style="font-size:16px;">Análisis por pregunta</h2>
      <p class="ayuda">Porcentajes sobre las ${plural(hojas.filter(vigente).length, "hoja contada", "hojas contadas")}. Con pocos estudiantes, uno solo mueve varios puntos el porcentaje.</p>
      ${extremos.dificiles.length ? `<p class="paes-extremos"><span class="paes-chip rojo">Más difíciles</span> ${lista(extremos.dificiles)}</p><p class="paes-extremos"><span class="paes-chip verde">Más fáciles</span> ${lista(extremos.faciles)}</p>` : ""}
      <details class="paes-detalle"><summary>Ver las ${e.clave.length} preguntas</summary>
      <div class="paes-tabla-scroll"><table class="paes-tabla paes-analisis"><thead><tr><th>Pregunta</th><th>Clave</th><th>% aciertos</th><th>% omisión</th>${letras.map((l) => `<th>${l}</th>`).join("")}<th>Más marcada</th></tr></thead><tbody>
      ${an.map((a) => `<tr class="${!a.valida ? "paes-no-valida" : dificiles.has(a.n) ? "paes-dificil" : faciles.has(a.n) ? "paes-facil" : ""}"><td class="num">${a.n}</td><td class="num"><b>${esc(a.clave || "—")}</b>${a.valida ? "" : " <small>(no válida)</small>"}</td><td class="num">${a.clave ? numero(a.pctAciertos) + " %" : "—"}</td><td class="num">${numero(a.pctOmision)} %</td>${letras.map((l) => `<td class="num${a.clave === l ? " es-clave" : ""}">${a.cuenta[l]}</td>`).join("")}<td class="num">${esc(a.masMarcada || "—")}</td></tr>`).join("")}
      </tbody></table></div></details></div>`;
  }

  // todos los ensayos del curso lado a lado (por ejemplo, Competencia Lectora y M1)
  function htmlCombinada(c) {
    const ensayos = ensayosDelCurso(c.id).filter((e) => hojasDelEnsayo(e.id).some(vigente));
    if (ensayos.length < 2) return "";
    const comb = L.resultadosCombinados(ensayos.map((e) => ({ ensayo: e, hojas: hojasDelEnsayo(e.id) })), c.estudiantes);
    if (!comb.filas.length) return "";
    return `<div class="tarjeta"><h2 style="font-size:16px;">Vista combinada del curso</h2>
      <p class="ayuda">Los ensayos del curso lado a lado, por orden alfabético. No se calcula un puntaje combinado: cada prueba se informa con su propia tabla.</p>
      <div class="paes-tabla-scroll"><table class="paes-tabla paes-resultados"><thead><tr><th rowspan="2">Estudiante</th><th rowspan="2">RUT</th>${ensayos.map((e) => `<th colspan="2" class="grupo">${esc(etiquetaEnsayo(e))}</th>`).join("")}</tr>
      <tr>${ensayos.map(() => `<th>Correctas</th><th>Puntaje</th>`).join("")}</tr></thead><tbody>
      ${comb.filas.map((f) => `<tr><td>${esc(f.nombre)}</td><td class="rut">${esc(L.formatearRutPaes(f.rut))}</td>${f.celdas.map((x) => (x ? `<td class="num">${x.correctas}</td><td class="num puntaje">${x.puntaje == null ? `<span class="paes-falta">sin tabla</span>` : x.puntaje}</td>` : `<td class="num paes-vacio" colspan="2">no rindió</td>`)).join("")}</tr>`).join("")}
      </tbody></table></div></div>`;
  }

  // informe para el colegio, en PDF o Word, con el estilo de los informes de Kuder
  async function descargarInforme(formato) {
    const c = cursoActual();
    const e = ensayoActual();
    if (!c || !e || est.generando) return;
    const hojas = hojasDelEnsayo(e.id);
    const datos = {
      curso: c,
      ensayo: e,
      nombrePrueba: nombrePrueba(e),
      etiquetaCurso: etiquetaCurso(c),
      resultados: L.resultadosEnsayo(e, hojas, c.estudiantes),
      analisis: L.analisisPorPregunta(e, hojas),
      pendientes: contarEstados(e).revisar,
      sinNombres: est.sinNombres,
    };
    const empezar = async () => {
      est.generando = true;
      pintar();
      toast("Creando el informe…");
      try {
        const blob = formato === "pdf" ? await PaesInforme.pdf(datos) : await PaesInforme.word(datos);
        const prueba = e.prueba === "OTRA" ? nombreSeguro(e.pruebaNombre) : e.prueba;
        descargar(blob, `Informe_Ensayo_PAES_${prueba}${e.forma ? "_F" + nombreSeguro(e.forma) : ""}_${nombreSeguro(c.colegio)}_${nombreSeguro(etiquetaCurso(c))}${e.fecha ? "_" + e.fecha : ""}${est.sinNombres ? "_sin_nombres" : ""}.${formato === "pdf" ? "pdf" : "docx"}`);
        toast("Informe descargado");
      } catch (err) {
        console.error(err);
        toast("No se pudo crear el informe.");
      }
      est.generando = false;
      pintar();
    };
    if (datos.pendientes) {
      confirmar({
        titulo: "Hay advertencias pendientes",
        texto: `Quedan ${plural(datos.pendientes, "hoja con advertencias sin revisar", "hojas con advertencias sin revisar")} (paso 4). Puedes crear el informe igual, pero los resultados podrían cambiar cuando las revises.`,
        textoBoton: "Crear el informe igual",
        onConfirmar: empezar,
      });
    } else empezar();
  }

  async function descargarExcel() {
    const c = cursoActual();
    const e = ensayoActual();
    if (!c || !e) return;
    try {
      const blob = await PaesExcel.excelDeEnsayo({ ensayo: e, curso: c, hojas: hojasDelEnsayo(e.id), nombrePrueba: nombrePrueba(e), etiquetaCurso: etiquetaCurso(c), advertencias: advertenciasDelEnsayo(e) });
      const prueba = e.prueba === "OTRA" ? nombreSeguro(e.pruebaNombre) : e.prueba;
      descargar(blob, `Ensayo_PAES_${prueba}${e.forma ? "_F" + nombreSeguro(e.forma) : ""}_${nombreSeguro(c.colegio)}_${nombreSeguro(etiquetaCurso(c))}${e.fecha ? "_" + e.fecha : ""}.xlsx`);
      toast("Excel descargado");
    } catch (err) {
      console.error(err);
      toast("No se pudo crear el Excel.");
    }
  }

  // ============================================================ VISTAS DEL MÓDULO

  function htmlVistas() {
    const b = (id, texto) => `<button type="button" class="${est.vista === id ? "" : "secundario"}" data-vista="${id}">${texto}</button>`;
    return `<div class="paes-vistas">${b("curso", "📝 Trabajar un curso")}${b("resultados", "📁 Resultados guardados")}${b("clavijeros", `🔑 Clavijeros subidos${est.clavijeros.length ? " (" + est.clavijeros.length + ")" : ""}`)}${b("carpetas", "🗂 Editar carpetas")}</div>`;
  }

  // cursos agrupados por colegio
  function porColegio() {
    const mapa = new Map();
    ordenarCursos(est.cursos).forEach((c) => {
      if (!mapa.has(c.colegio)) mapa.set(c.colegio, []);
      mapa.get(c.colegio).push(c);
    });
    return Array.from(mapa.entries()).map(([colegio, cursos]) => ({ colegio, cursos }));
  }

  // ============================================================ CLAVIJEROS

  const firmaClave = (clave) => clave.map((k) => (k.r || "-") + (k.valida ? "" : "*")).join("");
  const copiaClave = (clave) => clave.map((k) => ({ n: k.n, r: k.r, valida: k.valida }));
  const nombrePruebaDe = (k) => (k.prueba !== "OTRA" && L.PRUEBAS_PAES[k.prueba] ? L.PRUEBAS_PAES[k.prueba].nombre : k.pruebaNombre || "Otra prueba");
  const clavijeroDe = (e) => est.clavijeros.find((k) => k.id === e.clavijeroId) || null;
  const ensayosConClavijero = (id) => est.ensayos.filter((e) => e.clavijeroId === id);
  const guardarClavijeros = () => guardar("ajustes", { clave: "clavijeros", valor: est.clavijeros });

  function crearClavijero(datos) {
    const base = `${datos.prueba === "OTRA" ? datos.pruebaNombre || "Otra" : datos.prueba}${datos.forma ? " · Forma " + datos.forma : ""}`;
    let nombre = (datos.nombre || "").trim() || base;
    for (let i = 2; est.clavijeros.some((k) => k.nombre === nombre); i++) nombre = `${(datos.nombre || "").trim() || base} (${i})`;
    const k = {
      id: PaesDB.nuevoId("k"),
      nombre,
      prueba: datos.prueba,
      pruebaNombre: datos.pruebaNombre || "",
      forma: datos.forma || "",
      alternativas: datos.alternativas || (datos.clave.some((x) => x.r === "E") ? 5 : 4),
      clave: copiaClave(datos.clave),
      version: 1,
      creado: new Date().toISOString(),
    };
    est.clavijeros.push(k);
    return k;
  }

  // las claves que ya estaban en ensayos (de antes de existir los clavijeros) pasan a la lista
  async function registrarClavesSueltas() {
    const cambiados = [];
    est.ensayos.forEach((e) => {
      if (e.clavijeroId && clavijeroDe(e)) return;
      if (!e.clave || !e.clave.some((k) => k.r)) return;
      const igual = est.clavijeros.find((k) => k.prueba === e.prueba && (k.pruebaNombre || "") === (e.pruebaNombre || "") && firmaClave(k.clave) === firmaClave(e.clave));
      e.clavijeroId = (igual || crearClavijero({ prueba: e.prueba, pruebaNombre: e.pruebaNombre, forma: e.forma, alternativas: e.alternativas, clave: e.clave })).id;
      cambiados.push(e);
    });
    if (cambiados.length) {
      await PaesDB.ponerVarios(cambiados.map((e) => ["ensayos", e]));
      await guardarClavijeros();
    }
  }

  // Tras cambiar la clave dentro de un ensayo: el cambio pasa a su clavijero y a los demás
  // cursos que lo usan. Si el ensayo no tenía clavijero, su clave se guarda como uno nuevo.
  async function propagarClave(e) {
    if (!e.clave.some((k) => k.r)) return;
    let k = clavijeroDe(e);
    if (!k) {
      k = est.clavijeros.find((x) => x.prueba === e.prueba && (x.pruebaNombre || "") === (e.pruebaNombre || "") && firmaClave(x.clave) === firmaClave(e.clave)) || crearClavijero({ prueba: e.prueba, pruebaNombre: e.pruebaNombre, forma: e.forma, alternativas: e.alternativas, clave: e.clave });
      e.clavijeroId = k.id;
      await guardar("ensayos", e);
      await guardarClavijeros();
      await llevarClaveAHermanos(e, k);
      return;
    }
    if (firmaClave(k.clave) === firmaClave(e.clave) && (k.alternativas || 4) === (e.alternativas || 4)) return;
    k.clave = copiaClave(e.clave);
    k.alternativas = e.alternativas || 4;
    await difundirClavijero(k, e);
  }

  // los ensayos creados junto con este y que aún no tienen clave reciben la misma
  async function llevarClaveAHermanos(e, k) {
    const sinClave = hermanos(e).filter((x) => !x.clave.some((q) => q.r));
    sinClave.forEach((x) => {
      x.clave = copiaClave(k.clave);
      x.alternativas = k.alternativas || e.alternativas || 4;
      x.clavijeroId = k.id;
      x.claveVersion = (x.claveVersion || 0) + 1;
      auditar(x.id, null, `clave (clavijero «${k.nombre}», del ensayo que se corrige junto)`, "", firmaClave(x.clave));
    });
    if (sinClave.length) await PaesDB.ponerVarios(sinClave.map((x) => ["ensayos", x]));
    return sinClave.length;
  }

  // lleva el clavijero (ya modificado) a todos los ensayos que lo usan
  async function difundirClavijero(k, salvo) {
    k.version = (k.version || 1) + 1;
    k.modificado = new Date().toISOString();
    const otros = ensayosConClavijero(k.id).filter((x) => x !== salvo);
    otros.forEach((x) => {
      const antes = firmaClave(x.clave);
      x.clave = copiaClave(k.clave);
      x.alternativas = k.alternativas || 4;
      x.claveVersion = (x.claveVersion || 0) + 1;
      auditar(x.id, null, `clave (clavijero «${k.nombre}» modificado)`, antes, firmaClave(x.clave));
    });
    if (otros.length) await PaesDB.ponerVarios(otros.map((x) => ["ensayos", x]));
    await guardarClavijeros();
    return otros.length;
  }

  // aplica un clavijero guardado a un ensayo (o lo deja sin clavijero)
  async function aplicarClavijero(e, id) {
    const k = est.clavijeros.find((x) => x.id === id);
    const antes = firmaClave(e.clave);
    if (!k) {
      e.clavijeroId = null;
      await guardar("ensayos", e);
      pintar();
      toast("El ensayo quedó sin clavijero: su clave actual se conserva");
      return;
    }
    e.clave = copiaClave(k.clave);
    e.alternativas = k.alternativas || 4;
    e.clavijeroId = k.id;
    e.claveVersion = (e.claveVersion || 0) + 1;
    await guardar("ensayos", e);
    auditar(e.id, null, `clave (se aplicó el clavijero «${k.nombre}»)`, antes, firmaClave(e.clave));
    await llevarClaveAHermanos(e, k);
    pintar();
    toast(`Se aplicó el clavijero «${k.nombre}»: todo se recalculó`);
  }

  // paso 2: qué clavijero usa este ensayo
  function htmlClavijeroAplicado(e) {
    const k = clavijeroDe(e);
    const delaPrueba = est.clavijeros.filter((x) => x.prueba === e.prueba && (x.pruebaNombre || "") === (e.pruebaNombre || ""));
    const otros = k ? ensayosConClavijero(k.id).length - 1 : 0;
    return `<div class="paes-clavijero-aplicado">
      <label for="paes-clv-aplicado">Clavijero aplicado a este curso</label>
      <select id="paes-clv-aplicado" data-cambio="clavijero-ensayo">
        <option value="">— Sin clavijero guardado —</option>
        ${delaPrueba.map((x) => `<option value="${esc(x.id)}" ${k && x.id === k.id ? "selected" : ""}>${esc(x.nombre)}</option>`).join("")}
      </select>
      <button type="button" class="secundario chico" data-vista="clavijeros">🔑 Ver clavijeros subidos</button>
      ${k && otros ? `<p class="paes-nota amarillo" style="flex-basis:100%;margin:0;">Este clavijero también lo ${otros === 1 ? "usa otro curso" : `usan otros ${otros} cursos`}: si cambias una respuesta aquí, cambia para todos.</p>` : ""}
    </div>`;
  }

  function htmlVistaClavijeros() {
    let h = `<div class="tarjeta">
      <div class="paes-cabecera"><div><h2 style="margin:0;">Clavijeros subidos</h2>
      <p class="ayuda" style="margin:4px 0 0;">Las claves de respuestas guardadas en este computador. Normalmente hay una por prueba: Competencia Lectora (CL) y Matemática 1 (M1). Al crear el ensayo de un curso eliges cuál se le aplica.</p></div>
      <div class="paes-cabecera-acciones"><button type="button" data-accion="clv-nuevo">📤 Subir un clavijero nuevo</button></div></div>`;
    if (est.clvForm) {
      h += `<div class="paes-pegar">
        <div class="grid-form">
          <div class="campo-ancho"><label>Nombre</label><input type="text" id="paes-clv-nombre" placeholder="Ej: CL · Forma 3 · 2026" /></div>
          <div><label>Prueba *</label><select id="paes-clv-prueba">${Object.values(L.PRUEBAS_PAES).map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("")}</select></div>
          <div><label>Forma</label><input type="text" id="paes-clv-forma" maxlength="12" placeholder="Ej: 3" /></div>
        </div>
        <label style="margin-top:10px;">Sube el archivo (CSV o Excel, también el formato de ZipGrade) o escribe una letra por pregunta, en orden.</label>
        <textarea id="paes-clv-texto" rows="3" placeholder="DDBCA…  (o: 1 D, 2 D, 3 B)"></textarea>
        <input type="file" data-archivo="clavijero" accept=".csv,.xls,.xlsx" style="display:none;" />
        <div class="acciones-form"><button type="button" data-accion="clv-elegir">📤 Elegir archivo…</button><button type="button" data-accion="clv-guardar">Guardar lo escrito</button><button type="button" class="secundario" data-accion="clv-nuevo">Cancelar</button></div>
      </div>`;
    }
    h += `</div>`;
    if (!est.clavijeros.length) return h + `<div class="tarjeta"><p class="ayuda" style="margin:0;">Aún no hay clavijeros. Sube el primero con el botón de arriba; también se guardan solos cuando cargas la clave de un ensayo.</p></div>`;
    est.clavijeros
      .slice()
      .sort((a, b) => a.prueba.localeCompare(b.prueba) || a.nombre.localeCompare(b.nombre, "es"))
      .forEach((k) => {
        const usos = ensayosConClavijero(k.id);
        const con = k.clave.filter((x) => x.r).length, validas = k.clave.filter((x) => x.r && x.valida).length;
        const abierto = est.clvAbierto === k.id;
        h += `<div class="tarjeta paes-clavijero">
          <div class="paes-cabecera">
            <div><h2 style="margin:0;font-size:17px;">🔑 ${esc(k.nombre)}</h2>
            <p class="paes-cuenta" style="margin:6px 0 0;"><span class="paes-chip azul">${esc(nombrePruebaDe(k))}</span>${k.forma ? `<span class="paes-chip">Forma ${esc(k.forma)}</span>` : ""}<span class="paes-chip">${con} de ${k.clave.length} respuestas</span><span class="paes-chip">${plural(validas, "pregunta válida", "preguntas válidas")}</span><span class="paes-chip gris">versión ${k.version || 1}</span><span class="paes-chip ${usos.length ? "verde" : "gris"}">${usos.length ? "aplicado a " + plural(usos.length, "curso", "cursos") : "sin aplicar"}</span></p></div>
            <div class="paes-cabecera-acciones">
              <button type="button" class="${abierto ? "" : "secundario "}chico" data-accion="clv-abrir" data-id="${esc(k.id)}">${abierto ? "▲ Cerrar" : "▼ Ver y modificar el mapa"}</button>
              <button type="button" class="chico peligro" data-accion="clv-eliminar" data-id="${esc(k.id)}">🗑 Eliminar</button>
            </div>
          </div>`;
        if (abierto) {
          const letras = L.LETRAS_PAES.slice(0, k.alternativas || 4).split("");
          h += `<div class="grid-form" style="margin-top:14px;">
              <div class="campo-ancho"><label>Nombre</label><input type="text" data-clv-campo="nombre" data-id="${esc(k.id)}" value="${esc(k.nombre)}" /></div>
              <div><label>Forma</label><input type="text" data-clv-campo="forma" data-id="${esc(k.id)}" maxlength="12" value="${esc(k.forma || "")}" /></div>
              <div><label>Alternativas</label><select data-clv-campo="alternativas" data-id="${esc(k.id)}"><option value="4" ${(k.alternativas || 4) === 4 ? "selected" : ""}>A a D</option><option value="5" ${k.alternativas === 5 ? "selected" : ""}>A a E</option></select></div>
            </div>
            <p class="paes-nota${usos.length ? " amarillo" : ""}">${usos.length ? `Lo que cambies aquí se aplica de inmediato a ${plural(usos.length, "curso", "cursos")} y sus puntajes se recalculan.` : "Este clavijero aún no se aplica a ningún curso."} Desmarca la casilla de una pregunta para dejarla como <b>no válida</b> (anulada o de pilotaje).</p>
            <div class="paes-clave-grilla">${k.clave.map((x) => `<div class="paes-clave-celda${x.valida ? "" : " no-valida"}${x.r ? "" : " sin-clave"}" data-clv-celda="${x.n}">
              <span class="n">${x.n}</span>
              <select data-clv-clave="${x.n}" data-id="${esc(k.id)}" aria-label="Respuesta de la pregunta ${x.n}"><option value="">–</option>${letras.concat(x.r && !letras.includes(x.r) ? [x.r] : []).map((l) => `<option ${l === x.r ? "selected" : ""}>${l}</option>`).join("")}</select>
              <input type="checkbox" data-clv-valida="${x.n}" data-id="${esc(k.id)}" ${x.valida ? "checked" : ""} title="Pregunta válida (cuenta para el puntaje)" aria-label="Pregunta ${x.n} válida" />
            </div>`).join("")}</div>
            <h3 class="paes-subtitulo">A quiénes se les aplicó</h3>`;
          if (!usos.length) h += `<p class="ayuda" style="margin:0;">A nadie todavía. Se elige al crear el ensayo de un curso, o en el paso 2 del curso.</p>`;
          usos.forEach((e) => {
            const c = est.cursos.find((x) => x.id === e.cursoId);
            if (!c) return;
            const hojas = hojasDelEnsayo(e.id).filter(vigente);
            const nombres = hojas.map((x) => (x.estudianteId ? c.estudiantes.find((s) => s.id === x.estudianteId) : null)).filter(Boolean).map((s) => L.nombreCompletoPaes(s)).sort((a, b) => a.localeCompare(b, "es"));
            const sinId = hojas.length - nombres.length;
            h += `<details class="paes-detalle paes-uso"><summary><b>${esc(c.colegio)} · ${esc(etiquetaCurso(c))}</b> · ${esc(etiquetaEnsayo(e))} · ${plural(hojas.length, "estudiante corregido", "estudiantes corregidos")}</summary>
              ${nombres.length ? `<ul class="paes-no-rindieron">${nombres.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : `<p class="ayuda" style="margin:0;">Aún no hay hojas leídas en este ensayo.</p>`}
              ${sinId ? `<p class="ayuda" style="margin:6px 0 0;">Y ${plural(sinId, "hoja sin identificar", "hojas sin identificar")}.</p>` : ""}
              <div class="acciones-form"><button type="button" class="secundario chico" data-accion="res-ver" data-curso="${esc(c.id)}" data-ensayo="${esc(e.id)}">Ver los resultados →</button></div></details>`;
          });
        }
        h += `</div>`;
      });
    return h;
  }

  function datosFormClavijero() {
    const prueba = raiz.querySelector("#paes-clv-prueba").value;
    return { nombre: raiz.querySelector("#paes-clv-nombre").value, prueba, pruebaNombre: "", forma: raiz.querySelector("#paes-clv-forma").value.trim() };
  }

  async function guardarClavijeroNuevo(leido, origen) {
    if (!leido.clave.length) {
      toast(leido.avisos[0] || "No se encontró una clave.");
      return;
    }
    const max = leido.clave.reduce((a, x) => Math.max(a, x.n), 0);
    const porN = new Map(leido.clave.map((x) => [x.n, x]));
    const clave = Array.from({ length: Math.min(100, max) }, (_, i) => porN.get(i + 1) || { n: i + 1, r: "", valida: true });
    const k = crearClavijero(Object.assign(datosFormClavijero(), { clave }));
    await guardarClavijeros();
    est.clvForm = false;
    est.clvAbierto = k.id;
    pintar();
    toast(`Clavijero «${k.nombre}» guardado: ${plural(leido.clave.length, "respuesta", "respuestas")}${leido.avisos.length ? " · " + leido.avisos[0] : ""} (${origen})`);
  }

  async function guardarClavijeroDeArchivo(archivo) {
    try {
      await guardarClavijeroNuevo(L.leerClave(await filasDeArchivo(archivo)), archivo.name);
    } catch (err) {
      console.error(err);
      toast("No se pudo leer el archivo. ¿Es un CSV o un Excel?");
    }
  }

  function guardarClavijeroEscrito() {
    guardarClavijeroNuevo(L.claveDesdeTexto(raiz.querySelector("#paes-clv-texto").value), "escrito a mano");
  }

  function eliminarClavijero(id) {
    const k = est.clavijeros.find((x) => x.id === id);
    if (!k) return;
    const usos = ensayosConClavijero(id);
    confirmar({
      titulo: "Eliminar el clavijero",
      texto: `Se va a eliminar «${k.nombre}» de la lista de clavijeros.${usos.length ? ` Lo ${usos.length === 1 ? "usa 1 curso, que conserva" : `usan ${usos.length} cursos, que conservan`} su clave y sus resultados, pero ya sin clavijero guardado.` : ""} No se puede deshacer.`,
      textoBoton: "Eliminar el clavijero",
      onConfirmar: async () => {
        est.clavijeros = est.clavijeros.filter((x) => x.id !== id);
        usos.forEach((e) => (e.clavijeroId = null));
        if (usos.length) await PaesDB.ponerVarios(usos.map((e) => ["ensayos", e]));
        await guardarClavijeros();
        pintar();
        toast("Clavijero eliminado");
      },
    });
  }

  // ============================================================ RESULTADOS GUARDADOS

  function htmlVistaResultados() {
    let h = `<div class="tarjeta"><h2>Resultados guardados</h2>
      <p class="ayuda" style="margin-bottom:0;">Todo lo corregido queda guardado solo, ordenado por colegio y curso. Abre un curso para ver los resultados de cada prueba y descargar sus informes.</p></div>`;
    if (!est.cursos.length) return h + `<div class="tarjeta"><p class="ayuda" style="margin:0;">Aún no hay cursos.</p></div>`;
    porColegio().forEach((g) => {
      h += `<div class="tarjeta paes-colegio"><h2 style="font-size:17px;">🏫 ${esc(g.colegio)} <small>${plural(g.cursos.length, "curso", "cursos")}</small></h2>`;
      g.cursos.forEach((c) => {
        const ensayos = ensayosDelCurso(c.id);
        const conHojas = ensayos.filter((e) => hojasDelEnsayo(e.id).some(vigente));
        h += `<details class="paes-detalle paes-res-curso" ${est.cursoId === c.id || g.cursos.length === 1 ? "open" : ""}><summary><b>${esc(etiquetaCurso(c))}</b> · ${esc(c.anio)} · ${plural(c.estudiantes.length, "estudiante", "estudiantes")} · ${conHojas.length ? conHojas.map((e) => esc(e.prueba === "OTRA" ? e.pruebaNombre : e.prueba)).join(" y ") : "sin resultados aún"}</summary>`;
        if (!ensayos.length) h += `<p class="ayuda" style="margin:0 0 8px;">Este curso aún no tiene ensayos.</p><div class="acciones-form"><button type="button" class="secundario chico" data-accion="res-ver" data-curso="${esc(c.id)}" data-ensayo="" data-ir="ensayo">Crear su primer ensayo →</button></div>`;
        ensayos.forEach((e) => {
          const hojas = hojasDelEnsayo(e.id);
          if (!hojas.some(vigente)) {
            h += `<div class="paes-res-fila"><div><b>${esc(nombrePrueba(e))}</b><small>${esc(etiquetaEnsayo(e))} · aún sin hojas leídas</small></div>
              <div class="paes-cabecera-acciones"><button type="button" class="secundario chico" data-accion="res-ver" data-curso="${esc(c.id)}" data-ensayo="${esc(e.id)}" data-ir="hojas">Subir sus hojas →</button></div></div>`;
            return;
          }
          const st = L.resultadosEnsayo(e, hojas, c.estudiantes).estadisticas;
          const pend = contarEstados(e).revisar;
          const attrs = `data-curso="${esc(c.id)}" data-ensayo="${esc(e.id)}"`;
          h += `<div class="paes-res-fila"><div><b>${esc(nombrePrueba(e))}</b>
            <small>${e.forma ? "Forma " + esc(e.forma) + " · " : ""}${e.fecha ? esc(PaesExcel.fechaCorta(e.fecha)) + " · " : ""}rindieron ${st.rindieron} de ${st.enLista} · promedio ${numero(st.promedio, 1)}${pend ? ` · <span class="paes-falta">${pend} por revisar</span>` : ""}</small></div>
            <div class="paes-cabecera-acciones">
              <button type="button" class="chico" data-accion="res-ver" ${attrs}>Ver resultados</button>
              <button type="button" class="secundario chico" data-accion="res-informe" data-formato="pdf" ${attrs} ${est.generando ? "disabled" : ""}>📄 PDF</button>
              <button type="button" class="secundario chico" data-accion="res-informe" data-formato="word" ${attrs} ${est.generando ? "disabled" : ""}>📝 Word</button>
              <button type="button" class="secundario chico" data-accion="res-informe" data-formato="excel" ${attrs}>⬇ Excel</button>
            </div></div>`;
        });
        h += `</details>`;
      });
      h += `</div>`;
    });
    return h;
  }

  // ============================================================ IMPORTAR CURSOS DE KUDER

  function cursosDeKuder() {
    try {
      if (typeof storeKuder === "undefined" || typeof cursosDelStore !== "function") return [];
      return cursosDelStore(storeKuder);
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  function nivelDesdeKuder(texto) {
    try {
      const n = typeof nivelDeCurso === "function" ? nivelDeCurso(texto) : null;
      if (n && n.etiqueta) return n.etiqueta;
    } catch (e) {
      console.error(e);
    }
    return (texto || "").trim() || "Otro";
  }

  function htmlImportarKuder() {
    const cursos = cursosDeKuder();
    if (!cursos.length) {
      return `<div class="tarjeta paes-importar"><h2>Importar cursos de datos de Kuder</h2><p class="ayuda">En este computador no hay estudiantes cargados en el Test de Kuder.</p><div class="acciones-form"><button type="button" class="secundario" data-accion="cancelar-importar">Cerrar</button></div></div>`;
    }
    const yaImportados = new Set(est.cursos.filter((c) => c.origen && c.origen.tipo === "kuder").map((c) => c.origen.clave));
    let h = `<div class="tarjeta paes-importar"><h2>Importar cursos de datos de Kuder</h2>
      <p class="ayuda">Marca los cursos que quieres traer. Por cada uno se crea un <b>curso nuevo</b> en Ensayos PAES, con los nombres y RUT que están en Kuder, separado de los cursos que ya tienes. Los datos de Kuder no se modifican. Después puedes ordenarlos en «🗂 Editar carpetas».</p>
      <div class="paes-importar-lista">`;
    let colegio = null;
    cursos.forEach((k) => {
      if (k.colegio !== colegio) {
        colegio = k.colegio;
        h += `<div class="paes-importar-colegio">🏫 ${esc(colegio || "Sin colegio")}</div>`;
      }
      const conRut = k.estudiantes.filter((e) => L.leerRut(e.rut).rut).length;
      h += `<label class="paes-importar-fila"><input type="checkbox" data-importar="${esc(k.clave)}" ${est.importar.has(k.clave) ? "checked" : ""} />
        <span><b>${esc(nivelDesdeKuder(k.curso))}${k.letra ? " " + esc(k.letra) : ""}</b> · ${plural(k.estudiantes.length, "estudiante", "estudiantes")}${conRut < k.estudiantes.length ? ` · <span class="paes-falta">${k.estudiantes.length - conRut} sin RUT</span>` : ""}${yaImportados.has(k.clave) ? ` <span class="paes-chip gris">ya importado antes</span>` : ""}</span></label>`;
    });
    h += `</div><div class="acciones-form"><button type="button" data-accion="importar-kuder" id="paes-btn-importar" ${est.importar.size ? "" : "disabled"}>Importar ${est.importar.size ? plural(est.importar.size, "curso", "cursos") : "los cursos marcados"}</button><button type="button" class="secundario" data-accion="cancelar-importar">Cancelar</button></div></div>`;
    return h;
  }

  async function importarDeKuder() {
    const elegidos = cursosDeKuder().filter((k) => est.importar && est.importar.has(k.clave));
    if (!elegidos.length) return;
    const anio = new Date().getFullYear();
    const nuevos = [];
    let sinRut = 0;
    elegidos.forEach((k) => {
      const vistos = new Set();
      const estudiantes = [];
      k.estudiantes.forEach((e) => {
        const r = L.leerRut(e.rut);
        if (r.rut && vistos.has(r.rut)) return;
        if (r.rut) vistos.add(r.rut);
        else sinRut++;
        // en Kuder el nombre viene en un solo campo y en el orden en que se escribió:
        // solo se separa cuando trae coma ("Apellidos, Nombres")
        const nombre = String(e.nombre || "").replace(/\s+/g, " ").trim();
        const partes = nombre.includes(",") ? L.separarNombre(nombre) : { nombres: nombre, apellidos: "" };
        estudiantes.push({ id: PaesDB.nuevoId("e"), rut: r.rut, nombres: partes.nombres, apellidos: partes.apellidos });
      });
      nuevos.push({ id: PaesDB.nuevoId("c"), colegio: (k.colegio || "Sin colegio").replace(/\s+/g, " ").trim(), nivel: nivelDesdeKuder(k.curso), letra: (k.letra || "").toUpperCase(), anio, estudiantes, creado: new Date().toISOString(), origen: { tipo: "kuder", clave: k.clave, cuando: new Date().toISOString() } });
    });
    await PaesDB.ponerVarios(nuevos.map((c) => ["cursos", c]));
    est.cursos.push(...nuevos);
    est.cursoId = nuevos[0].id;
    est.enBlanco = false;
    est.tanda = nuevos.length > 1 ? nuevos.map((c) => c.id) : [];
    est.ensayoId = null;
    est.importar = null;
    est.paso = "curso";
    pintar();
    toast(`${plural(nuevos.length, "curso importado", "cursos importados")} de Kuder${sinRut ? ` · ${plural(sinRut, "estudiante sin RUT", "estudiantes sin RUT")}` : ""}`);
  }

  // ============================================================ EDITAR CARPETAS

  function htmlVistaCarpetas() {
    let h = `<div class="tarjeta"><h2>Editar carpetas</h2>
      <p class="ayuda" style="margin-bottom:0;">Ordena los colegios y cursos de Ensayos PAES, como en Kuder: cambia el nombre de un colegio (se cambia en todos sus cursos), corrige el nivel, la letra o el año de un curso, pásalo a otro colegio o fusiónalo con otro curso. Las hojas y los resultados se van con el curso.</p></div>`;
    const grupos = porColegio();
    if (!grupos.length) return h + `<div class="tarjeta"><p class="ayuda" style="margin:0;">Aún no hay cursos.</p></div>`;
    // colegios que parecen el mismo
    if (typeof parecidoColegios === "function") {
      for (let i = 0; i < grupos.length; i++) {
        for (let j = i + 1; j < grupos.length; j++) {
          if (!parecidoColegios(grupos[i].colegio, grupos[j].colegio)) continue;
          const a = grupos[i].colegio, b = grupos[j].colegio;
          h += `<div class="tarjeta paes-duplicado"><p>⚠ <b>${esc(a)}</b> y <b>${esc(b)}</b> parecen el mismo colegio.</p>
            <div class="acciones-form" style="margin-top:8px;"><button type="button" class="chico" data-accion="carp-unir" data-de="${esc(b)}" data-a="${esc(a)}">Unir como «${esc(a)}»</button><button type="button" class="secundario chico" data-accion="carp-unir" data-de="${esc(a)}" data-a="${esc(b)}">Unir como «${esc(b)}»</button></div></div>`;
        }
      }
    }
    const todos = ordenarCursos(est.cursos);
    grupos.forEach((g) => {
      h += `<div class="tarjeta paes-carpeta"><div class="paes-carp-colegio"><span>🏫</span><input type="text" data-carp-colegio="${esc(g.colegio)}" value="${esc(g.colegio)}" aria-label="Nombre del colegio" /><small>${plural(g.cursos.length, "curso", "cursos")} · escribe otro nombre y sal del campo para cambiarlo</small></div>`;
      g.cursos.forEach((c) => {
        const ens = ensayosDelCurso(c.id);
        const nHojas = ens.reduce((a, e) => a + hojasDelEnsayo(e.id).length, 0);
        const niveles = NIVELES.includes(c.nivel) ? NIVELES : [c.nivel].concat(NIVELES);
        h += `<div class="paes-carp-curso">
          <div class="paes-carp-campos">
            <label>Nivel<select data-carp-curso="${esc(c.id)}" data-campo="nivel">${niveles.map((n) => `<option ${n === c.nivel ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
            <label>Letra<input type="text" data-carp-curso="${esc(c.id)}" data-campo="letra" maxlength="3" value="${esc(c.letra || "")}" /></label>
            <label>Año<input type="number" data-carp-curso="${esc(c.id)}" data-campo="anio" min="2020" max="2100" value="${esc(c.anio)}" /></label>
            <label>Pasar a otro colegio<select data-carp-mover="${esc(c.id)}"><option value="">—</option>${grupos.filter((x) => x.colegio !== c.colegio).map((x) => `<option>${esc(x.colegio)}</option>`).join("")}</select></label>
            <label>Fusionar con otro curso<select data-carp-fusion="${esc(c.id)}"><option value="">—</option>${todos.filter((x) => x.id !== c.id).map((x) => `<option value="${esc(x.id)}">${esc(x.colegio)} · ${esc(etiquetaCurso(x))} · ${esc(x.anio)}</option>`).join("")}</select></label>
          </div>
          <div class="paes-carp-pie"><small>${plural(c.estudiantes.length, "estudiante", "estudiantes")} · ${plural(ens.length, "ensayo", "ensayos")} · ${plural(nHojas, "hoja", "hojas")}${c.origen && c.origen.tipo === "kuder" ? ` · <span class="paes-chip azul">importado de Kuder</span>` : ""}</small>
            <span><button type="button" class="secundario chico" data-accion="res-ver" data-curso="${esc(c.id)}" data-ensayo="" data-ir="curso">Abrir el curso</button> <button type="button" class="chico peligro" data-accion="carp-eliminar" data-id="${esc(c.id)}">🗑 Eliminar</button></span></div>
        </div>`;
      });
      h += `</div>`;
    });
    return h;
  }

  async function renombrarColegio(anterior, nuevo) {
    nuevo = String(nuevo || "").replace(/\s+/g, " ").trim();
    if (!nuevo || nuevo === anterior) {
      pintar();
      return;
    }
    const limpio = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const cursos = est.cursos.filter((c) => limpio(c.colegio) === limpio(anterior) || limpio(c.colegio) === nuevo);
    cursos.forEach((c) => (c.colegio = nuevo));
    await PaesDB.ponerVarios(cursos.map((c) => ["cursos", c]));
    pintar();
    toast(`${plural(cursos.length, "curso quedó", "cursos quedaron")} en «${nuevo}»`);
  }

  // fusiona el curso «a» dentro de «b»: listas juntas (por RUT), ensayos y hojas pasan a «b»
  async function fusionarCursos(a, b) {
    const mapa = new Map();
    a.estudiantes.forEach((s) => {
      let d = s.rut ? b.estudiantes.find((x) => x.rut === s.rut) : null;
      if (!d) {
        d = s;
        b.estudiantes.push(s);
      }
      mapa.set(s.id, d.id);
    });
    const pares = [["cursos", b]];
    const borrar = [];
    for (const e of ensayosDelCurso(a.id)) {
      const gemelo = ensayosDelCurso(b.id).find((x) => x.prueba === e.prueba && (x.pruebaNombre || "") === (e.pruebaNombre || "") && (x.forma || "") === (e.forma || "") && (x.fecha || "") === (e.fecha || "") && firmaClave(x.clave) === firmaClave(e.clave));
      for (const hoja of est.hojas.filter((x) => x.ensayoId === e.id)) {
        hoja.cursoId = b.id;
        if (hoja.estudianteId) hoja.estudianteId = mapa.get(hoja.estudianteId) || null;
        if (gemelo) {
          hoja.ensayoId = gemelo.id;
          const img = await PaesDB.obtener("imagenes", hoja.id);
          if (img) pares.push(["imagenes", Object.assign(img, { ensayoId: gemelo.id })]);
        }
        pares.push(["hojas", hoja]);
      }
      if (gemelo) borrar.push(e);
      else {
        e.cursoId = b.id;
        pares.push(["ensayos", e]);
      }
    }
    await PaesDB.ponerVarios(pares);
    for (const e of borrar) await PaesDB.borrar("ensayos", e.id);
    await PaesDB.borrar("cursos", a.id);
    est.ensayos = est.ensayos.filter((e) => !borrar.includes(e));
    est.cursos = est.cursos.filter((c) => c !== a);
    if (est.cursoId === a.id) est.cursoId = b.id;
    est.ensayoId = null;
    pintar();
    toast(`Cursos fusionados en ${b.colegio} · ${etiquetaCurso(b)}: ${plural(b.estudiantes.length, "estudiante", "estudiantes")}`);
  }

  // ============================================================ REVISIÓN: ayudas para identificar

  const textoEstudiante = (s) => `${s.apellidos ? s.apellidos + ", " : ""}${s.nombres}${s.rut ? " · " + L.formatearRutPaes(s.rut) : ""}`;

  function htmlSinHoja(lista) {
    if (!lista.length) return `<p class="paes-nota" style="margin-top:10px;">Todos los estudiantes de la lista ya tienen hoja en este ensayo.</p>`;
    return `<div class="paes-sin-hoja"><ul class="paes-no-rindieron">${lista.map((s) => `<li>${esc(L.nombreCompletoPaes(s))} <small>${esc(L.formatearRutPaes(s.rut))}</small></li>`).join("")}</ul></div>`;
  }

  // busca un estudiante del curso por lo escrito: nombre (sin importar tildes) o dígitos del RUT
  function buscarEstudiantes(c, texto) {
    const exacto = c.estudiantes.find((s) => textoEstudiante(s) === texto);
    if (exacto) return [exacto];
    const q = L.sinTildes(texto).toLowerCase().replace(/\s+/g, " ").trim();
    if (!q) return [];
    const digitos = q.replace(/[^0-9k]/g, "");
    const palabras = q.split(" ");
    return c.estudiantes.filter((s) => {
      if (digitos.length >= 3 && digitos.length === q.replace(/[.\-\s]/g, "").length) return (s.rut || "").replace("-", "").toLowerCase().includes(digitos);
      const nombre = L.sinTildes(`${s.nombres} ${s.apellidos}`).toLowerCase();
      return palabras.every((p) => nombre.includes(p));
    });
  }

  function htmlAgregarManual(x) {
    if (est.agregarEn !== x.id) {
      return `<div class="paes-candidatos"><button type="button" class="secundario chico" data-accion="agregar-manual" data-id="${esc(x.id)}">➕ No está en la lista: agregar su nombre y RUT</button></div>`;
    }
    const estado = L.estadoDelId(x.lectura.id);
    const rut = estado === "valido" ? L.formatearRutPaes(x.lectura.id) : "";
    return `<div class="paes-agregar-manual" data-form-manual="${esc(x.id)}">
      <b>Agregar a la lista del curso y asignarle esta hoja</b>
      <div class="grid-form">
        <div><label>Nombres *</label><input type="text" data-manual="nombres" /></div>
        <div><label>Apellidos</label><input type="text" data-manual="apellidos" /></div>
        <div><label>RUT</label><input type="text" data-manual="rut" value="${esc(rut)}" placeholder="Ej: 22.345.678-9" /></div>
      </div>
      <div class="acciones-form"><button type="button" class="chico" data-accion="guardar-manual" data-id="${esc(x.id)}">Guardar y asignar</button><button type="button" class="secundario chico" data-accion="agregar-manual" data-id="${esc(x.id)}">Cancelar</button></div>
    </div>`;
  }

  async function guardarEstudianteManual(hojaId) {
    const c = cursoActual();
    const form = raiz.querySelector(`[data-form-manual="${hojaId}"]`);
    if (!c || !form) return;
    const valor = (campo) => form.querySelector(`[data-manual="${campo}"]`).value.replace(/\s+/g, " ").trim();
    const nombres = valor("nombres"), apellidos = valor("apellidos");
    const r = L.leerRut(valor("rut"));
    if (!nombres && !apellidos) {
      toast("Escribe al menos el nombre del estudiante.");
      return;
    }
    let s = r.rut ? c.estudiantes.find((e) => e.rut === r.rut) : null;
    const yaEstaba = !!s;
    if (!s) {
      s = { id: PaesDB.nuevoId("e"), rut: r.rut, nombres, apellidos, agregadoAMano: true };
      c.estudiantes.push(s);
      await guardar("cursos", c);
      auditar(est.ensayoId, hojaId, "estudiante agregado a la lista a mano", "", L.nombreCompletoPaes(s) + (s.rut ? " (" + s.rut + ")" : ""));
    }
    est.agregarEn = null;
    await asignarHoja(hojaId, s.id, "manual");
    toast(yaEstaba ? `Ese RUT ya estaba en la lista (${L.nombreCompletoPaes(s)}): se le asignó la hoja` : r.rut && !r.valido ? "Estudiante agregado y hoja asignada. Ojo: ese RUT tiene el dígito verificador incorrecto." : "Estudiante agregado a la lista y hoja asignada");
  }

  // cambios de formulario de las vistas nuevas; devuelve true si se hizo cargo
  function alCambiarExtras(t) {
    const d = t.dataset;
    if (d.importar) {
      if (!est.importar) return true;
      if (t.checked) est.importar.add(d.importar);
      else est.importar.delete(d.importar);
      const btn = raiz.querySelector("#paes-btn-importar");
      if (btn) {
        btn.disabled = !est.importar.size;
        btn.textContent = `Importar ${est.importar.size ? plural(est.importar.size, "curso", "cursos") : "los cursos marcados"}`;
      }
      return true;
    }
    if (d.cambio === "clavijero-ensayo") {
      const e = ensayoActual();
      if (!e) return true;
      const aplicar = () => aplicarClavijero(e, t.value);
      const nHojas = hojasDelEnsayo(e.id).length;
      if (t.value && nHojas && firmaClave(e.clave) !== firmaClave((est.clavijeros.find((k) => k.id === t.value) || { clave: [] }).clave)) {
        confirmar({ titulo: "Cambiar el clavijero", texto: `Este ensayo ya tiene ${plural(nHojas, "hoja leída", "hojas leídas")}. Al aplicar otro clavijero cambian sus correctas y puntajes.`, textoBoton: "Aplicar el clavijero", onConfirmar: aplicar, onCancelar: pintar });
      } else aplicar();
      return true;
    }
    if (d.clvClave || d.clvValida || d.clvCampo) {
      const k = est.clavijeros.find((x) => x.id === d.id);
      if (!k) return true;
      if (d.clvCampo) {
        if (d.clvCampo === "nombre") k.nombre = t.value.replace(/\s+/g, " ").trim() || k.nombre;
        if (d.clvCampo === "forma") k.forma = t.value.trim();
        if (d.clvCampo === "alternativas") {
          k.alternativas = Number(t.value) || 4;
          difundirClavijero(k).then(pintar);
          return true;
        }
        guardarClavijeros().then(pintar);
        return true;
      }
      const n = Number(d.clvClave || d.clvValida);
      const x = k.clave.find((y) => y.n === n);
      if (!x) return true;
      if (d.clvClave) x.r = t.value;
      else x.valida = t.checked;
      difundirClavijero(k).then((afectados) => {
        if (afectados) toast(`Clavijero actualizado: se recalcularon ${plural(afectados, "curso", "cursos")}`);
      });
      const celda = t.closest("[data-clv-celda]");
      if (celda) {
        celda.classList.toggle("no-valida", !x.valida);
        celda.classList.toggle("sin-clave", !x.r);
      }
      return true;
    }
    if (d.carpColegio) {
      renombrarColegio(d.carpColegio, t.value);
      return true;
    }
    if (d.carpCurso) {
      const c = est.cursos.find((x) => x.id === d.carpCurso);
      if (!c) return true;
      const nuevo = { nivel: c.nivel, letra: c.letra || "", anio: c.anio };
      if (d.campo === "nivel") nuevo.nivel = t.value;
      if (d.campo === "letra") nuevo.letra = t.value.trim().toUpperCase();
      if (d.campo === "anio") nuevo.anio = Number(t.value) || c.anio;
      if (est.cursos.some((x) => x !== c && x.colegio === c.colegio && x.nivel === nuevo.nivel && (x.letra || "") === nuevo.letra && x.anio === nuevo.anio)) {
        toast("Ya hay un curso con esos datos en el colegio. Si son el mismo, usa «Fusionar con otro curso».");
        pintar();
        return true;
      }
      Object.assign(c, nuevo);
      guardar("cursos", c).then(pintar);
      return true;
    }
    if (d.carpMover) {
      const c = est.cursos.find((x) => x.id === d.carpMover);
      if (!c || !t.value) return true;
      if (est.cursos.some((x) => x !== c && x.colegio === t.value && x.nivel === c.nivel && (x.letra || "") === (c.letra || "") && x.anio === c.anio)) {
        toast("En ese colegio ya hay un curso igual. Si son el mismo, usa «Fusionar con otro curso».");
        pintar();
        return true;
      }
      c.colegio = t.value;
      guardar("cursos", c).then(() => {
        pintar();
        toast(`${etiquetaCurso(c)} pasó a «${c.colegio}»`);
      });
      return true;
    }
    if (d.carpFusion) {
      const a = est.cursos.find((x) => x.id === d.carpFusion), b = est.cursos.find((x) => x.id === t.value);
      if (!a || !b) return true;
      confirmar({
        titulo: "Fusionar cursos",
        texto: `${a.colegio} · ${etiquetaCurso(a)} (${plural(a.estudiantes.length, "estudiante", "estudiantes")}) se va a juntar con ${b.colegio} · ${etiquetaCurso(b)} (${plural(b.estudiantes.length, "estudiante", "estudiantes")}). Queda un solo curso, con el nombre del segundo; los estudiantes con el mismo RUT no se repiten y los ensayos y hojas se conservan. No se puede deshacer.`,
        textoBoton: "Fusionar",
        onConfirmar: () => fusionarCursos(a, b),
        onCancelar: pintar,
      });
      return true;
    }
    if (d.buscar) {
      const c = cursoActual();
      const texto = t.value;
      if (!c || !texto.trim()) return true;
      const hallados = buscarEstudiantes(c, texto);
      if (hallados.length === 1) asignarHoja(d.buscar, hallados[0].id, "manual");
      else toast(hallados.length ? `${hallados.length} estudiantes calzan con «${texto.trim()}»: escribe un poco más o elige uno de la lista` : `Nadie de la lista calza con «${texto.trim()}»`);
      return true;
    }
    return false;
  }

  // ============================================================ EVENTOS

  function alClic(ev) {
    if (ev.target.id === "paes-visor") {
      cerrarVisor();
      return;
    }
    const vista = ev.target.closest("[data-vista]");
    if (vista) {
      est.vista = vista.dataset.vista;
      Object.assign(est, { importar: null, clvForm: false, formCurso: null, formEnsayo: false });
      pintar();
      global.scrollTo({ top: 0 });
      return;
    }
    const paso = ev.target.closest("[data-paso]");
    if (paso && !paso.disabled) {
      est.paso = paso.dataset.paso;
      est.formCurso = null;
      est.formEnsayo = false;
      pintar();
      global.scrollTo({ top: 0 });
      return;
    }
    const b = ev.target.closest("[data-accion]");
    if (!b || b.disabled) return;
    const id = b.dataset.id;
    const elegirArchivo = (tipo) => {
      const input = raiz.querySelector(`input[data-archivo="${tipo}"]`);
      if (input) {
        input.value = "";
        input.click();
      }
    };
    switch (b.dataset.accion) {
      // ---- curso y lista
      case "nuevo-curso":
        Object.assign(est, { formCurso: { modo: "nuevo" }, paso: "curso", previa: null, listas: null, avisosListas: [], revisarListas: false, formEnsayo: false });
        pintar();
        global.scrollTo({ top: 0 });
        break;
      case "elegir-listas":
        elegirArchivo("listas");
        break;
      case "quitar-lista-nueva":
        est.listas.splice(Number(b.dataset.i), 1);
        if (!est.listas.length) est.listas = null;
        pintar();
        break;
      case "cancelar-listas":
        Object.assign(est, { listas: null, avisosListas: [], revisarListas: false });
        pintar();
        break;
      case "crear-cursos-listas":
        crearCursosDeListas();
        break;
      case "previa-a-nuevo":
        previaACursoNuevo();
        break;
      case "guardar-inicio":
        guardarYVolverAlInicio();
        break;
      case "ir-curso": {
        const destino = est.cursos.find((k) => k.id === id);
        if (!destino) break;
        const gemelo = hermanos(ensayoActual()).find((x) => x.cursoId === destino.id);
        Object.assign(est, { cursoId: destino.id, ensayoId: gemelo ? gemelo.id : null, enBlanco: false, formCurso: null, formEnsayo: false, previa: null, editEst: null, listas: null });
        pintar();
        global.scrollTo({ top: 0 });
        break;
      }
      case "editar-curso":
        est.formCurso = { modo: "editar" };
        pintar();
        break;
      case "cancelar-curso":
        Object.assign(est, { formCurso: null, listas: null, avisosListas: [], revisarListas: false });
        pintar();
        break;
      case "guardar-curso":
        guardarCurso();
        break;
      case "eliminar-curso":
        eliminarCurso();
        break;
      case "elegir-lista":
        elegirArchivo("lista");
        break;
      case "agregar-estudiante":
        est.editEst = "nuevo";
        pintar();
        raiz.querySelector('.paes-fila-edicion [data-edit="nombres"]').focus();
        break;
      case "editar-estudiante":
        est.editEst = id;
        pintar();
        break;
      case "cancelar-estudiante":
        est.editEst = null;
        pintar();
        break;
      case "guardar-estudiante":
        guardarEstudiante(id);
        break;
      case "eliminar-estudiante":
        eliminarEstudiante(id);
        break;
      case "quitar-previa":
        est.previa.estudiantes = est.previa.estudiantes.filter((e) => e.i !== Number(b.dataset.i));
        pintar();
        break;
      case "confirmar-lista":
        confirmarLista();
        break;
      case "cancelar-lista":
        est.previa = null;
        pintar();
        break;
      // ---- ensayo, clave y tabla
      case "nuevo-ensayo":
        est.formEnsayo = true;
        est.paso = "ensayo";
        pintar();
        break;
      case "cancelar-ensayo":
        est.formEnsayo = false;
        pintar();
        break;
      case "guardar-ensayo":
        guardarEnsayoNuevo();
        break;
      case "eliminar-ensayo":
        eliminarEnsayo();
        break;
      case "elegir-clave":
        elegirArchivo("clave");
        break;
      case "pegar-clave":
        est.pegarClave = true;
        pintar();
        raiz.querySelector("#paes-clave-texto").focus();
        break;
      case "cancelar-pegar":
        est.pegarClave = false;
        pintar();
        break;
      case "aplicar-clave":
        aplicarClaveEscrita();
        break;
      case "elegir-tabla":
        elegirArchivo("tabla");
        break;
      case "restaurar-tabla": {
        const e = ensayoActual();
        cambiarTabla(e, L.TABLAS_PAES[e.prueba].slice(), "tabla de la unidad").then(() => {
          pintar();
          toast("Se volvió a la tabla de la unidad");
        });
        break;
      }
      case "tabla-mas":
      case "tabla-menos": {
        const e = ensayoActual();
        const nueva = e.tabla.slice();
        if (b.dataset.accion === "tabla-mas") nueva.push(null);
        else nueva.pop();
        cambiarTabla(e, nueva, "filas").then(pintar);
        break;
      }
      // ---- hojas
      case "elegir-hojas":
        elegirArchivo("hojas");
        break;
      case "cancelar-lectura":
        if (est.lectura) {
          est.lectura.cancelar = true;
          pintarProgreso();
        }
        break;
      case "quitar-archivo":
        quitarArchivo(b.dataset.clave);
        break;
      // ---- revisión
      case "asignar":
        asignarHoja(id, b.dataset.est, b.dataset.modo);
        break;
      case "mover-hoja":
        moverHoja(id, b.dataset.curso);
        break;
      case "ver-hoja":
        verHoja(id);
        break;
      case "cerrar-visor":
        cerrarVisor();
        break;
      case "visor-ir":
        if (id) verHoja(id);
        break;
      case "resp":
        editarRespuesta(id, Number(b.dataset.n), b.dataset.l);
        break;
      case "resp-leida":
        editarRespuesta(id, Number(b.dataset.n), null);
        break;
      case "deshacer":
        deshacerUltimo();
        break;
      case "historial":
        verHistorial();
        break;
      case "ingresar-a-mano": {
        const h = est.hojas.find((x) => x.id === id);
        if (!h) break;
        est.visor = id;
        cambiarHoja(id, { estado: "ok", manual: true, revisada: false }, "hoja ilegible: respuestas ingresadas a mano", "Marca las respuestas mirando la imagen de la hoja");
        break;
      }
      // ---- importar de Kuder
      case "abrir-importar-kuder":
        est.vista = "curso";
        est.importar = new Set();
        pintar();
        global.scrollTo({ top: 0 });
        break;
      case "cancelar-importar":
        est.importar = null;
        pintar();
        break;
      case "importar-kuder":
        importarDeKuder();
        break;
      // ---- resultados guardados
      case "res-ver":
        Object.assign(est, { enBlanco: false, cursoId: b.dataset.curso, ensayoId: b.dataset.ensayo, vista: "curso", paso: b.dataset.ir || "resultados" });
        pintar();
        global.scrollTo({ top: 0 });
        break;
      case "res-informe":
        est.cursoId = b.dataset.curso;
        est.enBlanco = false;
        est.ensayoId = b.dataset.ensayo;
        if (b.dataset.formato === "excel") descargarExcel();
        else descargarInforme(b.dataset.formato);
        break;
      // ---- clavijeros
      case "clv-nuevo":
        est.clvForm = !est.clvForm;
        pintar();
        break;
      case "clv-elegir":
        elegirArchivo("clavijero");
        break;
      case "clv-guardar":
        guardarClavijeroEscrito();
        break;
      case "clv-abrir":
        est.clvAbierto = est.clvAbierto === id ? null : id;
        pintar();
        break;
      case "clv-eliminar":
        eliminarClavijero(id);
        break;
      // ---- carpetas
      case "carp-unir":
        renombrarColegio(b.dataset.de, b.dataset.a);
        break;
      case "carp-eliminar":
        est.cursoId = id;
        est.enBlanco = false;
        eliminarCurso();
        break;
      // ---- revisión
      case "ver-sin-hoja":
        est.verSinHoja = !est.verSinHoja;
        pintar();
        break;
      case "agregar-manual":
        est.agregarEn = est.agregarEn === id ? null : id;
        pintar();
        break;
      case "guardar-manual":
        guardarEstudianteManual(id);
        break;
      case "informe-pdf":
        descargarInforme("pdf");
        break;
      case "informe-word":
        descargarInforme("word");
        break;
      case "revisada": {
        const h = est.hojas.find((x) => x.id === id);
        if (h) cambiarHoja(id, { revisada: !h.revisada }, "revisada", h.revisada ? "Se quitó la marca de revisada" : "Hoja marcada como revisada");
        break;
      }
      case "excluir":
        cambiarHoja(id, { excluida: true }, "excluida", "La hoja ya no se cuenta en el ensayo");
        break;
      case "incluir":
        cambiarHoja(id, { excluida: false }, "excluida", "La hoja se vuelve a contar");
        break;
      case "no-repetida":
        cambiarHoja(id, { repetidaDe: null }, "repetida", "La hoja se cuenta como una hoja distinta").then(() => {
          const h = est.hojas.find((x) => x.id === id);
          const c = cursoActual();
          if (h && c && !h.estudianteId) {
            vincular(h, c);
            guardar("hojas", h).then(pintar);
          }
        });
        break;
      // ---- resultados
      case "descargar-excel":
        descargarExcel();
        break;
    }
  }

  function alCambiar(ev) {
    const t = ev.target;
    // ---- archivos
    if (t.dataset.archivo) {
      const archivos = Array.from(t.files || []);
      if (!archivos.length) return;
      if (t.dataset.archivo === "lista") leerArchivoLista(archivos[0]);
      if (t.dataset.archivo === "listas") leerListasNuevas(archivos);
      if (t.dataset.archivo === "clave") importarClave(archivos[0]);
      if (t.dataset.archivo === "tabla") importarTabla(archivos[0]);
      if (t.dataset.archivo === "hojas") subirHojas(archivos);
      if (t.dataset.archivo === "clavijero") guardarClavijeroDeArchivo(archivos[0]);
      return;
    }
    if (alCambiarExtras(t)) return;
    // ---- selección
    if (t.dataset.lista && est.listas) {
      const tarjeta = est.listas[Number(t.dataset.i)];
      if (tarjeta) tarjeta[t.dataset.lista] = t.value;
      return;
    }
    if (t.dataset.cambio === "curso") {
      if (!t.value) return;
      est.cursoId = t.value;
      est.enBlanco = false;
      est.listas = null;
      if (!est.tanda.includes(t.value)) est.tanda = [];
      est.ensayoId = null;
      Object.assign(est, { formCurso: null, formEnsayo: false, previa: null, editEst: null, resumenLectura: null });
      pintar();
      return;
    }
    if (t.dataset.cambio === "ensayo") {
      est.ensayoId = t.value;
      Object.assign(est, { formEnsayo: false, pegarClave: false });
      pintar();
      return;
    }
    if (t.dataset.cambio === "previa-curso") {
      est.previa.cursoElegido = t.value;
      pintar();
      return;
    }
    if (t.dataset.cambio === "sin-nombres") {
      est.sinNombres = t.checked;
      return;
    }
    if (t.dataset.cambio === "solo-revisar") {
      est.soloPorRevisar = t.checked;
      pintar();
      return;
    }
    if (t.id === "paes-ens-prueba") {
      raiz.querySelector("#paes-ens-otra").style.display = t.value === "OTRA" ? "" : "none";
      return;
    }
    if (t.dataset.asignar) {
      asignarHoja(t.dataset.asignar, t.value, "manual");
      return;
    }
    const e = ensayoActual();
    if (!e) return;
    // ---- clave: respuesta o validez de una pregunta
    if (t.dataset.clave || t.dataset.valida) {
      const n = Number(t.dataset.clave || t.dataset.valida);
      const k = e.clave.find((x) => x.n === n);
      if (!k) return;
      const antes = (k.r || "-") + (k.valida ? "" : " (no válida)");
      if (t.dataset.clave) k.r = t.value;
      else k.valida = t.checked;
      e.claveVersion = (e.claveVersion || 0) + 1;
      guardar("ensayos", e).then(() => propagarClave(e));
      auditar(e.id, null, `clave, pregunta ${n}`, antes, (k.r || "-") + (k.valida ? "" : " (no válida)"));
      const celda = raiz.querySelector(`[data-celda-clave="${n}"]`);
      if (celda) {
        celda.classList.toggle("no-valida", !k.valida);
        celda.classList.toggle("sin-clave", !k.r);
      }
      const resumen = raiz.querySelector("#paes-resumen-clave");
      if (resumen) resumen.innerHTML = resumenClave(e);
      return;
    }
    // ---- tabla: puntaje de una fila
    if (t.dataset.tabla) {
      const i = Number(t.dataset.tabla);
      const antes = e.tabla[i];
      const v = t.value.trim() === "" ? null : Math.round(Number(t.value));
      e.tabla[i] = v == null || !isFinite(v) ? null : Math.max(0, Math.min(1000, v));
      e.tablaVersion = (e.tablaVersion || 1) + 1;
      guardar("ensayos", e);
      auditar(e.id, null, `tabla, ${i} correctas`, antes, e.tabla[i]);
      const resumen = raiz.querySelector("#paes-resumen-tabla");
      if (resumen) resumen.innerHTML = resumenTabla(e);
      return;
    }
    // ---- datos del ensayo
    if (t.dataset.ensayo) {
      const campo = t.dataset.ensayo;
      if (campo === "forma") e.forma = t.value.trim();
      if (campo === "fecha") e.fecha = t.value;
      if (campo === "alternativas") {
        e.alternativas = Number(t.value) || 4;
        guardar("ensayos", e).then(() => propagarClave(e)).then(pintar);
        return;
      }
      if (campo === "nPreguntas") {
        const n = Math.max(1, Math.min(100, Math.round(Number(t.value)) || e.clave.length));
        const aplicar = () => {
          e.clave = Array.from({ length: n }, (_, i) => e.clave[i] || { n: i + 1, r: "", valida: true });
          e.claveVersion = (e.claveVersion || 0) + 1;
          guardar("ensayos", e).then(() => propagarClave(e)).then(pintar);
        };
        if (n < e.clave.length && e.clave.slice(n).some((k) => k.r)) {
          confirmar({ titulo: "Quitar preguntas de la clave", texto: `Se van a quitar las respuestas de las preguntas ${n + 1} a ${e.clave.length}.`, textoBoton: "Quitar", onConfirmar: aplicar, onCancelar: pintar });
        } else aplicar();
        return;
      }
      guardar("ensayos", e).then(pintar);
    }
  }

  function alEscribir(ev) {
    const t = ev.target;
    if (t.dataset.lista && est.listas) {
      const tarjeta = est.listas[Number(t.dataset.i)];
      if (tarjeta) tarjeta[t.dataset.lista] = t.value;
      return;
    }
    if (!t.dataset.previa || !est.previa) return;
    const fila = est.previa.estudiantes.find((e) => e.i === Number(t.dataset.i));
    if (!fila) return;
    fila[t.dataset.previa] = t.value;
    if (t.dataset.previa === "rut") {
      const celda = raiz.querySelector(`[data-insignia="${fila.i}"]`);
      if (celda) celda.innerHTML = insigniaRut(t.value);
    }
  }

  global.PaesApp = { iniciar, activar, desactivar, estado: est, subirHojas };
  document.addEventListener("DOMContentLoaded", iniciar);
})(window);
