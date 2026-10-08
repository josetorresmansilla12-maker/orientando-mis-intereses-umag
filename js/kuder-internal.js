// UI del "Informe Interno" de Kuder (Admisión y Marketing) — módulo aparte del informe
// para orientadores (js/kuder.js, js/kuder-report.js): no los modifica, pero SÍ reutiliza
// a propósito leerPlanillaKuder() y escaparHtmlKuder() de js/kuder.js (ya cargado antes
// en index.html) porque el formato de archivo de entrada es el mismo — un CSV/Excel de
// puntajes de Kuder por curso — y no tiene sentido duplicar ese lector.

// cursos de la lista: archivos subidos y cursos elegidos de la app (js/selector-cursos.js)
let kuderInternoEstadoActual = []; // [{ uid, origen, archivoNombre, estudiantes, errores, advertencias, colegio, curso }, ...]
// sin límite de archivos: es el informe final del año (pueden ser muchos cursos, de
// varios computadores); son archivos chicos, así que solo demora un poco más en leerlos

document.addEventListener("DOMContentLoaded", () => {
  cablearKuderInterno();
});

// solo planillas: al subir una carpeta completa vienen también otros archivos (PDF,
// imágenes, archivos ocultos del sistema o temporales de Excel "~$..."), que se ignoran
function esPlanillaKuder(archivo) {
  const nombre = archivo.name || "";
  return /\.(csv|xlsx|xls)$/i.test(nombre) && !nombre.startsWith(".") && !nombre.startsWith("~$");
}

function agregarFuentesInterno(nuevas) {
  if (!nuevas.length) return;
  kuderInternoEstadoActual.push(...nuevas);
  renderKuderInternoListaArchivos();
  const panel = document.getElementById("kuder-interno-revision");
  panel.style.display = "block";
  panel.scrollIntoView({ block: "nearest" });
}

function quitarFuenteInterno(uid) {
  kuderInternoEstadoActual = kuderInternoEstadoActual.filter((f) => f.uid !== uid);
  if (!kuderInternoEstadoActual.length) document.getElementById("kuder-interno-revision").style.display = "none";
  else renderKuderInternoListaArchivos();
}

// al volver a la pestaña, los cursos elegidos de la app se vuelven a leer
function refrescarPanelInterno() {
  if (!kuderInternoEstadoActual.some((f) => f.origen === "app")) return;
  refrescarFuentesApp(kuderInternoEstadoActual, storeKuder);
  renderKuderInternoListaArchivos();
}

