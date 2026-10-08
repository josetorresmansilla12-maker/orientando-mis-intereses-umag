// "🗂 Editar carpetas" (al final de "Estudiantes e informes"): ordenar las carpetas del
// test elegido — colegios y cursos — sin tener que corregir estudiante por estudiante:
// - avisa de carpetas que parecen duplicadas ("Liceo San José" / "Liceo San Jose") y
//   las fusiona con un clic, eligiendo qué nombre queda;
// - fusionar arrastrando una carpeta sobre otra (o marcando varias y "🔗 Fusionar");
//   un curso arrastrado sobre otro colegio se mueve a ese colegio;
// - cambiar el nombre de un colegio, de un curso (curso y letra) y de cada estudiante
//   (el nombre del estudiante es el del archivo de su informe);
// - un mismo formato para todos los cursos ("2do Medio", "2° Medio", "8vo", "8°"...).
// Cada cambio es un solo paso de "Deshacer" (arriba).

const carpetasEstado = { abierto: false, marcados: new Set(), estudiantesAbiertos: new Set(), arrastrando: null, fusion: null };

function cablearCarpetas() {
  const btn = document.getElementById("btn-abrir-carpetas");
  if (!btn) return;
  btn.addEventListener("click", () => {
    carpetasEstado.abierto = !carpetasEstado.abierto;
    carpetasEstado.marcados.clear();
    renderEditorCarpetas();
    if (carpetasEstado.abierto) document.getElementById("tarjeta-carpetas").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  cablearModalFusionar();
}
document.addEventListener("DOMContentLoaded", cablearCarpetas);

// colegios del test elegido, cada uno con sus cursos
function colegiosParaEditor() {
  const porColegio = new Map();
  cursosDelStore(cfg().store).forEach((c) => {
    if (!porColegio.has(c.colegio)) porColegio.set(c.colegio, []);
    porColegio.get(c.colegio).push(c);
  });
  return [...porColegio].map(([colegio, cursos]) => ({ colegio, cursos, n: cursos.reduce((acc, c) => acc + c.estudiantes.length, 0) }));
}

// pares de colegios que parecen el mismo, y cursos repetidos dentro de un colegio
function duplicadosCarpetas(colegios) {
  const grupos = [];
  const usados = new Set();
  for (let i = 0; i < colegios.length; i++) {
    if (usados.has(i)) continue;
    const grupo = [colegios[i]];
    let tipo = "igual";
    for (let j = i + 1; j < colegios.length; j++) {
      if (usados.has(j)) continue;
      const p = parecidoColegios(colegios[i].colegio, colegios[j].colegio);
      if (p) {
        grupo.push(colegios[j]);
        usados.add(j);
        if (p === "parecido") tipo = "parecido";
      }
    }
    if (grupo.length > 1) grupos.push({ tipo: "colegio", parecido: tipo, colegios: grupo });
  }
  // mismo curso escrito distinto dentro de un colegio ("2do Medio a" / "2do Medio A")
  colegios.forEach((col) => {
    const porClave = new Map();
    col.cursos.forEach((c) => {
      const k = normalizarTexto(etiquetaCursoGuardado(c)).replace(/ /g, "");
      if (!porClave.has(k)) porClave.set(k, []);
      porClave.get(k).push(c);
    });
    porClave.forEach((cursos) => {
      if (cursos.length > 1) grupos.push({ tipo: "curso", colegio: col.colegio, cursos });
    });
  });
  return grupos;
}

function renderEditorCarpetas() {
  const cont = document.getElementById("editor-carpetas");
  const btn = document.getElementById("btn-abrir-carpetas");
  if (!cont || !btn) return;
  btn.textContent = carpetasEstado.abierto ? "✕ Cerrar editor" : "✏️ Editar carpetas";
  cont.style.display = carpetasEstado.abierto ? "" : "none";
  if (!carpetasEstado.abierto) {
    cont.innerHTML = "";
    return;
  }
  const c = cfg();
  const colegios = colegiosParaEditor();
  if (!colegios.length) {
    cont.innerHTML = `<div class="vacio" style="padding:20px;">Todavía no hay estudiantes del ${c.nombre} cargados.</div>`;
    return;
  }
  const claveCol = (colegio) => "col:" + colegio;
  // lo que se marcó y ya no existe (se fusionó o se renombró) se desmarca
  const existentes = new Set([...colegios.map((col) => claveCol(col.colegio)), ...colegios.flatMap((col) => col.cursos.map((cu) => cu.clave))]);
  [...carpetasEstado.marcados].forEach((k) => existentes.has(k) || carpetasEstado.marcados.delete(k));

  const duplicados = duplicadosCarpetas(colegios);
  const htmlDuplicados = duplicados.length
    ? `<div class="cp-duplicados">
        <div class="cp-duplicados-titulo">🔎 Posibles carpetas duplicadas (${duplicados.length})</div>
        <ul>${duplicados
          .map((g, i) =>
            g.tipo === "colegio"
              ? `<li>🏫 ${g.colegios.map((col) => `<b>${escaparHtml(col.colegio || "Sin colegio")}</b> (${col.n})`).join(" y ")} <span class="cp-dup-motivo">${
                  g.parecido === "igual" ? "solo cambian tildes, mayúsculas o espacios" : "los nombres son casi iguales: revisa que sea el mismo colegio"
                }</span> <button type="button" class="chico" data-dup="${i}">🔗 Fusionar…</button></li>`
              : `<li>📘 En <b>${escaparHtml(g.colegio || "Sin colegio")}</b>: ${g.cursos.map((cu) => `<b>${escaparHtml(etiquetaCursoGuardado(cu))}</b> (${cu.estudiantes.length})`).join(" y ")} <span class="cp-dup-motivo">el mismo curso escrito distinto</span> <button type="button" class="chico" data-dup="${i}">🔗 Fusionar…</button></li>`
          )
          .join("")}</ul>
      </div>`
    : `<div class="cp-duplicados cp-duplicados--ok">✓ No se ven carpetas duplicadas (colegios con el mismo nombre escrito distinto).</div>`;

  const nMarcados = carpetasEstado.marcados.size;
  const htmlColegios = colegios
    .map((col) => {
      const kc = claveCol(col.colegio);
      return `
      <div class="cp-colegio" data-tipo="colegio" data-colegio="${escaparHtml(col.colegio)}">
        <div class="cp-colegio-fila">
          <span class="cp-asa" title="Arrastra este colegio sobre otro para fusionarlos">⠿</span>
          <input type="checkbox" class="cp-chk" data-marca="${escaparHtml(kc)}" ${carpetasEstado.marcados.has(kc) ? "checked" : ""} title="Marcar para fusionar" />
          <span class="cp-icono">🏫</span>
          <input type="text" class="cp-nombre-colegio" value="${escaparHtml(col.colegio)}" data-original="${escaparHtml(col.colegio)}" spellcheck="false" title="Escribe el nombre nuevo y presiona Enter" aria-label="Nombre del colegio" />
          <span class="chip">${col.cursos.length} ${col.cursos.length === 1 ? "curso" : "cursos"} · ${col.n} ${col.n === 1 ? "estudiante" : "estudiantes"}</span>
        </div>
        <div class="cp-cursos">
          ${col.cursos
            .map((cu) => {
              const abierto = carpetasEstado.estudiantesAbiertos.has(cu.clave);
              const ordenados = [...cu.estudiantes].sort((a, b) => compararNombres(a.nombre, b.nombre));
              return `
              <div class="cp-curso" data-tipo="curso" data-clave="${escaparHtml(cu.clave)}">
                <div class="cp-curso-fila">
                  <span class="cp-asa" title="Arrastra este curso sobre otro curso para fusionarlos, o sobre otro colegio para moverlo">⠿</span>
                  <input type="checkbox" class="cp-chk" data-marca="${escaparHtml(cu.clave)}" ${carpetasEstado.marcados.has(cu.clave) ? "checked" : ""} title="Marcar para fusionar" />
                  <span class="cp-icono">📘</span>
                  <label class="cp-mini">Curso<input type="text" class="cp-curso-curso" value="${escaparHtml(cu.curso)}" spellcheck="false" /></label>
                  <label class="cp-mini cp-mini-letra">Letra<input type="text" class="cp-curso-letra" value="${escaparHtml(cu.letra)}" maxlength="2" spellcheck="false" /></label>
                  <span class="chip">${cu.estudiantes.length} ${cu.estudiantes.length === 1 ? "estudiante" : "estudiantes"}</span>
                  <button type="button" class="chico secundario cp-ver-est">${abierto ? "▴ Ocultar estudiantes" : "▾ Estudiantes y archivos"}</button>
                </div>
                ${
                  abierto
                    ? `<div class="cp-estudiantes">
                        <div class="cp-estudiantes-ayuda">El nombre de cada archivo sale del nombre del estudiante: cámbialo aquí y presiona Enter.</div>
                        ${ordenados
                          .map((e, i) => {
                            const archivo = c.nombreArchivoIndividual({ ...e, numeroEnCarpeta: i + 1, totalEnCarpeta: ordenados.length });
                            return `<div class="cp-est-fila"><span class="cp-est-n">${i + 1}</span><input type="text" class="cp-nombre-est" data-id="${e.id}" value="${escaparHtml(e.nombre)}" spellcheck="false" aria-label="Nombre del estudiante" /><span class="cp-est-archivo" title="Nombre del archivo de su informe">📄 ${escaparHtml(archivo)}</span></div>`;
                          })
                          .join("")}
                      </div>`
                    : ""
                }
              </div>`;
            })
            .join("")}
        </div>
      </div>`;
    })
    .join("");

  cont.innerHTML = `
    ${htmlDuplicados}
    <div class="cp-barra">
      <div class="cp-barra-ayuda">✋ <b>Arrastra</b> un colegio sobre otro para fusionarlos (o un curso sobre otro curso). Un curso arrastrado sobre otro colegio se mueve a ese colegio. Sin arrastrar: marca 2 o más carpetas y usa <b>🔗 Fusionar marcadas</b>. Para cambiar un nombre, escríbelo y presiona Enter.</div>
      <button type="button" id="cp-fusionar-marcados" ${nMarcados >= 2 ? "" : "disabled"}>🔗 Fusionar marcadas${nMarcados ? ` (${nMarcados})` : ""}</button>
    </div>
    <div class="cp-lista">${htmlColegios}</div>
    ${htmlFormatoCursos()}`;

  cablearEditorCarpetas(colegios, duplicados);
}

// ---------------- eventos del editor ----------------

function cablearEditorCarpetas(colegios, duplicados) {
  const cont = document.getElementById("editor-carpetas");
  const c = cfg();
  const cursoPorClave = new Map(colegios.flatMap((col) => col.cursos.map((cu) => [cu.clave, cu])));
  const colegioPorNombre = new Map(colegios.map((col) => [col.colegio, col]));

  cont.querySelectorAll("[data-dup]").forEach((b) => {
    b.onclick = () => {
      const g = duplicados[Number(b.dataset.dup)];
      if (g.tipo === "colegio") abrirFusionColegios(g.colegios);
      else abrirFusionCursos(g.cursos);
    };
  });

  cont.querySelectorAll(".cp-chk").forEach((chk) => {
    chk.onchange = () => {
      if (chk.checked) carpetasEstado.marcados.add(chk.dataset.marca);
      else carpetasEstado.marcados.delete(chk.dataset.marca);
      renderEditorCarpetas();
    };
  });
  const btnFusionar = document.getElementById("cp-fusionar-marcados");
  btnFusionar.onclick = () => {
    const marcados = [...carpetasEstado.marcados];
    const cols = marcados.filter((k) => k.startsWith("col:")).map((k) => colegioPorNombre.get(k.slice(4))).filter(Boolean);
    const curs = marcados.map((k) => cursoPorClave.get(k)).filter(Boolean);
    if (cols.length && curs.length) return mostrarToast("Marca solo colegios o solo cursos para fusionarlos");
    if (cols.length >= 2) abrirFusionColegios(cols);
    else if (curs.length >= 2) abrirFusionCursos(curs);
    else mostrarToast("Marca 2 o más carpetas para fusionarlas");
  };

  // nombre de un colegio: se guarda al presionar Enter o al salir del campo
  cont.querySelectorAll(".cp-nombre-colegio").forEach((inp) => {
    inp.onkeydown = (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        inp.blur();
      } else if (ev.key === "Escape") {
        inp.value = inp.dataset.original;
        inp.blur();
      }
    };
    inp.onchange = () => renombrarColegioDesdeEditor(inp.dataset.original, inp.value, () => (inp.value = inp.dataset.original));
  });

  // curso y letra: se guardan juntos al salir de la fila del curso (o con Enter)
  cont.querySelectorAll(".cp-curso").forEach((div) => {
    const cu = cursoPorClave.get(div.dataset.clave);
    const inpCurso = div.querySelector(".cp-curso-curso");
    const inpLetra = div.querySelector(".cp-curso-letra");
    const guardar = () => renombrarCursoDesdeEditor(cu, inpCurso.value, inpLetra.value, () => {
      inpCurso.value = cu.curso;
      inpLetra.value = cu.letra;
    });
    [inpCurso, inpLetra].forEach((inp) => {
      inp.onkeydown = (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          guardar();
        } else if (ev.key === "Escape") {
          inpCurso.value = cu.curso;
          inpLetra.value = cu.letra;
          inp.blur();
        }
      };
      inp.onchange = guardar;
    });
    div.querySelector(".cp-ver-est").onclick = () => {
      if (carpetasEstado.estudiantesAbiertos.has(cu.clave)) carpetasEstado.estudiantesAbiertos.delete(cu.clave);
      else carpetasEstado.estudiantesAbiertos.add(cu.clave);
      renderEditorCarpetas();
    };
  });

  // nombre de un estudiante (= nombre del archivo de su informe)
  cont.querySelectorAll(".cp-nombre-est").forEach((inp) => {
    inp.onkeydown = (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        inp.blur();
      }
    };
    inp.onchange = () => {
      const nombre = inp.value.replace(/\s+/g, " ").trim();
      const e = c.store.obtener(inp.dataset.id);
      if (!e) return;
      if (!nombre) {
        inp.value = e.nombre;
        return mostrarToast("El nombre no puede quedar vacío");
      }
      if (nombre === e.nombre) return;
      c.store.actualizar(e.id, { nombre });
      refrescarTrasEditar();
      mostrarToast(`Nombre actualizado: ${nombre} (puedes deshacerlo arriba)`);
    };
  });

  cablearArrastreCarpetas(cont, cursoPorClave, colegioPorNombre);
  cablearFormatoCursos();
}

