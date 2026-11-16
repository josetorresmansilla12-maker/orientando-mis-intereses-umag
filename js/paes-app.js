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
  const NIVEL_DISPERSO = "Grupo disperso";
  const NIVELES = ["4° Medio", "3° Medio", "2° Medio", "1° Medio", "Egresados", "Otro", NIVEL_DISPERSO];
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
    clvForm: false, // formulario «Agregar clavijero»
    importar: null, // selección de cursos de Kuder por importar: Set de claves
    verSinHoja: false, // revisión: lista de estudiantes sin hoja desplegada
    agregarEn: null, // revisión: hoja en la que se agrega a mano un estudiante
    papelera: [], // cursos eliminados que se pueden recuperar: { curso, ensayos, hojas }
    formDisperso: false, // formulario «Agregar curso disperso»
    otraPrueba: false, // paso 3: formulario «Otra prueba»
    moverArchivo: null, // paso 3: archivo con el cuadro «Cambiar de prueba» abierto
    resMezcla: false, // «Resultados guardados»: pruebas juntas (true) o por separado
    fusionarEn: null, // «Resultados guardados»: curso con el cuadro «Fusionar» abierto
    transferirEn: null, // revisión: hoja con el cuadro «Transferir a otro curso» abierto
    otroClv: null, // «Resultados guardados»: curso con el cuadro «Agregar ensayos PDF» abierto
    pdfPendientes: null, // PDF ya elegidos, a la espera de su clavijero: { cursoId, archivos }
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
  // nombres primero y después apellidos, como los escriben los estudiantes en la hoja
  const estudiantesOrdenados = (c) => c.estudiantes.slice().sort((a, b) => L.nombreCompletoPaes(a).localeCompare(L.nombreCompletoPaes(b), "es"));
  const vigente = (h) => h.estado !== "ilegible" && !h.excluida && !h.repetidaDe;

  // ensayos «hermanos»: el mismo ensayo creado a la vez en varios cursos, para corregirlos juntos
  const hermanos = (e) => (e && e.grupoId ? est.ensayos.filter((x) => x !== e && x.grupoId === e.grupoId) : []);
  const nombreCurso = (c) => `${c.colegio} · ${etiquetaCurso(c)}`;

  // ---- curso disperso: algunos estudiantes de un colegio, sin lista propia
  const normColegio = (t) => L.sinTildes(String(t || "")).toLowerCase().replace(/\s+/g, " ").trim();

  // estudiantes de los cursos con lista del mismo colegio, cada uno con su curso
  function poolDisperso(c) {
    const lista = [];
    ordenarCursos(est.cursos).forEach((k) => {
      if (k.id === c.id || k.disperso || normColegio(k.colegio) !== normColegio(c.colegio)) return;
      k.estudiantes.forEach((x) => lista.push({ id: x.id, rut: x.rut, nombres: x.nombres, apellidos: x.apellidos, cursoId: k.id, grupo: `${etiquetaCurso(k)} · ${k.anio}` }));
    });
    return lista;
  }

  // a quién se le puede asignar una hoja del curso, por grupos (un curso normal tiene un solo grupo, sin título)
  function gruposParaAsignar(c) {
    if (!c.disperso) return [{ titulo: "", estudiantes: estudiantesOrdenados(c) }];
    const pool = poolDisperso(c);
    const dePool = new Set(pool.map((x) => x.id));
    const porGrupo = new Map();
    pool.forEach((x) => {
      if (!porGrupo.has(x.grupo)) porGrupo.set(x.grupo, []);
      porGrupo.get(x.grupo).push(x);
    });
    const grupos = Array.from(porGrupo.entries()).map(([titulo, estudiantes]) => ({ titulo, estudiantes: estudiantesOrdenados({ estudiantes }) }));
    const propios = c.estudiantes.filter((x) => !x.origenId || !dePool.has(x.origenId));
    if (propios.length) grupos.push({ titulo: "Agregados a mano", estudiantes: estudiantesOrdenados({ estudiantes: propios }) });
    return grupos;
  }

  // En un curso disperso se elige a un estudiante de otro curso del colegio: se copia a la
  // lista del grupo (misma persona, mismo RUT) y se devuelve el id de esa copia.
  function idLocal(c, id) {
    if (!c || !c.disperso || !id || c.estudiantes.some((x) => x.id === id)) return id;
    const ya = c.estudiantes.find((x) => x.origenId === id);
    if (ya) return ya.id;
    const o = poolDisperso(c).find((x) => x.id === id);
    if (!o) return id;
    const porRut = o.rut ? c.estudiantes.find((x) => x.rut === o.rut) : null;
    if (porRut) {
      Object.assign(porRut, { origenId: o.id, origenCursoId: o.cursoId, origenCurso: o.grupo });
      guardar("cursos", c);
      return porRut.id;
    }
    const nuevo = { id: PaesDB.nuevoId("e"), rut: o.rut, nombres: o.nombres, apellidos: o.apellidos, origenId: o.id, origenCursoId: o.cursoId, origenCurso: o.grupo };
    c.estudiantes.push(nuevo);
    guardar("cursos", c);
    return nuevo.id;
  }

  // el curso tal como entra a los resultados: en un disperso cuentan solo quienes tienen hoja
  function cursoParaResultados(c, ensayos) {
    if (!c.disperso) return c;
    const ids = new Set(ensayos.map((e) => e.id));
    const conHoja = new Set(est.hojas.filter((h) => ids.has(h.ensayoId) && vigente(h) && h.estudianteId).map((h) => h.estudianteId));
    return Object.assign({}, c, { estudiantes: c.estudiantes.filter((x) => conHoja.has(x.id)) });
  }

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

  // ------------------------------------------------------------ acciones: deshacer y rehacer

  // Diario de las últimas acciones. Cada acción guarda cómo estaba y cómo quedó cada registro
  // que tocó (cursos, ensayos, hojas, clavijeros), para poder volver atrás o repetirla.
  // Vive solo mientras la app está abierta y guarda como máximo MAX_ACCIONES.
  const MAX_ACCIONES = 10;
  const CLAVE_DE = { cursos: "id", ensayos: "id", hojas: "id", ajustes: "clave", imagenes: "hojaId" };
  const diario = { hechas: [], deshechas: [], pendiente: null, lectura: null, pausado: false, original: null, ocupado: false };
  const copia = (v) => (v === undefined || v === null ? undefined : JSON.parse(JSON.stringify(v)));

  const TITULOS_ACCION = {
    "eliminar-curso": "Eliminar curso",
    "eliminar-estudiante": "Quitar estudiante de la lista",
    "guardar-estudiante": "Editar estudiante de la lista",
    "confirmar-lista": "Cargar lista del curso",
    "crear-cursos-listas": "Crear cursos desde listas",
    "guardar-curso": "Guardar datos del curso",
    "guardar-ensayo": "Crear ensayo",
    "eliminar-ensayo": "Eliminar ensayo",
    asignar: "Asignar estudiante a una hoja",
    sugerencia: "Asignar estudiante a una hoja",
    "mover-hoja": "Pasar hoja a otro curso",
    "transferir-ok": "Transferir hoja a otro curso",
    "e-a-d": "Traspasar las E a D",
    revisada: "Marcar hoja como revisada",
    excluir: "No contar una hoja",
    incluir: "Volver a incluir una hoja",
    "no-repetida": "Contar una hoja repetida",
    "guardar-manual": "Agregar estudiante a mano",
    "ingresar-a-mano": "Ingresar respuestas a mano",
    resp: "Corregir una respuesta",
    "resp-leida": "Volver una respuesta a lo leído",
    "res-corregir-pdf": "Agregar ensayos PDF a un curso",
    "papelera-restaurar-curso": "Recuperar curso de la papelera",
    "papelera-restaurar-est": "Recuperar estudiante de la papelera",
    "papelera-purgar-curso": "Eliminar curso para siempre",
    "papelera-purgar-est": "Eliminar estudiante para siempre",
    "quitar-archivo": "Quitar archivo de hojas",
    "clv-guardar": "Guardar clavijero",
    "clv-eliminar": "Eliminar clavijero",
    "importar-kuder": "Importar cursos de Kuder",
    "guardar-inicio": "Guardar y volver al inicio",
    "mover-archivo-ok": "Cambiar de prueba un archivo de hojas",
    "fusionar-ok": "Fusionar cursos",
    "lista-oficial": "Marcar lista oficial o provisoria",
  };

  function abrirAccion(titulo) {
    const c = cursoActual();
    diario.pendiente = { titulo: titulo + (c ? ` · ${etiquetaCurso(c)}` : ""), entrada: null };
  }
  function tituloDeBoton(b) {
    if (TITULOS_ACCION[b.dataset.accion]) return TITULOS_ACCION[b.dataset.accion];
    const texto = (b.textContent || b.title || "").replace(/[^\p{L}\p{N} .,:«»()°-]/gu, "").replace(/\s+/g, " ").trim();
    return texto.length > 2 ? texto.slice(0, 60) : "Cambio";
  }
  function tituloDeCambio(t) {
    const d = t.dataset;
    if (d.archivo) return { lista: "Leer lista de curso", listas: "Leer listas de cursos", clave: "Cargar clave del ensayo", tabla: "Cargar tabla de conversión", hojas: "Subir hojas", clavijero: "Subir clavijero", disperso: "Crear grupo disperso" }[d.archivo] || "Cargar archivo";
    if (d.asignar) return "Asignar estudiante a una hoja";
    if (d.cambio === "clavijero-ensayo") return "Cambiar el clavijero del ensayo";
    if (d.clvClave || d.clvValida || d.clvCampo) return "Modificar clavijero";
    return "Cambio en un campo";
  }
  function nuevaEntrada(titulo) {
    return { id: PaesDB.nuevoId("a"), titulo, cuando: new Date().toISOString(), cambios: [], reversible: true, rehacible: true };
  }
  function entradaActual() {
    if (diario.pausado) return null;
    if (est.lectura && diario.lectura) return diario.lectura;
    const p = diario.pendiente;
    if (!p) return null;
    if (!p.entrada) p.entrada = nuevaEntrada(p.titulo);
    return p.entrada;
  }
  function alDiario(entrada) {
    if (diario.hechas.includes(entrada)) return;
    diario.hechas.push(entrada);
    while (diario.hechas.length > MAX_ACCIONES) diario.hechas.shift();
    diario.deshechas = [];
    pintarBarraAcciones();
  }
  function anotar(entrada, almacen, clave, antes, despues) {
    let c = entrada.cambios.find((x) => x.almacen === almacen && x.clave === clave);
    if (!c) {
      if (JSON.stringify(antes) === JSON.stringify(despues)) return;
      c = { almacen, clave, antes };
      entrada.cambios.push(c);
      alDiario(entrada);
    }
    c.despues = despues;
  }
  // una acción que borra hojas con sus imágenes no se puede deshacer, y lo anterior a ella tampoco
  function marcarIrreversible(entrada) {
    entrada.reversible = false;
    diario.hechas = [entrada];
    diario.deshechas = [];
    pintarBarraAcciones();
  }
  // envuelve el guardado local: cada escritura deja anotado el antes y el después
  function instalarDiario() {
    if (diario.original) return;
    const o = (diario.original = { poner: PaesDB.poner, ponerVarios: PaesDB.ponerVarios, borrar: PaesDB.borrar, borrarEnsayo: PaesDB.borrarEnsayo, borrarHojas: PaesDB.borrarHojas });
    const resumen = (almacen, v) => (almacen === "imagenes" ? (v ? { ensayoId: v.ensayoId } : undefined) : copia(v));
    PaesDB.poner = async (almacen, valor) => {
      const en = CLAVE_DE[almacen] ? entradaActual() : null;
      if (!en) return o.poner(almacen, valor);
      const antes = resumen(almacen, await PaesDB.obtener(almacen, valor[CLAVE_DE[almacen]]));
      const r = await o.poner(almacen, valor);
      anotar(en, almacen, valor[CLAVE_DE[almacen]], antes, resumen(almacen, valor));
      return r;
    };
    PaesDB.ponerVarios = async (pares) => {
      const en = entradaActual();
      if (!en) return o.ponerVarios(pares);
      const antes = [];
      for (const [almacen, valor] of pares) antes.push(CLAVE_DE[almacen] ? resumen(almacen, await PaesDB.obtener(almacen, valor[CLAVE_DE[almacen]])) : null);
      const r = await o.ponerVarios(pares);
      pares.forEach(([almacen, valor], i) => CLAVE_DE[almacen] && anotar(en, almacen, valor[CLAVE_DE[almacen]], antes[i], resumen(almacen, valor)));
      return r;
    };
    PaesDB.borrar = async (almacen, clave) => {
      const en = CLAVE_DE[almacen] ? entradaActual() : null;
      if (!en) return o.borrar(almacen, clave);
      const antes = resumen(almacen, await PaesDB.obtener(almacen, clave));
      const r = await o.borrar(almacen, clave);
      anotar(en, almacen, clave, antes, undefined);
      return r;
    };
    PaesDB.borrarEnsayo = async (...args) => {
      const en = entradaActual();
      if (en) marcarIrreversible(en);
      return o.borrarEnsayo(...args);
    };
    PaesDB.borrarHojas = async (...args) => {
      const en = entradaActual();
      if (en) marcarIrreversible(en);
      return o.borrarHojas(...args);
    };
  }

  // vuelve a leer todo del guardado y repinta (después de deshacer o rehacer)
  async function recargarTrasDiario() {
    diario.pausado = true;
    try {
      est.deshacer = [];
      est.resumenLectura = null;
      await cargarDatos();
    } finally {
      diario.pausado = false;
    }
    pintar();
  }

  // Deshacer: devuelve la última acción a como estaba antes de hacerla.
  async function deshacerAccion() {
    const en = diario.hechas[diario.hechas.length - 1];
    if (!en || !en.reversible || est.lectura || diario.ocupado) return false;
    const o = diario.original;
    diario.ocupado = diario.pausado = true;
    try {
      clearTimeout(guardadoPendiente);
      const hojasNuevas = [];
      for (const c of en.cambios.slice().reverse()) {
        if (c.almacen === "imagenes") {
          if (c.antes && c.despues) {
            const img = await PaesDB.obtener("imagenes", c.clave);
            if (img) await o.poner("imagenes", Object.assign(img, { ensayoId: c.antes.ensayoId }));
          }
        } else if (c.antes === undefined) {
          if (c.almacen === "hojas") hojasNuevas.push(c.clave);
          else await o.borrar(c.almacen, c.clave);
        } else await o.poner(c.almacen, c.antes);
      }
      if (hojasNuevas.length) {
        // hojas que la acción había leído: se van con sus imágenes, y por eso no se puede rehacer
        await o.borrarHojas(hojasNuevas);
        en.rehacible = false;
      }
    } catch (e) {
      console.error(e);
      toast("No se pudo deshacer: " + (e && e.message ? e.message : "error del guardado local"));
    } finally {
      diario.ocupado = diario.pausado = false;
    }
    diario.hechas.pop();
    if (en.rehacible) diario.deshechas.push(en);
    else diario.deshechas = [];
    await recargarTrasDiario();
    toast(`Se deshizo: ${en.titulo}`);
    return true;
  }

  // Rehacer: vuelve a aplicar la última acción que se deshizo (solo mientras no hagas otra cosa nueva).
  async function rehacerAccion() {
    const en = diario.deshechas[diario.deshechas.length - 1];
    if (!en || est.lectura || diario.ocupado) return false;
    const o = diario.original;
    diario.ocupado = diario.pausado = true;
    try {
      for (const c of en.cambios) {
        if (c.almacen === "imagenes") {
          if (c.antes && c.despues) {
            const img = await PaesDB.obtener("imagenes", c.clave);
            if (img) await o.poner("imagenes", Object.assign(img, { ensayoId: c.despues.ensayoId }));
          }
        } else if (c.despues === undefined) await o.borrar(c.almacen, c.clave);
        else await o.poner(c.almacen, c.despues);
      }
    } catch (e) {
      console.error(e);
      toast("No se pudo rehacer: " + (e && e.message ? e.message : "error del guardado local"));
    } finally {
      diario.ocupado = diario.pausado = false;
    }
    diario.deshechas.pop();
    diario.hechas.push(en);
    await recargarTrasDiario();
    toast(`Se rehízo: ${en.titulo}`);
    return true;
  }

  // deshace desde la más reciente hasta la acción indicada, inclusive
  async function deshacerHasta(id) {
    const i = diario.hechas.findIndex((x) => x.id === id);
    if (i < 0) return;
    let veces = diario.hechas.length - i;
    while (veces-- > 0) if (!(await deshacerAccion())) break;
  }

  // botones fijos abajo, visibles mientras se trabaja en Ensayos PAES
  function pintarBarraAcciones() {
    let barra = document.getElementById("paes-acciones-barra");
    if (!est.activo || !est.listo) {
      if (barra) barra.remove();
      return;
    }
    if (!barra) {
      barra = document.createElement("div");
      barra.id = "paes-acciones-barra";
      barra.className = "paes-acciones-barra";
      barra.addEventListener("click", (ev) => {
        const b = ev.target.closest("button");
        if (!b || b.disabled) return;
        if (b.dataset.que === "deshacer") deshacerAccion();
        else if (b.dataset.que === "rehacer") rehacerAccion();
        else {
          est.vista = "acciones";
          pintar();
          global.scrollTo({ top: 0 });
        }
      });
      document.body.appendChild(barra);
    }
    const ultima = diario.hechas[diario.hechas.length - 1];
    const vuelta = diario.deshechas[diario.deshechas.length - 1];
    barra.innerHTML = `<button type="button" data-que="deshacer" ${ultima && ultima.reversible && !est.lectura ? "" : "disabled"} title="${ultima ? "Deshacer: " + esc(ultima.titulo) : "No hay acciones para deshacer"}">↩ Deshacer</button>
      <button type="button" data-que="rehacer" ${vuelta && !est.lectura ? "" : "disabled"} title="${vuelta ? "Rehacer: " + esc(vuelta.titulo) : "No hay nada que rehacer"}">↪ Rehacer</button>
      <button type="button" data-que="ver" class="ver" title="Ver las últimas acciones">🕓 ${diario.hechas.length}</button>`;
  }

  function htmlVistaAcciones() {
    const hora = (iso) => new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    const ultima = diario.hechas[diario.hechas.length - 1];
    const vuelta = diario.deshechas[diario.deshechas.length - 1];
    let h = `<div class="tarjeta"><h2>Acciones</h2>
      <p class="ayuda"><b>Deshacer</b> devuelve la última acción a como estaba antes de hacerla. <b>Rehacer</b> vuelve a aplicar lo que acabas de deshacer, por si te arrepientes; deja de estar disponible apenas haces una acción nueva. Se guardan las últimas ${MAX_ACCIONES} acciones, solo mientras la app está abierta: al cerrar o recargar la página, la lista se vacía (los datos no se pierden).</p>
      <div class="acciones-form" style="margin-top:0;">
        <button type="button" data-accion="accion-deshacer" ${ultima && ultima.reversible && !est.lectura ? "" : "disabled"}>↩ Deshacer${ultima ? ": " + esc(ultima.titulo) : ""}</button>
        <button type="button" class="secundario" data-accion="accion-rehacer" ${vuelta && !est.lectura ? "" : "disabled"}>↪ Rehacer${vuelta ? ": " + esc(vuelta.titulo) : ""}</button>
      </div></div>`;
    h += `<div class="tarjeta"><h2 style="font-size:16px;">Últimos cambios (${diario.hechas.length})</h2>`;
    if (!diario.hechas.length) h += `<p class="ayuda" style="margin:0;">Aún no hay acciones en esta sesión.</p>`;
    else {
      h += `<div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>Hora</th><th>Acción</th><th>Qué tocó</th><th></th></tr></thead><tbody>`;
      diario.hechas.slice().reverse().forEach((en, i) => {
        const cuenta = {};
        en.cambios.forEach((c) => c.almacen !== "imagenes" && (cuenta[c.almacen] = (cuenta[c.almacen] || 0) + 1));
        const nombres = { cursos: ["curso", "cursos"], ensayos: ["ensayo", "ensayos"], hojas: ["hoja", "hojas"], ajustes: ["clavijero guardado", "clavijeros guardados"] };
        const que = Object.keys(cuenta).map((k) => plural(cuenta[k], nombres[k][0], nombres[k][1])).join(" · ") || "—";
        h += `<tr><td class="num">${esc(hora(en.cuando))}</td><td>${esc(en.titulo)}</td><td>${esc(que)}</td>
          <td class="acciones">${en.reversible ? `<button type="button" class="${i ? "secundario " : ""}chico" data-accion="accion-deshacer-hasta" data-id="${esc(en.id)}" ${est.lectura ? "disabled" : ""}>${i ? `↩ Deshacer hasta aquí (${i + 1} acciones)` : "↩ Deshacer"}</button>` : `<span class="ayuda">No se puede deshacer (borró hojas con sus imágenes)</span>`}</td></tr>`;
      });
      h += `</tbody></table></div>`;
    }
    h += `</div>`;
    if (diario.deshechas.length) {
      h += `<div class="tarjeta"><h2 style="font-size:16px;">Deshechas, que se pueden rehacer (${diario.deshechas.length})</h2><ul class="paes-no-rindieron">${diario.deshechas.slice().reverse().map((en) => `<li>${esc(en.titulo)} <small>${esc(hora(en.cuando))}</small></li>`).join("")}</ul></div>`;
    }
    return h;
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
    pintarBarraAcciones();
  }

  async function iniciar() {
    raiz = document.getElementById("modulo-paes");
    if (!raiz) return;
    instalarDiario();
    document.querySelectorAll('.test-btn[data-modulo="paes"]').forEach((b) => b.addEventListener("click", activar));
    document.querySelectorAll(".test-btn[data-test]").forEach((b) => b.addEventListener("click", desactivar, true));
    raiz.addEventListener("click", alClic);
    raiz.addEventListener("pointerdown", alBajarEnEditor);
    raiz.addEventListener("pointerover", alPasarEnEditor);
    global.addEventListener("pointerup", alSoltarEnEditor);
    global.addEventListener("beforeunload", (ev) => {
      if (est.editor && est.editor.hojas.some((x) => x.curso)) {
        ev.preventDefault();
        ev.returnValue = "";
      }
    });
    raiz.addEventListener("change", alCambiar);
    raiz.addEventListener("input", alEscribir);
    raiz.addEventListener("keydown", (ev) => {
      const t = ev.target;
      if (!t.dataset || !t.dataset.buscar) return;
      const caja = raiz.querySelector(`[data-sug="${t.dataset.buscar}"]`);
      if (ev.key === "Escape" && caja) {
        t.value = "";
        caja.innerHTML = "";
      }
      if (ev.key === "Enter" && caja) {
        ev.preventDefault();
        const opciones = caja.querySelectorAll(".paes-sug");
        if (opciones.length === 1) opciones[0].click();
        else if (opciones.length > 1) toast("Hay varias opciones: elige una de la lista o escribe un poco más");
      }
    });
    raiz.addEventListener("dragover", (ev) => {
      if (ev.target.closest(".paes-zona-subir")) ev.preventDefault();
    });
    raiz.addEventListener("drop", (ev) => {
      if (!ev.target.closest(".paes-zona-subir")) return;
      ev.preventDefault();
      if (!ev.dataTransfer || !ev.dataTransfer.files.length) return;
      abrirAccion("Subir archivos");
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
      // los cursos eliminados quedan en la papelera, con sus ensayos y hojas, hasta que se recuperen o se borren
      const idsPapelera = new Set();
      est.papelera = cursos.filter((c) => c.eliminado).map((c) => {
        const suyos = ensayos.filter((e) => e.cursoId === c.id);
        suyos.forEach((e) => idsPapelera.add(e.id));
        const ids = new Set(suyos.map((e) => e.id));
        return { curso: c, ensayos: suyos, hojas: hojas.filter((h) => ids.has(h.ensayoId)) };
      });
      est.cursos = cursos.filter((c) => !c.eliminado);
      est.ensayos = ensayos.filter((e) => !idsPapelera.has(e.id));
      est.hojas = hojas.filter((h) => !idsPapelera.has(h.ensayoId));
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
      if (c.id === cursoId || c.disperso) return;
      c.estudiantes.forEach((e) => otros.push({ id: e.id, rut: e.rut, cursoId: c.id }));
    });
    return otros;
  }

  // busca a quién corresponde una hoja; si el RUT calza exacto con uno del curso, la asigna
  function vincular(hoja, curso) {
    if (curso.disperso) {
      // el RUT se busca entre los estudiantes de los cursos del colegio y los agregados a mano
      const candidatos = poolDisperso(curso).concat(curso.estudiantes.filter((x) => !x.origenId));
      const vd = L.vincularHoja(hoja.lectura.id, candidatos, [], new Set());
      hoja.vinculo = vd.tipo;
      if (vd.tipo === "exacta") {
        hoja.estudianteId = idLocal(curso, vd.estudianteId);
        hoja.asignacion = "exacta";
      }
      return vd;
    }
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
        : `<div id="paes-panel">${est.vista === "resultados" ? htmlVistaResultados() : est.vista === "clavijeros" ? htmlVistaClavijeros() : est.vista === "papelera" ? htmlVistaPapelera() : est.vista === "acciones" ? htmlVistaAcciones() : est.vista === "config" ? htmlVistaConfig() : est.vista === "editor" ? htmlVistaEditor() : htmlVistaCarpetas()}</div>`) +
      `<div id="paes-visor" class="modal-overlay" style="display:none;"></div>`;
    global.scrollTo(0, y);
    if (est.vista === "editor") refrescarEditor();
    if (visorEd) {
      if (est.vista === "editor" && est.editor && est.editor.hojas[visorEd.i]) raiz.appendChild(visorEd.el);
      else cerrarVisorEditor();
    }
    cargarImagenes();
    actualizarConteo();
    pintarBarraAcciones();
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
    </div>` + htmlEntradaEditor() + htmlFormDisperso() + htmlFormCurso();
  }

  // anuncia el Editor de PDF desde «Trabajar un curso», para quien no sabe que existe
  function htmlEntradaEditor() {
    return `<div class="tarjeta"><h2 style="font-size:16px;">Ingresar cursos con edición de PDF</h2>
      <p class="ayuda">Para cuando <b>un mismo PDF trae hojas de más de un curso</b> (por ejemplo, escaneaste juntos el 4° A, el 4° B y el 4° C). Ves las hojas en el orden en que salieron del escáner, marcas cuáles son de cada curso y eliges el clavijero: la app reparte y corrige cada grupo en su curso.</p>
      <div class="acciones-form" style="margin-top:0;"><button type="button" data-vista="editor">✂️ Abrir el Editor de PDF</button></div></div>`;
  }

  function htmlFormDisperso() {
    const intro = `<h2 style="font-size:16px;">Agregar curso disperso</h2>
      <p class="ayuda">Para cuando de un colegio rindieron solo algunos estudiantes y no un curso completo. Subes el PDF, indicas el colegio y las hojas pasan a la revisión, donde asignas a cada estudiante con el buscador. No necesita lista oficial.</p>`;
    if (!est.formDisperso) return `<div class="tarjeta">${intro}<div class="acciones-form" style="margin-top:0;"><button type="button" data-accion="abrir-disperso">➕ Agregar curso disperso</button></div></div>`;
    return `<div class="tarjeta">${intro}
      <div class="grid-form">
        <div class="campo-ancho"><label>Colegio *</label><input type="text" id="paes-disp-colegio" list="paes-colegios-disp" autocomplete="off" placeholder="Ej: CMC" />
          <datalist id="paes-colegios-disp">${colegiosConocidos().map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist></div>
        <div class="campo-ancho"><label>Prueba que rindieron *</label><select id="paes-disp-prueba">
          ${est.clavijeros.length ? `<optgroup label="Con un clavijero subido">${est.clavijeros.map((k) => `<option value="k:${esc(k.id)}">${esc(k.nombre)} · ${esc(nombrePruebaDe(k))}</option>`).join("")}</optgroup>` : ""}
          <optgroup label="Sin clavijero todavía (la clave se carga después)">${Object.values(L.PRUEBAS_PAES).map((p) => `<option value="p:${p.id}">${esc(p.nombre)}</option>`).join("")}</optgroup></select></div>
        <div><label>Fecha de aplicación</label><input type="date" id="paes-disp-fecha" value="${hoyIso()}" /></div>
      </div>
      <div class="acciones-form">
        <input type="file" data-archivo="disperso" accept=".pdf,image/*" multiple style="display:none;" />
        <button type="button" data-accion="elegir-disperso" ${est.lectura ? "disabled" : ""}>📤 Elegir el PDF y pasar a revisión…</button>
        <button type="button" class="secundario" data-accion="abrir-disperso">Cancelar</button>
      </div>
    </div>`;
  }

  // crea un ensayo en un curso, con un clavijero guardado o con la clave en blanco
  async function crearEnsayoCon(c, o) {
    const def = L.PRUEBAS_PAES[o.prueba] || { preguntas: 65, alternativas: 4 };
    const k = o.clavijero || null;
    const e = {
      id: PaesDB.nuevoId("en"),
      cursoId: c.id,
      prueba: o.prueba,
      pruebaNombre: o.pruebaNombre || "",
      forma: o.forma || (k && k.forma) || "",
      fecha: o.fecha || "",
      alternativas: k ? k.alternativas || def.alternativas : def.alternativas,
      plantilla: PLANTILLA_PAES_POR_DEFECTO,
      clave: k ? copiaClave(k.clave) : Array.from({ length: def.preguntas }, (_, i) => ({ n: i + 1, r: "", valida: true })),
      claveVersion: k ? 1 : 0,
      tabla: (L.TABLAS_PAES[o.prueba] || []).slice(),
      tablaVersion: 1,
      archivos: [],
      creado: new Date().toISOString(),
    };
    if (k) e.clavijeroId = k.id;
    est.ensayos.push(e);
    await guardar("ensayos", e);
    return e;
  }

  async function crearDisperso(archivos) {
    const colegio = raiz.querySelector("#paes-disp-colegio").value.replace(/\s+/g, " ").trim();
    const eleccion = raiz.querySelector("#paes-disp-prueba").value;
    const fecha = raiz.querySelector("#paes-disp-fecha").value || "";
    if (!colegio) {
      toast("Escribe el colegio del grupo disperso.");
      return;
    }
    const k = eleccion.startsWith("k:") ? est.clavijeros.find((x) => x.id === eleccion.slice(2)) : null;
    const prueba = k ? k.prueba : eleccion.slice(2);
    const anio = new Date().getFullYear();
    // un grupo disperso por colegio y año: si ya existe, el ensayo se suma a ese grupo
    let c = est.cursos.find((x) => x.disperso && normColegio(x.colegio) === normColegio(colegio) && x.anio === anio);
    if (!c) {
      const conocido = est.cursos.find((x) => normColegio(x.colegio) === normColegio(colegio));
      c = { id: PaesDB.nuevoId("c"), colegio: conocido ? conocido.colegio : colegio, nivel: NIVEL_DISPERSO, letra: "", anio, estudiantes: [], disperso: true, creado: new Date().toISOString() };
      est.cursos.push(c);
      await guardar("cursos", c);
    }
    let e = ensayosDelCurso(c.id).find((x) => (k ? x.clavijeroId === k.id : x.prueba === prueba && !x.clavijeroId));
    if (!e) e = await crearEnsayoCon(c, { prueba, pruebaNombre: k ? k.pruebaNombre : "", fecha, clavijero: k });
    Object.assign(est, { cursoId: c.id, ensayoId: e.id, enBlanco: false, formCurso: null, formDisperso: false, tanda: [], listas: null, previa: null, paso: "hojas", vista: "curso" });
    pintar();
    await subirHojas(archivos);
    if (hojasDelEnsayo(e.id).length) est.paso = "revision";
    pintar();
    global.scrollTo({ top: 0 });
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
    return { uid: PaesDB.nuevoId("l"), archivo: nombreArchivo, colegio: a.colegio, nivel: a.nivel, letra: a.letra, anio: new Date().getFullYear(), estudiantes, repetidos, avisos: avisos || [], origenCursoId: null, oficial: true };
  }

  // lee archivos de lista y agrega a «tarjetas» una por cada curso que traigan
  async function leerTarjetasDeListas(archivos, tarjetas, fallas) {
    for (const archivo of archivos) {
      try {
        const todas = (await hojasDeArchivo(archivo)).map((h) => ({ nombre: h.nombre, r: L.leerListaCurso(h.filas) }));
        const conLista = todas.filter((x) => x.r.estudiantes.length);
        if (!conLista.length) {
          fallas.push(`«${archivo.name}»: ${(todas[0] && todas[0].r.avisos[0]) || "no se encontraron estudiantes."}`);
          continue;
        }
        // un Excel con varias hojas, o con varios cursos en una columna: un curso nuevo por cada uno
        conLista.forEach(({ nombre, r }) => {
          const etiqueta = conLista.length > 1 ? `${archivo.name} · hoja «${nombre}»` : archivo.name;
          const pista = conLista.length > 1 ? nombre : "";
          const filas = r.estudiantes.map((e) => ({ nombres: e.nombres, apellidos: e.apellidos, rut: L.formatearRutPaes(e.rut), curso: e.curso || "" }));
          const cursos = Array.from(new Set(filas.map((f) => f.curso)));
          const tarjeta = (texto, lista) => {
            const t = tarjetaDeLista(archivo.name, texto, lista, r.avisos);
            t.archivo = etiqueta;
            tarjetas.push(t);
          };
          if (cursos.length > 1) cursos.forEach((k) => tarjeta(k || pista, filas.filter((f) => f.curso === k)));
          else tarjeta(r.cursoDetectado || cursos[0] || pista, filas);
        });
      } catch (e) {
        console.error(e);
        fallas.push(`«${archivo.name}» no se pudo leer. ¿Es un Excel (.xls, .xlsx) o un CSV?`);
      }
    }
  }

  async function leerListasNuevas(archivos) {
    const tarjetas = est.listas ? est.listas.slice() : [];
    const fallas = [];
    await leerTarjetasDeListas(archivos, tarjetas, fallas);
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
        <label class="paes-lista-oficial"><input type="checkbox" data-lista="oficial" data-i="${i}" ${t.oficial !== false ? "checked" : ""} /> Es la lista oficial del curso</label>
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
      listaOficial: t.oficial !== false,
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

  // ¿la lista del curso es la oficial?
  const chipLista = (c) => (!c.estudiantes.length ? "" : c.listaOficial === true ? `<span class="paes-chip verde">✔ Lista oficial</span>` : c.listaOficial === false ? `<span class="paes-chip amarillo">Lista provisoria</span>` : `<span class="paes-chip gris" title="Este curso se cargó antes de que existiera esta marca">Lista sin marcar</span>`);

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
          ${chipLista(c)}
          ${c.estudiantes.length ? `<button type="button" class="secundario chico" data-accion="lista-oficial">${c.listaOficial === true ? "Marcar como provisoria" : "Marcar como oficial"}</button>` : ""}
          <button type="button" class="chico" data-accion="nuevo-curso">➕ Ingresar nuevo curso</button>
          <button type="button" class="secundario chico" data-accion="editar-curso" title="Cambia el colegio, el nivel, la letra o el año de ESTE curso">✏️ Editar datos de este curso</button>
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
      <p class="ayuda">${lista.length ? "Con esta lista se vinculan las hojas por RUT. Puedes corregir un nombre o un RUT, agregar a alguien o cargar otro archivo: al cargarlo eliges si se suma a esta lista o la reemplaza, y si es la oficial. Si la lista es de otro curso, usa «Ingresar nuevo curso»." : "Sube el Excel de la lista (.xls, .xlsx o .csv) con el nombre completo y el RUT de cada estudiante. Vas a ver una vista previa para corregir antes de confirmar."}</p>
      <div class="acciones-form" style="margin-top:0;">
        <input type="file" data-archivo="lista" accept=".xls,.xlsx,.csv" style="display:none;" />
        <button type="button" data-accion="elegir-lista">📤 ${lista.length ? "Cargar otra lista (sumar o reemplazar)…" : "Subir la lista del curso…"}</button>
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
          h += `<tr><td class="num">${i + 1}</td><td>${esc(e.nombres)}</td><td>${esc(e.apellidos)}</td><td class="rut">${esc(L.formatearRutPaes(e.rut))}</td><td>${insigniaRut(e.rut)}${e.fueraDeLista ? ` <span class="paes-chip amarillo" title="Tiene una hoja, pero no viene en la lista que reemplazó a la anterior">fuera de la lista</span>` : ""}</td>
            <td class="acciones"><button type="button" class="secundario chico" data-accion="editar-estudiante" data-id="${esc(e.id)}">✏️</button>
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
    h += `<div class="paes-lista-opciones">
        <label><input type="checkbox" data-previa-op="oficial" ${p.oficial !== false ? "checked" : ""} /> Esta es la <b>lista oficial</b> del curso <small>(desmárcalo si es una lista provisoria; después la puedes cambiar por la oficial)</small></label>
        ${c.estudiantes.length ? `<label><input type="radio" name="paes-previa-modo" data-previa-op="modo" value="sumar" ${p.modo !== "reemplazar" ? "checked" : ""} /> <b>Sumar</b> a la lista actual <small>(mismo RUT se actualiza, los nuevos se agregan, nadie se quita)</small></label>
        <label><input type="radio" name="paes-previa-modo" data-previa-op="modo" value="reemplazar" ${p.modo === "reemplazar" ? "checked" : ""} /> <b>Reemplazar</b> la lista actual por esta <small>(quien no venga aquí sale del curso y queda en la papelera; si tiene una hoja, se conserva marcado «fuera de la lista»)</small></label>` : ""}
      </div>
      <div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>N°</th><th>Nombres</th><th>Apellidos</th><th>RUT</th><th></th><th>Como venía en el archivo</th><th></th></tr></thead><tbody>`;
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

  // todas las hojas de un Excel (un CSV tiene una sola), cada una como matriz de textos
  async function hojasDeArchivo(archivo) {
    const datos = new Uint8Array(await archivo.arrayBuffer());
    const libro = XLSX.read(datos, { type: "array", raw: false, cellDates: false });
    return libro.SheetNames.map((nombre) => ({ nombre, filas: XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: false, defval: "", blankrows: false }) }));
  }

  async function leerArchivoLista(archivo) {
    try {
      const leidas = (await hojasDeArchivo(archivo)).map((h) => L.leerListaCurso(h.filas)).filter((x) => x.estudiantes.length);
      if (leidas.length > 1) {
        // el Excel trae varias hojas con listas: cada una crea un curso aparte
        est.listas = null;
        await leerListasNuevas([archivo]);
        toast(`El archivo trae ${leidas.length} hojas con listas: cada una crea un curso aparte. Quita las que no quieras.`);
        return;
      }
      const r = leidas[0] || L.leerListaCurso(await filasDeArchivo(archivo));
      if (!r.estudiantes.length) {
        toast(r.avisos[0] || "No se encontraron estudiantes en el archivo.");
        return;
      }
      est.previa = {
        archivo: archivo.name,
        avisos: r.avisos,
        cursos: r.cursos || [],
        cursoElegido: "",
        oficial: true,
        modo: "sumar",
        estudiantes: r.estudiantes.map((e, i) => ({ i, nombres: e.nombres, apellidos: e.apellidos, rut: L.formatearRutPaes(e.rut), curso: e.curso, nombreOriginal: e.nombreOriginal, nombreSeguro: e.nombreSeguro, nombreRaro: e.nombreRaro })),
      };
      est.editEst = null;
      pintar();
    } catch (e) {
      console.error(e);
      toast("No se pudo leer el archivo. ¿Es un Excel (.xls, .xlsx) o un CSV?");
    }
  }

  // Guarda una lista en un curso, con las mismas reglas en toda la app: se calza por RUT,
  // «sumar» agrega y actualiza, «reemplazar» saca a quien no viene (salvo que tenga hoja).
  async function aplicarListaACurso(c, filasCrudas, p) {
    const filas = filasCrudas.filter((e) => (String(e.nombres || "") + String(e.apellidos || "") + String(e.rut || "")).trim());
    const porRut = new Map(c.estudiantes.filter((e) => e.rut).map((e) => [e.rut, e]));
    let nuevos = 0, actualizados = 0, repetidos = 0;
    const vistos = new Set();
    const deLaLista = new Set(); // ids de quienes vienen en esta lista
    filas.forEach((f) => {
      const rut = L.leerRut(f.rut).rut;
      if (rut && vistos.has(rut)) {
        repetidos++;
        return;
      }
      if (rut) vistos.add(rut);
      const existente = rut ? porRut.get(rut) : null;
      if (existente) {
        existente.nombres = String(f.nombres || "").trim();
        existente.apellidos = String(f.apellidos || "").trim();
        delete existente.fueraDeLista;
        deLaLista.add(existente.id);
        actualizados++;
      } else {
        const nuevo = { id: PaesDB.nuevoId("e"), rut, nombres: String(f.nombres || "").trim(), apellidos: String(f.apellidos || "").trim() };
        c.estudiantes.push(nuevo);
        deLaLista.add(nuevo.id);
        nuevos++;
      }
    });
    // «Reemplazar»: quien no viene en la lista nueva sale del curso (queda en la papelera),
    // salvo que tenga una hoja: ese se conserva, marcado como «fuera de la lista».
    let quitados = 0, fuera = 0;
    if (p.modo === "reemplazar") {
      const ensayos = new Set(ensayosDelCurso(c.id).map((e) => e.id));
      const conHoja = new Set(est.hojas.filter((h) => ensayos.has(h.ensayoId) && h.estudianteId).map((h) => h.estudianteId));
      const ahora = new Date().toISOString();
      c.estudiantes = c.estudiantes.filter((x) => {
        if (deLaLista.has(x.id)) return true;
        if (conHoja.has(x.id)) {
          x.fueraDeLista = true;
          fuera++;
          return true;
        }
        c.eliminados = (c.eliminados || []).concat([Object.assign({}, x, { eliminado: ahora, hojasQueTenia: [] })]);
        quitados++;
        return false;
      });
    }
    c.listaArchivo = p.archivo;
    c.listaOficial = p.oficial !== false;
    await guardar("cursos", c);
    const vinculadas = await revincularCurso(c);
    return { nuevos, actualizados, repetidos, quitados, fuera, vinculadas };
  }

  async function confirmarLista() {
    const c = cursoActual();
    const p = est.previa;
    if (!c || !p) return;
    const filas = (p.cursoElegido ? p.estudiantes.filter((e) => e.curso === p.cursoElegido) : p.estudiantes).filter((e) => (e.nombres + e.apellidos + e.rut).trim());
    const { nuevos, actualizados, repetidos, quitados, fuera, vinculadas } = await aplicarListaACurso(c, filas, { archivo: p.archivo, oficial: p.oficial, modo: p.modo });
    est.previa = null;
    pintar();
    toast(`Lista ${c.listaOficial ? "oficial" : "provisoria"} guardada: ${plural(nuevos, "estudiante nuevo", "estudiantes nuevos")}${actualizados ? `, ${plural(actualizados, "actualizado", "actualizados")}` : ""}${repetidos ? `, ${plural(repetidos, "repetido omitido", "repetidos omitidos")}` : ""}${quitados ? `, ${plural(quitados, "quitado (está en la papelera)", "quitados (están en la papelera)")}` : ""}${fuera ? `, ${plural(fuera, "con hoja quedó marcado «fuera de la lista»", "con hoja quedaron marcados «fuera de la lista»")}` : ""}${vinculadas ? ` · ${plural(vinculadas, "hoja vinculada", "hojas vinculadas")}` : ""}`);
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
      texto: `Se va a eliminar ${c.colegio} · ${etiquetaCurso(c)} con su lista (${plural(c.estudiantes.length, "estudiante", "estudiantes")}), ${plural(ensayos.length, "ensayo", "ensayos")} y ${plural(nHojas, "hoja leída", "hojas leídas")}. Queda en la papelera, desde donde lo puedes recuperar.`,
      textoBoton: "Eliminar el curso",
      onConfirmar: async () => {
        c.eliminado = new Date().toISOString();
        await guardar("cursos", c);
        const idsEnsayos = new Set(ensayos.map((e) => e.id));
        est.papelera.push({ curso: c, ensayos, hojas: est.hojas.filter((h) => idsEnsayos.has(h.ensayoId)) });
        est.hojas = est.hojas.filter((h) => !idsEnsayos.has(h.ensayoId));
        est.ensayos = est.ensayos.filter((e) => e.cursoId !== c.id);
        est.cursos = est.cursos.filter((k) => k.id !== c.id);
        est.cursoId = null;
        pintar();
        barraDeshacer(`Se eliminó ${c.colegio} · ${etiquetaCurso(c)}`, async () => {
          await restaurarCurso(c.id);
          Object.assign(est, { cursoId: c.id, enBlanco: false });
          pintar();
        });
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

  // quita a un estudiante de la lista: queda en la papelera y se puede deshacer
  async function eliminarEstudiante(id) {
    const c = cursoActual();
    const e = c && c.estudiantes.find((k) => k.id === id);
    if (!e) return;
    const suyas = est.hojas.filter((h) => h.estudianteId === id);
    c.estudiantes = c.estudiantes.filter((k) => k.id !== id);
    c.eliminados = (c.eliminados || []).concat([Object.assign({}, e, { eliminado: new Date().toISOString(), hojasQueTenia: suyas.map((h) => ({ id: h.id, asignacion: h.asignacion })) })]);
    await guardar("cursos", c);
    await revincularCurso(c);
    pintar();
    barraDeshacer(`Se quitó a ${L.nombreCompletoPaes(e)} de la lista${suyas.length ? ` (${plural(suyas.length, "hoja suya quedó", "hojas suyas quedaron")} sin identificar)` : ""}`, () => restaurarEstudiante(c.id, id));
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
  // cuántas respuestas cambian entre la clave actual y una nueva
  function diferenciasDeClave(actual, nueva) {
    const porN = new Map(nueva.map((k) => [k.n, k.r]));
    return actual.filter((k) => k.r && porN.get(k.n) && porN.get(k.n) !== k.r).length;
  }

  // Si la clave nueva es muy distinta de la actual y el ensayo ya tiene hojas, lo más probable
  // es que sea la clave de otra prueba: se pregunta antes de reemplazar.
  function confirmarClaveDistinta(e, nueva) {
    const con = e.clave.filter((k) => k.r).length;
    const dif = diferenciasDeClave(e.clave, nueva);
    const nHojas = hojasDelEnsayo(e.id).length;
    if (!nHojas || con < 10 || dif <= Math.max(8, con * 0.2)) return Promise.resolve(true);
    return new Promise((ok) => {
      confirmar({
        titulo: "Esta clave parece de otra prueba",
        texto: `Cambian ${dif} de las ${con} respuestas de la clave de ${nombrePrueba(e)}, que ya tiene ${plural(nHojas, "hoja corregida", "hojas corregidas")}. Si esta clave es de otra prueba (por ejemplo, M1), cancela y en el paso 3 elige «Otra prueba»: así cada clavijero se aplica solo a las hojas de su prueba.`,
        textoBoton: "Es la misma prueba: reemplazar la clave",
        onConfirmar: () => ok(true),
        onCancelar: () => ok(false),
      });
    });
  }

  async function reemplazarClave(e, nueva, origen) {
    // una clave cargada entera no debe cambiar el clavijero que también usan otros cursos
    const compartido = clavijeroDe(e);
    if (compartido && ensayosConClavijero(compartido.id).length > 1 && diferenciasDeClave(compartido.clave, nueva) > 3) e.clavijeroId = null;
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
      if (!(await confirmarClaveDistinta(e, r.clave))) return;
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
    if (!(await confirmarClaveDistinta(e, r.clave))) return;
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
    const k0 = clavijeroDe(e);
    let h = htmlPruebasDelCurso(c, e) + `<div class="tarjeta">
      <h2>Subir hojas de ${esc(nombrePrueba(e))}</h2>
      <p class="paes-nota" style="margin-top:0;">Todo lo que subas aquí se corrige con <b>${k0 ? "el clavijero «" + esc(k0.nombre) + "»" : e.clave.some((q) => q.r) ? "la clave de este ensayo" : "la clave que cargues en el paso 2"}</b> (${esc(nombrePrueba(e))}). Si los PDF son de otra prueba, elígela arriba antes de subirlos.</p>
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
      h += `<div class="tarjeta"><h2 style="font-size:16px;">Archivos subidos de ${esc(nombrePrueba(e))}</h2>
        <div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>Archivo</th><th>Hojas</th><th>Listas</th><th>Por revisar</th><th>Subido</th><th></th></tr></thead><tbody>`;
      grupos.forEach((g) => {
        const calza = pruebaQueCalzaMejor(e, g.hojas);
        if (calza) {
          h += `<tr class="paes-fila-duda"><td colspan="6"><div class="paes-alerta-lista" style="margin:0;"><p>⚠ <b>Las hojas de «${esc(g.nombre)}» parecen ser de ${esc(nombrePruebaDe(calza.clavijero))}.</b> Con el clavijero «${esc(calza.clavijero.nombre)}» calza el ${numero(calza.ajuste * 100)} % de las respuestas; con el de ${esc(nombrePrueba(e))}, solo el ${numero(calza.propio * 100)} %.</p>
            <button type="button" data-accion="mover-archivo-ok" data-clave="${esc(g.clave)}" data-destino="k:${esc(calza.clavijero.id)}" ${est.lectura ? "disabled" : ""}>Pasar estas hojas a ${esc(nombrePruebaDe(calza.clavijero))}</button></div></td></tr>`;
        }
        const estados = g.hojas.map((x) => estadoDeHoja(x, adv.get(x.id) || []));
        const registro = [e].concat(hermanos(e)).reduce((a, x) => a.concat(x.archivos || []), []).find((a) => a.huella === g.clave);
        h += `<tr><td>${esc(g.nombre)}</td><td class="num">${g.hojas.length}</td><td class="num">${estados.filter((s) => s === "ok").length}</td>
          <td class="num">${estados.filter((s) => s === "revisar" || s === "ilegible").length || "—"}</td>
          <td>${registro ? esc(PaesExcel.fechaCorta(registro.fecha)) : "incompleto"}</td>
          <td class="acciones"><button type="button" class="${est.moverArchivo === g.clave ? "" : "secundario "}chico" data-accion="mover-archivo" data-clave="${esc(g.clave)}" ${est.lectura ? "disabled" : ""}>↔ Cambiar de prueba</button>
          <button type="button" class="chico peligro" data-accion="quitar-archivo" data-clave="${esc(g.clave)}" ${est.lectura ? "disabled" : ""}>🗑 Quitar</button></td></tr>`;
        if (est.moverArchivo === g.clave) {
          const otros = ensayosDelCurso(c.id).filter((x) => x.id !== e.id);
          const usados = new Set(ensayosDelCurso(c.id).map((x) => x.clavijeroId).filter(Boolean));
          const libres = est.clavijeros.filter((k) => !usados.has(k.id));
          h += `<tr><td colspan="6">${otros.length || libres.length ? `<div class="paes-candidatos paes-transferir"><span>Estas ${plural(g.hojas.length, "hoja es", "hojas son")} de:</span>
            <select data-mover-a="${esc(g.clave)}">${otros.length ? `<optgroup label="Pruebas de este curso">${otros.map((x) => `<option value="e:${esc(x.id)}">${esc(etiquetaEnsayo(x))}</option>`).join("")}</optgroup>` : ""}${libres.length ? `<optgroup label="Otra prueba (con un clavijero guardado)">${libres.map((k) => `<option value="k:${esc(k.id)}">${esc(nombrePruebaDe(k))} · clavijero «${esc(k.nombre)}»</option>`).join("")}</optgroup>` : ""}</select>
            <button type="button" class="chico" data-accion="mover-archivo-ok" data-clave="${esc(g.clave)}">Pasar las hojas a esa prueba</button>
            <small>Se conservan las hojas, a quién están asignadas y las correcciones hechas a mano. Solo cambia el clavijero con que se corrigen.</small></div>` : `<div class="paes-candidatos"><span>Este curso no tiene otra prueba ni hay otro clavijero guardado. Sube primero el clavijero en «Clavijeros subidos».</span></div>`}</td></tr>`;
        }
      });
      h += `</tbody></table></div></div>`;
    }
    return h;
  }

  const siglaPrueba = (e) => (e.prueba === "OTRA" ? (e.pruebaNombre || "Otra").slice(0, 8) : e.prueba);
  const clasePrueba = (e) => (e.prueba === "CL" ? "cl" : e.prueba === "M1" ? "m1" : "otra");

  // paso 3: las pruebas del curso, para elegir a cuál pertenecen los PDF que se van a subir
  function htmlPruebasDelCurso(c, e) {
    const ensayos = ensayosDelCurso(c.id);
    let h = `<div class="tarjeta paes-pruebas">
      <h2 style="font-size:16px;">¿De qué prueba son los PDF que vas a subir?</h2>
      <p class="ayuda">Cada prueba del curso tiene sus propias hojas y su propio clavijero: el de una prueba nunca se aplica a las hojas de otra.</p>
      <div class="paes-pruebas-fila">
        ${ensayos.map((x) => {
          const k = clavijeroDe(x);
          const n = hojasDelEnsayo(x.id).filter(vigente).length;
          return `<button type="button" class="paes-prueba-btn ${clasePrueba(x)}${x.id === e.id ? " activa" : ""}" data-accion="elegir-prueba" data-id="${esc(x.id)}" ${est.lectura ? "disabled" : ""}>
            <b>${esc(siglaPrueba(x))}</b><span>${esc(nombrePrueba(x))}${x.forma ? " · Forma " + esc(x.forma) : ""}</span>
            <small>${k ? "clavijero «" + esc(k.nombre) + "»" : x.clave.some((q) => q.r) ? "clave propia" : "sin clave todavía"} · ${plural(n, "hoja", "hojas")}</small></button>`;
        }).join("")}
        <button type="button" class="paes-prueba-btn nueva${est.otraPrueba ? " activa" : ""}" data-accion="otra-prueba" ${est.lectura ? "disabled" : ""}><b>＋</b><span>Otra prueba</span><small>con un clavijero ya guardado</small></button>
      </div>`;
    if (est.otraPrueba) {
      const usados = new Set(ensayos.map((x) => x.clavijeroId).filter(Boolean));
      h += `<div class="paes-agregar-manual"><b>Otra prueba para ${esc(nombreCurso(c))}</b>
        <div class="grid-form" style="margin-top:8px;">
          <div class="campo-ancho"><label>Prueba y clavijero *</label><select id="paes-otra-prueba-sel">
            ${est.clavijeros.length ? `<optgroup label="Con un clavijero guardado">${est.clavijeros.map((k) => `<option value="k:${esc(k.id)}">${esc(nombrePruebaDe(k))} · clavijero «${esc(k.nombre)}»${usados.has(k.id) ? " (este curso ya la tiene)" : ""}</option>`).join("")}</optgroup>` : ""}
            <optgroup label="Sin clavijero todavía (la clave se carga después)">${Object.values(L.PRUEBAS_PAES).map((p) => `<option value="p:${p.id}">${esc(p.nombre)}</option>`).join("")}</optgroup></select></div>
          <div><label>Fecha de aplicación</label><input type="date" id="paes-otra-prueba-fecha" value="${hoyIso()}" /></div>
        </div>
        <div class="acciones-form"><button type="button" class="chico" data-accion="otra-prueba-ok">Usar esta prueba y subir sus PDF</button><button type="button" class="secundario chico" data-accion="otra-prueba">Cancelar</button></div></div>`;
    }
    return h + `</div>`;
  }

  async function elegirOtraPrueba() {
    const c = cursoActual();
    const sel = raiz.querySelector("#paes-otra-prueba-sel");
    if (!c || !sel) return;
    const k = sel.value.startsWith("k:") ? est.clavijeros.find((x) => x.id === sel.value.slice(2)) : null;
    const prueba = k ? k.prueba : sel.value.slice(2);
    let e = ensayosDelCurso(c.id).find((x) => (k ? x.clavijeroId === k.id : x.prueba === prueba && !x.clavijeroId && !hojasDelEnsayo(x.id).length));
    const yaEstaba = !!e;
    if (!e) e = await crearEnsayoCon(c, { prueba, pruebaNombre: k ? k.pruebaNombre : "", fecha: raiz.querySelector("#paes-otra-prueba-fecha").value || "", clavijero: k });
    Object.assign(est, { ensayoId: e.id, otraPrueba: false, resumenLectura: null, moverArchivo: null });
    pintar();
    toast(yaEstaba ? `Este curso ya tenía ${nombrePrueba(e)}: quedó elegida` : `${nombrePrueba(e)} agregada al curso: ahora sube sus PDF`);
  }

  // qué fracción de las respuestas marcadas calza con una clave (0 a 1)
  function ajusteConClave(hojas, clave) {
    let bien = 0, total = 0;
    hojas.forEach((h) => {
      clave.forEach((k) => {
        if (!k.r) return;
        const r = L.respuestaVigente(h, k.n);
        if (r.estado !== "ok") return;
        total++;
        if (r.letras === k.r) bien++;
      });
    });
    return total ? bien / total : null;
  }

  // ¿las hojas calzan mucho mejor con el clavijero de OTRA prueba que con el de este ensayo?
  function pruebaQueCalzaMejor(e, hojas) {
    const vig = hojas.filter(vigente);
    if (vig.length < 3 || !e.clave.some((k) => k.r)) return null;
    const propio = ajusteConClave(vig, e.clave);
    if (propio == null) return null;
    let mejor = null;
    est.clavijeros.forEach((k) => {
      if (k.id === e.clavijeroId || (k.prueba === e.prueba && (k.pruebaNombre || "") === (e.pruebaNombre || ""))) return;
      const a = ajusteConClave(vig, k.clave);
      if (a != null && (!mejor || a > mejor.ajuste)) mejor = { clavijero: k, ajuste: a };
    });
    return mejor && mejor.ajuste - propio >= 0.12 && propio <= 0.36 ? Object.assign(mejor, { propio }) : null;
  }

  // pasa las hojas de un archivo a otra prueba del mismo curso («e:<ensayo>» o «k:<clavijero>»)
  async function moverArchivo(clave, valor) {
    const c = cursoActual();
    const e = ensayoActual();
    if (!c || !e || !valor || est.lectura) return;
    let d = valor.startsWith("e:") ? est.ensayos.find((x) => x.id === valor.slice(2) && x.cursoId === c.id) : null;
    if (!d && valor.startsWith("k:")) {
      const k = est.clavijeros.find((x) => x.id === valor.slice(2));
      if (k) d = ensayosDelCurso(c.id).find((x) => x.clavijeroId === k.id) || (await crearEnsayoCon(c, { prueba: k.prueba, pruebaNombre: k.pruebaNombre, fecha: e.fecha, clavijero: k }));
    }
    if (!d || d.id === e.id) return;
    const hojas = hojasDelEnsayo(e.id).filter((h) => (h.huellaArchivo || h.archivo) === clave);
    if (!hojas.length) return;
    const ids = new Set(hojas.map((h) => h.id));
    const pares = [];
    for (const h of hojas) {
      h.ensayoId = d.id;
      if (h.repetidaDe && !ids.has(h.repetidaDe)) h.repetidaDe = null;
      pares.push(["hojas", h]);
      const img = await PaesDB.obtener("imagenes", h.id);
      if (img) pares.push(["imagenes", Object.assign(img, { ensayoId: d.id })]);
    }
    // una hoja que quedó atrás y era «repetida» de una que se fue deja de serlo
    est.hojas.filter((h) => h.ensayoId === e.id && h.repetidaDe && ids.has(h.repetidaDe)).forEach((h) => {
      h.repetidaDe = null;
      pares.push(["hojas", h]);
    });
    const registro = (e.archivos || []).find((a) => a.huella === clave);
    e.archivos = (e.archivos || []).filter((a) => a.huella !== clave);
    if (registro && !(d.archivos || []).some((a) => a.huella === clave)) d.archivos = (d.archivos || []).concat([registro]);
    pares.push(["ensayos", e], ["ensayos", d]);
    await PaesDB.ponerVarios(pares);
    auditar(e.id, null, "archivo pasado a otra prueba", `${hojas[0].archivo} (${hojas.length} hojas)`, nombrePrueba(d));
    auditar(d.id, null, "archivo recibido de otra prueba", nombrePrueba(e), `${hojas[0].archivo} (${hojas.length} hojas)`);
    Object.assign(est, { moverArchivo: null, ensayoId: d.id, resumenLectura: null });
    pintar();
    const kd = clavijeroDe(d);
    toast(`${plural(hojas.length, "hoja pasó", "hojas pasaron")} a ${nombrePrueba(d)}${kd ? `: ahora se corrigen con «${kd.nombre}»` : ""}`);
  }

  function pintarProgreso() {
    const el = raiz && raiz.querySelector("#paes-progreso");
    if (el) el.innerHTML = htmlProgreso();
  }

  // Lee los archivos y guarda cada hoja apenas se lee. Corre de a una página, cediendo el
  // turno a la pantalla entre hoja y hoja: la app sigue respondiendo mientras tanto.
  // opciones (Editor de PDF): { paginas: Map(archivo → [números de página]), fijo: true } lee solo
  // esas páginas y deja cada hoja en este curso aunque su RUT sea de otro
  async function subirHojas(archivos, opciones) {
    const o = opciones || {};
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
    diario.lectura = nuevaEntrada(`Subir hojas (${plural(validos.length, "archivo", "archivos")}) · ${etiquetaCurso(curso)}`);
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
        if (!o.paginas && (ensayo.archivos || []).some((a) => a.huella === abierto.huella)) {
          resumen.avisos.push(`«${archivo.name}» ya se había subido a este ensayo: no se cargó de nuevo.`);
          await abierto.cerrar();
          continue;
        }
        const nums = o.paginas ? (o.paginas.get(archivo) || []).filter((n) => n >= 1 && n <= abierto.paginas) : Array.from({ length: abierto.paginas }, (_, i) => i + 1);
        progreso.total += nums.length;
        let completo = true;
        for (const p of nums) {
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
              if (!hoja.estudianteId && v.tipo === "otro-curso" && !o.fijo) {
                // el RUT es de otro curso que se corrige junto con este, o del mismo colegio: la hoja se va sola a ese curso
                const posibles = v.otroCurso.map((o) => est.cursos.find((k) => k.id === o.cursoId)).filter(Boolean);
                const cursoDestino = posibles.find((k) => hermanos(ensayo).some((x) => x.cursoId === k.id)) || posibles.find((k) => normColegio(k.colegio) === normColegio(curso.colegio)) || null;
                const destino = cursoDestino ? await ensayoDestino(ensayo, cursoDestino) : null;
                if (destino) {
                  idsGrupo.add(destino.id);
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
        if (completo && !(ensayo.archivos || []).some((a) => a.huella === abierto.huella)) {
          ensayo.archivos = (ensayo.archivos || []).concat([{ nombre: archivo.name, huella: abierto.huella, paginas: nums.length, fecha: new Date().toISOString() }]);
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
    diario.lectura = null;
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
    const grupos = gruposParaAsignar(c);
    const opcionesEstudiantes = grupos.reduce((a, g) => a.concat(g.estudiantes), []);
    const porIdOpcion = new Map(opcionesEstudiantes.map((x) => [x.id, x]));
    // en un curso disperso, la pantalla usa el id del estudiante en su curso de origen
    const visible = (idDelCurso) => {
      const propio = porId.get(idDelCurso);
      return propio && propio.origenId && porIdOpcion.has(propio.origenId) ? propio.origenId : idDelCurso;
    };
    const conHojaLocal = conHoja;
    const conHojaVisible = new Map();
    conHojaLocal.forEach((n, id) => conHojaVisible.set(visible(id), n));
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
        <button type="button" class="secundario chico" data-accion="deshacer" ${diario.hechas.length && diario.hechas[diario.hechas.length - 1].reversible ? "" : "disabled"}>↩ Deshacer el último cambio</button>
        <button type="button" class="secundario chico" data-accion="historial">🕓 Historial de cambios</button>
        <button type="button" class="secundario chico" data-accion="e-a-d" title="Para los estudiantes que marcaron E queriendo marcar D">🔁 Traspasar todas las E a D</button>
        <button type="button" class="${est.verSinHoja ? "" : "secundario "}chico" data-accion="ver-sin-hoja">👥 ${c.disperso ? "Estudiantes del colegio sin hoja, por curso" : "Estudiantes que aún no tienen hoja"} (${opcionesEstudiantes.filter((s) => !conHojaVisible.get(s.id)).length})</button>
      </div>
      ${c.disperso ? `<p class="paes-nota" style="margin-top:10px;">Grupo disperso de ${esc(c.colegio)}: no tiene lista propia. ${poolDisperso(c).length ? "Busca a cada estudiante entre los cursos del colegio; si no aparece, agrégalo con su nombre y RUT." : "Este colegio no tiene cursos con lista: agrega a cada estudiante con su nombre y RUT."}</p>` : ""}
      ${est.verSinHoja ? htmlSinHoja(grupos.map((g) => ({ titulo: g.titulo, estudiantes: g.estudiantes.filter((s) => !conHojaVisible.get(s.id)) }))) : ""}
      ${c.disperso ? "" : otrosDelColegio(c).length ? `<p class="paes-nota" style="margin-top:10px;">El buscador de cada hoja busca en ${esc(etiquetaCurso(c))} y también en los otros cursos de ${esc(c.colegio)} (${esc(otrosDelColegio(c).map(etiquetaCurso).join(", "))}). Si eliges a alguien de otro curso, la hoja se pasa a ese curso.</p>` : ""}
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
            <span class="paes-buscar-caja"><input type="search" class="paes-buscar" data-buscar="${esc(x.id)}" placeholder="Buscar por nombre, RUT o curso…" autocomplete="off" ${x.excluida ? "disabled" : ""} /><span class="paes-sugerencias" data-sug="${esc(x.id)}"></span></span>
            <select data-asignar="${esc(x.id)}" ${x.excluida ? "disabled" : ""}>
              <option value="">— Sin identificar —</option>
              ${grupos.map((g) => {
                const opciones = g.estudiantes.map((s) => `<option value="${esc(s.id)}" ${s.id === visible(x.estudianteId) ? "selected" : ""}>${esc(textoEstudiante(s))}${conHojaVisible.get(s.id) && s.id !== visible(x.estudianteId) ? " · ya tiene hoja" : ""}</option>`).join("");
                return g.titulo ? `<optgroup label="${esc(g.titulo)}">${opciones}</optgroup>` : opciones;
              }).join("")}
            </select>
            ${alumno ? `<span class="paes-chip ${x.asignacion === "exacta" ? "verde" : "azul"}">${x.asignacion === "exacta" ? "RUT exacto" : x.asignacion === "sugerida" ? "sugerencia confirmada" : "asignada a mano"}</span>` : ""}
          </div>`;
          if (!alumno && !x.excluida && hermanos(e).length) {
            h += `<div class="paes-candidatos"><span>¿La hoja es de otro de los cursos que corriges juntos?</span>${hermanos(e).map((y) => est.cursos.find((k) => k.id === y.cursoId)).filter(Boolean).map((k) => `<button type="button" class="secundario chico" data-accion="mover-hoja" data-id="${esc(x.id)}" data-curso="${esc(k.id)}">Pasarla a ${esc(etiquetaCurso(k))}</button>`).join("")}</div>`;
          }
          if (!alumno && !x.excluida) {
            const v = L.vincularHoja(x.lectura.id, opcionesEstudiantes, c.disperso ? [] : otros, new Set(conHojaVisible.keys()));
            if (v.tipo === "otro-curso") {
              const destino = est.cursos.find((k) => k.id === v.otroCurso[0].cursoId);
              const quien = destino ? destino.estudiantes.find((s) => s.id === v.otroCurso[0].estudianteId) : null;
              if (destino && quien) {
                h += `<div class="paes-candidatos"><span>Este RUT es de <b>${esc(L.nombreCompletoPaes(quien))}</b>, de ${esc(destino.colegio)} · ${esc(etiquetaCurso(destino))}.</span>
                  <button type="button" class="secundario chico" data-accion="mover-hoja" data-id="${esc(x.id)}" data-curso="${esc(destino.id)}">Mover la hoja a ese curso</button></div>`;
              }
            } else if (v.candidatos.length && !(c.disperso && v.tipo !== "sugerida")) {
              const titulo = v.tipo === "sugerida" ? "Parecidos al RUT marcado:" : "Estudiantes del curso que aún no tienen hoja:";
              h += `<div class="paes-candidatos"><span>${titulo}</span>${v.candidatos.slice(0, v.tipo === "sugerida" ? 4 : 8).map((k) => {
                const s = porIdOpcion.get(k.estudianteId);
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
      if (!x.repetidaDe) h += `<button type="button" class="${est.transferirEn === x.id ? "" : "secundario "}chico" data-accion="transferir" data-id="${esc(x.id)}">↔ Transferir a otro curso</button>`;
      if (x.repetidaDe) h += `<button type="button" class="secundario chico" data-accion="no-repetida" data-id="${esc(x.id)}">No es repetida: contarla</button>`;
      else if (x.excluida) h += `<button type="button" class="secundario chico" data-accion="incluir" data-id="${esc(x.id)}">↩ Volver a incluir</button>`;
      else {
        if (avisos.length || x.estado === "ilegible") h += `<button type="button" class="${x.revisada ? "secundario " : ""}chico" data-accion="revisada" data-id="${esc(x.id)}">${x.revisada ? "↩ Quitar «revisada»" : "✓ Marcar como revisada"}</button>`;
        if (x.estado !== "ilegible") h += `<button type="button" class="secundario chico" data-accion="excluir" data-id="${esc(x.id)}">🚫 No contar esta hoja</button>`;
      }
      h += `</div>`;
      if (est.transferirEn === x.id) {
        const delColegio = otrosDelColegio(c).concat(est.cursos.filter((k) => k.id !== c.id && k.disperso && normColegio(k.colegio) === normColegio(c.colegio)));
        const deOtros = ordenarCursos(est.cursos).filter((k) => k.id !== c.id && !delColegio.includes(k));
        const opcion = (k) => `<option value="${esc(k.id)}">${esc(nombreCurso(k))} · ${esc(k.anio)}</option>`;
        h += delColegio.length || deOtros.length
          ? `<div class="paes-candidatos paes-transferir"><span>Pasar esta hoja${alumno ? ` y a <b>${esc(L.nombreCompletoPaes(alumno))}</b>` : ""} a:</span>
              <select data-transferir-a="${esc(x.id)}">${delColegio.length ? `<optgroup label="${esc(c.colegio)}">${delColegio.map(opcion).join("")}</optgroup>` : ""}${deOtros.length ? `<optgroup label="Otros colegios">${deOtros.map(opcion).join("")}</optgroup>` : ""}</select>
              <button type="button" class="chico" data-accion="transferir-ok" data-id="${esc(x.id)}">Transferir</button>
              <small>Si ese curso aún no tiene este ensayo, se crea con la misma clave.</small></div>`
          : `<div class="paes-candidatos"><span>No hay otros cursos guardados. Créalo primero con «Ingresar nuevo curso».</span></div>`;
      }
      h += `</div></div></div>`;
    });
    if (!mostradas) h += `<div class="tarjeta"><p class="ayuda" style="margin:0;">No queda nada por revisar. 🎉</p></div>`;
    h += `<div class="paes-siguiente"><button type="button" data-paso="resultados">Seguir: resultados →</button></div>`;
    return h;
  }

  async function asignarHoja(hojaId, estudianteId, modo) {
    const h = est.hojas.find((x) => x.id === hojaId);
    if (!h) return;
    const antes = h.estudianteId;
    estudianteId = idLocal(cursoActual(), estudianteId);
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
  // El ensayo equivalente en otro curso (misma prueba). Si ese curso aún no lo tiene, se crea
  // con la misma clave y tabla y queda enlazado con este, para corregirlos juntos.
  async function ensayoDestino(origen, cursoDestino) {
    const lista = ensayosDelCurso(cursoDestino.id);
    const mismos = lista.filter((e) => e.prueba === origen.prueba && (e.pruebaNombre || "") === (origen.pruebaNombre || ""));
    let d =
      hermanos(origen).find((e) => e.cursoId === cursoDestino.id) ||
      (origen.clavijeroId ? lista.find((e) => e.clavijeroId === origen.clavijeroId) : null) ||
      mismos.find((e) => (e.forma || "") === (origen.forma || "")) ||
      (mismos.length === 1 ? mismos[0] : null);
    if (d) return d;
    if (!origen.grupoId) {
      origen.grupoId = PaesDB.nuevoId("g");
      await guardar("ensayos", origen);
    }
    d = Object.assign({}, origen, { id: PaesDB.nuevoId("en"), cursoId: cursoDestino.id, clave: copiaClave(origen.clave), tabla: origen.tabla.slice(), archivos: [], creado: new Date().toISOString() });
    est.ensayos.push(d);
    await guardar("ensayos", d);
    return d;
  }

  // Pasa una hoja a otro curso. opciones.estudianteId: a quién asignarla allá;
  // opciones.conEstudiante: el estudiante que tenía asignado se va con la hoja.
  async function moverHoja(hojaId, cursoId, opciones) {
    const o = opciones || {};
    const h = est.hojas.find((x) => x.id === hojaId);
    const origen = ensayoActual();
    const cursoOrigen = cursoActual();
    const destinoCurso = est.cursos.find((k) => k.id === cursoId);
    if (!h || !origen || !cursoOrigen || !destinoCurso || destinoCurso.id === cursoOrigen.id) return;
    const alumno = h.estudianteId ? cursoOrigen.estudiantes.find((x) => x.id === h.estudianteId) : null;
    const destino = await ensayoDestino(origen, destinoCurso);
    const img = await PaesDB.obtener("imagenes", h.id);
    h.ensayoId = destino.id;
    h.cursoId = cursoId;
    h.estudianteId = null;
    h.asignacion = null;
    vincular(h, destinoCurso);
    const pares = [["hojas", h]];
    let nota = "";
    if (o.estudianteId && destinoCurso.estudiantes.some((x) => x.id === o.estudianteId)) {
      h.estudianteId = o.estudianteId;
      h.asignacion = h.asignacion === "exacta" ? "exacta" : "manual";
    } else if (!h.estudianteId && alumno && o.conEstudiante) {
      // el estudiante se va con su hoja: si no está en la lista de destino (por RUT), se agrega
      let enDestino = alumno.rut ? destinoCurso.estudiantes.find((x) => x.rut === alumno.rut) : null;
      if (!enDestino) {
        enDestino = { id: PaesDB.nuevoId("e"), rut: alumno.rut, nombres: alumno.nombres, apellidos: alumno.apellidos, agregadoAMano: true, transferidoDe: nombreCurso(cursoOrigen) };
        destinoCurso.estudiantes.push(enDestino);
        pares.push(["cursos", destinoCurso]);
      }
      h.estudianteId = enDestino.id;
      h.asignacion = "manual";
      const otrasSuyas = est.hojas.some((x) => x.id !== h.id && x.estudianteId === alumno.id);
      if (alumno.agregadoAMano && !otrasSuyas) {
        cursoOrigen.estudiantes = cursoOrigen.estudiantes.filter((x) => x.id !== alumno.id);
        pares.push(["cursos", cursoOrigen]);
      } else if (!otrasSuyas) nota = ` · ${L.nombreCompletoPaes(alumno)} sigue en la lista oficial de ${etiquetaCurso(cursoOrigen)}: si no corresponde, quítalo de esa lista`;
    }
    if (img) pares.push(["imagenes", Object.assign(img, { ensayoId: destino.id })]);
    await PaesDB.ponerVarios(pares);
    auditar(origen.id, h.id, "hoja movida a otro curso", nombreCurso(cursoOrigen), nombreCurso(destinoCurso));
    auditar(destino.id, h.id, "hoja recibida de otro curso", nombreCurso(cursoOrigen), "");
    est.transferirEn = null;
    pintar();
    toast(`Hoja pasada a ${nombreCurso(destinoCurso)}${h.estudianteId ? "" : " (allá queda sin identificar)"}${nota}`);
  }

  // cambia por D todas las respuestas marcadas en E del ensayo (con confirmación)
  function traspasarEaD() {
    const e = ensayoActual();
    if (!e) return;
    const cambios = [];
    hojasDelEnsayo(e.id).filter(vigente).forEach((h) => {
      e.clave.forEach((k) => {
        const r = L.respuestaVigente(h, k.n);
        if (r.estado === "ok" && r.letras === "E") cambios.push({ h, n: k.n });
      });
    });
    if (!cambios.length) {
      toast("En este ensayo no hay respuestas marcadas en E.");
      return;
    }
    const tocadas = Array.from(new Set(cambios.map((x) => x.h)));
    confirmar({
      titulo: "Traspasar todas las E a D",
      texto: `Se van a cambiar por D ${plural(cambios.length, "respuesta marcada", "respuestas marcadas")} en E, en ${plural(tocadas.length, "hoja", "hojas")} de este ensayo.${e.alternativas === 5 ? " Ojo: este ensayo tiene 5 alternativas, así que la E es una respuesta posible." : ""} Las dobles marcas no se tocan. El cambio queda en el historial y se puede revertir con «Deshacer el último cambio».`,
      textoBoton: "Traspasar las E a D",
      onConfirmar: async () => {
        const lote = [];
        cambios.forEach(({ h, n }) => {
          if (!h.ediciones) h.ediciones = { respuestas: {} };
          lote.push({ hojaId: h.id, n, antes: h.ediciones.respuestas[n] });
          h.ediciones.respuestas[n] = "D";
          auditar(h.ensayoId, h.id, `respuesta de la pregunta ${n} (traspaso de E a D)`, "E", "D");
        });
        await PaesDB.ponerVarios(tocadas.map((h) => ["hojas", h]));
        est.deshacer.push({ tipo: "lote", cambios: lote });
        pintar();
        toast(`${plural(cambios.length, "respuesta pasó", "respuestas pasaron")} de E a D en ${plural(tocadas.length, "hoja", "hojas")}`);
      },
    });
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
          <button type="button" class="secundario chico" data-accion="deshacer" ${diario.hechas.length && diario.hechas[diario.hechas.length - 1].reversible ? "" : "disabled"}>↩ Deshacer</button>
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
    } else if (u.tipo === "lote") {
      const tocadas = new Set();
      u.cambios.forEach((k) => {
        const h = est.hojas.find((x) => x.id === k.hojaId);
        if (!h || !h.ediciones) return;
        const era = h.ediciones.respuestas[k.n];
        if (k.antes === undefined) delete h.ediciones.respuestas[k.n];
        else h.ediciones.respuestas[k.n] = k.antes;
        tocadas.add(h);
        auditar(h.ensayoId, h.id, `respuesta de la pregunta ${k.n} (deshacer)`, era || "sin respuesta", k.antes === undefined ? "lo leído" : k.antes || "sin respuesta");
      });
      if (tocadas.size) await PaesDB.ponerVarios(Array.from(tocadas).map((h) => ["hojas", h]));
      if (est.visor) pintarVisor();
      else pintar();
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
    const res = L.resultadosEnsayo(e, hojas, cursoParaResultados(c, [e]).estudiantes);
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
  function htmlCombinada(c, dentro) {
    const ensayos = ensayosDelCurso(c.id).filter((e) => hojasDelEnsayo(e.id).some(vigente));
    if (ensayos.length < 2) return "";
    const comb = L.resultadosCombinados(ensayos.map((e) => ({ ensayo: e, hojas: hojasDelEnsayo(e.id) })), cursoParaResultados(c, ensayos).estudiantes);
    if (!comb.filas.length) return "";
    return `<div class="${dentro ? "paes-res-mezcla" : "tarjeta"}"><h2 style="font-size:16px;">${dentro ? "Pruebas juntas" : "Vista combinada del curso"}</h2>
      <p class="ayuda">Los ensayos del curso lado a lado, por orden alfabético. No se calcula un puntaje combinado: cada prueba se informa con su propia tabla.</p>
      <div class="paes-tabla-scroll"><table class="paes-tabla paes-resultados"><thead><tr><th rowspan="2">Estudiante</th><th rowspan="2">RUT</th>${ensayos.map((e) => `<th colspan="2" class="grupo">${esc(etiquetaEnsayo(e))}</th>`).join("")}</tr>
      <tr>${ensayos.map(() => `<th>Correctas</th><th>Puntaje</th>`).join("")}</tr></thead><tbody>
      ${comb.filas.map((f) => `<tr><td>${esc(f.nombre)}</td><td class="rut">${esc(L.formatearRutPaes(f.rut))}</td>${f.celdas.map((x) => (x ? `<td class="num">${x.correctas}</td><td class="num puntaje">${x.puntaje == null ? `<span class="paes-falta">sin tabla</span>` : x.puntaje}</td>` : `<td class="num paes-vacio" colspan="2">no rindió</td>`)).join("")}</tr>`).join("")}
      </tbody></table></div></div>`;
  }

  // ---- nombres de los archivos: "4to A Colegio Alfa Informe Ensayo PAES …", igual que
  // en el resto de la app (js/report.js: nombreEstandar)
  function textoArchivo(t) {
    return L.sinTildes(String(t || "")).replace(/[^A-Za-z0-9 .,()&'-]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function inicioArchivo(cursos, tipo) {
    const lista = cursos.map((c) => ({ curso: c.nivel, letra: c.letra, colegio: c.colegio }));
    if (typeof nombreEstandar === "function") return nombreEstandar(lista, lista, tipo);
    const colegios = [...new Set(cursos.map((c) => c.colegio))];
    return [cursos.length === 1 ? textoArchivo(etiquetaCurso(cursos[0])) : "", textoArchivo(colegios.length === 1 ? colegios[0] : "Varios colegios"), textoArchivo(tipo)].filter(Boolean).join(" ");
  }
  // "4to A Colegio Alfa Informe Ensayo PAES Competencia Lectora Forma A 2026-04-10"
  function nombreArchivoEnsayo(c, e, tipo) {
    const detalle = [nombrePrueba(e), e.forma ? "Forma " + e.forma : "", e.fecha || ""].filter(Boolean).join(" ");
    return inicioArchivo([c], `${tipo} ${detalle}`);
  }

  function datosDeInforme(c, e, conNombres) {
    const hojas = hojasDelEnsayo(e.id);
    return {
      curso: cursoParaResultados(c, [e]),
      ensayo: e,
      nombrePrueba: nombrePrueba(e),
      etiquetaCurso: etiquetaCurso(c),
      resultados: L.resultadosEnsayo(e, hojas, cursoParaResultados(c, [e]).estudiantes),
      analisis: L.analisisPorPregunta(e, hojas),
      pendientes: contarEstados(e).revisar,
      sinNombres: conNombres ? false : est.sinNombres,
    };
  }

  // informe para el colegio, en PDF o Word, con el estilo de los informes de Kuder
  async function descargarInforme(formato) {
    const c = cursoActual();
    const e = ensayoActual();
    if (!c || !e || est.generando) return;
    const datos = datosDeInforme(c, e);
    const empezar = async () => {
      est.generando = true;
      pintar();
      toast("Creando el informe…");
      try {
        const blob = formato === "pdf" ? await PaesInforme.pdf(datos) : await PaesInforme.word(datos);
        descargar(blob, `${nombreArchivoEnsayo(c, e, "Informe Ensayo PAES")}${est.sinNombres ? " (sin nombres)" : ""}.${formato === "pdf" ? "pdf" : "docx"}`);
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

  // un ZIP con el informe PDF (para el colegio, con nombres) de cada ensayo con hojas de los cursos elegidos
  function ensayosConHojas(cursos) {
    const pares = [];
    ordenarCursos(cursos).forEach((c) =>
      ordenPruebas(ensayosDelCurso(c.id)).forEach((e) => {
        if (hojasDelEnsayo(e.id).some(vigente)) pares.push({ c, e });
      })
    );
    return pares;
  }
  function descargarZipInformes(cursosElegidos, alTerminar) {
    if (est.generando) return;
    const pares = ensayosConHojas(cursosElegidos);
    if (!pares.length) return toast("Los cursos marcados aún no tienen ensayos con hojas leídas.");
    if (typeof JSZip === "undefined") return toast("No se pudo preparar el ZIP en este navegador.");
    const pendientes = pares.reduce((n, x) => n + contarEstados(x.e).revisar, 0);
    const empezar = async () => {
      est.generando = true;
      pintar();
      try {
        const zip = new JSZip();
        const usados = new Map();
        let hechos = 0;
        for (const { c, e } of pares) {
          toast(`Creando los informes… ${++hechos} de ${pares.length}`);
          const blob = await PaesInforme.pdf(datosDeInforme(c, e, true));
          let nombre = nombreArchivoEnsayo(c, e, "Informe Ensayo PAES");
          const veces = usados.get(nombre.toLowerCase()) || 0;
          usados.set(nombre.toLowerCase(), veces + 1);
          if (veces > 0) nombre += ` (${veces + 1})`;
          zip.file(`${nombre}.pdf`, blob);
          await ceder();
        }
        const cursos = [...new Set(pares.map((x) => x.c))];
        const contenido = await zip.generateAsync({ type: "blob" });
        descargar(contenido, `${inicioArchivo(cursos, "Informes Ensayo PAES")} (${plural(pares.length, "informe", "informes")}).zip`);
        toast(`ZIP descargado con ${plural(pares.length, "informe PDF", "informes PDF")}`);
        if (alTerminar) alTerminar();
      } catch (err) {
        console.error(err);
        toast("No se pudo crear el ZIP con los informes.");
      }
      est.generando = false;
      pintar();
    };
    if (pendientes) {
      confirmar({
        titulo: "Hay advertencias pendientes",
        texto: `En los cursos marcados quedan ${plural(pendientes, "hoja con advertencias sin revisar", "hojas con advertencias sin revisar")}. Puedes crear los informes igual, pero los resultados podrían cambiar cuando las revises.`,
        textoBoton: "Crear los informes igual",
        onConfirmar: empezar,
      });
    } else empezar();
  }

  // ============================================================ EDITOR DE PDF
  // Un escaneo con varios cursos en una sola pila: se muestran las hojas en el orden del
  // escáner, se elige un curso y se marcan sus hojas (pinchando o arrastrando); al finalizar,
  // cada grupo de hojas se corrige en su curso con el clavijero elegido.

  // sin rojo ni azul: esos colores son de CL y M1
  const COLORES_EDITOR = ["#2e7d32", "#b26a00", "#6a3fb5", "#00838f", "#ad1457", "#5d4037", "#455a64", "#827717", "#4e342e", "#00695c"];
  // recuadro de la hoja con el nombre, el curso («Class») y el RUT escrito a mano: sale de la
  // plantilla, con un margen chico porque el escaneo no viene alineado. Es lo que muestra cada miniatura.
  function zonaDatosEditor() {
    const def = (typeof PLANTILLAS_PAES !== "undefined" && PLANTILLAS_PAES[PLANTILLA_PAES_POR_DEFECTO]) || null;
    const r = def && def.recortes && def.recortes.nombre;
    if (!r) return [0, 0, 1, 0.38];
    // justo el recuadro del nombre, el curso y el RUT escrito a mano, con un margen chico
    const mx = 0.025, arriba = 0.014, abajo = 0.024;
    return [Math.max(0, r[0] / def.ancho - mx), Math.max(0, r[1] / def.alto - arriba), Math.min(1, r[2] / def.ancho + mx), Math.min(1, r[3] / def.alto + abajo)];
  }
  const editorVacio = (previo) => ({ archivos: [], hojas: [], cargando: null, colegio: previo ? previo.colegio : "", cursos: previo ? previo.cursos : [], activo: null, clavijeroId: previo ? previo.clavijeroId : null, fecha: hoyIso(), resultado: null, corrigiendo: null, ultimo: null, listas: previo && previo.listas ? previo.listas : [], listaPara: null });
  function editor() {
    if (!est.editor) est.editor = editorVacio();
    return est.editor;
  }
  const etiquetaEd = (x) => `${x.nivel}${x.letra ? " " + x.letra : ""}${x.anio && x.anio !== new Date().getFullYear() ? " (" + x.anio + ")" : ""}`;
  const colorEd = (ed, key) => COLORES_EDITOR[Math.max(0, ed.cursos.findIndex((x) => x.key === key)) % COLORES_EDITOR.length];

  // al elegir el colegio aparecen sus cursos ya guardados; los agregados a mano se conservan
  function fijarColegioEditor(texto) {
    const ed = editor();
    const limpio = String(texto || "").replace(/\s+/g, " ").trim();
    const suyos = est.cursos.filter((c) => !c.disperso && limpio && normColegio(c.colegio) === normColegio(limpio));
    ed.colegio = suyos.length ? suyos[0].colegio : limpio;
    ed.cursos = ordenarCursos(suyos)
      .map((c) => ({ key: c.id, cursoId: c.id, nivel: c.nivel, letra: c.letra || "", anio: c.anio }))
      .concat(ed.cursos.filter((x) => !x.cursoId && !suyos.some((c) => c.nivel === x.nivel && (c.letra || "").toUpperCase() === x.letra)));
    const claves = new Set(ed.cursos.map((x) => x.key));
    ed.hojas.forEach((h) => {
      if (h.curso && !claves.has(h.curso)) h.curso = null;
    });
    if (ed.activo !== "borrar" && !claves.has(ed.activo)) ed.activo = null;
    ed.listas.forEach((t) => {
      if (t.destino && !claves.has(t.destino)) t.destino = "";
    });
  }

  async function cargarEditor(archivos) {
    const ed = editor();
    const validos = archivos.filter((a) => /\.pdf$/i.test(a.name) || /^image\//.test(a.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(a.name));
    if (!validos.length) return toast("Esos archivos no son PDF ni imágenes.");
    if (ed.cargando) return;
    ed.resultado = null;
    ed.cargando = { hecho: 0, total: 0, archivo: "" };
    pintar();
    for (const archivo of validos) {
      const indice = ed.archivos.length;
      ed.archivos.push(archivo);
      try {
        await PaesPdf.miniaturas(archivo, 900, async (url, pagina, total) => {
          ed.hojas.push({ archivo: indice, pagina, url, curso: null });
          Object.assign(ed.cargando, { hecho: pagina, total, archivo: archivo.name });
          const el = raiz.querySelector("#paes-ed-carga");
          if (el) el.innerHTML = htmlCargaEditor();
          await ceder();
        }, zonaDatosEditor());
      } catch (err) {
        console.error(err);
        toast(`«${archivo.name}» no se pudo abrir.`);
      }
    }
    ed.cargando = null;
    pintar();
  }
  function htmlCargaEditor() {
    const g = editor().cargando;
    if (!g) return "";
    const pct = g.total ? Math.round((g.hecho / g.total) * 100) : 0;
    return `<div class="paes-progreso"><div class="paes-progreso-texto"><b>Cargando hoja ${g.hecho} de ${g.total || "…"}</b> <span>${esc(g.archivo)}</span></div><div class="paes-barra"><div style="width:${pct}%"></div></div></div>`;
  }

  function htmlVistaEditor() {
    const ed = editor();
    const entrada = `<input type="file" data-archivo="editor-pdf" accept=".pdf,image/*" multiple style="display:none;" /><input type="file" data-archivo="editor-listas" accept=".xls,.xlsx,.csv" multiple style="display:none;" />`;
    const ocupado = !!(est.lectura || ed.cargando || ed.corrigiendo);
    const des = ocupado ? "disabled" : "";
    const guardado = (x) => (x.cursoId ? est.cursos.find((c) => c.id === x.cursoId) : null);
    let h = `<div class="tarjeta"><h2>✂️ Editor de PDF</h2>
      <p class="ayuda" style="margin-bottom:6px;">Para un escaneo que trae <b>varios cursos en una sola pila</b>. Son tres pasos:</p>
      <ol class="paes-ed-guia"><li><b>Colegio, cursos y listas:</b> dices de qué colegio y qué cursos son, y subes sus listas si las tienes.</li><li><b>Hojas:</b> subes el PDF y marcas qué hojas son de cada curso.</li><li><b>Clavijero:</b> eliges la prueba y la app corrige cada grupo en su curso.</li></ol>${entrada}</div>`;
    if (ed.resultado) h += htmlResultadoEditor();

    // ---------- paso 1
    h += `<div class="tarjeta"><h2 class="paes-ed-paso">1 · Colegio, cursos y listas</h2>
      <div class="grid-form"><div><label>Colegio *</label><input type="text" data-cambio="ed-colegio" list="paes-ed-colegios" value="${esc(ed.colegio)}" placeholder="Escribe o elige el colegio" autocomplete="off" ${des} /><datalist id="paes-ed-colegios">${colegiosConocidos().map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist></div></div>`;
    if (!ed.colegio) h += `<p class="ayuda" style="margin:10px 0 0;">Escribe el colegio (o elige uno ya guardado) para ver sus cursos y agregar otros.</p>`;
    else {
      h += `<div class="paes-ed-nuevo"><b>Agregar cursos:</b><select id="paes-ed-nivel" ${des}>${NIVELES.filter((n) => n !== NIVEL_DISPERSO).map((n) => `<option>${n}</option>`).join("")}</select>
        <span class="paes-ed-letras">${"ABCDEFGH".split("").map((l) => `<label><input type="checkbox" class="paes-ed-letra-chk" value="${l}" ${des} />${l}</label>`).join("")}<label><input type="checkbox" class="paes-ed-letra-chk" value="" ${des} />sin letra</label></span>
        <input type="text" id="paes-ed-letra" maxlength="12" placeholder="Otra letra" style="width:110px;" ${des} /><button type="button" class="chico" data-accion="ed-agregar-curso" ${des}>➕ Agregar</button></div>`;
      if (ed.cursos.length) {
        h += `<div class="paes-tabla-scroll"><table class="paes-tabla paes-ed-cursos"><thead><tr><th>Curso</th><th>Lista del curso</th><th></th></tr></thead><tbody>${ed.cursos
          .map((x) => {
            const c = guardado(x);
            const n = c ? c.estudiantes.length : 0;
            const lista = n ? `${plural(n, "estudiante", "estudiantes")} ${c.listaOficial === false ? `<span class="paes-ed-prov-chip">⚠ LISTA PROVISORIA</span>` : chipLista(c)}` : `<span class="paes-chip gris">Sin lista</span> <small>sus hojas quedarán por identificar</small>`;
            return `<tr><td><i class="paes-ed-punto" style="background:${colorEd(ed, x.key)}"></i><b>${esc(etiquetaEd(x))}</b>${x.cursoId ? "" : ` <small>nuevo</small>`}</td><td>${lista}</td>
              <td class="acciones"><button type="button" class="secundario chico" data-accion="ed-lista-curso" data-key="${esc(x.key)}" ${des}>${n ? "🔁 Reemplazar lista" : "📤 Subir su lista"}</button>${n ? ` <button type="button" class="secundario chico" data-accion="ed-lista-marca" data-key="${esc(x.key)}" ${des}>${c.listaOficial === true ? "Marcar como provisoria" : "Marcar como oficial"}</button>` : ""}${x.cursoId ? "" : ` <button type="button" class="secundario chico" data-accion="ed-quitar-curso" data-key="${esc(x.key)}" title="Quitar este curso nuevo" ${des}>✕</button>`}</td></tr>`;
          })
          .join("")}</tbody></table></div>`;
        const provisorias = ed.cursos.filter((x) => guardado(x) && guardado(x).estudiantes.length && guardado(x).listaOficial === false);
        if (provisorias.length) h += `<div class="paes-ed-prov">⚠ <b>${provisorias.length === 1 ? "Lista provisoria" : "Listas provisorias"} en ${provisorias.map((x) => esc(etiquetaEd(x))).join(", ")}.</b> Puede faltar o sobrar alguien y los resultados pueden cambiar. Cuando tengas la lista oficial, usa «🔁 Reemplazar lista» en ese curso.</div>`;
      }
      h += `<div class="acciones-form" style="margin-top:10px;"><button type="button" class="secundario" data-accion="ed-listas" ${des}>📤 Subir listas de curso…</button><small class="ayuda" style="margin:0;">Puedes subir varias a la vez (.xls, .xlsx o .csv); después enlazas cada una con su curso. Es opcional: sin lista, las hojas se corrigen igual y quedan por identificar.</small></div>`;
      if (ed.listas.length) {
        h += `<div class="paes-ed-listas"><b>Listas por guardar: enlaza cada una con su curso</b>${ed.listas
          .map((t) => {
            const cu = ed.cursos.find((x) => x.key === t.destino);
            const c = cu ? guardado(cu) : null;
            const yaTiene = c && c.estudiantes.length;
            return `<div class="paes-ed-lista${t.oficial ? "" : " prov"}"><div class="paes-ed-lista-fila"><span>📄 <b>${esc(t.archivo)}</b> <small>${plural(t.estudiantes.length, "estudiante", "estudiantes")}${t.repetidos ? ` · ${plural(t.repetidos, "RUT repetido que no se carga", "RUT repetidos que no se cargan")}` : ""}</small></span>
              <label>¿De qué curso es? <select data-cambio="ed-lista-destino" data-uid="${esc(t.uid)}" ${des}><option value="">— Elegir curso —</option>${ed.cursos.map((x) => `<option value="${esc(x.key)}" ${x.key === t.destino ? "selected" : ""}>${esc(etiquetaEd(x))}</option>`).join("")}</select></label>
              <label class="paes-filtro"><input type="checkbox" data-cambio="ed-lista-oficial" data-uid="${esc(t.uid)}" ${t.oficial ? "checked" : ""} ${des} /> Es la lista oficial</label>
              ${yaTiene ? `<label>Ese curso ya tiene lista: <select data-cambio="ed-lista-modo" data-uid="${esc(t.uid)}" ${des}><option value="sumar" ${t.modo === "sumar" ? "selected" : ""}>Sumar a la que tiene</option><option value="reemplazar" ${t.modo === "reemplazar" ? "selected" : ""}>Reemplazarla por esta</option></select></label>` : ""}
              <button type="button" class="secundario chico" data-accion="ed-lista-quitar" data-uid="${esc(t.uid)}" title="No cargar esta lista" ${des}>✕</button></div>
              ${t.oficial ? "" : `<div class="paes-ed-prov">⚠ <b>Se guardará como LISTA PROVISORIA.</b> Puede faltar o sobrar alguien; reemplázala por la oficial cuando la tengas.</div>`}
              ${t.avisos && t.avisos.length ? htmlAvisos(t.avisos.slice(0, 3), "amarillo") : ""}</div>`;
          })
          .join("")}
          <div class="acciones-form"><button type="button" data-accion="ed-listas-guardar" ${des}>Guardar ${plural(ed.listas.length, "lista", "listas")} en ${ed.listas.length === 1 ? "su curso" : "sus cursos"}</button></div></div>`;
      }
    }
    h += `</div>`;

    // ---------- paso 2
    const chip = (key, texto) => `<button type="button" class="secundario paes-ed-chip${ed.activo === key ? " activo" : ""}" data-accion="ed-activar" data-key="${esc(key)}" style="--c:${key === "borrar" ? "#6b6480" : colorEd(ed, key)}" ${des}><i></i>${texto} <small data-ed-cuenta="${esc(key)}"></small></button>`;
    h += `<div class="tarjeta"><h2 class="paes-ed-paso">2 · Hojas: marca las de cada curso <small id="paes-ed-resumen" style="font-weight:400;"></small></h2>`;
    if (!ed.hojas.length) {
      h += `<div id="paes-ed-carga">${htmlCargaEditor()}</div>${ed.cargando ? "" : `<p class="ayuda">Sube el PDF tal como salió del escáner. Puedes elegir más de uno: sus hojas quedan una tras otra.</p><div class="acciones-form"><button type="button" data-accion="ed-elegir">📄 Elegir el PDF escaneado…</button></div>`}</div>`;
      return h;
    }
    h += `<p class="ayuda">Las hojas están en el orden del escáner y cada una muestra su nombre y su curso («Class»). <b>Primero pincha un curso</b> y después sus hojas: una por una, o arrastrando desde la primera hasta la última (también: pinchar la primera y, con Mayúsculas, la última). Pinchar de nuevo una hoja la saca. Con <b>🔍 Abrir visor</b> la ves en grande y la marcas ahí.</p>
      ${ed.cursos.length ? `<div class="paes-ed-barra"><span>Curso activo:</span><div class="paes-ed-chips">${ed.cursos.map((x) => chip(x.key, esc(etiquetaEd(x)))).join("")}${chip("borrar", "🧽 Quitar del curso")}</div></div>` : `<div class="paes-ed-prov">Antes de marcar, agrega en el paso 1 el colegio y sus cursos.</div>`}
      <div class="paes-ed-hojas${ocupado ? " ocupado" : ""}">${ed.hojas.map((x, i) => `<div class="paes-ed-hoja" data-i="${i}"><img src="${x.url}" alt="Hoja ${i + 1}" draggable="false" /><b>${i + 1}</b><button type="button" class="secundario paes-ed-ver" data-accion="ed-ver" data-i="${i}" title="Ver la hoja en grande">🔍 Abrir visor</button><span></span></div>`).join("")}</div>
      <div id="paes-ed-carga">${htmlCargaEditor()}</div>
      <div class="acciones-form" style="margin-top:10px;"><button type="button" class="secundario chico" data-accion="ed-elegir" ${des}>➕ Agregar otro PDF</button><button type="button" class="secundario chico" data-accion="ed-limpiar" ${des}>Quitar todas las hojas y empezar de nuevo</button></div></div>`;

    // ---------- paso 3
    const clvs = est.clavijeros.slice().sort((a, b) => a.prueba.localeCompare(b.prueba) || a.nombre.localeCompare(b.nombre, "es"));
    h += `<div class="tarjeta"><h2 class="paes-ed-paso">3 · Clavijero y finalizar</h2>
      ${clvs.length ? `<p class="ayuda">Elige con qué clavijero se corrigen estas hojas (por ejemplo, Competencia Lectora o M1). Si el curso ya tiene ese ensayo, las hojas se suman a él; si no, se crea. Lo ya corregido no cambia.</p>
        <div class="paes-checks paes-clv-opciones">${clvs.map((k) => `<label><input type="radio" name="paes-ed-clv" data-cambio="ed-clv" value="${esc(k.id)}" ${ed.clavijeroId === k.id ? "checked" : ""} ${des} /> <span class="paes-pill ${clasePrueba(k)}"><b>${esc(siglaPrueba(k))}</b>${esc(k.nombre)}</span></label>`).join("")}</div>
        <div class="grid-form" style="margin-top:8px;"><div><label>Fecha de aplicación</label><input type="date" data-cambio="ed-fecha" value="${esc(ed.fecha || "")}" ${des} /></div></div>` : `<p class="ayuda">Aún no hay clavijeros guardados. Agrégalo en «Clavijeros subidos» y vuelve: las hojas marcadas se conservan mientras no cierres la app.</p><div class="acciones-form"><button type="button" class="secundario chico" data-vista="clavijeros">Ir a Clavijeros subidos</button></div>`}
      ${ed.corrigiendo ? `<p class="paes-ed-avance"><b>Curso ${ed.corrigiendo.n} de ${ed.corrigiendo.de}</b> · ${esc(ed.corrigiendo.curso)}</p>` : ""}
      <div id="paes-progreso">${htmlProgreso()}</div>
      <div class="acciones-form" style="margin-top:10px;"><button type="button" id="paes-ed-finalizar" data-accion="ed-finalizar">Finalizar</button><small id="paes-ed-faltan" class="ayuda" style="margin:0;"></small></div></div>`;
    return h;
  }

  // el curso del editor pasa a existir como curso guardado (si era nuevo)
  async function asegurarCursoEditor(cu) {
    const ed = editor();
    let c = cu.cursoId ? est.cursos.find((x) => x.id === cu.cursoId) : null;
    if (c) return c;
    c = { id: PaesDB.nuevoId("c"), colegio: ed.colegio, nivel: cu.nivel, letra: cu.letra, anio: cu.anio || new Date().getFullYear(), estudiantes: [], creado: new Date().toISOString() };
    est.cursos.push(c);
    await guardar("cursos", c);
    const antes = cu.key;
    ed.hojas.forEach((x) => {
      if (x.curso === antes) x.curso = c.id;
    });
    ed.listas.forEach((t) => {
      if (t.destino === antes) t.destino = c.id;
    });
    if (ed.activo === antes) ed.activo = c.id;
    if (ed.listaPara === antes) ed.listaPara = c.id;
    Object.assign(cu, { key: c.id, cursoId: c.id });
    return c;
  }

  // listas subidas en el editor: se proponen para el curso que calza por nivel y letra
  async function leerListasEditor(archivos) {
    const ed = editor();
    const tarjetas = [], fallas = [];
    await leerTarjetasDeListas(archivos, tarjetas, fallas);
    const para = ed.listaPara ? ed.cursos.find((x) => x.key === ed.listaPara) : null;
    ed.listaPara = null;
    tarjetas.forEach((t) => {
      let cu = para;
      if (!cu && t.letra) {
        cu = ed.cursos.find((x) => x.nivel === t.nivel && (x.letra || "").toUpperCase() === t.letra.toUpperCase());
        if (!cu) {
          // la lista dice de qué curso es y ese curso no está: se agrega
          cu = { key: PaesDB.nuevoId("n"), cursoId: null, nivel: t.nivel, letra: t.letra.toUpperCase(), anio: new Date().getFullYear() };
          ed.cursos.push(cu);
        }
      }
      const c = cu && cu.cursoId ? est.cursos.find((x) => x.id === cu.cursoId) : null;
      ed.listas.push(Object.assign(t, { destino: cu ? cu.key : "", oficial: true, modo: para && c && c.estudiantes.length ? "reemplazar" : "sumar" }));
    });
    pintar();
    if (fallas.length) toast(fallas[0]);
    else if (tarjetas.length) toast(`${plural(tarjetas.length, "lista leída", "listas leídas")}: revisa a qué curso va cada una y guarda`);
  }

  async function guardarListasEditor() {
    const ed = editor();
    const listas = ed.listas.filter((t) => t.destino && ed.cursos.some((x) => x.key === t.destino));
    if (!listas.length) return toast("Elige a qué curso corresponde cada lista.");
    let estudiantes = 0, vinculadas = 0, provisorias = 0;
    for (const t of listas) {
      const cu = ed.cursos.find((x) => x.key === t.destino);
      const c = await asegurarCursoEditor(cu);
      const r = await aplicarListaACurso(c, t.estudiantes, { archivo: t.archivo, oficial: t.oficial, modo: t.modo });
      estudiantes += r.nuevos + r.actualizados;
      vinculadas += r.vinculadas || 0;
      if (!t.oficial) provisorias++;
      ed.listas = ed.listas.filter((x) => x !== t);
    }
    pintar();
    toast(`${plural(listas.length, "lista guardada", "listas guardadas")} (${plural(estudiantes, "estudiante", "estudiantes")})${provisorias ? ` · ${provisorias} como provisoria` : ""}${vinculadas ? ` · ${plural(vinculadas, "hoja identificada", "hojas identificadas")}` : ""}${ed.listas.length ? ` · ${ed.listas.length} sin curso elegido` : ""}`);
  }

  function htmlResultadoEditor() {
    const r = editor().resultado;
    return `<div class="tarjeta paes-ed-listo"><h2 style="font-size:16px;">✔ Hojas corregidas · ${esc(r.colegio)} · <span class="paes-pill ${r.clase}"><b>${esc(r.sigla)}</b>${esc(r.clavijero)}</span></h2>
      <div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>Curso</th><th>Hojas leídas</th><th>Identificadas</th><th>Por identificar</th><th>Ilegibles</th><th>Repetidas</th><th></th></tr></thead><tbody>
      ${r.filas.map((f) => `<tr><td><b>${esc(f.curso)}</b></td><td class="num">${f.leidas}</td><td class="num">${f.exactas}</td><td class="num">${f.pendientes ? `<span class="paes-falta">${f.pendientes}</span>` : 0}</td><td class="num">${f.ilegibles}</td><td class="num">${f.repetidas}</td><td><button type="button" class="secundario chico" data-accion="res-ver" data-curso="${esc(f.cursoId)}" data-ensayo="${esc(f.ensayoId)}" data-ir="revision">Revisar hojas</button> <button type="button" class="secundario chico" data-accion="res-ver" data-curso="${esc(f.cursoId)}" data-ensayo="${esc(f.ensayoId)}">Ver resultados</button></td></tr>`).join("")}
      </tbody></table></div>
      ${r.avisos.length ? htmlAvisos(r.avisos, "amarillo") : ""}
      <p class="ayuda" style="margin:8px 0 0;">Para cargar la otra prueba de los mismos cursos (por ejemplo M1), elige abajo el nuevo PDF: el colegio y los cursos quedan listos.</p></div>`;
  }

  // pone al día colores, etiquetas y contadores sin volver a pintar las miniaturas
  function refrescarEditor(previa) {
    const ed = est.editor;
    if (!ed || est.vista !== "editor") return;
    const porKey = new Map(ed.cursos.map((x) => [x.key, x]));
    raiz.querySelectorAll(".paes-ed-hoja").forEach((el) => {
      const i = Number(el.dataset.i);
      const x = ed.hojas[i];
      if (!x) return;
      const cu = x.curso ? porKey.get(x.curso) : null;
      el.classList.toggle("asignada", !!cu);
      el.classList.toggle("previa", !!previa && i >= previa[0] && i <= previa[1]);
      el.style.setProperty("--c", cu ? colorEd(ed, cu.key) : "transparent");
      el.querySelector("span").textContent = cu ? etiquetaEd(cu) : "";
    });
    const cuenta = new Map();
    ed.hojas.forEach((x) => x.curso && cuenta.set(x.curso, (cuenta.get(x.curso) || 0) + 1));
    raiz.querySelectorAll("[data-ed-cuenta]").forEach((el) => {
      const n = cuenta.get(el.dataset.edCuenta);
      el.textContent = el.dataset.edCuenta === "borrar" ? "" : n ? `· ${plural(n, "hoja", "hojas")}` : "· sin hojas";
    });
    const asignadas = ed.hojas.filter((x) => x.curso).length;
    const sin = ed.hojas.length - asignadas;
    const sinLista = ed.cursos.filter((x) => cuenta.has(x.key) && !((est.cursos.find((c) => c.id === x.cursoId) || { estudiantes: [] }).estudiantes.length)).length;
    const res = raiz.querySelector("#paes-ed-resumen");
    if (res) res.textContent = ed.hojas.length ? `· ${plural(ed.hojas.length, "hoja", "hojas")}, ${asignadas} con curso` : "";
    const btn = raiz.querySelector("#paes-ed-finalizar");
    const faltan = raiz.querySelector("#paes-ed-faltan");
    if (btn) {
      const ocupado = !!(est.lectura || ed.cargando || ed.corrigiendo);
      btn.disabled = ocupado || !asignadas || !ed.clavijeroId;
      btn.textContent = asignadas ? `Finalizar: corregir ${plural(asignadas, "hoja", "hojas")} en ${plural(cuenta.size, "curso", "cursos")}` : "Finalizar";
      if (faltan) faltan.textContent = !asignadas ? "Marca al menos una hoja en un curso." : !ed.clavijeroId ? "Falta elegir el clavijero." : (sin ? `${plural(sin, "hoja queda", "hojas quedan")} sin curso y no se ${sin === 1 ? "corrige" : "corrigen"}.` : "Todas las hojas tienen curso.") + (sinLista ? ` ${plural(sinLista, "curso no tiene lista: sus hojas quedarán", "cursos no tienen lista: sus hojas quedarán")} por identificar hasta que la subas.` : "");
    }
  }

  // marcar hojas: pinchar, arrastrar de la primera a la última, o Mayúsculas + clic
  let trazoEditor = null;
  const rangoDeTrazo = () => [Math.min(trazoEditor.desde, trazoEditor.hasta), Math.max(trazoEditor.desde, trazoEditor.hasta)];
  function alBajarEnEditor(ev) {
    const el = ev.target.closest && ev.target.closest(".paes-ed-hoja");
    const ed = est.editor;
    if (!el || !ed || est.vista !== "editor" || ev.button > 0) return;
    if (ev.target.closest(".paes-ed-ver")) return; // el botón del visor no marca la hoja
    if (est.lectura || ed.cargando || ed.corrigiendo) return;
    ev.preventDefault();
    if (ed.activo == null) return toast(ed.colegio ? "Primero pincha un curso (o agrégalo) y después marca sus hojas." : "Primero escribe el colegio y elige un curso.");
    const i = Number(el.dataset.i);
    trazoEditor = { desde: ev.shiftKey && ed.ultimo != null ? ed.ultimo : i, hasta: i };
    refrescarEditor(rangoDeTrazo());
  }
  function alPasarEnEditor(ev) {
    if (!trazoEditor) return;
    const el = ev.target.closest && ev.target.closest(".paes-ed-hoja");
    if (!el) return;
    trazoEditor.hasta = Number(el.dataset.i);
    refrescarEditor(rangoDeTrazo());
  }
  function alSoltarEnEditor() {
    const ed = est.editor;
    if (!trazoEditor || !ed) return;
    const [a, b] = rangoDeTrazo();
    const una = a === b;
    for (let i = a; i <= b; i++) {
      const x = ed.hojas[i];
      if (!x) continue;
      if (ed.activo === "borrar" || (una && x.curso === ed.activo)) x.curso = null;
      else x.curso = ed.activo;
    }
    ed.ultimo = trazoEditor.hasta;
    trazoEditor = null;
    refrescarEditor();
  }

  // ---- visor: la hoja en grande, con anterior / siguiente y los cursos para marcarla ahí mismo
  let visorEd = null; // { i, el }
  const vistasEd = new Map(); // archivo → vista abierta (PaesPdf.abrirVista)
  const grandesEd = new Map(); // "archivo|página" → imagen grande ya dibujada
  function imagenGrandeEd(x) {
    const ed = est.editor;
    const archivo = ed.archivos[x.archivo];
    const clave = x.archivo + "|" + x.pagina;
    if (!grandesEd.has(clave)) {
      if (!vistasEd.has(archivo)) vistasEd.set(archivo, PaesPdf.abrirVista(archivo));
      grandesEd.set(clave, vistasEd.get(archivo).then((v) => v.imagen(x.pagina, 1400)));
      if (grandesEd.size > 14) grandesEd.delete(grandesEd.keys().next().value);
    }
    return grandesEd.get(clave);
  }
  function soltarVistasEd() {
    vistasEd.forEach((v) => v.then((x) => x.cerrar()).catch(() => {}));
    vistasEd.clear();
    grandesEd.clear();
  }
  function abrirVisorEditor(i) {
    const ed = est.editor;
    if (!ed || !ed.hojas[i]) return;
    if (!visorEd) {
      const el = document.createElement("div");
      el.className = "modal-overlay paes-ed-visor";
      el.style.display = "flex";
      el.addEventListener("click", alClicVisorEd);
      document.addEventListener("keydown", alTeclaVisorEd);
      raiz.appendChild(el);
      visorEd = { i, el };
    }
    visorEd.i = i;
    pintarVisorEd(true);
  }
  function cerrarVisorEditor() {
    if (!visorEd) return;
    document.removeEventListener("keydown", alTeclaVisorEd);
    visorEd.el.remove();
    visorEd = null;
  }
  function pintarVisorEd(conImagen) {
    const ed = est.editor;
    const x = ed.hojas[visorEd.i];
    const ocupado = !!(est.lectura || ed.cargando || ed.corrigiendo);
    const cu = x.curso ? ed.cursos.find((k) => k.key === x.curso) : null;
    const activo = ed.activo && ed.activo !== "borrar" ? ed.cursos.find((k) => k.key === ed.activo) : null;
    const anterior = visorEd.el.querySelector(".paes-ed-visor-img");
    const y = anterior && !conImagen ? anterior.scrollTop : 0;
    const src = anterior && !conImagen ? anterior.querySelector("img").src : "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    visorEd.el.innerHTML = `<div class="modal-caja paes-ed-visor-caja">
      <div class="paes-ed-visor-cab"><b>Hoja ${visorEd.i + 1} de ${ed.hojas.length}</b><span>${esc(ed.archivos[x.archivo].name)} · página ${x.pagina}</span>
        ${cu ? `<span class="paes-ed-visor-curso" style="background:${colorEd(ed, cu.key)}">${esc(etiquetaEd(cu))}</span>` : `<span class="paes-ed-visor-curso sin">sin curso</span>`}
        <button type="button" class="secundario chico" data-v="cerrar">✕ Cerrar</button></div>
      <div class="paes-ed-visor-datos"><small>Nombre, curso («Class») y RUT escrito a mano</small><img src="${x.url}" alt="Datos de la hoja ${visorEd.i + 1}" draggable="false" /></div>
      <div class="paes-ed-visor-img"><img src="${src}" alt="Hoja ${visorEd.i + 1}" draggable="false" /></div>
      <div class="paes-ed-visor-pie">
        <button type="button" class="secundario" data-v="ant" ${visorEd.i ? "" : "disabled"}>← Anterior</button>
        <div class="paes-ed-chips">${ed.cursos.length ? ed.cursos.map((k) => `<button type="button" class="secundario paes-ed-chip${x.curso === k.key ? " activo" : ""}" data-v="curso" data-key="${esc(k.key)}" style="--c:${colorEd(ed, k.key)}" ${ocupado ? "disabled" : ""}><i></i>${esc(etiquetaEd(k))}</button>`).join("") + (x.curso ? `<button type="button" class="secundario chico" data-v="quitar" ${ocupado ? "disabled" : ""}>🧽 Quitar del curso</button>` : "") : `<small>Cierra el visor y agrega primero el colegio y sus cursos.</small>`}</div>
        <button type="button" class="secundario" data-v="sig" ${visorEd.i < ed.hojas.length - 1 ? "" : "disabled"}>Siguiente →</button>
      </div>
      <div class="paes-ed-visor-ayuda">${activo && !ocupado ? `<button type="button" data-v="marcar">✔ Marcar en ${esc(etiquetaEd(activo))} y pasar a la siguiente</button> ` : ""}<small>Pincha un curso para dejar esta hoja en él. Teclas: ← y → para cambiar de hoja, 1 a 9 para elegir el curso según su orden${activo ? ", Enter para marcarla en el curso activo y seguir" : ""}, Esc para cerrar.</small></div>
    </div>`;
    const caja = visorEd.el.querySelector(".paes-ed-visor-img");
    caja.scrollTop = y;
    if (conImagen) {
      const i = visorEd.i;
      imagenGrandeEd(x)
        .then((url) => {
          if (visorEd && visorEd.i === i) visorEd.el.querySelector(".paes-ed-visor-img img").src = url;
        })
        .catch((err) => console.error(err));
    }
  }
  function moverVisorEd(paso) {
    const n = visorEd.i + paso;
    if (n < 0 || n >= est.editor.hojas.length) return;
    visorEd.i = n;
    pintarVisorEd(true);
  }
  function marcarEnVisorEd(key, avanzar) {
    const ed = est.editor;
    if (est.lectura || ed.cargando || ed.corrigiendo) return;
    const x = ed.hojas[visorEd.i];
    x.curso = key;
    if (key) ed.activo = key;
    ed.ultimo = visorEd.i;
    raiz.querySelectorAll(".paes-ed-chips > .paes-ed-chip[data-accion]").forEach((b) => b.classList.toggle("activo", b.dataset.key === ed.activo));
    refrescarEditor();
    if (avanzar && visorEd.i < ed.hojas.length - 1) moverVisorEd(1);
    else pintarVisorEd(false);
  }
  function alClicVisorEd(ev) {
    ev.stopPropagation();
    if (ev.target === visorEd.el) return cerrarVisorEditor();
    const b = ev.target.closest("[data-v]");
    if (!b || b.disabled) return;
    const ed = est.editor;
    const x = ed.hojas[visorEd.i];
    if (b.dataset.v === "cerrar") cerrarVisorEditor();
    else if (b.dataset.v === "ant") moverVisorEd(-1);
    else if (b.dataset.v === "sig") moverVisorEd(1);
    else if (b.dataset.v === "curso") marcarEnVisorEd(x.curso === b.dataset.key ? null : b.dataset.key, false);
    else if (b.dataset.v === "quitar") marcarEnVisorEd(null, false);
    else if (b.dataset.v === "marcar") marcarEnVisorEd(ed.activo, true);
  }
  function alTeclaVisorEd(ev) {
    if (!visorEd) return;
    const ed = est.editor;
    if (ev.key === "Escape") cerrarVisorEditor();
    else if (ev.key === "ArrowLeft") moverVisorEd(-1);
    else if (ev.key === "ArrowRight") moverVisorEd(1);
    else if (ev.key === "Enter" && ed.activo && ed.activo !== "borrar") marcarEnVisorEd(ed.activo, true);
    else if (/^[1-9]$/.test(ev.key) && ed.cursos[Number(ev.key) - 1]) marcarEnVisorEd(ed.cursos[Number(ev.key) - 1].key, false);
    else return;
    ev.preventDefault();
  }

  async function finalizarEditor() {
    cerrarVisorEditor();
    const ed = editor();
    const k = est.clavijeros.find((x) => x.id === ed.clavijeroId);
    if (est.lectura || ed.corrigiendo || ed.cargando) return;
    if (!k) return toast("Elige el clavijero con que se corrigen estas hojas.");
    const grupos = ed.cursos.map((cu) => ({ cu, hojas: ed.hojas.filter((x) => x.curso === cu.key) })).filter((g) => g.hojas.length);
    if (!grupos.length) return toast("Marca al menos una hoja en un curso.");
    const resultado = { colegio: ed.colegio, clavijero: k.nombre, sigla: siglaPrueba(k), clase: clasePrueba(k), filas: [], avisos: [] };
    const hechas = new Set();
    let detenido = false;
    for (let n = 0; n < grupos.length && !detenido; n++) {
      const g = grupos[n];
      const c = await asegurarCursoEditor(g.cu);
      let e = ensayosDelCurso(c.id).find((x) => x.clavijeroId === k.id);
      if (!e) e = await crearEnsayoCon(c, { prueba: k.prueba, pruebaNombre: k.pruebaNombre, fecha: ed.fecha || "", clavijero: k });
      const paginas = new Map();
      g.hojas.forEach((x) => {
        const f = ed.archivos[x.archivo];
        if (!paginas.has(f)) paginas.set(f, []);
        paginas.get(f).push(x.pagina);
      });
      Object.assign(est, { enBlanco: false, cursoId: c.id, ensayoId: e.id, resumenLectura: null });
      ed.corrigiendo = { n: n + 1, de: grupos.length, curso: etiquetaCurso(c) };
      await subirHojas(Array.from(paginas.keys()), { paginas, fijo: true });
      const r = est.resumenLectura || { leidas: 0, exactas: 0, pendientes: 0, ilegibles: 0, repetidas: 0, avisos: [] };
      resultado.filas.push({ curso: etiquetaCurso(c), cursoId: c.id, ensayoId: e.id, leidas: r.leidas, exactas: r.exactas, pendientes: r.pendientes, ilegibles: r.ilegibles, repetidas: r.repetidas });
      detenido = (r.avisos || []).some((a) => /Detuviste|interrumpió/.test(a));
      (r.avisos || []).forEach((a) => resultado.avisos.push(`${etiquetaCurso(c)}: ${a}`));
      if (!detenido) g.hojas.forEach((x) => hechas.add(x));
    }
    est.resumenLectura = null;
    ed.corrigiendo = null;
    ed.resultado = resultado;
    if (detenido) {
      // lo que no alcanzó a corregirse sigue marcado, para finalizar de nuevo
      ed.hojas = ed.hojas.filter((x) => !hechas.has(x) || !x.curso);
    } else {
      soltarVistasEd();
      const previo = { colegio: ed.colegio, cursos: [], clavijeroId: null, listas: ed.listas };
      est.editor = Object.assign(editorVacio(previo), { resultado });
      fijarColegioEditor(previo.colegio);
    }
    est.vista = "editor";
    pintar();
    global.scrollTo({ top: 0 });
    toast(detenido ? "La corrección se detuvo: lo ya leído quedó guardado" : "Hojas corregidas y guardadas en sus cursos");
  }

  // ============================================================ CONFIGURACIÓN

  function htmlVistaConfig() {
    const nCursos = est.cursos.length + est.papelera.length;
    let h = `<div class="tarjeta"><h2>⚙️ Configuración</h2>
      <p class="ayuda" style="margin-bottom:0;">Descarga de informes y borrado de los datos de los Ensayos PAES guardados en este computador.</p></div>
      <div class="tarjeta"><h2 style="font-size:16px;">📦 Descargar informes</h2>
        <p class="ayuda">Eliges los colegios y cursos, y se descarga <b>un solo archivo ZIP</b> con el informe PDF de resultados de cada prueba de cada curso marcado.</p>
        <div class="acciones-form"><button type="button" data-accion="cfg-informes" ${est.generando ? "disabled" : ""}>📦 Descargar informes</button></div></div>
      <div class="tarjeta paes-cfg-peligro"><h2 style="font-size:16px;">🗑 Eliminar todos los datos</h2>
        <p class="ayuda">Borra de este computador <b>todos</b> los cursos, listas, ensayos, hojas leídas y resultados de los Ensayos PAES, incluida la papelera. No toca los test vocacionales (Kuder y 8° básico).</p>`;
    if (!est.cfgBorrar) h += `<div class="acciones-form"><button type="button" class="peligro" data-accion="cfg-borrar">🗑 Eliminar todos los datos</button></div>`;
    else
      h += `<div class="paes-cfg-confirmar">
        <p><b>Esto no se puede deshacer.</b> Se van a borrar ${plural(nCursos, "curso", "cursos")}${est.papelera.length ? ` (${est.papelera.length} en la papelera)` : ""}, ${plural(est.ensayos.length, "ensayo", "ensayos")} y ${plural(est.hojas.length, "hoja leída", "hojas leídas")}. Si necesitas conservar algo, descarga antes los informes o el Excel.</p>
        <label class="paes-filtro"><input type="checkbox" id="paes-cfg-clv" /> Borrar también los ${plural(est.clavijeros.length, "clavijero guardado", "clavijeros guardados")}</label>
        <label for="paes-cfg-palabra">Para confirmar, escribe <b>ELIMINAR</b>:</label>
        <input type="text" id="paes-cfg-palabra" autocomplete="off" spellcheck="false" style="max-width:220px;" />
        <div class="acciones-form"><button type="button" class="peligro" data-accion="cfg-borrar-si">Eliminar todo definitivamente</button><button type="button" class="secundario" data-accion="cfg-borrar-no">Cancelar</button></div></div>`;
    h += `</div>`;
    if (est.cfgInformes) h += htmlModalInformes();
    return h;
  }

  // ventana para elegir de qué colegios y cursos se descargan los informes
  function htmlModalInformes() {
    const sel = est.cfgInformes;
    let cuerpo = "";
    porColegio().forEach((g, k) => {
      const filas = g.cursos.map((c) => {
        const n = ensayosConHojas([c]).length;
        return `<label class="paes-inf-curso${n ? "" : " sin"}"><input type="checkbox" data-cambio="inf-curso" data-col="${k}" data-curso="${esc(c.id)}" ${n ? "" : "disabled"} ${sel.has(c.id) ? "checked" : ""} /> <b>${esc(etiquetaCurso(c))}</b> <small>${esc(c.anio)} · ${n ? plural(n, "informe", "informes") + " · " + ordenPruebas(ensayosDelCurso(c.id)).filter((e) => hojasDelEnsayo(e.id).some(vigente)).map((e) => esc(siglaPrueba(e))).join(", ") : "sin resultados todavía"}</small></label>`;
      });
      cuerpo += `<div class="paes-inf-colegio"><label class="paes-inf-cab"><input type="checkbox" data-cambio="inf-colegio" data-col="${k}" /> 🏫 ${esc(g.colegio)}</label>${filas.join("")}</div>`;
    });
    return `<div class="modal-overlay paes-inf-modal" style="display:flex;"><div class="modal-caja paes-inf-caja">
      <h3>📦 Descargar informes</h3>
      <p class="ayuda">Marca los colegios o los cursos. Se descarga un solo ZIP con todos los PDF.</p>
      <div class="acciones-form"><button type="button" class="secundario chico" data-accion="inf-todos">☑ Seleccionar todos</button><button type="button" class="secundario chico" data-accion="inf-ninguno">☐ Desmarcar todos</button></div>
      <div class="paes-inf-lista">${cuerpo || `<p class="ayuda">Aún no hay cursos.</p>`}</div>
      <div class="acciones-form"><button type="button" id="paes-inf-descargar" data-accion="inf-descargar">Descargar ZIP</button><button type="button" class="secundario" data-accion="inf-cerrar">Cancelar</button></div>
    </div></div>`;
  }
  // actualiza las casillas de colegio y el botón sin volver a pintar toda la ventana
  function refrescarModalInformes() {
    const sel = est.cfgInformes;
    if (!sel) return;
    raiz.querySelectorAll('[data-cambio="inf-curso"]').forEach((x) => (x.checked = sel.has(x.dataset.curso)));
    raiz.querySelectorAll('[data-cambio="inf-colegio"]').forEach((x) => {
      const suyos = Array.from(raiz.querySelectorAll(`[data-cambio="inf-curso"][data-col="${x.dataset.col}"]:not(:disabled)`));
      const marcados = suyos.filter((y) => y.checked).length;
      x.disabled = !suyos.length;
      x.checked = suyos.length > 0 && marcados === suyos.length;
      x.indeterminate = marcados > 0 && marcados < suyos.length;
    });
    const n = ensayosConHojas(est.cursos.filter((c) => sel.has(c.id))).length;
    const btn = raiz.querySelector("#paes-inf-descargar");
    if (btn) {
      btn.disabled = !n || est.generando;
      btn.textContent = n ? `Descargar ZIP (${plural(n, "informe PDF", "informes PDF")})` : "Descargar ZIP";
    }
  }

  async function eliminarTodosLosDatos(conClavijeros) {
    try {
      await PaesDB.vaciar(["cursos", "ensayos", "hojas", "imagenes", "auditoria"]);
      if (conClavijeros) {
        est.clavijeros = [];
        await PaesDB.borrar("ajustes", "clavijeros");
      }
    } catch (err) {
      console.error(err);
      toast("No se pudieron eliminar los datos.");
      return;
    }
    // no se puede deshacer: el historial de acciones queda vacío
    Object.assign(diario, { hechas: [], deshechas: [], pendiente: null });
    Object.assign(est, { cursos: [], ensayos: [], hojas: [], papelera: [], cursoId: null, ensayoId: null, enBlanco: true, tanda: [], paso: "curso", cfgBorrar: false, cfgInformes: null, editor: null, otroClv: null, verCurso: null, editarEn: null, fusionarEn: null, previa: null, listas: null });
    await cargarDatos();
    pintar();
    pintarBarraAcciones();
    toast("Se eliminaron todos los datos de los Ensayos PAES");
  }

  // ---- Resultados guardados: «Ver curso» y «Editar resultados»
  function ordenPruebas(ensayos) {
    const peso = (e) => (e.prueba === "CL" ? 0 : e.prueba === "M1" ? 1 : 2);
    return ensayos.slice().sort((a, b) => peso(a) - peso(b) || String(a.fecha || "").localeCompare(String(b.fecha || "")));
  }
  function htmlVerCurso(c) {
    const ensayos = ordenPruebas(ensayosDelCurso(c.id)).filter((e) => hojasDelEnsayo(e.id).some(vigente));
    if (!ensayos.length) return `<div class="paes-ver-curso"><p class="ayuda" style="margin:0;">Este curso aún no tiene hojas leídas.</p></div>`;
    return `<div class="paes-ver-curso">${ensayos
      .map((e) => {
        const res = L.resultadosEnsayo(e, hojasDelEnsayo(e.id), cursoParaResultados(c, [e]).estudiantes);
        const st = res.estadisticas;
        const pend = contarEstados(e).revisar;
        return `<div class="paes-ver-prueba ${clasePrueba(e)}">
          <div class="paes-ver-banner"><b>${esc(siglaPrueba(e))}</b><span>${esc(nombrePrueba(e))}<small>${e.forma ? "Forma " + esc(e.forma) + " · " : ""}${e.fecha ? esc(PaesExcel.fechaCorta(e.fecha)) + " · " : ""}rindieron ${st.rindieron} de ${st.enLista} · promedio ${numero(st.promedio, 1)}${pend ? ` · ${pend} por revisar` : ""}</small></span>
            <button type="button" class="secundario chico" data-accion="res-ver" data-curso="${esc(c.id)}" data-ensayo="${esc(e.id)}">Abrir resultados completos</button></div>
          <div class="paes-tabla-scroll"><table class="paes-tabla paes-resultados"><thead><tr><th>N°</th><th>Estudiante</th><th>RUT</th><th>Correctas</th><th>Puntaje</th></tr></thead><tbody>
          ${res.filas.map((f, i) => `<tr><td class="num">${i + 1}</td><td>${f.estudianteId ? esc(f.nombre) : `<span class="paes-falta">Sin identificar</span>`}</td><td class="rut">${esc(L.formatearRutPaes(f.rut) || "")}</td><td class="num">${f.correctas}</td><td class="num puntaje">${f.puntaje == null ? `<span class="paes-falta">sin tabla</span>` : f.puntaje}</td></tr>`).join("")}
          </tbody></table></div></div>`;
      })
      .join("")}</div>`;
  }
  function htmlEditarResultados(c) {
    const ensayos = ordenPruebas(ensayosDelCurso(c.id)).filter((e) => hojasDelEnsayo(e.id).some(vigente));
    return `<div class="paes-editar-res"><b>✏️ ¿Qué ensayo quieres editar?</b>
      <div class="paes-editar-res-lista">${ensayos
        .map((e) => {
          const n = hojasDelEnsayo(e.id).filter(vigente).length, pend = contarEstados(e).revisar;
          return `<button type="button" class="paes-prueba-btn ${clasePrueba(e)}" data-accion="res-ver" data-curso="${esc(c.id)}" data-ensayo="${esc(e.id)}" data-ir="revision"><b>${esc(siglaPrueba(e))}</b><span>${esc(nombrePrueba(e))}</span><small>${e.forma ? "Forma " + esc(e.forma) + " · " : ""}${plural(n, "hoja", "hojas")}${pend ? " · " + pend + " por revisar" : ""}</small></button>`;
        })
        .join("")}</div>
      <small>Te lleva a las hojas escaneadas de ese ensayo, para corregir respuestas, RUT o a quién pertenece cada hoja.</small></div>`;
  }

  async function descargarExcel() {
    const c = cursoActual();
    const e = ensayoActual();
    if (!c || !e) return;
    try {
      const blob = await PaesExcel.excelDeEnsayo({ ensayo: e, curso: cursoParaResultados(c, [e]), hojas: hojasDelEnsayo(e.id), nombrePrueba: nombrePrueba(e), etiquetaCurso: etiquetaCurso(c), advertencias: advertenciasDelEnsayo(e) });
      descargar(blob, `${nombreArchivoEnsayo(c, e, "Resultados Ensayo PAES")}.xlsx`);
      toast("Excel descargado");
    } catch (err) {
      console.error(err);
      toast("No se pudo crear el Excel.");
    }
  }

  // ============================================================ VISTAS DEL MÓDULO

  function htmlVistas() {
    const b = (id, texto) => `<button type="button" class="${est.vista === id ? "" : "secundario"}" data-vista="${id}">${texto}</button>`;
    return `<div class="paes-vistas">${b("curso", "📝 Trabajar un curso")}${b("resultados", "📁 Resultados guardados")}${b("clavijeros", `🔑 Clavijeros subidos${est.clavijeros.length ? " (" + est.clavijeros.length + ")" : ""}`)}${b("carpetas", "🗂 Editar carpetas")}${b("papelera", `🗑 Papelera${cuentaPapelera() ? " (" + cuentaPapelera() + ")" : ""}`)}${b("acciones", `🕓 Acciones${diario.hechas.length ? " (" + diario.hechas.length + ")" : ""}`)}${b("editor", "✂️ Editor de PDF")}${b("config", "⚙️ Configuración")}</div>`;
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
      <div class="paes-cabecera-acciones"><button type="button" data-accion="clv-nuevo">➕ Agregar clavijero</button></div></div>`;
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
              <button type="button" class="secundario chico" data-accion="clv-exportar" data-id="${esc(k.id)}" title="Descarga el clavijero en Excel para pasárselo a otra persona de la unidad">⬇ Exportar</button>
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

  // descarga un clavijero en Excel; el archivo se puede volver a subir en «Agregar clavijero»
  function exportarClavijero(id) {
    const k = est.clavijeros.find((x) => x.id === id);
    if (!k) return;
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([["Pregunta", "Respuesta", "Válida"]].concat(k.clave.map((q) => [q.n, q.r || "", q.valida ? "sí" : "no"]))), "Clave");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([["Dato", "Valor"], ["Nombre", k.nombre], ["Prueba", k.prueba], ["Nombre de la prueba", k.prueba === "OTRA" ? k.pruebaNombre || "" : nombrePruebaDe(k)], ["Forma", k.forma || ""], ["Alternativas", k.alternativas || 4], ["Exportado", new Date().toLocaleString("es-CL")]]), "Datos");
    const blob = new Blob([XLSX.write(libro, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    descargar(blob, `Clavijero_${nombreSeguro(k.nombre)}.xlsx`);
    toast("Clavijero exportado. Contiene las respuestas correctas: compártelo solo dentro de la unidad");
  }

  async function guardarClavijeroDeArchivo(archivo) {
    try {
      // un clavijero exportado desde la app trae sus datos (nombre, prueba, forma) en la hoja «Datos»
      const hojas = await hojasDeArchivo(archivo);
      const datos = hojas.find((x) => L.sinTildes(x.nombre).toLowerCase() === "datos");
      const clave = hojas.find((x) => x !== datos) || hojas[0];
      if (datos) {
        const valor = (campo) => String((datos.filas.find((f) => L.sinTildes(String(f[0] || "")).toLowerCase() === campo) || [])[1] || "").trim();
        const pone = (sel, v) => {
          const el = raiz.querySelector(sel);
          if (el && v && (el.tagName !== "SELECT" || Array.from(el.options).some((o) => o.value === v))) el.value = v;
        };
        if (!raiz.querySelector("#paes-clv-nombre").value.trim()) pone("#paes-clv-nombre", valor("nombre"));
        pone("#paes-clv-prueba", valor("prueba"));
        if (!raiz.querySelector("#paes-clv-forma").value.trim()) pone("#paes-clv-forma", valor("forma"));
      }
      await guardarClavijeroNuevo(L.leerClave(clave.filas), archivo.name);
      return;
    } catch (err) {
      console.error(err);
    }
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
    h += `<div class="tarjeta paes-res-modo"><span><b>Cómo ver los cursos con más de una prueba:</b></span>
      <button type="button" class="${est.resMezcla ? "secundario " : ""}chico" data-accion="res-modo" data-modo="separado">Ver por separado</button>
      <button type="button" class="${est.resMezcla ? "" : "secundario "}chico" data-accion="res-modo" data-modo="mezcla">🔀 Mezclar datos (pruebas juntas)</button>
      <small>${est.resMezcla ? "Cada curso muestra una sola tabla con sus pruebas lado a lado, por estudiante. No se calcula un puntaje combinado." : "Cada prueba del curso se muestra en su propia fila."}</small></div>`;
    h += htmlCursosParecidos() + htmlEnsayosAplicados();
    porColegio().forEach((g) => {
      h += `<div class="tarjeta paes-colegio"><h2 style="font-size:17px;">🏫 ${esc(g.colegio)} <small>${plural(g.cursos.length, "curso", "cursos")}</small></h2>`;
      g.cursos.forEach((c) => {
        const ensayos = ensayosDelCurso(c.id);
        const conHojas = ensayos.filter((e) => hojasDelEnsayo(e.id).some(vigente));
        h += `<details class="paes-detalle paes-res-curso" ${est.cursoId === c.id || g.cursos.length === 1 || est.verCurso === c.id || est.editarEn === c.id ? "open" : ""}><summary><b class="paes-res-nombre">${esc(etiquetaCurso(c))}</b> <span class="paes-res-meta">${esc(c.anio)} · ${plural(c.estudiantes.length, "estudiante", "estudiantes")}${c.listaOficial === false ? " · lista provisoria" : ""}</span> ${pildorasDePruebas(c)}
          <span class="paes-res-botones"><button type="button" class="${est.verCurso === c.id ? "" : "secundario "}chico" data-accion="res-ver-curso" data-curso="${esc(c.id)}">👁 ${est.verCurso === c.id ? "Ocultar curso" : "Ver curso"}</button><button type="button" class="${est.editarEn === c.id ? "" : "secundario "}chico" data-accion="res-editar" data-curso="${esc(c.id)}">✏️ Editar resultados</button></span></summary>`;
        if (est.editarEn === c.id) h += htmlEditarResultados(c);
        if (est.verCurso === c.id) h += htmlVerCurso(c);
        if (!ensayos.length) h += `<p class="ayuda" style="margin:0 0 8px;">Este curso aún no tiene ensayos.</p><div class="acciones-form"><button type="button" class="secundario chico" data-accion="res-ver" data-curso="${esc(c.id)}" data-ensayo="" data-ir="ensayo">Crear su primer ensayo →</button></div>`;
        ensayos.forEach((e) => {
          const hojas = hojasDelEnsayo(e.id);
          if (!hojas.some(vigente)) {
            h += `<div class="paes-res-fila"><div><b>${esc(nombrePrueba(e))}</b><small>${esc(etiquetaEnsayo(e))} · aún sin hojas leídas</small></div>
              <div class="paes-cabecera-acciones"><button type="button" class="secundario chico" data-accion="res-ver" data-curso="${esc(c.id)}" data-ensayo="${esc(e.id)}" data-ir="hojas">Subir sus hojas →</button></div></div>`;
            return;
          }
          const st = L.resultadosEnsayo(e, hojas, cursoParaResultados(c, [e]).estudiantes).estadisticas;
          const pend = contarEstados(e).revisar;
          const attrs = `data-curso="${esc(c.id)}" data-ensayo="${esc(e.id)}"`;
          h += `<div class="paes-res-fila ${clasePrueba(e)}"><div><b>${esc(nombrePrueba(e))}</b>
            <small>${e.forma ? "Forma " + esc(e.forma) + " · " : ""}${e.fecha ? esc(PaesExcel.fechaCorta(e.fecha)) + " · " : ""}rindieron ${st.rindieron} de ${st.enLista} · promedio ${numero(st.promedio, 1)}${pend ? ` · <span class="paes-falta">${pend} por revisar</span>` : ""}</small></div>
            <div class="paes-cabecera-acciones">
              <button type="button" class="chico" data-accion="res-ver" ${attrs}>Ver resultados</button>
              <button type="button" class="secundario chico" data-accion="res-informe" data-formato="pdf" ${attrs} ${est.generando ? "disabled" : ""}>📄 PDF</button>
              <button type="button" class="secundario chico" data-accion="res-informe" data-formato="word" ${attrs} ${est.generando ? "disabled" : ""}>📝 Word</button>
              <button type="button" class="secundario chico" data-accion="res-informe" data-formato="excel" ${attrs}>⬇ Excel</button>
            </div></div>`;
        });
        if (est.resMezcla) h += htmlCombinada(c, true);
        h += est.fusionarEn === c.id ? htmlFusionar(c) : "";
        h += est.otroClv === c.id ? htmlAgregarPdf(c) : `<div class="acciones-form paes-res-pie"><button type="button" class="chico" data-accion="res-agregar-pdf" data-curso="${esc(c.id)}" ${est.lectura ? "disabled" : ""}>📄 Agregar ensayos PDF</button><small>Subes los PDF y después eliges el clavijero que les corresponde. No borra lo ya corregido.</small>
          ${est.cursos.length > 1 ? `<button type="button" class="secundario chico" data-accion="fusionar" data-curso="${esc(c.id)}">🔗 Fusionar con otro curso</button>` : ""}</div>`;
        h += `</details>`;
      });
      h += `</div>`;
    });
    return h;
  }

  // las pruebas de un curso como píldoras de color: con hojas (llena) o sin hojas todavía (punteada)
  function pildorasDePruebas(c) {
    const ensayos = ensayosDelCurso(c.id);
    if (!ensayos.length) return `<span class="paes-pill vacia"><b>—</b>sin pruebas</span>`;
    return ensayos.map((e) => {
      const n = hojasDelEnsayo(e.id).filter(vigente).length;
      return `<span class="paes-pill ${n ? clasePrueba(e) : "vacia"}" title="${esc(etiquetaEnsayo(e))}"><b>${esc(siglaPrueba(e))}</b>${n ? plural(n, "hoja", "hojas") : "sin hojas"}</span>`;
    }).join("");
  }

  // pares de cursos que comparten buena parte de sus estudiantes (por RUT): probablemente son el mismo
  function cursosParecidos() {
    const lista = est.cursos.filter((c) => !c.disperso && c.estudiantes.some((x) => x.rut));
    const pares = [];
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i], b = lista[j];
        const deB = new Set(b.estudiantes.map((x) => x.rut).filter(Boolean));
        const comunes = a.estudiantes.filter((x) => x.rut && deB.has(x.rut)).length;
        const menor = Math.min(a.estudiantes.filter((x) => x.rut).length, deB.size);
        if (comunes >= 3 && comunes >= menor * 0.5) {
          // se conserva el de lista oficial; si no, el que tiene más estudiantes
          const quedaB = b.listaOficial === true && a.listaOficial !== true ? true : a.listaOficial === true && b.listaOficial !== true ? false : b.estudiantes.length > a.estudiantes.length;
          pares.push({ sale: quedaB ? a : b, queda: quedaB ? b : a, comunes });
        }
      }
    }
    return pares;
  }

  function htmlCursosParecidos() {
    const pares = cursosParecidos();
    if (!pares.length) return "";
    return `<div class="tarjeta paes-parecidos"><h2 style="font-size:16px;">Cursos que parecen ser el mismo</h2>
      <p class="ayuda">Comparten estudiantes (mismo RUT). Si son el mismo curso cargado dos veces, por ejemplo una vez para CL y otra para M1, fusiónalos: quedan en un solo curso con sus dos pruebas.</p>
      ${pares.map((p) => `<div class="paes-res-fila"><div><b>${esc(nombreCurso(p.sale))}</b> ${pildorasDePruebas(p.sale)} y <b>${esc(nombreCurso(p.queda))}</b> ${pildorasDePruebas(p.queda)}<small>${plural(p.comunes, "estudiante en común", "estudiantes en común")} · quedaría como ${esc(nombreCurso(p.queda))}</small></div>
        <div class="paes-cabecera-acciones"><button type="button" class="chico" data-accion="fusionar-ok" data-a="${esc(p.sale.id)}" data-b="${esc(p.queda.id)}">🔗 Fusionar</button></div></div>`).join("")}</div>`;
  }

  function htmlFusionar(c) {
    const mismos = ordenarCursos(est.cursos).filter((k) => k.id !== c.id && normColegio(k.colegio) === normColegio(c.colegio));
    const otros = ordenarCursos(est.cursos).filter((k) => k.id !== c.id && !mismos.includes(k));
    const opcion = (k) => `<option value="${esc(k.id)}">${esc(nombreCurso(k))} · ${esc(k.anio)} · ${plural(k.estudiantes.length, "estudiante", "estudiantes")}</option>`;
    return `<div class="paes-agregar-manual"><b>Fusionar ${esc(nombreCurso(c))} con otro curso</b>
      <p class="ayuda" style="margin:6px 0;">Los dos cursos quedan en uno solo, con el nombre del curso que elijas abajo: se juntan las listas (por RUT) y se conservan todas las pruebas, hojas y correcciones.</p>
      <div class="paes-candidatos paes-transferir"><span>Unir este curso a:</span><select id="paes-fusionar-sel">${mismos.length ? `<optgroup label="${esc(c.colegio)}">${mismos.map(opcion).join("")}</optgroup>` : ""}${otros.length ? `<optgroup label="Otros colegios">${otros.map(opcion).join("")}</optgroup>` : ""}</select>
        <button type="button" class="chico" data-accion="fusionar-ok" data-a="${esc(c.id)}">🔗 Fusionar</button><button type="button" class="secundario chico" data-accion="fusionar" data-curso="">Cancelar</button></div></div>`;
  }

  function pedirFusion(idSale, idQueda) {
    const a = est.cursos.find((x) => x.id === idSale), b = est.cursos.find((x) => x.id === idQueda);
    if (!a || !b || a === b) return;
    confirmar({
      titulo: "Fusionar cursos",
      texto: `${nombreCurso(a)} (${plural(a.estudiantes.length, "estudiante", "estudiantes")}, ${plural(ensayosDelCurso(a.id).length, "prueba", "pruebas")}) se va a unir a ${nombreCurso(b)} (${plural(b.estudiantes.length, "estudiante", "estudiantes")}, ${plural(ensayosDelCurso(b.id).length, "prueba", "pruebas")}). Queda un solo curso, ${nombreCurso(b)}, con todas las pruebas y hojas. Se puede revertir con «Deshacer».`,
      textoBoton: "Fusionar",
      onConfirmar: async () => {
        est.fusionarEn = null;
        await fusionarCursos(a, b);
      },
    });
  }

  // «Ensayos aplicados»: por ensayo (primero Competencia Lectora, después Matemática), qué
  // clavijero se aplicó y a qué cursos. Así se distingue, por ejemplo, la forma del primer
  // semestre de la del segundo.
  function htmlEnsayosAplicados() {
    const orden = (e) => (e.prueba === "CL" ? 0 : e.prueba === "M1" ? 1 : 2);
    const grupos = new Map(); // prueba -> Map(clavijero o clave -> [{ curso, ensayo, hojas }])
    ordenarCursos(est.cursos).forEach((c) => {
      ensayosDelCurso(c.id).forEach((e) => {
        const prueba = nombrePrueba(e);
        if (!grupos.has(prueba)) grupos.set(prueba, { orden: orden(e), clase: clasePrueba(e), sigla: siglaPrueba(e), claves: new Map() });
        const k = clavijeroDe(e);
        const etiqueta = k ? `Clavijero «${k.nombre}»${k.forma ? " · Forma " + k.forma : ""}` : e.clave.some((q) => q.r) ? "Clave propia del curso (sin clavijero guardado)" : "Sin clave todavía";
        const claves = grupos.get(prueba).claves;
        if (!claves.has(etiqueta)) claves.set(etiqueta, { conClavijero: !!k, usos: [] });
        claves.get(etiqueta).usos.push({ curso: c, ensayo: e, hojas: hojasDelEnsayo(e.id).filter(vigente).length });
      });
    });
    let cuerpo = "";
    Array.from(grupos.entries())
      .sort((a, b) => a[1].orden - b[1].orden || a[0].localeCompare(b[0], "es"))
      .forEach(([prueba, g]) => {
        cuerpo += `<div class="paes-ens-grupo"><h3><span class="paes-pill ${g.clase}"><b>${esc(g.sigla)}</b>${esc(prueba)}</span></h3>`;
        Array.from(g.claves.entries())
          .sort((a, b) => Number(b[1].conClavijero) - Number(a[1].conClavijero) || a[0].localeCompare(b[0], "es"))
          .forEach(([etiqueta, x]) => {
            const total = x.usos.reduce((a, u) => a + u.hojas, 0);
            cuerpo += `<div class="paes-ens-clave"><div class="paes-ens-clave-cab"><b>🔑 ${esc(etiqueta)}</b><small>${plural(x.usos.length, "curso", "cursos")} · ${plural(total, "hoja corregida", "hojas corregidas")}</small></div>
              <div>${x.usos.map((u) => `<span class="paes-chip ${u.hojas ? "verde" : "gris"}" title="${esc(etiquetaEnsayo(u.ensayo))}">${esc(nombreCurso(u.curso))} · ${u.hojas ? plural(u.hojas, "hoja", "hojas") : "sin hojas"}${u.ensayo.fecha ? " · " + esc(PaesExcel.fechaCorta(u.ensayo.fecha)) : ""}</span>`).join(" ")}</div></div>`;
          });
        cuerpo += `</div>`;
      });
    return `<div class="tarjeta"><h2 style="font-size:16px;">Ensayos aplicados</h2>
      <p class="ayuda">Por cada ensayo, qué clavijero se aplicó y a qué cursos. Primero Competencia Lectora y después Matemática.</p>
      ${cuerpo || `<p class="ayuda" style="margin:0;">Aún no se ha aplicado ningún ensayo.</p>`}</div>`;
  }

  // «Agregar ensayos PDF»: primero se eligen los PDF y después el clavijero que les corresponde
  function htmlAgregarPdf(c) {
    const p = est.pdfPendientes && est.pdfPendientes.cursoId === c.id ? est.pdfPendientes : null;
    const cancelar = `<button type="button" class="secundario chico" data-accion="res-agregar-pdf" data-curso="">Cancelar</button>`;
    const entrada = `<input type="file" data-archivo="res-pdf" accept=".pdf,image/*" multiple style="display:none;" />`;
    if (!p) {
      return `<div class="paes-agregar-manual" id="paes-otro-clv"><b>📄 Agregar ensayos PDF · ${esc(nombreCurso(c))}</b>
        <p class="ayuda" style="margin:6px 0;">Paso 1 de 2: elige los PDF del escáner (una hoja por página). Después eliges el clavijero que les corresponde.</p>
        ${entrada}<div class="acciones-form"><button type="button" class="chico" data-accion="res-elegir-pdf" ${est.lectura ? "disabled" : ""}>📄 Elegir los PDF…</button>${cancelar}</div></div>`;
    }
    const aplicados = new Map(ensayosDelCurso(c.id).filter((e) => e.clavijeroId).map((e) => [e.clavijeroId, hojasDelEnsayo(e.id).filter(vigente).length]));
    const lista = `<ul class="paes-no-rindieron" style="margin:6px 0;">${p.archivos.map((a) => `<li>📄 ${esc(a.name)}</li>`).join("")}</ul>`;
    if (!est.clavijeros.length) {
      return `<div class="paes-agregar-manual" id="paes-otro-clv"><b>📄 Agregar ensayos PDF · ${esc(nombreCurso(c))}</b>${lista}
        <p class="ayuda" style="margin:6px 0;">Aún no hay clavijeros guardados. Agrégalo primero en «Clavijeros subidos» y después vuelve a subir estos PDF.</p>
        <div class="acciones-form"><button type="button" class="chico" data-vista="clavijeros">Ir a Clavijeros subidos</button>${cancelar}</div></div>`;
    }
    return `<div class="paes-agregar-manual" id="paes-otro-clv"><b>📄 Agregar ensayos PDF · ${esc(nombreCurso(c))}</b>
      <p class="ayuda" style="margin:6px 0 0;">${plural(p.archivos.length, "archivo elegido", "archivos elegidos")}:</p>${lista}
      <p class="ayuda" style="margin:6px 0;">Paso 2 de 2: elige el clavijero que corresponde a estos PDF. Se usa la lista del curso y lo ya corregido no cambia.</p>
      <div class="paes-checks paes-clv-opciones">${est.clavijeros.slice().sort((a, b) => a.prueba.localeCompare(b.prueba) || a.nombre.localeCompare(b.nombre, "es")).map((k, i) => `<label><input type="radio" name="paes-pdf-clv" value="${esc(k.id)}" ${i === 0 ? "checked" : ""} /> <span class="paes-pill ${clasePrueba(k)}"><b>${esc(siglaPrueba(k))}</b>${esc(k.nombre)}</span>${aplicados.has(k.id) ? `<span class="paes-chip verde">✔ ya aplicado a este curso · ${plural(aplicados.get(k.id), "hoja", "hojas")}: los PDF se suman a ese ensayo</span>` : `<span class="paes-chip gris">aún no aplicado a este curso</span>`}</label>`).join("")}</div>
      <div class="grid-form" style="margin-top:8px;"><div><label>Fecha de aplicación</label><input type="date" id="paes-otro-clv-fecha" value="${hoyIso()}" /></div></div>
      ${entrada}<div class="acciones-form"><button type="button" class="chico" data-accion="res-corregir-pdf" data-curso="${esc(c.id)}" ${est.lectura ? "disabled" : ""}>Corregir estos PDF con ese clavijero →</button>
        <button type="button" class="secundario chico" data-accion="res-elegir-pdf">Cambiar los PDF…</button>${cancelar}</div></div>`;
  }

  // lee los PDF elegidos en el ensayo del clavijero indicado (lo crea si el curso aún no lo tiene)
  async function corregirPdfPendientes(cursoId) {
    const c = est.cursos.find((x) => x.id === cursoId);
    const p = est.pdfPendientes;
    const marcado = raiz.querySelector('input[name="paes-pdf-clv"]:checked');
    const k = marcado ? est.clavijeros.find((x) => x.id === marcado.value) : null;
    if (!c || !p || p.cursoId !== cursoId || !p.archivos.length || est.lectura) return;
    if (!k) {
      toast("Elige el clavijero que corresponde a estos PDF.");
      return;
    }
    let e = ensayosDelCurso(c.id).find((x) => x.clavijeroId === k.id);
    if (!e) e = await crearEnsayoCon(c, { prueba: k.prueba, pruebaNombre: k.pruebaNombre, fecha: raiz.querySelector("#paes-otro-clv-fecha").value || "", clavijero: k });
    Object.assign(est, { otroClv: null, pdfPendientes: null, enBlanco: false, cursoId: c.id, ensayoId: e.id, vista: "curso", paso: "hojas", formCurso: null, formEnsayo: false, resumenLectura: null, otraPrueba: false, moverArchivo: null });
    if (!est.tanda.includes(c.id)) est.tanda = [];
    pintar();
    global.scrollTo({ top: 0 });
    await subirHojas(p.archivos);
  }

  // ============================================================ PAPELERA Y DESHACER

  let relojDeshacer = null;
  function quitarBarraDeshacer() {
    clearTimeout(relojDeshacer);
    const b = document.getElementById("paes-deshacer");
    if (b) b.remove();
  }
  // barra que aparece abajo 5 segundos después de eliminar algo, con el botón «Deshacer»
  function barraDeshacer(texto, alDeshacer) {
    quitarBarraDeshacer();
    const b = document.createElement("div");
    b.id = "paes-deshacer";
    b.className = "paes-deshacer";
    b.innerHTML = `<span>${esc(texto)}</span><button type="button">↩ Deshacer</button><i></i>`;
    b.querySelector("button").addEventListener("click", () => {
      quitarBarraDeshacer();
      alDeshacer();
    });
    document.body.appendChild(b);
    relojDeshacer = setTimeout(quitarBarraDeshacer, 5000);
  }

  const cuentaPapelera = () => est.papelera.length + est.cursos.reduce((a, c) => a + (c.eliminados || []).length, 0);

  async function restaurarCurso(id) {
    const i = est.papelera.findIndex((x) => x.curso.id === id);
    if (i < 0) return;
    const p = est.papelera[i];
    const c = p.curso;
    if (est.cursos.some((k) => k.colegio.toLowerCase() === c.colegio.toLowerCase() && k.nivel === c.nivel && (k.letra || "") === (c.letra || "") && k.anio === c.anio)) {
      toast("Ya hay un curso con ese colegio, nivel, letra y año: cámbiale la letra a ese curso y vuelve a intentarlo.");
      return;
    }
    delete c.eliminado;
    await guardar("cursos", c);
    est.papelera.splice(i, 1);
    est.cursos.push(c);
    est.ensayos.push(...p.ensayos);
    est.hojas.push(...p.hojas);
    pintar();
    toast(`Se recuperó ${c.colegio} · ${etiquetaCurso(c)} con todo lo suyo`);
  }

  function purgarCurso(id) {
    const p = est.papelera.find((x) => x.curso.id === id);
    if (!p) return;
    confirmar({
      titulo: "Eliminar para siempre",
      texto: `Se van a borrar definitivamente ${p.curso.colegio} · ${etiquetaCurso(p.curso)}, su lista, ${plural(p.ensayos.length, "ensayo", "ensayos")} y ${plural(p.hojas.length, "hoja leída", "hojas leídas")} con sus imágenes. Esto no se puede deshacer.`,
      textoBoton: "Eliminar para siempre",
      onConfirmar: async () => {
        for (const e of p.ensayos) await PaesDB.borrarEnsayo(e.id);
        await PaesDB.borrar("cursos", p.curso.id);
        est.papelera = est.papelera.filter((x) => x !== p);
        pintar();
        toast("Curso eliminado definitivamente");
      },
    });
  }

  async function restaurarEstudiante(cursoId, id) {
    const c = est.cursos.find((x) => x.id === cursoId);
    const s = c && (c.eliminados || []).find((x) => x.id === id);
    if (!s) return;
    if (s.rut && c.estudiantes.some((x) => x.rut === s.rut)) {
      toast("En la lista del curso ya hay un estudiante con ese RUT: no se recuperó.");
      return;
    }
    c.eliminados = c.eliminados.filter((x) => x.id !== id);
    const vuelve = Object.assign({}, s);
    delete vuelve.eliminado;
    delete vuelve.hojasQueTenia;
    c.estudiantes.push(vuelve);
    // sus hojas vuelven a él si nadie más las tomó
    const suyas = est.hojas.filter((h) => (s.hojasQueTenia || []).some((q) => q.id === h.id) && !h.estudianteId);
    suyas.forEach((h) => {
      h.estudianteId = id;
      h.asignacion = (s.hojasQueTenia.find((q) => q.id === h.id) || {}).asignacion || "manual";
    });
    await PaesDB.ponerVarios([["cursos", c]].concat(suyas.map((h) => ["hojas", h])));
    await revincularCurso(c);
    pintar();
    toast(`Se recuperó a ${L.nombreCompletoPaes(vuelve)}${suyas.length ? ` con ${plural(suyas.length, "hoja", "hojas")}` : ""}`);
  }

  async function purgarEstudiante(cursoId, id) {
    const c = est.cursos.find((x) => x.id === cursoId);
    if (!c) return;
    c.eliminados = (c.eliminados || []).filter((x) => x.id !== id);
    await guardar("cursos", c);
    pintar();
    toast("Eliminado definitivamente");
  }

  function htmlVistaPapelera() {
    const cuando = (iso) => (iso ? PaesExcel.fechaCorta(iso.slice(0, 10)) : "");
    let h = `<div class="tarjeta"><h2>Papelera</h2>
      <p class="ayuda" style="margin-bottom:0;">Lo que eliminas queda aquí, guardado en este computador, hasta que lo recuperes o lo borres para siempre.</p></div>`;
    h += `<div class="tarjeta"><h2 style="font-size:16px;">Cursos eliminados (${est.papelera.length})</h2>`;
    if (!est.papelera.length) h += `<p class="ayuda" style="margin:0;">No hay cursos eliminados.</p>`;
    else {
      h += `<div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>Colegio</th><th>Curso</th><th>Tenía</th><th>Eliminado</th><th></th></tr></thead><tbody>`;
      est.papelera.forEach((p) => {
        h += `<tr><td>${esc(p.curso.colegio)}</td><td>${esc(etiquetaCurso(p.curso))} · ${esc(p.curso.anio)}</td>
          <td>${plural(p.curso.estudiantes.length, "estudiante", "estudiantes")} · ${plural(p.ensayos.length, "ensayo", "ensayos")} · ${plural(p.hojas.length, "hoja", "hojas")}</td><td>${esc(cuando(p.curso.eliminado))}</td>
          <td class="acciones"><button type="button" class="chico" data-accion="papelera-restaurar-curso" data-id="${esc(p.curso.id)}">↩ Recuperar</button>
          <button type="button" class="chico peligro" data-accion="papelera-purgar-curso" data-id="${esc(p.curso.id)}">Eliminar para siempre</button></td></tr>`;
      });
      h += `</tbody></table></div>`;
    }
    h += `</div>`;
    const alumnos = [];
    ordenarCursos(est.cursos).forEach((c) => (c.eliminados || []).forEach((x) => alumnos.push({ c, s: x })));
    h += `<div class="tarjeta"><h2 style="font-size:16px;">Estudiantes eliminados (${alumnos.length})</h2>`;
    if (!alumnos.length) h += `<p class="ayuda" style="margin:0;">No hay estudiantes eliminados.</p>`;
    else {
      h += `<div class="paes-tabla-scroll"><table class="paes-tabla"><thead><tr><th>Estudiante</th><th>RUT</th><th>Curso</th><th>Eliminado</th><th></th></tr></thead><tbody>`;
      alumnos.forEach(({ c, s: x }) => {
        h += `<tr><td>${esc(L.nombreCompletoPaes(x))}</td><td class="rut">${esc(L.formatearRutPaes(x.rut))}</td><td>${esc(nombreCurso(c))}</td><td>${esc(cuando(x.eliminado))}</td>
          <td class="acciones"><button type="button" class="chico" data-accion="papelera-restaurar-est" data-id="${esc(x.id)}" data-curso="${esc(c.id)}">↩ Recuperar</button>
          <button type="button" class="chico peligro" data-accion="papelera-purgar-est" data-id="${esc(x.id)}" data-curso="${esc(c.id)}">Eliminar para siempre</button></td></tr>`;
      });
      h += `</tbody></table></div>`;
    }
    return h + `</div>`;
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
      nuevos.push({ id: PaesDB.nuevoId("c"), colegio: (k.colegio || "Sin colegio").replace(/\s+/g, " ").trim(), nivel: nivelDesdeKuder(k.curso), letra: (k.letra || "").toUpperCase(), anio, estudiantes, creado: new Date().toISOString(), listaOficial: false, origen: { tipo: "kuder", clave: k.clave, cuando: new Date().toISOString() } });
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
      const gemelo = ensayosDelCurso(b.id).find((x) => x.prueba === e.prueba && (x.pruebaNombre || "") === (e.pruebaNombre || "") && (x.forma || "") === (e.forma || "") && firmaClave(x.clave) === firmaClave(e.clave));
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
      if (gemelo) {
        // los archivos subidos al ensayo que desaparece pasan al que queda
        const ya = new Set((gemelo.archivos || []).map((x) => x.huella));
        gemelo.archivos = (gemelo.archivos || []).concat((e.archivos || []).filter((x) => !ya.has(x.huella)));
        pares.push(["ensayos", gemelo]);
        borrar.push(e);
      } else {
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
    est.tanda = est.tanda.filter((id) => id !== a.id);
    await revincularCurso(b);
    pintar();
    toast(`Cursos fusionados en ${b.colegio} · ${etiquetaCurso(b)}: ${plural(b.estudiantes.length, "estudiante", "estudiantes")}`);
  }

  // ============================================================ REVISIÓN: ayudas para identificar

  const textoEstudiante = (s) => `${L.nombreCompletoPaes(s)}${s.rut ? " · " + L.formatearRutPaes(s.rut) : ""}`;

  // grupos: [{ titulo, estudiantes }]; con título, la lista sale separada por curso
  function htmlSinHoja(grupos) {
    const conGente = grupos.filter((g) => g.estudiantes.length);
    if (!conGente.length) return `<p class="paes-nota" style="margin-top:10px;">Todos los estudiantes de la lista ya tienen hoja en este ensayo.</p>`;
    return `<div class="paes-sin-hoja">${conGente.map((g) => `${g.titulo ? `<h4>${esc(g.titulo)} <small>(${g.estudiantes.length})</small></h4>` : ""}<ul class="paes-no-rindieron">${g.estudiantes.map((s) => `<li>${esc(L.nombreCompletoPaes(s))} <small>${esc(L.formatearRutPaes(s.rut))}</small></li>`).join("")}</ul>`).join("")}</div>`;
  }

  // los otros cursos con lista del mismo colegio
  function otrosDelColegio(c) {
    return ordenarCursos(est.cursos).filter((k) => k.id !== c.id && !k.disperso && normColegio(k.colegio) === normColegio(c.colegio));
  }

  // dónde busca el buscador de una hoja: el curso y, después, los otros cursos del colegio
  function gruposDeBusqueda(c) {
    const propios = gruposParaAsignar(c);
    if (c.disperso) return propios;
    const otros = otrosDelColegio(c);
    return [{ titulo: otros.length ? `${etiquetaCurso(c)} (este curso)` : "", cursoId: "", estudiantes: propios[0].estudiantes }].concat(otros.map((k) => ({ titulo: `${etiquetaCurso(k)} · ${k.anio}`, cursoId: k.id, estudiantes: estudiantesOrdenados(k) })));
  }

  // ¿calza el estudiante con lo escrito? Nombre (sin importar tildes ni orden) o parte del RUT
  function calzaEstudiante(s, q) {
    const soloRut = q.replace(/[.\-\s]/g, "");
    if (/^[0-9k]+$/.test(soloRut) && /\d/.test(soloRut)) return (s.rut || "").replace("-", "").toLowerCase().includes(soloRut);
    const nombre = L.sinTildes(`${s.nombres} ${s.apellidos}`).toLowerCase();
    return q.split(" ").every((p) => nombre.includes(p));
  }

  // opciones que aparecen bajo el buscador de una hoja mientras se escribe
  function htmlSugerencias(c, hojaId, texto) {
    const q = L.sinTildes(texto).toLowerCase().replace(/\s+/g, " ").trim();
    if (!q) return "";
    const conHoja = new Set(est.hojas.filter((h) => vigente(h) && h.estudianteId && h.id !== hojaId).map((h) => h.estudianteId));
    let h = "";
    gruposDeBusqueda(c).forEach((g) => {
      const hallados = g.estudiantes.filter((x) => calzaEstudiante(x, q));
      if (!hallados.length) return;
      if (g.titulo) h += `<span class="paes-sug-grupo">${esc(g.titulo)}${hallados.length > 8 ? ` · ${hallados.length} calzan, se muestran 8` : ""}</span>`;
      h += hallados.slice(0, 8).map((x) => `<button type="button" class="paes-sug" data-accion="sugerencia" data-id="${esc(hojaId)}" data-est="${esc(x.id)}" data-curso="${esc(g.cursoId || "")}"><b>${esc(L.nombreCompletoPaes(x))}</b> <small>${esc(L.formatearRutPaes(x.rut))}${conHoja.has(x.id) ? " · ya tiene hoja" : ""}${g.cursoId ? " · la hoja pasa a ese curso" : ""}</small></button>`).join("");
    });
    // cursos del colegio que calzan con lo escrito («4 b», «medio c»…)
    if (!c.disperso) {
      const compacto = q.replace(/[^a-z0-9]/g, "");
      otrosDelColegio(c).forEach((k) => {
        const etiqueta = L.sinTildes(etiquetaCurso(k)).toLowerCase();
        const corto = (etiqueta.match(/\d/) || [""])[0] + String(k.letra || "").toLowerCase();
        if (!(q.split(" ").every((p) => etiqueta.includes(p)) || (corto.length > 1 && compacto === corto))) return;
        h += `<button type="button" class="paes-sug curso" data-accion="sugerencia" data-id="${esc(hojaId)}" data-est="" data-curso="${esc(k.id)}">↔ Pasar la hoja a <b>${esc(etiquetaCurso(k))}</b> <small>${plural(k.estudiantes.length, "estudiante", "estudiantes")}</small></button>`;
      });
    }
    return h || `<span class="paes-sug-vacio">Nadie calza con «${esc(texto.trim())}». Si no está en ninguna lista, usa «No está en la lista: agregar su nombre y RUT».</span>`;
  }

  function htmlAgregarManual(x) {
    if (est.agregarEn !== x.id) {
      return `<div class="paes-candidatos"><button type="button" class="secundario chico paes-celeste" data-accion="agregar-manual" data-id="${esc(x.id)}">➕ No está en la lista: agregar su nombre y RUT</button></div>`;
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
    if (!s && r.rut && c.disperso) {
      // el RUT es de un estudiante de otro curso del colegio: es la misma persona
      const o = poolDisperso(c).find((x) => x.rut === r.rut);
      if (o) s = c.estudiantes.find((x) => x.id === idLocal(c, o.id)) || null;
    }
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
    if (d.cambio === "ed-colegio") {
      fijarColegioEditor(t.value);
      pintar();
      return true;
    }
    if (d.cambio === "ed-lista-destino" || d.cambio === "ed-lista-oficial" || d.cambio === "ed-lista-modo") {
      const lista = editor().listas.find((x) => x.uid === d.uid);
      if (lista) {
        if (d.cambio === "ed-lista-destino") lista.destino = t.value;
        if (d.cambio === "ed-lista-oficial") lista.oficial = t.checked;
        if (d.cambio === "ed-lista-modo") lista.modo = t.value;
      }
      pintar();
      return true;
    }
    if (d.cambio === "ed-clv") {
      editor().clavijeroId = t.value;
      refrescarEditor();
      return true;
    }
    if (d.cambio === "ed-fecha") {
      editor().fecha = t.value;
      return true;
    }
    if (d.cambio === "inf-curso" || d.cambio === "inf-colegio") {
      const sel = est.cfgInformes;
      if (!sel) return true;
      const cajas = d.cambio === "inf-curso" ? [t] : Array.from(raiz.querySelectorAll(`[data-cambio="inf-curso"][data-col="${d.col}"]:not(:disabled)`));
      cajas.forEach((x) => (t.checked ? sel.add(x.dataset.curso) : sel.delete(x.dataset.curso)));
      refrescarModalInformes();
      return true;
    }
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
      return true; // las opciones aparecen mientras se escribe (alEscribir) y se eligen con un clic o con Enter
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
      Object.assign(est, { importar: null, clvForm: false, formCurso: null, formEnsayo: false, otroClv: null, formDisperso: false, cfgInformes: null, cfgBorrar: false, verCurso: null, editarEn: null });
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
    if (!/^accion-/.test(b.dataset.accion)) abrirAccion(tituloDeBoton(b));
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
      case "abrir-disperso":
        est.formDisperso = !est.formDisperso;
        pintar();
        break;
      case "elegir-disperso":
        if (!raiz.querySelector("#paes-disp-colegio").value.trim()) {
          toast("Primero escribe el colegio del grupo disperso.");
          raiz.querySelector("#paes-disp-colegio").focus();
          break;
        }
        elegirArchivo("disperso");
        break;
      case "res-agregar-pdf":
        est.otroClv = b.dataset.curso || null;
        est.pdfPendientes = null;
        if (est.otroClv) Object.assign(est, { cursoId: est.otroClv, enBlanco: false, fusionarEn: null });
        pintar();
        if (est.otroClv) {
          const caja = raiz.querySelector("#paes-otro-clv");
          if (caja) caja.scrollIntoView({ block: "center" });
          elegirArchivo("res-pdf"); // se abre de inmediato el selector de archivos
        }
        break;
      case "res-elegir-pdf":
        elegirArchivo("res-pdf");
        break;
      case "res-corregir-pdf":
        corregirPdfPendientes(b.dataset.curso);
        break;
      case "papelera-restaurar-curso":
        restaurarCurso(id);
        break;
      case "papelera-purgar-curso":
        purgarCurso(id);
        break;
      case "papelera-restaurar-est":
        restaurarEstudiante(b.dataset.curso, id);
        break;
      case "papelera-purgar-est":
        purgarEstudiante(b.dataset.curso, id);
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
      case "lista-oficial": {
        const c = cursoActual();
        if (!c) break;
        c.listaOficial = c.listaOficial !== true;
        guardar("cursos", c).then(pintar);
        toast(c.listaOficial ? "La lista quedó marcada como oficial" : "La lista quedó marcada como provisoria");
        break;
      }
      case "res-modo":
        est.resMezcla = b.dataset.modo === "mezcla";
        pintar();
        break;
      case "fusionar":
        est.fusionarEn = b.dataset.curso || null;
        if (est.fusionarEn) est.otroClv = null;
        pintar();
        break;
      case "fusionar-ok": {
        const destino = b.dataset.b || (raiz.querySelector("#paes-fusionar-sel") || {}).value;
        pedirFusion(b.dataset.a, destino);
        break;
      }
      case "clv-exportar":
        exportarClavijero(id);
        break;
      case "elegir-prueba":
        Object.assign(est, { ensayoId: id, otraPrueba: false, moverArchivo: null, resumenLectura: null });
        pintar();
        break;
      case "otra-prueba":
        est.otraPrueba = !est.otraPrueba;
        pintar();
        break;
      case "otra-prueba-ok":
        elegirOtraPrueba();
        break;
      case "mover-archivo":
        est.moverArchivo = est.moverArchivo === b.dataset.clave ? null : b.dataset.clave;
        pintar();
        break;
      case "mover-archivo-ok": {
        const destino = b.dataset.destino || (raiz.querySelector(`[data-mover-a="${CSS.escape(b.dataset.clave)}"]`) || {}).value;
        moverArchivo(b.dataset.clave, destino);
        break;
      }
      case "quitar-archivo":
        quitarArchivo(b.dataset.clave);
        break;
      // ---- revisión
      case "asignar":
        asignarHoja(id, b.dataset.est, b.dataset.modo);
        break;
      case "sugerencia":
        if (b.dataset.curso) moverHoja(id, b.dataset.curso, { estudianteId: b.dataset.est || null });
        else asignarHoja(id, b.dataset.est, "manual");
        break;
      case "transferir":
        est.transferirEn = est.transferirEn === id ? null : id;
        pintar();
        break;
      case "transferir-ok": {
        const elegido = raiz.querySelector(`[data-transferir-a="${id}"]`);
        if (elegido && elegido.value) moverHoja(id, elegido.value, { conEstudiante: true });
        break;
      }
      case "e-a-d":
        traspasarEaD();
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
      case "accion-deshacer":
        deshacerAccion();
        break;
      case "accion-rehacer":
        rehacerAccion();
        break;
      case "accion-deshacer-hasta":
        deshacerHasta(id);
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
      case "res-ver-curso":
        ev.preventDefault();
        est.verCurso = est.verCurso === b.dataset.curso ? null : b.dataset.curso;
        est.editarEn = null;
        pintar();
        break;
      case "res-editar": {
        ev.preventDefault();
        const con = ensayosDelCurso(b.dataset.curso).filter((e) => hojasDelEnsayo(e.id).some(vigente));
        if (!con.length) {
          toast("Este curso aún no tiene hojas leídas para editar.");
          break;
        }
        if (con.length === 1) {
          Object.assign(est, { enBlanco: false, cursoId: b.dataset.curso, ensayoId: con[0].id, vista: "curso", paso: "revision", editarEn: null });
          pintar();
          global.scrollTo({ top: 0 });
          break;
        }
        est.editarEn = est.editarEn === b.dataset.curso ? null : b.dataset.curso;
        est.verCurso = null;
        pintar();
        break;
      }
      // ---- editor de PDF
      case "ed-elegir": {
        const entrada = raiz.querySelector('[data-archivo="editor-pdf"]');
        if (entrada) entrada.click();
        break;
      }
      case "ed-ver":
        abrirVisorEditor(Number(b.dataset.i));
        break;
      case "ed-activar":
        editor().activo = editor().activo === b.dataset.key ? null : b.dataset.key;
        raiz.querySelectorAll(".paes-ed-chip").forEach((x) => x.classList.toggle("activo", x.dataset.key === editor().activo));
        break;
      case "ed-agregar-curso": {
        const ed = editor();
        if (!ed.colegio) {
          toast("Primero escribe el colegio.");
          break;
        }
        const nivel = raiz.querySelector("#paes-ed-nivel").value;
        const letras = Array.from(raiz.querySelectorAll(".paes-ed-letra-chk:checked")).map((x) => x.value);
        raiz.querySelector("#paes-ed-letra").value.split(/[\s,;]+/).forEach((t) => t && letras.push(t.toUpperCase()));
        if (!letras.length) {
          toast("Marca al menos una letra (o «sin letra») para agregar el curso.");
          break;
        }
        let ultimo = null, creados = 0;
        Array.from(new Set(letras)).forEach((letra) => {
          let cu = ed.cursos.find((x) => x.nivel === nivel && (x.letra || "").toUpperCase() === letra && (!x.cursoId || x.anio === new Date().getFullYear()));
          if (!cu) {
            cu = { key: PaesDB.nuevoId("n"), cursoId: null, nivel, letra, anio: new Date().getFullYear() };
            ed.cursos.push(cu);
            creados++;
          }
          ultimo = ultimo || cu;
        });
        if (ed.activo == null && ultimo) ed.activo = ultimo.key;
        pintar();
        toast(creados ? `${plural(creados, "curso agregado", "cursos agregados")}` : "Esos cursos ya estaban");
        break;
      }
      case "ed-quitar-curso": {
        const ed = editor();
        ed.cursos = ed.cursos.filter((x) => x.key !== b.dataset.key || x.cursoId);
        ed.hojas.forEach((x) => {
          if (x.curso === b.dataset.key) x.curso = null;
        });
        ed.listas.forEach((t) => {
          if (t.destino === b.dataset.key) t.destino = "";
        });
        if (ed.activo === b.dataset.key) ed.activo = null;
        pintar();
        break;
      }
      case "ed-listas":
      case "ed-lista-curso": {
        editor().listaPara = b.dataset.key || null;
        const entrada = raiz.querySelector('[data-archivo="editor-listas"]');
        if (entrada) entrada.click();
        break;
      }
      case "ed-lista-marca": {
        const cu = editor().cursos.find((x) => x.key === b.dataset.key);
        const c = cu && est.cursos.find((x) => x.id === cu.cursoId);
        if (!c) break;
        c.listaOficial = c.listaOficial !== true;
        guardar("cursos", c);
        pintar();
        toast(c.listaOficial ? "La lista quedó marcada como oficial" : "La lista quedó marcada como provisoria");
        break;
      }
      case "ed-lista-quitar":
        editor().listas = editor().listas.filter((t) => t.uid !== b.dataset.uid);
        pintar();
        break;
      case "ed-listas-guardar":
        guardarListasEditor();
        break;
      case "ed-limpiar":
        soltarVistasEd();
        est.editor = editorVacio({ colegio: editor().colegio, cursos: editor().cursos, clavijeroId: editor().clavijeroId, listas: editor().listas });
        pintar();
        break;
      case "ed-finalizar":
        finalizarEditor();
        break;
      // ---- configuración
      case "cfg-informes":
        est.cfgInformes = new Set(est.cursos.filter((c) => ensayosConHojas([c]).length).map((c) => c.id));
        pintar();
        refrescarModalInformes();
        break;
      case "inf-todos":
      case "inf-ninguno":
        if (!est.cfgInformes) break;
        est.cfgInformes = new Set(b.dataset.accion === "inf-todos" ? est.cursos.filter((c) => ensayosConHojas([c]).length).map((c) => c.id) : []);
        refrescarModalInformes();
        break;
      case "inf-cerrar":
        est.cfgInformes = null;
        pintar();
        break;
      case "inf-descargar": {
        const sel = est.cfgInformes;
        if (!sel || !sel.size) break;
        descargarZipInformes(est.cursos.filter((c) => sel.has(c.id)), () => (est.cfgInformes = null));
        break;
      }
      case "cfg-borrar":
        est.cfgBorrar = true;
        pintar();
        break;
      case "cfg-borrar-no":
        est.cfgBorrar = false;
        pintar();
        break;
      case "cfg-borrar-si": {
        const palabra = raiz.querySelector("#paes-cfg-palabra");
        const clv = raiz.querySelector("#paes-cfg-clv");
        if (!palabra || palabra.value.trim().toUpperCase() !== "ELIMINAR") {
          toast("Para confirmar, escribe ELIMINAR en el cuadro.");
          if (palabra) palabra.focus();
          break;
        }
        eliminarTodosLosDatos(!!(clv && clv.checked));
        break;
      }
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
    abrirAccion(tituloDeCambio(t));
    // ---- archivos
    if (t.dataset.archivo) {
      const archivos = Array.from(t.files || []);
      if (!archivos.length) return;
      if (t.dataset.archivo === "lista") leerArchivoLista(archivos[0]);
      if (t.dataset.archivo === "listas") leerListasNuevas(archivos);
      if (t.dataset.archivo === "disperso") crearDisperso(archivos);
      if (t.dataset.archivo === "editor-listas") {
        leerListasEditor(archivos);
        t.value = "";
      }
      if (t.dataset.archivo === "editor-pdf") {
        cargarEditor(archivos);
        t.value = "";
      }
      if (t.dataset.archivo === "res-pdf" && est.otroClv) {
        const validos = archivos.filter((a) => /\.pdf$/i.test(a.name) || /^image\//.test(a.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(a.name));
        if (!validos.length) toast("Esos archivos no son PDF ni imágenes.");
        else {
          est.pdfPendientes = { cursoId: est.otroClv, archivos: validos };
          pintar();
          const caja = raiz.querySelector("#paes-otro-clv");
          if (caja) caja.scrollIntoView({ block: "center" });
        }
      }
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
      if (tarjeta) tarjeta[t.dataset.lista] = t.type === "checkbox" ? t.checked : t.value;
      return;
    }
    if (t.dataset.previaOp && est.previa) {
      if (t.dataset.previaOp === "oficial") est.previa.oficial = t.checked;
      else est.previa.modo = t.value;
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
    if (t.dataset.buscar) {
      const caja = raiz.querySelector(`[data-sug="${t.dataset.buscar}"]`);
      const c = cursoActual();
      if (caja && c) caja.innerHTML = htmlSugerencias(c, t.dataset.buscar, t.value);
      return;
    }
    if (t.dataset.lista && est.listas) {
      const tarjeta = est.listas[Number(t.dataset.i)];
      if (tarjeta) tarjeta[t.dataset.lista] = t.type === "checkbox" ? t.checked : t.value;
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
