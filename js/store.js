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
  // del test (cada estudiante guarda un puntaje por cada uno).
  constructor(claveStorage, idsPuntaje) {
    this.claveStorage = claveStorage;
    this.idsPuntaje = idsPuntaje;
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
    } catch (e) {
      console.error("No se pudo leer el guardado local, se parte vacío.", e);
      this.estudiantes = [];
      this.contadorInformes = 0;
    }
  }

  _guardar() {
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
    this.deshacerPila.push(this._snapshot());
    if (this.deshacerPila.length > MAX_HISTORIAL) this.deshacerPila.shift();
    this.rehacerPila = []; // cualquier cambio nuevo invalida el rehacer pendiente
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
      curso: datos.curso || "",
      letra: datos.letra || "",
      nombre: datos.nombre || "",
      rut: datos.rut || "",
      fecha: datos.fecha || "",
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
    e.curso = datos.curso ?? e.curso;
    e.letra = datos.letra ?? e.letra;
    e.nombre = datos.nombre ?? e.nombre;
    e.rut = datos.rut ?? e.rut;
    e.fecha = datos.fecha ?? e.fecha;
    if (datos.puntajes) {
      for (const k of Object.keys(e.puntajes)) {
        if (datos.puntajes[k] !== undefined) e.puntajes[k] = num(datos.puntajes[k]);
      }
    }
    if (datos.traspasoAceptado !== undefined) this._fijarTraspasoAceptado(e, datos.traspasoAceptado);
    e.actualizadoEn = new Date().toISOString();
    this._guardar();
    return e;
  }

  // "✓ Dejar así" (Kuder): guarda en cada estudiante la huella de los puntajes que se
  // aceptaron tal cual ("huella" es una función de los puntajes), o la borra con null.
  // Un solo paso de deshacer para todos.
  marcarTraspasoAceptado(ids, huella) {
    this._antesDeCambiar();
    const idsSet = new Set(ids);
    const ahora = new Date().toISOString();
    this.estudiantes.forEach((e) => {
      if (!idsSet.has(e.id)) return;
      this._fijarTraspasoAceptado(e, huella ? huella(e.puntajes) : null);
      e.actualizadoEn = ahora;
    });
    this._guardar();
  }

  _fijarTraspasoAceptado(e, valor) {
    if (valor) e.traspasoAceptado = valor;
    else delete e.traspasoAceptado;
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
// así); "storeKuder" = Test de Kuder. js/kuder-data.js se carga antes que este archivo.
const store = new Store(STORAGE_KEY, ["ciencias", "humanidades", "artistico", "tecnico", "salud", "administracion"]);
const storeKuder = new Store(STORAGE_KEY_KUDER, AREAS_KUDER.map((a) => a.id));
