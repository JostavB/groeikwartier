// Editor voor het Groeikwartier. Draait op /admin, bovenop de echte pagina.
import { FONTS_KOP, FONTS_TEKST, fontLink, agendaHTML, KLEUREN, DEFAULT_AGENDA, KLEURVELDEN } from './shared.js';

const GK = window.GK || {};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
};

const content = normalize(GK.content || {});
let dirty = false;
let retryQueue = [];

function normalize(c) {
  return {
    texts: { ...(c.texts || {}) },
    sizes: { ...(c.sizes || {}) },
    images: { ...(c.images || {}) },
    links: { ...(c.links || {}) },
    fonts: { kop: 'Cormorant Garamond', tekst: 'Avenir', ...(c.fonts || {}) },
    colors: { ...(c.colors || {}) },
    agenda: JSON.parse(JSON.stringify(c.agenda ?? DEFAULT_AGENDA)),
    meta: c.meta || null,
  };
}

// ---------------- opbouw ----------------

function currentPage() {
  return (GK.pages || []).find((p) => p.key === GK.page) || { key: 'home', path: '/', title: 'Home' };
}

function pageSwitch() {
  const sel = h('select', { class: 'gk-pagesel', id: 'gk-page', 'aria-label': 'Pagina kiezen' },
    ...(GK.pages || [{ key: 'home', title: 'Home' }]).map((p) => h('option', { value: p.key, selected: p.key === GK.page }, p.title)));
  sel.addEventListener('change', () => {
    if (dirty && !window.confirm('Je hebt wijzigingen die nog niet gepubliceerd zijn. Toch naar een andere pagina?')) { sel.value = GK.page; return; }
    dirty = false;
    location.href = sel.value === 'home' ? '/admin/editor' : '/admin/editor/' + sel.value;
  });
  return h('label', { class: 'gk-pagelabel', for: 'gk-page' }, h('span', {}, 'Pagina'), sel);
}

const bar = h('div', { class: 'gk-ui gk-bar', role: 'toolbar', 'aria-label': 'Editor' });
const status = h('span', { class: 'gk-status', role: 'status' });
const publishBtn = h('button', { class: 'gk-btn gk-primary', type: 'button', onclick: save, disabled: true }, 'Publiceren');
const who = h('span', { class: 'gk-who' });

bar.append(
  h('span', { class: 'gk-brand' }, 'Groeikwartier', h('small', {}, 'editor')),
  pageSwitch(),
  h('div', { class: 'gk-actions' },
    h('button', { class: 'gk-btn', type: 'button', onclick: () => openPanel('fonts') }, 'Instellingen'),
    h('button', { class: 'gk-btn', type: 'button', onclick: () => openPanel('agenda') }, 'Agenda'),
    h('button', { class: 'gk-btn', type: 'button', onclick: () => openPanel('signups') }, 'Aanmeldingen'),
    h('button', { class: 'gk-btn', type: 'button', onclick: () => openPanel('berichten') }, 'Berichten'),
    h('button', { class: 'gk-btn', type: 'button', onclick: () => openPanel('history') }, 'Versies'),
  ),
  h('div', { class: 'gk-right' },
    status,
    h('a', { class: 'gk-btn gk-ghost', href: currentPage().path, target: '_blank', rel: 'noopener' }, 'Bekijk pagina'),
    publishBtn,
    who,
    h('button', { class: 'gk-btn gk-ghost', type: 'button', onclick: logout }, 'Uitloggen'),
  ),
);

const login = h('div', { class: 'gk-ui gk-login', hidden: true },
  h('div', { class: 'gk-login-card' },
    h('h2', {}, 'Opnieuw inloggen'),
    h('p', { class: 'gk-login-msg' }, 'Je sessie is verlopen. Log opnieuw in; je wijzigingen blijven staan.'),
    h('div', { id: 'gk-gbtn' }),
    h('p', { class: 'gk-login-err', role: 'alert' }),
  ),
);

const toolbar = h('div', { class: 'gk-ui gk-tools', hidden: true });
const imgBtn = h('button', { class: 'gk-ui gk-imgbtn', type: 'button', hidden: true }, 'Afbeelding wijzigen');
const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif', hidden: true });
const panel = h('aside', { class: 'gk-ui gk-panel', hidden: true, 'aria-label': 'Paneel' });

