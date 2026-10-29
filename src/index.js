// Het Groeikwartier: website + editor.
// De pagina wordt bij elk verzoek opgebouwd uit src/template.html plus de inhoud in KV.
// /admin toont dezelfde pagina met de editor erbovenop; opslaan kan alleen met een
// Google-account dat in ADMIN_EMAILS staat (Google ID-token, gecontroleerd op de server).

import TEMPLATE from './template.html';
import LOGIN_PAGE from './login.html';
import PAGE_SAMENWERKEN from './pages/samenwerken.html';
import PAGE_PRIVACY from './pages/privacy.html';
import PAGE_AFMELDEN from './pages/afmelden.html';
import { FONTS_KOP, FONTS_TEKST, STANDAARD_KOP, STANDAARD_TEKST, agendaHTML, DEFAULT_AGENDA, esc, KLEURVELDEN, kleurCSS } from '../public/admin/shared.js';

const CONTENT_KEY = 'content';
const HIST_PREFIX = 'hist:';
const HIST_KEEP = 30;
const MEDIA_PREFIX = 'media:';
const SIGNUP_PREFIX = 'signup:';
const MSG_PREFIX = 'samen:';
const UNSUB_PREFIX = 'afmeld:';
const SESSION_PREFIX = 'sess:';
const SESSION_COOKIE = '__Host-gk_sessie';
const SESSION_TTL = 12 * 60 * 60; // 12 uur
const MAX_UPLOAD = 10 * 1024 * 1024;
// Pagina's: 'home' is het sjabloon zelf; andere pagina's vervangen het deel tussen
// <!-- inhoud:start --> en <!-- inhoud:eind --> (kop, menu en voet blijven gedeeld).
const PAGES = {
  home: { path: '/', title: null, body: null },
  samenwerken: { path: '/samenwerken', title: 'Samenwerken · Het Groeikwartier', body: PAGE_SAMENWERKEN },
  privacy: { path: '/privacy', title: 'Privacyverklaring · Het Groeikwartier', body: PAGE_PRIVACY },
  afmelden: { path: '/afmelden', title: 'Afmelden · Het Groeikwartier', body: PAGE_AFMELDEN },
};

function pageHTML(name) {
  const p = PAGES[name];
  if (!p?.body) return TEMPLATE;
  const a = TEMPLATE.indexOf('<!-- inhoud:start -->');
  const b = TEMPLATE.indexOf('<!-- inhoud:eind -->');
  return TEMPLATE.slice(0, a) + p.body + TEMPLATE.slice(b);
}

const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Er ging iets mis op de server.' }, 500);
    }
  },
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Altijd naar het hoofddomein zonder www.
  if (url.hostname === 'www.groeikwartier.com') {
    url.hostname = 'groeikwartier.com';
    return Response.redirect(url.toString(), 301);
  }

  if ((path === '/' || path === '/index.html') && method === 'GET') return renderPage(env, url, false);
  if (method === 'GET') {
    const naam = Object.keys(PAGES).find((k) => k !== 'home' && (path === PAGES[k].path || path === PAGES[k].path + '/'));
    if (naam) return renderPage(env, url, false, null, naam);
  }
  // ---- beheer: alles onder /admin is afgeschermd, behalve het inlogscherm zelf ----
  if ((path === '/admin' || path === '/admin/') && method === 'GET') {
    if (await getSession(request, env)) return redirect('/admin/editor');
    return loginPage(env, url);
  }
  if (path === '/api/login' && method === 'POST') return login(request, env, url);
  if (path === '/api/logout' && method === 'POST') return logout(request, env, url);
  if (path.startsWith('/admin/')) {
    const user = await getSession(request, env);
    if (!user) return path.startsWith('/admin/editor') ? redirect('/admin') : new Response('Niet gevonden', { status: 404 });
    if (path === '/admin/editor' && method === 'GET') return renderPage(env, url, true, user, 'home');
    const sub = /^\/admin\/editor\/([a-z-]+)$/.exec(path);
    if (sub && method === 'GET') {
      if (!PAGES[sub[1]] || sub[1] === 'home') return redirect('/admin/editor');
      return renderPage(env, url, true, user, sub[1]);
    }
    const res = await env.ASSETS.fetch(request);
    const r = withSecurity(res, url, true);
    r.headers.set('cache-control', 'private, no-store');
    return r;
  }
  if (path === '/robots.txt') return robots(url);

  if (path.startsWith('/media/') && method === 'GET') return media(env, path.slice(7));

  if (path === '/api/agenda' && method === 'GET') {
    const c = await getContent(env);
    return json(c.agenda ?? DEFAULT_AGENDA, 200, { 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*' });
  }
  if (path === '/api/signup' && method === 'POST') return signup(request, env);
  if (path === '/api/afmelden' && method === 'POST') return unsubscribe(request, env);
  if (path === '/api/samenwerken' && method === 'POST') return samenwerken(request, env);
  if (path === '/api/sync/agenda' && method === 'PUT') return syncAgenda(request, env);

  if (path.startsWith('/api/admin/')) {
    const user = await requireAdmin(request, env, url);
    return adminApi(request, env, path.slice(11), method, user);
  }

  const res = await env.ASSETS.fetch(request);
  if (res.status === 404) return notFound(env, request);
  return withSecurity(res, url);
}

// ---------- pagina ----------

async function getContent(env) {
  return (await env.CONTENT.get(CONTENT_KEY, 'json')) || {};
}

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
}

