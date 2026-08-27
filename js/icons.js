// Iconos propios en SVG (dibujados a mano, sin depender de internet ni de archivos
// externos), para que el informe se vea con "dibujos" por área, igual que el
// ejemplo del Kuder, pero sin el riesgo de que una imagen externa no cargue.
// Todos usan trazos simples en blanco sobre el círculo de color del área.

const ICONOS_SVG = {
  ciencias: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 6h8" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M21 6v11l-9 17a4 4 0 0 0 3.6 5.8h17a4 4 0 0 0 3.6-5.8l-9-17V6" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M16 30h16" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="20" cy="35" r="1.6" fill="white"/>
      <circle cx="26" cy="37" r="1.2" fill="white"/>
      <circle cx="24" cy="33" r="1" fill="white"/>
    </svg>`,

  humanidades: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 12a2 2 0 0 1 2-2h11v26H10a2 2 0 0 1-2-2V12z" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M40 12a2 2 0 0 0-2-2H27v26h11a2 2 0 0 0 2-2V12z" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M21 15c-3-1-6-1-9 0M21 21c-3-1-6-1-9 0M21 27c-3-1-6-1-9 0" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M27 15c3-1 6-1 9 0M27 21c3-1 6-1 9 0M27 27c3-1 6-1 9 0" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`,

  artistico: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 8C13 8 6 15.5 6 24.5 6 31 11 34 16 34c2 0 2.5-1.5 1.5-3-1-1.5-.5-3.5 1.5-4h9c5.5 0 9-3.8 9-9.3C37 12 31 8 24 8z" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="16" cy="20" r="2" fill="white"/>
      <circle cx="23" cy="15" r="2" fill="white"/>
      <circle cx="31" cy="18" r="2" fill="white"/>
      <circle cx="20" cy="27" r="1.8" fill="white"/>
      <path d="M31 30l6 6M35 28l4 4" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`,

  tecnico: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M31 8a8 8 0 0 0-10.6 9.1L10 27.5a3.6 3.6 0 0 0 5.1 5.1L25.5 22a8 8 0 0 0 10.4-9.9l-5.4 5.4-4-4L31 8z" stroke="white" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`,

  salud: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 39S8 29.4 8 18.9C8 13.4 12.2 9 17.5 9c3 0 5.6 1.5 6.5 4 0.9-2.5 3.5-4 6.5-4C35.8 9 40 13.4 40 18.9 40 29.4 24 39 24 39z" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M14 21h5l2.5-5 3 9 2.5-6h7" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,

  administracion: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="17" width="34" height="21" rx="3" stroke="white" stroke-width="2.5"/>
      <path d="M17 17v-4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4" stroke="white" stroke-width="2.5"/>
      <path d="M7 25c5 3 29 3 34 0" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
      <rect x="21" y="24" width="6" height="5" rx="1" fill="white"/>
    </svg>`,
};