// vuelve a dibujar la lista de estudiantes de arriba y el editor, sin mover la pantalla
function refrescarTrasEditar() {
  const tarjeta = document.getElementById("tarjeta-carpetas");
  const top = tarjeta ? tarjeta.getBoundingClientRect().top : null;
  render();
  if (tarjeta && top !== null) window.scrollBy(0, tarjeta.getBoundingClientRect().top - top);
}

function renombrarColegioDesdeEditor(anterior, escrito, revertir) {
  const c = cfg();
  const nuevo = (escrito || "").replace(/\s+/g, " ").trim();
  if (!nuevo) {
    revertir();
    return mostrarToast("El nombre del colegio no puede quedar vacío");
  }
  if (nuevo === anterior) return;
  const existe = c.store.listar().some((e) => e.colegio === nuevo);
  const aplicar = () => {
    c.store.renombrarColegios([[anterior, nuevo]]);
    if (estado.filtros.colegio === anterior) estado.filtros.colegio = nuevo;
    refrescarTrasEditar();
    mostrarToast(existe ? `Carpetas fusionadas en "${nuevo}" (puedes deshacerlo arriba)` : `Colegio renombrado: ${nuevo} (puedes deshacerlo arriba)`);
  };
  if (!existe) return aplicar();
  confirmarAccion({
    titulo: "🔗 Ya existe un colegio con ese nombre",
    texto: `"${nuevo}" ya es una carpeta. Si continúas, los cursos de "${anterior}" pasan a "${nuevo}" y quedan en una sola carpeta (los cursos con el mismo nombre se juntan). Se puede deshacer con "Deshacer" arriba.`,
    textoBoton: "Sí, fusionar",
    onConfirmar: aplicar,
    onCancelar: revertir,
  });
}

