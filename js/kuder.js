// UI del módulo "Test Vocacional de Kuder" (Enseñanza Media): lectura de la planilla
// de puntajes ya corregidos (Excel/CSV, un archivo por curso) y generación del informe
// grupal en PDF para los orientadores. Módulo aparte del cuestionario de 8° básico —
// no llama ni depende de sus funciones (js/app.js, js/excel.js, js/report.js), solo
// reutiliza utilidades genéricas de js/report.js (el motor de PDF/paginación) tal como
// están, sin modificarlas.

let kuderEstadoActual = []; // [{ archivoNombre, estudiantes, errores, advertencias, colegio, curso }, ...] — 1 a 6 archivos
const KUDER_MAX_ARCHIVOS = 6;

document.addEventListener("DOMContentLoaded", () => {
  cablearKuder();
});

function normalizarTextoKuder(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// busca, en las primeras filas de la hoja, la fila de encabezados: la que tiene una
// columna "Nombre" y las 10 columnas de área (por id corto — exterior, mecanica,
// calculo... — o por nombre completo del área, como respaldo).
function ubicarEncabezadosKuder(filas) {
  for (let f = 0; f < Math.min(filas.length, 5); f++) {
    const fila = filas[f];
    if (!fila) continue;
    const idxNombre = fila.findIndex((c) => normalizarTextoKuder(c) === "nombre");
    if (idxNombre === -1) continue;

    const idxRut = fila.findIndex((c) => normalizarTextoKuder(c) === "rut");
    const idxColegio = fila.findIndex((c) => normalizarTextoKuder(c) === "colegio");
    const idxCurso = fila.findIndex((c) => normalizarTextoKuder(c) === "curso");

    const idxPorArea = {};
    AREAS_KUDER.forEach((a) => {
      const claves = [a.id, normalizarTextoKuder(a.nombre)];
      const idx = fila.findIndex((c) => claves.includes(normalizarTextoKuder(c)));
      if (idx !== -1) idxPorArea[a.id] = idx;
    });
    const tieneTodasLasAreas = AREAS_KUDER.every((a) => idxPorArea[a.id] !== undefined);
    if (!tieneTodasLasAreas) continue;

    return { filaEncabezado: f, idxNombre, idxRut, idxColegio, idxCurso, idxPorArea };
  }
  return null;
}

// procesa un ArrayBuffer (.xlsx o .csv, SheetJS detecta el formato solo) y devuelve
// los estudiantes con sus 10 puntajes, más colegio/curso (tomados de la primera fila
// que los traiga) y dos listas separadas: errores (la fila se descarta) y
// advertencias (la fila igual se importa, pero conviene revisarla).
function leerPlanillaKuder(arrayBuffer) {
  const libro = XLSX.read(arrayBuffer, { type: "array" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", blankrows: false });

  const ubicacion = ubicarEncabezadosKuder(filas);
  if (!ubicacion) {
    return {
      estudiantes: [],
      errores: [
        'No se encontró una fila de encabezados con "Nombre" y las 10 columnas de área (exterior, mecanica, calculo, cientifica, persuasiva, artistica, literaria, musical, social, oficina). ¿Es la planilla de puntajes de Kuder correcta?',
      ],
      advertencias: [],
      colegio: "",
      curso: "",
    };
  }

  const { filaEncabezado, idxNombre, idxRut, idxColegio, idxCurso, idxPorArea } = ubicacion;
  const estudiantes = [];
  const errores = [];
  const advertencias = [];
  let colegio = "";
  let curso = "";

  for (let f = filaEncabezado + 1; f < filas.length; f++) {
    const fila = filas[f];
    if (!fila) continue;
    const nombre = (fila[idxNombre] || "").toString().trim();
    if (!nombre) continue; // fila vacía: fin de los datos

    const numeroFilaExcel = f + 1;
    const puntajes = {};
    let filaOk = true;
    let suma = 0;

    AREAS_KUDER.forEach((a) => {
      const crudo = fila[idxPorArea[a.id]];
      const valor = Number(crudo);
      if (crudo === "" || !Number.isFinite(valor) || valor < 0) {
        filaOk = false;
      } else {
        puntajes[a.id] = valor;
        suma += valor;
      }
    });

    if (!filaOk) {
      errores.push(`Fila ${numeroFilaExcel} (${nombre}): algún puntaje de área falta o no es un número válido.`);
      continue;
    }
    // el test de Kuder es de elección forzada: la suma de las 10 áreas de un
    // estudiante debería dar siempre 45 puntos. No se descarta la fila por esto
    // (puede haber variantes de corrección), pero se avisa para que se revise.
    if (suma !== 45) {
      advertencias.push(`Fila ${numeroFilaExcel} (${nombre}): la suma de las 10 áreas es ${suma} (se esperan 45) — revisa esta fila.`);
    }

    if (!colegio && idxColegio !== -1) colegio = (fila[idxColegio] || "").toString().trim();
    if (!curso && idxCurso !== -1) curso = (fila[idxCurso] || "").toString().trim();

    estudiantes.push({
      nombre,
      rut: idxRut !== -1 ? (fila[idxRut] || "").toString().trim() : "",
      puntajes,
    });
  }

  return { estudiantes, errores, advertencias, colegio, curso };
}

function cablearKuder() {
  const input = document.getElementById("kuder-input-planilla");
  if (!input) return; // esta página no incluye el módulo de Kuder

  const btn = document.getElementById("kuder-btn-elegir-planilla");
  const etiquetaArchivo = document.getElementById("kuder-nombre-archivo");
  const panelRevision = document.getElementById("kuder-revision");
  const btnGenerar = document.getElementById("kuder-btn-generar");
  const btnGenerarPorCurso = document.getElementById("kuder-btn-generar-por-curso");
  const btnCancelar = document.getElementById("kuder-btn-cancelar-revision");

  btn.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    let archivos = Array.from(input.files || []);
    if (archivos.length === 0) return;

    if (archivos.length > KUDER_MAX_ARCHIVOS) {
      alert(`Puedes subir hasta ${KUDER_MAX_ARCHIVOS} archivos a la vez. Se van a usar los primeros ${KUDER_MAX_ARCHIVOS}.`);
      archivos = archivos.slice(0, KUDER_MAX_ARCHIVOS);
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
        kuderEstadoActual = [];
        panelRevision.style.display = "none";
        return;
      }

      kuderEstadoActual = lecturas;
      document.getElementById("kuder-rev-fecha").value = "";
      renderKuderListaArchivos(lecturas);

      panelRevision.style.display = "block";
      panelRevision.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      console.error(err);
      alert("No se pudo leer alguno de los archivos.");
      kuderEstadoActual = [];
      panelRevision.style.display = "none";
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
      input.value = "";
    }
  });

  btnCancelar.addEventListener("click", () => {
    kuderEstadoActual = [];
    panelRevision.style.display = "none";
    etiquetaArchivo.textContent = "";
  });

  btnGenerar.addEventListener("click", async () => {
    if (!kuderEstadoActual.length) {
      alert("No hay estudiantes válidos para generar el informe.");
      return;
    }
    const porArchivo = recolectarCursosSeleccionadosKuder();
    if (!porArchivo) return;
    const fecha = document.getElementById("kuder-rev-fecha").value;

    btnGenerar.disabled = true;
    btnGenerar.textContent = "Generando…";
    try {
      if (porArchivo.length === 1) {
        const { colegio, curso, estudiantes } = porArchivo[0];
        await generarInformeGrupalKuderPdf({ colegio, curso, fecha }, estudiantes);
      } else {
        const estudiantesGlobal = porArchivo.flatMap((c) => c.estudiantes);
        const resumenPorCurso = porArchivo.map((c) => ({ colegio: c.colegio, curso: c.curso, total: c.total }));
        await generarInformeGlobalKuderPdf(resumenPorCurso, estudiantesGlobal, fecha);
      }
    } catch (err) {
      console.error(err);
      alert("No se pudo generar el informe. Revisa el mensaje en la consola.");
    } finally {
      actualizarBotonGenerarKuder();
    }
  });

  // botón separado: un PDF de informe grupal por CADA curso marcado (no uno que los
  // suma), entregados juntos en un ZIP — útil cuando cada curso va para un
  // orientador distinto, en vez de un solo resumen combinado.
  if (btnGenerarPorCurso) {
    btnGenerarPorCurso.addEventListener("click", async () => {
      if (!kuderEstadoActual.length) {
        alert("No hay estudiantes válidos para generar los informes.");
        return;
      }
      const porArchivo = recolectarCursosSeleccionadosKuder();
      if (!porArchivo) return;
      const fecha = document.getElementById("kuder-rev-fecha").value;

      btnGenerarPorCurso.disabled = true;
      btnGenerarPorCurso.textContent = "Generando…";
      try {
        await generarInformesPorCursoKuderZip(porArchivo, fecha);
      } catch (err) {
        console.error(err);
        alert("No se pudieron generar los informes. Revisa el mensaje en la consola.");
      } finally {
        actualizarBotonGenerarKuder();
      }
    });
  }
}

