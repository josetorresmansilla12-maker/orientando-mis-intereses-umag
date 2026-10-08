// "📚 Elegir cursos de la app": ventana para elegir cursos que ya están cargados en la
// app (en vez de volver a descargar y subir sus CSV), en "Informes para orientadores"
// (informe de un curso, global o por curso) y en "Uso interno". Cada curso elegido
// queda en la lista de esa pestaña junto a los archivos subidos, con su ✕ para quitarlo.
//
// Los estudiantes de un curso elegido se leen de la app recién al generar el informe:
// si a última hora se corrige un puntaje o un nombre (con "✏️ Ver o editar en la app"),
// el informe sale con el cambio. Se recuerdan sus estudiantes por id, así el curso no
// se pierde aunque después se le cambie el nombre al colegio o al curso.

let selectorCursosEstado = null; // { cursos, elegidos: Set(clave), yaAgregados: Set(clave), onAgregar }

// ---------------- cursos elegidos ("fuentes" de un informe) ----------------

let contadorFuentes = 0;

// un curso de la app, listo para la lista de una pestaña de informes
function crearFuenteApp(curso) {
  return {
    uid: `f${++contadorFuentes}`,
    origen: "app",
    clave: curso.clave,
    ids: new Set(curso.estudiantes.map((e) => e.id)),
    colegio: curso.colegio,
    curso: etiquetaCursoGuardado(curso),
    archivoNombre: `${curso.colegio || "Sin colegio"} · ${etiquetaCursoGuardado(curso)}`,
    estudiantes: curso.estudiantes,
    errores: [],
    advertencias: [],
    incluir: true,
  };
}

// un archivo leído, para la misma lista
function crearFuenteArchivo(lectura, archivo) {
  return {
    uid: `f${++contadorFuentes}`,
    origen: "archivo",
    firma: archivo ? `${archivo.name}|${archivo.size}|${archivo.lastModified}` : "",
    incluir: true,
    ...lectura,
  };
}

// estudiantes de un curso elegido, con los datos que hay AHORA en la app (los de un
// archivo, tal como se leyeron)
function estudiantesDeFuente(fuente, storeDelTest) {
  if (fuente.origen !== "app") return fuente.estudiantes;
  return storeDelTest.listar().filter((e) => fuente.ids.has(e.id) || claveCursoGuardado(e) === fuente.clave);
}

// vuelve a leer de la app los estudiantes de los cursos elegidos (al volver a la pestaña)
function refrescarFuentesApp(fuentes, storeDelTest) {
  fuentes.forEach((f) => {
    if (f.origen === "app") f.estudiantes = estudiantesDeFuente(f, storeDelTest);
  });
}

