// Utilidades compartidas para cursos, colegios y estudiantes (los dos tests):
// - formato uniforme de los cursos ("2do Medio", "2° Medio", "8vo Básico", "8°"...),
//   que se elige una vez en "Editar carpetas" y desde ahí se aplica solo a todo lo que
//   se cargue;
// - comparar nombres de colegios y estudiantes sin que importen tildes, mayúsculas ni
//   espacios (carpetas duplicadas, importación masiva);
// - RUT como clave (solo números y K, sin ceros a la izquierda).
// Se carga antes de js/store.js: el guardado de cada test escribe el curso con el
// formato elegido (normalizarCursoKuder / normalizarCursoOctavo).

// ==================== texto ====================

// "  Liceo  San José. " → "liceo san jose" (sin tildes, minúsculas, sin puntuación)
function normalizarTexto(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

// nombre de un estudiante como clave: mismas palabras aunque vengan en otro orden
// ("Pérez Soto Juan" = "Juan Pérez Soto")
function claveNombre(nombre) {
  return normalizarTexto(nombre).split(" ").filter(Boolean).sort().join(" ");
}

// RUT como clave: "12.345.678-5" = "123456785" = "0123456785"; vacío si no parece un RUT
function claveRut(rut) {
  const r = (rut || "").toString().toUpperCase().replace(/[^0-9K]/g, "").replace(/^0+/, "");
  return r.length >= 7 ? r : "";
}

// distancia de edición (cuántas letras hay que cambiar para pasar de un texto al otro)
function distanciaTexto(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previa = actual;
  }
  return previa[b.length];
}

// ¿dos nombres de colegio parecen el mismo? "igual": solo cambian tildes, mayúsculas,
// espacios o puntuación ("Liceo San José" / "liceo san jose"); "parecido": difieren en
// una o dos letras (un error de tipeo, "Liceo San Jsoé"). null si no se parecen.
function parecidoColegios(a, b) {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return null;
  if (na === nb) return "igual";
  const sinEspacios = (s) => s.replace(/ /g, "");
  if (sinEspacios(na) === sinEspacios(nb)) return "igual";
  const largo = Math.min(na.length, nb.length);
  const tolerancia = largo >= 14 ? 2 : largo >= 7 ? 1 : 0;
  if (tolerancia && distanciaTexto(na, nb) <= tolerancia) return "parecido";
  return null;
}

// ==================== cursos: nivel, letra y formato ====================

const PALABRAS_NIVEL_CURSO = { primero: 1, primer: 1, segundo: 2, tercero: 3, tercer: 3, cuarto: 4, quinto: 5, sexto: 6, septimo: 7, setimo: 7, octavo: 8 };
const ROMANOS_NIVEL_CURSO = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };
const SUFIJO_ORDINAL_CURSO = { 1: "ro", 2: "do", 3: "ro", 4: "to", 5: "to", 6: "to", 7: "mo", 8: "vo" };