document.body.append(bar, toolbar, imgBtn, fileInput, panel, login);
new ResizeObserver(() => document.documentElement.style.setProperty('--gk-bar-h', bar.offsetHeight + 'px')).observe(bar);
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) save(); } });

// "Lees meer"-teksten openklappen zodat ze bewerkbaar zijn.
$$('.m-toggle').forEach((b) => { const t = document.getElementById(b.dataset.target); if (t) t.hidden = false; b.hidden = true; });

// In de editor navigeren links niet weg (behalve knoppen van de editor zelf).
document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a || a.closest('.gk-ui')) return;
  const href = a.getAttribute('href') || '';
  if (href.startsWith('#') && !a.closest('[data-k]') && !a.hasAttribute('data-k')) return;
  e.preventDefault();
}, true);
document.addEventListener('submit', (e) => e.preventDefault(), true);

window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------------- sessie ----------------
// Je komt hier alleen met een geldige sessie (de server controleert dat).
// Verloopt de sessie tijdens het werken, dan log je opnieuw in zonder de pagina te verlaten.

function showLogin(msg, err) {
  login.hidden = false;
  if (msg) $('.gk-login-msg', login).textContent = msg;
  $('.gk-login-err', login).textContent = err || '';
  waitFor(() => window.google?.accounts?.id).then((gid) => {
    gid.initialize({ client_id: GK.clientId, callback: (r) => relogin(r.credential), auto_select: false, ux_mode: 'popup' });
    const box = $('#gk-gbtn');
    box.textContent = '';
    gid.renderButton(box, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'nl' });
  }).catch(() => { $('.gk-login-err', login).textContent = 'Google-inloggen laadt niet. Ververs de pagina.'; });
}

function waitFor(fn, ms = 15000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function tick() {
      const v = fn();
      if (v) return resolve(v);
      if (Date.now() - t0 > ms) return reject(new Error('timeout'));
      setTimeout(tick, 100);
    })();
  });
}

async function relogin(credential) {
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gk': '1' }, body: JSON.stringify({ credential }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Inloggen mislukt.');
    login.hidden = true;
    const q = retryQueue; retryQueue = [];
    q.forEach((fn) => fn());
  } catch (e) {
    showLogin(null, e.message);
  }
}

async function logout() {
  if (dirty && !window.confirm('Je hebt wijzigingen die nog niet gepubliceerd zijn. Toch uitloggen?')) return;
  dirty = false;
  try { await fetch('/api/logout', { method: 'POST', headers: { 'x-gk': '1' } }); } catch {}
  window.google?.accounts?.id?.disableAutoSelect?.();
  location.href = '/admin';
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, credentials: 'same-origin', headers: { ...(opts.headers || {}), 'x-gk': '1' } });
  if (res.status === 401) {
    await new Promise((resolve) => { retryQueue.push(resolve); showLogin('Je sessie is verlopen. Log opnieuw in; je wijzigingen blijven staan.'); });
    return api(path, opts);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Er ging iets mis.');
  return data;
}

// ---------------- bewerken ----------------

const SINGLE_LINE = new Set(['H1', 'H2', 'H3', 'SPAN', 'LABEL', 'BUTTON', 'A']);
let editingEnabled = false;
let current = null;

function setDirty(v = true) {
  dirty = v;
  publishBtn.disabled = !v;
  status.textContent = v ? 'Niet gepubliceerde wijzigingen' : status.textContent;
}

