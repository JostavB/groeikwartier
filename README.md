# Het Groeikwartier

Website van het Groeikwartier, met een eigen editor op `/admin`.

## Hoe het werkt

- `src/template.html` is het ontwerp. Elk bewerkbaar stuk tekst heeft een `data-k`, elke afbeelding een `data-img`, elke link een `data-l`.
- `src/index.js` (Cloudflare Worker) bouwt bij elk bezoek de pagina op: sjabloon plus de inhoud uit KV (`groeikwartier-content`).
- `/admin/editor` toont dezelfde pagina met de editor erbovenop (`public/admin/`). Teksten, tekstgrootte, lettertypen, afbeeldingen en de agenda zijn daar aan te passen. **Publiceren** zet het meteen live; elke vorige versie wordt bewaard (laatste 30) en kan worden teruggezet.
- `/admin` is alleen een inlogscherm (`src/login.html`). Na inloggen met Google controleert de server het token en de lijst `ADMIN_EMAILS` (in `wrangler.jsonc`) en zet een sessiecookie (HttpOnly, 12 uur, sessie in KV). Pas dan levert de server `/admin/editor` en de editorbestanden uit; zonder sessie krijg je ze niet te zien.
- Aanmeldingen voor de nieuwsbrief worden niet op de site bewaard. `/api/signup` stuurt ze rechtstreeks naar MailerLite (dubbele opt-in), `/api/unsubscribe` meldt af. Alleen een versleutelde afkorting van het IP-adres staat een uur in KV, voor een limiet van 5 pogingen per uur.
- Vereist: variabele `MAILERLITE_GROUP_ID` (in `wrangler.jsonc`) en geheim `MAILERLITE_API_KEY` (Cloudflare: Workers & Pages, de Worker, Settings, Variables and secrets). `keep_vars` staat aan, zodat het geheim bij een nieuwe uitrol blijft staan. In MailerLite moet "Double opt-in for API and integrations" aan staan. Het token moet uit het account komen waarin de groep staat.
- Extra pagina's staan in `src/pages/` (nu: `samenwerken.html` op `/samenwerken`). Ze delen menu en voet met de homepage (alles buiten `<!-- inhoud:start -->` … `<!-- inhoud:eind -->` in het sjabloon). In de editor kies je de pagina linksboven. Formulierberichten staan onder **Berichten**.
- Pagina's: `/samenwerken`, `/privacy` (privacyverklaring) en `/disclaimer`. Afmelden voor de nieuwsbrief kan via het inklapbare veld onderaan elke pagina (`/afmelden` verwijst daarheen). `/sitemap.xml` volgt de lijst met pagina's.
- Lettertypen staan op de eigen server (`public/fonts/`, via Fontsource, SIL OFL); er gaan geen verzoeken naar Google Fonts.
- Witregels worden bij opslaan en tonen opgeschoond: hoogstens één lege regel achter elkaar; lege tekstblokken worden niet getoond.

## Agenda koppelen (later)

- `GET /api/agenda` geeft de agenda als JSON.
- `PUT /api/sync/agenda` vervangt de agenda met een JSON-lijst, bijvoorbeeld vanuit Google Apps Script (agenda of spreadsheet). Header: `x-sync-key: <SYNC_KEY>`. Dit staat uit totdat er een geheim `SYNC_KEY` op de Worker is ingesteld.
- Velden per item: `datum` (JJJJ-MM-DD, optioneel), `groot`, `klein`, `titel`, `tekst`, `kleur` (`donker`, `zand`, `salie`).

## Ontwikkelen

```
npm install
npx wrangler dev
```

Elke push naar `main` wordt door Cloudflare automatisch gepubliceerd.
