// "📥 Añadir un curso desde CSV" (dentro de cada colegio, en "Estudiantes e informes"):
// crea en ESE colegio un curso a partir de su CSV o Excel, sin pasar por "Ingresar datos".
// - El colegio es el de la carpeta; el curso y la letra se leen del archivo (si no los
//   trae, quedan vacíos para escribirlos) y se pueden corregir antes de cargar.
// - Nadie se duplica: cada estudiante del archivo se busca en la app por su RUT
//   (emparejarConApp, js/importacion-masiva.js). Solo el RUT dice que es la misma
//   persona: los que ya están se dejan donde están (y, si se marca, se actualizan con
//   los datos del archivo); los demás se agregan al curso. Si alguno tiene el mismo
//   nombre que alguien ya cargado pero falta el RUT para confirmarlo, se avisa (con el
//   curso donde está el otro) y se carga como nuevo.
// - Al terminar, si hay tests mal traspasados (no suman 45), ofrece ir a "Corrección";
//   las filas que no se pudieron leer se avisan en la misma ventana.

const cursoCsv = { colegio: "", archivo: null, lectura: null };

function abrirCursoDesdeCsv(colegio) {
  cursoCsv.colegio = colegio || "";
  const input = document.getElementById("input-csv-curso");
  input.value = "";
  input.click();
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("input-csv-curso");
  if (!input) return;
  input.addEventListener("change", async () => {
    const archivo = (input.files || [])[0];
    input.value = "";
    if (archivo) await leerCursoDesdeCsv(archivo);
  });
  const modal = document.getElementById("modal-curso-csv");
  document.getElementById("mcc-cancelar").addEventListener("click", cerrarCursoDesdeCsv);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) cerrarCursoDesdeCsv();
  });
  modal.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") cerrarCursoDesdeCsv();
  });
  ["mcc-curso", "mcc-letra"].forEach((id) => document.getElementById(id).addEventListener("input", pintarCursoDesdeCsv));
  document.getElementById("mcc-actualizar").addEventListener("change", pintarCursoDesdeCsv);
  document.getElementById("mcc-aceptar").addEventListener("click", cargarCursoDesdeCsv);
});

const pluralCurso = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

