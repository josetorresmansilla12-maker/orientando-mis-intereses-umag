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
// las áreas donde la UMAG ofrece muy pocas carreras propias (Artística: 3, Musical: 2),
// donde sí se agregaron más opciones para que el cuadro tenga contenido suficiente.
const CARRERAS_POTENCIALES_KUDER = {
  exterior: ["Veterinaria", "Ingeniería Forestal", "Geología", "Ciencias Ambientales", "Ingeniería Agronómica"],
  mecanica: ["Ingeniería en Minas", "Ingeniería Mecatrónica", "Mecánica Automotriz", "Ingeniería Aeroespacial", "Ingeniería en Robótica"],
  calculo: ["Estadística", "Ingeniería Civil Industrial", "Licenciatura en Matemáticas", "Ingeniería en Telecomunicaciones"],
  cientifica: ["Odontología", "Química y Farmacia", "Bioquímica", "Ingeniería Biomédica", "Medicina Veterinaria"],
  persuasiva: ["Marketing", "Publicidad", "Relaciones Internacionales", "Ciencias Políticas"],
  // Artística: la UMAG solo ofrece 3 carreras en esta área — se amplía la lista más
  // que en las demás para reflejar cuánta oferta relevante falta.
  artistica: ["Diseño Gráfico", "Diseño Industrial", "Cine y Producción Audiovisual", "Licenciatura en Artes Visuales", "Actuación y Teatro", "Diseño de Moda"],
  literaria: ["Periodismo", "Traducción e Interpretación", "Licenciatura en Letras", "Comunicación Social"],
  // Musical: la UMAG solo ofrece 2 carreras en esta área — mismo criterio que Artística.
  musical: ["Interpretación Musical", "Licenciatura en Música", "Composición Musical", "Ingeniería en Sonido", "Producción Musical"],
  social: ["Sociología", "Criminología", "Antropología", "Psicopedagogía"],
  oficina: ["Contador Auditor", "Ingeniería en Recursos Humanos", "Logística", "Comercio Internacional"],
};
