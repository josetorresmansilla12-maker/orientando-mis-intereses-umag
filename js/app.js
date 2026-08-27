// Lógica de la interfaz: pestañas, formularios, tablas, deshacer/rehacer, descargas.

const STORAGE_KEY_CURSO = "orientando_intereses_curso_actual";

const estado = {
  tab: "ingresar",
  editandoId: null,
  filtros: { colegio: "", curso: "", letra: "", nombre: "" },
  filtrosPapelera: { colegio: "", curso: "", nombre: "" },
};

document.addEventListener("DOMContentLoaded", () => {
  cablearTabs();
  cablearTopbar();
  cablearCursoHeader();
  cablearFormulario();
  cablearImportacion();
  cablearModal();
  render();
});

// ---------------- utilidades UI ----------------

function mostrarToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("mostrar");
  clearTimeout(mostrarToast._t);
  mostrarToast._t = setTimeout(() => t.classList.remove("mostrar"), 2200);
}

// modal de confirmación genérico, para acciones destructivas importantes
function cablearModal() {
  document.getElementById("modal-btn-cancelar").addEventListener("click", cerrarModal);
  document.getElementById("modal-confirmacion").addEventListener("click", (ev) => {
    if (ev.target.id === "modal-confirmacion") cerrarModal();
  });
}

function cerrarModal() {
  document.getElementById("modal-confirmacion").style.display = "none";
}

function confirmarAccion({ titulo, texto, textoBoton = "Confirmar", onConfirmar }) {
  document.getElementById("modal-titulo").textContent = titulo;
  document.getElementById("modal-texto").textContent = texto;
  const btn = document.getElementById("modal-btn-confirmar");
  btn.textContent = textoBoton;
  btn.onclick = () => {
    cerrarModal();
    onConfirmar();
  };
  document.getElementById("modal-confirmacion").style.display = "flex";
}

function render() {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("activo", b.dataset.tab === estado.tab));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("activo", p.id === "panel-" + estado.tab));

  document.getElementById("btn-deshacer").disabled = !store.puedeDeshacer();
  document.getElementById("btn-rehacer").disabled = !store.puedeRehacer();

  if (estado.tab === "ingresar") renderDatosRecientes();
  if (estado.tab === "estudiantes") renderEstudiantes();
  if (estado.tab === "papelera") renderPapelera();
  if (estado.tab === "estadisticas") renderEstadisticas();
}

function cablearTabs() {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.addEventListener("click", () => {
      estado.tab = b.dataset.tab;
      render();
    });
  });
}

function cablearTopbar() {
  document.getElementById("btn-deshacer").addEventListener("click", () => {
    if (store.deshacer()) {
      mostrarToast("Se deshizo el último cambio");
      render();
      if (estado.tab === "ingresar") cancelarEdicion();
    }
  });
  document.getElementById("btn-rehacer").addEventListener("click", () => {
    if (store.rehacer()) {
      mostrarToast("Se rehizo el cambio");
      render();
    }
  });
  document.getElementById("btn-excel").addEventListener("click", () => {
    if (store.listar({ incluirPapelera: true }).length === 0) {
      mostrarToast("Todavía no hay estudiantes para respaldar");
      return;
    }
    exportarExcel();
    mostrarToast("Respaldo en Excel descargado");
  });

  document.getElementById("btn-borrar-todo").addEventListener("click", () => {
    const total = store.listar({ incluirPapelera: true }).length;
    if (total === 0) {
      mostrarToast("No hay datos guardados todavía");
      return;
    }
    confirmarAccion({
      titulo: "⚠ Borrar todos los datos",
      texto: `Esto elimina para siempre los ${total} estudiantes guardados (incluida la papelera). Esta acción no se puede deshacer una vez que cierres o recargues la página. ¿Seguro que quieres continuar?`,
      textoBoton: "Sí, borrar todo",
      onConfirmar: () => {
        store.borrarTodo();
        mostrarToast("Todos los datos fueron eliminados");
        render();
      },
    });
  });
}

// ---------------- datos del curso (fijos mientras se ingresa un curso completo) ----------------

