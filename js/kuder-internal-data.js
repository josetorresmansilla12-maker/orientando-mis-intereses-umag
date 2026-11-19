// Carreras "potenciales" por área del Test de Kuder — SOLO para el informe interno de
// Admisión y Marketing (js/kuder-internal-report.js). Es una lista independiente de
// AREAS_KUDER.carrerasOtras (la que usa el informe para orientadores, en js/kuder-data.js):
// esa otra lista busca mostrarle opciones amplias a un estudiante; esta busca ser corta
// y estratégica — las carreras de mayor demanda/relevancia que la UMAG todavía NO
// imparte, como insumo para evaluar una futura oferta académica. Se puede editar esta
// lista sin tocar la del informe de orientadores, y viceversa.
//
// Selección editorial (punto de partida, a afinar con el tiempo), priorizando carreras
// de alta demanda conocida o con relevancia regional (Magallanes: minería, energía,
// pesca/acuicultura, turismo). Como regla general se procura que esta lista NO supere
// en número a AREAS_KUDER.carrerasUMAG de la misma área (js/kuder-data.js) — salvo en
// las áreas donde la UMAG ofrece muy pocas carreras propias (Artística: 4, Musical: 2),
// donde sí se agregaron más opciones para que el cuadro tenga contenido suficiente.
// No incluye carreras que la UMAG ya imparte con otro nombre (por ejemplo, "Contador
// Auditor" = Auditoría, "Ingeniería Agronómica" = Agronomía), ni las que se parecen
// demasiado a una que ya imparte (mismo criterio que "otras carreras" en los informes
// para orientadores): Mecánica Automotriz (Ingeniería Mecánica), Licenciatura en
// Música (Pedagogía en Música), Licenciatura en Matemáticas (Pedagogía en Matemática),
// Psicopedagogía (Pedagogía en Educación Diferencial) y Traducción e Interpretación
// (Pedagogía en Inglés).
const CARRERAS_POTENCIALES_KUDER = {
  exterior: ["Medicina Veterinaria", "Ingeniería Forestal", "Geología", "Ciencias Ambientales", "Oceanografía"],
  // sin "Mecánica Automotriz": la UMAG ya imparte Ingeniería Mecánica, así que es redundante
  mecanica: ["Ingeniería en Minas", "Ingeniería Mecatrónica", "Ingeniería Aeroespacial", "Ingeniería en Robótica"],
  calculo: ["Ingeniería Civil Industrial", "Economía", "Estadística", "Ingeniería en Telecomunicaciones"],
  cientifica: ["Odontología", "Química y Farmacia", "Tecnología Médica", "Medicina Veterinaria", "Bioquímica", "Ingeniería Biomédica"],
  persuasiva: ["Publicidad", "Marketing", "Relaciones Públicas", "Ciencias Políticas", "Relaciones Internacionales"],
  // Artística: la UMAG solo ofrece 4 carreras en esta área — se amplía la lista más
  // que en las demás para reflejar cuánta oferta relevante falta.
  artistica: ["Diseño Gráfico", "Gastronomía", "Diseño Industrial", "Cine", "Licenciatura en Artes Visuales", "Teatro y Artes Escénicas", "Diseño de Moda"],
  literaria: ["Periodismo", "Comunicación Audiovisual", "Licenciatura en Letras", "Comunicación Social"],
  // Musical: la UMAG solo ofrece 2 carreras en esta área — mismo criterio que Artística.
  musical: ["Interpretación Musical", "Composición Musical", "Ingeniería en Sonido", "Producción Musical"],
  social: ["Sociología", "Criminología", "Antropología", "Obstetricia"],
  oficina: ["Administración Pública", "Ingeniería en Recursos Humanos", "Logística", "Comercio Internacional"],
};

// Perfil ajustado SOLO para la Tabla 4 del informe interno (no cambia las tarjetas de área
// ni los informes para orientadores y estudiantes). Son las carreras a las que la lista de
// orientación les asigna una sola área: con una sola área, cualquier estudiante que tenga
// ese interés "calza", y la carrera queda inflada frente a las de 2 o más áreas. Acá se les
// da un perfil de 2 áreas, como al resto. Propuesta inicial: revisar con la unidad.
const PERFILES_AJUSTADOS_TABLA4_KUDER = {
  "Técnico de Nivel Superior en Mantenimiento Industrial": ["mecanica", "calculo"],
  "Técnico de Nivel Superior en Enfermería": ["cientifica", "social"],
  "Pedagogía en Educación Diferencial": ["artistica", "social"],
  "Técnico de Nivel Superior en Educación Especial": ["artistica", "social"],
};