function cablearKuderInterno() {
  const input = document.getElementById("kuder-interno-input-planilla");
  if (!input) return; // esta página no incluye el informe interno de Kuder
  const inputCarpeta = document.getElementById("kuder-interno-input-carpeta");

  const btn = document.getElementById("kuder-interno-btn-elegir-planilla");
  const btnCarpeta = document.getElementById("kuder-interno-btn-elegir-carpeta");
  const btnCursosApp = document.getElementById("kuder-interno-btn-elegir-cursos");
  const panelRevision = document.getElementById("kuder-interno-revision");
  const btnGenerar = document.getElementById("kuder-interno-btn-generar");
  const btnCancelar = document.getElementById("kuder-interno-btn-cancelar-revision");

  btn.addEventListener("click", () => input.click());
  btnCarpeta.addEventListener("click", () => inputCarpeta.click());

  // los dos caminos (archivos sueltos o una carpeta completa, con sus subcarpetas)
  // terminan en la misma lista; lo nuevo se suma a lo que ya estaba
  async function procesar(listaArchivos, { desdeCarpeta }) {
    const todos = Array.from(listaArchivos || []);
    if (todos.length === 0) return;
    const archivos = todos
      .filter(esPlanillaKuder)
      .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, "es", { numeric: true }));
    const ignorados = todos.length - archivos.length;
    if (archivos.length === 0) {
      alert(desdeCarpeta ? "En esa carpeta no hay archivos CSV ni Excel." : "Elige archivos CSV o Excel.");
      return;
    }
    if (desdeCarpeta && ignorados) mostrarToast(`Se ignoraron ${ignorados} archivos que no son planillas`);

    const botones = [btn, btnCarpeta];
    const textos = botones.map((b) => b.textContent);
    botones.forEach((b) => (b.disabled = true));
    btn.textContent = "Leyendo…";

    try {
      const firmas = new Set(kuderInternoEstadoActual.map((f) => f.firma).filter(Boolean));
      const nuevas = [];
      let repetidos = 0;
      for (const [i, archivo] of archivos.entries()) {
        if (archivos.length > 20) btn.textContent = `Leyendo ${i + 1}/${archivos.length}…`;
        const firma = `${archivo.webkitRelativePath || archivo.name}|${archivo.size}|${archivo.lastModified}`;
        if (firmas.has(firma)) {
          repetidos++;
          continue;
        }
        let lectura;
        try {
          const arrayBuffer = await archivo.arrayBuffer();
          lectura = leerPlanillaKuder(arrayBuffer);
        } catch (err) {
          console.error(err);
          lectura = { estudiantes: [], errores: ["No se pudo leer este archivo. ¿Es un .xlsx/.csv de Kuder válido?"], advertencias: [], colegio: "", curso: "" };
        }
        // de una carpeta se muestra también en qué subcarpeta estaba (para ubicarlo)
        const fuente = crearFuenteArchivo({ ...lectura, archivoNombre: archivo.webkitRelativePath || archivo.name }, archivo);
        fuente.firma = firma;
        nuevas.push(fuente);
        firmas.add(firma);
      }
      if (repetidos) mostrarToast(`${repetidos === 1 ? "Ese archivo ya estaba" : `${repetidos} archivos ya estaban`} en la lista`);
      agregarFuentesInterno(nuevas);
    } catch (err) {
      console.error(err);
      alert("No se pudo leer alguno de los archivos.");
    } finally {
      botones.forEach((b, i) => {
        b.disabled = false;
        b.textContent = textos[i];
      });
      input.value = "";
      inputCarpeta.value = "";
    }
  }

  input.addEventListener("change", () => procesar(input.files, { desdeCarpeta: false }));
  inputCarpeta.addEventListener("change", () => procesar(inputCarpeta.files, { desdeCarpeta: true }));

  if (btnCursosApp) {
    btnCursosApp.addEventListener("click", () =>
      abrirSelectorCursos({
        titulo: "📚 Elige los cursos para el informe interno",
        ayuda: `Usa "Marcar todos los visibles" para incluir todo lo cargado en la app. Se usan los datos de ahora, con todas sus correcciones (no hace falta descargar los CSV).`,
        yaAgregados: new Set(kuderInternoEstadoActual.filter((f) => f.origen === "app").map((f) => f.clave)),
        onAgregar: (cursos) => agregarFuentesInterno(cursos.map(crearFuenteApp)),
      })
    );
  }

  btnCancelar.addEventListener("click", () => {
    kuderInternoEstadoActual = [];
    panelRevision.style.display = "none";
  });

  btnGenerar.addEventListener("click", async () => {
    refrescarFuentesApp(kuderInternoEstadoActual, storeKuder);
    const conEstudiantes = kuderInternoEstadoActual.filter((f) => f.estudiantes.length > 0);
    if (!conEstudiantes.length) {
      alert("No hay estudiantes válidos para generar el informe.");
      return;
    }

    // todos los cursos de la lista con estudiantes entran al informe (a diferencia del
    // informe para orientadores, acá no hay casilla de "incluir": el objetivo es un
    // resumen agregado de todo el lote; lo que sobra se quita con su ✕).
    const cont = document.getElementById("kuder-interno-lista-archivos");
    let ok = true;
    const archivos = [];
    conEstudiantes.forEach((f) => {
      const colegio = (f.colegio || "").trim();
      const curso = (f.curso || "").trim();
      const fila = cont.querySelector(`.fila-importar-archivo[data-uid="${f.uid}"]`);
      if (fila) {
        fila.querySelector(".kuder-interno-fila-colegio").classList.toggle("invalido", !colegio);
        fila.querySelector(".kuder-interno-fila-curso").classList.toggle("invalido", !curso);
      }
      if (!colegio || !curso) {
        ok = false;
        return;
      }
      archivos.push({ nombre: f.archivoNombre, colegio, curso, estudiantes: f.estudiantes });
    });

    if (!ok) {
      alert("Completa colegio y curso de cada archivo.");
      return;
    }

    // período del informe: los 3 campos son independientes entre sí (no es un
    // <input type="date">, que exige día+mes+año juntos) — se manda tal cual estén,
    // y formatearPeriodoKuder() arma el texto más natural con lo que haya.
    const periodo = {
      dia: document.getElementById("kuder-interno-periodo-dia").value.trim(),
      mes: document.getElementById("kuder-interno-periodo-mes").value,
      anio: document.getElementById("kuder-interno-periodo-anio").value.trim(),
    };

    const textoOriginal = btnGenerar.textContent;
    btnGenerar.disabled = true;
    btnGenerar.textContent = "Generando…";
    try {
      await generarInformeInternoKuderPdf(archivos, periodo);
    } catch (err) {
      console.error(err);
      alert("No se pudo generar el informe. Revisa el mensaje en la consola.");
    } finally {
      btnGenerar.disabled = false;
      btnGenerar.textContent = textoOriginal;
    }
  });
}

