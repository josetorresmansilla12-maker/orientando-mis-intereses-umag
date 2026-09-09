// Datos del Test Vocacional de Kuder (Enseñanza Media) — módulo independiente del
// cuestionario "Orientando mis Intereses" de 8° básico (no comparte ids, colores ni
// funciones con js/data.js). Las 10 áreas y sus carreras UMAG/otras carreras salen del
// documento "Kuder - Descripciones por área con carreras UMAG y otras carreras".
//
// Regla de corrección: puntaje 7 o más en un área = área de interés para ese estudiante
// (instrumento validado, escala por área normalmente entre 0 y 9).

const AREAS_KUDER = [
  {
    id: "exterior",
    nombre: "Exterior",
    icono: "🌳",
    color: "#4CAF6E",
    descripcion:
      "Esta área representa a personas con aptitudes para la exploración y la conexión con la naturaleza. Prefieren las actividades al aire libre y pasar más tiempo en entornos naturales, lo que favorece el conocimiento del medio, la capacidad de respuesta ante emergencias y la creatividad para usar herramientas con pocos recursos.",
    carrerasUMAG: [
      "Agronomía",
      "Biología Marina",
      "Técnico de Nivel Superior en Acuicultura",
      "Técnico de Nivel Superior en Eficiencia Energética y Energías No Convencionales",
      "Ingeniería en Química y Medio Ambiente",
      "Ingeniería Civil Química",
      "Pedagogía en Educación Física",
      "Técnico de Nivel Superior en Construcción",
      "Arquitectura",
      "Ingeniería en Construcción",
      "Técnico de Nivel Superior en Turismo Sostenible",
    ],
    carrerasOtras: ["Veterinaria", "Geología", "Ciencias Ambientales", "Arqueología"],
  },
  {
    id: "mecanica",
    nombre: "Mecánica",
    icono: "🔧",
    color: "#B98A2E",
    descripcion:
      "Las personas con este interés destacan por el pensamiento práctico y la acción manual. Son hábiles en el uso de herramientas especializadas, y disfrutan reparar, mantener y crear equipos mecánicos, eléctricos y electrónicos, trabajando con eficacia y satisfacción en este tipo de tareas.",
    carrerasUMAG: [
      "Ingeniería en Construcción",
      "Ingeniería en Electricidad",
      "Ingeniería Civil en Electricidad",
      "Ingeniería Mecánica",
      "Ingeniería Civil Mecánica",
      "Ingeniería en Química y Medio Ambiente",
      "Ingeniería en Computación e Informática",
      "Ingeniería Civil en Computación e Informática",
      "Arquitectura",
      "Técnico de Nivel Superior en Construcción",
      "Técnico de Nivel Superior en Mantenimiento Industrial",
      "Técnico de Nivel Superior en Procesos Industriales",
      "Técnico de Nivel Superior en Análisis de Sistemas Computacionales",
    ],
    carrerasOtras: ["Ingeniería Aeroespacial", "Ingeniería Mecatrónica", "Ingeniería en Minas", "Ingeniería Civil Industrial"],
  },
  {
    id: "calculo",
    nombre: "Cálculo",
    icono: "🔢",
    color: "#4C6FE0",
    descripcion:
      "Lo poseen quienes tienen interés en las matemáticas y disfrutan explorar patrones, formular teorías y resolver ecuaciones, siempre buscando precisión y exactitud en sus resultados. Desarrollan habilidades para la resolución de problemas, el cálculo complejo, el análisis de datos y el razonamiento lógico.",
    carrerasUMAG: [
      "Ingeniería en Construcción",
      "Ingeniería en Electricidad",
      "Ingeniería Civil en Electricidad",
      "Ingeniería Mecánica",
      "Ingeniería Civil Mecánica",
      "Ingeniería en Química y Medio Ambiente",
      "Ingeniería en Computación e Informática",
      "Ingeniería Civil en Computación e Informática",
      "Ingeniería Comercial",
      "Auditoría",
      "Pedagogía en Matemática",
      "Arquitectura",
    ],
    carrerasOtras: ["Economía", "Estadística", "Física"],
  },
  {
    id: "cientifica",
    nombre: "Científica",
    icono: "🔬",
    color: "#3FA796",
    descripcion:
      "Un alto interés en esta área indica aptitudes relacionadas con la investigación y el descubrimiento. Disfrutan trabajar con conceptos científicos, la experimentación y el análisis de problemas complejos, lo que permite desarrollar pensamiento lógico y crítico, y aprender a usar herramientas y teorías especializadas.",
    carrerasUMAG: [
      "Biología Marina",
      "Agronomía",
      "Medicina",
      "Enfermería",
      "Kinesiología",
      "Nutrición y Dietética",
      "Terapia Ocupacional",
      "Psicología",
      "Ingeniería en Química y Medio Ambiente",
      "Ingeniería Civil Química",
      "Fonoaudiología",
    ],
    carrerasOtras: ["Física", "Biología", "Química", "Bioquímica", "Odontología"],
  },
  {
    id: "persuasiva",
    nombre: "Persuasiva",
    icono: "🗣️",
    color: "#D6633B",
    descripcion:
      "Una alta puntuación en esta área indica una fuerte inclinación a la interacción social: habilidades blandas, comunicación eficaz y persuasión. Se relaciona con labores como la venta, la negociación, el liderazgo o la promoción de ideas.",
    carrerasUMAG: ["Psicología", "Derecho", "Trabajo Social", "Ingeniería Comercial", "Técnico de Nivel Superior en Administración"],
    carrerasOtras: ["Periodismo", "Publicidad", "Relaciones Públicas", "Ciencias Políticas", "Relaciones Internacionales"],
  },
  {
    id: "artistica",
    nombre: "Artística",
    icono: "🎨",
    color: "#C957A6",
    descripcion:
      "Aptitudes y características de las personas apasionadas por la creación de obras artísticas, como la pintura, el teatro, las manualidades, el diseño y la escritura. Destacan por su pensamiento creativo, su habilidad para transformar ideas en expresiones visuales o conceptuales, y su motivación por la autoexpresión a través del arte.",
    carrerasUMAG: ["Arquitectura", "Pedagogía en Educación Parvularia", "Pedagogía en Educación Básica"],
    carrerasOtras: ["Diseño Gráfico", "Bellas Artes", "Cine", "Teatro y Artes Escénicas"],
  },
  {
    id: "literaria",
    nombre: "Literaria",
    icono: "📖",
    color: "#8A5CD6",
    descripcion:
      "Indica un gran mundo interior, nutrido a través de la lectura, con capacidad de exteriorizarlo mediante el pensamiento creativo y la escritura. Permite desarrollar habilidades de análisis, imaginación y expresión escrita en ámbitos como la ciencia, la fantasía, el derecho o la lingüística.",
    carrerasUMAG: ["Pedagogía en Castellano y Comunicación", "Pedagogía en Historia y Ciencias Sociales", "Pedagogía en Educación Básica", "Pedagogía en Inglés", "Derecho"],
    carrerasOtras: ["Filosofía", "Periodismo", "Comunicación Social"],
  },
  {
    id: "musical",
    nombre: "Musical",
    icono: "🎵",
    color: "#57BFC9",
    descripcion:
      "Un alto puntaje en esta área muestra un profundo interés por la música, tanto de manera personal como profesional. Abarca la composición, la interpretación y la producción, y se complementa con otras formas de expresión como el uso de instrumentos, la danza, el canto y la creación audiovisual.",
    carrerasUMAG: ["Pedagogía en Música", "Fonoaudiología"],
    carrerasOtras: ["Danza", "Ingeniería en Sonido"],
  },
  {
    id: "social",
    nombre: "Servicio Social",
    icono: "🤝",
    color: "#E0527A",
    descripcion:
      "Un alto puntaje en esta área indica una persona empática y orientada al servicio, con un profundo deseo de ayudar a los demás. Disfrutan de actividades que implican interacción social, enfocadas en ayudar, enseñar y apoyar las necesidades de otros, lo que favorece el desarrollo de habilidades blandas y la capacidad de analizar roles sociales.",
    carrerasUMAG: [
      "Trabajo Social",
      "Psicología",
      "Derecho",
      "Medicina",
      "Enfermería",
      "Terapia Ocupacional",
      "Kinesiología",
      "Nutrición y Dietética",
      "Fonoaudiología",
      "Técnico de Nivel Superior en Enfermería",
      "Técnico de Nivel Superior en Educación Especial",
      "Técnico de Nivel Superior en Educación Parvularia",
    ],
    carrerasOtras: ["Sociología", "Antropología", "Criminología"],
  },
  {
    id: "oficina",
    nombre: "Oficina",
    icono: "🗂️",
    color: "#6A6178",
    descripcion:
      "Un alto interés en esta área indica una persona ordenada, que favorece el trabajo con documentos, datos y sistemas de administración. Permite desarrollar habilidades como la gestión de información, la administración de recursos y la organización de personas.",
    carrerasUMAG: [
      "Ingeniería Comercial",
      "Auditoría",
      "Derecho",
      "Técnico de Nivel Superior en Administración",
      "Técnico de Nivel Superior en Análisis de Sistemas Computacionales",
      "Ingeniería en Computación e Informática",
      "Ingeniería Civil en Computación e Informática",
    ],
    carrerasOtras: ["Contabilidad", "Economía", "Logística"],
  },
];

const UMBRAL_INTERES_KUDER = 7; // 7 o más = área de interés

function calcularAreasDeInteresKuder(puntajes) {
  return AREAS_KUDER.filter((a) => {
    const p = Number(puntajes[a.id]);
    return Number.isFinite(p) && p >= UMBRAL_INTERES_KUDER;
  });
}