// texto bajo el nombre de un curso elegido de la app
function infoFuenteApp(fuente) {
  const n = fuente.estudiantes.length;
  const pendientes = typeof pendienteTraspaso === "function" ? fuente.estudiantes.filter((e) => pendienteTraspaso(e)).length : 0;
  if (!n) return `<span class="fuente-app-vacia">⚠ Este curso ya no tiene estudiantes en la app (¿se eliminó?). Quítalo con su ✕.</span>`;
  return `${n} ${n === 1 ? "estudiante" : "estudiantes"} en la app${pendientes ? ` · <span class="fuente-pendientes">⚠ ${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"} por revisar</span>` : ""}`;
}

// dos fuentes que traen a los mismos estudiantes (el mismo curso subido dos veces, o
// subido como archivo y elegido además desde la app): se contarían dos veces en el
// informe. Se compara por RUT y, si no hay RUT, por nombre.
function fuentesRepetidas(fuentes) {
  const claves = fuentes.map((f) => new Set(f.estudiantes.map((e) => claveRut(e.rut) || `n:${claveNombre(e.nombre)}`)));
  const pares = [];
  for (let i = 0; i < fuentes.length; i++) {
    for (let j = i + 1; j < fuentes.length; j++) {
      const a = claves[i];
      const b = claves[j];
      if (!a.size || !b.size) continue;
      let comunes = 0;
      a.forEach((k) => b.has(k) && comunes++);
      if (comunes / Math.min(a.size, b.size) >= 0.5) pares.push([fuentes[i], fuentes[j], comunes]);
    }
  }
  return pares;
}

// "✏️ Ver o editar en la app": lleva a "Estudiantes e informes" con ese curso filtrado
function irACursoEnApp(fuente) {
  const st = cfg().store;
  const alguno = estudiantesDeFuente(fuente, st)[0];
  if (!alguno) return mostrarToast("Ese curso ya no tiene estudiantes en la app");
  estado.filtros = { colegio: alguno.colegio || "", curso: alguno.curso || "", letra: alguno.letra || "", nombre: "", soloTraspaso: false };
  estado.gruposCerrados.clear();
  estado.tab = "estudiantes";
  render();
  document.querySelector(".tabs").scrollIntoView({ block: "start" });
  mostrarToast("Edita lo que necesites y vuelve a la pestaña del informe: se genera con los datos nuevos");
}

// ---------------- ventana para elegir ----------------

// opciones: { titulo, ayuda, yaAgregados: Set(clave), onAgregar(cursos) }
function abrirSelectorCursos({ titulo, ayuda, yaAgregados = new Set(), onAgregar }) {
  const cursos = cursosDelStore(cfg().store);
  if (!cursos.length) {
    mostrarToast(`Todavía no hay cursos del ${cfg().nombre} cargados en la app`);
    return;
  }
  selectorCursosEstado = { cursos, elegidos: new Set(), yaAgregados, onAgregar };
  document.getElementById("sc-titulo").textContent = titulo || "📚 Elige cursos cargados en la app";
  document.getElementById("sc-ayuda").innerHTML = ayuda || "";
  const colegios = [...new Set(cursos.map((c) => c.colegio))];
  const sel = document.getElementById("sc-colegio");
  sel.innerHTML = `<option value="">Todos los colegios (${colegios.length})</option>` + colegios.map((c) => `<option value="${escaparHtml(c)}">${escaparHtml(c || "Sin colegio")}</option>`).join("");
  sel.value = colegios.length === 1 ? colegios[0] : "";
  document.getElementById("sc-buscar").value = "";
  renderSelectorCursos();
  document.getElementById("modal-selector-cursos").style.display = "flex";
}

function cursosVisiblesSelector() {
  const { cursos } = selectorCursosEstado;
  const colegio = document.getElementById("sc-colegio").value;
  const buscar = normalizarTexto(document.getElementById("sc-buscar").value);
  return cursos.filter(
    (c) =>
      (!colegio || c.colegio === colegio) &&
      (!buscar || normalizarTexto(`${c.colegio} ${etiquetaCursoGuardado(c)}`).includes(buscar))
  );
}

function renderSelectorCursos() {
  const st = selectorCursosEstado;
  if (!st) return;
  const visibles = cursosVisiblesSelector();
  const porColegio = new Map();
  visibles.forEach((c) => {
    if (!porColegio.has(c.colegio)) porColegio.set(c.colegio, []);
    porColegio.get(c.colegio).push(c);
  });
  const lista = document.getElementById("sc-lista");
  lista.innerHTML = visibles.length
    ? [...porColegio]
        .map(([colegio, cursosColegio]) => {
          const elegibles = cursosColegio.filter((c) => !st.yaAgregados.has(c.clave));
          const todos = elegibles.length > 0 && elegibles.every((c) => st.elegidos.has(c.clave));
          const nEst = cursosColegio.reduce((acc, c) => acc + c.estudiantes.length, 0);
          return `
          <div class="sc-colegio">
            <label class="sc-colegio-titulo">
              <input type="checkbox" class="sc-chk-colegio" data-colegio="${escaparHtml(colegio)}" ${todos ? "checked" : ""} ${elegibles.length ? "" : "disabled"} />
              🏫 ${escaparHtml(colegio || "Sin colegio")}
              <span class="chip">${cursosColegio.length} ${cursosColegio.length === 1 ? "curso" : "cursos"} · ${nEst} est.</span>
              <span class="sc-colegio-todo">${elegibles.length ? "marcar todo el colegio" : ""}</span>
            </label>
            <div class="sc-cursos">
              ${cursosColegio
                .map((c) => {
                  const ya = st.yaAgregados.has(c.clave);
                  const pendientes = c.estudiantes.filter((e) => pendienteTraspaso(e)).length;
                  return `
                  <label class="sc-curso${ya ? " sc-curso--ya" : ""}">
                    <input type="checkbox" class="sc-chk-curso" data-clave="${escaparHtml(c.clave)}" ${ya || st.elegidos.has(c.clave) ? "checked" : ""} ${ya ? "disabled" : ""} />
                    <span class="sc-curso-nombre">📘 ${escaparHtml(etiquetaCursoGuardado(c))}</span>
                    <span class="sc-curso-n">${c.estudiantes.length} est.</span>
                    ${pendientes ? `<span class="chip chip-traspaso">⚠ ${pendientes}</span>` : ""}
                    ${ya ? `<span class="chip">ya está en la lista</span>` : ""}
                  </label>`;
                })
                .join("")}
            </div>
          </div>`;
        })
        .join("")
    : `<div class="vacio" style="padding:20px;">Ningún curso coincide con la búsqueda.</div>`;

  lista.querySelectorAll(".sc-chk-curso").forEach((chk) => {
    chk.onchange = () => {
      if (chk.checked) st.elegidos.add(chk.dataset.clave);
      else st.elegidos.delete(chk.dataset.clave);
      renderSelectorCursos();
    };
  });
  lista.querySelectorAll(".sc-chk-colegio").forEach((chk) => {
    chk.onchange = () => {
      st.cursos
        .filter((c) => c.colegio === chk.dataset.colegio && !st.yaAgregados.has(c.clave))
        .forEach((c) => (chk.checked ? st.elegidos.add(c.clave) : st.elegidos.delete(c.clave)));
      renderSelectorCursos();
    };
  });

  const elegidos = st.cursos.filter((c) => st.elegidos.has(c.clave));
  const nEst = elegidos.reduce((acc, c) => acc + c.estudiantes.length, 0);
  document.getElementById("sc-resumen").textContent = elegidos.length
    ? `${elegidos.length} ${elegidos.length === 1 ? "curso elegido" : "cursos elegidos"} (${nEst} estudiantes)`
    : "Marca los cursos que quieres usar";
  const btn = document.getElementById("sc-agregar");
  btn.disabled = elegidos.length === 0;
  btn.textContent = elegidos.length > 1 ? `Agregar ${elegidos.length} cursos` : "Agregar curso";
}

function cerrarSelectorCursos() {
  document.getElementById("modal-selector-cursos").style.display = "none";
  selectorCursosEstado = null;
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("modal-selector-cursos");
  if (!modal) return;
  document.getElementById("sc-colegio").addEventListener("change", renderSelectorCursos);
  document.getElementById("sc-buscar").addEventListener("input", renderSelectorCursos);
  document.getElementById("sc-todos").addEventListener("click", () => {
    const st = selectorCursosEstado;
    cursosVisiblesSelector()
      .filter((c) => !st.yaAgregados.has(c.clave))
      .forEach((c) => st.elegidos.add(c.clave));
    renderSelectorCursos();
  });
  document.getElementById("sc-ninguno").addEventListener("click", () => {
    selectorCursosEstado.elegidos.clear();
    renderSelectorCursos();
  });
  document.getElementById("sc-cancelar").addEventListener("click", cerrarSelectorCursos);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) cerrarSelectorCursos();
  });
  modal.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") cerrarSelectorCursos();
  });
  document.getElementById("sc-agregar").addEventListener("click", () => {
    const st = selectorCursosEstado;
    if (!st) return;
    const elegidos = st.cursos.filter((c) => st.elegidos.has(c.clave));
    const onAgregar = st.onAgregar;
    cerrarSelectorCursos();
    if (elegidos.length) onAgregar(elegidos);
  });
});
