// Ensayos PAES · de un archivo (PDF o imagen) a páginas en gris, y de una página a una hoja
// leída con sus imágenes. Todo ocurre en este computador: el PDF se abre con pdf.js
// (carpeta vendor/pdfjs, se carga solo cuando hace falta) y se lee con js/paes-lector.js.

(function (global) {
  "use strict";

  const LADO_CORTO = 1700; // carta a 200 dpi: el tamaño para el que está hecha la plantilla
  const LADO_LARGO_MAX = 2800;
  let cargaPdfJs = null;

  function cargarPdfJs() {
    if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
    if (!cargaPdfJs) {
      cargaPdfJs = new Promise((ok, mal) => {
        const s = document.createElement("script");
        s.src = "vendor/pdfjs/pdf.min.js";
        s.onload = () => {
          global.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js";
          ok(global.pdfjsLib);
        };
        s.onerror = () => {
          cargaPdfJs = null;
          mal(new Error("No se pudo cargar el lector de PDF de la app."));
        };
        document.head.appendChild(s);
      });
    }
    return cargaPdfJs;
  }

  function tamanoDestino(w, h) {
    let escala = LADO_CORTO / Math.min(w, h);
    if (Math.max(w, h) * escala > LADO_LARGO_MAX) escala = LADO_LARGO_MAX / Math.max(w, h);
    return { escala, w: Math.round(w * escala), h: Math.round(h * escala) };
  }

  function grisDeCanvas(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const n = canvas.width * canvas.height;
    const gris = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) gris[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    return { gris, w: canvas.width, h: canvas.height };
  }

  function esPdf(archivo) {
    return /\.pdf$/i.test(archivo.name) || archivo.type === "application/pdf";
  }

  // Abre un archivo y entrega sus páginas de a una (para no llenar la memoria):
  //   { nombre, huella, paginas, pagina(i) -> { gris, w, h }, cerrar() }
  async function abrirArchivo(archivo) {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const huella = PaesLogica.huellaDeBytes(bytes);
    const canvas = document.createElement("canvas");
    if (esPdf(archivo)) {
      const pdfjs = await cargarPdfJs();
      // pdf.js se queda con los bytes que recibe: se le pasa una copia
      const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      return {
        nombre: archivo.name,
        huella,
        paginas: doc.numPages,
        async pagina(i) {
          const pag = await doc.getPage(i);
          const base = pag.getViewport({ scale: 1 });
          const t = tamanoDestino(base.width, base.height);
          const vista = pag.getViewport({ scale: t.escala });
          canvas.width = Math.round(vista.width);
          canvas.height = Math.round(vista.height);
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          // intent "print": pdf.js dibuja de corrido, sin esperar a cada cuadro de pantalla. Con
          // el modo normal, si la pestaña no está a la vista cada página tarda un segundo entero.
          await pag.render({ canvasContext: ctx, viewport: vista, intent: "print" }).promise;
          pag.cleanup();
          return grisDeCanvas(canvas);
        },
        cerrar() {
          canvas.width = canvas.height = 1;
          return doc.destroy();
        },
      };
    }
    // imagen suelta (JPG, PNG…): una hoja
    const url = URL.createObjectURL(new Blob([bytes], { type: archivo.type || "image/jpeg" }));
    const img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error(`No se pudo abrir «${archivo.name}»: no es un PDF ni una imagen que la app pueda leer.`));
      i.src = url;
    });
    return {
      nombre: archivo.name,
      huella,
      paginas: 1,
      async pagina() {
        const t = tamanoDestino(img.naturalWidth, img.naturalHeight);
        canvas.width = t.w;
        canvas.height = t.h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, t.w, t.h);
        ctx.drawImage(img, 0, 0, t.w, t.h);
        return grisDeCanvas(canvas);
      },
      cerrar() {
        URL.revokeObjectURL(url);
        canvas.width = canvas.height = 1;
      },
    };
  }

  // Miniaturas de todas las páginas de un archivo, en su orden (Editor de PDF). Avisa de a
  // una con alAvanzar(urlDeLaImagen, numeroDePagina, totalDePaginas).
  // «zona» [x0, y0, x1, y1] (fracciones de la página) recorta la miniatura a esa parte de la hoja,
  // por ejemplo la franja del nombre; «ancho» es el ancho en píxeles de ese recorte.
  async function miniaturas(archivo, ancho, alAvanzar, zona) {
    const z = zona || [0, 0, 1, 1];
    const zw = z[2] - z[0], zh = z[3] - z[1];
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const canvas = document.createElement("canvas");
    const ctxDe = (w, h) => {
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return ctx;
    };
    if (esPdf(archivo)) {
      const pdfjs = await cargarPdfJs();
      const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
      try {
        for (let i = 1; i <= doc.numPages; i++) {
          const pag = await doc.getPage(i);
          const base = pag.getViewport({ scale: 1 });
          const escala = ancho / (base.width * zw);
          const entera = pag.getViewport({ scale: escala });
          const vista = pag.getViewport({ scale: escala, offsetX: -z[0] * entera.width, offsetY: -z[1] * entera.height });
          const ctx = ctxDe(entera.width * zw, entera.height * zh);
          await pag.render({ canvasContext: ctx, viewport: vista, intent: "print" }).promise;
          pag.cleanup();
          await alAvanzar(canvas.toDataURL("image/jpeg", 0.6), i, doc.numPages);
        }
      } finally {
        canvas.width = canvas.height = 1;
        await doc.destroy();
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: archivo.type || "image/jpeg" }));
    try {
      const img = await new Promise((ok, mal) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => mal(new Error(`No se pudo abrir «${archivo.name}».`));
        i.src = url;
      });
      const sw = img.naturalWidth * zw, sh = img.naturalHeight * zh;
      const ctx = ctxDe(ancho, (sh * ancho) / sw);
      ctx.drawImage(img, img.naturalWidth * z[0], img.naturalHeight * z[1], sw, sh, 0, 0, canvas.width, canvas.height);
      await alAvanzar(canvas.toDataURL("image/jpeg", 0.6), 1, 1);
    } finally {
      URL.revokeObjectURL(url);
      canvas.width = canvas.height = 1;
    }
  }

  // Abre un archivo para mirar sus páginas en grande (visor del Editor de PDF):
  //   { imagen(pagina, ancho) -> url de la imagen, cerrar() }
  async function abrirVista(archivo) {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const canvas = document.createElement("canvas");
    if (esPdf(archivo)) {
      const pdfjs = await cargarPdfJs();
      const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
      let cola = Promise.resolve();
      return {
        imagen(pagina, ancho) {
          // de a una: el lienzo es compartido
          cola = cola.catch(() => {}).then(async () => {
            const pag = await doc.getPage(pagina);
            const base = pag.getViewport({ scale: 1 });
            const vista = pag.getViewport({ scale: ancho / base.width });
            canvas.width = Math.round(vista.width);
            canvas.height = Math.round(vista.height);
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await pag.render({ canvasContext: ctx, viewport: vista, intent: "print" }).promise;
            pag.cleanup();
            return canvas.toDataURL("image/jpeg", 0.8);
          });
          return cola;
        },
        cerrar() {
          canvas.width = canvas.height = 1;
          return doc.destroy();
        },
      };
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: archivo.type || "image/jpeg" }));
    return { imagen: async () => url, cerrar: () => URL.revokeObjectURL(url) };
  }

  function blobDeGris(img, calidad) {
    const canvas = document.createElement("canvas");
    canvas.width = img.ancho;
    canvas.height = img.alto;
    const ctx = canvas.getContext("2d");
    const id = ctx.createImageData(img.ancho, img.alto);
    for (let i = 0, j = 0; i < img.datos.length; i++, j += 4) {
      id.data[j] = id.data[j + 1] = id.data[j + 2] = img.datos[i];
      id.data[j + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    // toDataURL codifica de inmediato; toBlob espera a que el navegador esté "ocioso" y, con
    // la pestaña en segundo plano, cada imagen tarda más de un segundo
    const base64 = canvas.toDataURL("image/jpeg", calidad).split(",")[1];
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    canvas.width = canvas.height = 1;
    return new Blob([bytes], { type: "image/jpeg" });
  }

  // Lee una página: devuelve la lectura compacta (lo que se guarda como «valor leído por la
  // app») y dos imágenes: la hoja reducida y enderezada, y el recorte de lo manuscrito.
  // huella de una página (para saber si esa misma imagen ya se subió)
  function huellaDePagina(pagina) {
    return PaesLogica.huellaDeBytes(pagina.gris);
  }

  function leerPagina(pagina, plantilla, config) {
    const { gris, w, h } = pagina;
    const r = PaesLector.leerHoja(gris, w, h, plantilla, config);
    const def = plantilla.def;
    const lectura = PaesLector.compactarLectura(r);
    let imgHoja, imgNombre = null;
    if (r.legible) {
      imgHoja = PaesLector.enderezar(gris, w, h, r.M, [0, 0, def.ancho, def.alto], 0.5);
      if (def.recortes && def.recortes.nombre) imgNombre = PaesLector.enderezar(gris, w, h, r.M, def.recortes.nombre, 0.8);
    } else {
      // sin alinear: la página tal como vino, reducida a la mitad
      imgHoja = PaesLector.enderezar(gris, w, h, [1, 0, 0, 0, 1, 0], [0, 0, w, h], 0.5 * (LADO_CORTO / Math.min(w, h)));
    }
    const imagenes = { pagina: blobDeGris(imgHoja, 0.6), nombre: imgNombre ? blobDeGris(imgNombre, 0.72) : null };
    return { legible: r.legible, lectura, imagenes };
  }

  global.PaesPdf = { cargarPdfJs, abrirArchivo, miniaturas, abrirVista, huellaDePagina, leerPagina, blobDeGris };
})(window);
