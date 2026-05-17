import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import Razorpay from "razorpay";
import {
  initStore,
  storeMode,
  saveCreatedOrder,
  markPaid,
  listOrders,
  deleteOrder,
  getStock,
  setStock,
  decrementStock,
} from "./store.js";
import { sendOrderEmails, sendContactEmail } from "./mailer.js";
import { ADMIN_HTML } from "./adminPage.js";

// Runs the one-time side effects when an order first becomes paid.
async function onFirstPaid(order) {
  try {
    await decrementStock(order.items);
  } catch (e) {
    console.error("stock decrement failed:", e?.message || e);
  }
  // Fire-and-forget; never blocks the HTTP response.
  sendOrderEmails(order).catch(() => {});
}

const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  PORT = 8787,
  ALLOWED_ORIGIN = "http://localhost:5176",
  ADMIN_TOKEN,
  RAZORPAY_WEBHOOK_SECRET,
} = process.env;

const keysReady = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
const mode = RAZORPAY_KEY_ID?.startsWith("rzp_live_")
  ? "live"
  : RAZORPAY_KEY_ID?.startsWith("rzp_test_")
    ? "test"
    : "unset";

// Authoritative prices (₹). The client cannot change these — the order
// amount is always recomputed here from the product name + quantity.
const CATALOG = {
  "The O.G": 259,
  "The Beetrooter": 279,
  "Paprika Twist": 299,
  "Caramelised Kick": 299,
  "Jalapeño Punch": 319,
  "Dark Choco Muse": 329,
};

const razorpay = keysReady
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));

// Webhook MUST see the raw body to verify the signature, so it is registered
// before express.json() and uses the raw body parser.
app.post(
  "/api/razorpay/webhook",
  express.raw({ type: "*/*" }),
  async (req, res) => {
    if (!RAZORPAY_WEBHOOK_SECRET) {
      return res.status(503).json({ error: "Webhook not configured." });
    }
    const sig = req.get("x-razorpay-signature") || "";
    const expected = crypto
      .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
      .update(req.body) // Buffer
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(String(sig));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(400).json({ error: "Bad signature." });
    }

    let evt;
    try {
      evt = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Bad payload." });
    }

    // Backstop: confirm the order even if the browser handler never ran
    // (tab closed, network dropped after payment, etc.). Idempotent.
    const pay = evt?.payload?.payment?.entity;
    const ord = evt?.payload?.order?.entity;
    const orderId = pay?.order_id || ord?.id;
    const paymentId = pay?.id || null;
    if (
      (evt?.event === "payment.captured" || evt?.event === "order.paid") &&
      orderId
    ) {
      try {
        const { firstPaid, order } = await markPaid(orderId, paymentId);
        if (firstPaid && order) await onFirstPaid(order);
      } catch (e) {
        console.error("webhook markPaid failed:", e?.message || e);
      }
    }
    // Always 2xx so Razorpay doesn't retry indefinitely.
    res.json({ received: true });
  }
);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, keysReady, mode, store: storeMode });
});

app.get("/admin", (_req, res) => {
  res.type("html").send(ADMIN_HTML);
});

// Preorder / lead capture — no payment. Records intent + contact so we
// can gauge demand before turning on real payments.
// Contact form. Stored so nothing is ever lost (visible in /admin), and
// emailed to the brand inbox if SMTP is configured. No mail client, no
// double step for the visitor.
app.post("/api/contact", async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim().slice(0, 80);
  const email = String(b.email || "").trim().slice(0, 120);
  const message = String(b.message || "").trim().slice(0, 2000);
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || message.length < 2) {
    return res
      .status(400)
      .json({ error: "Please enter your name, a valid email and a message." });
  }
  try {
    await saveCreatedOrder({
      orderId: `msg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      amount: 0,
      currency: "INR",
      items: [],
      customer: { name, email, phone: "", message },
      status: "message",
    });
  } catch (e) {
    console.error("contact save failed:", e?.message || e);
    return res.status(500).json({ error: "Could not send. Try again." });
  }
  // Message is safely stored — respond immediately. Email is best-effort
  // in the background so a slow/blocked SMTP never stalls the request.
  res.json({ ok: true });
  sendContactEmail({ name, email, message }).catch((e) =>
    console.error("contact email error:", e?.message || e)
  );
});

app.post("/api/preorder", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ error: "Please add at least one item." });
  }
  const c = req.body?.customer || {};
  const customer = {
    name: String(c.name || "").trim().slice(0, 80),
    email: String(c.email || "").trim().slice(0, 120),
    phone: String(c.phone || "").trim().slice(0, 20),
  };
  if (!customer.name || !/^\S+@\S+\.\S+$/.test(customer.email)) {
    return res
      .status(400)
      .json({ error: "Please provide your name and a valid email." });
  }
  let amount = 0; // rupees — intended value, for reporting only
  for (const it of items) {
    const price = CATALOG[it?.name];
    const qty = Number(it?.qty);
    if (price === undefined) {
      return res.status(400).json({ error: `Unknown item: ${it?.name}` });
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      return res.status(400).json({ error: `Invalid quantity for ${it?.name}` });
    }
    amount += price * qty;
  }
  const id = `pre_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  try {
    await saveCreatedOrder({
      orderId: id,
      amount: amount * 100, // paise, for consistent reporting with orders
      currency: "INR",
      items: items.map((i) => ({ name: i.name, qty: i.qty })),
      customer,
      status: "preorder",
    });
    res.json({ ok: true, id });
  } catch (e) {
    console.error("preorder save failed:", e?.message || e);
    res.status(500).json({ error: "Could not record preorder. Try again." });
  }
});

app.post("/api/razorpay/order", async (req, res) => {
  if (!razorpay) {
    return res
      .status(503)
      .json({ error: "Payment not configured. Set Razorpay keys in server/.env." });
  }

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ error: "Cart is empty." });
  }

  const c = req.body?.customer || {};
  const customer = {
    name: String(c.name || "").trim().slice(0, 80),
    email: String(c.email || "").trim().slice(0, 120),
    phone: String(c.phone || "").trim().slice(0, 20),
  };
  if (!customer.name || !/^\S+@\S+\.\S+$/.test(customer.email)) {
    return res
      .status(400)
      .json({ error: "Please provide your name and a valid email." });
  }

  const stock = await getStock();
  let amount = 0; // rupees
  for (const it of items) {
    const price = CATALOG[it?.name];
    const qty = Number(it?.qty);
    if (price === undefined) {
      return res.status(400).json({ error: `Unknown item: ${it?.name}` });
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      return res.status(400).json({ error: `Invalid quantity for ${it?.name}` });
    }
    const have = stock[it.name] ?? 0;
    if (qty > have) {
      return res.status(409).json({
        error:
          have === 0
            ? `${it.name} is sold out.`
            : `Only ${have} of ${it.name} left.`,
      });
    }
    amount += price * qty;
  }

  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: {
        items: items.map((i) => `${i.qty}x ${i.name}`).join(", "),
      },
    });
    await saveCreatedOrder({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      items: items.map((i) => ({ name: i.name, qty: i.qty })),
      customer,
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID, // public Key ID — safe for the browser
    });
  } catch (err) {
    console.error("order create failed:", err?.message || err);
    res.status(502).json({ error: "Could not create payment order." });
  }
});

