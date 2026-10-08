// Test Vocacional de Kuder (Enseñanza Media): lector de la planilla de puntajes ya
// corregidos (Excel/CSV, un archivo por curso) — lo usan tanto la pestaña "Ingresar
// datos" (para guardar estudiantes y generar sus informes individuales, ver
// leerPlanillaKuderParaImportar) como las pestañas de informes grupales — y la UI de
// la pestaña "Informes para orientadores" (informe grupal por curso / global en PDF).
// No depende de funciones del cuestionario de 8° básico; solo reutiliza utilidades
// genéricas de js/report.js (el motor de PDF/paginación) tal como están.

// cursos de la lista: archivos subidos y cursos elegidos de la app (js/selector-cursos.js),
// cada uno { uid, origen: "archivo" | "app", archivoNombre, estudiantes, errores,
// advertencias, colegio, curso, incluir }
let kuderEstadoActual = [];
// hasta 12 cursos juntos: más que eso no cabe bien en la lista de "cursos incluidos"
// del informe global
const KUDER_MAX_ARCHIVOS = 12;

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
    const idxLetra = fila.findIndex((c) => normalizarTextoKuder(c) === "letra");
    const idxContacto = fila.findIndex((c) => normalizarTextoKuder(c) === "contacto");
    const idxNacimiento = fila.findIndex((c) => normalizarTextoKuder(c) === "nacimiento");

    const idxPorArea = {};
    AREAS_KUDER.forEach((a) => {
      const claves = [a.id, normalizarTextoKuder(a.nombre)];
      const idx = fila.findIndex((c) => claves.includes(normalizarTextoKuder(c)));
      if (idx !== -1) idxPorArea[a.id] = idx;
    });
    const tieneTodasLasAreas = AREAS_KUDER.every((a) => idxPorArea[a.id] !== undefined);
    if (!tieneTodasLasAreas) continue;

    return { filaEncabezado: f, idxNombre, idxRut, idxColegio, idxCurso, idxLetra, idxContacto, idxNacimiento, idxPorArea };
  }
  return null;
}

// fecha de nacimiento como texto "dd-mm-aaaa" (en un Excel puede venir como fecha real)
function textoFechaKuder(valor) {
  if (typeof valor === "number" && Number.isFinite(valor)) return XLSX.SSF.format("dd-mm-yyyy", valor);
  return (valor ?? "").toString().trim();
}

// procesa un ArrayBuffer (.xlsx o .csv, SheetJS detecta el formato solo) y devuelve
// los estudiantes con sus 10 puntajes, más colegio/curso (tomados de la primera fila
// que los traiga) y dos listas separadas: errores (la fila se descarta) y
// advertencias (la fila igual se importa, pero conviene revisarla).
function leerPlanillaKuder(arrayBuffer) {
  // raw: en los CSV, cada celda se lee como texto tal cual (si no, la librería convierte
  // fechas como "06-10-2007" en números y las lee al estilo de EE.UU.); los puntajes se
  // convierten a número más abajo
  const libro = XLSX.read(arrayBuffer, { type: "array", raw: true });
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

  const { filaEncabezado, idxNombre, idxRut, idxColegio, idxCurso, idxLetra, idxContacto, idxNacimiento, idxPorArea } = ubicacion;
  const estudiantes = [];
  const errores = [];
  const advertencias = [];
  const revisionTraspaso = []; // [{ fila, nombre, analisis }] de los que no suman 45
  let colegio = "";
  let curso = "";
  let letra = "";

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
    // estudiante debería dar siempre 45 puntos. Si no, el test quedó mal traspasado;
    // la fila no se descarta, pero se revisa si el error podría cambiar sus áreas de
    // interés (ver analizarTraspasoKuder en js/kuder-data.js) y se avisa.
    const analisis = analizarTraspasoKuder(puntajes);
    if (analisis.estado !== "ok") {
      const d = describirTraspasoKuder(analisis);
      revisionTraspaso.push({ fila: numeroFilaExcel, nombre, analisis });
      advertencias.push(`${d.afecta ? "⚠" : "ℹ️"} Fila ${numeroFilaExcel} (${nombre}), test mal traspasado: ${d.resumen}. ${d.accion}. ${d.detalle}`);
    }

    if (!colegio && idxColegio !== -1) colegio = (fila[idxColegio] || "").toString().trim();
    if (!curso && idxCurso !== -1) curso = (fila[idxCurso] || "").toString().trim();
    if (!letra && idxLetra !== -1) letra = (fila[idxLetra] || "").toString().trim();

    estudiantes.push({
      nombre,
      rut: idxRut !== -1 ? (fila[idxRut] || "").toString().trim() : "",
      // no se usan en los informes, pero se guardan para devolverlos en el CSV (Uso interno)
      contacto: idxContacto !== -1 ? (fila[idxContacto] || "").toString().trim() : "",
      nacimiento: idxNacimiento !== -1 ? textoFechaKuder(fila[idxNacimiento]) : "",
      puntajes,
    });
  }

  return { estudiantes, errores, advertencias, revisionTraspaso, colegio, curso, letra };
}

