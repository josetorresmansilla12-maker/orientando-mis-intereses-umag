// Respaldo en Excel (salida) e importación masiva desde la planilla de corrección (entrada).

function exportarExcel() {
  const todos = store.listar({ incluirPapelera: true });

  const filas = todos.map((e) => {
    const areas = calcularAreasDeInteres(e.puntajes);
    const fila = {
      Colegio: e.colegio,
      Curso: e.curso,
      Letra: e.letra,
      Nombre: e.nombre,
      RUT: e.rut,
      "Fecha de aplicación": e.fecha,
    };
    AREAS.forEach((a) => (fila[a.nombre] = e.puntajes[a.id]));
    fila["Área(s) de interés"] = areas.length ? areas.map((a) => a.nombre).join(", ") : "Ninguna destacada";
    fila["Estado"] = e.eliminado ? "En papelera" : "Activo";
    fila["Última actualización"] = e.actualizadoEn ? new Date(e.actualizadoEn).toLocaleString("es-CL") : "";
    return fila;
  });

  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Estudiantes");

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `Respaldo_Orientando_mis_Intereses_${fecha}.xlsx`);
}

// ---------------- importación masiva desde la planilla de corrección (.xlsx) ----------------
// La planilla trae, por fila: Nombre, RUT, y las 6 columnas de puntaje por área (ya sumadas
// con fórmulas). Colegio/curso/letra/fecha NO van en la planilla: se toman de los campos
// "Datos del curso" de la app y se aplican a todas las filas importadas.

// qué ítems del cuestionario (1 a 24) suman para cada área — debe coincidir con
// "Áreas de interés y sus ítems correspondientes" de la pauta del cuestionario.
const MAPEO_ITEMS_POR_AREA = {
  ciencias: [1, 7, 13, 19],
  humanidades: [2, 8, 14, 20],
  artistico: [3, 9, 15, 21],
  tecnico: [4, 10, 16, 22],
  salud: [5, 11, 17, 23],
  administracion: [6, 12, 18, 24],
};