async function renderPage(env, url, admin, user = null, page = 'home') {
  const c = await getContent(env);
  const texts = c.texts || {};
  const sizes = c.sizes || {};
  const images = c.images || {};
  const links = c.links || {};
  const fonts = c.fonts || {};
  const kop = FONTS_KOP[fonts.kop] ? fonts.kop : STANDAARD_KOP;
  const tekst = FONTS_TEKST[fonts.tekst] ? fonts.tekst : STANDAARD_TEKST;

  let css = `:root{--font-kop:${FONTS_KOP[kop]};--font-tekst:${FONTS_TEKST[tekst]}}` + kleurCSS(c.colors);
  for (const [k, v] of Object.entries(sizes)) {
    const n = Number(v);
    if (/^[a-z0-9-]+$/.test(k) && n >= 0.5 && n <= 3 && n !== 1) css += `[data-k="${k}"]{--fs:${n}}`;
  }
  let head = `<style id="gk-overrides">${css}</style>`;
  if (admin) {
    const cfg = {
      clientId: env.GOOGLE_CLIENT_ID || '',
      user: user ? { email: user.email } : null,
      content: c,
      defaultAgenda: DEFAULT_AGENDA,
      today: today(),
      page,
      pages: Object.entries(PAGES).map(([k, v]) => ({ key: k, path: v.path, title: k === 'home' ? 'Home' : (v.title || k).split(' · ')[0] })),
    };
    head += `<meta name="robots" content="noindex, nofollow"><link rel="stylesheet" href="/admin/editor.css">` +
      `<script>window.GK=${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>` +
      `<script src="https://accounts.google.com/gsi/client" async></script>` +
      `<script type="module" src="/admin/editor.js"></script>`;
  }

  const rewriter = new HTMLRewriter()
    .on('head', { element(el) { el.append(head, { html: true }); } })
    .on('title', { element(el) {
      if (admin) el.setInnerContent('Bewerken · Het Groeikwartier');
      else if (PAGES[page]?.title) el.setInnerContent(PAGES[page].title);
    } })
    .on('[data-jaar]', { element(el) { el.setInnerContent(`© ${new Date().getFullYear()} Het Groeikwartier`); } })
    .on('[data-k]', {
      element(el) {
        const k = el.getAttribute('data-k');
        if (typeof texts[k] === 'string') el.setInnerContent(sanitizeHTML(texts[k]), { html: true });
      },
    })
    .on('[data-img]', {
      element(el) {
        const k = el.getAttribute('data-img');
        const src = safeUrl(images[k], true);
        if (!src) return;
        if (el.tagName === 'img') {
          el.setAttribute('src', src);
        } else {
          el.setAttribute('style', (el.getAttribute('style') || '') + `; background-image: url("${src}"); background-size: cover; background-position: center; color: transparent`);
          el.setInnerContent('');
        }
      },
    })
    .on('a[data-l]', {
      element(el) {
        const k = el.getAttribute('data-l');
        const href = safeUrl(links[k], false);
        if (href) el.setAttribute('href', href);
        const h = el.getAttribute('href') || '';
        if (/^https?:/i.test(h)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
      },
    })
    .on('[data-agenda]', {
      element(el) { el.setInnerContent(agendaHTML(c.agenda ?? DEFAULT_AGENDA, today(), admin), { html: true }); },
    })
    .on('html', { element(el) { if (admin) el.setAttribute('data-admin', ''); } });

  const res = rewriter.transform(new Response(pageHTML(page), { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  const headers = new Headers(res.headers);
  headers.set('cache-control', admin ? 'no-store' : 'public, max-age=0, must-revalidate');
  return withSecurity(new Response(res.body, { status: 200, headers }), url, admin);
}

function withSecurity(res, url, admin = false) {
  const r = new Response(res.body, res);
  r.headers.set('x-content-type-options', 'nosniff');
  r.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  if (admin) {
    r.headers.set('x-frame-options', 'DENY');
    r.headers.set('cross-origin-opener-policy', 'same-origin-allow-popups');
  }
  if (admin || url.hostname.endsWith('.workers.dev')) r.headers.set('x-robots-tag', 'noindex, nofollow');
  return r;
}

function robots(url) {
  const body = url.hostname.endsWith('.workers.dev')
    ? 'User-agent: *\nDisallow: /\n'
    : 'User-agent: *\nDisallow: /admin\nDisallow: /api/\n';
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

async function notFound(env, request) {
  const res = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url)));
  return new Response(res.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function media(env, id) {
  if (!/^[a-z0-9]{8,40}\.(png|jpg|webp|gif|avif)$/.test(id)) return new Response('Niet gevonden', { status: 404 });
  const { value, metadata } = await env.CONTENT.getWithMetadata(MEDIA_PREFIX + id, 'stream');
  if (!value) return new Response('Niet gevonden', { status: 404 });
  return new Response(value, {
    headers: {
      'content-type': metadata?.type || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
}

// ---------- opschonen ----------

const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'a', 'br', 'span', 'u']);

export function sanitizeHTML(html) {
  let s = String(html ?? '').slice(0, 20000);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|iframe|object|embed|template|svg|math)[\s\S]*?<\/\1\s*>/gi, '');
  return tidyBreaks(s.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g, (m, tagName, attrs) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return tag === 'div' || tag === 'p' ? '<br>' : '';
    if (m.startsWith('</')) return tag === 'br' ? '' : `</${tag}>`;
    if (tag === 'br') return '<br>';
    let out = '';
    if (tag === 'a') {
      const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /href\s*=\s*'([^']*)'/i.exec(attrs)?.[1];
      const safe = safeUrl(decodeEntities(href || ''), false);
      if (safe) out += ` href="${esc(safe)}"`;
      if (safe && /^https?:/i.test(safe)) out += ' target="_blank" rel="noopener"';
      const dl = /data-l\s*=\s*"([a-z0-9-]+)"/i.exec(attrs)?.[1];
      if (dl) out += ` data-l="${dl}"`;
    }
    if (tag === 'em' || tag === 'span') {
      const style = /style\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
      const clean = cleanStyle(decodeEntities(style || ''));
      if (clean) out += ` style="${esc(clean)}"`;
    }
    return `<${tag}${out}>`;
  }));
}

