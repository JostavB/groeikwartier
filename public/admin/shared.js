// Gedeeld tussen de server (src/index.js) en de editor (public/admin/editor.js):
// lettertypen en het opbouwen van agendakaarten.

export const STANDAARD_KOP = 'Instrument Serif';
export const STANDAARD_TEKST = 'Avenir';

// Alle lettertypen staan op de eigen server (public/fonts/fonts.css), dus geen verzoeken naar Google.
export const FONTS_KOP = {
  'Instrument Serif': "'Instrument Serif', 'Cormorant Garamond', serif",
  'Bodoni Moda': "'Bodoni Moda', serif",
  'Gilda Display': "'Gilda Display', serif",
  'Bellefair': "'Bellefair', serif",
  'Antic Didone': "'Antic Didone', serif",
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

// Lettertypen zonder eigen cursieve variant (quotes worden dan schuin gezet door de browser).
export const ZONDER_CURSIEF = new Set(['Gilda Display', 'Bellefair', 'Antic Didone']);

export function fontLink() { return ''; }

// Instelbare kleuren van de site. Sleutel = CSS-variabele --c-<sleutel>.
export const KLEURVELDEN = [
  { key: 'hoofd', label: 'Hoofdkleur', uitleg: 'Grote vlakken, knoppen, agendakaarten', standaard: '#596E6E' },
  { key: 'donker', label: 'Donker', uitleg: 'Menu, voettekst, koppen, blok "Over ons"', standaard: '#202B2D' },
  { key: 'accent', label: 'Accent', uitleg: 'Knoppen op donker, lijntjes', standaard: '#ACB3AC' },
  { key: 'zand', label: 'Zand', uitleg: 'Blok "Kom kennismaken", agendakaarten', standaard: '#B7B1A6' },
  { key: 'achtergrond', label: 'Achtergrond', uitleg: 'Achtergrond van de pagina', standaard: '#F2F2EE' },
  { key: 'hero', label: 'Achtergrond bovenaan', uitleg: 'Vlak achter het logo', standaard: '#FAFAF7' },
  { key: 'contact', label: 'Achtergrond contact', uitleg: 'Blok "Blijf op de hoogte"', standaard: '#DCDDD7' },
  { key: 'kaart', label: 'Kaarten', uitleg: 'Agendakaarten en contactkader', standaard: '#FFFFFF' },
  { key: 'tekst', label: 'Tekst', uitleg: 'Gewone tekst', standaard: '#2B3638' },
  { key: 'tekst-zacht', label: 'Tekst zacht', uitleg: 'Ondertitels en kleine tekst', standaard: '#4F5B5C' },
  { key: 'tekst-licht', label: 'Tekst op donker', uitleg: 'Lopende tekst op donkere vlakken', standaard: '#E3E7E4' },
];

export function kleurCSS(colors) {
  let css = '';
  for (const f of KLEURVELDEN) {
    const v = colors?.[f.key];
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) && v.toUpperCase() !== f.standaard) css += `--c-${f.key}:${v};`;
  }
  return css ? `:root{${css}}` : '';
}

export const KLEUREN = {
  donker: { bg: 'var(--c-hoofd)', fg: 'var(--c-achtergrond)', sub: 'color-mix(in srgb, var(--c-accent) 55%, #fff)' },
  zand: { bg: 'var(--c-zand)', fg: 'var(--c-donker)', sub: 'var(--c-hoofd)' },
  salie: { bg: 'var(--c-accent)', fg: 'var(--c-donker)', sub: 'var(--c-donker)' },
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
      return `<article data-id="${esc(it.id)}" style="background: var(--c-kaart); display: flex; flex-direction: column${verlopen ? '; opacity: .45' : ''}">
          <div style="background: ${k.bg}; color: ${k.fg}; aspect-ratio: 16 / 10; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 0 12px">
            <span style="font-family: var(--font-kop); font-weight: 500; font-size: 3.2rem; line-height: 1">${esc(it.groot)}</span>
            <span style="font-size: 0.7rem; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: ${k.sub}">${esc(it.klein)}</span>
          </div>
          <div style="padding: 24px 22px 28px; text-align: center; display: flex; flex-direction: column; gap: 8px">
            <h3 style="margin: 0; font-size: 1.05rem; font-weight: 600; color: var(--c-donker)">${esc(it.titel)}</h3>
            <p style="margin: 0; font-size: 0.92rem; line-height: 1.6; color: var(--c-tekst-zacht)">${esc(it.tekst)}</p>
          </div>
        </article>`;
    })
    .join('\n');
}
