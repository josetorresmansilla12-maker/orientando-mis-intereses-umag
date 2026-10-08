// "📦 Importación masiva" (pestaña "Ingresar datos"): cargar de una vez las planillas
// de muchos cursos — por ejemplo, el ZIP de CSV que un compañero descarga desde su app
// ("Uso interno" → "Descargar todos los CSV") — sin duplicar lo que ya está cargado.
//
// 1. Se eligen los archivos (CSV, Excel, un ZIP con ellos o una carpeta completa).
// 2. Cada archivo se compara con lo que ya hay en la app: cada estudiante se busca por
//    RUT (en todos los colegios) y, si alguno no tiene RUT, por nombre (en su curso o en
//    un colegio con el mismo nombre). Así se sabe si el archivo es nuevo, si ya estaba
//    cargado tal cual o si trae diferencias (puntajes o nombres distintos).
// 3. Si hay diferencias, se recomienda qué versión conservar: la que tiene menos tests
//    mal traspasados (que no suman 45) y, si empatan, la más reciente.
// 4. Se marcan los archivos a subir y se importan todos juntos, en un solo paso de
//    "Deshacer". Los estudiantes que ya estaban nunca se duplican: se actualizan (si se
//    elige el archivo) o se dejan como están.

const masiva = { items: [], contador: 0 };

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("masiva-input");
  if (!input) return;
  const inputCarpeta = document.getElementById("masiva-input-carpeta");
  document.getElementById("masiva-btn-archivos").addEventListener("click", () => input.click());
  document.getElementById("masiva-btn-carpeta").addEventListener("click", () => inputCarpeta.click());
  input.addEventListener("change", async () => {
    await agregarArchivosMasiva(Array.from(input.files || []));
    input.value = "";
  });
  inputCarpeta.addEventListener("change", async () => {
    await agregarArchivosMasiva(Array.from(inputCarpeta.files || []));
    inputCarpeta.value = "";
  });
});

// al cambiar de test, la lista se vacía (eran planillas del otro test)
function reiniciarMasiva() {
  masiva.items = [];
  renderResumenMasiva();
  const aviso = document.getElementById("masiva-aviso-final");
  if (aviso) aviso.innerHTML = "";
}

const EXTENSION_PLANILLA = /\.(csv|xlsx|xls)$/i;

function esArchivoOculto(nombre) {
  const base = nombre.split("/").pop();
  return !base || base.startsWith(".") || base.startsWith("~$") || nombre.includes("__MACOSX/");
}

// lista plana de planillas: { nombre, buffer, fecha (ms), firma }; los ZIP se abren
async function extraerPlanillas(archivos) {
  const planillas = [];
  let ignorados = 0;
  for (const archivo of archivos) {
    const nombre = archivo.webkitRelativePath || archivo.name;
    if (esArchivoOculto(nombre)) continue;
    if (/\.zip$/i.test(nombre)) {
      try {
        const zip = await JSZip.loadAsync(await archivo.arrayBuffer());
        const entradas = Object.values(zip.files).filter((f) => !f.dir && EXTENSION_PLANILLA.test(f.name) && !esArchivoOculto(f.name));
        for (const entrada of entradas) {
          const buffer = await entrada.async("arraybuffer");
          planillas.push({ nombre: `${archivo.name} › ${entrada.name}`, buffer, fecha: entrada.date ? entrada.date.getTime() : archivo.lastModified, firma: `${archivo.name}|${entrada.name}|${buffer.byteLength}` });
        }
        if (!entradas.length) ignorados++;
      } catch (err) {
        console.error(err);
        planillas.push({ nombre: archivo.name, buffer: null, fecha: archivo.lastModified, firma: `${nombre}|${archivo.size}`, error: "No se pudo abrir este ZIP." });
      }
    } else if (EXTENSION_PLANILLA.test(nombre)) {
      planillas.push({ nombre, buffer: await archivo.arrayBuffer(), fecha: archivo.lastModified, firma: `${nombre}|${archivo.size}|${archivo.lastModified}` });
    } else {
      ignorados++;
    }
  }
  return { planillas, ignorados };
}

