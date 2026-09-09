// UI del "Informe Interno" de Kuder (Admisión y Marketing) — módulo aparte del informe
// para orientadores (js/kuder.js, js/kuder-report.js): no los modifica, pero SÍ reutiliza
// a propósito leerPlanillaKuder() y escaparHtmlKuder() de js/kuder.js (ya cargado antes
// en index.html) porque el formato de archivo de entrada es el mismo — un CSV/Excel de
// puntajes de Kuder por curso — y no tiene sentido duplicar ese lector.

let kuderInternoEstadoActual = []; // [{ archivoNombre, estudiantes, errores, advertencias, colegio, curso }, ...]
const KUDER_INTERNO_MAX_ARCHIVOS = 20;

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
    ...l.advertencias.map((texto) => ({ texto: `${l.archivoNombre}: ${texto}`, tipo: "advertencia" })),
  ]);
  const contAvisos = document.getElementById("kuder-interno-rev-avisos");
  contAvisos.innerHTML = avisos.length
    ? `<ul class="kuder-avisos-lista">${avisos.map((a) => `<li class="${a.tipo}">${a.texto}</li>`).join("")}</ul>`
    : "";

  const nValidos = lecturas.filter((l) => l.estudiantes.length > 0).length;
  document.getElementById("kuder-interno-rev-resumen").textContent =
    `${nValidos} ${nValidos === 1 ? "archivo válido" : "archivos válidos"} de ${lecturas.length} subido(s).`;
}
