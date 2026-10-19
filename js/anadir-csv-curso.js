// "📥 Añadir CSV a este curso" (dentro de cada curso, en "Estudiantes e informes"):
// carga el CSV o Excel de un curso directo en ESA carpeta (mismo colegio, curso y letra),
// sin pasar por "Ingresar datos" y sin duplicar a nadie:
// - cada estudiante del archivo se busca en la app por RUT o, si no hay, por nombre
//   (emparejarConApp, js/importacion-masiva.js);
// - los que no están se agregan a esta carpeta;
// - los que ya están y no cambian, se dejan como están;
// - los que ya están con datos distintos (puntajes o nombre): se elige si usar los del
//   archivo o dejar los de la app.
// Al terminar, si hay tests mal traspasados (no suman 45), ofrece ir a "Corrección"; las
// filas que no se pudieron leer se muestran en la misma ventana.

let destinoCsvCurso = null;

function abrirAnadirCsvACurso(muestra) {
  if (!muestra) return;
  destinoCsvCurso = { colegio: muestra.colegio || "", curso: muestra.curso || "", letra: muestra.letra || "", fecha: muestra.fecha || "" };
  const input = document.getElementById("input-csv-curso");
  input.value = "";
  input.click();
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("input-csv-curso");
  if (!input) return;
  input.addEventListener("change", async () => {
    const archivo = (input.files || [])[0];
    if (archivo && destinoCsvCurso) await procesarCsvParaCurso(archivo, destinoCsvCurso);
    input.value = "";
  });
});

const pluralCsv = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

async function procesarCsvParaCurso(archivo, destino) {
  const c = cfg();
  const carpeta = `${destino.colegio || "Sin colegio"} · ${etiquetaCursoGuardado(destino)}`;
  let lectura;
  try {
    lectura = c.leerPlanilla(await archivo.arrayBuffer());
  } catch (err) {
    console.error(err);
    lectura = { estudiantes: [], errores: [c.errorLectura] };
  }
  const errores = lectura.errores || [];
  if (!lectura.estudiantes.length) {
    const otro = Object.values(TESTS).find((t) => t.id !== c.id);
    let esDelOtro = false;
    try {
      esDelOtro = otro.leerPlanilla(await archivo.arrayBuffer()).estudiantes.length > 0;
    } catch (e) {
      // tampoco es del otro test
    }
    elegirOpcion({
      titulo: "No se pudo cargar el archivo",
      texto: `<b>${escaparHtml(archivo.name)}</b>: ${
        esDelOtro ? `parece una planilla del <b>${escaparHtml(otro.nombre)}</b>. Elige ese test arriba y vuelve a subirla.` : escaparHtml(errores[0] || "no se encontraron estudiantes válidos.")
      }`,
      opciones: [],
      textoCancelar: "Entendido",
    });
    return;
  }

  const emp = emparejarConApp(lectura.estudiantes, c.store.listar(), destino.colegio);
  const conDif = emp.pares.filter((p) => diferenciasPar(p, c).length);
  const iguales = emp.pares.length - conDif.length;
  const enOtraCarpeta = emp.pares.filter((p) => claveCursoGuardado(p.app) !== claveCursoGuardado(destino)).length;
  const malArchivo = lectura.estudiantes.filter(archivoMalTraspasado).length;

  // ¿el archivo dice que es de otro curso? (se carga igual en esta carpeta, pero se avisa)
  let cursoArchivo = lectura.curso || "";
  let letraArchivo = (lectura.letra || "").toUpperCase();
  if (cursoArchivo && !letraArchivo) ({ curso: cursoArchivo, letra: letraArchivo } = separarCursoLetra(cursoArchivo));
  const otroCurso =
    (lectura.colegio && !parecidoColegios(lectura.colegio, destino.colegio)) ||
    (cursoArchivo && normalizarTexto(c.store.normalizarCurso(cursoArchivo)) !== normalizarTexto(destino.curso)) ||
    (letraArchivo && letraArchivo !== (destino.letra || "").toUpperCase());

  const lineas = [
    `${pluralCsv(lectura.estudiantes.length, "estudiante", "estudiantes")} en el archivo:`,
    `<ul class="csv-curso-resumen">`,
    emp.nuevos.length ? `<li>➕ <b>${pluralCsv(emp.nuevos.length, "nuevo", "nuevos")}</b>: se ${emp.nuevos.length === 1 ? "agrega" : "agregan"} a esta carpeta.</li>` : "",
    iguales ? `<li>✓ ${pluralCsv(iguales, "ya estaba", "ya estaban")} igual: no se ${iguales === 1 ? "duplica" : "duplican"}.</li>` : "",
    conDif.length
      ? `<li>✏️ <b>${pluralCsv(conDif.length, "ya estaba", "ya estaban")} con datos distintos</b> (puntajes o nombre): ${conDif
          .slice(0, 6)
          .map((p) => escaparHtml(p.app.nombre))
          .join(", ")}${conDif.length > 6 ? ` y ${conDif.length - 6} más` : ""}.</li>`
      : "",
    enOtraCarpeta ? `<li>📁 ${pluralCsv(enOtraCarpeta, "de los que ya estaban está", "de los que ya estaban están")} en otra carpeta: se ${enOtraCarpeta === 1 ? "queda" : "quedan"} donde ${enOtraCarpeta === 1 ? "está" : "están"}.</li>` : "",
    errores.length ? `<li>⚠ ${pluralCsv(errores.length, "fila no se pudo leer", "filas no se pudieron leer")} (no se cargan): ${escaparHtml(errores.slice(0, 3).join(" · "))}</li>` : "",
    malArchivo && c.revisarTraspaso && (emp.nuevos.length || conDif.length)
      ? `<li>🔎 ${pluralCsv(malArchivo, "test no suma", "tests no suman")} 45 en el archivo: al terminar puedes revisarlos en "Corrección".</li>`
      : "",
    `</ul>`,
    otroCurso
      ? `<div class="csv-curso-aviso">⚠ Ojo: el archivo dice <b>${escaparHtml([lectura.colegio, [cursoArchivo, letraArchivo].filter(Boolean).join(" ")].filter(Boolean).join(" · "))}</b>. Si es el curso equivocado, cancela.</div>`
      : "",
  ].join("");

  if (!emp.nuevos.length && !conDif.length) {
    elegirOpcion({
      titulo: `📥 ${carpeta}`,
      texto: `<b>${escaparHtml(archivo.name)}</b>: ${lineas}<p style="margin-top:8px;">No hay nada nuevo que cargar: todos ya están en la app tal como vienen en el archivo.</p>`,
      opciones: [],
      textoCancelar: "Entendido",
    });
    return;
  }

  // con datos distintos se elige qué versión queda; "Cancelar" no carga nada
  const opciones = [];
  if (conDif.length && emp.nuevos.length) {
    opciones.push({ texto: "Agregar solo los nuevos (dejar la app como está)", clase: "secundario", accion: () => aplicarCsvACurso(emp, conDif, destino, false) });
    opciones.push({ texto: "Agregar los nuevos y usar los datos del archivo", accion: () => aplicarCsvACurso(emp, conDif, destino, true) });
  } else if (conDif.length) {
    opciones.push({ texto: "Usar los datos del archivo", accion: () => aplicarCsvACurso(emp, conDif, destino, true) });
  } else {
    opciones.push({ texto: `📥 Agregar ${pluralCsv(emp.nuevos.length, "estudiante", "estudiantes")}`, accion: () => aplicarCsvACurso(emp, conDif, destino, false) });
  }
  elegirOpcion({
    titulo: `📥 Añadir a ${carpeta}`,
    texto: `<b>${escaparHtml(archivo.name)}</b>: ${lineas}`,
    opciones,
    textoCancelar: conDif.length && !emp.nuevos.length ? "Dejar la app como está" : "Cancelar",
  });
}

