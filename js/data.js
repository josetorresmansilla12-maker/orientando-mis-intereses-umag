// Definición fija de las áreas del instrumento "Orientando mis Intereses" (8° básico).
// Puntaje máximo por área: 8 (4 preguntas x 2 puntos). Área de interés = 7 u 8 puntos.
//
// Las listas de "carreras UMAG" y "otras carreras" siguen los mismos criterios que las
// del Test de Kuder (js/kuder-data.js), adaptados a estas 6 áreas (distintas de las 10
// de Kuder, así que las combinaciones no son las mismas):
// - Carreras UMAG revisadas contra la oferta vigente publicada en admision.umag.cl
//   (32 profesionales y 13 técnicas de nivel superior, oferta Admisión 2027); cada
//   carrera de la oferta aparece en al menos un área, y puede estar en más de una.
// - "Otras carreras": solo carreras conocidas que la UMAG no imparte, sin repetir una
//   que ya ofrece con otro nombre (por ejemplo, Contabilidad = Auditoría), y sin las
//   que se sacaron de Kuder (Administración de Empresas, Licenciatura en Música,
//   Psicopedagogía, Mecánica Automotriz, Topografía, etc.). En cada área no superan en
//   número a las carreras UMAG.
//
// Cada área tiene dos descripciones para el informe del estudiante: "descripcion",
// cuando el área destacó (7 u 8 puntos), y "descripcionDiversa", cuando ninguna área
// destacó y los puntajes quedaron parejos (se muestran las 6 áreas, como intereses
// amplios y variados, sin hablar de un interés alto en esa área).
// Los textos dirigidos al estudiante están escritos en tono de posibilidad ("podría
// indicar que...", "es posible que..."): explican qué representa el área y qué podría
// abrirle, sin dar por hecho gustos, habilidades ni rasgos que la persona podría no
// reconocer en sí misma.

