# Deploying Hummusapiens to Render

Two phases:
- **Phase A — free test (now):** full working site on free Render URLs,
  $0, Razorpay **test** keys. Verify everything end to end.
- **Phase B — real launch (later):** paid persistent disk + Razorpay
  **live** keys + the real domain.

The code is already on GitHub:
`https://github.com/sahildash100-hue/hummusapiens` (branch `main`).
`render.yaml` is currently set to the **free** plan for Phase A.

---

## Phase A — free test

### A1. Create the services

1. https://dashboard.render.com → sign in **with GitHub**.
2. **New + → Blueprint** → pick `sahildash100-hue/hummusapiens`
   (approve Render's GitHub app for the repo if asked).
3. Render reads `render.yaml` and proposes two **free** services:
   - `hummusapiens-api` (Node)
   - `hummusapiens-web` (static site)
4. It will prompt for the `sync:false` env vars — **leave them blank**,
   click **Apply**. (We set them next, once the URLs exist.)

### A1b. Free database (so orders/stock survive restarts)

Render's free instance has no persistent disk — without a database,
orders and stock reset on every restart/redeploy. A free Postgres fixes
this:

1. Sign up at **https://neon.tech** (free tier) → create a project.
2. Copy the **connection string** (looks like
   `postgresql://user:pass@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require`).
3. You'll paste it as the `DATABASE_URL` env var in A2.

(Supabase works too — use its "Connection string → URI". If you skip
this, the site still runs but loses data on restart.)

### A2. Wire the services + add test secrets

After both deploy, note the two URLs (e.g.
`https://hummusapiens-api.onrender.com`,
`https://hummusapiens-web.onrender.com`). Then in Render:

**`hummusapiens-api` → Environment:**

| Var | Value |
|-----|-------|
| `DATABASE_URL` | the Neon connection string from A1b |
| `ALLOWED_ORIGIN` | the **web** URL |
| `RAZORPAY_KEY_ID` | your **test** `rzp_test_…` id |
| `RAZORPAY_KEY_SECRET` | your **test** key secret |
| `RAZORPAY_WEBHOOK_SECRET` | any strong random string (reused in A3) |
| `ADMIN_TOKEN` | a long random string |
| `SMTP_*`, `MAIL_FROM`, `OWNER_EMAIL` | optional (emails) |

The API logs `store: postgres` on boot when `DATABASE_URL` is set
(`store: file` otherwise). `/api/health` also reports it.

**`hummusapiens-web` → Environment:**

| Var | Value |
|-----|-------|
| `VITE_API_BASE` | the **API** URL |

Then **Manual Deploy → Clear build cache & deploy** the **web** service
(so `VITE_API_BASE` bakes into the build).

### A3. Razorpay webhook (test mode)

Razorpay Dashboard (Test mode) → **Settings → Webhooks → Add**:
- URL: `https://<api>.onrender.com/api/razorpay/webhook`
- Secret: same value as `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.captured` (and optionally `order.paid`)

### A4. Test the whole flow

1. Open the web URL (first hit may take ~50s — free API waking up).
2. Add an item → fill name/email → **Pay** → use a Razorpay
   [test card](https://razorpay.com/docs/payments/payments/test-card-details/)
   (e.g. card `4111 1111 1111 1111`, any future expiry/CVV).
3. Check `https://<api>.onrender.com/admin` (enter `ADMIN_TOKEN`):
   the order shows **paid** and stock dropped.
4. Webhook delivery shows `2xx` in the Razorpay dashboard.

No real money moves in test mode. With `DATABASE_URL` set, orders/stock
now **survive restarts** (stored in Neon, not on the disk).

### A5. Keep-alive (reduce cold starts)

The free API still sleeps after ~15 min idle (first visitor then waits
~50s). To keep it warm, set up a free uptime ping:

1. https://cron-job.org (or UptimeRobot) → create a free account.
2. New cron job → URL `https://<api>.onrender.com/api/health` → every
   **10 minutes**.

This greatly reduces cold starts. Note Render's free plan has a monthly
hour cap (~750h ≈ one always-on service) — fine for one API, but it's
why a real launch (Phase B) moves to the paid instance.

---

## Phase B — real launch (when ready)

1. **Content check:** two products (Lemon-Garlic Tahini Dip, Spicy
   Harissa Hummus) use a placeholder image and testimonial quotes are
   sample copy — review `PRODUCTS` in `src/App.jsx` first.
2. Persistence is already handled by the `DATABASE_URL` Postgres, so no
   disk is needed. For a real launch the main reason to leave free is
   cold starts — upgrade the API for always-on by changing one line in
   `render.yaml`:
   ```yaml
   plan: starter            # ~$7/mo, was: free  (no disk needed — DB persists)
   ```
   Commit + push; Render redeploys. (Optional — a kept-alive free
   instance can work, but Starter removes cold starts and the monthly
   hour cap, which matters once you run ads.)
3. Swap the API env vars to **live** Razorpay creds (`rzp_live_…` + live
   secret), and add a **live-mode** webhook in the Razorpay dashboard
   pointing at the same `/api/razorpay/webhook` URL.
4. **Go-live check:** one real ₹259 purchase with your own card/UPI →
   confirm paid in `/admin` + stock dropped + webhook `2xx` → then
   **refund it** from the Razorpay dashboard.
5. **Custom domain:** Render → `hummusapiens-web` → Settings → Custom
   Domains → add `hummusapiens.in` (+ `www`); set the shown DNS records
   at your registrar (this replaces the current site); Render issues SSL.
   Update `ALLOWED_ORIGIN` / `VITE_API_BASE` if the API also moves to a
   custom subdomain, then redeploy the web service.

---

## Day-to-day

- Admin / stock / orders: `https://<api>.onrender.com/admin`
- Logs & manual redeploys: Render dashboard, per service.
- Push to `main` → Render auto-deploys both services.