function renombrarCursoDesdeEditor(cu, cursoEscrito, letraEscrita, revertir) {
  const c = cfg();
  let curso = (cursoEscrito || "").replace(/\s+/g, " ").trim();
  let letra = (letraEscrita || "").trim().toUpperCase();
  if (!curso) {
    revertir();
    return mostrarToast("El curso no puede quedar vacío");
  }
  if (!letra) ({ curso, letra } = separarCursoLetra(curso));
  curso = c.store.normalizarCurso(curso);
  if (curso === cu.curso && letra === cu.letra) {
    revertir();
    return;
  }
  const destino = { colegio: cu.colegio, curso, letra };
  const existe = c.store.listar().some((e) => claveCursoGuardado(e) === claveCursoGuardado(destino));
  const aplicar = () => {
    moverEstudiantesACurso(cu.estudiantes.map((e) => e.id), destino);
    carpetasEstado.estudiantesAbiertos.delete(cu.clave);
    refrescarTrasEditar();
    mostrarToast(`${existe ? "Cursos fusionados" : "Curso renombrado"}: ${etiquetaCursoGuardado(destino)} (puedes deshacerlo arriba)`);
  };
  if (!existe) return aplicar();
  confirmarAccion({
    titulo: "🔗 Ese curso ya existe en el colegio",
    texto: `"${etiquetaCursoGuardado(destino)}" ya es un curso de ${cu.colegio || "este colegio"}. Si continúas, los ${cu.estudiantes.length} estudiantes de "${etiquetaCursoGuardado(cu)}" pasan a ese curso y quedan en una sola carpeta.`,
    textoBoton: "Sí, fusionar",
    onConfirmar: aplicar,
    onCancelar: revertir,
  });
}