// "2do", "2°", "Segundo", "II medio", "2do Medio", "8vo básico", "8" → { nivel, tipo }
// (tipo: "medio", "basico" o null si no lo dice). null si el texto no es solo un nivel
// (por ejemplo, si trae la letra pegada: "2do A").
function leerNivelCurso(texto) {
  let t = normalizarTexto(texto).replace(/\b(ano|anio|de|ensenanza)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  // una "b" suelta NO se lee como "básico": casi siempre es la letra del curso
  // ("8vo B"), y leerla como básico la haría desaparecer. Una "m" suelta sí es "medio"
  // ("2 M", "2m"), como siempre se leyó en Kuder.
  let tipo = null;
  if (/\b(medio|media|m)\b/.test(t)) tipo = "medio";
  if (/\b(basico|basica)\b/.test(t)) tipo = "basico";
  t = t.replace(/\b(medio|media|basico|basica|m)\b/g, " ").replace(/\s+/g, " ").trim();
  const m = /^(\d{1,2})\s*(ro|do|to|er|ero|ra|da|ta|vo|va|mo|ma|no|na|m)?$/.exec(t);
  if (m && m[2] === "m") tipo = "medio";
  const nivel = m ? Number(m[1]) : PALABRAS_NIVEL_CURSO[t] || ROMANOS_NIVEL_CURSO[t] || null;
  if (!nivel || nivel < 1 || nivel > 8) return null;
  return { nivel, tipo };
}

// "8vo A" → { curso: "8vo", letra: "A" }; "8°A" → { "8°", "A" }; "2do Medio B" →
// { "2do Medio", "B" }. Si no hay una letra suelta al final, queda todo como curso.
function separarCursoLetra(texto) {
  const t = (texto || "").toString().trim().replace(/\s+/g, " ");
  // "2 M" / "2m" es "2° medio", no la letra M
  const esMedio = (curso, letra) => /^m$/i.test(letra) && !(leerNivelCurso(curso) || {}).tipo;
  let m = /^(.*\S)\s+([A-Za-zÑñ])$/.exec(t);
  if (m && leerNivelCurso(m[1]) && !esMedio(m[1], m[2])) return { curso: m[1], letra: m[2].toUpperCase() };
  m = /^(\d{1,2}\s*(?:°|º|ro|do|er|to|vo|mo|no)?)([A-Za-z])$/i.exec(t);
  if (m && !esMedio(m[1], m[2])) return { curso: m[1].trim(), letra: m[2].toUpperCase() };
  return { curso: t, letra: "" };
}

// formatos que se pueden elegir, con el ejemplo de cada test (Kuder: 2° medio; 8°: 8° básico)
const FORMATOS_CURSO = [
  { id: "ordinal-tipo", ejemplo: { kuder: "2do Medio", octavo: "8vo Básico" } },
  { id: "grado-tipo", ejemplo: { kuder: "2° Medio", octavo: "8° Básico" } },
  { id: "ordinal", ejemplo: { kuder: "2do", octavo: "8vo" } },
  { id: "grado", ejemplo: { kuder: "2°", octavo: "8°" } },
];

// Kuder siempre tuvo un formato fijo ("2do Medio"); en 8° básico el curso queda tal cual
// se escribió, hasta que se elija uno
const FORMATO_CURSO_POR_DEFECTO = { kuder: "ordinal-tipo", octavo: "" };

function claveFormatoCurso(test) {
  return `orientando_intereses_formato_curso_${test}`;
}

function formatoCurso(test) {
  try {
    const guardado = localStorage.getItem(claveFormatoCurso(test));
    if (guardado !== null && (guardado === "" || FORMATOS_CURSO.some((f) => f.id === guardado))) return guardado;
  } catch (e) {
    // sin acceso al guardado: el formato de siempre
  }
  return FORMATO_CURSO_POR_DEFECTO[test] || "";
}

function guardarFormatoCurso(test, formato) {
  localStorage.setItem(claveFormatoCurso(test), formato || "");
}

function escribirCurso(nivel, formato, tipo) {
  const base = formato.startsWith("ordinal") ? `${nivel}${SUFIJO_ORDINAL_CURSO[nivel]}` : `${nivel}°`;
  return formato.endsWith("-tipo") ? `${base} ${tipo === "medio" ? "Medio" : "Básico"}` : base;
}

// Test de Kuder: todos los cursos son de enseñanza media, así que "2do", "2°",
// "Segundo", "II medio", "2do medio"... quedan escritos igual (por defecto "2do Medio"),
// para que un mismo curso no aparezca dos veces (en los filtros, las carpetas y los
// informes). Lo que no se reconoce como 1° a 4° medio (o dice "básico") se deja tal cual.
function normalizarCursoKuderConFormato(curso, formato = formatoCurso("kuder")) {
  const original = (curso || "").toString().trim().replace(/\s+/g, " ");
  const r = leerNivelCurso(original);
  if (!r || r.tipo === "basico" || r.nivel > 4) return original;
  return escribirCurso(r.nivel, formato || FORMATO_CURSO_POR_DEFECTO.kuder, "medio");
}

// Test 8vos: tal cual se escribió, salvo que se haya elegido un formato uniforme
function normalizarCursoOctavo(curso, formato = formatoCurso("octavo")) {
  const original = (curso || "").toString().trim().replace(/\s+/g, " ");
  if (!formato) return original;
  const r = leerNivelCurso(original);
  if (!r || r.tipo === "medio") return original;
  return escribirCurso(r.nivel, formato, "basico");
}

// ==================== cursos cargados en la app ====================

// clave de un curso: colegio + curso + letra, tal como están guardados
function claveCursoGuardado(e) {
  return JSON.stringify([e.colegio || "", e.curso || "", e.letra || ""]);
}

function etiquetaCursoGuardado(c) {
  return [c.curso, c.letra].map((s) => (s || "").trim()).filter(Boolean).join(" ") || "Sin curso";
}

// cursos de un guardado (sin la papelera): [{ clave, colegio, curso, letra, estudiantes }],
// ordenados por colegio y curso
function cursosDelStore(storeDelTest) {
  const porClave = new Map();
  for (const e of storeDelTest.listar()) {
    const clave = claveCursoGuardado(e);
    if (!porClave.has(clave)) porClave.set(clave, { clave, colegio: e.colegio || "", curso: e.curso || "", letra: e.letra || "", estudiantes: [] });
    porClave.get(clave).estudiantes.push(e);
  }
  return [...porClave.values()].sort(
    (a, b) =>
      a.colegio.localeCompare(b.colegio, "es", { sensitivity: "base" }) ||
      etiquetaCursoGuardado(a).localeCompare(etiquetaCursoGuardado(b), "es", { sensitivity: "base", numeric: true })
  );
}
