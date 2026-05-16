// Unified async storage. If DATABASE_URL is set, uses Postgres (data
// survives restarts on free hosting). Otherwise falls back to the local
// JSON files in orders.js / stock.js — great for local dev with no setup.
import * as fileOrders from "./orders.js";
import * as fileStock from "./stock.js";
import { SEED } from "./stock.js";

const DATABASE_URL = process.env.DATABASE_URL;
export const storeMode = DATABASE_URL ? "postgres" : "file";

let pool = null;

if (DATABASE_URL) {
  const { default: pg } = await import("pg");
  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // managed providers (Neon) need SSL
    max: 3,
  });
}

function rowToOrder(r) {
  return {
    orderId: r.order_id,
    amount: Number(r.amount),
    currency: r.currency,
    items: r.items,
    customer: r.customer,
    status: r.status,
    paymentId: r.payment_id,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    paidAt:
      r.paid_at instanceof Date ? r.paid_at.toISOString() : r.paid_at,
  };
}

export async function initStore() {
  if (!pool) return; // file mode needs no setup
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id   TEXT PRIMARY KEY,
      amount     BIGINT,
      currency   TEXT,
      items      JSONB,
      customer   JSONB,
      status     TEXT NOT NULL DEFAULT 'created',
      payment_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      paid_at    TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock (
      name TEXT PRIMARY KEY,
      qty  INTEGER NOT NULL
    );
  `);
  for (const [name, qty] of Object.entries(SEED)) {
    await pool.query(
      "INSERT INTO stock (name, qty) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
      [name, qty]
    );
  }
}

export async function saveCreatedOrder(o) {
  if (!pool) return fileOrders.saveCreatedOrder(o);
  await pool.query(
    `INSERT INTO orders (order_id, amount, currency, items, customer, status)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (order_id) DO NOTHING`,
    [
      o.orderId,
      o.amount,
      o.currency,
      JSON.stringify(o.items),
      JSON.stringify(o.customer || null),
      o.status || "created",
    ]
  );
}

// Returns { ok, firstPaid, order }. firstPaid is true only on the first
// transition to "paid" so side effects (email, stock) run exactly once.
export async function markPaid(orderId, paymentId) {
  if (!pool) return fileOrders.markPaid(orderId, paymentId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sel = await client.query(
      "SELECT status FROM orders WHERE order_id=$1 FOR UPDATE",
      [orderId]
    );
    if (sel.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, firstPaid: false, order: null };
    }
    const firstPaid = sel.rows[0].status !== "paid";
    const upd = await client.query(
      `UPDATE orders
         SET status='paid', payment_id=$2, paid_at=COALESCE(paid_at, now())
       WHERE order_id=$1 RETURNING *`,
      [orderId, paymentId]
    );
    await client.query("COMMIT");
    return { ok: true, firstPaid, order: rowToOrder(upd.rows[0]) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function listOrders() {
  if (!pool) return fileOrders.listOrders();
  const { rows } = await pool.query(
    "SELECT * FROM orders ORDER BY created_at DESC"
  );
  return rows.map(rowToOrder);
}

export async function getStock() {
  if (!pool) return fileStock.getStock();
  const { rows } = await pool.query("SELECT name, qty FROM stock");
  const out = {};
  for (const r of rows) out[r.name] = Number(r.qty);
  return out;
}

export async function setStock(partial) {
  if (!pool) return fileStock.setStock(partial);
  for (const [name, qty] of Object.entries(partial || {})) {
    if (name in SEED) {
      const v = Math.max(0, Math.floor(Number(qty) || 0));
      await pool.query(
        `INSERT INTO stock (name, qty) VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET qty=EXCLUDED.qty`,
        [name, v]
      );
    }
  }
  return getStock();
}

export async function decrementStock(items) {
  if (!pool) return fileStock.decrementStock(items);
  for (const it of items || []) {
    await pool.query(
      "UPDATE stock SET qty = GREATEST(0, qty - $2) WHERE name = $1",
      [it.name, Number(it.qty || 0)]
    );
  }
  return getStock();
}