const AREAS = [
  {
    id: "ciencias",
    nombre: "Ciencias",
    icono: "🔬",
    color: "#4C6FE0",
    descripcion:
      "Esta área tiene que ver con la curiosidad por entender el porqué de las cosas: desde un experimento casero hasta preguntarse qué hay más allá del universo. Tu resultado podría indicar que te gustaría observar, probar y descubrir cómo funciona el mundo. Si te llama la atención una feria científica o un buen documental, es posible que las carreras de esta área tengan algo para ti.",
    descripcionDiversa:
      "Esta área tiene que ver con investigar, experimentar y descubrir cómo funciona el mundo. Tus puntajes fueron parejos, así que podría ser una de las varias cosas que te interesan. Si alguna vez te ha dado curiosidad el porqué de algo, podrías mirar las carreras de esta área para ver si alguna te llama la atención.",
    descripcionCorta: "¿Te gusta investigar, experimentar y descubrir cómo funciona el mundo?",
    carrerasUMAG: [
      "Biología Marina",
      "Agronomía",
      "Ingeniería en Química y Medio Ambiente",
      "Ingeniería Civil Química",
      "Técnico de Nivel Superior en Acuicultura",
    ],
    carrerasOtras: ["Biología", "Química", "Física", "Astronomía", "Geología"],
  },
  {
    id: "humanidades",
    nombre: "Humanidades y Ciencias Sociales",
    icono: "📚",
    color: "#3FA796",
    descripcion:
      "Esta área se relaciona con las personas y las palabras: escuchar historias, entender por qué la gente actúa como actúa, leer, escribir y debatir. Tu resultado podría indicar que te gustaría conversar, ponerte en el lugar del otro o expresar tus ideas. Con el tiempo, esto podría abrirte camino hacia carreras de educación, comunicación o ciencias sociales.",
    descripcionDiversa:
      "Esta área se relaciona con las personas y las palabras: conversar, leer, escribir y entender a los demás. Como quedó en un nivel parecido al de las otras áreas, podría ser uno más de tus intereses. Si te gusta una buena conversación o una buena historia, es posible que alguna carrera de esta área conecte contigo.",
    descripcionCorta: "¿Te interesa entender a las personas, comunicarte, leer y escribir?",
    carrerasUMAG: [
      "Pedagogía en Castellano y Comunicación",
      "Pedagogía en Historia y Ciencias Sociales",
      "Pedagogía en Educación Básica",
      "Pedagogía en Inglés",
      "Pedagogía en Matemática",
      "Pedagogía en Educación Física",
      "Pedagogía en Educación Diferencial",
      "Pedagogía en Educación Parvularia",
      "Derecho",
      "Psicología",
      "Trabajo Social",
      "Técnico de Nivel Superior en Educación Especial",
      "Técnico de Nivel Superior en Educación Parvularia",
    ],
    carrerasOtras: ["Filosofía", "Periodismo", "Sociología", "Antropología", "Ciencias Políticas", "Criminología"],
  },
  {
    id: "artistico",
    nombre: "Artístico-Expresivo",
    icono: "🎭",
    color: "#57BFC9",
    descripcion:
      "Esta área tiene que ver con expresarse creando: dibujar, bailar, actuar, cantar, diseñar o inventar algo nuevo. Tu resultado podría indicar que te gustaría usar el arte como una forma de comunicar lo que piensas y sientes. Si sigues explorando ese lado creativo, es posible que encuentres en él un camino de estudio o de trabajo, y no solo un pasatiempo.",
    descripcionDiversa:
      "Esta área tiene que ver con expresarse creando: dibujo, música, baile, actuación o diseño. En tus respuestas quedó a la par de las demás, así que podría ser parte de tus intereses variados. Si de vez en cuando disfrutas crear algo propio, podrías explorar las carreras de esta área.",
    descripcionCorta: "¿Te gusta expresarte creando: dibujo, música, baile, actuación o diseño?",
    carrerasUMAG: [
      "Arquitectura",
      "Pedagogía en Educación Parvularia",
      "Técnico de Nivel Superior en Educación Parvularia",
      "Pedagogía en Educación Básica",
      "Pedagogía en Música",
    ],
    carrerasOtras: ["Diseño Gráfico", "Bellas Artes", "Cine", "Teatro y Artes Escénicas", "Danza"],
  },
  {
    id: "tecnico",
    nombre: "Técnico-Manual",
    icono: "🔧",
    color: "#E39B3B",
    descripcion:
      "Esta área se relaciona con trabajar con las manos y resolver problemas prácticos: desarmar algo para ver cómo funciona, construir, reparar o mejorar. Tu resultado podría indicar que te gustaría entender cómo funcionan las cosas, desde una bicicleta hasta un computador. Con el tiempo, esto podría llevarte a desempeñarte bien en carreras técnicas, de construcción o de ingeniería.",
    descripcionDiversa:
      "Esta área se relaciona con construir, reparar y trabajar con las manos. Como tus puntajes fueron parejos, podría ser uno de los caminos que te interesa explorar, junto con otros. Si te da curiosidad cómo funciona un aparato por dentro, es posible que alguna carrera de esta área te parezca interesante.",
    descripcionCorta: "¿Te gusta construir, reparar y trabajar con las manos?",
    carrerasUMAG: [
      "Ingeniería en Construcción",
      "Ingeniería en Electricidad",
      "Ingeniería Civil en Electricidad",
      "Ingeniería Mecánica",
      "Ingeniería Civil Mecánica",
      "Ingeniería en Computación e Informática",
      "Ingeniería Civil en Computación e Informática",
      "Arquitectura",
      "Técnico de Nivel Superior en Construcción",
      "Técnico de Nivel Superior en Mantenimiento Industrial",
      "Técnico de Nivel Superior en Procesos Industriales",
      "Técnico de Nivel Superior en Análisis de Sistemas Computacionales",
      "Técnico de Nivel Superior en Instrumentación y Automatización Industrial",
      "Técnico de Nivel Superior en Eficiencia Energética y Energías No Convencionales",
      "Técnico de Nivel Superior en Prevención de Riesgos",
    ],
    carrerasOtras: ["Ingeniería Aeroespacial", "Ingeniería Mecatrónica", "Ingeniería en Minas", "Ingeniería Civil Industrial"],
  },
  {
    id: "salud",
    nombre: "Salud y Cuidado",
    icono: "🩺",
    color: "#E0527A",
    descripcion:
      "Esta área tiene que ver con cuidar, acompañar y ayudar a otros a sentirse mejor, ya sean personas o animales. Tu resultado podría indicar que te gustaría estar cerca de quienes lo necesitan y aportar a su bienestar. Si te imaginas trabajando en salud o en el cuidado de otros, es posible que en esta área encuentres opciones que valga la pena conocer.",
    descripcionDiversa:
      "Esta área tiene que ver con cuidar y ayudar a personas o animales. En tus respuestas no se destacó por sobre las demás, lo que podría indicar que es uno más de tus intereses. Si alguna vez te ha gustado acompañar o ayudar a alguien, podrías revisar las carreras de esta área.",
    descripcionCorta: "¿Te gusta cuidar y ayudar a personas o animales?",
    carrerasUMAG: [
      "Medicina",
      "Enfermería",
      "Kinesiología",
      "Nutrición y Dietética",
      "Terapia Ocupacional",
      "Fonoaudiología",
      "Psicología",
      "Técnico de Nivel Superior en Enfermería",
    ],
    carrerasOtras: ["Odontología", "Química y Farmacia", "Obstetricia", "Tecnología Médica", "Veterinaria"],
  },
  {
    id: "administracion",
    nombre: "Administración y Negocios",
    icono: "💼",
    color: "#8A5CD6",
    descripcion:
      "Esta área se relaciona con organizar, planificar, liderar y hacer que un proyecto funcione, desde una venta en el colegio hasta un emprendimiento propio. Tu resultado podría indicar que te gustaría tomar decisiones, coordinar equipos o darle forma a una idea de negocio. Con el tiempo, esto podría abrirte camino hacia carreras de administración, economía o gestión.",
    descripcionDiversa:
      "Esta área se relaciona con organizar, liderar y hacer que un proyecto funcione. Como quedó en un nivel parecido al de las otras áreas, podría ser parte de tus intereses variados. Si te gusta planificar o se te ocurren ideas para emprender, es posible que alguna carrera de esta área tenga algo para ti.",
    descripcionCorta: "¿Te gusta organizar, liderar y hacer que un proyecto funcione?",
    carrerasUMAG: [
      "Ingeniería Comercial",
      "Auditoría",
      "Técnico de Nivel Superior en Administración",
      "Técnico de Nivel Superior en Turismo Sostenible",
      "Técnico de Nivel Superior en Análisis de Sistemas Computacionales",
      "Ingeniería en Computación e Informática",
      "Ingeniería Civil en Computación e Informática",
      "Derecho",
    ],
    carrerasOtras: ["Economía", "Administración Pública", "Marketing", "Logística", "Ingeniería en Recursos Humanos"],
  },
];

const PUNTAJE_MIN = 0;
const PUNTAJE_MAX = 8;
const UMBRAL_INTERES = 7; // 7 u 8 = área de interés

function calcularAreasDeInteres(puntajes) {
  return AREAS.filter((a) => {
    const p = Number(puntajes[a.id]);
    return Number.isFinite(p) && p >= UMBRAL_INTERES && p <= PUNTAJE_MAX;
  });
}