function renderKuderInternoListaArchivos() {
  const lecturas = kuderInternoEstadoActual;
  const cont = document.getElementById("kuder-interno-lista-archivos");
  cont.innerHTML = lecturas
    .map((f) => {
      const n = f.estudiantes.length;
      const nErrores = f.errores.length;
      const esApp = f.origen === "app";
      const info = esApp
        ? infoFuenteApp(f)
        : n > 0
          ? `${n} ${n === 1 ? "estudiante detectado" : "estudiantes detectados"}${nErrores ? `, ${nErrores} ${nErrores === 1 ? "fila con problemas" : "filas con problemas"}` : ""}`
          : "sin estudiantes válidos — este archivo no se va a incluir";
      return `
      <div class="fila-importar-archivo${esApp ? " fila-fuente-app" : ""}" data-uid="${f.uid}">
        <div class="fila-importar-archivo-nombre">
          <span>${esApp ? "📚" : "📄"} ${escaparHtmlKuder(f.archivoNombre)}</span>
          <span class="fila-importar-archivo-info">${info}</span>
          ${esApp ? `<button type="button" class="chico secundario btn-ver-en-app" title="Abre este curso en Estudiantes e informes para corregir lo que haga falta">✏️ Ver o editar en la app</button>` : ""}
          <button type="button" class="btn-quitar-archivo" title="Quitar de la lista" aria-label="Quitar ${escaparHtmlKuder(f.archivoNombre)}">✕</button>
        </div>
        ${
          n > 0
            ? `<div class="grid-form" style="grid-template-columns:repeat(2,1fr);">
                <div><label>Colegio *</label><input type="text" class="kuder-interno-fila-colegio" value="${escaparHtmlKuder(f.colegio)}" /></div>
                <div><label>Curso *</label><input type="text" class="kuder-interno-fila-curso" value="${escaparHtmlKuder(f.curso)}" placeholder="Ej: 2do A" /></div>
              </div>`
            : ""
        }
      </div>`;
    })
    .join("");

  cont.querySelectorAll(".fila-importar-archivo[data-uid]").forEach((fila) => {
    const f = kuderInternoEstadoActual.find((x) => x.uid === fila.dataset.uid);
    if (!f) return;
    fila.querySelector(".btn-quitar-archivo").onclick = () => quitarFuenteInterno(f.uid);
    const ver = fila.querySelector(".btn-ver-en-app");
    if (ver) ver.onclick = () => irACursoEnApp(f);
    const inpColegio = fila.querySelector(".kuder-interno-fila-colegio");
    if (inpColegio) inpColegio.oninput = () => (f.colegio = inpColegio.value);
    const inpCurso = fila.querySelector(".kuder-interno-fila-curso");
    if (inpCurso) inpCurso.oninput = () => (f.curso = inpCurso.value);
  });

  // solo los errores de lectura (filas que no se pudieron usar): los avisos de tests mal
  // traspasados (que no suman 45) no se muestran, porque para el informe final del año
  // los informes individuales ya se entregaron
  const avisos = lecturas.flatMap((l) => l.errores.map((texto) => ({ texto: `${l.archivoNombre}: ${texto}`, tipo: "error" })));
  // al juntar archivos de varios computadores (o un archivo y el mismo curso elegido de
  // la app), un mismo curso podría venir dos veces: se compara por RUT o nombre
  fuentesRepetidas(lecturas.filter((l) => l.estudiantes.length)).forEach(([a, b]) =>
    avisos.unshift({ texto: `⚠ "${a.archivoNombre}" y "${b.archivoNombre}" traen a los mismos estudiantes (se contarían dos veces). Deja solo uno.`, tipo: "advertencia" })
  );
  const contAvisos = document.getElementById("kuder-interno-rev-avisos");
  contAvisos.innerHTML = avisos.length
    ? `<ul class="kuder-avisos-lista">${avisos.map((a) => `<li class="${a.tipo}">${escaparHtmlKuder(a.texto)}</li>`).join("")}</ul>`
    : "";

  const validos = lecturas.filter((l) => l.estudiantes.length > 0);
  const nApp = validos.filter((l) => l.origen === "app").length;
  const nEst = validos.reduce((acc, l) => acc + l.estudiantes.length, 0);
  document.getElementById("kuder-interno-rev-resumen").textContent =
    `${validos.length} ${validos.length === 1 ? "curso válido" : "cursos válidos"} en la lista (${nEst} estudiantes)` +
    (nApp ? `: ${nApp} de la app y ${validos.length - nApp} de archivos.` : ".");
}