function normalizarEncabezado(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// busca, dentro de las primeras filas de la hoja, la fila que contiene los encabezados
// (reconocible porque su primera columna dice "nombre") y arma un mapa columna -> campo.
// Se apoya sobre todo en las 24 columnas de ítems (1..24) para calcular los puntajes
// directamente en la app — así no depende de que Excel haya recalculado las fórmulas de
// las columnas de área antes de guardar. Si esas 24 columnas no están, usa las columnas
// de área (Ciencias, Humanidades, etc.) como respaldo.
function ubicarEncabezados(filas) {
  const CAMPOS_AREA = AREAS.map((a) => ({
    id: a.id,
    claves: [normalizarEncabezado(a.id), normalizarEncabezado(a.nombre)],
  }));

  for (let f = 0; f < Math.min(filas.length, 15); f++) {
    const fila = filas[f];
    if (!fila) continue;
    const idxNombre = fila.findIndex((c) => normalizarEncabezado(c) === "nombre");
    if (idxNombre === -1) continue;

    const idxRut = fila.findIndex((c) => normalizarEncabezado(c) === "rut");

    const idxPorItem = {};
    for (let n = 1; n <= 24; n++) {
      const idx = fila.findIndex((c) => normalizarEncabezado(c) === String(n));
      if (idx !== -1) idxPorItem[n] = idx;
    }
    const tieneTodosLosItems = Object.keys(idxPorItem).length === 24;

    const idxPorArea = {};
    CAMPOS_AREA.forEach(({ id, claves }) => {
      const idx = fila.findIndex((c) => claves.includes(normalizarEncabezado(c)));
      if (idx !== -1) idxPorArea[id] = idx;
    });
    const tieneTodasLasAreas = CAMPOS_AREA.every((a) => idxPorArea[a.id] !== undefined);

    if (!tieneTodosLosItems && !tieneTodasLasAreas) continue; // esta fila no sirve; seguir buscando

    return { filaEncabezado: f, idxNombre, idxRut, idxPorItem: tieneTodosLosItems ? idxPorItem : null, idxPorArea };
  }
  return null;
}

// procesa un ArrayBuffer (contenido del archivo subido) y devuelve las filas de estudiantes
// encontradas, listas para pasarle a store.crear(), más un listado de filas con problemas.
function leerPlanillaCorreccion(arrayBuffer) {
  const libro = XLSX.read(arrayBuffer, { type: "array" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", blankrows: false });

  const ubicacion = ubicarEncabezados(filas);
  if (!ubicacion) {
    return {
      estudiantes: [],
      errores: [
        'No se encontró una fila de encabezados con "Nombre" y las 6 columnas de área (Ciencias, Humanidades y Ciencias Sociales, Artístico-Expresivo, Técnico-Manual, Salud y Cuidado, Administración y Negocios). ¿Es la planilla de corrección correcta?',
      ],
    };
  }

  const { filaEncabezado, idxNombre, idxRut, idxPorItem, idxPorArea } = ubicacion;
  const estudiantes = [];
  const errores = [];

  for (let f = filaEncabezado + 1; f < filas.length; f++) {
    const fila = filas[f];
    if (!fila) continue;
    const nombre = (fila[idxNombre] || "").toString().trim();
    if (!nombre) continue; // fila vacía: fin de los datos (o separador)
    if (normalizarEncabezado(nombre).startsWith("ejemplo")) continue; // fila de ejemplo de la plantilla

    const numeroFilaExcel = f + 1; // para mostrarle al usuario el mismo número que ve en Excel
    const puntajes = {};
    let filaOk = true;

    if (idxPorItem) {
      // calculamos los 6 puntajes nosotros mismos a partir de las 24 respuestas, en vez de
      // confiar en el valor guardado de las fórmulas de Excel. En la planilla se ingresan
      // como 1/2/3 (más rápido de tipear que 0/1/2 al no tener que estirarse hasta el "0"),
      // así que se le resta 1 a cada una para volver a la escala real del instrumento
      // (0 = No me gusta, 1 = No sé, 2 = Me gusta).
      AREAS.forEach((a) => {
        const items = MAPEO_ITEMS_POR_AREA[a.id];
        let suma = 0;
        for (const n of items) {
          const crudo = fila[idxPorItem[n]];
          const valor = Number(crudo);
          if (crudo === "" || !Number.isFinite(valor) || valor < 1 || valor > 3) {
            filaOk = false;
          } else {
            suma += valor - 1;
          }
        }
        puntajes[a.id] = suma;
      });
    } else {
      AREAS.forEach((a) => {
        const crudo = fila[idxPorArea[a.id]];
        const n = Number(crudo);
        if (crudo === "" || !Number.isFinite(n) || n < PUNTAJE_MIN || n > PUNTAJE_MAX) {
          filaOk = false;
        } else {
          puntajes[a.id] = n;
        }
      });
    }

    if (!filaOk) {
      errores.push(
        idxPorItem
          ? `Fila ${numeroFilaExcel} (${nombre}): alguna respuesta (columnas 1 a 24) falta o no es 1, 2 o 3.`
          : `Fila ${numeroFilaExcel} (${nombre}): algún puntaje de área falta o no está entre 0 y 8.`
      );
      continue;
    }

    estudiantes.push({
      nombre,
      rut: idxRut !== -1 ? (fila[idxRut] || "").toString().trim() : "",
      puntajes,
    });
  }

  return { estudiantes, errores };
}

async function importarPlanillaCorreccion(archivo, cursoHeader) {
  const arrayBuffer = await archivo.arrayBuffer();
  const { estudiantes, errores } = leerPlanillaCorreccion(arrayBuffer);

  estudiantes.forEach((e) => {
    store.crear({
      nombre: e.nombre,
      rut: e.rut,
      colegio: cursoHeader.colegio,
      curso: cursoHeader.curso,
      letra: cursoHeader.letra,
      fecha: cursoHeader.fecha,
      puntajes: e.puntajes,
    });
  });

  return { importados: estudiantes.length, errores };
}
