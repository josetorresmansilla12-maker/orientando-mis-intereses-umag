// Iconos propios en SVG para las 10 áreas del Test de Kuder (Enseñanza Media).
// Mismo estilo a mano que js/icons.js (trazos blancos simples, viewBox 48x48), pero en
// un objeto aparte para no tocar ese archivo ni sus ids (que son de 8° básico).

const ICONOS_SVG_KUDER = {
  exterior: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="33" cy="13" r="4" stroke="white" stroke-width="2.2"/>
      <path d="M6 34l10-15 6 8 4-5 12 12H6z" stroke="white" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M6 38h36" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`,

  // dos engranajes que encajan entre sí (antes era un engranaje solo, que se veía como un sol)
  mecanica: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="white" fill-rule="evenodd" d="M26.32 23.60 L29.37 22.80 L30.78 26.19 L28.05 27.78 L28.19 29.05 L28.17 30.33 L31.02 31.68 L29.92 35.18 L26.81 34.64 L26.09 35.71 L25.25 36.67 L26.57 39.54 L23.48 41.51 L21.44 39.10 L20.21 39.46 L18.94 39.66 L18.12 42.70 L14.47 42.22 L14.46 39.07 L13.29 38.55 L12.19 37.89 L9.61 39.69 L7.12 36.98 L9.14 34.56 L8.58 33.41 L8.16 32.19 L5.02 31.91 L4.86 28.24 L7.96 27.68 L8.27 26.43 L8.73 25.24 L6.51 23.00 L8.75 20.09 L11.48 21.65 L12.52 20.90 L13.64 20.28 L13.38 17.14 L16.96 16.34 L18.05 19.30 L19.33 19.39 L20.59 19.63 L22.40 17.06 L25.66 18.75 L24.60 21.72 L25.52 22.61 Z M14.40 29.50 a3.6 3.6 0 1 0 7.2 0 a3.6 3.6 0 1 0 -7.2 0 Z"/>
      <path fill="white" fill-rule="evenodd" d="M29.99 21.20 L27.80 22.85 L25.48 20.32 L27.31 18.27 L26.90 17.22 L26.66 16.12 L24.00 15.43 L24.53 12.04 L27.28 12.20 L27.84 11.22 L28.56 10.35 L27.44 7.84 L30.42 6.14 L32.00 8.38 L33.12 8.22 L34.25 8.23 L35.51 5.79 L38.70 7.06 L37.93 9.70 L38.76 10.47 L39.45 11.36 L42.15 10.83 L43.14 14.11 L40.60 15.16 L40.52 16.29 L40.25 17.38 L42.35 19.16 L40.40 21.98 L38.00 20.65 L37.06 21.28 L36.04 21.76 L35.96 24.51 L32.54 24.74 L32.08 22.03 L31.00 21.70 Z M30.80 15.20 a2.8 2.8 0 1 0 5.6 0 a2.8 2.8 0 1 0 -5.6 0 Z"/>
    </svg>`,

  calculo: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="6" width="24" height="36" rx="3" stroke="white" stroke-width="2.4"/>
      <rect x="16" y="11" width="16" height="6.5" rx="1" fill="white"/>
      <circle cx="17.5" cy="24.5" r="1.6" fill="white"/><circle cx="24" cy="24.5" r="1.6" fill="white"/><circle cx="30.5" cy="24.5" r="1.6" fill="white"/>
      <circle cx="17.5" cy="30.5" r="1.6" fill="white"/><circle cx="24" cy="30.5" r="1.6" fill="white"/><circle cx="30.5" cy="30.5" r="1.6" fill="white"/>
      <circle cx="17.5" cy="36.5" r="1.6" fill="white"/><circle cx="24" cy="36.5" r="1.6" fill="white"/><circle cx="30.5" cy="36.5" r="1.6" fill="white"/>
    </svg>`,

  cientifica: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 6h10" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M20 6v13l-8.5 15.3A3.6 3.6 0 0 0 14.7 40h18.6a3.6 3.6 0 0 0 3.2-5.7L28 19V6" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M15.5 28.5h17" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="20" cy="33" r="1.4" fill="white"/><circle cx="26" cy="35" r="1.1" fill="white"/>
    </svg>`,

  persuasiva: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 10a3 3 0 0 1 3-3h24a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H21l-8 7v-7h-1a3 3 0 0 1-3-3V10z" stroke="white" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M15 15.5h18M15 21.5h12" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`,

  artistica: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M34 6c2.2 0 4 1.8 4 4 0 1.2-.5 2.3-1.4 3.1L22.5 27.2l-4.9-4.9L31.7 8.2A4 4 0 0 1 34 6z" stroke="white" stroke-width="2.3" stroke-linejoin="round"/>
      <path d="M17.5 22.3l5 5-2.7 8c-3 1.2-7.3 2-10.4 2 1.1-3 2-7.2 3.1-10.2l5-4.8z" stroke="white" stroke-width="2.3" stroke-linejoin="round"/>
    </svg>`,

  literaria: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 13c-3.3-3-9-4-15-3v24c6-1 11.7 0 15 3 3.3-3 9-4 15-3V10c-6-1-11.7 0-15 3z" stroke="white" stroke-width="2.3" stroke-linejoin="round"/>
      <path d="M24 13v24" stroke="white" stroke-width="2" stroke-linecap="round"/>
    </svg>`,

  musical: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="15.5" cy="34" r="5" stroke="white" stroke-width="2.4"/>
      <circle cx="31.5" cy="30" r="5" stroke="white" stroke-width="2.4"/>
      <path d="M20.5 34V11l16-4.5v23.5" stroke="white" stroke-width="2.4" stroke-linejoin="round"/>
    </svg>`,

  social: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 33.5S13.5 27.5 13.5 19.5a6 6 0 0 1 10.5-4 6 6 0 0 1 10.5 4c0 8-10.5 14-10.5 14z" stroke="white" stroke-width="2.3" stroke-linejoin="round"/>
      <path d="M7 39c2.8-4 7.3-6 11.3-4.3M40 39c-2.8-4-7.3-6-11.3-4.3" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`,

  oficina: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 16.5a3 3 0 0 1 3-3h8.5l3 4H37a3 3 0 0 1 3 3V37a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V16.5z" stroke="white" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M14 27h20M14 32.5h13" stroke="white" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
};