function enableEditing() {
  if (editingEnabled) return;
  editingEnabled = true;
  document.documentElement.classList.add('gk-on');
  for (const el of $$('[data-k]')) {
    el.contentEditable = 'true';
    el.spellcheck = true;
    el.addEventListener('input', () => setDirty());
    el.addEventListener('focus', () => { current = el; showTools(el); });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (SINGLE_LINE.has(el.tagName)) { el.blur(); return; }
      if (!document.execCommand('insertLineBreak')) document.execCommand('insertHTML', false, '<br>');
    });
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  }
  for (const el of $$('[data-img]')) {
    el.classList.add('gk-img');
    el.addEventListener('mouseenter', () => placeImgBtn(el));
    el.addEventListener('click', (e) => { e.preventDefault(); pickImage(el); });
  }
  const agenda = $('[data-agenda]');
  if (agenda) {
    agenda.classList.add('gk-agenda');
    agenda.before(h('div', { class: 'gk-ui gk-agenda-hint' }, h('button', { class: 'gk-btn gk-primary', type: 'button', onclick: () => openPanel('agenda') }, 'Agenda bewerken')));
  }
  document.addEventListener('focusout', () => setTimeout(() => {
    const a = document.activeElement;
    if (!a || (!a.closest?.('[data-k]') && !a.closest?.('.gk-tools'))) { toolbar.hidden = true; current = null; }
  }, 150));
  window.addEventListener('scroll', () => { if (current && !toolbar.hidden) positionTools(current); imgBtn.hidden = true; }, { passive: true });
  status.textContent = content.meta?.at ? 'Laatst gepubliceerd ' + fmtDate(content.meta.at) : 'Klaar om te bewerken';
}

// ----- zwevende werkbalk -----

function getSize(el) {
  const v = parseFloat(el.style.getPropertyValue('--fs') || getComputedStyle(el).getPropertyValue('--fs'));
  return Number.isFinite(v) ? v : 1;
}

function setSize(el, v) {
  v = Math.min(3, Math.max(0.5, Math.round(v * 10) / 10));
  el.style.setProperty('--fs', String(v));
  content.sizes[el.dataset.k] = v;
  setDirty();
  showTools(el);
}

function linkTarget(el) {
  if (el.matches('a[data-l]')) return el;
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  const a = node && (node.nodeType === 1 ? node : node.parentElement)?.closest?.('a');
  return a && el.contains(a) ? a : null;
}

function showTools(el) {
  toolbar.textContent = '';
  const keep = (fn) => (e) => { e.preventDefault(); fn(); };
  const btn = (label, title, fn) => h('button', { type: 'button', class: 'gk-tbtn', title, 'aria-label': title, onmousedown: keep(fn) }, label);
  const size = getSize(el);
  toolbar.append(
    btn('B', 'Vet', () => { document.execCommand('bold'); setDirty(); }),
    btn('I', 'Cursief', () => { document.execCommand('italic'); setDirty(); }),
    btn('Link', 'Link toevoegen of aanpassen', () => editLink(el)),
    h('span', { class: 'gk-sep' }),
    btn('A−', 'Kleiner', () => setSize(el, getSize(el) - 0.1)),
    h('button', { type: 'button', class: 'gk-tbtn gk-pct', title: 'Terug naar 100%', onmousedown: keep(() => setSize(el, 1)) }, Math.round(size * 100) + '%'),
    btn('A+', 'Groter', () => setSize(el, getSize(el) + 0.1)),
  );
  toolbar.hidden = false;
  positionTools(el);
}

function positionTools(el) {
  const r = el.getBoundingClientRect();
  const tw = toolbar.offsetWidth || 300;
  let top = r.top - toolbar.offsetHeight - 8;
  if (top < 64) top = r.bottom + 8;
  const left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left));
  toolbar.style.top = top + 'px';
  toolbar.style.left = left + 'px';
}