// cambia colegio/curso/letra de varios estudiantes de una vez (un solo "Deshacer")
function moverEstudiantesACurso(ids, { colegio, curso, letra }) {
  const st = cfg().store;
  st.lote(() => ids.forEach((id) => st.actualizar(id, { colegio, curso, letra })));
}

// ---------------- arrastrar y soltar ----------------

function cablearArrastreCarpetas(cont, cursoPorClave, colegioPorNombre) {
  const limpiarMarcas = () => cont.querySelectorAll(".cp-sobre").forEach((el) => el.classList.remove("cp-sobre"));
  // lo que hay bajo el puntero: un curso (si se arrastra un curso) o un colegio
  const destinoDe = (ev) => {
    const arr = carpetasEstado.arrastrando;
    if (!arr) return null;
    const curso = arr.tipo === "curso" ? ev.target.closest(".cp-curso") : null;
    if (curso && curso.dataset.clave !== arr.id) return curso;
    const colegio = ev.target.closest(".cp-colegio");
    if (!colegio) return null;
    if (arr.tipo === "colegio" && colegio.dataset.colegio === arr.id) return null;
    if (arr.tipo === "curso" && cursoPorClave.get(arr.id).colegio === colegio.dataset.colegio) return null;
    return colegio;
  };

  // se arrastra tomando la tarjeta (el ⠿ o cualquier parte que no sea un campo, una
  // casilla o un botón): así se puede seguir seleccionando el texto dentro de los campos
  cont.onmousedown = (ev) => {
    if (ev.target.closest("input, button, select, textarea")) return;
    const el = ev.target.closest("[data-tipo]");
    if (el) el.draggable = true;
  };
  cont.onmouseup = () => cont.querySelectorAll("[draggable='true']").forEach((el) => (el.draggable = false));
  cont.ondragstart = (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-tipo]");
    if (!el || !el.draggable) return;
    carpetasEstado.arrastrando = { tipo: el.dataset.tipo, id: el.dataset.tipo === "curso" ? el.dataset.clave : el.dataset.colegio };
    el.classList.add("cp-arrastrando");
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", carpetasEstado.arrastrando.id);
  };
  cont.ondragend = () => {
    cont.querySelectorAll(".cp-arrastrando").forEach((el) => el.classList.remove("cp-arrastrando"));
    cont.querySelectorAll("[draggable='true']").forEach((el) => (el.draggable = false));
    carpetasEstado.arrastrando = null;
    limpiarMarcas();
  };
  cont.ondragover = (ev) => {
    const destino = destinoDe(ev);
    limpiarMarcas();
    if (!destino) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    destino.classList.add("cp-sobre");
  };
  cont.ondragleave = (ev) => {
    if (!cont.contains(ev.relatedTarget)) limpiarMarcas();
  };
  cont.ondrop = (ev) => {
    const destino = destinoDe(ev);
    const arr = carpetasEstado.arrastrando;
    limpiarMarcas();
    if (!destino || !arr) return;
    ev.preventDefault();
    carpetasEstado.arrastrando = null;
    if (arr.tipo === "colegio") {
      abrirFusionColegios([colegioPorNombre.get(arr.id), colegioPorNombre.get(destino.dataset.colegio)]);
    } else if (destino.classList.contains("cp-curso")) {
      abrirFusionCursos([cursoPorClave.get(arr.id), cursoPorClave.get(destino.dataset.clave)]);
    } else {
      moverCursoAColegio(cursoPorClave.get(arr.id), destino.dataset.colegio);
    }
  };
}