function leerCursoHeader() {
  return {
    colegio: document.getElementById("curso-colegio").value.trim(),
    curso: document.getElementById("curso-curso").value.trim(),
    letra: document.getElementById("curso-letra").value.trim().toUpperCase(),
    fecha: document.getElementById("curso-fecha").value,
  };
}

function guardarCursoHeaderEnLocal() {
  localStorage.setItem(STORAGE_KEY_CURSO, JSON.stringify(leerCursoHeader()));
}

function cablearCursoHeader() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CURSO);
    if (raw) {
      const d = JSON.parse(raw);
      document.getElementById("curso-colegio").value = d.colegio || "";
      document.getElementById("curso-curso").value = d.curso || "";
      document.getElementById("curso-letra").value = d.letra || "";
      document.getElementById("curso-fecha").value = d.fecha || "";
    }
  } catch (e) {
    console.error("No se pudo cargar el curso guardado.", e);
  }

  ["curso-colegio", "curso-curso", "curso-letra", "curso-fecha"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener("change", guardarCursoHeaderEnLocal);
    el.addEventListener("input", renderDatosRecientes);
  });

  document.getElementById("btn-vaciar-curso").addEventListener("click", () => {
    if (!confirm("¿Vaciar los datos del curso (colegio, curso, letra y fecha)?")) return;
    document.getElementById("curso-colegio").value = "";
    document.getElementById("curso-curso").value = "";
    document.getElementById("curso-letra").value = "";
    document.getElementById("curso-fecha").value = "";
    guardarCursoHeaderEnLocal();
    renderDatosRecientes();
    mostrarToast("Datos del curso vaciados");
  });

  document.getElementById("btn-actualizar-recientes").addEventListener("click", renderDatosRecientes);
}

// ---------------- importación masiva desde planilla de corrección ----------------

function cablearImportacion() {
  const input = document.getElementById("input-planilla");
  const btn = document.getElementById("btn-elegir-planilla");
  const etiquetaArchivo = document.getElementById("nombre-archivo-planilla");

  btn.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const archivo = input.files[0];
    if (!archivo) return;

    const cursoHeader = leerCursoHeader();
    if (!cursoHeader.colegio || !cursoHeader.curso) {
      mostrarToast("Completa colegio y curso arriba antes de importar");
      input.value = "";
      return;
    }

    etiquetaArchivo.textContent = archivo.name;
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Importando…";

    try {
      const { importados, errores } = await importarPlanillaCorreccion(archivo, cursoHeader);
      if (importados > 0) {
        mostrarToast(
          `${importados} ${importados === 1 ? "estudiante importado" : "estudiantes importados"}` +
            (errores.length ? ` — ${errores.length} fila(s) con problemas` : "")
        );
      } else {
        mostrarToast("No se importó ningún estudiante desde este archivo.");
      }
      if (errores.length > 0) {
        alert("Algunas filas no se pudieron importar:\n\n" + errores.join("\n"));
      }
      render();
    } catch (err) {
      console.error(err);
      mostrarToast("No se pudo leer el archivo. ¿Es la planilla .xlsx correcta?");
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
      input.value = "";
    }
  });
}

// ---------------- pestaña: ingresar / editar ----------------

const CAMPOS_PUNTAJE = ["ciencias", "humanidades", "artistico", "tecnico", "salud", "administracion"];

function cablearFormulario() {
  const form = document.getElementById("form-estudiante");

  const cont = document.getElementById("campos-puntajes");
  cont.innerHTML = AREAS.map(
    (a) => `
    <div>
      <label>${a.icono} ${a.nombre} (0–8)</label>
      <input type="number" min="0" max="8" step="1" name="p_${a.id}" required />
    </div>`
  ).join("");

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    guardarDesdeFormulario();
  });

  document.getElementById("btn-cancelar-edicion").addEventListener("click", cancelarEdicion);
}

function limpiarValidacion() {
  document.querySelectorAll(".invalido").forEach((el) => el.classList.remove("invalido"));
}

