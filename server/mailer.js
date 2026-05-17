// Email delivery. Render's free tier blocks outbound SMTP, so we send via
// an HTTP API (Brevo) when BREVO_API_KEY is set — that works on Render.
// Falls back to SMTP (nodemailer) only if no Brevo key. Best-effort: if
// neither is configured, sends are skipped and logged (never throws into
// the request path; callers fire-and-forget).
import nodemailer from "nodemailer";

const BREVO_API_KEY = (process.env.BREVO_API_KEY || "").trim();
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  OWNER_EMAIL,
} = process.env;

const smtpReady = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
const brevoReady = Boolean(BREVO_API_KEY);
export const mailerReady = brevoReady || smtpReady;

function sender() {
  // Parse MAIL_FROM ("Name <email>") or fall back to a sensible default.
  const raw = MAIL_FROM || OWNER_EMAIL || SMTP_USER || "";
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || "Hummusapiens", email: m[2].trim() };
  return { name: "Hummusapiens", email: raw.trim() };
}

function rupees(paise) {
  return `₹${(Number(paise || 0) / 100).toFixed(0)}`;
}

// ---- transports ----
let _tx = null;
function smtp() {
  if (_tx) return _tx;
  _tx = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_SECURE) === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return _tx;
}

async function brevoSend({ to, subject, text, replyTo }) {
  const from = sender();
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: from,
      to: [{ email: to }],
      replyTo: replyTo ? { email: replyTo } : undefined,
      subject,
      textContent: text,
    }),
  });
  if (r.status === 201 || r.status === 200) return;
  const body = await r.text();
  throw new Error(`Brevo HTTP ${r.status}: ${body.slice(0, 300)}`);
}

// Single delivery primitive. Returns true if accepted by the provider.
async function deliver(msg) {
  if (brevoReady) {
    await brevoSend(msg);
    return true;
  }
  if (smtpReady) {
    await smtp().sendMail({
      from: MAIL_FROM || SMTP_USER,
      to: msg.to,
      replyTo: msg.replyTo,
      subject: msg.subject,
      text: msg.text,
    });
    return true;
  }
  console.log(`[mail] skipped (no provider configured): "${msg.subject}"`);
  return false;
}

// ---- public API ----
export function buildOrderEmails(order) {
  const lines = (order.items || [])
    .map((i) => `  ${i.qty} × ${i.name}`)
    .join("\n");
  const total = rupees(order.amount);
  const name = order.customer?.name || "there";
  return {
    customer: order.customer?.email && {
      to: order.customer.email,
      subject: `Your Hummusapiens order is confirmed (${order.orderId})`,
      text: `Hi ${name},\n\nThanks for your order! We've received your payment.\n\nOrder: ${order.orderId}\n${lines}\n\nTotal paid: ${total}\n\n— Team Hummusapiens`,
    },
    owner: OWNER_EMAIL && {
      to: OWNER_EMAIL,
      subject: `New paid order ${order.orderId} — ${total}`,
      text: `New paid order.\n\nOrder: ${order.orderId}\nPayment: ${order.paymentId}\nCustomer: ${order.customer?.name || "-"} | ${order.customer?.email || "-"} | ${order.customer?.phone || "-"}\n\n${lines}\n\nTotal: ${total}`,
    },
  };
}

export async function sendOrderEmails(order) {
  if (!mailerReady) {
    console.log(`[mail] skipped (no provider) for ${order.orderId}`);
    return;
  }
  const { customer, owner } = buildOrderEmails(order);
  for (const msg of [customer, owner]) {
    if (!msg) continue;
    try {
      await deliver(msg);
      console.log(`[mail] sent "${msg.subject}" to ${msg.to}`);
    } catch (e) {
      console.error(`[mail] failed for ${msg.to}:`, e?.message || e);
    }
  }
}

export async function sendContactEmail({ name, email, message }) {
  if (!mailerReady || !OWNER_EMAIL) {
    console.log("[mail] contact skipped (no provider / OWNER_EMAIL)");
    return false;
  }
  try {
    await deliver({
      to: OWNER_EMAIL,
      replyTo: email,
      subject: `Website contact from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    });
    console.log(`[mail] contact message from ${email} delivered`);
    return true;
  } catch (e) {
    console.error("[mail] contact send failed:", e?.message || e);
    return false;
  }
}

// Admin diagnostic — shows which provider is active and the real result.
export async function diagnoseMailer() {
  const provider = brevoReady ? "brevo" : smtpReady ? "smtp" : "none";
  const out = {
    provider,
    owner: OWNER_EMAIL || null,
    from: sender(),
    keyInfo: BREVO_API_KEY
      ? { len: BREVO_API_KEY.length, prefix: BREVO_API_KEY.slice(0, 8) }
      : null,
  };
  if (provider === "none") {
    out.hint = "Set BREVO_API_KEY (recommended) or SMTP_* on the API service.";
    return out;
  }
  if (!OWNER_EMAIL) {
    out.error = "OWNER_EMAIL not set — nowhere to deliver.";
    return out;
  }
  try {
    await deliver({
      to: OWNER_EMAIL,
      subject: "Hummusapiens — email diagnostic ✅",
      text: "If you received this, email delivery is working.",
    });
    out.send = { ok: true, to: OWNER_EMAIL };
  } catch (e) {
    out.send = { ok: false, error: e?.message || String(e) };
  }
  return out;
}
