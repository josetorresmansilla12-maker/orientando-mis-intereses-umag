// Ensayos PAES · pruebas automáticas de PANTALLAS.
// Abren la app en un iframe con «?paes-pruebas=1» (guardado de prueba aparte, ver
// js/paes-db.js) y recorren los flujos principales con datos inventados. No usan ni tocan
// datos de estudiantes reales.
(async function () {
  "use strict";
  const lista = document.getElementById("lista");
  const resumen = document.getElementById("resumen");
  const marco = document.getElementById("app");
  const lineas = [];
  let fallas = 0, total = 0;
  const titulo = (t) => {
    const el = document.createElement("h2");
    el.textContent = t;
    lista.appendChild(el);
    lineas.push({ titulo: t });
  };
  const anotar = (ok, texto) => {
    total++;
    if (!ok) fallas++;
    const el = document.createElement("div");
    el.className = ok ? "ok" : "falla";
    el.textContent = texto;
    lista.appendChild(el);
    lineas.push({ ok, texto });
    resumen.textContent = `Ejecutando… ${total} comprobaciones`;
  };
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const hasta = async (cond, ms) => {
    const fin = Date.now() + (ms || 8000);
    while (Date.now() < fin) {
      if (cond()) return true;
      await espera(100);
    }
    return false;
  };
  // una comprobación: si la función lanza un error o devuelve false, falla
  const prueba = async (texto, fn) => {
    try {
      const r = await fn();
      anotar(r !== false, texto + (r === false ? " — no se cumplió" : ""));
    } catch (e) {
      anotar(false, `${texto} — ${e && e.message ? e.message : e}`);
    }
  };

  // el guardado simple del navegador (qué módulo y qué curso estaban elegidos) se deja como estaba
  const guardadoAntes = {};
  for (let i = 0; i < localStorage.length; i++) guardadoAntes[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
  const restaurarGuardado = () => {
    Object.keys(localStorage).forEach((k) => {
      if (!(k in guardadoAntes)) localStorage.removeItem(k);
    });
    Object.keys(guardadoAntes).forEach((k) => localStorage.getItem(k) !== guardadoAntes[k] && localStorage.setItem(k, guardadoAntes[k]));
  };

  let win, doc, R, E, erroresApp = [];
  const cargarApp = async () => {
    marco.src = "../index.html?paes-pruebas=1&t=" + Date.now();
    await new Promise((ok) => marco.addEventListener("load", ok, { once: true }));
    win = marco.contentWindow;
    doc = win.document;
    win.addEventListener("error", (ev) => erroresApp.push(String(ev.message || ev.error)));
    const original = win.console.error.bind(win.console);
    win.console.error = (...a) => {
      erroresApp.push(a.map((x) => (x && x.message) || String(x)).join(" "));
      original(...a);
    };
    await hasta(() => win.PaesApp && win.PaesDB, 10000);
    if (!win.PaesDB.enPruebas) throw new Error("La app no abrió en modo de prueba: se detiene para no tocar datos reales.");
    doc.querySelector('.test-btn[data-modulo="paes"]').click();
    await espera(500);
    R = doc.querySelector("#modulo-paes");
    E = win.PaesApp.estado;
    win.__descargas = [];
    win.HTMLAnchorElement.prototype.click = function () {
      if (this.download) win.__descargas.push({ nombre: this.download, href: this.href });
    };
  };
  const q = (sel) => R.querySelector(sel);
  const qa = (sel) => Array.from(R.querySelectorAll(sel));
  const clic = async (sel, n) => {
    const el = typeof sel === "string" ? qa(sel)[n || 0] : sel;
    if (!el) throw new Error("no está en pantalla: " + sel);
    el.click();
    await espera(250);
  };
  const subir = async (sel, archivos) => {
    const entrada = q(sel);
    if (!entrada) throw new Error("no está la entrada de archivos: " + sel);
    const dt = new win.DataTransfer();
    archivos.forEach((a) => dt.items.add(a));
    entrada.files = dt.files;
    entrada.dispatchEvent(new win.Event("change", { bubbles: true }));
    await espera(300);
  };
  const confirmar = async () => {
    const m = doc.getElementById("modal-confirmacion");
    if (m && win.getComputedStyle(m).display !== "none") {
      doc.getElementById("modal-btn-confirmar").click();
      await espera(300);
      return true;
    }
    return false;
  };
  const texto = () => R.textContent.replace(/\s+/g, " ");

  // ---- datos inventados
  const LETRAS = "ABCD";
  const claveDe = (d) => Array.from({ length: 65 }, (_, i) => ({ n: i + 1, r: LETRAS[(i + d) % 4], valida: true }));
  const RUTS = ["111111111", "222222229", "333333336", "444444442", "555555558"];
  const conPuntos = (r) => `${r.slice(0, 2)}.${r.slice(2, 5)}.${r.slice(5, 8)}-${r.slice(8)}`;
  const listaXlsx = (nombre, ruts) => {
    const X = win.XLSX;
    const libro = X.utils.book_new();
    X.utils.book_append_sheet(libro, X.utils.aoa_to_sheet([["RUT", "Nombres", "Apellidos"]].concat(ruts.map((r, i) => [conPuntos(r), "Nombre" + (i + 1), "Inventado"]))), "Lista");
    return new win.File([X.write(libro, { type: "array", bookType: "xlsx" })], nombre, {});
  };
  const pdfDeHojas = (nombre, clave, ruts) => {
    const def = win.eval("PLANTILLAS_PAES")["zipgrade-100"];
    const J = win.jspdf ? win.jspdf.jsPDF : win.jsPDF;
    const pdf = new J({ unit: "pt", format: "letter" });
    ruts.forEach((rut, i) => {
      const preguntas = {};
      clave.forEach((k, j) => {
        preguntas[k.n] = [{ alt: j < 20 + i * 8 ? LETRAS.indexOf(k.r) : (LETRAS.indexOf(k.r) + 1) % 4, osc: 30 }];
      });
      const g = PaesSintetica.dibujarHoja(def, { preguntas, id: rut });
      const cv = document.createElement("canvas");
      cv.width = g.w;
      cv.height = g.h;
      const ctx = cv.getContext("2d");
      const im = ctx.createImageData(g.w, g.h);
      for (let p = 0; p < g.gris.length; p++) {
        im.data[p * 4] = im.data[p * 4 + 1] = im.data[p * 4 + 2] = g.gris[p];
        im.data[p * 4 + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
      if (i) pdf.addPage();
      pdf.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 612, 792);
    });
    return new win.File([pdf.output("blob")], nombre, { type: "application/pdf" });
  };
  const COLEGIO = "Colegio de Prueba Automática";

  try {
    await cargarApp();
    // parte de cero en el guardado de prueba
    await win.PaesDB.vaciar(["cursos", "ensayos", "hojas", "imagenes", "auditoria", "ajustes"]);
    await cargarApp();

    titulo("Inicio y pestañas");
    await prueba("El módulo abre en «¿Qué quieres hacer?» con sus opciones", () => E.vista === "inicio" && qa(".paes-ini-op").length >= 5);
    await prueba("Quedan seis pestañas (Inicio, Trabajar un curso, Resultados, Clavijeros, Editor de PDF, Configuración)", () => qa(".paes-vistas > button").length === 6);
    for (const v of ["curso", "resultados", "clavijeros", "editor", "config", "carpetas", "papelera", "acciones", "inicio"]) {
      await prueba(`La pantalla «${v}» se abre sin errores`, async () => {
        const antes = erroresApp.length;
        if (v === "carpetas" || v === "papelera" || v === "acciones") await clic('.paes-vistas [data-vista="config"]');
        await clic(`[data-vista="${v}"]`);
        return E.vista === v && q("#paes-panel").textContent.trim().length > 20 && erroresApp.length === antes;
      });
    }
    await prueba("«Corregir cursos nuevos» lleva a subir listas", async () => {
      await clic('.paes-ini-op[data-ir="nuevo"]');
      return E.vista === "curso" && !!q('[data-archivo="listas"]');
    });

    titulo("Cursos nuevos con sus listas");
    await prueba("Dos listas crean dos cursos", async () => {
      await subir('[data-archivo="listas"]', [listaXlsx("Lista 4A.xlsx", RUTS.slice(0, 2)), listaXlsx("Lista 4B.xlsx", RUTS.slice(2, 4))]);
      await hasta(() => E.listas && E.listas.length === 2, 5000);
      qa('[data-lista="colegio"]').forEach((x) => {
        x.value = COLEGIO;
        x.dispatchEvent(new win.Event("input", { bubbles: true }));
        x.dispatchEvent(new win.Event("change", { bubbles: true }));
      });
      await espera(200);
      await clic('[data-accion="crear-cursos-listas"]');
      await hasta(() => E.cursos.length === 2, 5000);
      return E.cursos.length === 2 && E.cursos.every((c) => c.estudiantes.length === 2 && c.colegio === COLEGIO);
    });
    await prueba("Los cinco pasos del curso se abren sin errores", async () => {
      const antes = erroresApp.length;
      for (const b of qa("[data-paso]")) {
        if (b.disabled) continue;
        b.click();
        await espera(200);
      }
      return erroresApp.length === antes;
    });

    titulo("Clavijeros y «Agregar ensayos PDF»");
    await prueba("Con dos clavijeros guardados, la pantalla de clavijeros los muestra", async () => {
      E.clavijeros.push({ id: "k-cl", nombre: "CL de prueba", prueba: "CL", pruebaNombre: "", forma: "A", alternativas: 4, clave: claveDe(0), creado: new Date().toISOString() }, { id: "k-m1", nombre: "M1 de prueba", prueba: "M1", pruebaNombre: "", forma: "", alternativas: 4, clave: claveDe(2), creado: new Date().toISOString() });
      await win.PaesDB.poner("ajustes", { clave: "clavijeros", valor: E.clavijeros });
      await clic('[data-vista="clavijeros"]');
      return /CL de prueba/.test(texto()) && /M1 de prueba/.test(texto());
    });
    const cursoA = () => E.cursos.find((c) => c.letra === "A");
    const cursoB = () => E.cursos.find((c) => c.letra === "B");
    await prueba("«Agregar ensayos PDF» corrige dos hojas del 4° A con el clavijero CL y las identifica por RUT", async () => {
      await clic('[data-vista="resultados"]');
      await clic(`[data-accion="res-agregar-pdf"][data-curso="${cursoA().id}"]`);
      await subir('[data-archivo="res-pdf"]', [pdfDeHojas("a_cl.pdf", claveDe(0), RUTS.slice(0, 2))]);
      const radio = q('input[name="paes-pdf-clv"][value="k-cl"]');
      radio.checked = true;
      await clic(`[data-accion="res-corregir-pdf"]`);
      await hasta(() => !E.lectura && E.hojas.length === 2, 60000);
      return E.hojas.length === 2 && E.hojas.every((h) => h.estado === "ok" && h.estudianteId);
    });
    await prueba("La revisión y los resultados del ensayo se abren y muestran el puntaje", async () => {
      const antes = erroresApp.length;
      await clic('[data-paso="revision"]');
      const hayHojas = /Hoja|hoja/.test(q("#paes-panel").textContent);
      await clic('[data-paso="resultados"]');
      return hayHojas && /Promedio/.test(texto()) && !/Logro promedio/.test(texto()) && erroresApp.length === antes;
    });
    await prueba("Los informes PDF, Word y Excel del ensayo se descargan con el nombre «curso colegio tipo»", async () => {
      win.__descargas = [];
      await clic('[data-vista="resultados"]');
      for (const f of ["pdf", "word", "excel"]) {
        await clic(`[data-accion="res-informe"][data-formato="${f}"]`);
        await confirmar();
        await hasta(() => !E.generando && win.__descargas.length >= ["pdf", "word", "excel"].indexOf(f) + 1, 30000);
        await clic('[data-vista="resultados"]');
      }
      const n = win.__descargas.map((d) => d.nombre);
      return n.length === 3 && n.every((x) => /^4to A Colegio de Prueba Automatica (Informe|Resultados) Ensayo PAES/.test(x)) && /\.pdf$/.test(n[0]) && /\.docx$/.test(n[1]) && /\.xlsx$/.test(n[2]);
    });

    titulo("Resultados guardados");
    await prueba("«Ver curso» muestra los resultados del curso, con CL en su color", async () => {
      await clic('[data-vista="resultados"]');
      await clic(`[data-accion="res-ver-curso"][data-curso="${cursoA().id}"]`);
      return qa(".paes-ver-prueba.cl").length === 1 && qa(".paes-ver-prueba tbody tr").length === 2;
    });
    await prueba("«Editar resultados» lleva a la revisión del ensayo", async () => {
      await clic(`[data-accion="res-editar"][data-curso="${cursoA().id}"]`);
      return E.vista === "curso" && E.paso === "revision";
    });

    titulo("Editor de PDF");
    await prueba("El editor carga un PDF de cuatro hojas y muestra sus miniaturas", async () => {
      await clic('[data-vista="editor"]');
      const col = q('[data-cambio="ed-colegio"]');
      col.value = COLEGIO;
      col.dispatchEvent(new win.Event("change", { bubbles: true }));
      await espera(300);
      await subir('[data-archivo="editor-pdf"]', [pdfDeHojas("pila_m1.pdf", claveDe(2), RUTS.slice(0, 4))]);
      await hasta(() => E.editor && !E.editor.cargando && E.editor.hojas.length === 4, 30000);
      return qa(".paes-ed-hoja").length === 4 && E.editor.cursos.length === 2;
    });
    await prueba("Marcar hojas por curso (arrastrando) y abrir el visor funciona", async () => {
      const hojas = () => qa(".paes-ed-hoja");
      const chips = () => qa(".paes-ed-barra .paes-ed-chip");
      const arrastrar = (a, b) => {
        hojas()[a].dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        hojas()[b].dispatchEvent(new win.PointerEvent("pointerover", { bubbles: true }));
        win.dispatchEvent(new win.PointerEvent("pointerup", { bubbles: true }));
      };
      const idx = (letra) => E.editor.cursos.findIndex((c) => c.letra === letra);
      if (!chips()[idx("A")].classList.contains("activo")) await clic(chips()[idx("A")]);
      arrastrar(0, 1);
      await clic(chips()[idx("B")]);
      arrastrar(2, 3);
      await clic(".paes-ed-ver");
      const visor = !!q(".paes-ed-visor");
      doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }));
      await espera(200);
      const letras = E.editor.hojas.map((h) => (E.editor.cursos.find((c) => c.key === h.curso) || {}).letra).join("");
      return visor && !q(".paes-ed-visor") && letras === "AABB";
    });
    await prueba("Girar una hoja en el editor vuelve a dibujar su miniatura", async () => {
      const antes = E.editor.hojas[0].url;
      await clic(".paes-ed-ver");
      await clic('.paes-ed-visor [data-v="giro-der"]');
      await hasta(() => E.editor.hojas[0].giro === 90 && !E.editor.girando, 15000);
      const cambio = E.editor.hojas[0].url !== antes;
      await clic('.paes-ed-visor [data-v="giro-izq"]');
      await hasta(() => E.editor.hojas[0].giro === 0 && !E.editor.girando, 15000);
      doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }));
      await espera(200);
      return cambio && E.editor.hojas[0].giro === 0;
    });
    await prueba("«Finalizar» corrige cada grupo en su curso con el clavijero M1, sin tocar CL", async () => {
      const radio = q('input[name="paes-ed-clv"][value="k-m1"]');
      radio.checked = true;
      radio.dispatchEvent(new win.Event("change", { bubbles: true }));
      await espera(200);
      await clic("#paes-ed-finalizar");
      await hasta(() => E.editor.resultado && !E.lectura, 90000);
      const de = (c, prueba) => {
        const e = E.ensayos.find((x) => x.cursoId === c.id && x.prueba === prueba);
        return e ? E.hojas.filter((h) => h.ensayoId === e.id) : [];
      };
      return de(cursoA(), "M1").length === 2 && de(cursoB(), "M1").length === 2 && de(cursoA(), "CL").length === 2 && de(cursoB(), "M1").every((h) => h.estudianteId);
    });
    await prueba("Cada ensayo usa la tabla de puntajes de su prueba (CL y M1 son distintas)", () => {
      const T = win.PaesLogica.TABLAS_PAES;
      return T.CL.join() !== T.M1.join() && E.ensayos.length === 3 && E.ensayos.every((e) => e.tabla.join() === T[e.prueba].join());
    });
    await prueba("En el editor se puede subir una lista y enlazarla a un curso nuevo", async () => {
      await subir('[data-archivo="editor-listas"]', [listaXlsx("nomina 4 medio C.xlsx", RUTS.slice(4, 5))]);
      await hasta(() => E.editor.listas.length === 1, 5000);
      await clic('[data-accion="ed-listas-guardar"]');
      await hasta(() => E.cursos.length === 3, 5000);
      const c = E.cursos.find((x) => x.letra === "C");
      return !!c && c.estudiantes.length === 1 && c.listaOficial === true;
    });

    titulo("Configuración: informes, respaldo y borrado");
    await prueba("«Descargar informes» entrega un ZIP con un PDF por prueba de cada curso", async () => {
      await clic('[data-vista="config"]');
      await clic('[data-accion="cfg-informes"]');
      win.__descargas = [];
      await clic("#paes-inf-descargar");
      await confirmar();
      await hasta(() => win.__descargas.length === 1, 90000);
      const zip = await win.JSZip.loadAsync(await (await win.fetch(win.__descargas[0].href)).blob());
      const nombres = Object.keys(zip.files);
      return nombres.length === 3 && nombres.every((n) => /Informe Ensayo PAES .*\.pdf$/.test(n));
    });
    let respaldo = null;
    await prueba("«Exportar respaldo» entrega un ZIP con datos, listas, clavijeros e informes por prueba y clavijero", async () => {
      await hasta(() => !E.generando, 10000);
      await clic('[data-vista="config"]');
      win.__descargas = [];
      await clic('[data-accion="resp-exportar"]');
      await hasta(() => win.__descargas.length === 1 && !E.generando, 120000);
      const blob = await (await win.fetch(win.__descargas[0].href)).blob();
      respaldo = new win.File([blob], win.__descargas[0].nombre, { type: "application/zip" });
      const nombres = Object.keys((await win.JSZip.loadAsync(blob)).files);
      const hay = (re) => nombres.some((n) => re.test(n));
      return hay(/^datos\/respaldo\.json$/) && hay(/^datos\/imagenes\/.+\.jpg$/) && nombres.filter((n) => /^Listas de curso\/.+\.xlsx$/.test(n)).length === 3 && nombres.filter((n) => /^Clavijeros\/.+\.xlsx$/.test(n)).length === 2 && hay(/^Informes PDF\/Competencia Lectora\/Clavijero CL de prueba\/.+\.pdf$/) && hay(/^Informes PDF\/[^/]*M1[^/]*\/Clavijero M1 de prueba\/.+\.pdf$/) && hay(/^Resultados Excel\//) && hay(/^LEEME\.txt$/);
    });
    const cuenta = () => ({ cursos: E.cursos.length, ensayos: E.ensayos.length, hojas: E.hojas.length, clavijeros: E.clavijeros.length });
    const antesDeBorrar = cuenta();
    await prueba("Eliminar un curso lo manda a la papelera y se puede recuperar", async () => {
      Object.assign(E, { vista: "curso", enBlanco: false, cursoId: E.cursos.find((x) => x.letra === "C").id, ensayoId: null, paso: "curso" });
      await clic('[data-vista="curso"]');
      await clic('[data-accion="eliminar-curso"]');
      await confirmar();
      await hasta(() => E.cursos.length === 2, 5000);
      await clic('.paes-vistas [data-vista="config"]');
      await clic('[data-vista="papelera"]');
      const enPapelera = E.papelera.length === 1 && /4° Medio C/.test(texto());
      await clic('[data-accion="papelera-restaurar-curso"]');
      await hasta(() => E.cursos.length === 3, 5000);
      return enPapelera && E.cursos.length === 3;
    });
    await prueba("«Eliminar todos los datos» pide escribir ELIMINAR y deja todo vacío", async () => {
      await clic('[data-vista="config"]');
      await clic('[data-accion="cfg-borrar"]');
      await clic('[data-accion="cfg-borrar-si"]');
      const noBorroSinPalabra = E.cursos.length === 3;
      q("#paes-cfg-clv").checked = true;
      q("#paes-cfg-palabra").value = "ELIMINAR";
      await clic('[data-accion="cfg-borrar-si"]');
      await hasta(() => E.cursos.length === 0, 8000);
      const bd = await Promise.all(["cursos", "ensayos", "hojas", "imagenes"].map((a) => win.PaesDB.todos(a)));
      return noBorroSinPalabra && bd.every((x) => x.length === 0) && E.clavijeros.length === 0;
    });
    await prueba("«Importar respaldo» restaura cursos, ensayos, hojas, imágenes y clavijeros", async () => {
      if (!respaldo) throw new Error("no hay respaldo que importar");
      await clic('[data-vista="config"]');
      await subir('[data-archivo="respaldo"]', [respaldo]);
      await hasta(() => !!E.cfgRespaldo, 10000);
      await clic('[data-accion="resp-restaurar"]');
      await hasta(() => !E.generando && E.cursos.length === 3, 30000);
      const c = cuenta();
      const imagenes = (await win.PaesDB.todos("imagenes")).length;
      return JSON.stringify(c) === JSON.stringify(antesDeBorrar) && imagenes === c.hojas && E.hojas.filter((h) => h.estudianteId).length === 6;
    });
    await prueba("Tras restaurar, los resultados se ven igual y la revisión muestra la imagen de la hoja", async () => {
      const antes = erroresApp.length;
      await clic('[data-vista="resultados"]');
      await clic(`[data-accion="res-editar"][data-curso="${cursoB().id}"]`);
      return E.paso === "revision" && qa("#paes-panel img").length > 0 && erroresApp.length === antes;
    });

    titulo("Errores");
    await prueba("La app no registró errores durante el recorrido", () => {
      if (erroresApp.length) throw new Error(erroresApp.slice(0, 3).join(" | "));
      return true;
    });
  } catch (e) {
    anotar(false, "El recorrido se interrumpió: " + (e && e.message ? e.message : e));
  }

  // limpieza: el guardado de prueba queda vacío y el guardado simple, como estaba
  try {
    if (win && win.PaesDB && win.PaesDB.enPruebas) await win.PaesDB.vaciar(["cursos", "ensayos", "hojas", "imagenes", "auditoria", "ajustes"]);
  } catch (e) {
    console.error(e);
  }
  restaurarGuardado();
  resumen.textContent = `${total - fallas} de ${total} pruebas de pantallas pasan`;
  if (fallas) resumen.className = "mal";
  window.resultadoPantallasPaes = { total, fallas, lineas };
})();