function guardarDesdeFormulario() {
  const form = document.getElementById("form-estudiante");
  limpiarValidacion();

  let ok = true;
  const marcar = (el) => {
    el.classList.add("invalido");
    ok = false;
  };

  const cursoHeader = leerCursoHeader();
  if (!cursoHeader.colegio) marcar(document.getElementById("curso-colegio"));
  if (!cursoHeader.curso) marcar(document.getElementById("curso-curso"));

  const fd = new FormData(form);
  const nombre = (fd.get("nombre") || "").toString().trim();
  if (!nombre) marcar(form.querySelector('[name="nombre"]'));

  const puntajes = {};
  for (const id of CAMPOS_PUNTAJE) {
    const campo = form.querySelector(`[name="p_${id}"]`);
    const raw = fd.get("p_" + id);
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < PUNTAJE_MIN || n > PUNTAJE_MAX || !Number.isInteger(n)) {
      marcar(campo);
    } else {
      puntajes[id] = n;
    }
  }

  if (!ok) {
    mostrarToast("Revisa los campos marcados en rojo");
    return;
  }

  guardarCursoHeaderEnLocal();

  const datos = {
    nombre,
    colegio: cursoHeader.colegio,
    curso: cursoHeader.curso,
    letra: cursoHeader.letra,
    fecha: cursoHeader.fecha,
    rut: (fd.get("rut") || "").toString().trim(),
    puntajes,
  };

  if (estado.editandoId) {
    store.actualizar(estado.editandoId, datos);
    mostrarToast("Estudiante actualizado");
    cancelarEdicion();
  } else {
    store.crear(datos);
    mostrarToast("Estudiante guardado. Sigue con el próximo.");
    limpiarFormularioEstudiante();
  }

  render();
}

function limpiarFormularioEstudiante() {
  const form = document.getElementById("form-estudiante");
  form.reset();
  const nombreInput = form.querySelector('[name="nombre"]');
  nombreInput.focus();
}

