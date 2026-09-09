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

  mecanica: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="10" stroke="white" stroke-width="2.4"/>
      <circle cx="24" cy="24" r="3.2" fill="white"/>
      <g fill="white">
        <rect x="21.4" y="3.5" width="5.2" height="7.5" rx="1.3"/>
        <rect x="21.4" y="37" width="5.2" height="7.5" rx="1.3"/>
        <rect x="3.5" y="21.4" width="7.5" height="5.2" rx="1.3"/>
        <rect x="37" y="21.4" width="7.5" height="5.2" rx="1.3"/>
        <rect x="21.4" y="3.5" width="5.2" height="7.5" rx="1.3" transform="rotate(45 24 24)"/>
        <rect x="21.4" y="37" width="5.2" height="7.5" rx="1.3" transform="rotate(45 24 24)"/>
        <rect x="3.5" y="21.4" width="7.5" height="5.2" rx="1.3" transform="rotate(45 24 24)"/>
        <rect x="37" y="21.4" width="7.5" height="5.2" rx="1.3" transform="rotate(45 24 24)"/>
      </g>
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
