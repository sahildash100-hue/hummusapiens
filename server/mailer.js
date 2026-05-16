// Order-confirmation email. Best-effort: if SMTP env is missing the send is
// skipped (logged) and never blocks or breaks the payment flow.
import nodemailer from "nodemailer";

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  OWNER_EMAIL,
} = process.env;

export const mailerReady = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

function rupees(paise) {
  return `₹${(Number(paise || 0) / 100).toFixed(0)}`;
}

// Pure builder — exported so it can be unit-tested without sending.
export function buildOrderEmails(order) {
  const lines = (order.items || [])
    .map((i) => `  ${i.qty} × ${i.name}`)
    .join("\n");
  const total = rupees(order.amount);
  const name = order.customer?.name || "there";

  const customer = {
    to: order.customer?.email,
    subject: `Your Hummusapiens order is confirmed (${order.orderId})`,
    text:
      `Hi ${name},\n\n` +
      `Thanks for your order! We've received your payment.\n\n` +
      `Order: ${order.orderId}\n${lines}\n\nTotal paid: ${total}\n\n` +
      `We'll be in touch on WhatsApp with delivery details.\n\n` +
      `— Team Hummusapiens`,
  };

  const owner = {
    to: OWNER_EMAIL,
    subject: `New paid order ${order.orderId} — ${total}`,
    text:
      `New paid order.\n\n` +
      `Order: ${order.orderId}\nPayment: ${order.paymentId}\n` +
      `Customer: ${order.customer?.name || "-"} | ${order.customer?.email || "-"} | ${order.customer?.phone || "-"}\n\n` +
      `${lines}\n\nTotal: ${total}`,
  };

  return { customer, owner };
}

let transporter = null;
function getTransport() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_SECURE) === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function sendOrderEmails(order) {
  if (!mailerReady) {
    console.log(`[mail] skipped (SMTP not configured) for ${order.orderId}`);
    return;
  }
  const { customer, owner } = buildOrderEmails(order);
  const from = MAIL_FROM || SMTP_USER;
  const jobs = [];
  if (customer.to) jobs.push({ from, ...customer });
  if (owner.to) jobs.push({ from, ...owner });
  for (const msg of jobs) {
    try {
      await getTransport().sendMail(msg);
      console.log(`[mail] sent "${msg.subject}" to ${msg.to}`);
    } catch (err) {
      console.error(`[mail] failed for ${msg.to}:`, err?.message || err);
    }
  }
}