function editLink(el) {
  const a = linkTarget(el);
  const sel = window.getSelection();
  const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  toolbar.textContent = '';
  const input = h('input', { type: 'url', class: 'gk-input', placeholder: 'https://… of mailto:…', value: a ? a.getAttribute('href') || '' : '', 'aria-label': 'Linkadres' });
  const apply = () => {
    let url = input.value.trim();
    if (url && !/^(https?:|mailto:|tel:|#|\/)/i.test(url)) url = url.includes('@') ? 'mailto:' + url : 'https://' + url;
    if (a) {
      if (url) a.setAttribute('href', url); else if (!a.hasAttribute('data-l')) a.replaceWith(...a.childNodes);
      if (a.dataset.l && url) content.links[a.dataset.l] = url;
    } else if (url && range && !range.collapsed) {
      sel.removeAllRanges(); sel.addRange(range);
      document.execCommand('createLink', false, url);
    }
    setDirty();
    el.focus();
    showTools(el);
  };
  toolbar.append(
    input,
    h('button', { type: 'button', class: 'gk-tbtn', onclick: apply }, 'Opslaan'),
    h('button', { type: 'button', class: 'gk-tbtn', onclick: () => { el.focus(); showTools(el); } }, 'Annuleren'),
  );
  if (!a && (!range || range.collapsed)) toolbar.prepend(h('span', { class: 'gk-note' }, 'Selecteer eerst de tekst voor de link.'));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
  positionTools(el);
  input.focus();
}

// ----- afbeeldingen -----

let imgTarget = null;
function placeImgBtn(el) {
  const r = el.getBoundingClientRect();
  imgBtn.hidden = false;
  imgBtn.style.top = Math.max(64, r.top + 10) + 'px';
  imgBtn.style.left = Math.max(8, r.left + 10) + 'px';
  imgBtn.onclick = () => pickImage(el);
}

function pickImage(el) {
  if (!editingEnabled) return;
  imgTarget = el;
  fileInput.value = '';
  fileInput.click();
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  const el = imgTarget;
  if (!file || !el) return;
  status.textContent = 'Afbeelding uploaden…';
  try {
    const blob = await prepareImage(file);
    const { url } = await api('/api/admin/upload', { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
    if (el.tagName === 'IMG') el.src = url;
    else { el.style.backgroundImage = `url("${url}")`; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; el.style.color = 'transparent'; el.textContent = ''; }
    content.images[el.dataset.img] = url;
    setDirty();
    status.textContent = 'Afbeelding geplaatst, nog niet gepubliceerd';
  } catch (e) {
    status.textContent = e.message;
  }
});

// Grote foto's verkleinen in de browser (max 2000 px, WebP), logo's met transparantie blijven scherp.
async function prepareImage(file) {
  if (file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const max = 2000;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.86));
  return blob && blob.size < file.size ? blob : file;
}

// ---------------- panelen ----------------

function openPanel(kind) {
  if (!editingEnabled) return showLogin();
  panel.textContent = '';
  panel.hidden = false;
  const close = h('button', { class: 'gk-btn gk-ghost gk-close', type: 'button', onclick: () => { panel.hidden = true; } }, 'Sluiten');
  const body = h('div', { class: 'gk-panel-body' });
  const titles = { fonts: 'Instellingen', agenda: 'Agenda', signups: 'Aanmeldingen', berichten: 'Berichten', history: 'Versies' };
  panel.append(h('div', { class: 'gk-panel-head' }, h('h2', {}, titles[kind]), close), body);
  ({ fonts: fontsPanel, agenda: agendaPanel, signups: signupsPanel, berichten: berichtenPanel, history: historyPanel })[kind](body);
}

function fontsPanel(body) {
  const sel = (label, list, key) => {
    const s = h('select', { class: 'gk-input', id: 'gk-font-' + key },
      ...Object.keys(list).map((n) => h('option', { value: n, selected: content.fonts[key] === n }, n === 'Avenir' ? 'Avenir (standaard)' : n)));
    s.addEventListener('change', () => { content.fonts[key] = s.value; applyFonts(); setDirty(); });
    return h('label', { class: 'gk-field', for: 'gk-font-' + key }, h('span', {}, label), s);
  };
  body.append(
    h('h3', { class: 'gk-sub' }, 'Lettertypen'),
    h('p', { class: 'gk-help' }, 'Kies een lettertype voor de koppen en een voor de lopende tekst. Tekstgrootte pas je per tekst aan met A− en A+ in de werkbalk boven de tekst.'),
    sel('Koppen', FONTS_KOP, 'kop'),
    sel('Tekst', FONTS_TEKST, 'tekst'),
    h('h3', { class: 'gk-sub' }, 'Kleuren'),
    h('p', { class: 'gk-help' }, 'Je ziet een wijziging meteen op de pagina. Pas na Publiceren is hij live. Tinten die van deze kleuren zijn afgeleid, zoals lichtere randjes, schuiven automatisch mee.'),
  );
  const rows = KLEURVELDEN.map((f) => colorRow(f));
  body.append(...rows.map((r) => r.el));
  const resetAll = h('button', { class: 'gk-btn', type: 'button' }, 'Alle kleuren terug naar standaard');
  resetAll.addEventListener('click', () => {
    if (!resetAll.dataset.sure) { resetAll.dataset.sure = '1'; resetAll.textContent = 'Zeker weten?'; return; }
    content.colors = {};
    rows.forEach((r) => r.sync());
    applyColors(); setDirty();
    delete resetAll.dataset.sure; resetAll.textContent = 'Alle kleuren terug naar standaard';
  });
  body.append(resetAll);
}

function colorRow(f) {
  const id = 'gk-color-' + f.key;
  const cur = () => (content.colors[f.key] || f.standaard).toUpperCase();
  const picker = h('input', { type: 'color', class: 'gk-swatch', id, value: cur().toLowerCase(), 'aria-label': f.label });
  const hex = h('input', { type: 'text', class: 'gk-input gk-hex', value: cur(), maxlength: 7, spellcheck: 'false', 'aria-label': f.label + ' (hexcode)' });
  const reset = h('button', { class: 'gk-btn gk-ghost', type: 'button', title: 'Terug naar ' + f.standaard }, 'Standaard');
  const set = (v) => {
    v = v.toUpperCase();
    if (v === f.standaard) delete content.colors[f.key]; else content.colors[f.key] = v;
    applyColors(); setDirty();
    reset.disabled = !content.colors[f.key];
  };
  picker.addEventListener('input', () => { hex.value = picker.value.toUpperCase(); set(picker.value); });
  hex.addEventListener('input', () => {
    let v = hex.value.trim(); if (v && v[0] !== '#') v = '#' + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) { picker.value = v.toLowerCase(); set(v); }
  });
  reset.addEventListener('click', () => { set(f.standaard); sync(); });
  const sync = () => { picker.value = cur().toLowerCase(); hex.value = cur(); reset.disabled = !content.colors[f.key]; };
  reset.disabled = !content.colors[f.key];
  const el = h('div', { class: 'gk-color' },
    picker,
    h('label', { class: 'gk-color-text', for: id }, h('strong', {}, f.label), h('small', {}, f.uitleg)),
    hex, reset);
  return { el, sync };
}

function applyColors() {
  const root = document.documentElement.style;
  for (const f of KLEURVELDEN) root.setProperty('--c-' + f.key, content.colors[f.key] || f.standaard);
}

function applyFonts() {
  const root = document.documentElement.style;
  root.setProperty('--font-kop', FONTS_KOP[content.fonts.kop] || FONTS_KOP['Cormorant Garamond']);
  root.setProperty('--font-tekst', FONTS_TEKST[content.fonts.tekst] || FONTS_TEKST.Avenir);
  const link = fontLink([content.fonts.kop, content.fonts.tekst]);
  if (link) {
    const tmp = h('div'); tmp.innerHTML = link;
    const href = tmp.firstChild.href;
    if (!$$('link[rel=stylesheet]').some((l) => l.href === href)) document.head.append(tmp.firstChild);
  }
}

function renderAgenda() {
  const el = $('[data-agenda]');
  if (el) el.innerHTML = agendaHTML(content.agenda, GK.today, true);
}

function agendaPanel(body) {
  body.append(h('p', { class: 'gk-help' }, 'Items met een datum staan automatisch op volgorde en verdwijnen de dag erna vanzelf van de site. Items zonder datum komen daarna, in de volgorde hieronder.'));
  const list = h('div', { class: 'gk-agenda-list' });
  const draw = () => {
    list.textContent = '';
    content.agenda.forEach((it, i) => list.append(agendaItem(it, i, draw)));
  };
  draw();
  body.append(list, h('button', {
    class: 'gk-btn gk-primary', type: 'button', onclick: () => {
      content.agenda.push({ id: 'a' + Date.now().toString(36), datum: '', groot: '', klein: '', titel: 'Nieuw item', tekst: '', kleur: 'donker' });
      renderAgenda(); setDirty(); draw();
      list.lastElementChild?.querySelector('input')?.focus();
    },
  }, 'Item toevoegen'));
}

const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DAGEN = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];