// ==================== CSV de los cursos cargados en la app ====================
// La app no guarda los archivos que se suben (ni aquí ni en "Ingresar datos"): solo los
// lee. Para juntar los cursos de varios computadores y generar el informe final, aquí se
// arman de nuevo los CSV, uno por curso, con los datos que hay AHORA en la app (con las
// correcciones de puntajes y nombres), en el mismo formato del prellenado de Kuder:
// UTF-8 con BOM, separados por punto y coma, saltos de línea de Windows y las mismas
// columnas en el mismo orden. Los estudiantes van en el orden en que se importaron (el
// del archivo original). "contacto" y "nacimiento" solo traen datos en los cursos
// importados desde esta versión (antes la app no los guardaba).

const COLUMNAS_CSV_KUDER = ["rut", ...AREAS_KUDER.map((a) => a.id), "nombre", "contacto", "nacimiento", "colegio", "curso"];

function campoCsvKuder(valor) {
  return (valor ?? "").toString().replace(/[;\r\n]+/g, " ").trim();
}

// "2do Medio" + "A" → "2do A", como viene en el prellenado
function cursoParaCsvKuder(e) {
  const corto = (e.curso || "").replace(/\s+medio$/i, "").trim();
  return [corto, e.letra].filter(Boolean).join(" ");
}

function filaCsvKuder(e) {
  const rut = (e.rut || "").toString().replace(/[^0-9kK]/g, "");
  return [rut, ...AREAS_KUDER.map((a) => e.puntajes[a.id]), e.nombre, e.contacto, e.nacimiento, e.colegio, cursoParaCsvKuder(e)]
    .map(campoCsvKuder)
    .join(";");
}

function csvDeCursoKuder(estudiantes) {
  return "﻿" + [COLUMNAS_CSV_KUDER.join(";"), ...estudiantes.map(filaCsvKuder)].join("\r\n");
}