// lista en vivo de los estudiantes ya ingresados para el colegio/curso/letra
// que se está cargando ahora mismo, para revisar visualmente que no falte nadie.
function renderDatosRecientes() {
  const cont = document.getElementById("datos-recientes");
  if (!cont) return;

  const cursoHeader = leerCursoHeader();
  if (!cursoHeader.colegio || !cursoHeader.curso) {
    cont.innerHTML = `<div class="vacio">Completa el colegio y el curso para ver aquí los estudiantes que vayas agregando.</div>`;
    return;
  }

  const delCurso = store
    .listar()
    .filter(
      (e) =>
        (e.colegio || "").trim().toLowerCase() === cursoHeader.colegio.trim().toLowerCase() &&
        (e.curso || "").trim().toLowerCase() === cursoHeader.curso.trim().toLowerCase() &&
        (e.letra || "").trim().toLowerCase() === cursoHeader.letra.trim().toLowerCase()
    )
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));

  if (delCurso.length === 0) {
    cont.innerHTML = `<div class="vacio">Todavía no has agregado estudiantes de ${cursoHeader.colegio} ${cursoHeader.curso}${cursoHeader.letra} en esta sesión.</div>`;
    return;
  }

  cont.innerHTML = `
    <table class="recientes-lista">
      <thead><tr><th>N°</th><th>Estudiante</th><th>Área(s) de interés</th><th></th></tr></thead>
      <tbody>
        ${delCurso
          .map((e, i) => {
            const areas = calcularAreasDeInteres(e.puntajes);
            const chips =
              areas.length > 0
                ? areas.map((a) => `<span class="chip">${a.icono} ${a.nombre}</span>`).join("")
                : `<span class="chip generico">Sin área destacada</span>`;
            return `
            <tr>
              <td>${i + 1}</td>
              <td>${e.nombre}</td>
              <td>${chips}</td>
              <td><button type="button" class="chico secundario" onclick="accionEditar('${e.id}')">Editar</button></td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    <p class="ayuda" style="margin-top:10px; margin-bottom:0;">${delCurso.length} ${delCurso.length === 1 ? "estudiante agregado" : "estudiantes agregados"} hasta ahora.</p>
  `;
}

function cargarEnFormulario(estudiante) {
  document.getElementById("curso-colegio").value = estudiante.colegio || "";
  document.getElementById("curso-curso").value = estudiante.curso || "";
  document.getElementById("curso-letra").value = estudiante.letra || "";
  document.getElementById("curso-fecha").value = estudiante.fecha || "";

  const form = document.getElementById("form-estudiante");
  form.nombre.value = estudiante.nombre || "";
  form.rut.value = estudiante.rut || "";
  for (const id of CAMPOS_PUNTAJE) {
    form.querySelector(`[name="p_${id}"]`).value = estudiante.puntajes[id];
  }
  estado.editandoId = estudiante.id;
  document.getElementById("titulo-form").textContent = "Editando a " + (estudiante.nombre || "estudiante");
  document.getElementById("btn-cancelar-edicion").style.display = "inline-block";
  document.getElementById("btn-guardar").textContent = "Guardar cambios";
  estado.tab = "ingresar";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelarEdicion() {
  estado.editandoId = null;
  limpiarFormularioEstudiante();
  document.getElementById("titulo-form").textContent = "Agregar estudiante";
  document.getElementById("btn-cancelar-edicion").style.display = "none";
  document.getElementById("btn-guardar").textContent = "Guardar y agregar siguiente";
}

// ---------------- pestaña: estudiantes (agrupado por colegio > curso) ----------------

function opcionesUnicas(lista, campo) {
  return [...new Set(lista.map((e) => e[campo]).filter(Boolean))].sort();
}

function coincideTexto(valor, busqueda) {
  return (valor || "").toLowerCase().includes(busqueda.toLowerCase());
}

function agrupar(lista) {
  // colegio -> "curso+letra" -> [estudiantes]
  const porColegio = new Map();
  for (const e of lista) {
    if (!porColegio.has(e.colegio)) porColegio.set(e.colegio, new Map());
    const porCurso = porColegio.get(e.colegio);
    const claveCurso = (e.curso || "—") + (e.letra || "");
    if (!porCurso.has(claveCurso)) porCurso.set(claveCurso, []);
    porCurso.get(claveCurso).push(e);
  }
  return porColegio;
}

function renderEstudiantes() {
  const todos = store.listar();

  const selColegio = document.getElementById("f-colegio");
  const selCurso = document.getElementById("f-curso");
  const selLetra = document.getElementById("f-letra");
  const inpNombre = document.getElementById("f-nombre");

  const rellenarSelect = (sel, valores, actual) => {
    sel.innerHTML = `<option value="">Todos</option>` + valores.map((v) => `<option value="${v}">${v}</option>`).join("");
    sel.value = actual;
  };
  rellenarSelect(selColegio, opcionesUnicas(todos, "colegio"), estado.filtros.colegio);
  rellenarSelect(selCurso, opcionesUnicas(todos, "curso"), estado.filtros.curso);
  rellenarSelect(selLetra, opcionesUnicas(todos, "letra"), estado.filtros.letra);
  inpNombre.value = estado.filtros.nombre;

  selColegio.onchange = () => { estado.filtros.colegio = selColegio.value; renderEstudiantes(); };
  selCurso.onchange = () => { estado.filtros.curso = selCurso.value; renderEstudiantes(); };
  selLetra.onchange = () => { estado.filtros.letra = selLetra.value; renderEstudiantes(); };
  inpNombre.oninput = () => { estado.filtros.nombre = inpNombre.value; renderEstudiantes(); };

  const filtrados = todos.filter(
    (e) =>
      (!estado.filtros.colegio || e.colegio === estado.filtros.colegio) &&
      (!estado.filtros.curso || e.curso === estado.filtros.curso) &&
      (!estado.filtros.letra || e.letra === estado.filtros.letra) &&
      (!estado.filtros.nombre || coincideTexto(e.nombre, estado.filtros.nombre))
  );

  document.getElementById("btn-descarga-masiva").disabled = filtrados.length === 0;
  document.getElementById("conteo-filtrados").textContent =
    filtrados.length + (filtrados.length === 1 ? " estudiante" : " estudiantes");

  document.getElementById("btn-descarga-masiva").onclick = () => descargarConProgreso(filtrados, document.getElementById("btn-descarga-masiva"));

  const cont = document.getElementById("grupos-estudiantes");
  if (filtrados.length === 0) {
    cont.innerHTML = `<div class="vacio">No hay estudiantes que coincidan con el filtro.</div>`;
    return;
  }

  const porColegio = agrupar(filtrados);
  const abrirSoloUno = porColegio.size === 1;

  let html = "";
  for (const [colegio, porCurso] of porColegio) {
    const totalColegio = [...porCurso.values()].reduce((n, arr) => n + arr.length, 0);
    const soloUnCurso = porCurso.size === 1;
    const idColegioDel = "delcol_" + btoa(unescape(encodeURIComponent(colegio))).replace(/[^a-zA-Z0-9]/g, "");
    html += `<details class="grupo-colegio" ${abrirSoloUno ? "open" : ""}>
      <summary>🏫 ${colegio} <span class="chip">${totalColegio} ${totalColegio === 1 ? "estudiante" : "estudiantes"}</span></summary>
      <div class="grupo-colegio-cont">
        <div style="margin-bottom:10px;">
          <button class="chico peligro" id="${idColegioDel}">🗑 Eliminar colegio completo</button>
        </div>`;

    for (const [claveCurso, estudiantesCurso] of porCurso) {
      const idGrupo = "grp_" + btoa(unescape(encodeURIComponent(colegio + "|" + claveCurso))).replace(/[^a-zA-Z0-9]/g, "");
      const idGrupoDel = "delcurso_" + btoa(unescape(encodeURIComponent(colegio + "|" + claveCurso))).replace(/[^a-zA-Z0-9]/g, "");
      html += `<details class="grupo-curso" ${soloUnCurso ? "open" : ""}>
        <summary>📘 ${claveCurso} <span class="chip">${estudiantesCurso.length}</span></summary>
        <div class="grupo-curso-cont">
          <div style="margin-bottom:10px; display:flex; gap:8px; flex-wrap:wrap;">
            <button class="chico" id="${idGrupo}">⬇ Descargar este curso (ZIP)</button>
            <button class="chico peligro" id="${idGrupoDel}">🗑 Eliminar curso completo</button>
          </div>
          <table class="lista">
            <thead><tr><th>Estudiante</th><th>Área(s) de interés</th><th>Acciones</th></tr></thead>
            <tbody>
              ${estudiantesCurso
                .map((e) => {
                  const areas = calcularAreasDeInteres(e.puntajes);
                  const chips =
                    areas.length > 0
                      ? areas.map((a) => `<span class="chip">${a.icono} ${a.nombre}</span>`).join("")
                      : `<span class="chip generico">Sin área destacada</span>`;
                  return `
                  <tr>
                    <td><strong>${e.nombre}</strong><br/><span style="color:#6a6178;font-size:11px;">${e.rut || ""}</span></td>
                    <td>${chips}</td>
                    <td>
                      <div class="fila-acciones">
                        <button class="chico secundario" onclick="accionEditar('${e.id}')">Editar</button>
                        <button class="chico" onclick="accionDescargar('${e.id}')">Descargar PDF</button>
                        <button class="chico peligro" onclick="accionEliminar('${e.id}')">Eliminar</button>
                      </div>
                    </td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </details>`;
    }
    html += `</div></details>`;
  }
  cont.innerHTML = html;

  // botones de descarga y de eliminación grupal (se cablean después de insertar el HTML)
  for (const [colegio, porCurso] of porColegio) {
    const idsColegio = [...porCurso.values()].flat().map((e) => e.id);
    const idColegioDel = "delcol_" + btoa(unescape(encodeURIComponent(colegio))).replace(/[^a-zA-Z0-9]/g, "");
    const btnDelColegio = document.getElementById(idColegioDel);
    if (btnDelColegio) {
      btnDelColegio.onclick = () => accionEliminarGrupo(`el colegio "${colegio}" completo`, idsColegio);
    }

    for (const [claveCurso, estudiantesCurso] of porCurso) {
      const idGrupo = "grp_" + btoa(unescape(encodeURIComponent(colegio + "|" + claveCurso))).replace(/[^a-zA-Z0-9]/g, "");
      const btn = document.getElementById(idGrupo);
      if (btn) btn.onclick = () => descargarConProgreso(estudiantesCurso, btn);

      const idGrupoDel = "delcurso_" + btoa(unescape(encodeURIComponent(colegio + "|" + claveCurso))).replace(/[^a-zA-Z0-9]/g, "");
      const btnDel = document.getElementById(idGrupoDel);
      if (btnDel) {
        btnDel.onclick = () =>
          accionEliminarGrupo(`el curso "${colegio} - ${claveCurso}"`, estudiantesCurso.map((e) => e.id));
      }
    }
  }
}