function agendaItem(it, i, redraw) {
  const id = (f) => `gk-ag-${i}-${f}`;
  const upd = (f, v) => { it[f] = v; renderAgenda(); setDirty(); if (f === 'titel') legend.textContent = v || 'Zonder titel'; };
  const legend = h('legend', {}, it.titel || 'Zonder titel');
  const field = (label, f, attrs = {}) => {
    const inp = h('input', { class: 'gk-input', id: id(f), value: it[f] || '', ...attrs });
    inp.addEventListener('input', () => upd(f, inp.value));
    return h('label', { class: 'gk-field', for: id(f) }, h('span', {}, label), inp);
  };
  const datum = field('Datum (optioneel)', 'datum', { type: 'date' });
  datum.querySelector('input').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v) {
      const d = new Date(v + 'T12:00:00');
      const groot = $('#' + id('groot')), klein = $('#' + id('klein'));
      if (!it.groot || /^\d{1,2} [a-z]{3}$/.test(it.groot)) { it.groot = d.getDate() + ' ' + MAANDEN[d.getMonth()]; if (groot) groot.value = it.groot; }
      if (!it.klein || DAGEN.includes(it.klein)) { it.klein = DAGEN[d.getDay()]; if (klein) klein.value = it.klein; }
      renderAgenda();
    }
  });
  const kleur = h('select', { class: 'gk-input', id: id('kleur') }, ...Object.keys(KLEUREN).map((k) => h('option', { value: k, selected: it.kleur === k }, { donker: 'Donker groen', zand: 'Zand', salie: 'Salie' }[k])));
  kleur.addEventListener('change', () => upd('kleur', kleur.value));
  const move = (d) => () => {
    const j = i + d;
    if (j < 0 || j >= content.agenda.length) return;
    [content.agenda[i], content.agenda[j]] = [content.agenda[j], content.agenda[i]];
    renderAgenda(); setDirty(); redraw();
  };
  const del = h('button', { class: 'gk-btn gk-danger', type: 'button' }, 'Verwijderen');
  del.addEventListener('click', () => {
    if (del.dataset.sure) { content.agenda.splice(i, 1); renderAgenda(); setDirty(); redraw(); }
    else { del.dataset.sure = '1'; del.textContent = 'Zeker weten?'; setTimeout(() => { delete del.dataset.sure; del.textContent = 'Verwijderen'; }, 3000); }
  });
  return h('fieldset', { class: 'gk-item' },
    legend,
    datum,
    h('div', { class: 'gk-row' }, field('Grote tekst', 'groot', { maxlength: 20, placeholder: '7 nov' }), field('Kleine tekst', 'klein', { maxlength: 40, placeholder: 'Zaterdag' })),
    field('Titel', 'titel', { maxlength: 120 }),
    field('Omschrijving', 'tekst', { maxlength: 300 }),
    h('label', { class: 'gk-field', for: id('kleur') }, h('span', {}, 'Kleur'), kleur),
    h('div', { class: 'gk-row gk-item-actions' },
      h('button', { class: 'gk-btn', type: 'button', onclick: move(-1), disabled: i === 0 }, 'Omhoog'),
      h('button', { class: 'gk-btn', type: 'button', onclick: move(1), disabled: i === content.agenda.length - 1 }, 'Omlaag'),
      del,
    ),
  );
}