// "2do A" → { curso: "2do", letra: "A" }; "4to medio B" → { "4to medio", "B" };
// "2doA" → { "2do", "A" }. Si no se reconoce una letra final suelta, se deja todo
// como curso y la letra vacía (el usuario la puede completar al importar).
function separarCursoLetraKuder(texto) {
  const t = (texto || "").toString().trim().replace(/\s+/g, " ");
  let m = /^(.*\S)\s+([A-Za-zÑñ])$/.exec(t);
  if (m) return { curso: m[1], letra: m[2].toUpperCase() };
  m = /^(\d+\s*(?:°|º|ro|do|er|to|vo|mo|no)?(?:\s*medio)?)([A-Za-z])$/i.exec(t);
  if (m) return { curso: m[1].trim(), letra: m[2].toUpperCase() };
  return { curso: t, letra: "" };
}

// versión del lector para la pestaña "Ingresar datos" del Test de Kuder (guardar a los
// estudiantes para generar sus informes individuales): mismo lector que usan los
// informes grupales, pero con el curso separado de su letra (la app guarda curso y
// letra por separado, igual que en 8° básico).
function leerPlanillaKuderParaImportar(arrayBuffer) {
  const lectura = leerPlanillaKuder(arrayBuffer);
  let { curso, letra } = lectura;
  if (curso && !letra) ({ curso, letra } = separarCursoLetraKuder(curso));
  curso = normalizarCursoKuder(curso); // "2do" → "2do Medio" (en Kuder todo es enseñanza media)
  // los tests mal traspasados se muestran ordenados en la ventana de importación
  // (revisionTraspaso), así que no se repiten como advertencias sueltas
  return { ...lectura, advertencias: [], curso, letra: (letra || "").toUpperCase() };
}

// la pestaña "Informes para orientadores" sirve para los dos tests: lee la planilla
// del test elegido arriba (js/app.js: cfg()) y arma el informe con su configuración
// (js/kuder-report.js: CONFIG_GRUPAL_KUDER / CONFIG_GRUPAL_OCTAVO).
function testActivoEsOctavo() {
  return typeof cfg === "function" && cfg().id === "octavo";
}

function configGrupalDelTestActivo() {
  return testActivoEsOctavo() ? CONFIG_GRUPAL_OCTAVO : CONFIG_GRUPAL_KUDER;
}

// en 8° básico se usa el lector de la planilla de corrección (js/excel.js), que trae
// el curso y la letra por separado: acá van juntos ("8vo A"), como en Kuder
function leerPlanillaParaOrientadores(arrayBuffer) {
  if (!testActivoEsOctavo()) return leerPlanillaKuder(arrayBuffer);
  const lectura = leerPlanillaCorreccion(arrayBuffer);
  const curso = [lectura.curso, lectura.letra].map((x) => (x || "").trim()).filter(Boolean).join(" ");
  return { ...lectura, curso, advertencias: [] };
}

