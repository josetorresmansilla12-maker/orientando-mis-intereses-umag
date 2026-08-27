// Definición fija de las áreas del instrumento "Orientando mis Intereses" (8° básico).
// Puntaje máximo por área: 8 (4 preguntas x 2 puntos). Área de interés = 7 u 8 puntos.
//
// Las listas de "carreras UMAG" y "otras carreras" son una propuesta de alineación,
// armada a partir de las carreras que ya se usan para las 10 áreas del test de
// Kuder, agrupadas hacia estas 6 áreas nuevas. Es un punto de partida razonable,
// pero como el propio profesional lo señaló, hay zonas grises (por ejemplo,
// Psicología o Medicina podrían calzar en más de un área) — se puede ajustar
// cualquier carrera específica sin problema.

const AREAS = [
  {
    id: "ciencias",
    nombre: "Ciencias",
    icono: "🔬",
    color: "#4C6FE0",
    descripcion:
      "¿Eres de los que no se conforma con un \"porque sí\" y necesita entender el motivo real de las cosas? Desde experimentos caseros hasta preguntarte qué hay más allá del universo, esta área es para los curiosos que disfrutan observar, probar y descubrir. Si te late armar una feria científica o ver documentales hasta tarde, vas por buen camino.",
    descripcionCorta: "¿Te gusta investigar, experimentar y descubrir cómo funciona el mundo?",
    carrerasUMAG: [
      "Biología Marina",
      "Agronomía",
      "Ingeniería en Química y Medio Ambiente",
      "Ingeniería Civil Química",
      "Técnico de Nivel Superior en Acuicultura",
    ],
    carrerasOtras: ["Física", "Biología", "Química", "Astrofísica", "Geología"],
  },
  {
    id: "humanidades",
    nombre: "Humanidades y Ciencias Sociales",
    icono: "📚",
    color: "#3FA796",
    descripcion:
      "Si te encanta escuchar historias, entender por qué la gente actúa como actúa, o simplemente conversar de todo con quien se deje, esta área probablemente conecta contigo. Aquí están los que leen, escriben, debaten y se ponen en el lugar del otro: futuros profesores, periodistas, psicólogos y defensores de causas.",
    descripcionCorta: "¿Te interesa entender a las personas, comunicarte, leer y escribir?",
    carrerasUMAG: [
      "Pedagogía en Castellano y Comunicación",
      "Pedagogía en Historia y Ciencias Sociales",
      "Pedagogía en Educación Básica",
      "Pedagogía en Inglés",
      "Pedagogía en Matemática",
      "Pedagogía en Educación Física",
      "Pedagogía en Educación Diferencial",
      "Técnico de Nivel Superior en Educación Especial",
      "Derecho",
      "Psicología",
      "Trabajo Social",
    ],
    carrerasOtras: ["Filosofía", "Periodismo", "Sociología", "Antropología", "Ciencias Políticas", "Criminología"],
  },
  {
    id: "artistico",
    nombre: "Artístico-Expresivo",
    icono: "🎭",
    color: "#57BFC9",
    descripcion:
      "¿Tienes una libreta llena de dibujos, un playlist para cada estado de ánimo, o simplemente necesitas expresarte de alguna forma? Si vives creando —dibujando, bailando, actuando, cantando o inventando algo nuevo— esta área es para ti. Aquí el arte no es un hobby más, es tu forma de comunicar lo que sientes.",
    descripcionCorta: "¿Te gusta expresarte creando: dibujo, música, baile, actuación o diseño?",
    carrerasUMAG: [
      "Arquitectura",
      "Pedagogía en Educación Parvularia",
      "Técnico de Nivel Superior en Educación Parvularia",
      "Pedagogía en Educación Básica",
      "Pedagogía en Música",
    ],
    carrerasOtras: ["Diseño Gráfico", "Cine", "Bellas Artes", "Danza", "Licenciatura en Música"],
  },
  {
    id: "tecnico",
    nombre: "Técnico-Manual",
    icono: "🔧",
    color: "#E39B3B",
    descripcion:
      "Si te gusta desarmar cosas para ver cómo funcionan (y a veces lograr armarlas de nuevo), trabajar con las manos y resolver problemas prácticos, esta área es la tuya. Acá se forman quienes construyen, reparan y hacen que las cosas funcionen, desde una bicicleta hasta un computador.",
    descripcionCorta: "¿Te gusta construir, reparar y trabajar con las manos?",
    carrerasUMAG: [
      "Ingeniería en Construcción",
      "Ingeniería en Electricidad",
      "Ingeniería Civil en Electricidad",
      "Ingeniería Mecánica",
      "Ingeniería Civil Mecánica",
      "Ingeniería en Computación e Informática",
      "Ingeniería Civil en Computación e Informática",
      "Técnico de Nivel Superior en Construcción",
      "Técnico de Nivel Superior en Mantenimiento Industrial",
      "Técnico de Nivel Superior en Procesos Industriales",
      "Técnico de Nivel Superior en Análisis de Sistemas Computacionales",
      "Técnico de Nivel Superior en Instrumentación y Automatización Industrial",
      "Técnico de Nivel Superior en Eficiencia Energética y Energías No Convencionales",
      "Técnico de Nivel Superior en Prevención de Riesgos",
    ],
    carrerasOtras: [
      "Mecánica Automotriz",
      "Ingeniería Aeroespacial",
      "Ingeniería Mecatrónica",
      "Ingeniería en Minas",
      "Ingeniería Civil Industrial",
      "Topografía",
    ],
  },
  {
    id: "salud",
    nombre: "Salud y Cuidado",
    icono: "🩺",
    color: "#E0527A",
    descripcion:
      "¿Eres de los que se preocupa cuando ve a alguien pasándola mal, y quiere ayudar? Esta área junta a quienes disfrutan cuidar, acompañar y hacer sentir mejor a otros, ya sea personas o animales. Si te imaginas trabajando en salud, ayudando a la gente día a día, aquí puede estar tu vocación.",
    descripcionCorta: "¿Te gusta cuidar y ayudar a personas o animales?",
    carrerasUMAG: [
      "Medicina",
      "Enfermería",
      "Kinesiología",
      "Nutrición y Dietética",
      "Terapia Ocupacional",
      "Fonoaudiología",
      "Técnico de Nivel Superior en Enfermería",
    ],
    carrerasOtras: ["Odontología", "Química y Farmacéutica", "Veterinaria", "Técnico en Servicio Social", "Psicopedagogía"],
  },
  {
    id: "administracion",
    nombre: "Administración y Negocios",
    icono: "💼",
    color: "#8A5CD6",
    descripcion:
      "¿Se te ocurren ideas de negocio todo el tiempo, o te gusta organizar, liderar y que las cosas salgan bien planificadas? Esta área es para quienes disfrutan tomar decisiones, coordinar equipos y hacer que un proyecto funcione, desde una venta en el colegio hasta tu propio emprendimiento.",
    descripcionCorta: "¿Te gusta organizar, liderar y hacer que un proyecto funcione?",
    carrerasUMAG: [
      "Ingeniería Comercial",
      "Auditoría",
      "Técnico de Nivel Superior en Administración",
      "Técnico de Nivel Superior en Turismo Sostenible",
      "Técnico de Nivel Superior en Análisis de Sistemas Computacionales",
      "Ingeniería en Computación e Informática",
      "Derecho",
    ],
    carrerasOtras: ["Economía", "Administración de Empresas", "Contabilidad", "Marketing", "Logística", "Relaciones Internacionales"],
  },
];

const PUNTAJE_MIN = 0;
const PUNTAJE_MAX = 8;
const UMBRAL_INTERES = 7; // 7 u 8 = área de interés

const MENSAJE_SIN_AREA = {
  titulo: "Intereses diversos",
  texto:
    "Según tus respuestas, no se identificó un área de interés que destacara claramente por sobre las demás — ¡y eso también dice algo bueno de ti! Significa que tienes una curiosidad amplia y variada, sin encasillarte todavía en un solo camino. A tu edad es completamente normal: recién estás empezando a descubrir qué te apasiona, y tienes mucho tiempo por delante para seguir explorando. " +
    "Aquí te dejamos todas las carreras que imparte la UMAG, organizadas por área, para que sigas conociendo tus opciones. Este es solo el comienzo de tu camino — ¡y las posibilidades son muchas!",
};

function calcularAreasDeInteres(puntajes) {
  return AREAS.filter((a) => {
    const p = Number(puntajes[a.id]);
    return Number.isFinite(p) && p >= UMBRAL_INTERES && p <= PUNTAJE_MAX;
  });
}
