# Decentralflix Lifeboat — Frontend

Static frontend for the Lifeboat 90-day execution plan. Plain HTML + vanilla JS + `fetch`, no build step, no npm. Served statically by the Lifeboat backend from this directory (`./public`).

## Pages

| File | Purpose |
|---|---|
| `index.html` | Catalog grid from `GET /api/films` |
| `import.html` | Filmmaker import form (`POST /api/films/import`, multipart) |
| `film.html?id=<film_id>` | Watch page: stream, test purchase, receipt verify, download |
| `claim.html` | Vimeo-refugee claim form (`POST /api/claims`) |
| `dashboard.html` | Filmmaker dashboard: approve claims, import buyers, export audience CSV |
| `app.js` | Shared helpers: API base, `esc`, `money`, AB 2426 label rule, fetch wrappers, nav |
| `styles.css` | Dark cinematic theme |

## API contract assumptions (flagged for the backend agent)

1. `POST /api/films/import` — multipart field `master` = video file, field `meta` = **JSON string** (`JSON.parse(req.body.meta)` on the backend). If the backend instead expects a JSON content-type part, this needs a tweak.
2. `POST /api/receipts/verify` — body shape unspecified; frontend sends the **receipt object itself** as the JSON body.
3. `POST /api/claims/:id/approve` — sent with an empty JSON object body `{}`.
4. Film objects are expected to carry `film_id`, `title`, `price_usd_cents`, `download_allowed` (plus `description`, `territories`, `playback_url` on detail).
5. Claim objects: frontend reads `claim_id` (falls back to `id`) and `vimeo_receipt_ref` (falls back to `receipt_ref`).

## AB 2426 label rule

The offer button says **"Buy — yours to keep"** ONLY when `download_allowed` is true; otherwise it says **"License to stream"**. Enforced centrally in `app.js` via `DFL.offerLabel()` and used on every page.

## Config

Same-origin API by default. To point at another host, define before `app.js` loads:

```html
<script>window.DFL_API_BASE = "https://api.example.com";</script>
```