// al cambiar de test se descartan los cursos de la lista (eran del otro test)
function reiniciarPanelOrientadores() {
  kuderEstadoActual = [];
  const panel = document.getElementById("kuder-revision");
  if (panel) panel.style.display = "none";
}

// al volver a la pestaña: los cursos elegidos de la app se vuelven a leer (por si se
// corrigió algo a última hora en "Estudiantes e informes")
function refrescarPanelOrientadores() {
  if (!kuderEstadoActual.some((f) => f.origen === "app")) return;
  refrescarFuentesApp(kuderEstadoActual, cfg().store);
  renderKuderListaArchivos();
}

// agrega cursos a la lista (sin pasar del máximo) y la muestra
function agregarFuentesKuder(nuevas) {
  const libres = KUDER_MAX_ARCHIVOS - kuderEstadoActual.length;
  if (nuevas.length > libres) {
    alert(`La lista admite hasta ${KUDER_MAX_ARCHIVOS} cursos a la vez${libres > 0 ? `: se agregan los primeros ${libres}` : ". Quita alguno con su ✕ para agregar otro"}.`);
    nuevas = nuevas.slice(0, Math.max(0, libres));
  }
  if (!nuevas.length) return;
  kuderEstadoActual.push(...nuevas);
  renderKuderListaArchivos();
  const panel = document.getElementById("kuder-revision");
  panel.style.display = "block";
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function quitarFuenteKuder(uid) {
  kuderEstadoActual = kuderEstadoActual.filter((f) => f.uid !== uid);
  if (!kuderEstadoActual.length) reiniciarPanelOrientadores();
  else renderKuderListaArchivos();
}

function cablearKuder() {
  const input = document.getElementById("kuder-input-planilla");
  if (!input) return; // esta página no incluye el módulo de Kuder

  const btn = document.getElementById("kuder-btn-elegir-planilla");
  const btnCursosApp = document.getElementById("kuder-btn-elegir-cursos");
  const btnGenerar = document.getElementById("kuder-btn-generar");
  const btnGenerarPorCurso = document.getElementById("kuder-btn-generar-por-curso");
  const btnCancelar = document.getElementById("kuder-btn-cancelar-revision");

  btn.addEventListener("click", () => input.click());

  // los archivos elegidos se suman a la lista (no reemplazan a los que ya estaban)
  input.addEventListener("change", async () => {
    const archivos = Array.from(input.files || []);
    if (archivos.length === 0) return;
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Leyendo…";

    try {
      const firmas = new Set(kuderEstadoActual.map((f) => f.firma).filter(Boolean));
      const nuevas = [];
      let repetidos = 0;
      for (const archivo of archivos) {
        const firma = `${archivo.name}|${archivo.size}|${archivo.lastModified}`;
        if (firmas.has(firma)) {
          repetidos++;
          continue;
        }
        let lectura;
        try {
          const arrayBuffer = await archivo.arrayBuffer();
          lectura = leerPlanillaParaOrientadores(arrayBuffer);
        } catch (err) {
          console.error(err);
          lectura = { estudiantes: [], errores: ["No se pudo leer este archivo. ¿Es un .xlsx/.csv válido?"], advertencias: [], colegio: "", curso: "" };
        }
        nuevas.push(crearFuenteArchivo({ ...lectura, advertencias: lectura.advertencias || [], archivoNombre: archivo.name }, archivo));
        firmas.add(firma);
      }
      if (repetidos) mostrarToast(`${repetidos === 1 ? "Ese archivo ya estaba" : `${repetidos} archivos ya estaban`} en la lista`);
      agregarFuentesKuder(nuevas);
    } catch (err) {
      console.error(err);
      alert("No se pudo leer alguno de los archivos.");
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
      input.value = "";
    }
  });

  if (btnCursosApp) {
    btnCursosApp.addEventListener("click", () =>
      abrirSelectorCursos({
        titulo: "📚 Elige cursos cargados en la app",
        ayuda: `Con un curso se genera su informe; con 2 o más, el informe global o uno por curso. Se usan los datos que hay ahora en la app, con todas sus correcciones.`,
        yaAgregados: new Set(kuderEstadoActual.filter((f) => f.origen === "app").map((f) => f.clave)),
        onAgregar: (cursos) => agregarFuentesKuder(cursos.map(crearFuenteApp)),
      })
    );
  }

  btnCancelar.addEventListener("click", reiniciarPanelOrientadores);

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
        await generarInformeGrupalKuderPdf({ colegio, curso, fecha }, estudiantes, configGrupalDelTestActivo());
      } else {
        const estudiantesGlobal = porArchivo.flatMap((c) => c.estudiantes);
        const resumenPorCurso = porArchivo.map((c) => ({ colegio: c.colegio, curso: c.curso, total: c.total }));
        await generarInformeGlobalKuderPdf(resumenPorCurso, estudiantesGlobal, fecha, configGrupalDelTestActivo());
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
        await generarInformesPorCursoKuderZip(porArchivo, fecha, configGrupalDelTestActivo());
      } catch (err) {
        console.error(err);
        alert("No se pudieron generar los informes. Revisa el mensaje en la consola.");
      } finally {
        actualizarBotonGenerarKuder();
      }
    });
  }
}