function moverCursoAColegio(cu, colegio) {
  const destino = { colegio, curso: cu.curso, letra: cu.letra };
  const existe = cfg().store.listar().some((e) => claveCursoGuardado(e) === claveCursoGuardado(destino));
  confirmarAccion({
    titulo: "📘 Mover curso a otro colegio",
    texto: `Los ${cu.estudiantes.length} estudiantes de "${etiquetaCursoGuardado(cu)}" pasan de "${cu.colegio || "Sin colegio"}" a "${colegio || "Sin colegio"}".${
      existe ? ` Ese colegio ya tiene un "${etiquetaCursoGuardado(cu)}": quedan juntos en ese curso.` : ""
    } Se puede deshacer con "Deshacer" arriba.`,
    textoBoton: "Sí, mover",
    onConfirmar: () => {
      moverEstudiantesACurso(cu.estudiantes.map((e) => e.id), destino);
      refrescarTrasEditar();
      mostrarToast(`Curso movido a ${colegio} (puedes deshacerlo arriba)`);
    },
  });
}

// ---------------- ventana "Fusionar carpetas" ----------------

function abrirFusionColegios(colegios) {
  colegios = colegios.filter(Boolean);
  if (colegios.length < 2) return;
  // primero el que tiene más estudiantes: suele ser el nombre bien escrito
  const ordenados = [...colegios].sort((a, b) => b.n - a.n);
  abrirModalFusionar({
    titulo: "🔗 Fusionar colegios",
    texto: `Todo queda en una sola carpeta: ${ordenados.map((col) => `<b>${escaparHtml(col.colegio || "Sin colegio")}</b> (${col.n} ${col.n === 1 ? "estudiante" : "estudiantes"})`).join(", ")}. Los cursos con el mismo nombre se juntan.`,
    opciones: ordenados.map((col) => ({ etiqueta: col.colegio || "Sin colegio", valor: col.colegio, detalle: `${col.cursos.length} ${col.cursos.length === 1 ? "curso" : "cursos"}, ${col.n} est.` })),
    conOtro: true,
    onFusionar: (nombre) => {
      const final = nombre.replace(/\s+/g, " ").trim();
      if (!final) return mostrarToast("Escribe el nombre que va a quedar");
      cfg().store.renombrarColegios(colegios.map((col) => [col.colegio, final]));
      if (colegios.some((col) => col.colegio === estado.filtros.colegio)) estado.filtros.colegio = final;
      carpetasEstado.marcados.clear();
      cerrarModalFusionar();
      refrescarTrasEditar();
      mostrarToast(`Listo: todo quedó en "${final}" (puedes deshacerlo arriba)`);
    },
  });
}

