// Datos del Test Vocacional de Kuder (Enseñanza Media) — independiente del cuestionario
// "Orientando mis Intereses" de 8° básico (no comparte ids, colores ni funciones con
// js/data.js). Las 10 áreas salen del documento "Kuder - Descripciones por área con
// carreras UMAG y otras carreras" y del informe de muestra de Kuder.
//
// Cada área tiene tres textos:
// - descripcion: redactada para el orientador (tercera persona), la usan los informes
//   grupales por curso y global (js/kuder-report.js).
// - descripcionEstudiante: la del informe de muestra de Kuder, dirigida al estudiante
//   (con ortografía corregida), la usa el informe individual (js/kuder-individual-report.js).
// - descripcionCorta: una línea, para la hoja informativa del informe individual.
//
// Carreras UMAG revisadas contra la oferta vigente publicada en admision.umag.cl
// (32 carreras profesionales y 13 técnicas de nivel superior). Las "otras carreras"
// son solo carreras conocidas que la UMAG no imparte, y en cada área no superan en
// número a las carreras UMAG.
//
// Regla de corrección: puntaje 7 o más en un área = área de interés para ese estudiante
// (escala por área de 0 a 9; las 10 áreas de un estudiante suman 45).

const AREAS_KUDER = [
  {
    id: "exterior",
    nombre: "Exterior",
    icono: "🌳",
    color: "#4CAF6E",
    descripcion:
      "Esta área representa a personas con aptitudes para la exploración y la conexión con la naturaleza. Prefieren las actividades al aire libre y pasar más tiempo en entornos naturales, lo que favorece el conocimiento del medio, la capacidad de respuesta ante emergencias y la creatividad para usar herramientas con pocos recursos.",
    descripcionEstudiante:
      "Esta área de interés representa a personas con aptitudes para la exploración y la conexión con la naturaleza. Prefieres las actividades al aire libre y pasar más tiempo en entornos naturales, lo que te permite adquirir conocimiento de la naturaleza, capacidad de respuesta ante emergencias y creatividad en el uso de herramientas en entornos con pocos recursos.",
    descripcionCorta: "Actividades al aire libre y en contacto con la naturaleza.",
    carrerasUMAG: [
      "Agronomía",
      "Biología Marina",
      "Ingeniería en Química y Medio Ambiente",
      "Ingeniería Civil Química",
      "Pedagogía en Educación Física",
      "Arquitectura",
      "Ingeniería en Construcción",
      "Técnico de Nivel Superior en Acuicultura",
      "Técnico de Nivel Superior en Eficiencia Energética y Energías No Convencionales",
      "Técnico de Nivel Superior en Construcción",
      "Técnico de Nivel Superior en Turismo Sostenible",
      "Técnico de Nivel Superior en Prevención de Riesgos",
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
    descripcionEstudiante:
      "Las personas con este interés destacan por sus aptitudes y características centradas en el pensamiento práctico y la acción manual. Son hábiles en el uso de herramientas especializadas, así como en la reparación, mantenimiento y creación de equipos mecánicos, electrónicos y virtuales, trabajando con eficacia y satisfacción en estas áreas.",
    descripcionCorta: "Trabajar con máquinas, herramientas y equipos.",
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
      "Técnico de Nivel Superior en Instrumentación y Automatización Industrial",
      "Técnico de Nivel Superior en Eficiencia Energética y Energías No Convencionales",
      "Técnico de Nivel Superior en Análisis de Sistemas Computacionales",
      "Técnico de Nivel Superior en Prevención de Riesgos",
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
    descripcionEstudiante:
      "Lo poseen aquellas personas con interés en las matemáticas, que disfrutan explorar patrones, formular teorías y resolver ecuaciones, siempre buscando precisión y exactitud en sus resultados. Además, presentan la capacidad de desarrollar aptitudes y habilidades relacionadas con la resolución de problemas, el cálculo complejo, el análisis de datos y el razonamiento lógico.",
    descripcionCorta: "Trabajar con números, datos y problemas lógicos.",
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
      // técnicas que trabajan con números y lógica (cálculo de materiales, contabilidad
      // básica, programación). Musical y Literaria no tienen técnicas: ninguna de las 13
      // que ofrece la UMAG se relaciona con la música o con la lectura y la escritura.
      "Técnico de Nivel Superior en Construcción",
      "Técnico de Nivel Superior en Administración",
      "Técnico de Nivel Superior en Análisis de Sistemas Computacionales",
    ],
    carrerasOtras: ["Economía", "Estadística", "Física", "Ingeniería Civil Industrial"],
  },
  {
    id: "cientifica",
    nombre: "Científica",
    icono: "🔬",
    color: "#3FA796",
    descripcion:
      "Un alto interés en esta área indica aptitudes relacionadas con la investigación y el descubrimiento. Disfrutan trabajar con conceptos científicos, la experimentación y el análisis de problemas complejos, lo que permite desarrollar pensamiento lógico y crítico, y aprender a usar herramientas y teorías especializadas.",
    descripcionEstudiante:
      "Un alto interés en el área científica indica que eres una persona con aptitudes y características que se relacionan con la investigación y los descubrimientos. Disfrutas trabajando con conceptos científicos, la experimentación y el análisis de problemas complejos. Lo anterior te permite desarrollar habilidades de pensamiento lógico y crítico, así como aprender a usar herramientas especializadas y teorías complejas.",
    descripcionCorta: "Investigar, experimentar y descubrir.",
    carrerasUMAG: [
      "Biología Marina",
      "Agronomía",
      "Medicina",
      "Enfermería",
      "Kinesiología",
      "Nutrición y Dietética",
      "Terapia Ocupacional",
      "Fonoaudiología",
      "Psicología",
      "Ingeniería en Química y Medio Ambiente",
      "Ingeniería Civil Química",
      "Técnico de Nivel Superior en Acuicultura",
    ],
    carrerasOtras: ["Biología", "Química", "Física", "Bioquímica", "Química y Farmacia", "Odontología", "Tecnología Médica"],
  },
  {
    id: "persuasiva",
    nombre: "Persuasiva",
    icono: "🗣️",
    color: "#D6633B",
    descripcion:
      "Una alta puntuación en esta área indica una fuerte inclinación a la interacción social: habilidades blandas, comunicación eficaz y persuasión. Se relaciona con labores como la venta, la negociación, el liderazgo o la promoción de ideas.",
    descripcionEstudiante:
      "Una alta puntuación en esta área indica que eres una persona con una fuerte inclinación a la interacción social. Las características de este perfil suelen ser las habilidades blandas, la comunicación eficaz y la persuasión. Las labores que se relacionan con él son la venta, la negociación, el liderazgo y la promoción de ideas.",
    descripcionCorta: "Convencer, liderar, negociar y promover ideas.",
    carrerasUMAG: [
      "Psicología",
      "Derecho",
      "Trabajo Social",
      "Ingeniería Comercial",
      "Técnico de Nivel Superior en Administración",
      "Técnico de Nivel Superior en Turismo Sostenible",
    ],
    carrerasOtras: ["Periodismo", "Publicidad", "Relaciones Públicas", "Ciencias Políticas", "Relaciones Internacionales"],
  },
  {
    id: "artistica",
    nombre: "Artística",
    icono: "🎨",
    color: "#C957A6",
    descripcion:
      "Aptitudes y características de las personas apasionadas por la creación de obras artísticas, como la pintura, el teatro, las manualidades, el diseño y la escritura. Destacan por su pensamiento creativo, su habilidad para transformar ideas en expresiones visuales o conceptuales, y su motivación por la autoexpresión a través del arte.",
    descripcionEstudiante:
      "Aptitudes y características que se presentan en las personas apasionadas por la creación de obras artísticas, como la pintura, el teatro, las manualidades, el diseño y la escritura. Estas personas destacan por su pensamiento creativo, su habilidad para transformar ideas en expresiones visuales o conceptuales, y su motivación para generar formas de autoexpresión a través del arte.",
    descripcionCorta: "Crear: dibujo, pintura, diseño, teatro y manualidades.",
    carrerasUMAG: [
      "Arquitectura",
      "Pedagogía en Educación Parvularia",
      "Pedagogía en Educación Básica",
      "Técnico de Nivel Superior en Educación Parvularia",
    ],
    carrerasOtras: ["Diseño Gráfico", "Bellas Artes", "Cine", "Teatro y Artes Escénicas"],
  },
  {
    id: "literaria",
    nombre: "Literaria",
    icono: "📖",
    color: "#8A5CD6",
    descripcion:
      "Indica un gran mundo interior, nutrido a través de la lectura, con capacidad de exteriorizarlo mediante el pensamiento creativo y la escritura. Permite desarrollar habilidades de análisis, imaginación y expresión escrita en ámbitos como la ciencia, la fantasía, el derecho o la lingüística.",
    descripcionEstudiante:
      "Esta área de interés indica que eres una persona con un gran mundo interior, nutrido a través de la lectura, y con la capacidad de exteriorizarlo a través del pensamiento creativo y la escritura. Te permite desarrollar habilidades como el análisis, la imaginación y la expresión escrita en diferentes ámbitos, como la ciencia, la fantasía, las leyes o la lingüística.",
    descripcionCorta: "Leer, escribir y expresar ideas con palabras.",
    carrerasUMAG: [
      "Pedagogía en Castellano y Comunicación",
      "Pedagogía en Historia y Ciencias Sociales",
      "Pedagogía en Educación Básica",
      "Pedagogía en Inglés",
      "Derecho",
      "Psicología",
    ],
    carrerasOtras: ["Periodismo", "Filosofía", "Licenciatura en Literatura", "Licenciatura en Historia"],
  },
  {
    id: "musical",
    nombre: "Musical",
    icono: "🎵",
    color: "#57BFC9",
    descripcion:
      "Un alto puntaje en esta área muestra un profundo interés por la música, tanto de manera personal como profesional. Abarca la composición, la interpretación y la producción, y se complementa con otras formas de expresión como el uso de instrumentos, la danza, el canto y la creación audiovisual.",
    descripcionEstudiante:
      "Las personas con un alto puntaje en esta área muestran un profundo interés por la música, tanto de manera personal como profesional. Este interés abarca diversas ramas, como la composición, la interpretación y la producción, y se complementa con distintas formas de expresión, como el uso de instrumentos, la danza, el canto y la creación audiovisual.",
    descripcionCorta: "Escuchar, interpretar, cantar o crear música.",
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
    descripcionEstudiante:
      "Un alto puntaje en esta área indica que eres una persona empática y orientada al servicio, con un profundo deseo de ayudar a los demás. Disfrutas de actividades que implican interacción social, enfocándote en ayudar, enseñar y apoyar a otras personas en sus necesidades. Esto favorece el desarrollo de habilidades blandas y la capacidad de analizar los roles sociales.",
    descripcionCorta: "Ayudar, enseñar y acompañar a otros.",
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
      // todas las pedagogías (enseñar es parte de esta área; así también en el documento
      // "Kuder - Descripciones por área con carreras UMAG y otras carreras")
      "Pedagogía en Educación Diferencial",
      "Pedagogía en Educación Parvularia",
      "Pedagogía en Educación Básica",
      "Pedagogía en Castellano y Comunicación",
      "Pedagogía en Historia y Ciencias Sociales",
      "Pedagogía en Inglés",
      "Pedagogía en Matemática",
      "Pedagogía en Música",
      "Pedagogía en Educación Física",
      "Técnico de Nivel Superior en Enfermería",
      "Técnico de Nivel Superior en Educación Especial",
      "Técnico de Nivel Superior en Educación Parvularia",
    ],
    carrerasOtras: ["Sociología", "Antropología", "Criminología", "Obstetricia"],
  },
  {
    id: "oficina",
    nombre: "Oficina",
    icono: "🗂️",
    color: "#6A6178",
    descripcion:
      "Un alto interés en esta área indica una persona ordenada, que favorece el trabajo con documentos, datos y sistemas de administración. Permite desarrollar habilidades como la gestión de información, la administración de recursos y la organización de personas.",
    descripcionEstudiante:
      "Un alto interés en esta área indica que eres una persona ordenada y que prefieres el trabajo con documentos, datos y sistemas de administración. Esta área te permite aprender habilidades como la gestión de información, la administración de dinero o la organización de personas.",
    descripcionCorta: "Organizar documentos, datos y tareas administrativas.",
    carrerasUMAG: [
      "Ingeniería Comercial",
      "Auditoría",
      "Derecho",
      "Ingeniería en Computación e Informática",
      "Ingeniería Civil en Computación e Informática",
      "Técnico de Nivel Superior en Administración",
      "Técnico de Nivel Superior en Análisis de Sistemas Computacionales",
    ],
    carrerasOtras: ["Administración Pública", "Economía", "Ingeniería en Recursos Humanos", "Logística"],
  },
];

