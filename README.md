# Het Groeikwartier

Website van het Groeikwartier (groeikwartier.com).

- `public/` bevat de site: `index.html` plus afbeeldingen.
- `wrangler.jsonc` vertelt Cloudflare hoe de site wordt gepubliceerd.
- Elke wijziging op `main` wordt door Cloudflare automatisch op de testworker `groeikwartier-test` gezet.

Status: testfase. De pagina staat op `noindex` (zie `public/_headers` en `public/robots.txt`) en is nog niet gekoppeld aan groeikwartier.com.