function abrirFusionCursos(cursos) {
  cursos = cursos.filter(Boolean);
  if (cursos.length < 2) return;
  const ordenados = [...cursos].sort((a, b) => b.estudiantes.length - a.estudiantes.length);
  const colegios = [...new Set(cursos.map((cu) => cu.colegio))];
  abrirModalFusionar({
    titulo: "🔗 Fusionar cursos",
    texto: `Todos estos estudiantes quedan en un solo curso: ${ordenados
      .map((cu) => `<b>${escaparHtml(etiquetaCursoGuardado(cu))}</b>${colegios.length > 1 ? ` de ${escaparHtml(cu.colegio || "Sin colegio")}` : ""} (${cu.estudiantes.length})`)
      .join(", ")}.`,
    opciones: ordenados.map((cu) => ({
      etiqueta: colegios.length > 1 ? `${etiquetaCursoGuardado(cu)} · ${cu.colegio || "Sin colegio"}` : etiquetaCursoGuardado(cu),
      valor: cu.clave,
      detalle: `${cu.estudiantes.length} est.`,
    })),
    conOtro: false,
    onFusionar: (clave) => {
      const elegido = cursos.find((cu) => cu.clave === clave) || ordenados[0];
      const destino = { colegio: elegido.colegio, curso: elegido.curso, letra: elegido.letra };
      moverEstudiantesACurso(cursos.flatMap((cu) => cu.estudiantes.map((e) => e.id)), destino);
      carpetasEstado.marcados.clear();
      cerrarModalFusionar();
      refrescarTrasEditar();
      mostrarToast(`Listo: quedaron en ${etiquetaCursoGuardado(destino)} (puedes deshacerlo arriba)`);
    },
  });
}