// junta los cursos marcados con la casilla "incluir", validando que cada uno tenga
// colegio y curso. Si falta algo, marca los campos en rojo, muestra la alerta
// correspondiente y devuelve null; si no hay ningún curso marcado, también avisa y
// devuelve null. La usan tanto el botón de informe único/global como el de informes
// por curso — la selección de cursos es la misma, solo cambia qué se hace con ella.
// Los cursos elegidos de la app se leen de nuevo aquí, con los datos de este momento.
function recolectarCursosSeleccionadosKuder() {
  const cont = document.getElementById("kuder-lista-archivos");
  refrescarFuentesApp(kuderEstadoActual, cfg().store);
  let ok = true;
  const porArchivo = [];
  kuderEstadoActual.forEach((f) => {
    if (!f.incluir || !f.estudiantes.length) return; // curso no marcado o vacío: no va
    const fila = cont.querySelector(`.fila-importar-archivo[data-uid="${f.uid}"]`);
    const colegio = (f.colegio || "").trim();
    const curso = (f.curso || "").trim();
    if (fila) {
      fila.querySelector(".kuder-fila-colegio").classList.toggle("invalido", !colegio);
      fila.querySelector(".kuder-fila-curso").classList.toggle("invalido", !curso);
    }
    if (!colegio || !curso) {
      ok = false;
      return;
    }
    porArchivo.push({ colegio, curso, estudiantes: f.estudiantes, total: f.estudiantes.length });
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

function renderKuderListaArchivos() {
  const lecturas = kuderEstadoActual;
  const cont = document.getElementById("kuder-lista-archivos");
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
          <label class="kuder-fila-incluir-label">
            ${n > 0 ? `<input type="checkbox" class="kuder-fila-incluir" ${f.incluir ? "checked" : ""} />` : ""}
            <span>${esApp ? "📚" : "📄"} ${escaparHtmlKuder(f.archivoNombre)}</span>
          </label>
          <span class="fila-importar-archivo-info">${info}</span>
          ${esApp ? `<button type="button" class="chico secundario btn-ver-en-app" title="Abre este curso en Estudiantes e informes para corregir lo que haga falta">✏️ Ver o editar en la app</button>` : ""}
          <button type="button" class="btn-quitar-archivo" title="Quitar de la lista" aria-label="Quitar ${escaparHtmlKuder(f.archivoNombre)}">✕</button>
        </div>
        ${
          n > 0
            ? `<div class="grid-form" style="grid-template-columns:repeat(2,1fr);">
                <div><label>Colegio *</label><input type="text" class="kuder-fila-colegio" value="${escaparHtmlKuder(f.colegio)}" /></div>
                <div><label>Curso *</label><input type="text" class="kuder-fila-curso" value="${escaparHtmlKuder(f.curso)}" placeholder="${testActivoEsOctavo() ? "Ej: 8vo A" : "Ej: 2do A"}" /></div>
              </div>
              ${esApp ? `<div class="fuente-app-nota">Colegio y curso solo cambian en este informe; para cambiarlos en la app usa "✏️ Ver o editar en la app" o "Editar carpetas".</div>` : ""}`
            : ""
        }
      </div>`;
    })
    .join("");

  // lo escrito y las casillas quedan guardados en cada curso de la lista (así no se
  // pierden al agregar o quitar otro)
  cont.querySelectorAll(".fila-importar-archivo[data-uid]").forEach((fila) => {
    const f = kuderEstadoActual.find((x) => x.uid === fila.dataset.uid);
    if (!f) return;
    fila.querySelector(".btn-quitar-archivo").onclick = () => quitarFuenteKuder(f.uid);
    const ver = fila.querySelector(".btn-ver-en-app");
    if (ver) ver.onclick = () => irACursoEnApp(f);
    const chk = fila.querySelector(".kuder-fila-incluir");
    if (chk) chk.onchange = () => {
      f.incluir = chk.checked;
      actualizarBotonGenerarKuder();
    };
    const inpColegio = fila.querySelector(".kuder-fila-colegio");
    if (inpColegio) inpColegio.oninput = () => (f.colegio = inpColegio.value);
    const inpCurso = fila.querySelector(".kuder-fila-curso");
    if (inpCurso) inpCurso.oninput = () => (f.curso = inpCurso.value);
  });

  const avisos = lecturas.flatMap((l) => [
    ...l.errores.map((texto) => ({ texto: `${l.archivoNombre}: ${texto}`, tipo: "error" })),
    // un test mal traspasado cuyo error no cambia los resultados ("ℹ️") va en gris; el
    // que sí podría cambiarlos ("⚠"), en amarillo
    ...l.advertencias.map((texto) => ({ texto: `${l.archivoNombre}: ${texto}`, tipo: texto.startsWith("ℹ") ? "info" : "advertencia" })),
  ]);
  // el mismo curso dos veces (por ejemplo, subido como archivo y elegido de la app): se contaría doble
  fuentesRepetidas(lecturas.filter((l) => l.estudiantes.length)).forEach(([a, b]) =>
    avisos.unshift({ texto: `⚠ "${a.archivoNombre}" y "${b.archivoNombre}" traen a los mismos estudiantes: en un informe global se contarían dos veces. Quita uno con su ✕.`, tipo: "advertencia" })
  );
  const contAvisos = document.getElementById("kuder-rev-avisos");
  contAvisos.innerHTML = avisos.length
    ? `<ul class="kuder-avisos-lista">${avisos.map((a) => `<li class="${a.tipo}">${escaparHtmlKuder(a.texto)}</li>`).join("")}</ul>`
    : "";

  actualizarBotonGenerarKuder();
}

// refleja en los botones "Generar" cuántos cursos están marcados con la casilla
// ahora mismo: 1 solo curso marcado genera el informe de ese curso; 2 o más, el
// informe global de justo esos cursos (no necesariamente todos los de la lista). El
// botón de "por curso" siempre genera uno por curso marcado, sin sumarlos. 0
// marcados deshabilita ambos botones.
function actualizarBotonGenerarKuder() {
  const nSeleccionados = kuderEstadoActual.filter((f) => f.incluir && f.estudiantes.length > 0).length;

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