function accionEliminarGrupo(descripcion, ids) {
  if (!ids || ids.length === 0) return;
  confirmarAccion({
    titulo: "⚠ Eliminar grupo completo",
    texto: `Esto envía a la papelera a los ${ids.length} estudiantes de ${descripcion}. Podrás recuperarlos después desde la pestaña "Papelera", o deshacer esta acción ahora mismo con el botón "Deshacer" de arriba. ¿Continuar?`,
    textoBoton: "Sí, eliminar",
    onConfirmar: () => {
      store.moverVariosAPapelera(ids);
      mostrarToast(`${ids.length} estudiantes enviados a la papelera`);
      render();
    },
  });
}

async function descargarConProgreso(lista, btn) {
  if (!lista || lista.length === 0) return;
  const original = btn.textContent;
  btn.disabled = true;
  await descargarInformesMasivo(lista, (hecho, total) => {
    btn.textContent = `Generando ${hecho}/${total}…`;
  });
  btn.textContent = original;
  btn.disabled = false;
  mostrarToast("Descarga lista (" + lista.length + (lista.length === 1 ? " informe)" : " informes)"));
}

function accionEditar(id) {
  const e = store.obtener(id);
  if (e) cargarEnFormulario(e);
}

async function accionDescargar(id) {
  const e = store.obtener(id);
  if (!e) return;
  mostrarToast("Generando informe…");
  try {
    await descargarInformeIndividual(e);
    mostrarToast("Informe descargado");
  } catch (err) {
    console.error(err);
    mostrarToast("No se pudo generar el informe. Revisa el mensaje en la consola.");
  }
}

