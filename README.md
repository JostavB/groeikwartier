# Het Groeikwartier

Website van het Groeikwartier, met een eigen editor op `/admin`.

## Hoe het werkt

- `src/template.html` is het ontwerp. Elk bewerkbaar stuk tekst heeft een `data-k`, elke afbeelding een `data-img`, elke link een `data-l`.
- `src/index.js` (Cloudflare Worker) bouwt bij elk bezoek de pagina op: sjabloon plus de inhoud uit KV (`groeikwartier-content`).
- `/admin` toont dezelfde pagina met de editor erbovenop (`public/admin/`). Teksten, tekstgrootte, lettertypen, afbeeldingen en de agenda zijn daar aan te passen. **Publiceren** zet het meteen live; elke vorige versie wordt bewaard (laatste 30) en kan worden teruggezet.
- `/admin` is alleen een inlogscherm (`src/login.html`). Na inloggen met Google controleert de server het token en de lijst `ADMIN_EMAILS` (in `wrangler.jsonc`) en zet een sessiecookie (HttpOnly, 12 uur, sessie in KV). Pas dan levert de server `/admin/editor` en de editorbestanden uit; zonder sessie krijg je ze niet te zien.
- Aanmeldingen voor de nieuwsbrief komen in KV en staan in de editor onder **Aanmeldingen**.

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