async function leerCursoDesdeCsv(archivo) {
  const c = cfg();
  let lectura;
  try {
    lectura = c.leerPlanilla(await archivo.arrayBuffer());
  } catch (err) {
    console.error(err);
    lectura = { estudiantes: [], errores: [c.errorLectura] };
  }
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
        esDelOtro ? `parece una planilla del <b>${escaparHtml(otro.nombre)}</b>. Elige ese test arriba y vuelve a subirla.` : escaparHtml((lectura.errores || [])[0] || "no se encontraron estudiantes válidos.")
      }`,
      opciones: [],
      textoCancelar: "Entendido",
    });
    return;
  }
  cursoCsv.archivo = archivo;
  cursoCsv.lectura = lectura;

  // curso y letra: solo lo que dice el archivo. Si trae varios cursos (cada estudiante
  // con el suyo), se crean todos en este colegio, cada estudiante en su curso y letra
  cursoCsv.varios = (lectura.grupos || []).length > 1;
  document.getElementById("modal-curso-csv").classList.toggle("mcc-varios", cursoCsv.varios);
  let curso = lectura.curso || "";
  let letra = (lectura.letra || "").toUpperCase();
  if (curso && !letra) ({ curso, letra } = separarCursoLetra(curso));
  document.getElementById("mcc-titulo").textContent = cursoCsv.varios
    ? `📥 Añadir ${lectura.grupos.length} cursos a ${cursoCsv.colegio || "Sin colegio"}`
    : `📥 Añadir un curso a ${cursoCsv.colegio || "Sin colegio"}`;
  document.getElementById("mcc-colegio").value = cursoCsv.colegio;
  document.getElementById("mcc-curso").value = curso ? c.store.normalizarCurso(curso) : "";
  document.getElementById("mcc-curso").placeholder = c.placeholderCurso;
  document.getElementById("mcc-letra").value = letra;
  document.getElementById("mcc-actualizar").checked = false;
  document.getElementById("mcc-curso").classList.remove("invalido");
  pintarCursoDesdeCsv();
  document.getElementById("modal-curso-csv").style.display = "flex";
  const vacio = !cursoCsv.varios && !document.getElementById("mcc-curso").value;
  document.getElementById(vacio ? "mcc-curso" : "mcc-aceptar").focus();
}

// curso y letra donde queda un estudiante del archivo: el de su fila si el archivo trae
// varios cursos; si no, el escrito en la ventana
function destinoCursoCsv(fe, d) {
  const g = cursoCsv.varios ? cursoCsv.lectura.grupos[fe.grupo] : null;
  return g ? { colegio: d.colegio, curso: g.curso, letra: g.letra } : d;
}

function datosCursoCsv() {
  const c = cfg();
  const curso = document.getElementById("mcc-curso").value.replace(/\s+/g, " ").trim();
  return {
    colegio: cursoCsv.colegio,
    curso: curso ? c.store.normalizarCurso(curso) : "",
    letra: document.getElementById("mcc-letra").value.trim().toUpperCase(),
  };
}

// qué va a pasar con cada estudiante del archivo (se recalcula al cambiar curso o letra)
function analisisCursoCsv() {
  const c = cfg();
  const lectura = cursoCsv.lectura;
  const emp = emparejarConApp(lectura.estudiantes, c.store.listar());
  const conDif = emp.pares.filter((p) => diferenciasPar(p, c).length);
  return { emp, conDif, iguales: emp.pares.length - conDif.length };
}

// "Benjamín Cari (RUT 21.234.567-8, en Colegio Luterano · 2do Medio A); ..." (hasta 6)
function listaQuienes(estudiantes) {
  const n = estudiantes.length;
  return `<span class="csv-curso-quienes">${estudiantes
    .slice(0, 6)
    .map((e) => escaparHtml(quienEsEnApp(e)))
    .join("; ")}${n > 6 ? ` y ${n - 6} más` : ""}.</span>`;
}

function pintarCursoDesdeCsv() {
  const c = cfg();
  const lectura = cursoCsv.lectura;
  if (!lectura) return;
  const inpCurso = document.getElementById("mcc-curso");
  if (inpCurso.value.trim()) inpCurso.classList.remove("invalido");
  const d = datosCursoCsv();
  const { emp, conDif, iguales } = analisisCursoCsv();
  const yaEnCurso = d.curso ? c.store.listar().filter((e) => claveCursoGuardado(e) === claveCursoGuardado(d)).length : 0;
  const errores = lectura.errores || [];
  const malArchivo = emp.nuevos.filter(archivoMalTraspasado).length;
  const otroColegio = lectura.colegio && !parecidoColegios(lectura.colegio, cursoCsv.colegio);

  document.getElementById("mcc-archivo").innerHTML = `📄 <b>${escaparHtml(cursoCsv.archivo.name)}</b> · ${pluralCurso(lectura.estudiantes.length, "estudiante", "estudiantes")}`;
  const lineaCursos = cursoCsv.varios
    ? `<li>📚 El archivo trae <b>${lectura.grupos.length} cursos distintos</b>: se crean en este colegio y cada estudiante queda en su curso y letra: ${lectura.grupos
        .map((g) => {
          const ya = c.store.listar().filter((e) => claveCursoGuardado(e) === claveCursoGuardado({ colegio: cursoCsv.colegio, curso: g.curso, letra: g.letra })).length;
          return `<b>${escaparHtml(etiquetaCursoGuardado(g))}</b> (${g.n}${ya ? `; ya tiene ${ya}` : ""})`;
        })
        .join(" · ")}.</li>`
    : null;
  document.getElementById("mcc-detalle").innerHTML = [
    `<ul class="csv-curso-resumen">`,
    lineaCursos ||
      (yaEnCurso
      ? `<li>📘 Este colegio ya tiene <b>${escaparHtml(etiquetaCursoGuardado(d))}</b> (${pluralCurso(yaEnCurso, "estudiante", "estudiantes")}): los nuevos se suman a ese curso.</li>`
      : d.curso
        ? `<li>📘 Se crea el curso <b>${escaparHtml(etiquetaCursoGuardado(d))}</b> en este colegio.</li>`
        : `<li>✏️ El archivo no dice el curso: escríbelo arriba.</li>`),
    emp.nuevos.length ? `<li>➕ <b>${pluralCurso(emp.nuevos.length, "estudiante nuevo", "estudiantes nuevos")}</b>: se ${emp.nuevos.length === 1 ? "agrega" : "agregan"} ${cursoCsv.varios ? "cada uno a su curso" : "al curso"}.</li>` : `<li>✓ No hay estudiantes nuevos: todos ya están en la app.</li>`,
    iguales
      ? `<li>✓ ${pluralCurso(iguales, "ya estaba", "ya estaban")} en la app <b>con el mismo RUT</b> y los mismos datos: no se ${iguales === 1 ? "duplica" : "duplican"} y se ${iguales === 1 ? "queda" : "quedan"} en su curso. ${listaQuienes(emp.pares.filter((p) => !conDif.includes(p)).map((p) => p.app))}</li>`
      : "",
    conDif.length
      ? `<li>✏️ ${pluralCurso(conDif.length, "ya estaba", "ya estaban")} en la app <b>con el mismo RUT</b> pero con otros datos (puntajes o nombre): no se ${conDif.length === 1 ? "duplica" : "duplican"}. ${listaQuienes(conDif.map((p) => p.app))}</li>`
      : "",
    emp.mismoNombre.length
      ? `<li class="csv-curso-ojo">⚠ ${pluralCurso(emp.mismoNombre.length, "tiene", "tienen")} el mismo nombre que alguien ya cargado, pero falta el RUT para confirmar que es la misma persona: se ${emp.mismoNombre.length === 1 ? "carga" : "cargan"} como ${emp.mismoNombre.length === 1 ? "estudiante nuevo" : "estudiantes nuevos"}. Revisa si corresponde: ${listaQuienes(emp.mismoNombre.map((m) => m.app))}</li>`
      : "",
    errores.length ? `<li>⚠ ${pluralCurso(errores.length, "fila no se pudo leer", "filas no se pudieron leer")} (no se cargan): ${escaparHtml(errores.slice(0, 3).join(" · "))}</li>` : "",
    malArchivo && c.revisarTraspaso ? `<li>🔎 ${pluralCurso(malArchivo, "test no suma", "tests no suman")} 45: al terminar puedes revisarlos en "Corrección".</li>` : "",
    `</ul>`,
    otroColegio ? `<div class="csv-curso-aviso">⚠ Ojo: el archivo dice que es de <b>${escaparHtml(lectura.colegio)}</b>. Se va a cargar en <b>${escaparHtml(cursoCsv.colegio)}</b>; si no corresponde, cancela.</div>` : "",
  ].join("");

  const wrap = document.getElementById("mcc-actualizar-wrap");
  wrap.style.display = conDif.length ? "" : "none";
  wrap.querySelector("span").textContent = `Usar los datos del archivo para ${conDif.length === 1 ? "el que ya estaba" : `los ${conDif.length} que ya estaban`} con datos distintos`;
  const btn = document.getElementById("mcc-aceptar");
  const actualizar = document.getElementById("mcc-actualizar").checked && conDif.length;
  btn.disabled = !emp.nuevos.length && !actualizar;
  btn.textContent = emp.nuevos.length
    ? cursoCsv.varios
      ? `📥 Crear los cursos (${pluralCurso(emp.nuevos.length, "estudiante", "estudiantes")})`
      : yaEnCurso
      ? `📥 Agregar ${pluralCurso(emp.nuevos.length, "estudiante", "estudiantes")}`
      : `📥 Crear el curso (${pluralCurso(emp.nuevos.length, "estudiante", "estudiantes")})`
    : actualizar
      ? "📥 Actualizar sus datos"
      : "Nada nuevo que cargar";
}

function cerrarCursoDesdeCsv() {
  document.getElementById("modal-curso-csv").style.display = "none";
  cursoCsv.archivo = null;
  cursoCsv.lectura = null;
}

function cargarCursoDesdeCsv() {
  const c = cfg();
  if (!cursoCsv.lectura) return;
  const d = datosCursoCsv();
  const inpCurso = document.getElementById("mcc-curso");
  const { emp, conDif } = analisisCursoCsv();
  if (emp.nuevos.length && !d.curso && !cursoCsv.varios) {
    inpCurso.classList.add("invalido");
    inpCurso.focus();
    return mostrarToast("Escribe el curso");
  }
  const actualizar = document.getElementById("mcc-actualizar").checked;
  const afectados = [];
  c.store.lote(() => {
    if (actualizar) {
      conDif.forEach((p) => {
        c.store.actualizar(p.app.id, { nombre: p.archivo.nombre, rut: p.archivo.rut || p.app.rut, puntajes: p.archivo.puntajes, contacto: p.archivo.contacto, nacimiento: p.archivo.nacimiento });
        afectados.push(p.app.id);
      });
    }
    if (emp.nuevos.length) {
      const creados = c.store.crearVarios(
        emp.nuevos.map((fe) => ({ nombre: fe.nombre, rut: fe.rut, contacto: fe.contacto, nacimiento: fe.nacimiento, puntajes: fe.puntajes, ...destinoCursoCsv(fe, d), fecha: "" }))
      );
      afectados.push(...creados.map((e) => e.id));
    }
  });
  cerrarCursoDesdeCsv();
  // el colegio y el curso nuevo quedan abiertos en la lista
  estado.gruposAbiertos.add(claveGrupoColegio(d.colegio));
  if (!cursoCsv.varios) estado.gruposAbiertos.add(claveGrupoCurso(d.colegio, etiquetaCurso(d)));
  const varios = cursoCsv.varios;
  const nCursos = varios ? new Set(emp.nuevos.map((fe) => fe.grupo)).size : 1;
  render();
  const partes = [];
  if (emp.nuevos.length) partes.push(`${pluralCurso(emp.nuevos.length, "estudiante", "estudiantes")} en ${varios ? pluralCurso(nCursos, "curso", "cursos") : etiquetaCursoGuardado(d)}`);
  if (actualizar && conDif.length) partes.push(pluralCurso(conDif.length, "actualizado", "actualizados"));
  mostrarToast(`Listo: ${partes.join(" y ")} (se puede deshacer arriba)`);

  const pendientes = afectados.map((id) => c.store.obtener(id)).filter((e) => e && pendienteTraspaso(e));
  if (pendientes.length) {
    elegirOpcion({
      titulo: "🔎 Hay tests para revisar",
      texto: `${pluralCurso(pendientes.length, "estudiante recién cargado tiene", "estudiantes recién cargados tienen")} el test mal traspasado (no ${pendientes.length === 1 ? "suma" : "suman"} 45): ${pendientes
        .slice(0, 8)
        .map((e) => escaparHtml(e.nombre))
        .join(", ")}${pendientes.length > 8 ? ` y ${pendientes.length - 8} más` : ""}. Puedes revisarlos ahora en la pestaña "Corrección" o después.`,
      opciones: [{ texto: "🔎 Ir a Corrección", accion: irACorreccion }],
      textoCancelar: "Revisar después",
    });
  }
}