function accionEliminar(id) {
  const e = store.obtener(id);
  if (!e) return;
  if (!confirm(`¿Enviar a la papelera a ${e.nombre}? Podrás recuperarlo después.`)) return;
  store.moverAPapelera(id);
  mostrarToast("Estudiante enviado a la papelera");
  render();
}

// ---------------- pestaña: papelera ----------------

function renderPapelera() {
  const enPapelera = store.listar({ incluirPapelera: true }).filter((e) => e.eliminado);

  const selColegio = document.getElementById("p-colegio");
  const selCurso = document.getElementById("p-curso");
  const inpNombre = document.getElementById("p-nombre");

  const rellenarSelect = (sel, valores, actual) => {
    sel.innerHTML = `<option value="">Todos</option>` + valores.map((v) => `<option value="${v}">${v}</option>`).join("");
    sel.value = actual;
  };
  rellenarSelect(selColegio, opcionesUnicas(enPapelera, "colegio"), estado.filtrosPapelera.colegio);
  rellenarSelect(selCurso, opcionesUnicas(enPapelera, "curso"), estado.filtrosPapelera.curso);
  inpNombre.value = estado.filtrosPapelera.nombre;

  selColegio.onchange = () => { estado.filtrosPapelera.colegio = selColegio.value; renderPapelera(); };
  selCurso.onchange = () => { estado.filtrosPapelera.curso = selCurso.value; renderPapelera(); };
  inpNombre.oninput = () => { estado.filtrosPapelera.nombre = inpNombre.value; renderPapelera(); };

  const filtrados = enPapelera.filter(
    (e) =>
      (!estado.filtrosPapelera.colegio || e.colegio === estado.filtrosPapelera.colegio) &&
      (!estado.filtrosPapelera.curso || e.curso === estado.filtrosPapelera.curso) &&
      (!estado.filtrosPapelera.nombre || coincideTexto(e.nombre, estado.filtrosPapelera.nombre))
  );

  document.getElementById("btn-vaciar-papelera").disabled = enPapelera.length === 0;

  const cont = document.getElementById("lista-papelera");
  if (filtrados.length === 0) {
    cont.innerHTML = `<div class="vacio">${enPapelera.length === 0 ? "La papelera está vacía." : "Ningún estudiante en la papelera coincide con el filtro."}</div>`;
  } else {
    cont.innerHTML = `
      <table class="lista">
        <thead><tr><th>Nombre</th><th>Colegio</th><th>Curso</th><th>Acciones</th></tr></thead>
        <tbody>
          ${filtrados
            .map(
              (e) => `
            <tr>
              <td>${e.nombre}</td>
              <td>${e.colegio}</td>
              <td>${(e.curso || "") + (e.letra || "")}</td>
              <td class="fila-acciones">
                <button class="chico" onclick="accionRestaurar('${e.id}')">Restaurar</button>
                <button class="chico peligro" onclick="accionEliminarDefinitivo('${e.id}')">Eliminar para siempre</button>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  document.getElementById("btn-vaciar-papelera").onclick = () => {
    if (!confirm("Esto elimina para siempre a todos los estudiantes en la papelera (aunque estén filtrados). ¿Continuar?")) return;
    store.vaciarPapelera();
    mostrarToast("Papelera vaciada");
    render();
  };
}

function accionRestaurar(id) {
  store.restaurar(id);
  mostrarToast("Estudiante restaurado");
  render();
}

function accionEliminarDefinitivo(id) {
  if (!confirm("Esto elimina al estudiante para siempre, sin poder recuperarlo. ¿Continuar?")) return;
  store.eliminarDefinitivo(id);
  mostrarToast("Estudiante eliminado definitivamente");
  render();
}

// ---------------- pestaña: estadísticas ----------------

function renderEstadisticas() {
  const todos = store.listar();
  document.getElementById("stat-total").textContent = todos.length;
  document.getElementById("stat-informes").textContent = store.contadorInformes;

  const conArea = todos.filter((e) => calcularAreasDeInteres(e.puntajes).length > 0).length;
  const sinArea = todos.length - conArea;
  document.getElementById("stat-con-area").textContent = conArea;
  document.getElementById("stat-sin-area").textContent = sinArea;

  const colegios = opcionesUnicas(todos, "colegio").length;
  document.getElementById("stat-colegios").textContent = colegios;

  const conteoPorArea = {};
  AREAS.forEach((a) => (conteoPorArea[a.id] = 0));
  todos.forEach((e) => {
    calcularAreasDeInteres(e.puntajes).forEach((a) => conteoPorArea[a.id]++);
  });
  const maxConteo = Math.max(1, ...Object.values(conteoPorArea));

  document.getElementById("barras-areas").innerHTML = AREAS.map((a) => {
    const c = conteoPorArea[a.id];
    const pct = Math.round((c / maxConteo) * 100);
    return `
      <div class="barra-area">
        <div class="etiqueta-area"><span>${a.icono} ${a.nombre}</span><span>${c}</span></div>
        <div class="barra-fondo"><div class="barra-rellena" style="width:${pct}%"></div></div>
      </div>`;
  }).join("");

  renderDesglose("desglose-colegio", contarPorCampo(todos, "colegio"), "colegio");
  renderDesglose("desglose-fecha", contarPorCampo(todos, "fecha", fmtFecha), "fecha de aplicación");
}

// cuenta estudiantes agrupados por un campo (ej: colegio, fecha), ordenado de mayor a menor
function contarPorCampo(lista, campo, formatear) {
  const conteo = new Map();
  lista.forEach((e) => {
    const clave = e[campo] || "Sin dato";
    conteo.set(clave, (conteo.get(clave) || 0) + 1);
  });
  return [...conteo.entries()]
    .map(([clave, cantidad]) => ({ etiqueta: formatear ? formatear(clave) : clave, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

function renderDesglose(idContenedor, filas, nombreCampo) {
  const cont = document.getElementById(idContenedor);
  if (filas.length === 0) {
    cont.innerHTML = `<div class="vacio">Todavía no hay datos de ${nombreCampo}.</div>`;
    return;
  }
  cont.innerHTML = `
    <table class="desglose-tabla">
      <tbody>
        ${filas.map((f) => `<tr><td>${f.etiqueta}</td><td class="cant">${f.cantidad}</td></tr>`).join("")}
      </tbody>
    </table>`;
}