async function agregarArchivosMasiva(archivos) {
  if (!archivos.length) return;
  const c = cfg();
  const btn = document.getElementById("masiva-btn-archivos");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Leyendo…";
  try {
    const { planillas, ignorados } = await extraerPlanillas(archivos);
    const firmas = new Set(masiva.items.map((it) => it.firma));
    let repetidos = 0;
    for (const [i, p] of planillas.entries()) {
      if (planillas.length > 20) btn.textContent = `Leyendo ${i + 1}/${planillas.length}…`;
      if (firmas.has(p.firma)) {
        repetidos++;
        continue;
      }
      firmas.add(p.firma);
      let lectura = null;
      let error = p.error || "";
      if (p.buffer) {
        try {
          lectura = c.leerPlanilla(p.buffer);
          if (!lectura.estudiantes.length) {
            const otro = Object.values(TESTS).find((t) => t.id !== c.id);
            let esDelOtro = false;
            try {
              esDelOtro = otro.leerPlanilla(p.buffer).estudiantes.length > 0;
            } catch (e) {
              // tampoco es del otro test
            }
            error = esDelOtro ? `Parece una planilla del ${otro.nombre}: elige ese test arriba y vuelve a subirla.` : (lectura.errores || [])[0] || "No se encontraron estudiantes válidos.";
          }
        } catch (err) {
          console.error(err);
          error = c.errorLectura;
        }
      }
      masiva.items.push({ uid: `m${++masiva.contador}`, nombre: p.nombre, fecha: p.fecha, firma: p.firma, lectura, error, marcado: false, tocado: false, datosEditados: false, datos: null, accion: "agregar" });
    }
    const avisos = [];
    if (repetidos) avisos.push(`${repetidos === 1 ? "1 archivo ya estaba" : `${repetidos} archivos ya estaban`} en la lista`);
    if (ignorados) avisos.push(`se ignoraron ${ignorados} que no son planillas`);
    if (avisos.length) mostrarToast(avisos.join(" · "));
    renderResumenMasiva();
    const rev = document.getElementById("masiva-revision");
    if (rev && masiva.items.length) rev.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------------- comparar un archivo con lo que hay en la app ----------------

// curso de la app donde está la mayoría de "estudiantes"
function cursoMayoritario(estudiantes) {
  const conteo = new Map();
  estudiantes.forEach((e) => {
    const k = claveCursoGuardado(e);
    conteo.set(k, { e, n: (conteo.get(k)?.n || 0) + 1 });
  });
  const mejor = [...conteo.values()].sort((a, b) => b.n - a.n)[0];
  return mejor ? { colegio: mejor.e.colegio || "", curso: mejor.e.curso || "", letra: mejor.e.letra || "" } : null;
}

// empareja a los estudiantes de un archivo con los de la app (activos): por RUT y, si
// uno de los dos no tiene RUT, por nombre dentro de su curso o de un colegio con el
// mismo nombre. Devuelve { pares: [{ archivo, app, por }], nuevos: [...], curso }.
function emparejarConApp(estudiantesArchivo, activos, colegioArchivo) {
  const porRut = new Map();
  const porNombre = new Map();
  activos.forEach((e) => {
    const kr = claveRut(e.rut);
    if (kr && !porRut.has(kr)) porRut.set(kr, e);
    const kn = claveNombre(e.nombre);
    if (!porNombre.has(kn)) porNombre.set(kn, []);
    porNombre.get(kn).push(e);
  });
  const usados = new Set();
  const pares = [];
  const pendientes = [];
  estudiantesArchivo.forEach((fe) => {
    const app = porRut.get(claveRut(fe.rut));
    if (app && !usados.has(app.id)) {
      usados.add(app.id);
      pares.push({ archivo: fe, app, por: "rut" });
    } else pendientes.push(fe);
  });
  const curso = cursoMayoritario(pares.map((p) => p.app));
  const nuevos = [];
  pendientes.forEach((fe) => {
    const kr = claveRut(fe.rut);
    const candidatos = (porNombre.get(claveNombre(fe.nombre)) || []).filter(
      (e) =>
        !usados.has(e.id) &&
        (!kr || !claveRut(e.rut)) && // si los dos tienen RUT y no coincide, son personas distintas
        ((curso && claveCursoGuardado(e) === claveCursoGuardado(curso)) || (colegioArchivo && parecidoColegios(e.colegio, colegioArchivo)))
    );
    if (candidatos.length === 1) {
      usados.add(candidatos[0].id);
      pares.push({ archivo: fe, app: candidatos[0], por: "nombre" });
    } else nuevos.push(fe);
  });
  return { pares, nuevos, curso: curso || cursoMayoritario(pares.map((p) => p.app)) };
}

function puntajesIguales(a, b, areas) {
  return areas.every((ar) => Number(a[ar.id]) === Number(b[ar.id]));
}

function sumaPuntajes(p, areas) {
  return areas.reduce((acc, ar) => acc + (Number(p[ar.id]) || 0), 0);
}

// qué cambia entre la versión de la app y la del archivo de un mismo estudiante
function diferenciasPar({ archivo, app }, c) {
  const difs = [];
  if (!puntajesIguales(archivo.puntajes, app.puntajes, c.areas)) {
    const areas = c.areas.filter((ar) => Number(archivo.puntajes[ar.id]) !== Number(app.puntajes[ar.id])).map((ar) => `${ar.nombre} ${app.puntajes[ar.id]}→${archivo.puntajes[ar.id]}`);
    const sumas = c.revisarTraspaso ? ` (suma: app ${sumaPuntajes(app.puntajes, c.areas)} · archivo ${sumaPuntajes(archivo.puntajes, c.areas)})` : "";
    difs.push(`puntajes: ${areas.join(", ")}${sumas}`);
  }
  if (claveNombre(archivo.nombre) !== claveNombre(app.nombre)) difs.push(`nombre: "${app.nombre}" → "${archivo.nombre}"`);
  if (claveRut(archivo.rut) && !claveRut(app.rut)) difs.push("el archivo agrega su RUT");
  return difs;
}

// test mal traspasado (no suma 45) de un estudiante del archivo / de la app
function archivoMalTraspasado(fe) {
  const c = cfg();
  return !!(c.revisarTraspaso && c.revisarTraspaso(fe.puntajes).estado !== "ok");
}

function analizarItemMasiva(item, anteriores) {
  const c = cfg();
  const ests = item.lectura ? item.lectura.estudiantes : [];
  if (item.error || !ests.length) {
    item.analisis = { tipo: "error" };
    if (!item.tocado) item.marcado = false;
    return;
  }
  const emp = emparejarConApp(ests, c.store.listar(), item.lectura.colegio);
  const conDif = emp.pares.map((p) => ({ ...p, difs: diferenciasPar(p, c) })).filter((p) => p.difs.length);
  const penApp = conDif.filter((p) => pendienteTraspaso(p.app)).length;
  const penArchivo = conDif.filter((p) => archivoMalTraspasado(p.archivo)).length;
  const fechaApp = conDif.reduce((max, p) => (p.app.actualizadoEn > max ? p.app.actualizadoEn : max), "");
  const archivoMasReciente = item.fecha && fechaApp ? new Date(item.fecha).toISOString() > fechaApp : false;

  // el mismo curso que otro archivo de esta misma lista (subido dos veces)
  const claves = new Set(ests.map((e) => claveRut(e.rut) || `n:${claveNombre(e.nombre)}`));
  const repiteA = anteriores.find((otro) => {
    if (!otro.lectura || !otro.lectura.estudiantes.length) return false;
    let comunes = 0;
    otro.lectura.estudiantes.forEach((e) => claves.has(claveRut(e.rut) || `n:${claveNombre(e.nombre)}`) && comunes++);
    return comunes / Math.min(claves.size, otro.lectura.estudiantes.length) >= 0.5;
  });

  let tipo;
  let recomendacion = "";
  let accion = "agregar";
  let marcar = true;
  if (!emp.pares.length) {
    tipo = "nuevo";
  } else if (!conDif.length) {
    tipo = emp.nuevos.length ? "nuevos" : "igual";
    marcar = emp.nuevos.length > 0;
  } else {
    tipo = "diferente";
    if (c.revisarTraspaso && penArchivo !== penApp) {
      const archivoMejor = penArchivo < penApp;
      recomendacion = archivoMejor
        ? `💡 Conviene subir este archivo: tiene menos tests mal traspasados (${penArchivo} contra ${penApp} en la app).`
        : `💡 Conviene dejar la versión de la app: tiene menos tests mal traspasados (${penApp} contra ${penArchivo} en el archivo).`;
      accion = archivoMejor ? "actualizar" : "agregar";
      marcar = archivoMejor || emp.nuevos.length > 0;
    } else {
      recomendacion = archivoMasReciente
        ? `💡 El archivo parece más reciente (según su fecha) que los cambios hechos en la app${c.revisarTraspaso ? ", y los dos tienen los mismos tests mal traspasados" : ""}: conviene subirlo.`
        : `💡 Los cambios de la app son más recientes que el archivo${c.revisarTraspaso ? " (y los dos tienen los mismos tests mal traspasados)" : ""}: conviene dejar la versión de la app.`;
      accion = archivoMasReciente ? "actualizar" : "agregar";
      marcar = archivoMasReciente || emp.nuevos.length > 0;
    }
  }
  if (repiteA) marcar = false;

  // colegio/curso/letra para los estudiantes nuevos: el curso de la app donde ya están
  // los demás; si no, el del archivo (con el nombre de colegio que ya usa la app, si
  // hay uno que es el mismo escrito distinto)
  if (!item.datosEditados) {
    if (emp.curso) item.datos = { ...emp.curso, desdeApp: true };
    else {
      let colegio = item.lectura.colegio || "";
      const yaEnApp = colegio && opcionesUnicas(c.store.listar(), "colegio").find((x) => parecidoColegios(x, colegio) === "igual");
      if (yaEnApp) colegio = yaEnApp;
      let curso = item.lectura.curso || "";
      let letra = (item.lectura.letra || "").toUpperCase();
      if (!letra) ({ curso, letra } = separarCursoLetra(curso));
      item.datos = { colegio, curso: c.store.normalizarCurso(curso), letra, desdeApp: false };
    }
  }
  if (!item.tocado) {
    item.marcado = marcar;
    item.accion = accion;
  }
  item.analisis = {
    tipo,
    pares: emp.pares,
    nuevos: emp.nuevos,
    conDif,
    penApp,
    penArchivo,
    recomendacion,
    repiteA,
    porNombre: emp.pares.filter((p) => p.por === "nombre").length,
    malArchivo: ests.filter(archivoMalTraspasado).length,
  };
}

// ---------------- pantalla de revisión ----------------

const ETIQUETAS_TIPO_MASIVA = {
  nuevo: { texto: "Nuevo", clase: "nuevo" },
  nuevos: { texto: "Ya cargado + estudiantes nuevos", clase: "nuevo" },
  igual: { texto: "Ya está cargado, sin cambios", clase: "igual" },
  diferente: { texto: "Ya está cargado, con diferencias", clase: "diferente" },
  error: { texto: "No se puede importar", clase: "error" },
};

function renderResumenMasiva() {
  const cont = document.getElementById("masiva-revision");
  if (!cont) return;
  if (!masiva.items.length) {
    cont.innerHTML = "";
    return;
  }
  const c = cfg();
  masiva.items.forEach((it, i) => analizarItemMasiva(it, masiva.items.slice(0, i)));
  const cuenta = (tipo) => masiva.items.filter((it) => it.analisis.tipo === tipo).length;
  const marcados = masiva.items.filter((it) => it.marcado && it.analisis.tipo !== "error");

  const filas = masiva.items
    .map((it) => {
      const a = it.analisis;
      const et = ETIQUETAS_TIPO_MASIVA[a.tipo];
      const ests = it.lectura ? it.lectura.estudiantes : [];
      if (a.tipo === "error") {
        return `
        <div class="mv-item mv-item--error" data-uid="${it.uid}">
          <div class="mv-item-cab">
            <span class="mv-nombre">📄 ${escaparHtml(it.nombre)}</span>
            <span class="mv-tipo mv-tipo--${et.clase}">${et.texto}</span>
            <button type="button" class="btn-quitar-archivo" title="Quitar de la lista">✕</button>
          </div>
          <div class="imp-archivo-error">⚠ ${escaparHtml(it.error || "No se encontraron estudiantes válidos.")}</div>
        </div>`;
      }
      const d = it.datos;
      const detalle = [];
      if (a.pares.length) detalle.push(`<b>${a.pares.length}</b> de ${ests.length} ya ${a.pares.length === 1 ? "está" : "están"} en la app${a.porNombre ? ` (${a.porNombre} por nombre, sin RUT)` : ""}`);
      if (a.nuevos.length) detalle.push(`<b>${a.nuevos.length}</b> ${a.nuevos.length === 1 ? "estudiante nuevo" : "estudiantes nuevos"}`);
      if (a.conDif.length) detalle.push(`<b>${a.conDif.length}</b> con datos distintos`);
      if (a.malArchivo) detalle.push(`⚠ ${a.malArchivo} no ${a.malArchivo === 1 ? "suma" : "suman"} 45 en el archivo`);
      const opciones =
        a.tipo === "diferente"
          ? `<div class="mv-acciones">
              <label><input type="radio" name="acc-${it.uid}" value="actualizar" ${it.accion === "actualizar" ? "checked" : ""} /> Usar los datos de este archivo${a.nuevos.length ? " y agregar los nuevos" : ""}</label>
              <label><input type="radio" name="acc-${it.uid}" value="agregar" ${it.accion === "agregar" ? "checked" : ""} /> Dejar la versión de la app${a.nuevos.length ? " y solo agregar los nuevos" : ""}</label>
            </div>`
          : "";
      const listaDifs = a.conDif.length
        ? `<details class="mv-difs"><summary>Ver las diferencias (${a.conDif.length})</summary><ul>${a.conDif
            .slice(0, 60)
            .map((p) => `<li><b>${escaparHtml(p.app.nombre)}</b>: ${escaparHtml(p.difs.join(" · "))}</li>`)
            .join("")}</ul></details>`
        : "";
      const necesitaCurso = a.nuevos.length > 0;
      return `
      <div class="mv-item${it.marcado ? " mv-item--marcado" : ""}" data-uid="${it.uid}">
        <div class="mv-item-cab">
          <label class="mv-chk"><input type="checkbox" class="mv-marcar" ${it.marcado ? "checked" : ""} /> <span class="mv-nombre">📄 ${escaparHtml(it.nombre)}</span></label>
          <span class="mv-tipo mv-tipo--${et.clase}">${et.texto}</span>
          <button type="button" class="btn-quitar-archivo" title="Quitar de la lista">✕</button>
        </div>
        <div class="mv-detalle">${ests.length} ${ests.length === 1 ? "estudiante" : "estudiantes"} en el archivo${detalle.length ? ": " + detalle.join(" · ") : ""}.${
          a.tipo === "nuevo" ? " Ningún RUT ni nombre coincide con la app: se carga como curso nuevo." : ""
        }${a.tipo === "igual" ? " No hace falta subirlo." : ""}</div>
        ${a.repiteA ? `<div class="mv-aviso">⚠ Trae a los mismos estudiantes que "${escaparHtml(a.repiteA.nombre)}", más arriba en esta lista. Si lo marcas, no se duplican: se comparan con ese.</div>` : ""}
        ${a.recomendacion ? `<div class="mv-recomendacion">${escaparHtml(a.recomendacion)}</div>` : ""}
        ${opciones}
        ${listaDifs}
        ${
          necesitaCurso
            ? `<div class="grid-form mv-datos">
                <div><label>Colegio *</label><input type="text" class="mv-colegio" value="${escaparHtml(d.colegio)}" /></div>
                <div><label>Curso *</label><input type="text" class="mv-curso" value="${escaparHtml(d.curso)}" placeholder="${escaparHtml(c.placeholderCurso)}" /></div>
                <div><label>Letra</label><input type="text" class="mv-letra" maxlength="2" value="${escaparHtml(d.letra)}" /></div>
                <div class="mv-datos-nota">${d.desdeApp ? "Los nuevos van al mismo curso donde ya están sus compañeros en la app." : "Curso para los estudiantes nuevos (leído del archivo)."}</div>
              </div>`
            : ""
        }
      </div>`;
    })
    .join("");

  const nEst = marcados.reduce((acc, it) => acc + (it.accion === "actualizar" ? it.analisis.conDif.length : 0) + it.analisis.nuevos.length, 0);
  cont.innerHTML = `
    <div class="mv-resumen">
      <div><b>${masiva.items.length} ${masiva.items.length === 1 ? "archivo" : "archivos"}:</b>
        ${[
          [cuenta("nuevo"), "nuevo", "nuevos"],
          [cuenta("nuevos"), "ya cargado con estudiantes nuevos", "ya cargados con estudiantes nuevos"],
          [cuenta("diferente"), "con diferencias", "con diferencias"],
          [cuenta("igual"), "ya cargado sin cambios", "ya cargados sin cambios"],
          [cuenta("error"), "que no se puede importar", "que no se pueden importar"],
        ]
          .filter(([n]) => n)
          .map(([n, uno, varios]) => `${n} ${n === 1 ? uno : varios}`)
          .join(" · ")}
      </div>
      <div class="mv-resumen-botones">
        <button type="button" class="chico secundario" id="mv-recomendados">↺ Volver a lo recomendado</button>
        <button type="button" class="chico secundario" id="mv-ninguno">Desmarcar todo</button>
        <button type="button" class="chico secundario" id="mv-limpiar">Quitar todo</button>
      </div>
    </div>
    <div class="mv-lista">${filas}</div>
    <div class="acciones-form mv-pie">
      <button type="button" id="mv-importar" ${marcados.length ? "" : "disabled"}>📥 Importar ${marcados.length} ${marcados.length === 1 ? "archivo marcado" : "archivos marcados"}${marcados.length ? ` (${nEst} ${nEst === 1 ? "estudiante nuevo o actualizado" : "estudiantes nuevos o actualizados"})` : ""}</button>
      <span class="ayuda" style="margin:0;">Todo se carga junto y se puede deshacer de una vez con "↩ Deshacer" arriba.</span>
    </div>`;

  cont.querySelectorAll(".mv-item").forEach((div) => {
    const it = masiva.items.find((x) => x.uid === div.dataset.uid);
    if (!it) return;
    div.querySelector(".btn-quitar-archivo").onclick = () => {
      masiva.items = masiva.items.filter((x) => x !== it);
      renderResumenMasiva();
    };
    const chk = div.querySelector(".mv-marcar");
    if (chk)
      chk.onchange = () => {
        it.marcado = chk.checked;
        it.tocado = true;
        renderResumenMasiva();
      };
    div.querySelectorAll(`input[name="acc-${it.uid}"]`).forEach((r) => {
      r.onchange = () => {
        it.accion = r.value;
        it.marcado = true;
        it.tocado = true;
        renderResumenMasiva();
      };
    });
    [["mv-colegio", "colegio"], ["mv-curso", "curso"], ["mv-letra", "letra"]].forEach(([clase, campo]) => {
      const inp = div.querySelector("." + clase);
      if (inp)
        inp.oninput = () => {
          it.datos[campo] = campo === "letra" ? inp.value.toUpperCase() : inp.value;
          it.datosEditados = true;
        };
    });
  });
  document.getElementById("mv-recomendados").onclick = () => {
    masiva.items.forEach((it) => (it.tocado = false));
    renderResumenMasiva();
  };
  document.getElementById("mv-ninguno").onclick = () => {
    masiva.items.forEach((it) => {
      it.marcado = false;
      it.tocado = true;
    });
    renderResumenMasiva();
  };
  document.getElementById("mv-limpiar").onclick = () => {
    masiva.items = [];
    renderResumenMasiva();
  };
  document.getElementById("mv-importar").onclick = importarMarcadosMasiva;
}

// ---------------- importar ----------------

function importarMarcadosMasiva() {
  const c = cfg();
  const marcados = masiva.items.filter((it) => it.marcado && it.analisis.tipo !== "error");
  if (!marcados.length) return;
  // los que traen estudiantes nuevos necesitan colegio y curso
  const sinCurso = marcados.filter((it) => it.analisis.nuevos.length && (!(it.datos.colegio || "").trim() || !(it.datos.curso || "").trim()));
  if (sinCurso.length) {
    sinCurso.forEach((it) => {
      const div = document.querySelector(`.mv-item[data-uid="${it.uid}"]`);
      if (!div) return;
      div.querySelector(".mv-colegio")?.classList.toggle("invalido", !(it.datos.colegio || "").trim());
      div.querySelector(".mv-curso")?.classList.toggle("invalido", !(it.datos.curso || "").trim());
    });
    return mostrarToast("Completa colegio y curso de los archivos marcados en rojo");
  }

  let creados = 0;
  let actualizados = 0;
  c.store.lote(() => {
    // de a un archivo, comparando siempre con lo que ya hay (incluido lo que trajeron
    // los archivos anteriores de esta misma lista): así nada se duplica
    marcados.forEach((it) => {
      const emp = emparejarConApp(it.lectura.estudiantes, c.store.listar(), it.lectura.colegio);
      if (it.accion === "actualizar") {
        emp.pares.forEach((p) => {
          if (!diferenciasPar(p, c).length) return;
          c.store.actualizar(p.app.id, {
            nombre: p.archivo.nombre,
            rut: p.archivo.rut || p.app.rut,
            puntajes: p.archivo.puntajes,
            contacto: p.archivo.contacto,
            nacimiento: p.archivo.nacimiento,
          });
          actualizados++;
        });
      }
      if (emp.nuevos.length) {
        const destino = {
          colegio: it.datos.colegio.replace(/\s+/g, " ").trim(),
          curso: it.datos.curso.trim(),
          letra: (it.datos.letra || "").trim().toUpperCase(),
        };
        c.store.crearVarios(
          emp.nuevos.map((fe) => ({ nombre: fe.nombre, rut: fe.rut, contacto: fe.contacto, nacimiento: fe.nacimiento, puntajes: fe.puntajes, ...destino, fecha: "" }))
        );
        creados += emp.nuevos.length;
      }
    });
  });

  masiva.items = masiva.items.filter((it) => !marcados.includes(it));
  render();
  const partes = [];
  if (creados) partes.push(`${creados} ${creados === 1 ? "estudiante nuevo" : "estudiantes nuevos"}`);
  if (actualizados) partes.push(`${actualizados} ${actualizados === 1 ? "actualizado" : "actualizados"}`);
  mostrarToast(partes.length ? `Listo: ${partes.join(" y ")} (de ${marcados.length} ${marcados.length === 1 ? "archivo" : "archivos"}). Se puede deshacer arriba.` : "No había nada nuevo que cargar");
  // ¿quedaron colegios escritos de dos formas? se avisa para ordenarlos
  const colegios = opcionesUnicas(c.store.listar(), "colegio");
  const hayParecidos = colegios.some((a, i) => colegios.slice(i + 1).some((b) => parecidoColegios(a, b)));
  const aviso = document.getElementById("masiva-aviso-final");
  if (aviso) {
    aviso.innerHTML = hayParecidos
      ? `⚠ Hay colegios que parecen el mismo escrito de dos formas. <button type="button" class="chico" id="masiva-ir-carpetas">🗂 Revisar en "Editar carpetas"</button>`
      : "";
    const ir = document.getElementById("masiva-ir-carpetas");
    if (ir)
      ir.onclick = () => {
        aviso.innerHTML = "";
        estado.tab = "estudiantes";
        carpetasEstado.abierto = true;
        render();
        document.getElementById("tarjeta-carpetas").scrollIntoView({ block: "start" });
      };
  }
}
