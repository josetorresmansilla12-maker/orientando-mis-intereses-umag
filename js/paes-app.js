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
      if (ev.dataTransfer && ev.dataTransfer.files.length) subirHojas(Array.from(ev.dataTransfer.files));
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
      est.listo = true;
      try {
        const s = JSON.parse(localStorage.getItem(CLAVE_SELECCION) || "{}");
        est.cursoId = s.cursoId || null;
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
    if (!cursoActual()) est.cursoId = est.cursos.length ? ordenarCursos(est.cursos)[0].id : null;
    if (!ensayoActual()) {
      const lista = est.cursoId ? ensayosDelCurso(est.cursoId) : [];
      est.ensayoId = lista.length ? lista[lista.length - 1].id : null;
    }
    if (!est.cursoId) est.paso = "curso";
    else if (!est.ensayoId && ["hojas", "revision", "resultados"].includes(est.paso)) est.paso = "ensayo";
    try {
      localStorage.setItem(CLAVE_SELECCION, JSON.stringify({ cursoId: est.cursoId, ensayoId: est.ensayoId, paso: est.paso }));
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
      htmlContexto() +
      htmlPasos() +
      `<div id="paes-panel">${htmlPanel()}</div>` +
      `<div id="paes-visor" class="modal-overlay" style="display:none;"></div>`;
    global.scrollTo(0, y);
    cargarImagenes();
    actualizarConteo();
  }

  function htmlContexto() {
    const cursos = ordenarCursos(est.cursos);
    const c = cursoActual();
    const ensayos = c ? ensayosDelCurso(c.id) : [];
    return `<div class="tarjeta paes-contexto">
      <div class="paes-ctx-campo">
        <label for="paes-sel-curso">Curso</label>
        <select id="paes-sel-curso" data-cambio="curso" ${cursos.length ? "" : "disabled"}>
          ${cursos.length ? "" : `<option value="">Aún no hay cursos</option>`}
          ${cursos.map((k) => `<option value="${esc(k.id)}" ${k.id === est.cursoId ? "selected" : ""}>${esc(k.colegio)} · ${esc(etiquetaCurso(k))} · ${esc(k.anio)}</option>`).join("")}
        </select>
        <button type="button" class="secundario chico" data-accion="nuevo-curso">➕ Nuevo curso</button>
      </div>
      <div class="paes-ctx-campo">
        <label for="paes-sel-ensayo">Ensayo</label>
        <select id="paes-sel-ensayo" data-cambio="ensayo" ${ensayos.length ? "" : "disabled"}>
          ${ensayos.length ? "" : `<option value="">${c ? "Este curso aún no tiene ensayos" : "Primero crea un curso"}</option>`}
          ${ensayos.map((e) => `<option value="${esc(e.id)}" ${e.id === est.ensayoId ? "selected" : ""}>${esc(etiquetaEnsayo(e))}</option>`).join("")}
        </select>
        <button type="button" class="secundario chico" data-accion="nuevo-ensayo" ${c ? "" : "disabled"}>➕ Nuevo ensayo</button>
      </div>
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
      <h2>${editando ? "Editar datos del curso" : "Nuevo curso"}</h2>
      <p class="ayuda">${editando ? "Cambia los datos y guarda." : "Escribe el colegio y el curso. Después subes su lista oficial."}</p>
      <div class="grid-form">
        <div class="campo-ancho"><label>Colegio *</label><input type="text" id="paes-curso-colegio" list="paes-colegios" value="${esc(v.colegio)}" autocomplete="off" />
          <datalist id="paes-colegios">${colegiosConocidos().map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist></div>
        <div><label>Nivel *</label><select id="paes-curso-nivel">${NIVELES.map((n) => `<option ${n === v.nivel ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div><label>Letra</label><input type="text" id="paes-curso-letra" maxlength="3" value="${esc(v.letra)}" placeholder="Ej: A" /></div>
        <div><label>Año *</label><input type="number" id="paes-curso-anio" min="2020" max="2100" value="${esc(v.anio)}" /></div>
      </div>
      <div class="acciones-form">
        <button type="button" data-accion="guardar-curso">${editando ? "Guardar cambios" : "Crear curso"}</button>
        ${est.cursos.length ? `<button type="button" class="secundario" data-accion="cancelar-curso">Cancelar</button>` : ""}
      </div>
    </div>`;
  }

  function htmlPasoCurso() {
    const c = cursoActual();
    if (est.formCurso || !c) return htmlFormCurso();
    const nEnsayos = ensayosDelCurso(c.id).length;
    let h = `<div class="tarjeta">
      <div class="paes-cabecera">
        <div><h2 style="margin:0;">${esc(c.colegio)} · ${esc(etiquetaCurso(c))}</h2>
        <p class="ayuda" style="margin:4px 0 0;">Año ${esc(c.anio)} · ${plural(c.estudiantes.length, "estudiante", "estudiantes")} en la lista · ${plural(nEnsayos, "ensayo", "ensayos")}</p></div>
        <div class="paes-cabecera-acciones">
          <button type="button" class="secundario chico" data-accion="editar-curso">✏ Editar datos</button>
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
      <p class="ayuda">${lista.length ? "Con esta lista se vinculan las hojas por RUT. Puedes corregir un nombre o un RUT, agregar a alguien o subir una lista actualizada." : "Sube el Excel de la lista (.xls, .xlsx o .csv) con el nombre completo y el RUT de cada estudiante. Vas a ver una vista previa para corregir antes de confirmar."}</p>
      <div class="acciones-form" style="margin-top:0;">
        <input type="file" data-archivo="lista" accept=".xls,.xlsx,.csv" style="display:none;" />
        <button type="button" data-accion="elegir-lista">📤 ${lista.length ? "Subir una lista actualizada…" : "Subir la lista del curso…"}</button>
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
      h += `<p class="paes-nota">Este curso ya tiene ${plural(c.estudiantes.length, "estudiante", "estudiantes")}: quienes vengan con el mismo RUT se actualizan, los nuevos se agregan y nadie se elimina.</p>`;
    }
    h += `<div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>N°</th><th>Nombres</th><th>Apellidos</th><th>RUT</th><th></th><th>Como venía en el archivo</th><th></th></tr></thead><tbody>`;
    filas.forEach((e, i) => {
      h += `<tr class="${e.nombreSeguro ? "" : "paes-fila-duda"}"><td class="num">${i + 1}</td>
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
        estudiantes: r.estudiantes.map((e, i) => ({ i, nombres: e.nombres, apellidos: e.apellidos, rut: L.formatearRutPaes(e.rut), curso: e.curso, nombreOriginal: e.nombreOriginal, nombreSeguro: e.nombreSeguro })),
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
      </div>
      <div class="acciones-form">
        <button type="button" data-accion="guardar-ensayo">Crear ensayo</button>
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
    est.ensayos.push(e);
    await guardar("ensayos", e);
    est.ensayoId = e.id;
    est.formEnsayo = false;
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
        const registro = (e.archivos || []).find((a) => a.huella === g.clave);
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
    const resumen = { ensayoId: ensayo.id, leidas: 0, exactas: 0, pendientes: 0, ilegibles: 0, repetidas: 0, avisos: [], segundos: 0 };
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
          const delEnsayo = est.hojas.filter((h) => h.ensayoId === ensayo.id);
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
              vincular(hoja, curso);
              if (hoja.estudianteId) resumen.exactas++;
              else resumen.pendientes++;
            }
          } else {
            resumen.ilegibles++;
          }
          await PaesDB.ponerVarios([
            ["hojas", hoja],
            ["imagenes", { hojaId: hoja.id, ensayoId: ensayo.id, pagina: leida.imagenes.pagina, nombre: leida.imagenes.nombre }],
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
            <select data-asignar="${esc(x.id)}" ${x.excluida ? "disabled" : ""}>
              <option value="">— Sin identificar —</option>
              ${opcionesEstudiantes.map((s) => `<option value="${esc(s.id)}" ${s.id === x.estudianteId ? "selected" : ""}>${esc(s.apellidos)}${s.apellidos ? ", " : ""}${esc(s.nombres)}${s.rut ? " · " + esc(L.formatearRutPaes(s.rut)) : ""}${conHoja.get(s.id) && s.id !== x.estudianteId ? " · ya tiene hoja" : ""}</option>`).join("")}
            </select>
            ${alumno ? `<span class="paes-chip ${x.asignacion === "exacta" ? "verde" : "azul"}">${x.asignacion === "exacta" ? "RUT exacto" : x.asignacion === "sugerida" ? "sugerencia confirmada" : "asignada a mano"}</span>` : ""}
          </div>`;
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
        } else {
          const n = hojas.findIndex((k) => k.id === x.repetidaDe) + 1;
          h += `<div class="paes-linea">Es la misma hoja que la <b>Hoja ${n || "?"}</b> (mismo RUT y mismas respuestas): no se cuenta dos veces.</div>`;
        }
      }
      if (avisos.length) h += `<ul class="paes-advertencias">${avisos.map((a) => `<li>${esc(a.detalle)}</li>`).join("")}</ul>`;
      h += `<div class="paes-hoja-acciones">
            <button type="button" class="secundario chico" data-accion="ver-hoja" data-id="${esc(x.id)}">👁 Ver la hoja</button>`;
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
    pintar();
    if (mensaje) toast(mensaje);
  }

  // mueve una hoja al ensayo equivalente (misma prueba y forma) de otro curso
  async function moverHoja(hojaId, cursoId) {
    const h = est.hojas.find((x) => x.id === hojaId);
    const origen = ensayoActual();
    const destinoCurso = est.cursos.find((k) => k.id === cursoId);
    if (!h || !origen || !destinoCurso) return;
    const candidatos = ensayosDelCurso(cursoId).filter((e) => e.prueba === origen.prueba && (e.pruebaNombre || "") === (origen.pruebaNombre || ""));
    const destino = candidatos.find((e) => (e.forma || "") === (origen.forma || "")) || (candidatos.length === 1 ? candidatos[0] : null);
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

  async function verHoja(hojaId) {
    const visor = raiz.querySelector("#paes-visor");
    const h = est.hojas.find((x) => x.id === hojaId);
    if (!visor || !h) return;
    const url = await urlDeImagen(hojaId + ":pagina");
    visor.innerHTML = `<div class="modal-caja paes-visor-caja">
      <div class="paes-visor-cab"><b>${esc(h.archivo)} · página ${h.pagina}</b><button type="button" class="secundario chico" data-accion="cerrar-visor">Cerrar ✕</button></div>
      ${url ? `<img src="${url}" alt="Hoja de respuestas escaneada" />` : `<p class="ayuda">La imagen de esta hoja ya no está guardada.</p>`}
    </div>`;
    visor.style.display = "flex";
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
        <div class="paes-cabecera-acciones"><button type="button" data-accion="descargar-excel">⬇ Descargar Excel</button></div>
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
    return h;
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

  // ============================================================ EVENTOS

  function alClic(ev) {
    if (ev.target.id === "paes-visor") {
      ev.target.style.display = "none";
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
        est.formCurso = { modo: "nuevo" };
        est.paso = "curso";
        est.previa = null;
        pintar();
        break;
      case "editar-curso":
        est.formCurso = { modo: "editar" };
        pintar();
        break;
      case "cancelar-curso":
        est.formCurso = null;
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
        raiz.querySelector("#paes-visor").style.display = "none";
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
      if (t.dataset.archivo === "clave") importarClave(archivos[0]);
      if (t.dataset.archivo === "tabla") importarTabla(archivos[0]);
      if (t.dataset.archivo === "hojas") subirHojas(archivos);
      return;
    }
    // ---- selección
    if (t.dataset.cambio === "curso") {
      est.cursoId = t.value;
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
      guardar("ensayos", e);
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
      if (campo === "alternativas") e.alternativas = Number(t.value) || 4;
      if (campo === "nPreguntas") {
        const n = Math.max(1, Math.min(100, Math.round(Number(t.value)) || e.clave.length));
        const aplicar = () => {
          e.clave = Array.from({ length: n }, (_, i) => e.clave[i] || { n: i + 1, r: "", valida: true });
          e.claveVersion = (e.claveVersion || 0) + 1;
          guardar("ensayos", e).then(pintar);
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