const UMBRAL_INTERES_KUDER = 7; // 7 o más = área de interés
const PUNTAJE_MIN_KUDER = 0;
const PUNTAJE_MAX_KUDER = 9;

function calcularAreasDeInteresKuder(puntajes) {
  return AREAS_KUDER.filter((a) => {
    const p = Number(puntajes[a.id]);
    return Number.isFinite(p) && p >= UMBRAL_INTERES_KUDER;
  });
}

// ==================== revisión de traspaso (suma de 45) ====================
// El Test de Kuder reparte siempre 45 puntos entre las 10 áreas. Si la suma de un
// estudiante no da 45, es porque al traspasar la hoja de respuestas al cuadro de
// búsqueda se saltó (o repitió) alguna alternativa. Esta revisión dice, además, si
// vale la pena buscar el error: solo importa si podría cambiar sus áreas de interés.
//
// - Si FALTAN puntos: un área que hoy tiene menos de 7 podría llegar a 7 o más si
//   los puntos faltantes le correspondían (se prueba sumándole todos los que faltan).
// - Si SOBRAN puntos: un área que hoy tiene 7 o más podría bajar de 7 si los puntos
//   de más estaban en ella (se prueba restándole todos los que sobran).
// Si ninguna área puede cambiar de lado del 7, los resultados quedan iguales y no
// hace falta buscar el error.

