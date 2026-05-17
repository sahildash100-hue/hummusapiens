// Tiny dependency-free order store. Persists to server/data/orders.json as a
// map keyed by Razorpay order id. Writes are atomic (temp file + rename) so a
// crash mid-write can't corrupt the file. Fine for a small brand's volume;
// swap for a real DB if order rate grows.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// DATA_DIR lets the host point storage at a persistent disk (e.g. Render).
// Defaults to ./data next to this file for local dev.
const DATA_DIR = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : join(dirname(fileURLToPath(import.meta.url)), "data");
const FILE = join(DATA_DIR, "orders.json");
const TMP = join(DATA_DIR, "orders.tmp.json");

function readAll() {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) || {};
  } catch {
    return {};
  }
}

function writeAll(obj) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(TMP, JSON.stringify(obj, null, 2));
  renameSync(TMP, FILE);
}

export function saveCreatedOrder({
  orderId,
  amount,
  currency,
  items,
  customer,
  status = "created",
}) {
  const all = readAll();
  all[orderId] = {
    orderId,
    amount,
    currency,
    items,
    customer: customer || null,
    status,
    createdAt: new Date().toISOString(),
    paymentId: null,
    paidAt: null,
  };
  writeAll(all);
}

// Returns { ok, firstPaid, order }. firstPaid is true only the first time an
// order transitions to "paid" — callers use it to run side effects (emails,
// stock decrement) exactly once even though both /verify and the webhook
// may confirm the same payment.
export function markPaid(orderId, paymentId) {
  const all = readAll();
  const order = all[orderId];
  if (!order) return { ok: false, firstPaid: false, order: null };
  const firstPaid = order.status !== "paid";
  order.status = "paid";
  order.paymentId = paymentId;
  if (firstPaid) order.paidAt = new Date().toISOString();
  writeAll(all);
  return { ok: true, firstPaid, order };
}

export function listOrders() {
  return Object.values(readAll()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export function deleteOrder(orderId) {
  const all = readAll();
  if (!all[orderId]) return false;
  delete all[orderId];
  writeAll(all);
  return true;
}
