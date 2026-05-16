# Deploying Hummusapiens to Render

Goal: live on a temporary Render URL first (e.g.
`https://hummusapiens-web.onrender.com`), with **real** Razorpay payments.
Move to the `hummusapiens.in` domain only after you've tested.

---

## ⚠️ Read first

- **Real payments from day one.** Razorpay live mode has no test cards —
  every checkout is real money. You will do one real purchase to verify,
  then refund it from the Razorpay dashboard.
- **Cost.** The API needs a persistent disk (so orders/stock survive
  restarts). That requires Render's **Starter** instance (~$7/month). The
  static frontend is **free**.
- **Content check before launch.** Two products (Lemon-Garlic Tahini Dip,
  Spicy Harissa Hummus) use a placeholder image; testimonial quotes are
  sample copy; prices were taken from the reference site. Review
  `PRODUCTS` in `src/App.jsx` and confirm everything is accurate — this is
  a real store taking real orders.

---

## 1. Put the code on GitHub

The repo is already initialised locally with a first commit. Create an
empty repo on GitHub (e.g. `hummusapiens`), then from `hummusapiens-web/`:

```bash
git remote add origin https://github.com/<you>/hummusapiens.git
git branch -M main
git push -u origin main
```

(Secrets are gitignored — `.env`, `server/.env`, and `server/data` are
never pushed.)

## 2. Create the services on Render

1. Render dashboard → **New → Blueprint** → connect the GitHub repo.
   Render reads `render.yaml` and proposes two services:
   - `hummusapiens-api` (Node, Starter, 1 GB disk)
   - `hummusapiens-web` (static site, free)
2. Apply. The first build will start. The **API** will be healthy at
   `/api/health`; the **web** build will succeed but can't talk to the API
   yet — that's expected until step 3.

## 3. Wire the two services together + add secrets

In the Render dashboard, set these environment variables (you'll be
prompted for the `sync:false` ones):

**On `hummusapiens-api`:**

| Var | Value |
|-----|-------|
| `ALLOWED_ORIGIN` | the web service URL, e.g. `https://hummusapiens-web.onrender.com` |
| `RAZORPAY_KEY_ID` | your **live** `rzp_live_…` key id |
| `RAZORPAY_KEY_SECRET` | your live key secret |
| `RAZORPAY_WEBHOOK_SECRET` | a strong random string (you'll reuse it in step 4) |
| `ADMIN_TOKEN` | a long random string (for `/admin`) |
| `SMTP_*`, `MAIL_FROM`, `OWNER_EMAIL` | optional — set to enable emails |

`DATA_DIR=/var/data` is already set by the blueprint (the disk).

**On `hummusapiens-web`:**

| Var | Value |
|-----|-------|
| `VITE_API_BASE` | the API service URL, e.g. `https://hummusapiens-api.onrender.com` |

Then **Manual Deploy → Clear build cache & deploy** the **web** service
(so `VITE_API_BASE` is baked into the build), and redeploy the API if it
didn't pick up the new vars.

## 4. Add the Razorpay webhook

Razorpay Dashboard → **Settings → Webhooks → Add**:

- URL: `https://<your-api>.onrender.com/api/razorpay/webhook`
- Secret: the **same** value you used for `RAZORPAY_WEBHOOK_SECRET`
- Active events: `payment.captured` (and optionally `order.paid`)

This is the backstop that confirms an order even if the buyer closes the
tab after paying.

## 5. Go-live verification (do this immediately)

1. Open the web URL. Add an item, fill name/email, **Pay** — use your own
   real card/UPI (smallest item is ₹259).
2. Confirm: success screen → check `https://<api>/admin` (enter
   `ADMIN_TOKEN`): the order shows **paid**, stock decremented, and (if
   SMTP set) the confirmation email arrived.
3. **Refund that test payment** from the Razorpay dashboard so you're not
   out the money.
4. Check the webhook delivery shows `2xx` in the Razorpay dashboard.

If all four pass, you're live and taking orders.

## 6. Day-to-day

- Admin / stock / orders: `https://<your-api>.onrender.com/admin`
- Manage inventory from the Stock panel there.
- Logs & redeploys: Render dashboard per service.

## 7. Later: the real domain

When ready to use `hummusapiens.in` (this replaces the current site):

- Render → `hummusapiens-web` → **Settings → Custom Domains** → add
  `hummusapiens.in` (and `www`). Render shows the DNS records.
- At your domain registrar, point the records as instructed; Render issues
  SSL automatically.
- Update `ALLOWED_ORIGIN` (API) and `VITE_API_BASE` (web) if you also move
  the API to a custom subdomain, then redeploy the web service.