async function berichtenPanel(body) {
  body.append(h('p', { class: 'gk-help' }, 'Berichten via het formulier op de pagina Samenwerken, nieuwste bovenaan.'));
  const box = h('div', { class: 'gk-msgs' }, 'Laden…');
  body.append(box);
  try {
    const list = await api('/api/admin/berichten');
    box.textContent = '';
    if (!list.length) { box.append(h('p', {}, 'Nog geen berichten.')); return; }
    for (const m of list) {
      const del = h('button', { class: 'gk-btn gk-danger', type: 'button' }, 'Verwijderen');
      const card = h('article', { class: 'gk-msg' },
        h('div', { class: 'gk-msg-head' }, h('strong', {}, m.naam || 'Zonder naam'), h('small', {}, fmtDate(m.at))),
        h('div', { class: 'gk-msg-meta' },
          m.soort ? h('span', { class: 'gk-chip' }, m.soort) : null,
          m.organisatie ? h('span', {}, m.organisatie) : null),
        h('p', { class: 'gk-msg-body' }, m.bericht || ''),
        h('div', { class: 'gk-msg-contact' },
          h('span', { class: 'gk-copyable' }, m.email || ''),
          m.telefoon ? h('span', { class: 'gk-copyable' }, m.telefoon) : null),
        h('div', { class: 'gk-row gk-item-actions' }, del),
      );
      del.addEventListener('click', async () => {
        if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Zeker weten?'; setTimeout(() => { delete del.dataset.sure; del.textContent = 'Verwijderen'; }, 3000); return; }
        del.disabled = true;
        try { await api('/api/admin/bericht-verwijderen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: m.id }) }); card.remove(); }
        catch (e) { del.disabled = false; del.textContent = e.message; }
      });
      box.append(card);
    }
  } catch (e) { box.textContent = e.message; }
}

async function signupsPanel(body) {
  body.append(h('p', { class: 'gk-help' }, 'Mensen die zich via de site hebben aangemeld voor berichten.'));
  const box = h('div', {}, 'Laden…');
  body.append(box);
  try {
    const list = await api('/api/admin/signups');
    box.textContent = '';
    if (!list.length) { box.append(h('p', {}, 'Nog geen aanmeldingen.')); return; }
    const all = list.map((s) => s.email).join(', ');
    const copy = h('button', { class: 'gk-btn gk-primary', type: 'button' }, `Kopieer ${list.length} adressen`);
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(all); copy.textContent = 'Gekopieerd'; } catch { ta.hidden = false; ta.select(); }
    });
    const ta = h('textarea', { class: 'gk-input', readonly: true, hidden: true, rows: 4 }); ta.value = all;
    box.append(copy, ta, h('table', { class: 'gk-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'E-mail'), h('th', {}, 'Aangemeld'))),
      h('tbody', {}, ...list.map((s) => h('tr', {}, h('td', {}, s.email), h('td', {}, fmtDate(s.at))))),
    ));
  } catch (e) { box.textContent = e.message; }
}