// Witregels opschonen: hoogstens één lege regel achter elkaar, geen witregels aan begin of eind,
// en lege opmaak (bijv. <i><br></i>) weg. Eén Enter = nieuwe regel, twee Enters = één lege regel.
export function tidyBreaks(s) {
  for (let i = 0; i < 3; i++) s = s.replace(/<(b|strong|i|em|u|span)(\s[^>]*)?>((?:\s|&nbsp;|<br>)*)<\/\1>/gi, (m, t, a, inner) => (inner.includes('<br>') ? '<br>' : inner));
  s = s.replace(/<br>(?:\s|&nbsp;)+(?=<br>)/gi, '<br>');
  s = s.replace(/(?:\s*<br>\s*){3,}/gi, '<br><br>');
  s = s.replace(/^(?:\s|&nbsp;|<br>)+/i, '').replace(/(?:\s|&nbsp;|<br>)+$/i, '');
  return s;
}

function decodeEntities(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function cleanStyle(style) {
  return style
    .split(';')
    .map((d) => d.trim())
    .filter((d) => /^(font-family|font-size|font-style|font-weight|color)\s*:/i.test(d))
    .filter((d) => !/url\(|expression|javascript:|[<>]/i.test(d))
    .join('; ');
}

function safeUrl(u, imageOnly) {
  if (typeof u !== 'string') return '';
  const s = u.trim();
  if (!s || s.length > 2000) return '';
  if (imageOnly) return /^\/media\/[a-z0-9]{8,40}\.(png|jpg|webp|gif|avif)$/.test(s) || /^\/[a-z0-9-]+\.(png|jpg|webp)$/.test(s) ? s : '';
  if (/^(https?:|mailto:|tel:)/i.test(s) || s.startsWith('#') || (s.startsWith('/') && !s.startsWith('//'))) return s;
  return '';
}

// ---------- inloggen ----------

let certCache = { keys: null, until: 0 };

async function googleKeys() {
  if (certCache.keys && Date.now() < certCache.until) return certCache.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new HttpError(503, 'Google-sleutels niet bereikbaar.');
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  const { keys } = await res.json();
  certCache = { keys, until: Date.now() + Math.min(maxAge, 21600) * 1000 };
  return keys;
}

function b64url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
}

async function verifyGoogleToken(token, env) {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new HttpError(503, 'Google-inloggen is nog niet ingesteld.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Ongeldige login.');
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  } catch { throw new HttpError(401, 'Ongeldige login.'); }
  if (header.alg !== 'RS256') throw new HttpError(401, 'Ongeldige login.');
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) { certCache.until = 0; throw new HttpError(401, 'Login verlopen, log opnieuw in.'); }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new HttpError(401, 'Ongeldige login.');
  const now = Math.floor(Date.now() / 1000);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new HttpError(401, 'Ongeldige login.');
  if (payload.aud !== clientId) throw new HttpError(401, 'Ongeldige login.');
  if (!(payload.exp > now - 30)) throw new HttpError(401, 'Login verlopen, log opnieuw in.');
  if (!payload.email_verified) throw new HttpError(403, 'Dit Google-account is niet bevestigd.');
  return payload;
}