function abrirModalFusionar({ titulo, texto, opciones, conOtro, onFusionar }) {
  carpetasEstado.fusion = { onFusionar };
  document.getElementById("mf-titulo").textContent = titulo;
  document.getElementById("mf-texto").innerHTML = texto;
  document.getElementById("mf-opciones").innerHTML =
    opciones
      .map(
        (op, i) => `
      <label class="mf-opcion"><input type="radio" name="mf-nombre" value="${escaparHtml(op.valor)}" ${i === 0 ? "checked" : ""} />
        <span><b>${escaparHtml(op.etiqueta)}</b> <span class="mf-detalle">${escaparHtml(op.detalle)}</span></span></label>`
      )
      .join("") +
    (conOtro
      ? `<label class="mf-opcion"><input type="radio" name="mf-nombre" value="__otro__" /><span>Otro nombre: <input type="text" id="mf-otro" placeholder="Escribe el nombre correcto" /></span></label>`
      : "");
  const otro = document.getElementById("mf-otro");
  if (otro) otro.addEventListener("focus", () => (document.querySelector('input[name="mf-nombre"][value="__otro__"]').checked = true));
  document.getElementById("modal-fusionar").style.display = "flex";
}

function cerrarModalFusionar() {
  document.getElementById("modal-fusionar").style.display = "none";
  carpetasEstado.fusion = null;
}

function cablearModalFusionar() {
  const modal = document.getElementById("modal-fusionar");
  if (!modal) return;
  document.getElementById("mf-cancelar").addEventListener("click", cerrarModalFusionar);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) cerrarModalFusionar();
  });
  modal.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") cerrarModalFusionar();
    if (ev.key === "Enter") {
      ev.preventDefault();
      document.getElementById("mf-fusionar").click();
    }
  });
  document.getElementById("mf-fusionar").addEventListener("click", () => {
    if (!carpetasEstado.fusion) return;
    const marcado = document.querySelector('input[name="mf-nombre"]:checked');
    if (!marcado) return;
    const valor = marcado.value === "__otro__" ? document.getElementById("mf-otro").value : marcado.value;
    carpetasEstado.fusion.onFusionar(valor);
  });
}

// ---------------- formato uniforme de los cursos ----------------

function nombreFormato(formato, test) {
  if (!formato) return "Dejar cada curso como se escribió";
  const f = FORMATOS_CURSO.find((x) => x.id === formato);
  return f ? `Como "${f.ejemplo[test]} A"` : formato;
}