app.post("/api/razorpay/verify", async (req, res) => {
  if (!RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: "Payment not configured." });
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment fields." });
  }

  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(String(razorpay_signature));
  const verified = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!verified) {
    return res.status(400).json({ verified: false });
  }
  // Payment is cryptographically confirmed — record it as paid.
  try {
    const { firstPaid, order } = await markPaid(
      razorpay_order_id,
      razorpay_payment_id
    );
    if (firstPaid && order) await onFirstPaid(order);
  } catch (e) {
    console.error("verify markPaid failed:", e?.message || e);
  }
  res.json({ verified: true });
});

// Admin gate. Disabled unless ADMIN_TOKEN is set; caller must send the same
// value in the "x-admin-token" header.
function adminOnly(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(403).json({ error: "Admin API disabled (set ADMIN_TOKEN)." });
  }
  if (req.get("x-admin-token") !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  next();
}

app.delete("/api/orders/:id", adminOnly, async (req, res) => {
  try {
    const ok = await deleteOrder(req.params.id);
    res.json({ ok });
  } catch (e) {
    console.error("deleteOrder failed:", e?.message || e);
    res.status(500).json({ error: "Could not delete order." });
  }
});

app.get("/api/orders", adminOnly, async (_req, res) => {
  try {
    res.json({ orders: await listOrders() });
  } catch (e) {
    console.error("listOrders failed:", e?.message || e);
    res.status(500).json({ error: "Could not load orders." });
  }
});

app.get("/api/orders.csv", adminOnly, async (_req, res) => {
  try {
    const orders = await listOrders();
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = [
      "Order ID", "Status", "Created", "Name", "Email", "Phone",
      "Items", "Amount (Rs)",
    ];
    const lines = orders.map((o) =>
      [
        o.orderId,
        o.status,
        o.createdAt,
        o.customer?.name,
        o.customer?.email,
        o.customer?.phone,
        (o.items || []).map((i) => `${i.qty}x ${i.name}`).join("; "),
        Math.round(Number(o.amount || 0) / 100),
      ].map(q).join(",")
    );
    const csv = [head.map(q).join(","), ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="hummusapiens-preorders.csv"`
    );
    res.send("﻿" + csv); // BOM so Excel reads UTF-8 correctly
  } catch (e) {
    console.error("orders.csv failed:", e?.message || e);
    res.status(500).json({ error: "Could not export." });
  }
});

// Public: lets the storefront show stock levels / sold-out state.
// Filtered to the current catalog so retired products (still rows in the
// DB from an earlier seed) don't appear on the site or in admin.
app.get("/api/stock", async (_req, res) => {
  try {
    const all = await getStock();
    const stock = Object.fromEntries(
      Object.entries(all).filter(([name]) => name in CATALOG)
    );
    res.json({ stock });
  } catch (e) {
    console.error("getStock failed:", e?.message || e);
    res.status(500).json({ error: "Could not load stock." });
  }
});

// Admin: set absolute stock counts. Body: { stock: { "The O.G": 12, ... } }.
app.post("/api/stock", adminOnly, async (req, res) => {
  const next = req.body?.stock;
  if (!next || typeof next !== "object") {
    return res.status(400).json({ error: "Body must be { stock: {...} }." });
  }
  res.json({ stock: await setStock(next) });
});

initStore()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `Hummusapiens API on http://localhost:${PORT}  (keys: ${
          keysReady ? mode : "MISSING"
        }, store: ${storeMode})`
      );
    });
  })
  .catch((e) => {
    console.error("Store init failed — cannot start:", e?.message || e);
    process.exit(1);
  });
