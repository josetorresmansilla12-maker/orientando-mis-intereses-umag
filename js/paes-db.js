// Ensayos PAES · guardado local del módulo (IndexedDB).
//
// Todo queda en el navegador de este computador: nada se envía a internet. Se usa una base
// propia, separada del guardado de los test vocacionales, porque las imágenes de las hojas
// no caben en el guardado simple (localStorage) que usan ellos.
//
//   cursos     { id, colegio, nivel, letra, anio, estudiantes: [{ id, rut, nombres, apellidos }] }
//   ensayos    { id, cursoId, prueba, forma, fecha, clave, claveVersion, tabla, tablaVersion, archivos }
//   hojas      { id, ensayoId, archivo, pagina, huella, lectura (original), ediciones (aparte), estudianteId, … }
//   imagenes   { hojaId, ensayoId, pagina: Blob, nombre: Blob }   (hoja reducida y recorte del nombre)
//   auditoria  { id, ensayoId, hojaId, cuando, campo, antes, despues }
//   ajustes    { clave, valor }

(function (global) {
  "use strict";

  const NOMBRE_BD = "umag_ensayos_paes";
  const VERSION_BD = 1;
  let conexion = null;

  function abrir() {
    if (conexion) return conexion;
    conexion = new Promise((ok, mal) => {
      if (!global.indexedDB) {
        mal(new Error("Este navegador no permite guardar datos del módulo (IndexedDB no está disponible)."));
        return;
      }
      const req = global.indexedDB.open(NOMBRE_BD, VERSION_BD);
      req.onupgradeneeded = () => {
        const bd = req.result;
        if (!bd.objectStoreNames.contains("cursos")) bd.createObjectStore("cursos", { keyPath: "id" });
        if (!bd.objectStoreNames.contains("ensayos")) bd.createObjectStore("ensayos", { keyPath: "id" }).createIndex("cursoId", "cursoId");
        if (!bd.objectStoreNames.contains("hojas")) bd.createObjectStore("hojas", { keyPath: "id" }).createIndex("ensayoId", "ensayoId");
        if (!bd.objectStoreNames.contains("imagenes")) bd.createObjectStore("imagenes", { keyPath: "hojaId" }).createIndex("ensayoId", "ensayoId");
        if (!bd.objectStoreNames.contains("auditoria")) bd.createObjectStore("auditoria", { keyPath: "id", autoIncrement: true }).createIndex("ensayoId", "ensayoId");
        if (!bd.objectStoreNames.contains("ajustes")) bd.createObjectStore("ajustes", { keyPath: "clave" });
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => mal(req.error || new Error("No se pudo abrir el guardado del módulo."));
      req.onblocked = () => mal(new Error("El guardado del módulo está abierto en otra pestaña. Ciérrala y vuelve a intentar."));
    });
    conexion.catch(() => (conexion = null));
    return conexion;
  }

  // ejecuta una operación sobre uno o más almacenes y espera a que la transacción termine
  async function transaccion(almacenes, modo, accion) {
    const bd = await abrir();
    return new Promise((ok, mal) => {
      const tx = bd.transaction(almacenes, modo);
      let resultado;
      tx.oncomplete = () => ok(resultado);
      tx.onerror = () => mal(tx.error);
      tx.onabort = () => mal(tx.error || new Error("No se pudo guardar: puede que el disco esté lleno."));
      resultado = accion(tx);
    });
  }

  const pedir = (req) =>
    new Promise((ok, mal) => {
      req.onsuccess = () => ok(req.result);
      req.onerror = () => mal(req.error);
    });

  async function todos(almacen) {
    const bd = await abrir();
    return pedir(bd.transaction(almacen, "readonly").objectStore(almacen).getAll());
  }

  async function obtener(almacen, clave) {
    const bd = await abrir();
    return pedir(bd.transaction(almacen, "readonly").objectStore(almacen).get(clave));
  }

  async function porIndice(almacen, indice, valor) {
    const bd = await abrir();
    return pedir(bd.transaction(almacen, "readonly").objectStore(almacen).index(indice).getAll(valor));
  }

  function poner(almacen, valor) {
    return transaccion([almacen], "readwrite", (tx) => {
      tx.objectStore(almacen).put(valor);
    });
  }

  function ponerVarios(pares) {
    const almacenes = Array.from(new Set(pares.map((p) => p[0])));
    return transaccion(almacenes, "readwrite", (tx) => {
      pares.forEach(([almacen, valor]) => tx.objectStore(almacen).put(valor));
    });
  }

  function borrar(almacen, clave) {
    return transaccion([almacen], "readwrite", (tx) => {
      tx.objectStore(almacen).delete(clave);
    });
  }

  // borra todo lo de un ensayo: sus hojas, imágenes y auditoría (y el ensayo, si se pide)
  function borrarEnsayo(ensayoId, { conEnsayo = true } = {}) {
    return transaccion(["ensayos", "hojas", "imagenes", "auditoria"], "readwrite", (tx) => {
      ["hojas", "imagenes", "auditoria"].forEach((almacen) => {
        const req = tx.objectStore(almacen).index("ensayoId").openCursor(IDBKeyRange.only(ensayoId));
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
      });
      if (conEnsayo) tx.objectStore("ensayos").delete(ensayoId);
    });
  }

  function borrarHojas(ids) {
    return transaccion(["hojas", "imagenes"], "readwrite", (tx) => {
      ids.forEach((id) => {
        tx.objectStore("hojas").delete(id);
        tx.objectStore("imagenes").delete(id);
      });
    });
  }

  function registrarAuditoria(entrada) {
    return transaccion(["auditoria"], "readwrite", (tx) => {
      tx.objectStore("auditoria").add(Object.assign({ cuando: new Date().toISOString() }, entrada));
    });
  }

  function nuevoId(prefijo) {
    return prefijo + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  global.PaesDB = { abrir, todos, obtener, porIndice, poner, ponerVarios, borrar, borrarEnsayo, borrarHojas, registrarAuditoria, nuevoId };
})(window);