// cómo quedaría cada curso con un formato: [{ antes, despues, n }] solo de los que cambian
function cambiosDeFormato(formato) {
  const c = cfg();
  const normalizar = (curso) => (c.id === "kuder" ? normalizarCursoKuderConFormato(curso, formato) : normalizarCursoOctavo(curso, formato));
  return cursosDelStore(c.store)
    .map((cu) => {
      let curso = cu.curso;
      let letra = (cu.letra || "").toUpperCase();
      if (!letra) ({ curso, letra } = separarCursoLetra(curso));
      curso = normalizar(curso);
      return { colegio: cu.colegio, antes: etiquetaCursoGuardado(cu), despues: etiquetaCursoGuardado({ curso, letra }), n: cu.estudiantes.length };
    })
    .filter((x) => x.antes !== x.despues);
}

function htmlFormatoCursos() {
  const c = cfg();
  const actual = formatoCurso(c.id);
  const opciones = [...(c.id === "octavo" ? [""] : []), ...FORMATOS_CURSO.map((f) => f.id)];
  return `
    <div class="cp-formato">
      <div class="cp-formato-titulo">📐 Mismo formato para todos los cursos</div>
      <p class="ayuda" style="margin:4px 0 10px;">Elige cómo se escriben los cursos de este test. Se aplica a todos los cursos cargados y también a los que cargues después; la letra queda aparte y en mayúscula. ${
        c.id === "kuder" ? "En Kuder los cursos ya se escriben solos de una misma forma (por defecto, “2do Medio”)." : ""
      } Si después prefieres otro, vuelve a elegirlo aquí.</p>
      <div class="cp-formato-fila">
        <select id="cp-formato-sel">${opciones
          .map((f) => `<option value="${f}" ${f === actual ? "selected" : ""}>${escaparHtml(nombreFormato(f, c.id))}${f === actual ? " (el actual)" : ""}</option>`)
          .join("")}</select>
        <button type="button" id="cp-formato-aplicar" class="chico">Aplicar</button>
      </div>
      <div id="cp-formato-vista"></div>
    </div>`;
}

function cablearFormatoCursos() {
  const sel = document.getElementById("cp-formato-sel");
  const btn = document.getElementById("cp-formato-aplicar");
  const vista = document.getElementById("cp-formato-vista");
  if (!sel) return;
  const c = cfg();
  const pintar = () => {
    const cambios = cambiosDeFormato(sel.value);
    const nEst = cambios.reduce((acc, x) => acc + x.n, 0);
    const mismo = sel.value === formatoCurso(c.id);
    btn.disabled = mismo && !cambios.length;
    btn.textContent = cambios.length ? `Aplicar a ${cambios.length} ${cambios.length === 1 ? "curso" : "cursos"} (${nEst} estudiantes)` : mismo ? "Ya está aplicado" : "Usar este formato desde ahora";
    vista.innerHTML = cambios.length
      ? `<table class="cp-formato-tabla"><thead><tr><th>Colegio</th><th>Antes</th><th></th><th>Después</th><th>Est.</th></tr></thead><tbody>${cambios
          .slice(0, 40)
          .map((x) => `<tr><td>${escaparHtml(x.colegio || "Sin colegio")}</td><td>${escaparHtml(x.antes)}</td><td>→</td><td><b>${escaparHtml(x.despues)}</b></td><td>${x.n}</td></tr>`)
          .join("")}</tbody></table>${cambios.length > 40 ? `<div class="ayuda">… y ${cambios.length - 40} cursos más.</div>` : ""}`
      : `<div class="cp-formato-ok">✓ Todos los cursos cargados ya están escritos así${sel.value ? "" : " (cada uno como se escribió)"}.</div>`;
  };
  sel.onchange = pintar;
  pintar();
  btn.onclick = () => {
    const formato = sel.value;
    guardarFormatoCurso(c.id, formato);
    const n = c.store.reescribirCursos();
    estado.filtros.curso = "";
    estado.filtros.letra = "";
    refrescarTrasEditar();
    mostrarToast(n ? `Listo: ${n} estudiantes quedaron con el formato ${nombreFormato(formato, c.id).toLowerCase()}` : "Formato guardado: se aplica a lo que cargues desde ahora");
  };
}
