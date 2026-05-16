# Hummusapiens

Storefront for Hummusapiens artisan hummus — React + Vite frontend, small
Node/Express backend for Razorpay payments, order persistence, stock, and
order-confirmation emails.

---

## Project layout

```
hummusapiens-web/
├── src/
│   ├── App.jsx        # whole storefront UI + cart/checkout logic
│   ├── App.css        # all styles
│   └── index.css      # design tokens (colours, fonts)
├── public/img/        # product photos, logo, mascot
├── server/
│   ├── index.js       # API routes (order, verify, webhook, stock, orders, /admin)
│   ├── orders.js      # order persistence (data/orders.json)
│   ├── stock.js       # inventory persistence (data/stock.json)
│   ├── mailer.js      # order-confirmation emails (nodemailer)
│   ├── adminPage.js   # the /admin HTML page
│   ├── .env.example   # every backend env var, documented
│   └── data/          # created at runtime; orders + stock JSON (gitignored)
├── Dockerfile         # builds the web app, serves via nginx
├── server/Dockerfile  # the API container
├── docker-compose.yml # runs api + web together
└── .env.example       # frontend env (just the API URL)
```

Editable content lives in plain data structures:
- Products / prices / copy: `PRODUCTS` array near the top of `src/App.jsx`
- Server-authoritative prices: `CATALOG` in `server/index.js`
- Initial stock levels: `SEED` in `server/stock.js`

---

## Running locally

**Frontend**

```bash
cd hummusapiens-web
npm install
npm run dev          # http://localhost:5176
```

**Backend**

```bash
cd hummusapiens-web/server
npm install
cp .env.example .env # then fill in values (see below)
npm start            # http://localhost:8787
```

The admin dashboard is at `http://localhost:8787/admin`.

Data in `server/data/*.json` persists across restarts, so orders and stock
are not lost.

---

## Environment variables

Frontend — `hummusapiens-web/.env`:

| Var | Purpose |
|-----|---------|
| `VITE_API_BASE` | URL of the backend API (default `http://localhost:8787`) |

Backend — `hummusapiens-web/server/.env`:

| Var | Purpose |
|-----|---------|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Payments. Use `rzp_test_…` for dev, `rzp_live_…` only on production. |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies the payment webhook (separate from the key secret). |
| `ADMIN_TOKEN` | Enables `/admin` and the orders/stock admin APIs. Use a long random string. |
| `PORT` / `ALLOWED_ORIGIN` | API port and the web origin allowed by CORS. |
| `SMTP_*`, `MAIL_FROM`, `OWNER_EMAIL` | Order-confirmation emails. Optional — skipped if unset. |

Secrets live **only** in `server/.env` (gitignored). Never put the Key
Secret or SMTP password in frontend code.

---

## Security model (already built in)

- The browser holds **no** payment secrets. The backend creates the
  Razorpay order, recomputes the amount from `CATALOG` (so it can't be
  tampered with), and verifies the payment signature.
- A webhook (`POST /api/razorpay/webhook`) confirms payment even if the
  customer closes the tab. Stock decrement and emails fire exactly once
  per order.
- Admin APIs and `/admin` are gated by `ADMIN_TOKEN` (sent as the
  `x-admin-token` header; never in the URL).

---

## Deploying

With Docker:

```bash
cd hummusapiens-web
# put production creds in server/.env first
docker compose up -d --build
# web → http://localhost:8080 , api → http://localhost:8787
```

Set `PUBLIC_API_BASE` (baked into the web build) and `WEB_ORIGIN` to the
real public URLs in production. The `order-data` volume persists orders.

Production checklist: live Razorpay key + secret + webhook secret, a strong
`ADMIN_TOKEN`, and SMTP creds if you want emails.

---

## Adding features later

Nothing is locked or generated — it's a standard codebase. Common changes:

- **New flavour / price change** → edit `PRODUCTS` in `src/App.jsx`,
  `CATALOG` in `server/index.js`, and `SEED` in `server/stock.js`.
- **New page / section** → add markup in `src/App.jsx`, styles in `App.css`.
- **New API endpoint** → add a route in `server/index.js` (use the
  `adminOnly` middleware if it should be protected).

Just describe the feature you want and it can be built on top of the
current structure — env config, admin gating, and the idempotent payment
guards are already in place.