// junta los cursos marcados con la casilla "incluir" (una por archivo, ver
// renderKuderListaArchivos), validando que cada uno tenga colegio y curso. Si falta
// algo, marca los campos en rojo, muestra la alerta correspondiente y devuelve null;
// si no hay ningún curso marcado, también avisa y devuelve null. La usan tanto el
// botón de informe único/global como el de informes por curso — la selección de
// cursos es la misma, solo cambia qué se hace con ella.
function recolectarCursosSeleccionadosKuder() {
  const cont = document.getElementById("kuder-lista-archivos");
  const inpsColegio = cont.querySelectorAll(".kuder-fila-colegio");
  const inpsCurso = cont.querySelectorAll(".kuder-fila-curso");
  const checksIncluir = cont.querySelectorAll(".kuder-fila-incluir");

  // los índices de .kuder-fila-colegio/.kuder-fila-curso/.kuder-fila-incluir solo
  // existen para archivos con estudiantes válidos (n > 0 en renderKuderListaArchivos),
  // así que se recorren en paralelo con esos tres NodeList, no con kuderEstadoActual
  // directo (que puede tener archivos sin filas de formulario, si vinieron vacíos).
  let ok = true;
  const porArchivo = [];
  inpsColegio.forEach((inpColegio, i) => {
    if (!checksIncluir[i].checked) return; // curso no marcado: se excluye del informe
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
    const estudiantes = kuderEstadoActual[idxOriginal].estudiantes;
    porArchivo.push({ colegio, curso, estudiantes, total: estudiantes.length });
  });

  if (!ok) {
    alert("Completa colegio y curso de cada curso marcado.");
    return null;
  }
  if (porArchivo.length === 0) {
    alert("Marca al menos un curso para generar el informe.");
    return null;
  }
  return porArchivo;
}

