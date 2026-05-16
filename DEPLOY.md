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

### A2. Wire the services + add test secrets

After both deploy, note the two URLs (e.g.
`https://hummusapiens-api.onrender.com`,
`https://hummusapiens-web.onrender.com`). Then in Render:

**`hummusapiens-api` → Environment:**

| Var | Value |
|-----|-------|
| `ALLOWED_ORIGIN` | the **web** URL |
| `RAZORPAY_KEY_ID` | your **test** `rzp_test_…` id |
| `RAZORPAY_KEY_SECRET` | your **test** key secret |
| `RAZORPAY_WEBHOOK_SECRET` | any strong random string (reused in A3) |
| `ADMIN_TOKEN` | a long random string |
| `SMTP_*`, `MAIL_FROM`, `OWNER_EMAIL` | optional (emails) |

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

No real money moves in test mode. Note: free API sleeps after ~15 min
idle and **resets orders/stock on restart** — expected for a test.

---

## Phase B — real launch (when ready)

1. **Content check:** two products (Lemon-Garlic Tahini Dip, Spicy
   Harissa Hummus) use a placeholder image and testimonial quotes are
   sample copy — review `PRODUCTS` in `src/App.jsx` first.
2. In `render.yaml` change the API to a persistent, paid instance:
   ```yaml
   plan: starter            # ~$7/mo, was: free
   disk:
     name: hummusapiens-data
     mountPath: /var/data
     sizeGB: 1
   envVars:
     - key: DATA_DIR
       value: /var/data     # add this so data lives on the disk
   ```
   Commit + push; Render redeploys.
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
