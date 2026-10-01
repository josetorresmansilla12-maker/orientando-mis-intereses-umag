// UI del "Informe Interno" de Kuder (Admisión y Marketing) — módulo aparte del informe
// para orientadores (js/kuder.js, js/kuder-report.js): no los modifica, pero SÍ reutiliza
// a propósito leerPlanillaKuder() y escaparHtmlKuder() de js/kuder.js (ya cargado antes
// en index.html) porque el formato de archivo de entrada es el mismo — un CSV/Excel de
// puntajes de Kuder por curso — y no tiene sentido duplicar ese lector.

let kuderInternoEstadoActual = []; // [{ archivoNombre, estudiantes, errores, advertencias, colegio, curso }, ...]
const KUDER_INTERNO_MAX_ARCHIVOS = 50;

document.addEventListener("DOMContentLoaded", () => {
  cablearKuderInterno();
});

function cablearKuderInterno() {
  const input = document.getElementById("kuder-interno-input-planilla");
  if (!input) return; // esta página no incluye el informe interno de Kuder

  const btn = document.getElementById("kuder-interno-btn-elegir-planilla");
  const etiquetaArchivo = document.getElementById("kuder-interno-nombre-archivo");
  const panelRevision = document.getElementById("kuder-interno-revision");
  const btnGenerar = document.getElementById("kuder-interno-btn-generar");
  const btnCancelar = document.getElementById("kuder-interno-btn-cancelar-revision");

  btn.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    let archivos = Array.from(input.files || []);
    if (archivos.length === 0) return;

    if (archivos.length > KUDER_INTERNO_MAX_ARCHIVOS) {
      alert(`Puedes subir hasta ${KUDER_INTERNO_MAX_ARCHIVOS} archivos a la vez. Se van a usar los primeros ${KUDER_INTERNO_MAX_ARCHIVOS}.`);
      archivos = archivos.slice(0, KUDER_INTERNO_MAX_ARCHIVOS);
    }

    etiquetaArchivo.textContent = archivos.length === 1 ? archivos[0].name : `${archivos.length} archivos seleccionados`;
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Leyendo…";

    try {
      const lecturas = [];
      for (const archivo of archivos) {
        let lectura;
        try {
          const arrayBuffer = await archivo.arrayBuffer();
          lectura = leerPlanillaKuder(arrayBuffer);
        } catch (err) {
          console.error(err);
          lectura = { estudiantes: [], errores: ["No se pudo leer este archivo. ¿Es un .xlsx/.csv de Kuder válido?"], advertencias: [], colegio: "", curso: "" };
        }
        lecturas.push({ ...lectura, archivoNombre: archivo.name });
      }

      const conEstudiantes = lecturas.filter((l) => l.estudiantes.length > 0);
      if (conEstudiantes.length === 0) {
        alert(lecturas.flatMap((l) => l.errores).join("\n") || "No se encontraron estudiantes válidos en estos archivos.");
        kuderInternoEstadoActual = [];
        panelRevision.style.display = "none";
        return;
      }

      kuderInternoEstadoActual = lecturas;
      renderKuderInternoListaArchivos(lecturas);
      panelRevision.style.display = "block";
      panelRevision.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      console.error(err);
      alert("No se pudo leer alguno de los archivos.");
      kuderInternoEstadoActual = [];
      panelRevision.style.display = "none";
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
      input.value = "";
    }
  });

  btnCancelar.addEventListener("click", () => {
    kuderInternoEstadoActual = [];
    panelRevision.style.display = "none";
    etiquetaArchivo.textContent = "";
  });

  btnGenerar.addEventListener("click", async () => {
    if (!kuderInternoEstadoActual.length) {
      alert("No hay estudiantes válidos para generar el informe.");
      return;
    }

    const cont = document.getElementById("kuder-interno-lista-archivos");
    const inpsColegio = cont.querySelectorAll(".kuder-interno-fila-colegio");
    const inpsCurso = cont.querySelectorAll(".kuder-interno-fila-curso");

    // todos los archivos con estudiantes válidos entran al informe (a diferencia del
    // informe para orientadores, acá no hay casilla de "incluir": el objetivo es un
    // resumen agregado de todo el lote subido, no elegir un subconjunto).
    let ok = true;
    const archivos = [];
    inpsColegio.forEach((inpColegio, i) => {
      const colegio = inpColegio.value.trim();
      const curso = inpsCurso[i].value.trim();
      const falta = !colegio || !curso;
      inpColegio.classList.toggle("invalido", !colegio);
      inpsCurso[i].classList.toggle("invalido", !curso);
      if (falta) {
        ok = false;
        return;
      }
      const idxOriginal = Number(inpColegio.dataset.idx);
      const lectura = kuderInternoEstadoActual[idxOriginal];
      archivos.push({ nombre: lectura.archivoNombre, colegio, curso, estudiantes: lectura.estudiantes });
    });

    if (!ok) {
      alert("Completa colegio y curso de cada archivo.");
      return;
    }
    if (archivos.length === 0) {
      alert("No hay archivos válidos para generar el informe.");
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

function renderKuderInternoListaArchivos(lecturas) {
  const cont = document.getElementById("kuder-interno-lista-archivos");
  cont.innerHTML = lecturas
    .map((lectura, i) => {
      const n = lectura.estudiantes.length;
      const nErrores = lectura.errores.length;
      const info =
        n > 0
          ? `${n} ${n === 1 ? "estudiante detectado" : "estudiantes detectados"}${nErrores ? `, ${nErrores} ${nErrores === 1 ? "fila con problemas" : "filas con problemas"}` : ""}`
          : "sin estudiantes válidos — este archivo no se va a incluir";
      return `
      <div class="fila-importar-archivo">
        <div class="fila-importar-archivo-nombre">
          <span>📄 ${escaparHtmlKuder(lectura.archivoNombre)}</span>
          <span class="fila-importar-archivo-info">${info}</span>
        </div>
        ${
          n > 0
            ? `<div class="grid-form" style="grid-template-columns:repeat(2,1fr);">
                <div><label>Colegio *</label><input type="text" class="kuder-interno-fila-colegio" data-idx="${i}" value="${escaparHtmlKuder(lectura.colegio)}" /></div>
                <div><label>Curso *</label><input type="text" class="kuder-interno-fila-curso" data-idx="${i}" value="${escaparHtmlKuder(lectura.curso)}" placeholder="Ej: 2do A" /></div>
              </div>`
            : ""
        }
      </div>`;
    })
    .join("");

  const avisos = lecturas.flatMap((l) => [
    ...l.errores.map((texto) => ({ texto: `${l.archivoNombre}: ${texto}`, tipo: "error" })),
    // un test mal traspasado cuyo error no cambia los resultados ("ℹ️") va en gris; el
    // que sí podría cambiarlos ("⚠"), en amarillo
    ...l.advertencias.map((texto) => ({ texto: `${l.archivoNombre}: ${texto}`, tipo: texto.startsWith("ℹ") ? "info" : "advertencia" })),
  ]);
  const contAvisos = document.getElementById("kuder-interno-rev-avisos");
  contAvisos.innerHTML = avisos.length
    ? `<ul class="kuder-avisos-lista">${avisos.map((a) => `<li class="${a.tipo}">${escaparHtmlKuder(a.texto)}</li>`).join("")}</ul>`
    : "";

  // al juntar archivos de varios computadores, un mismo curso podría venir dos veces
  const claveCurso = (l) => `${normalizarTextoKuder(l.colegio)}|${normalizarTextoKuder(l.curso)}`;
  const vistos = new Map();
  lecturas.forEach((l) => {
    if (!l.estudiantes.length || !l.colegio || !l.curso) return;
    const k = claveCurso(l);
    vistos.set(k, [...(vistos.get(k) || []), l.archivoNombre]);
  });
  const repetidos = [...vistos.values()].filter((nombres) => nombres.length > 1);
  if (repetidos.length) {
    contAvisos.innerHTML =
      `<ul class="kuder-avisos-lista">${repetidos
        .map((nombres) => `<li class="advertencia">⚠ Este curso viene en más de un archivo (se contaría dos veces): ${nombres.map(escaparHtmlKuder).join(", ")}. Deja solo uno.</li>`)
        .join("")}</ul>` + contAvisos.innerHTML;
  }

  const nValidos = lecturas.filter((l) => l.estudiantes.length > 0).length;
  document.getElementById("kuder-interno-rev-resumen").textContent =
    `${nValidos} ${nValidos === 1 ? "archivo válido" : "archivos válidos"} de ${lecturas.length} subido(s).`;
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
    descargarArchivo(blob, `KUDER_CSV_${cursos.length}${cursos.length === 1 ? "curso" : "cursos"}_${fechaParaArchivo()}.zip`);
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