const SUMA_ESPERADA_KUDER = 45;

function analizarTraspasoKuder(puntajes) {
  const valores = AREAS_KUDER.map((area) => {
    const p = Number(puntajes[area.id]);
    return { area, puntaje: Number.isFinite(p) ? p : 0 };
  });
  const total = valores.reduce((acc, v) => acc + v.puntaje, 0);
  const diferencia = SUMA_ESPERADA_KUDER - total; // > 0: faltan puntos; < 0: sobran
  if (diferencia === 0) return { total, diferencia, estado: "ok", afecta: false, areas: [] };

  let areas;
  if (diferencia > 0) {
    areas = valores.filter((v) => v.puntaje < UMBRAL_INTERES_KUDER && v.puntaje + diferencia >= UMBRAL_INTERES_KUDER);
  } else {
    areas = valores.filter((v) => v.puntaje >= UMBRAL_INTERES_KUDER && v.puntaje + diferencia < UMBRAL_INTERES_KUDER);
  }
  return { total, diferencia, estado: diferencia > 0 ? "faltan" : "sobran", afecta: areas.length > 0, areas };
}

// "✓ Dejar así": cuando se revisa la hoja de respuestas y el puntaje se deja como está
// (por ejemplo, porque el punto que falta o sobra no cambia sus resultados), el
// estudiante guarda la "huella" de los puntajes que se aceptaron. Mientras sus
// puntajes sigan siendo esos, deja de aparecer como pendiente y su informe sale sin la
// marca "(44 de 45)"; si después se cambian, se vuelve a revisar.
function huellaPuntajesKuder(puntajes) {
  return AREAS_KUDER.map((a) => Number(puntajes[a.id]) || 0).join(",");
}