function allowedEmail(email, env) {
  const allowed = String(env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(String(email || '').toLowerCase());
}

function readCookie(request, name) {
  const c = request.headers.get('cookie') || '';
  for (const part of c.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

// Sessie = willekeurige sleutel in een HttpOnly-cookie; de inhoud staat alleen in KV.
async function getSession(request, env) {
  const id = readCookie(request, SESSION_COOKIE);
  if (!/^[a-z0-9]{48}$/.test(id)) return null;
  const s = await env.CONTENT.get(SESSION_PREFIX + id, 'json');
  if (!s || !allowedEmail(s.email, env) || s.exp < Date.now()) return null;
  return { ...s, id };
}

function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return false;
  return request.headers.get('x-gk') === '1';
}

async function login(request, env, url) {
  if (!sameOrigin(request, url)) throw new HttpError(403, 'Ongeldig verzoek.');
  const { credential } = await readJson(request, 10000);
  if (typeof credential !== 'string') throw new HttpError(400, 'Geen login ontvangen.');
  const p = await verifyGoogleToken(credential, env);
  if (!allowedEmail(p.email, env)) throw new HttpError(403, 'Dit Google-account heeft geen toegang. Log in met het account van het Groeikwartier.');
  const id = randomId(48);
  const email = String(p.email).toLowerCase();
  await env.CONTENT.put(SESSION_PREFIX + id, JSON.stringify({ email, name: p.name || email, exp: Date.now() + SESSION_TTL * 1000 }), { expirationTtl: SESSION_TTL });
  return json({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}` });
}

async function logout(request, env, url) {
  if (!sameOrigin(request, url)) throw new HttpError(403, 'Ongeldig verzoek.');
  const id = readCookie(request, SESSION_COOKIE);
  if (/^[a-z0-9]{48}$/.test(id)) await env.CONTENT.delete(SESSION_PREFIX + id);
  return json({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
}

async function requireAdmin(request, env, url) {
  if (request.method !== 'GET' && !sameOrigin(request, url)) throw new HttpError(403, 'Ongeldig verzoek.');
  const s = await getSession(request, env);
  if (!s) throw new HttpError(401, 'Je sessie is verlopen. Log opnieuw in.');
  return { email: s.email, name: s.name };
}

function redirect(to) {
  return new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store' } });
}

function loginPage(env, url) {
  const html = LOGIN_PAGE.replace('__CLIENT_ID__', esc(env.GOOGLE_CLIENT_ID || ''));
  return withSecurity(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }), url, true);
}

// ---------- beheer ----------

async function adminApi(request, env, sub, method, user) {
  if (sub === 'me' && method === 'GET') return json({ email: user.email, name: user.name });

  if (sub === 'content' && method === 'PUT') {
    const body = await readJson(request, 2_000_000);
    const clean = cleanContent(body);
    const prev = await env.CONTENT.get(CONTENT_KEY);
    if (prev) await env.CONTENT.put(HIST_PREFIX + String(Date.now()).padStart(15, '0'), prev, { metadata: JSON.parse(prev).meta || {} });
    clean.meta = { at: new Date().toISOString(), by: user.email };
    await env.CONTENT.put(CONTENT_KEY, JSON.stringify(clean));
    await pruneHistory(env);
    return json({ ok: true, meta: clean.meta });
  }

  if (sub === 'history' && method === 'GET') {
    const list = await env.CONTENT.list({ prefix: HIST_PREFIX });
    const items = list.keys.map((k) => ({ id: k.name.slice(HIST_PREFIX.length), at: k.metadata?.at || null, by: k.metadata?.by || null })).reverse();
    return json(items);
  }

  if (sub === 'restore' && method === 'POST') {
    const { id } = await readJson(request, 1000);
    if (!/^\d{15}$/.test(String(id))) throw new HttpError(400, 'Onbekende versie.');
    const old = await env.CONTENT.get(HIST_PREFIX + id);
    if (!old) throw new HttpError(404, 'Versie niet gevonden.');
    const cur = await env.CONTENT.get(CONTENT_KEY);
    if (cur) await env.CONTENT.put(HIST_PREFIX + String(Date.now()).padStart(15, '0'), cur, { metadata: JSON.parse(cur).meta || {} });
    const c = JSON.parse(old);
    c.meta = { at: new Date().toISOString(), by: user.email, restoredFrom: id };
    await env.CONTENT.put(CONTENT_KEY, JSON.stringify(c));
    await pruneHistory(env);
    return json({ ok: true });
  }

  if (sub === 'upload' && method === 'POST') {
    const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = IMAGE_TYPES[type];
    if (!ext) throw new HttpError(415, 'Alleen PNG, JPG, WebP, GIF of AVIF.');
    const buf = await request.arrayBuffer();
    if (buf.byteLength > MAX_UPLOAD) throw new HttpError(413, 'Afbeelding is groter dan 10 MB.');
    if (!buf.byteLength) throw new HttpError(400, 'Leeg bestand.');
    const id = randomId(20) + '.' + ext;
    await env.CONTENT.put(MEDIA_PREFIX + id, buf, { metadata: { type, by: user.email, at: new Date().toISOString() } });
    return json({ url: '/media/' + id });
  }

  if (sub === 'signups' && method === 'GET') {
    const out = [];
    let cursor;
    do {
      const l = await env.CONTENT.list({ prefix: SIGNUP_PREFIX, cursor });
      for (const k of l.keys) {
        let { email, at, token } = k.metadata || {};
        if (email && !token) {
          // Oudere aanmelding: alsnog een persoonlijke afmeldcode geven.
          token = randomId(32);
          await env.CONTENT.put(k.name, JSON.stringify({ email, at, token, bron: 'website' }), { metadata: { email, at, token } });
          await env.CONTENT.put(UNSUB_PREFIX + token, k.name);
        }
        out.push({ email, at, afmeldlink: token ? `${new URL(request.url).origin}/afmelden?t=${token}` : '' });
      }
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
    return json(out.reverse());
  }

  if (sub === 'signup-verwijderen' && method === 'POST') {
    const { email } = await readJson(request, 500);
    if (typeof email !== 'string' || !email.includes('@')) throw new HttpError(400, 'Onbekend adres.');
    await removeSignup(env, await signupKey(email.trim().toLowerCase()));
    return json({ ok: true });
  }

  if (sub === 'berichten' && method === 'GET') {
    const out = [];
    let cursor;
    do {
      const l = await env.CONTENT.list({ prefix: MSG_PREFIX, cursor });
      for (const k of l.keys) {
        const v = await env.CONTENT.get(k.name, 'json');
        if (v) out.push({ id: k.name.slice(MSG_PREFIX.length), ...v });
      }
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
    return json(out.reverse());
  }

  if (sub === 'bericht-verwijderen' && method === 'POST') {
    const { id } = await readJson(request, 500);
    if (!/^\d{15}-[a-z0-9]{6}$/.test(String(id))) throw new HttpError(400, 'Onbekend bericht.');
    await env.CONTENT.delete(MSG_PREFIX + id);
    return json({ ok: true });
  }

  throw new HttpError(404, 'Onbekende actie.');
}

async function pruneHistory(env) {
  const list = await env.CONTENT.list({ prefix: HIST_PREFIX });
  const extra = list.keys.length - HIST_KEEP;
  for (let i = 0; i < extra; i++) await env.CONTENT.delete(list.keys[i].name);
}

function cleanContent(b) {
  const out = { texts: {}, sizes: {}, images: {}, links: {}, fonts: {}, agenda: [] };
  const key = (k) => typeof k === 'string' && /^[a-z0-9-]{1,40}$/.test(k);
  for (const [k, v] of Object.entries(b?.texts || {})) if (key(k) && typeof v === 'string') out.texts[k] = sanitizeHTML(v);
  for (const [k, v] of Object.entries(b?.sizes || {})) { const n = Math.round(Number(v) * 100) / 100; if (key(k) && n >= 0.5 && n <= 3) out.sizes[k] = n; }
  for (const [k, v] of Object.entries(b?.images || {})) { const s = safeUrl(v, true); if (key(k) && s) out.images[k] = s; }
  for (const [k, v] of Object.entries(b?.links || {})) { const s = safeUrl(v, false); if (key(k) && s) out.links[k] = s; }
  out.colors = {};
  for (const f of KLEURVELDEN) { const v = b?.colors?.[f.key]; if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out.colors[f.key] = v.toUpperCase(); }
  if (FONTS_KOP[b?.fonts?.kop]) out.fonts.kop = b.fonts.kop;
  if (FONTS_TEKST[b?.fonts?.tekst]) out.fonts.tekst = b.fonts.tekst;
  out.agenda = cleanAgenda(b?.agenda);
  return out;
}

function cleanAgenda(list) {
  if (!Array.isArray(list)) return [];
  const str = (v, n) => String(v ?? '').slice(0, n);
  return list.slice(0, 60).map((it, i) => ({
    id: /^[a-z0-9-]{1,40}$/i.test(it?.id) ? it.id : 'a' + i + randomId(4),
    datum: /^\d{4}-\d{2}-\d{2}$/.test(it?.datum) ? it.datum : '',
    groot: str(it?.groot, 20),
    klein: str(it?.klein, 40),
    titel: str(it?.titel, 120),
    tekst: str(it?.tekst, 300),
    kleur: ['donker', 'zand', 'salie'].includes(it?.kleur) ? it.kleur : 'donker',
    ...(it?.bron ? { bron: str(it.bron, 40) } : {}),
  }));
}

// ---------- aanmelden nieuwsbrief ----------

async function signupKey(email) {
  return SIGNUP_PREFIX + (await sha(email)).slice(0, 24);
}

// Aanmelden: e-mailadres + moment van aanmelden (bewijs van toestemming) + persoonlijke afmeldcode.
async function signup(request, env) {
  const body = await readJson(request, 2000);
  if (body.website) return json({ ok: true }); // honeypot
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i.test(email)) throw new HttpError(400, 'Vul een geldig e-mailadres in.');
  const key = await signupKey(email);
  const exists = await env.CONTENT.get(key);
  if (!exists) {
    const token = randomId(32);
    const at = new Date().toISOString();
    await env.CONTENT.put(key, JSON.stringify({ email, at, token, bron: 'website' }), { metadata: { email, at, token } });
    await env.CONTENT.put(UNSUB_PREFIX + token, key);
  }
  return json({ ok: true });
}

async function removeSignup(env, key) {
  const v = await env.CONTENT.get(key, 'json').catch(() => null);
  if (v?.token) await env.CONTENT.delete(UNSUB_PREFIX + v.token);
  await env.CONTENT.delete(key);
}

// Afmelden met persoonlijke link (token) of met e-mailadres. Altijd hetzelfde antwoord,
// zodat niemand kan nagaan of een adres bij ons bekend is.
async function unsubscribe(request, env) {
  const body = await readJson(request, 1000);
  if (typeof body.token === 'string' && /^[a-z0-9]{32}$/.test(body.token)) {
    const key = await env.CONTENT.get(UNSUB_PREFIX + body.token);
    if (key) await removeSignup(env, key);
    return json({ ok: true });
  }
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i.test(email)) throw new HttpError(400, 'Vul een geldig e-mailadres in.');
  await removeSignup(env, await signupKey(email));
  return json({ ok: true });
}

// ---------- samenwerken ----------

async function samenwerken(request, env) {
  const b = await readJson(request, 12000);
  if (b.website) return json({ ok: true }); // honeypot
  const str = (v, n) => String(v ?? '').trim().slice(0, n);
  const msg = {
    naam: str(b.naam, 120), email: str(b.email, 200).toLowerCase(), organisatie: str(b.organisatie, 160),
    telefoon: str(b.telefoon, 40), soort: str(b.soort, 80), bericht: str(b.bericht, 4000), at: new Date().toISOString(),
  };
  if (!msg.naam || !msg.bericht) throw new HttpError(400, 'Vul je naam en je bericht in.');
  if (!/^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i.test(msg.email)) throw new HttpError(400, 'Vul een geldig e-mailadres in.');
  const id = String(Date.now()).padStart(15, '0') + '-' + randomId(6);
  await env.CONTENT.put(MSG_PREFIX + id, JSON.stringify(msg));
  return json({ ok: true });
}

// ---------- toekomstige koppeling (bijv. Google Apps Script) ----------
// PUT /api/sync/agenda met header "x-sync-key: <SYNC_KEY>" en een JSON-lijst met agenda-items.
// Staat uit zolang de geheime SYNC_KEY niet is ingesteld.

async function syncAgenda(request, env) {
  if (!env.SYNC_KEY) throw new HttpError(503, 'Agendakoppeling staat uit.');
  const given = request.headers.get('x-sync-key') || '';
  if (!(await timingSafeEqual(given, env.SYNC_KEY))) throw new HttpError(401, 'Onjuiste sleutel.');
  const list = await readJson(request, 500_000);
  const c = await getContent(env);
  const prev = await env.CONTENT.get(CONTENT_KEY);
  if (prev) await env.CONTENT.put(HIST_PREFIX + String(Date.now()).padStart(15, '0'), prev, { metadata: JSON.parse(prev).meta || {} });
  c.agenda = cleanAgenda(list);
  c.meta = { at: new Date().toISOString(), by: 'agendakoppeling' };
  await env.CONTENT.put(CONTENT_KEY, JSON.stringify(c));
  await pruneHistory(env);
  return json({ ok: true, items: c.agenda.length });
}

// ---------- hulpjes ----------

async function readJson(request, max) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, 'Te veel gegevens.');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Ongeldige gegevens.'); }
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
}

function randomId(n) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => a[x % a.length]).join('');
}

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}

async function timingSafeEqual(a, b) {
  const [x, y] = await Promise.all([sha(a), sha(b)]);
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return r === 0;
}