function aplicarCsvACurso(emp, conDif, destino, usarArchivo) {
  const c = cfg();
  const afectados = [];
  c.store.lote(() => {
    if (usarArchivo) {
      conDif.forEach((p) => {
        c.store.actualizar(p.app.id, {
          nombre: p.archivo.nombre,
          rut: p.archivo.rut || p.app.rut,
          puntajes: p.archivo.puntajes,
          contacto: p.archivo.contacto,
          nacimiento: p.archivo.nacimiento,
        });
        afectados.push(p.app.id);
      });
    }
    if (emp.nuevos.length) {
      const creados = c.store.crearVarios(
        emp.nuevos.map((fe) => ({ nombre: fe.nombre, rut: fe.rut, contacto: fe.contacto, nacimiento: fe.nacimiento, puntajes: fe.puntajes, ...destino }))
      );
      afectados.push(...creados.map((e) => e.id));
    }
  });
  render();
  const partes = [];
  if (emp.nuevos.length) partes.push(pluralCsv(emp.nuevos.length, "estudiante agregado", "estudiantes agregados"));
  if (usarArchivo && conDif.length) partes.push(pluralCsv(conDif.length, "actualizado", "actualizados"));
  mostrarToast(`Listo: ${partes.join(" y ")} (se puede deshacer arriba)`);

  // tests mal traspasados entre los recién cargados o actualizados: a "Corrección"
  const pendientes = afectados.map((id) => c.store.obtener(id)).filter((e) => e && pendienteTraspaso(e));
  if (pendientes.length) {
    elegirOpcion({
      titulo: "🔎 Hay tests para revisar",
      texto: `${pluralCsv(pendientes.length, "estudiante recién cargado tiene", "estudiantes recién cargados tienen")} el test mal traspasado (no ${pendientes.length === 1 ? "suma" : "suman"} 45): ${pendientes
        .slice(0, 8)
        .map((e) => escaparHtml(e.nombre))
        .join(", ")}${pendientes.length > 8 ? ` y ${pendientes.length - 8} más` : ""}. Puedes revisarlos ahora en la pestaña "Corrección" o después.`,
      opciones: [{ texto: "🔎 Ir a Corrección", accion: irACorreccion }],
      textoCancelar: "Revisar después",
    });
  }
}
