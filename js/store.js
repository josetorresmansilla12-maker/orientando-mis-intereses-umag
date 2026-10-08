// Capa de datos: guardado local (persistente) + deshacer/rehacer (por sesión).
// Todo vive en el navegador de este computador. Nada se envía a internet.
//
// Hay un guardado separado por test (8° básico y Kuder), cada uno con su propia clave
// de localStorage, su propia lista de áreas y su propio historial de deshacer — así
// los estudiantes de un test nunca se mezclan con los del otro.

const STORAGE_KEY = "orientando_intereses_v1";
const STORAGE_KEY_KUDER = "orientando_intereses_kuder_v1";
const MAX_HISTORIAL = 50;

function uid() {
  return "e-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

class Store {
  // claveStorage: dónde se guarda en localStorage; idsPuntaje: los ids de las áreas
  // del test (cada estudiante guarda un puntaje por cada uno); normalizarCurso: cómo se
  // escribe el curso al guardarlo (Kuder: "2do" → "2do Medio"; en 8° queda tal cual).
  constructor(claveStorage, idsPuntaje, { normalizarCurso = null } = {}) {
    this.claveStorage = claveStorage;
    this.idsPuntaje = idsPuntaje;
    this._normalizarCurso = normalizarCurso;
    this.estudiantes = [];
    this.contadorInformes = 0;
    this.deshacerPila = [];
    this.rehacerPila = [];
    this._cargar();
  }

  _cargar() {
    try {
      const raw = localStorage.getItem(this.claveStorage);
      const datos = raw ? JSON.parse(raw) : {};
      this.estudiantes = datos.estudiantes || [];
      this.contadorInformes = Number(datos.contadorInformes) || 0;
      // los guardados de antes quedan con el curso escrito igual que los nuevos
      let cambiados = 0;
      this.estudiantes.forEach((e) => {
        const curso = this.normalizarCurso(e.curso);
        if (curso !== (e.curso || "")) {
          e.curso = curso;
          cambiados++;
        }
      });
      if (cambiados) this._guardar();
    } catch (e) {
      console.error("No se pudo leer el guardado local, se parte vacío.", e);
      this.estudiantes = [];
      this.contadorInformes = 0;
    }
  }

  normalizarCurso(curso) {
    const c = (curso || "").toString().trim();
    return this._normalizarCurso ? this._normalizarCurso(c) : c;
  }

  _guardar() {
    if (this._enLote) return; // dentro de un lote se guarda una sola vez, al terminar
    localStorage.setItem(
      this.claveStorage,
      JSON.stringify({
        estudiantes: this.estudiantes,
        contadorInformes: this.contadorInformes,
        guardadoEn: new Date().toISOString(),
      })
    );
  }

  // se llama cada vez que se genera (descarga) un PDF de informe individual
  registrarInformeGenerado() {
    this.contadorInformes++;
    this._guardar();
  }

  // snapshot profundo del estado actual, para poder volver atrás
  _snapshot() {
    return JSON.parse(JSON.stringify(this.estudiantes));
  }

  _antesDeCambiar() {
    if (this._enLote) return; // el lote ya tomó su foto para "Deshacer"
    this.deshacerPila.push(this._snapshot());
    if (this.deshacerPila.length > MAX_HISTORIAL) this.deshacerPila.shift();
    this.rehacerPila = []; // cualquier cambio nuevo invalida el rehacer pendiente
  }

  // agrupa varios cambios (importación masiva, fusionar carpetas, formato de cursos...)
  // en un solo paso de "Deshacer" y un solo guardado: dentro de "fn" se usan los
  // métodos de siempre (crearVarios, actualizar, renombrarColegios...).
  lote(fn) {
    if (this._enLote) return fn();
    this._antesDeCambiar();
    this._enLote = true;
    try {
      return fn();
    } finally {
      this._enLote = false;
      this._guardar();
    }
  }

  // vuelve a escribir el curso de todos los estudiantes con el formato elegido (ver
  // js/cursos.js: "Formato uniforme de los cursos"); "separarLetra" además saca la letra
  // que quedó pegada al curso ("8vo A" sin letra → "8vo" + "A") y deja las letras en
  // mayúscula. Devuelve cuántos estudiantes cambiaron.
  reescribirCursos({ separarLetra = true } = {}) {
    let n = 0;
    const ahora = new Date().toISOString();
    this.lote(() => {
      this.estudiantes.forEach((e) => {
        let curso = (e.curso || "").toString().trim();
        let letra = (e.letra || "").toString().trim().toUpperCase();
        if (separarLetra && !letra) ({ curso, letra } = separarCursoLetra(curso));
        curso = this.normalizarCurso(curso);
        if (curso !== (e.curso || "") || letra !== (e.letra || "")) {
          e.curso = curso;
          e.letra = letra;
          e.actualizadoEn = ahora;
          n++;
        }
      });
    });
    return n;
  }

  puedeDeshacer() {
    return this.deshacerPila.length > 0;
  }
  puedeRehacer() {
    return this.rehacerPila.length > 0;
  }

  deshacer() {
    if (!this.puedeDeshacer()) return false;
    this.rehacerPila.push(this._snapshot());
    this.estudiantes = this.deshacerPila.pop();
    this._guardar();
    return true;
  }

  rehacer() {
    if (!this.puedeRehacer()) return false;
    this.deshacerPila.push(this._snapshot());
    this.estudiantes = this.rehacerPila.pop();
    this._guardar();
    return true;
  }

  listar({ incluirPapelera = false } = {}) {
    return this.estudiantes.filter((e) => (incluirPapelera ? true : !e.eliminado));
  }

  obtener(id) {
    return this.estudiantes.find((e) => e.id === id) || null;
  }

  _armarEstudiante(datos, ahora) {
    const puntajes = {};
    this.idsPuntaje.forEach((id) => (puntajes[id] = num(datos.puntajes?.[id])));
    return {
      id: uid(),
      colegio: datos.colegio || "",
      curso: this.normalizarCurso(datos.curso),
      letra: datos.letra || "",
      nombre: datos.nombre || "",
      rut: datos.rut || "",
      fecha: datos.fecha || "",
      // Kuder: columnas de la planilla que no usan los informes, pero que se devuelven
      // al descargar los CSV (solo se guardan si vienen)
      ...(datos.contacto ? { contacto: datos.contacto } : {}),
      ...(datos.nacimiento ? { nacimiento: datos.nacimiento } : {}),
      puntajes,
      eliminado: false,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
  }

  crear(datos) {
    this._antesDeCambiar();
    const nuevo = this._armarEstudiante(datos, new Date().toISOString());
    this.estudiantes.push(nuevo);
    this._guardar();
    return nuevo;
  }

  // agrega varios estudiantes de una vez (importación de planillas): un solo paso de
  // deshacer para toda la importación, en vez de uno por estudiante.
  crearVarios(lista) {
    if (!lista || lista.length === 0) return [];
    this._antesDeCambiar();
    const ahora = new Date().toISOString();
    const nuevos = lista.map((datos) => this._armarEstudiante(datos, ahora));
    this.estudiantes.push(...nuevos);
    this._guardar();
    return nuevos;
  }

  actualizar(id, datos) {
    this._antesDeCambiar();
    const e = this.estudiantes.find((x) => x.id === id);
    if (!e) return null;
    e.colegio = datos.colegio ?? e.colegio;
    e.curso = this.normalizarCurso(datos.curso ?? e.curso);
    e.letra = datos.letra ?? e.letra;
    e.nombre = datos.nombre ?? e.nombre;
    e.rut = datos.rut ?? e.rut;
    e.fecha = datos.fecha ?? e.fecha;
    // Kuder: columnas que solo se devuelven en los CSV (no se borran si no vienen)
    if (datos.contacto) e.contacto = datos.contacto;
    if (datos.nacimiento) e.nacimiento = datos.nacimiento;
    if (datos.puntajes) {
      for (const k of Object.keys(e.puntajes)) {
        if (datos.puntajes[k] !== undefined) e.puntajes[k] = num(datos.puntajes[k]);
      }
    }
    if (datos.traspasoAceptado !== undefined) this._fijarTraspasoAceptado(e, datos.traspasoAceptado);
    if (datos.correccion !== undefined) this._fijarCorreccion(e, datos.correccion);
    e.actualizadoEn = new Date().toISOString();
    this._guardar();
    return e;
  }

  // cambia el nombre de uno o más colegios en todos sus estudiantes (también los de la
  // papelera): [[nombreAnterior, nombreNuevo], ...]. Si el nombre nuevo es el de otro
  // colegio ya cargado, quedan juntos. Un solo paso de deshacer. Devuelve cuántos cambió.
  renombrarColegios(cambios) {
    const mapa = new Map(cambios.filter(([anterior, nuevo]) => nuevo && anterior !== nuevo));
    if (!mapa.size) return 0;
    this._antesDeCambiar();
    const ahora = new Date().toISOString();
    let n = 0;
    this.estudiantes.forEach((e) => {
      if (!mapa.has(e.colegio)) return;
      e.colegio = mapa.get(e.colegio);
      e.actualizadoEn = ahora;
      n++;
    });
    this._guardar();
    return n;
  }

  // "✓ Dejar así" (Kuder): guarda en cada estudiante la huella de los puntajes que se
  // aceptaron tal cual ("huella" es una función de los puntajes), o la borra con null
  // ("Volver a pendiente"). También anota cuándo, para "Recién corregidos". Un solo
  // paso de deshacer para todos.
  marcarTraspasoAceptado(ids, huella) {
    this._antesDeCambiar();
    const idsSet = new Set(ids);
    const ahora = new Date().toISOString();
    this.estudiantes.forEach((e) => {
      if (!idsSet.has(e.id)) return;
      this._fijarTraspasoAceptado(e, huella ? huella(e.puntajes) : null);
      this._fijarCorreccion(e, huella ? { como: "dejado", en: ahora } : null);
      e.actualizadoEn = ahora;
    });
    this._guardar();
  }

  _fijarTraspasoAceptado(e, valor) {
    if (valor) e.traspasoAceptado = valor;
    else delete e.traspasoAceptado;
  }

  // última corrección de un test mal traspasado: { como: "dejado" | "corregido", en: fecha ISO }
  _fijarCorreccion(e, valor) {
    if (valor) e.correccion = valor;
    else delete e.correccion;
  }

  moverAPapelera(id) {
    this._antesDeCambiar();
    const e = this.estudiantes.find((x) => x.id === id);
    if (!e) return false;
    e.eliminado = true;
    e.actualizadoEn = new Date().toISOString();
    this._guardar();
    return true;
  }

  // envía varios estudiantes a la papelera de una vez (un solo paso de deshacer para todo el grupo)
  moverVariosAPapelera(ids) {
    this._antesDeCambiar();
    const idsSet = new Set(ids);
    const ahora = new Date().toISOString();
    this.estudiantes.forEach((e) => {
      if (idsSet.has(e.id)) {
        e.eliminado = true;
        e.actualizadoEn = ahora;
      }
    });
    this._guardar();
  }

  restaurar(id) {
    this._antesDeCambiar();
    const e = this.estudiantes.find((x) => x.id === id);
    if (!e) return false;
    e.eliminado = false;
    e.actualizadoEn = new Date().toISOString();
    this._guardar();
    return true;
  }

  eliminarDefinitivo(id) {
    this._antesDeCambiar();
    const antes = this.estudiantes.length;
    this.estudiantes = this.estudiantes.filter((x) => x.id !== id);
    this._guardar();
    return this.estudiantes.length < antes;
  }

  vaciarPapelera() {
    this._antesDeCambiar();
    this.estudiantes = this.estudiantes.filter((x) => !x.eliminado);
    this._guardar();
  }

  // borra absolutamente todos los estudiantes (activos y en papelera).
  // el contador de informes generados no se toca: es un registro histórico.
  borrarTodo() {
    this._antesDeCambiar();
    this.estudiantes = [];
    this._guardar();
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// "store" = 8° básico (el nombre se mantiene porque js/report.js y js/excel.js lo usan
// así); "storeKuder" = Test de Kuder. js/kuder-data.js y js/cursos.js se cargan antes
// que este archivo.
const store = new Store(STORAGE_KEY, ["ciencias", "humanidades", "artistico", "tecnico", "salud", "administracion"], {
  normalizarCurso: normalizarCursoOctavo, // tal cual, salvo que se elija un formato uniforme (js/cursos.js)
});
const storeKuder = new Store(STORAGE_KEY_KUDER, AREAS_KUDER.map((a) => a.id), { normalizarCurso: normalizarCursoKuder });