function renderKuderListaArchivos(lecturas) {
  const cont = document.getElementById("kuder-lista-archivos");
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
          <label class="kuder-fila-incluir-label">
            ${n > 0 ? `<input type="checkbox" class="kuder-fila-incluir" data-idx="${i}" checked />` : ""}
            <span>📄 ${escaparHtmlKuder(lectura.archivoNombre)}</span>
          </label>
          <span class="fila-importar-archivo-info">${info}</span>
        </div>
        ${
          n > 0
            ? `<div class="grid-form" style="grid-template-columns:repeat(2,1fr);">
                <div><label>Colegio *</label><input type="text" class="kuder-fila-colegio" data-idx="${i}" value="${escaparHtmlKuder(lectura.colegio)}" /></div>
                <div><label>Curso *</label><input type="text" class="kuder-fila-curso" data-idx="${i}" value="${escaparHtmlKuder(lectura.curso)}" placeholder="Ej: 2do A" /></div>
              </div>`
            : ""
        }
      </div>`;
    })
    .join("");

  const avisos = lecturas.flatMap((l) => [
    ...l.errores.map((texto) => ({ texto: `${l.archivoNombre}: ${texto}`, tipo: "error" })),
    ...l.advertencias.map((texto) => ({ texto: `${l.archivoNombre}: ${texto}`, tipo: "advertencia" })),
  ]);
  const contAvisos = document.getElementById("kuder-rev-avisos");
  contAvisos.innerHTML = avisos.length
    ? `<ul class="kuder-avisos-lista">${avisos.map((a) => `<li class="${a.tipo}">${a.texto}</li>`).join("")}</ul>`
    : "";

  cont.querySelectorAll(".kuder-fila-incluir").forEach((chk) => {
    chk.addEventListener("change", actualizarBotonGenerarKuder);
  });
  actualizarBotonGenerarKuder();
}

// refleja en los botones "Generar" cuántos cursos están marcados con la casilla
// ahora mismo: 1 solo curso marcado genera el informe de ese curso; 2 o más, el
// informe global de justo esos cursos (no necesariamente todos los archivos
// subidos). El botón de "por curso" siempre genera uno por curso marcado, sin
// sumarlos. 0 marcados deshabilita ambos botones.
function actualizarBotonGenerarKuder() {
  const cont = document.getElementById("kuder-lista-archivos");
  const checks = [...cont.querySelectorAll(".kuder-fila-incluir")];
  const nSeleccionados = checks.filter((c) => c.checked).length;

  const btnGenerar = document.getElementById("kuder-btn-generar");
  btnGenerar.disabled = nSeleccionados === 0;
  btnGenerar.textContent =
    nSeleccionados > 1 ? `📄 Generar informe global (${nSeleccionados} cursos)` : "📄 Generar informe PDF";

  const btnPorCurso = document.getElementById("kuder-btn-generar-por-curso");
  if (btnPorCurso) {
    btnPorCurso.disabled = nSeleccionados === 0;
    btnPorCurso.textContent =
      nSeleccionados > 0
        ? `📦 Generar por curso (${nSeleccionados} ${nSeleccionados === 1 ? "informe" : "informes"} en ZIP)`
        : "📦 Generar por curso (ZIP)";
  }
}

function escaparHtmlKuder(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