// cursos cargados (colegio + curso + letra), cada uno con sus estudiantes en el orden
// de importación; los de la papelera no van
function cursosCargadosKuder() {
  const porCurso = new Map();
  for (const e of storeKuder.listar()) {
    const clave = [e.colegio, e.curso, e.letra].map((s) => (s || "").trim().toLowerCase()).join("|");
    if (!porCurso.has(clave)) porCurso.set(clave, { colegio: e.colegio, curso: e.curso, letra: e.letra, estudiantes: [] });
    porCurso.get(clave).estudiantes.push(e);
  }
  return [...porCurso.values()].sort(
    (a, b) => compararNombres(a.colegio, b.colegio) || compararNombres(`${a.curso} ${a.letra}`, `${b.curso} ${b.letra}`)
  );
}

function nombreCsvCursoKuder(curso) {
  const etiqueta = [curso.curso, curso.letra].filter(Boolean).join(" ");
  return `KUDER_${limpiarParaCarpeta(curso.colegio) || "SinColegio"}_${limpiarParaCarpeta(etiqueta) || "SinCurso"}.csv`;
}

function renderCsvInternoKuder() {
  const cont = document.getElementById("kuder-interno-csv-resumen");
  const btn = document.getElementById("kuder-interno-btn-csv");
  if (!cont || !btn) return;
  const cursos = cursosCargadosKuder();
  const nEstudiantes = cursos.reduce((acc, c) => acc + c.estudiantes.length, 0);
  const nColegios = new Set(cursos.map((c) => (c.colegio || "").trim().toLowerCase())).size;
  btn.disabled = cursos.length === 0;
  if (!cursos.length) {
    cont.innerHTML = `Todavía no hay cursos de Kuder cargados en la app.`;
    return;
  }
  const porColegio = new Map();
  cursos.forEach((c) => {
    if (!porColegio.has(c.colegio)) porColegio.set(c.colegio, []);
    porColegio.get(c.colegio).push(c);
  });
  cont.innerHTML = `
    Hay <b>${cursos.length} ${cursos.length === 1 ? "curso" : "cursos"}</b> de ${nColegios} ${nColegios === 1 ? "colegio" : "colegios"} (${nEstudiantes} estudiantes) cargados en la app.
    <details class="csv-cursos-detalle">
      <summary>Ver qué cursos van</summary>
      <ul>${[...porColegio]
        .map(
          ([colegio, lista]) =>
            `<li><b>${escaparHtmlKuder(colegio || "Sin colegio")}:</b> ${lista
              .map((c) => `${escaparHtmlKuder([c.curso, c.letra].filter(Boolean).join(" ") || "sin curso")} (${c.estudiantes.length})`)
              .join(", ")}</li>`
        )
        .join("")}</ul>
    </details>`;
}

async function descargarCsvCursosKuder(btn) {
  const cursos = cursosCargadosKuder();
  if (!cursos.length) return;
  const zip = new JSZip();
  const usados = new Map();
  for (const c of cursos) {
    let nombre = nombreCsvCursoKuder(c);
    const veces = usados.get(nombre) || 0;
    usados.set(nombre, veces + 1);
    if (veces > 0) nombre = nombre.replace(/\.csv$/, `_${veces + 1}.csv`);
    zip.file(nombre, csvDeCursoKuder(c.estudiantes));
  }
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Preparando…";
  try {
    const blob = await zip.generateAsync({ type: "blob" });
    descargarArchivo(blob, `KUDER_CSV_${cursos.length}${cursos.length === 1 ? "curso" : "cursos"}_${anioParaArchivo()}.zip`);
    mostrarToast(`Listo: ${cursos.length} ${cursos.length === 1 ? "archivo CSV" : "archivos CSV"} en un ZIP`);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("kuder-interno-btn-csv");
  if (btn) btn.addEventListener("click", () => descargarCsvCursosKuder(btn));
});