function traspasoDejadoAsiKuder(estudiante) {
  return !!estudiante.traspasoAceptado && estudiante.traspasoAceptado === huellaPuntajesKuder(estudiante.puntajes);
}

// textos para mostrar el resultado de analizarTraspasoKuder: "resumen" (suma y
// cuántos puntos faltan o sobran), "accion" (si hay que buscar el error o no) y
// "detalle" (qué áreas podrían cambiar). Sin HTML: el llamador lo escapa si hace falta.
function describirTraspasoKuder(analisis) {
  const { total, diferencia, estado, afecta, areas } = analisis;
  if (estado === "ok") return { resumen: `Suma ${total} de ${SUMA_ESPERADA_KUDER}`, accion: "Test bien traspasado", detalle: "", afecta: false };

  const n = Math.abs(diferencia);
  const faltan = estado === "faltan";
  const resumen = `Suma ${total} de ${SUMA_ESPERADA_KUDER} (${faltan ? (n === 1 ? "falta 1 punto" : `faltan ${n} puntos`) : n === 1 ? "sobra 1 punto" : `sobran ${n} puntos`})`;
  const elError = faltan
    ? n === 1 ? "el punto faltante" : `los ${n} puntos faltantes`
    : n === 1 ? "el punto que sobra" : `los ${n} puntos que sobran`;

  let accion;
  let detalle;
  if (!afecta) {
    accion = `No es necesario buscar ${elError}`;
    detalle = faltan
      ? `Aunque ${n === 1 ? "se sume" : "se sumen"} a cualquier área, ninguna llega a 7: sus resultados quedan iguales.`
      : `Aunque ${n === 1 ? "se reste" : "se resten"} de cualquier área, sus áreas de interés siguen siendo las mismas.`;
  } else {
    accion = `Hay que buscar ${elError}`;
    const lista = areas.map((v) => `${v.area.nombre} (tiene ${v.puntaje})`);
    const nombres = lista.length <= 4 ? unirListaKuder(lista, "o") : `${lista.slice(0, 3).join(", ")} y ${lista.length - 3} áreas más`;
    if (faltan) {
      detalle = `${nombres} ${areas.length === 1 ? "podría llegar a 7 y volverse área de interés" : "podrían llegar a 7 y volverse áreas de interés"}.`;
    } else {
      detalle = `${nombres} ${areas.length === 1 ? "podría bajar de 7 y dejar de ser área de interés" : "podrían bajar de 7 y dejar de ser áreas de interés"}.`;
    }
  }
  if (n >= 5) detalle += " La diferencia es grande: revisa que la fila se haya ingresado completa.";
  return { resumen, accion, detalle, afecta };
}

// ["A", "B", "C"] → "A, B o C"
function unirListaKuder(lista, conjuncion) {
  if (lista.length <= 1) return lista.join("");
  return `${lista.slice(0, -1).join(", ")} ${conjuncion} ${lista[lista.length - 1]}`;
}
