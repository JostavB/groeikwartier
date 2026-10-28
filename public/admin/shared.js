// Gedeeld tussen de server (src/index.js) en de editor (public/admin/editor.js):
// lettertypen en het opbouwen van agendakaarten.

export const FONTS_KOP = {
  'Cormorant Garamond': "'Cormorant Garamond', serif",
  'Playfair Display': "'Playfair Display', serif",
  'Lora': "'Lora', serif",
  'EB Garamond': "'EB Garamond', serif",
  'Fraunces': "'Fraunces', serif",
};

export const FONTS_TEKST = {
  'Avenir': "'Avenir Next','Avenir','Nunito Sans',sans-serif",
  'Nunito Sans': "'Nunito Sans',sans-serif",
  'Source Sans 3': "'Source Sans 3',sans-serif",
  'Work Sans': "'Work Sans',sans-serif",
  'Mulish': "'Mulish',sans-serif",
  'Karla': "'Karla',sans-serif",
};

// Al geladen door het sjabloon zelf.
const PRELOADED = new Set(['Cormorant Garamond', 'Nunito Sans', 'Avenir']);

export function fontLink(names) {
  const fams = names.filter((n) => n && !PRELOADED.has(n));
  if (!fams.length) return '';
  const q = fams
    .map((n) => 'family=' + n.replace(/ /g, '+') + ':ital,wght@0,400;0,500;0,600;0,700;1,400')
    .join('&');
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=swap">`;
}

export const KLEUREN = {
  donker: { bg: '#596E6E', fg: '#F2F2EE', sub: '#D3DAD5' },
  zand: { bg: '#B7B1A6', fg: '#202B2D', sub: '#596E6E' },
  salie: { bg: '#ACB3AC', fg: '#202B2D', sub: '#202B2D' },
};

export const DEFAULT_AGENDA = [
  { id: 'a1', datum: '2026-11-07', groot: '7 nov', klein: 'Zaterdag', titel: 'Ruil en Deel festival', tekst: 'Kraam in De Verkeerstuin', kleur: 'donker' },
  { id: 'a2', datum: '', groot: 'Volgt', klein: 'Binnenkort', titel: 'Eerste thema-avond', tekst: 'Soesterkwartier · onderwerp volgt', kleur: 'zand' },
  { id: 'a3', datum: '', groot: '2027', klein: 'In voorbereiding', titel: 'Eerste cursus', tekst: 'Kleine groep, meerdere bijeenkomsten', kleur: 'salie' },
];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Toekomstige items met datum eerst (oplopend), daarna items zonder datum in hun eigen volgorde.
// Verlopen items (datum voor vandaag) worden op de publieke site verborgen.
export function zichtbareAgenda(items, vandaag, admin) {
  const lijst = (items || []).filter((it) => admin || !it.datum || it.datum >= vandaag);
  const metDatum = lijst.filter((it) => it.datum).sort((a, b) => a.datum.localeCompare(b.datum));
  const zonder = lijst.filter((it) => !it.datum);
  return [...metDatum, ...zonder];
}

export function agendaHTML(items, vandaag, admin) {
  return zichtbareAgenda(items, vandaag, admin)
    .map((it) => {
      const k = KLEUREN[it.kleur] || KLEUREN.donker;
      const verlopen = it.datum && it.datum < vandaag;
      return `<article data-id="${esc(it.id)}" style="background: #FFFFFF; display: flex; flex-direction: column${verlopen ? '; opacity: .45' : ''}">
          <div style="background: ${k.bg}; color: ${k.fg}; aspect-ratio: 16 / 10; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 0 12px">
            <span style="font-family: var(--font-kop); font-weight: 500; font-size: 3.2rem; line-height: 1">${esc(it.groot)}</span>
            <span style="font-size: 0.7rem; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: ${k.sub}">${esc(it.klein)}</span>
          </div>
          <div style="padding: 24px 22px 28px; text-align: center; display: flex; flex-direction: column; gap: 8px">
            <h3 style="margin: 0; font-size: 1.05rem; font-weight: 600; color: #202B2D">${esc(it.titel)}</h3>
            <p style="margin: 0; font-size: 0.92rem; line-height: 1.6; color: #4F5B5C">${esc(it.tekst)}</p>
          </div>
        </article>`;
    })
    .join('\n');
}