async function historyPanel(body) {
  body.append(h('p', { class: 'gk-help' }, 'Bij elke publicatie wordt de vorige versie bewaard (de laatste 30). Terugzetten maakt die versie meteen live; de huidige versie blijft ook bewaard.'));
  const box = h('div', {}, 'Laden…');
  body.append(box);
  try {
    const list = await api('/api/admin/history');
    box.textContent = '';
    if (!list.length) { box.append(h('p', {}, 'Nog geen eerdere versies.')); return; }
    for (const v of list) {
      const b = h('button', { class: 'gk-btn', type: 'button' }, 'Terugzetten');
      b.addEventListener('click', async () => {
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Zeker weten?'; return; }
        b.disabled = true;
        try { await api('/api/admin/restore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: v.id }) }); dirty = false; location.reload(); }
        catch (e) { b.textContent = e.message; }
      });
      box.append(h('div', { class: 'gk-hist' }, h('div', {}, h('strong', {}, v.at ? fmtDate(v.at) : 'Eerste versie'), h('small', {}, v.by || '')), b));
    }
  } catch (e) { box.textContent = e.message; }
}

// ---------------- publiceren ----------------

function collect() {
  const texts = { ...content.texts };
  for (const el of $$('[data-k]')) texts[el.dataset.k] = el.innerHTML.trim();
  for (const a of $$('a[data-l]')) content.links[a.dataset.l] = a.getAttribute('href') || '';
  return { ...content, texts };
}

async function save() {
  publishBtn.disabled = true;
  status.textContent = 'Publiceren…';
  try {
    const res = await api('/api/admin/content', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(collect()) });
    content.meta = res.meta;
    dirty = false;
    status.textContent = 'Gepubliceerd om ' + new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    publishBtn.disabled = false;
    status.textContent = 'Niet gepubliceerd: ' + e.message;
  }
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------------- start ----------------

who.textContent = GK.user?.email || '';
enableEditing();
